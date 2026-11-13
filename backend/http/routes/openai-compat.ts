/**
 * OpenAI-compatible chat completions endpoint.
 *
 * Used by the opencode connector: it streams standard AI SDK data-stream
 * chunks and supports the build_project_with_subagents tool on top of the
 * normal model tools.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { middleware } from '../middleware/auth';
import { openAICompatAuth } from '../../openai-auth';
import { nim } from '../../nim-client';
import { NIM_MODELS, getProviderOptions } from '../../agents/model-router';
import { createFluxTools } from '../../agents/tools/factory';
import { withToolTimeout } from '../../agents/tools/timeout';
import { mapModelId, toOpenAIChunk, fromOpenAITools, sseLine, BUILD_PROJECT_TOOL } from '../../openai-compat';
import { runMultiAgentBuild } from '../../orchestrator-multiagent';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import * as crypto from 'crypto';
export function createOpenAICompatRouter(): Router {
    const router = Router();
    const openAICompatLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 30,
        message: { error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } },
        keyGenerator: (req: any) => req.headers.authorization || 'anonymous',
    });

router.post('/v1/chat/completions', openAICompatLimiter, openAICompatAuth, async (req: any, res: any) => {
    const { model, messages, stream = true, temperature, tools: openAiTools } = req.body;

    let mappedModel!: string;
    try {
        mappedModel = mapModelId(model, NIM_MODELS);
    } catch (e: any) {
        return res.status(400).json({ error: { message: e.message, type: 'invalid_request_error' } });
    }

    const completionId = `chatcmpl-${crypto.randomUUID()}`;
    const selectedModel = nim.chatModel(NIM_MODELS[mappedModel]!);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const mergedTools = {
            ...(openAiTools ? fromOpenAITools(openAiTools) : {}),
            build_project_with_subagents: (tool as any)({
                description: BUILD_PROJECT_TOOL.function.description,
                inputSchema: z.object({ projectDescription: z.string() }),
                execute: async ({ projectDescription }: { projectDescription: string }) => {
                    const buildId = crypto.randomUUID();
                    const statusMessages: string[] = [];
                    const onStatus = (event: string, data: any) => {
                        const line = `[${data?.subagentId || 'orchestrator'}] ${event}: ${JSON.stringify(data)}`;
                        statusMessages.push(line);
                        if (!res.writableEnded) {
                            res.write(sseLine(toOpenAIChunk({
                                completionId, model: mappedModel,
                                delta: { content: `\n${line}` },
                            })));
                        }
                    };
                    const result = await runMultiAgentBuild({ buildId, projectDescription }, onStatus);
                    return {
                        success: result.success,
                        buildId: result.buildId,
                        summary: result.finalOutput,
                        note: 'Project built in a live sandbox.',
                    };
                },
            }),
        };

        const result = streamText({
            model: selectedModel,
            messages,
            temperature: temperature ?? 0.7,
            tools: Object.keys(mergedTools).length > 0 ? mergedTools : undefined,
            providerOptions: getProviderOptions(mappedModel),
        } as any);

        for await (const part of (result as any).fullStream) {
            if (res.writableEnded) break;
            if (part.type === 'text-delta') {
                res.write(sseLine(toOpenAIChunk({
                    completionId, model: mappedModel,
                    delta: { content: part.textDelta },
                })));
            } else if (part.type === 'tool-call') {
                res.write(sseLine(toOpenAIChunk({
                    completionId, model: mappedModel,
                    delta: {
                        tool_calls: [{
                            index: 0,
                            id: part.toolCallId,
                            type: 'function',
                            function: { name: part.toolName, arguments: JSON.stringify(part.args) },
                        }],
                    },
                })));
            } else if (part.type === 'finish') {
                res.write(sseLine(toOpenAIChunk({
                    completionId, model: mappedModel,
                    delta: {},
                    finishReason: part.toolCalls?.length ? 'tool_calls' : 'stop',
                })));
            } else if (part.type === 'error') {
                res.write(sseLine({ error: { message: part.error || 'Stream error', type: 'server_error' } }));
            }
        }
        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (e: any) {
        console.error('[v1/chat/completions] error:', e?.message);
        if (res.headersSent) {
            if (!res.writableEnded) {
                res.write(sseLine({ error: { message: e?.message || 'Internal error', type: 'server_error' } }));
                res.end();
            }
        } else {
            res.status(500).json({ error: { message: e?.message || 'Internal error', type: 'server_error' } });
        }
    }
});

    return router;
}

