import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import * as crypto from 'crypto';
import { prisma } from './db/prisma';
import { nim } from './nim-client';
import { codeExecutor } from './tools/codeExecutor';

const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_RETRIES_PER_STEP = 2;

type SSEWriter = {
  writeStatus(subtype: string, message: string, data?: any): void;
  writeText(text: string): void;
  writeEvent(event: string, data: any): void;
  readonly writableEnded: boolean;
};

const TASK_PLANNER_SYSTEM = `You are a task planner. Break the given goal into a numbered list of implementation steps.
Each step must produce a concrete, verifiable output (a file, a running service, a test result).
Steps run sequentially on a persistent Linux sandbox with Node.js, Python, and common tools.
Rules:
- 3-15 steps maximum
- Each step has a clear title and description
- Step format: {"title":"...", "description":"..."}
- Respond ONLY with a JSON array of steps, nothing else`;

const STEP_SYSTEM = `You are a software engineer in a persistent Linux sandbox. You have access to:
- run_bash: execute bash commands (npm, pip, git, etc.)
- run_python: execute Python code
- write_file: write content to a file
- read_file: read a file's content
- list_files: list directory contents
- edit_file: surgical string replacement in a file

Complete the current step. You are part of a multi-step build process — only build what this step asks for.
Previous steps have already been completed and their files exist in the sandbox.`;

