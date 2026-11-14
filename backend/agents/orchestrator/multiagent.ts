import * as crypto from 'crypto';
import { generateText } from 'ai';
import { nim } from '../../services/models/nim-client';
import { sandboxManager } from '../../sandbox/sandboxManager';
import { runSubagent } from '../subagent';
import type { SubagentTask, SubagentResult } from '../subagent';

const MAX_SUBAGENTS = 3;
const MAX_ITERATIONS = 2;
const MAX_CONCURRENT_SANDBOXES = 3;

const PLANNER_MODEL = process.env.PLANNER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';

export interface BuildRequest {
  buildId: string;
  projectDescription: string;
}

async function planSubtasks(projectDescription: string): Promise<SubagentTask[]> {
  const buildId = crypto.randomUUID();
  const { text } = await generateText({
    model: nim.chatModel(PLANNER_MODEL),
    prompt: `Break this project into at most ${MAX_SUBAGENTS} independent subtasks (e.g. backend, frontend, tests). Each subtask should be a separate, self-contained piece that can be built in its own sandbox without depending on files from other subtasks. Respond ONLY with valid JSON array: [{"id": "backend", "instructions": "..."}, ...].\n\nProject: ${projectDescription}`,
    maxTokens: 2048,
    temperature: 0.2,
  } as any);

  let cleaned = text
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = [];
      }
    } else {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [{ id: 'default', buildId, instructions: projectDescription }];
  }

  return parsed.slice(0, MAX_SUBAGENTS).map((t: any) => ({ ...t, buildId }));
}

async function integrateSubagentResults(
  buildId: string,
  results: SubagentResult[],
  onStatus: (event: string, data: any) => void,
): Promise<{ success: boolean; output: string }> {
  const integrationId = `${buildId}-integration`;

  for (const result of results) {
    if (!result.success) continue;
    for (const filePath of result.filesWritten) {
      try {
        const content = await sandboxManager.downloadFile(result.sandboxId, filePath);
        const relativePath = filePath.replace('/home/user/', '');
        await sandboxManager.uploadFile(integrationId, relativePath, content);
      } catch (e: any) {
        onStatus('integration_warning', { file: filePath, error: e?.message });
      }
    }
  }

  const sandbox = await sandboxManager.getOrCreate(integrationId);
  onStatus('integration_status', { message: 'Installing dependencies' });
  const install = await sandbox.commands.run('npm install', { cwd: '/home/user', timeoutMs: 120_000 }).catch((e: any) => ({ exitCode: 1, stdout: '', stderr: e.message }));
  if (install.exitCode !== 0) {
    return { success: false, output: `Install failed: ${install.stderr}` };
  }
  onStatus('integration_status', { message: 'Running build' });
  const build = await sandbox.commands.run('npm run build', { cwd: '/home/user', timeoutMs: 60_000 }).catch((e: any) => ({ exitCode: 1, stdout: '', stderr: e.message }));

  return { success: build.exitCode === 0, output: build.stdout + build.stderr };
}

export async function runMultiAgentBuild(
  request: BuildRequest,
  onStatus: (event: string, data: any) => void,
): Promise<{ success: boolean; buildId: string; finalOutput: string }> {
  let iteration = 0;
  let lastError = '';

  while (iteration < MAX_ITERATIONS) {
    const tasks = await planSubtasks(
      iteration === 0
        ? request.projectDescription
        : `${request.projectDescription}\n\nPrevious attempt failed with: ${lastError}\nFix the issue.`,
    );

    onStatus('plan_ready', { tasks: tasks.map(t => ({ id: t.id, instructions: t.instructions })) });

    const results = await Promise.all(
      tasks.map(t => runSubagent(t, onStatus)),
    );

    const anyFailed = results.some(r => !r.success);
    if (anyFailed) {
      lastError = results.filter(r => !r.success).map(r => `${r.id}: ${r.error}`).join('; ');
      onStatus('subagent_failure', { errors: lastError });
      iteration++;
      continue;
    }

    const integration = await integrateSubagentResults(request.buildId, results, onStatus);
    if (integration.success) {
      onStatus('build_complete', { buildId: request.buildId });
      return { success: true, buildId: request.buildId, finalOutput: integration.output };
    }

    lastError = integration.output;
    onStatus('integration_failure', { output: integration.output });
    iteration++;
  }

  return { success: false, buildId: request.buildId, finalOutput: `Build failed after ${MAX_ITERATIONS} iterations. Last error: ${lastError}` };
}
