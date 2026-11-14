/**
 * Standard AI SDK endpoint (assistant-ui compatible).
 *
 * Uses streamText + toDataStreamResponse() so the output is in the standard
 * AI SDK data-stream format that assistant-ui's Thread component expects.
 * Same models and tools as /flux_ask but without the custom SSE events.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { aiLimiter } from '../middleware/rate-limit';
import { sanitizeLocation } from '../../http/util/sanitize';
import { routeModel, selectModel, getProviderOptions } from '../../agents/model-router';
import { createFluxTools } from '../../agents/tools/factory';
import { withToolTimeout } from '../../agents/tools/timeout';
import { SYSTEM_PROMPT } from '../../prompts/prompt';
import { AGENT_SYSTEM_EXTENSION } from '../../prompts/agent-extension';
import { retrieveMemories, buildMemoryContext } from '../../services/memory/memory';
import { nim } from '../../services/models/nim-client';
import { streamText, stepCountIs } from 'ai';
import type { AgentState } from '../../agents/tools/state';
export function createChatSdkRouter(): Router {
    const router = Router();
    router.post('/api/chat-sdk', middleware, aiLimiter, async (req: any, res: any) => {
    try {
        const uid = req.appUserId!;
        const { query, model: pref, location } = req.body as { query?: string; model?: string; location?: string; };
        if (!query?.trim()) return res.status(400).json({ error: 'Query is required' });
        const nq = query.trim().slice(0, 10_000);
        const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
        const locInfo = sanitizeLocation(location ?? '');
        const { modelId: routedModel } = routeModel(pref, nq);
        const model = selectModel(routedModel);

        // Noop res so tool execute functions can run without side effects
        const noopRes: any = {
            writableEnded: false,
            write: () => true,
            end: () => { },
            flush: () => { },
            on: () => { },
        };
        const agentState: AgentState = { sources: [], generatedFiles: [], thoughtProcess: [], searchCount: 0, wikiSearchCount: 0 };
        const tools = await createFluxTools(noopRes, model, agentState, nq, '');
        withToolTimeout(tools, {
            web_search: 30_000,
            generate_document: 60_000,
            get_weather: 10_000,
            generate_image: 90_000,
            wiki_search: 10_000,
            read_url: 10_000,
            run_bash: 60_000,
            run_python: 60_000,
            shell_execute: 30_000,
            create_project: 30_000,
            start_app: 30_000,
            stop_app: 10_000,
            get_app_logs: 10_000,
            file_read: 10_000,
            file_write: 10_000,
            gmail_search: 30_000,
            gmail_read: 30_000,
            gmail_send: 30_000,
            gmail_list_threads: 30_000,
            calendar_list_events: 30_000,
            calendar_create_event: 30_000,
            drive_search_files: 30_000,
            drive_read_file: 30_000,
            drive_list_folder: 30_000,
        });

        const memEnabled = req.authUser?.user_metadata?.enable_memory ?? true;
        const memCtx = memEnabled
            ? await retrieveMemories(uid, nq).then(buildMemoryContext).catch((e) => {
                console.warn('[MEMORY-SDK] retrieveMemories failed:', (e as any)?.message ?? e);
                return '';
              })
            : '';
        const dynSys = [
            SYSTEM_PROMPT.replaceAll('{{CURRENT_DATETIME}}', nowStr).replaceAll('{{LOCATION_INFO}}', locInfo).replaceAll('{{MEMORY_CONTEXT}}', memCtx),
            AGENT_SYSTEM_EXTENSION,
        ].join('\n\n');

        const memPrefix = memCtx ? `\n\n[MEMORY: Known facts about this user from past conversations]
${memCtx}
---\n\n` : '';
        const messages: any[] = [{ role: 'user', content: `${memPrefix}${nq}` }];

        const result = streamText({
            model,
            system: dynSys,
            messages,
            tools,
            stopWhen: stepCountIs(10),
            toolChoice: 'auto',
            temperature: 0.35,
            maxOutputTokens: 4096,
            providerOptions: getProviderOptions(pref),
        } as any);

        // Stream the standard AI SDK data-stream response
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const response = result.toTextStreamResponse();
        const reader = response.body!.getReader();

        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { if (!res.writableEnded) res.end(); break; }
                    res.write(value);
                }
            } catch (e: any) {
                console.error('[SDK] Stream error:', e?.message);
                if (!res.writableEnded) res.end();
            }
        };
        pump();
    } catch (err: any) {
        console.error('[SDK] Error:', err?.message ?? err);
        if (!res.writableEnded) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err?.message || 'Internal error' }));
        }
    }
});
    return router;
}

