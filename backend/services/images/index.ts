/**
 * Image generation service client and prompt helpers.
 *
 * Images are produced by a local Python service (Bonsai Image 4B) that the
 * backend talks to over HTTP. This module owns its address, the intent
 * detection for "make me a picture" requests, and the prompt enhancement that
 * turns a one-line request into a diffusion-ready prompt.
 */
import { generateText } from 'ai';
import { env } from '../../config/env';

export const IMAGE_SERVICE_URL = env.IMAGE_SERVICE_URL || 'http://127.0.0.1:8001';

/** True when the request reads as "produce an image". */
export function detectImageIntent(query: string): boolean {
    const q = query.toLowerCase().trim();
    const genVerb = /\b(generate|create|make|draw|paint|render|design|illustrate|produce|imagine|visualize|sketch|craft)\b/i;
    const imgNoun = /\b(image|photo|photograph|picture|pic|illustration|artwork|art|painting|drawing|portrait|landscape|wallpaper|poster|logo|banner|thumbnail)\b/i;
    if (genVerb.test(q) && imgNoun.test(q)) return true;
    if (/^(draw|paint|sketch|illustrate)\s+(me\s+)?(a\s+|an\s+|the\s+)?\S/i.test(q)) return true;
    return false;
}

/**
 * Expand a short user request into a detailed prompt.
 * Falls back to the original prompt when the model call fails.
 */
export async function enhanceImagePrompt(rawPrompt: string, model: any): Promise<string> {
    try {
        const { text } = await generateText({
            model,
            system: [
                'You are a professional image-generation prompt engineer.',
                "Expand the user's short request into a vivid, detailed prompt for a diffusion model.",
                'Focus on: subject, composition, lighting, colour palette, mood, art style, and quality keywords.',
                'Output ONLY the enhanced prompt - no preamble, no quotes, no explanations.',
                'Target length: 60-150 words. End with: highly detailed, 8k, cinematic lighting.',
            ].join(' '),
            prompt: `Enhance this image prompt: "${rawPrompt}"`,
            maxTokens: 250,
        } as any);
        return text.trim() || rawPrompt;
    } catch {
        return rawPrompt;
    }
}

/**
 * Three follow-up questions to offer after an image is generated.
 * Falls back to a fixed set when the model call fails.
 */
export async function generateImageFollowUps(originalQuery: string, enhancedPrompt: string, model: any): Promise<string[]> {
    const fallback = [
        'Can you generate another one with a different style?',
        'Make this wear a hat',
        'What model was used for this?',
    ];
    try {
        const { text } = await generateText({
            model,
            system: 'You are a creative assistant. Generate exactly 3 short, engaging follow-up questions for a user who just generated an image. Focus on variations, edits, or related creative ideas. Output ONLY the questions wrapped in <question> tags.',
            prompt: `User originally asked for: "${originalQuery}"\nAI enhanced it to: "${enhancedPrompt}"\nGenerate 3 follow-up questions.`,
            maxTokens: 150,
        } as any);
        const matches = Array.from(text.matchAll(/<question>([\s\S]*?)<\/question>/g), (m) => m[1]!.trim()).filter(Boolean);
        return matches.length >= 3 ? matches.slice(0, 3) : fallback;
    } catch {
        return fallback;
    }
}
