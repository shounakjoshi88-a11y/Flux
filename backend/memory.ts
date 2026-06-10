// backend/memory.ts
import { generateText } from 'ai';
import * as crypto from 'crypto';
import { prisma } from './db';
import { getEmbedding } from './local-embedder';

async function getEmbeddingVector(text: string): Promise<number[]> {
  return getEmbedding(text);
}

/**
 * Retrieve the most relevant memories for a given query.
 * Uses the HNSW index efficiently via raw <=> operator.
 */
export async function retrieveMemories(
  userId: string,
  query: string,
  limit = 5,
  minSimilarity = 0.5,  // lowered from 0.7 for better recall
) {
  const queryEmbedding = await getEmbeddingVector(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Convert similarity threshold to distance threshold (0 = identical, 2 = opposite)
  const maxDistance = 1 - minSimilarity;

  const memories = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, category, fact, importance, "accessCount",
            1 - (embedding <=> $1::vector) AS similarity
     FROM "Memory"
     WHERE "userId" = $2
       AND embedding <=> $1::vector < $3
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    embeddingStr,
    userId,
    maxDistance,
    limit,
  );

  // Update access stats
  if (memories.length > 0) {
    const ids = memories.map((m: any) => m.id);
    await prisma.memory.updateMany({
      where: { id: { in: ids } },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }

  return memories;
}

/**
 * Extract key facts from a conversation and store them as memories.
 */
export async function extractMemories(
  messages: { role: string; content: string }[],
  userId: string,
  conversationId: string,
  model: any,          // your chat model (e.g. nim.chatModel(...))
) {
  // NOTE: The fallback MUST be exactly `[]` — never a prose string.
  // Models that return "No memories found." instead of `[]` will be
  // caught by the guard below and silently skipped.
  const prompt = `You are a memory extraction assistant. Extract key long-term facts about the user from the conversation below.

CRITICAL: You MUST respond with ONLY a raw JSON array — no markdown, no prose, no explanation whatsoever.
If there is nothing worth remembering, respond with exactly: []

Each array element must be a JSON object with these exact keys:
  "fact"       – a clear, self-contained statement about the user
  "category"   – exactly one of: "preference", "project", "personal", "decision", "feedback"
  "importance" – a number 0–1 (how critical this is to remember long-term)

Focus on: preferences, decisions, personal details, ongoing projects.
Ignore: temporary info, weather queries, greetings, generic facts.

Example of valid output (two facts):
[{"fact":"User prefers dark mode","category":"preference","importance":0.6},{"fact":"User is building a fullstack AI app called Flux","category":"project","importance":0.9}]

Conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;

  const { text } = await generateText({
    model,
    prompt,
    maxTokens: 600,
  } as any);

  // ── Robust JSON extraction ──────────────────────────────────────────────────
  // Guards handle every failure mode: bare string ("No memories."), markdown
  // fences, missing array brackets, truncated output, non-array objects, etc.
  let facts: any[];
  const trimmed = text?.trim() ?? '';

  // Guard 1: empty or clearly non-JSON response (no '[' means no array)
  if (!trimmed || !trimmed.includes('[')) {
    // Model returned something like `"No memories to extract."` — not an error,
    // just nothing to store. Silently skip.
    return;
  }

  // Guard 2: strip markdown fences if the model wrapped the JSON anyway
  const deFenced = trimmed
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  // Guard 3: locate the first [ … ] block (handles leading prose)
  const arrayMatch = deFenced.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    console.warn('[MEM-EXTRACT] No JSON array found in response, skipping.');
    return;
  }

  try {
    facts = JSON.parse(arrayMatch[0]);
  } catch {
    console.warn('[MEM-EXTRACT] JSON.parse failed, skipping. Response start:', trimmed.slice(0, 80));
    return;
  }

  // Guard 4: parsed value must be an array (not a string / object / number)
  if (!Array.isArray(facts)) {
    console.warn('[MEM-EXTRACT] Parsed value is not an array:', typeof facts);
    return;
  }

  // ── Store each fact ────────────────────────────────────────
  for (const fact of facts) {
    if (!fact.fact || !fact.category) continue;

    const embedding = await getEmbeddingVector(fact.fact);
    const embeddingStr = `[${embedding.join(',')}]`;

    const similar = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, importance FROM "Memory"
       WHERE "userId" = $1
         AND embedding <=> $2::vector < 0.1
       LIMIT 1`,
      userId,
      embeddingStr,
    );

    if (similar.length > 0) {
      await prisma.memory.update({
        where: { id: similar[0]!.id },
        data: {
          fact: fact.fact,
          importance: Math.max(fact.importance, similar[0]!.importance),
          sourceConversationId: conversationId,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Memory" (id, "userId", category, fact, embedding, "sourceConversationId", importance, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::vector, $6, $7, NOW(), NOW())`,
        crypto.randomUUID(),
        userId,
        fact.category,
        fact.fact,
        embeddingStr,
        conversationId,
        fact.importance,
      );
    }
  }
}

/**
 * Build a context string for the system prompt from retrieved memories.
 */
export function buildMemoryContext(memories: any[]): string {
  if (!memories.length) return '';
  return `## User Memories (from previous interactions)
${memories.map(m => `- [${m.category}] ${m.fact}`).join('\n')}

Use these as personalisation hints, but always verify against the current conversation.`;
}
/**
 * Prune a user's memory bank:
 *  1. Delete junk — low importance AND never re-accessed
 *  2. Delete near-duplicates — keep the higher-importance copy
 *
 * No hard cap — memories accumulate naturally as the user chats.
 * Scoring: importance * 0.7 + min(accessCount / 10, 1) * 0.3
 */
const JUNK_IMPORTANCE = 0.2;
const DUPLICATE_DISTANCE = 0.12;

export async function pruneMemories(userId: string): Promise<void> {
  try {
    const total = await prisma.memory.count({ where: { userId } });
    console.log(`[MEM-PRUNE] ${userId}: ${total} memories — pruning junk & dupes...`);

    // 1. Delete junk: low importance + never re-accessed
    const deleted = await prisma.memory.deleteMany({
      where: { userId, importance: { lt: JUNK_IMPORTANCE }, accessCount: { lte: 1 } },
    });
    if (deleted.count > 0) console.log(`[MEM-PRUNE] Deleted ${deleted.count} junk memories`);

    // 2. Deduplicate using pgvector distance
    const all = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, embedding::text, importance, "accessCount"
       FROM "Memory" WHERE "userId" = $1
       ORDER BY importance DESC`,
      userId,
    );

    const toDelete = new Set<string>();
    for (let i = 0; i < all.length; i++) {
      const itemI = all[i]!;
      if (toDelete.has(itemI.id)) continue;
      for (let j = i + 1; j < all.length; j++) {
        const itemJ = all[j]!;
        if (toDelete.has(itemJ.id)) continue;
        const dist = await prisma.$queryRawUnsafe<any[]>(
          `SELECT $1::vector <=> $2::vector AS distance`,
          itemI.embedding,
          itemJ.embedding,
        );
        if ((dist[0]?.distance ?? 1) < DUPLICATE_DISTANCE) {
          toDelete.add(itemJ.id);
        }
      }
    }
    if (toDelete.size > 0) {
      await prisma.memory.deleteMany({ where: { id: { in: [...toDelete] } } });
      console.log(`[MEM-PRUNE] Deleted ${toDelete.size} near-duplicates`);
    }

    const finalCount = await prisma.memory.count({ where: { userId } });
    console.log(`[MEM-PRUNE] Done. Remaining: ${finalCount}`);
  } catch (err) {
    console.error('[MEM-PRUNE] Error:', err);
  }
}