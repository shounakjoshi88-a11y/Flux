/**
 * Image generation tool.
 *
 * The prompt is expanded by the model first, then sent to the local image
 * service. The generated file is pushed to the client as an SSE `file` event
 * and recorded in the request state so it can be attached to the reply.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { enhanceImagePrompt, IMAGE_SERVICE_URL } from '../../services/images';
import type { ToolContext } from './context';

export function createImageTools(ctx: ToolContext) {
    const { writer, state, model } = ctx;

    return {
        generate_image: (tool as any)({
            description:
                'Generate an AI image, illustration, photo, or artwork. ' +
                'Use when user asks to create, draw, or generate an image. ' +
                'Do NOT use this tool for charts, graphs, or diagrams (which should be rendered inline using CHART or MERMAID tags).',
            inputSchema: z.object({
                prompt: z.string().describe('Description of the image to generate'),
            }),
            execute: async ({ prompt }: any) => {
                writer.status('image_enhancing', 'Enhancing image prompt with AI...', undefined, state.thoughtProcess);
                const enhanced = await enhanceImagePrompt(prompt, model);
                writer.status('image_enhancing_success', 'Image prompt enhanced', undefined, state.thoughtProcess);

                const thoughtEvent = { type: 'thought', content: `Enhanced prompt: ${enhanced}` };
                state.thoughtProcess.push(thoughtEvent);
                writer.thought(`Enhanced prompt: ${enhanced}`);

                writer.status('image_generating', 'Generating image with Bonsai...', undefined, state.thoughtProcess);
                try {
                    const health = await fetch(`${IMAGE_SERVICE_URL}/health`, {
                        signal: AbortSignal.timeout(3000),
                    }).catch(() => null);
                    if (!health?.ok) {
                        writer.status('image_generating_error', 'Image service is offline.', undefined, state.thoughtProcess);
                        return 'Image service is offline. Start it with: python image_service.py';
                    }
                    const imgRes = await fetch(`${IMAGE_SERVICE_URL}/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: enhanced, width: 1024, height: 1024 }),
                        signal: AbortSignal.timeout(180_000),
                    });
                    if (!imgRes.ok) {
                        writer.status(
                            'image_generating_error',
                            `Image service error: HTTP ${imgRes.status}`,
                            undefined,
                            state.thoughtProcess,
                        );
                        return `Image service error: HTTP ${imgRes.status}`;
                    }
                    const imgData = (await imgRes.json()) as any;
                    const file = {
                        base64: imgData.image_base64,
                        thumbnail: imgData.thumbnail_base64,
                        filename: `bonsai-${Date.now()}.png`,
                        mime: 'image/png',
                        width: imgData.width,
                        height: imgData.height,
                    };
                    state.generatedFiles.push(file);
                    writer.file(file);
                    writer.status('image_generating_success', 'Image generated successfully', undefined, state.thoughtProcess);
                    return (
                        `Image generated (${imgData.width}x${imgData.height}px). ` +
                        `Tell the user the image is displayed below.`
                    );
                } catch (e: any) {
                    writer.status(
                        'image_generating_error',
                        `Image generation failed: ${e.message}`,
                        undefined,
                        state.thoughtProcess,
                    );
                    return `Image generation failed: ${e.message}`;
                }
            },
        }),
    };
}