export async function planTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, goal: true, maxSteps: true },
  });
  if (!task) throw new Error(`Task ${taskId} not found`);

  await prisma.task.update({ where: { id: taskId }, data: { status: 'PLANNING' } });

  let steps: { title: string; description: string }[];
  try {
    const model = nim.chatModel('moonshotai/kimi-k2.6');
    const res = await generateText({
      model,
      system: TASK_PLANNER_SYSTEM,
      prompt: `Goal: ${task.goal}`,
      maxTokens: 4096,
    } as any);
    try {
      const cleaned = res.text
        .replace(/```(?:json)?\s*/gi, '')
        .trim();
      steps = JSON.parse(cleaned);
      if (!Array.isArray(steps)) throw new Error('Not an array');
    } catch {
      steps = res.text.split('\n')
        .filter((l: string) => /^\d+[\.\)]/.test(l.trim()))
        .map((l: string, i: number) => ({ title: l.trim().replace(/^\d+[\.\)]\s*/, '').slice(0, 120), description: l.trim() }));
    }
  } catch {
    steps = [{ title: 'Build the project', description: task.goal }];
  }

  if (steps.length === 0) steps = [{ title: 'Build the project', description: task.goal }];
  if (steps.length > task.maxSteps) steps = steps.slice(0, task.maxSteps);

  await prisma.taskStep.createMany({
    data: steps.map((s, i) => ({
      taskId,
      index: i,
      title: s.title,
      status: 'PENDING' as const,
      dependsOn: i > 0 ? [i - 1] : [],
    })),
  });

  await prisma.task.update({ where: { id: taskId }, data: { status: 'PENDING' } });
}

function nextEligibleStep(steps: { index: number; status: string; dependsOn: number[] }[]) {
  const doneIdx = new Set(steps.filter(s => s.status === 'DONE').map(s => s.index));
  return steps.find(s =>
    s.status === 'PENDING' &&
    s.dependsOn.every(d => doneIdx.has(d))
  ) ?? null;
}

async function snapshotSandboxFiles(conversationId: string): Promise<Record<string, string>> {
  try {
    const files = await codeExecutor.listFiles(conversationId);
    const snapshot: Record<string, string> = {};
    for (const f of files) {
      if (/node_modules|\.git|dist|build|__pycache__|\.next/i.test(f)) continue;
      try {
        const content = await codeExecutor.readFile(conversationId, f);
        snapshot[f] = crypto.createHash('sha1').update(content).digest('hex');
      } catch {}
    }
    return snapshot;
  } catch {
    return {};
  }
}

async function executeStep(
  taskId: string,
  stepIdx: number,
  conversationId: string,
  writer?: SSEWriter,
  cancelRef?: { cancelled: boolean },
): Promise<'done' | 'failed'> {
  const step = await prisma.taskStep.findUnique({
    where: { taskId_index: { taskId, index: stepIdx } },
    select: { id: true, title: true },
  });
  if (!step) return 'failed';

  await prisma.taskStep.update({ where: { id: step.id }, data: { status: 'RUNNING', startedAt: new Date() } });
  writer?.writeStatus(`step_${stepIdx}_start`, `Step ${stepIdx + 1}: ${step.title}`, { stepIndex: stepIdx, title: step.title });
  writer?.writeEvent('task_step_started', { taskId, stepIndex: stepIdx, title: step.title });

  const previousSteps = await prisma.taskStep.findMany({
    where: { taskId, status: 'DONE' },
    orderBy: { index: 'asc' },
    select: { index: true, title: true, result: true },
  });
  const contextSummary = previousSteps.map(s => `Step ${s.index + 1} (${s.title}): ${s.result || 'completed'}`).join('\n');

  const model = nim.chatModel('moonshotai/kimi-k2.6');

  const sandboxTools = {
    run_bash: (tool as any)({
      description: 'Execute a bash command in the sandbox',
      parameters: z.object({ command: z.string() }),
      execute: async ({ command }: { command: string }) => {
        writer?.writeEvent('task_step_progress', { taskId, stepIndex: stepIdx, toolCall: { name: 'run_bash', args: { command } } });
        const res = await codeExecutor.runBash(conversationId, command);
        return `exit code: ${res.exitCode}\nstdout: ${res.stdout.join('\n')}\nstderr: ${res.stderr.join('\n')}`;
      },
    }),
    run_python: (tool as any)({
      description: 'Execute Python code in the sandbox',
      parameters: z.object({ code: z.string() }),
      execute: async ({ code }: { code: string }) => {
        writer?.writeEvent('task_step_progress', { taskId, stepIndex: stepIdx, toolCall: { name: 'run_python', args: { code: code.slice(0, 200) } } });
        const res = await codeExecutor.runPython(conversationId, code);
        return `exit code: ${res.exitCode}\nstdout: ${res.stdout.join('\n')}\nstderr: ${res.stderr.join('\n')}${res.error ? `\nerror: ${res.error}` : ''}`;
      },
    }),
    write_file: (tool as any)({
      description: 'Write content to a file in the sandbox',
      parameters: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        await codeExecutor.writeFile(conversationId, path, content);
        writer?.writeEvent('task_step_progress', { taskId, stepIndex: stepIdx, toolCall: { name: 'write_file', args: { path } } });
        return `File written: ${path} (${content.length} bytes)`;
      },
    }),
    read_file: (tool as any)({
      description: 'Read a file from the sandbox',
      parameters: z.object({ path: z.string() }),
      execute: async ({ path }: { path: string }) => {
        return await codeExecutor.readFile(conversationId, path);
      },
    }),
    list_files: (tool as any)({
      description: 'List files in a directory',
      parameters: z.object({ path: z.string().optional().default('/home/user') }),
      execute: async ({ path }: { path: string }) => {
        const files = await codeExecutor.listFiles(conversationId, path);
        return files.join('\n');
      },
    }),
    edit_file: (tool as any)({
      description: 'Edit a file via string replacement',
      parameters: z.object({ path: z.string(), oldStr: z.string(), newStr: z.string() }),
      execute: async ({ path, oldStr, newStr }: { path: string; oldStr: string; newStr: string }) => {
        const r = await codeExecutor.editFile(conversationId, path, oldStr, newStr);
        if (r.success) return `File edited: ${path}`;
        return `Failed: ${r.error}`;
      },
    }),
  };

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES_PER_STEP; attempt++) {
    if (cancelRef?.cancelled) {
      await prisma.taskStep.update({ where: { id: step.id }, data: { status: 'FAILED' } });
      return 'failed';
    }

    try {
      const fileBefore = await snapshotSandboxFiles(conversationId);
      const accumulatedToolCalls: any[] = [];

      const result = await streamText({
        model,
        system: STEP_SYSTEM,
        prompt: `Context from previous steps:\n${contextSummary || '(no previous steps)'}\n\nCurrent step to execute:\n${step.title} — ${step.title}`,
        tools: sandboxTools,
        toolChoice: 'auto',
        maxTokens: 4096,
        temperature: 0.3,
      } as any);

      for await (const chunk of result.fullStream) {
        if (cancelRef?.cancelled) break;
        const ev = chunk as any;
        if (ev.type === 'tool-call') {
          accumulatedToolCalls.push({ name: ev.toolName, args: ev.args, result: null });
        } else if (ev.type === 'tool-result') {
          const tc = accumulatedToolCalls.find(t => t.name === ev.toolName);
          if (tc) tc.result = ev.output ?? ev.result;
        }
      }

      const fileAfter = await snapshotSandboxFiles(conversationId);
      const created = Object.keys(fileAfter).filter(p => !(p in fileBefore));
      const modified = Object.keys(fileAfter).filter(p => p in fileBefore && fileBefore[p] !== fileAfter[p]);

      const finalText = await result.text;
      const stepResult = (finalText || '').slice(0, 500) || 'Step completed';

      await prisma.taskStep.update({
        where: { id: step.id },
        data: {
          status: 'DONE',
          result: stepResult,
          toolCalls: accumulatedToolCalls,
          filesChanged: { created, modified },
          completedAt: new Date(),
        },
      });

      writer?.writeStatus(`step_${stepIdx}_done`, `Step ${stepIdx + 1}: ${step.title}`, { stepIndex: stepIdx, result: stepResult, filesChanged: { created, modified } });
      writer?.writeEvent('task_step_completed', { taskId, stepIndex: stepIdx, result: stepResult, filesChanged: { created, modified } });

      return 'done';
    } catch (e: any) {
      lastError = e.message;
      console.warn(`[TASK] Step ${stepIdx} attempt ${attempt + 1} failed:`, e.message);
      if (attempt < MAX_RETRIES_PER_STEP) {
        await prisma.taskStep.update({ where: { id: step.id }, data: { retryCount: { increment: 1 } } });
      }
    }
  }

  await prisma.taskStep.update({ where: { id: step.id }, data: { status: 'FAILED', result: lastError } });
  writer?.writeStatus(`step_${stepIdx}_error`, `Step ${stepIdx + 1} failed: ${lastError}`, { stepIndex: stepIdx, error: lastError });
  writer?.writeEvent('task_step_failed', { taskId, stepIndex: stepIdx, error: lastError, willRetry: false });
  return 'failed';
}

async function updateTaskStatus(taskId: string, status: string, writer?: SSEWriter) {
  await prisma.task.update({ where: { id: taskId }, data: { status: status as any } });
  const evt = `task_${status.toLowerCase()}`;
  writer?.writeEvent(evt, { taskId });
}

export async function runTaskLoop(
  taskId: string,
  writer?: SSEWriter,
  cancelRef?: { cancelled: boolean },
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, conversationId: true, maxDurationSecs: true },
  });
  if (!task) throw new Error(`Task ${taskId} not found`);

  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'RUNNING', startedAt: new Date(), lastHeartbeatAt: new Date() },
  });

  writer?.writeEvent('task_created', { taskId, title: task.title });

  const heartbeat = setInterval(async () => {
    try {
      await prisma.task.update({ where: { id: taskId }, data: { lastHeartbeatAt: new Date() } });
    } catch {}
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const steps = await prisma.taskStep.findMany({
      where: { taskId },
      orderBy: { index: 'asc' },
      select: { index: true, status: true, dependsOn: true },
    });
    if (steps.length === 0) {
      await planTask(taskId);
    }

    const allSteps = await prisma.taskStep.findMany({
      where: { taskId },
      orderBy: { index: 'asc' },
      select: { index: true, status: true, dependsOn: true },
    });
    const startTime = Date.now();
    const maxDurationMs = task.maxDurationSecs * 1000;

    while (true) {
      if (cancelRef?.cancelled) {
        await updateTaskStatus(taskId, 'CANCELLED', writer);
        return;
      }

      if (Date.now() - startTime > maxDurationMs) {
        await updateTaskStatus(taskId, 'TIMED_OUT', writer);
        return;
      }

      const currentSteps = await prisma.taskStep.findMany({
        where: { taskId },
        orderBy: { index: 'asc' },
        select: { index: true, status: true, dependsOn: true, title: true },
      });
      const eligible = nextEligibleStep(currentSteps);

      if (!eligible) {
        const allDone = currentSteps.every(s => s.status === 'DONE' || s.status === 'SKIPPED');
        const anyFailed = currentSteps.some(s => s.status === 'FAILED');
        if (allDone) {
          await updateTaskStatus(taskId, 'COMPLETED', writer);
          writer?.writeText(`\n\n✅ Task "${task.title}" completed successfully.`);
          writer?.writeEvent('task_completed', { taskId, summary: `Completed ${currentSteps.filter(s => s.status === 'DONE').length} steps` });
        } else if (anyFailed) {
          const failedSteps = currentSteps.filter(s => s.status === 'FAILED');
          await updateTaskStatus(taskId, 'FAILED', writer);
          writer?.writeEvent('task_failed', { taskId, reason: `${failedSteps.length} step(s) failed: ${failedSteps.map(s => s.title).join(', ')}` });
        }
        return;
      }

      const result = await executeStep(taskId, eligible.index, task.conversationId, writer, cancelRef);
      if (result === 'failed') {
        const remainingSteps = currentSteps.filter(s => s.status === 'PENDING' || s.status === 'BLOCKED');
        if (remainingSteps.every(s => s.dependsOn.includes(eligible.index))) {
          await updateTaskStatus(taskId, 'FAILED', writer);
          writer?.writeEvent('task_failed', { taskId, reason: `Step ${eligible.index + 1} failed and blocks remaining work` });
          return;
        }
      }
    }
  } catch (e: any) {
    console.error('[TASK] Loop error:', e.message);
    await prisma.task.update({ where: { id: taskId }, data: { status: 'INTERRUPTED' } });
    writer?.writeEvent('task_failed', { taskId, reason: e.message });
  } finally {
    clearInterval(heartbeat);
  }
}

export async function recoverInterruptedTasks(): Promise<void> {
  const stale = await prisma.task.findMany({
    where: {
      status: { in: ['RUNNING', 'PLANNING'] },
      lastHeartbeatAt: { lt: new Date(Date.now() - HEARTBEAT_INTERVAL_MS * 3) },
    },
    select: { id: true, title: true },
  });

  for (const task of stale) {
    console.log(`[TASK] Recovering interrupted task ${task.id}: ${task.title}`);
    await prisma.taskStep.updateMany({
      where: { taskId: task.id, status: 'RUNNING' },
      data: { status: 'PENDING' },
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'PENDING', lastHeartbeatAt: new Date() },
    });
    console.log(`[TASK] Task ${task.id} reset to PENDING for recovery`);
  }
}
