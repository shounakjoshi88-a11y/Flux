import { streamText, stepCountIs } from 'ai';
import { nim } from '../services/models/nim-client';
import { sandboxManager } from '../sandbox/sandboxManager';
import { createHeadlessFluxTools } from './tools/headless';

export interface SubagentTask {
  id: string;
  buildId: string;
  instructions: string;
}

export interface SubagentResult {
  id: string;
  sandboxId: string;
  filesWritten: string[];
  summary: string;
  success: boolean;
  error?: string;
}

const DEFAULT_SUBAGENT_MODEL = process.env.SUBAGENT_MODEL || 'deepseek-ai/deepseek-v4-pro';

export async function runSubagent(
  task: SubagentTask,
  onStatus: (event: string, data: any) => void,
): Promise<SubagentResult> {
  const sandboxId = `${task.buildId}-subagent-${task.id}`;

  const state = {
    sources: [],
    generatedFiles: [],
    thoughtProcess: [],
    searchCount: 0,
    wikiSearchCount: 0,
    searchContent: '',
    weatherDone: false,
  };

  const model = nim.chatModel(DEFAULT_SUBAGENT_MODEL);

  const tools = createHeadlessFluxTools(
    (event, data) => onStatus(event, { ...data, subagentId: task.id }),
    model,
    state as any,
    task.instructions,
    sandboxId,
  );

  try {
    const result = streamText({
      model,
      messages: [
        {
          role: 'system',
          content: `You are the "${task.id}" subagent. Write ALL files under /home/user/${task.id}/. Do NOT create files outside this directory. ${task.instructions}`,
        },
        { role: 'user', content: task.instructions },
      ],
      tools,
      stopWhen: stepCountIs(15),
      maxOutputTokens: 4096,
      temperature: 0.3,
    } as any);

    for await (const _ of (result as any).fullStream) {
    }

    const filesWritten = await sandboxManager.listFiles(sandboxId, `/home/user/${task.id}`);
    return {
      id: task.id,
      sandboxId,
      filesWritten,
      summary: state.thoughtProcess.join('\n'),
      success: true,
    };
  } catch (e: any) {
    return {
      id: task.id,
      sandboxId,
      filesWritten: [],
      summary: '',
      success: false,
      error: e?.message || String(e),
    };
  }
}
