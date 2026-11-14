/**
 * Conversation auto-rename.
 *
 * After the first turn of a new conversation, a cheap model drafts a short
 * title from the user's message. Falls back to a sanitised slice of the
 * message when the model call fails or times out.
 */
import { generateText } from 'ai';
import { nim } from '../../services/models/nim-client';
import { prisma } from '../../db/prisma';
import { sanitizeTitle } from '../../http/util/sanitize';
import { slugify } from '../../http/util/slug';
export const TITLE_MODEL = nim.chatModel('nvidia/nemotron-3-ultra-550b-a55b');

export function extractTitle(query: string): string {
    let q = query.trim();
    q = q.replace(/^(hey|hi|hello|yo)\s*/i, '');
    q = q.replace(/^(can|could|will|would|do|does|did|are|is|i want|i need|i have|i would like)\s+(you\s+)?(please\s+)?/i, '');
    q = q.replace(/\b(please|thanks|thank you|pls|plz)\b.*$/i, '');
    q = q.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    q = q.replace(/^(research|search|find|look up|tell me about|explain|what is|what are|how to|how do|how can|write|create|build|make|generate|edit|update|modify|change|add|remove|delete|fix|debug|refactor|review|analyze|check|test)\s+/i, '');
    if (!q || q.length < 3) q = query.trim().slice(0, 80);
    return q.slice(0, 80).replace(/[<>]/g, '');
}

export async function autoRenameConversation(
    conversationId: string,
    firstQuery: string,
    docIntent?: string | null
) {
    const fallbackTitle = sanitizeTitle(extractTitle(firstQuery));

    try {
        const safeQuery = firstQuery.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!safeQuery) {
            if (fallbackTitle) {
                await prisma.conversation.updateMany({ where: { id: conversationId }, data: { title: fallbackTitle } });
            }
            return;
        }

        let context = "";
        if (docIntent === "image") context = "The user created an image. ";
        else if (docIntent) context = `The user created a ${docIntent.toUpperCase()} document. `;

        const { text } = await generateText({
            model: TITLE_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a title generator. Respond with ONLY a short title (5-10 words). No quotes, no punctuation, no explanation.',
                },
                {
                    role: 'user',
                    content: `${context}Generate a title for a conversation that starts with: ${safeQuery}`,
                },
            ],
            maxTokens: 30,
            temperature: 0.1,
            signal: AbortSignal.timeout(6000),
        } as any);

        let clean = sanitizeTitle((text ?? '').trim());
        if (!clean) clean = fallbackTitle;
        if (clean.length > 80) clean = fallbackTitle;

        if (docIntent === "image" && !clean.toLowerCase().includes("image")) clean = `Image: ${clean}`;
        else if (docIntent && docIntent !== "image" && !clean.toLowerCase().includes(docIntent.toLowerCase())) {
            clean = `${docIntent.toUpperCase()}: ${clean}`;
        }

        if (clean) {
            await prisma.conversation.updateMany({
                where: { id: conversationId },
                data: { title: clean },
            });
        }
    } catch (err: any) {
        if (fallbackTitle) {
            try {
                await prisma.conversation.updateMany({ where: { id: conversationId }, data: { title: fallbackTitle } });
            } catch {}
        }
        if (err?.code !== 'P2025' && err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
            console.warn("Failed to auto-rename conversation:", err?.message ?? err);
        }
    }
}

// SSE writers live in http/sse/writers.ts

// File analysis helpers (used by synthesis path)

// File analysis helpers live in services/files/files.ts
// Pending permissions live in agents/permissions.ts

// Permission approval endpoint
