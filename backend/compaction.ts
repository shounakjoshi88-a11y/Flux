// backend/compaction.ts
import { generateText } from 'ai';
import { prisma } from './db';

/**
 * Compact the oldest messages in a conversation into a short summary,
 * so that the model retains context without filling the window with raw messages.
 *
 * Triggered automatically when message count / character budget is exceeded.
 * The summary is stored on the Conversation row and injected as the first history
 * message on subsequent requests, while compactMsgCount messages are skipped.
 */
export async function compactConversation(
  conversationId: string,
  model: any,
  budgetChars = 10_000,
): Promise<void> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, content: true, role: true, createdAt: true },
        },
      },
    });
    if (!conv || conv.messages.length < 4) return;

    const msgCount = conv.messages.length;
    const skipCount = conv.compactMsgCount ?? 0;
    const activeMessages = conv.messages.slice(skipCount);
    let used = 0;
    let fitCount = 0;
    for (const m of activeMessages) {
      const len = (m.content?.length ?? 0);
      if (used + len > budgetChars && fitCount > 0) break;
      used += len;
      fitCount++;
    }

    // All messages already fit — no compaction needed
    if (fitCount >= activeMessages.length) return;

    // Messages that need compacting = messages that don't fit (oldest ones)
    const compactTargetCount = activeMessages.length - fitCount;
    const compactTargets = activeMessages.slice(0, compactTargetCount);

    const compactText = compactTargets
      .map(m => `${m.role === 'User' ? 'User' : 'Assistant'}: ${m.content.slice(0, 2000)}`)
      .join('\n\n');

    const prevCompaction = conv.compaction;

    const { text: summary } = await generateText({
      model,
      system: `You are a conversation compaction assistant. Summarize the following conversation history concisely.
Preserve: key facts, user preferences, decisions made, project context, and any personal details shared.
Output a single compact paragraph (80-200 words). Do NOT include meta-commentary.`,
      messages: [
        ...(prevCompaction
          ? [{ role: 'system' as const, content: `Previous compaction:\n${prevCompaction}` }]
          : []),
        { role: 'user' as const, content: compactText },
      ],
      maxOutputTokens: 512,
      temperature: 0.3,
    });

    const clean = summary.trim();
    if (!clean) return;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        compaction: clean,
        compactMsgCount: skipCount + compactTargets.length,
      },
    });

    console.log(`[COMPACT] ${conversationId}: compacted ${compactTargets.length} msgs (${clean.length} chars)`);
  } catch (e: any) {
    console.warn(`[COMPACT] Failed for ${conversationId}:`, e?.message ?? e);
  }
}
