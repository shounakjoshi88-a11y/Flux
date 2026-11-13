import { generateText } from 'ai';
import { nim } from '../models/nim-client';
import { prisma } from '../../db/prisma';

const EXTRACT_MODEL = nim.chatModel('meta/llama-4-maverick-17b-128e-instruct');
const CHUNK_SIZE = 3;

export type WikiNodeInfo = {
  label: string;
  description?: string;
  type?: string;
};

export type WikiEdgeInfo = {
  source: string;
  target: string;
  relationship: string;
};

type RebuildProgress = {
  total: number;
  processed: number;
  phase: 'extracting' | 'relationships' | 'saving' | 'done';
  error?: string;
};

export class WikiManager {
  private static progress = new Map<string, RebuildProgress>();

  getProgress(userId: string) {
    return WikiManager.progress.get(userId) ?? null;
  }

  async updateGraph(userId: string, responseText: string, userQuery: string) {
    try {
      const concepts = await this.extractSingle(responseText, userQuery);
      if (!concepts.length) return null;

      const relationships = await this.extractRelationships(concepts, responseText);
      const nodes = await this.upsertNodes(userId, concepts);
      const edges = await this.upsertEdges(relationships, nodes);

      return { nodes, edges };
    } catch (err) {
      console.warn('[WIKI] updateGraph error:', err);
      return null;
    }
  }

  async rebuildAll(userId: string) {
    const messages = await prisma.message.findMany({
      where: { conversation: { userId } },
      orderBy: { createdAt: 'asc' },
      select: { content: true, role: true, createdAt: true },
    });

    if (messages.length < 2) {
      return { nodes: [], edges: [], error: 'Need at least 2 messages to build a graph' };
    }

    const pairs: { user: string; assistant: string }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role === 'User' && i + 1 < messages.length) {
        const next = messages[i + 1]!;
        if (next.role === 'Assistant') {
          pairs.push({
            user: msg.content.slice(0, 1200),
            assistant: next.content.slice(0, 2500),
          });
        }
      }
    }

    if (pairs.length === 0) {
      return { nodes: [], edges: [], error: 'No user-assistant message pairs found' };
    }

    WikiManager.progress.set(userId, { total: pairs.length, processed: 0, phase: 'extracting' });

    const allConcepts: WikiNodeInfo[] = [];
    let lastError = '';

    for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + CHUNK_SIZE);
      const chunkText = chunk.map((p, idx) =>
        `--- Exchange ${i + idx + 1} ---\nUser: ${p.user}\nAssistant: ${p.assistant}`
      ).join('\n\n');

      try {
        const concepts = await this.extractFromChunk(chunkText);
        allConcepts.push(...concepts);
      } catch (e: any) {
        lastError = e.message || 'Extraction failed';
        console.warn('[WIKI] chunk extraction failed:', i, e);
      }

      WikiManager.progress.set(userId, {
        total: pairs.length,
        processed: Math.min(i + CHUNK_SIZE, pairs.length),
        phase: 'extracting',
        error: lastError || undefined,
      });
    }

    const seen = new Map<string, WikiNodeInfo>();
    for (const c of allConcepts) {
      const key = c.label.toLowerCase().trim();
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, c);
      } else if (!existing.description && c.description) {
        seen.set(key, { ...existing, description: c.description });
      }
    }
    const uniqueConcepts = Array.from(seen.values());

    WikiManager.progress.set(userId, {
      total: pairs.length,
      processed: pairs.length,
      phase: 'relationships',
      error: lastError || undefined,
    });

    const relationships: WikiEdgeInfo[] = [];
    if (uniqueConcepts.length > 0) {
      try {
        const rels = await this.extractRelationships(uniqueConcepts, messages.map(m => m.content).join('\n').slice(0, 4000));
        relationships.push(...rels);
      } catch (e: any) {
        lastError = (lastError ? lastError + '; ' : '') + 'Relationship extraction failed';
        console.warn('[WIKI] relationship extraction failed:', e);
      }
    }

    WikiManager.progress.set(userId, {
      total: pairs.length,
      processed: pairs.length,
      phase: 'saving',
      error: lastError || undefined,
    });

    const existingNodes = await prisma.wikiNode.findMany({ where: { userId }, select: { id: true } });
    const existingIds = existingNodes.map(n => n.id);
    if (existingIds.length > 0) {
      await prisma.wikiEdge.deleteMany({
        where: { OR: [{ sourceId: { in: existingIds } }, { targetId: { in: existingIds } }] },
      });
    }
    await prisma.wikiNode.deleteMany({ where: { userId } });

    const nodes = await this.upsertNodes(userId, uniqueConcepts);
    const edges = await this.upsertEdges(relationships, nodes);

    WikiManager.progress.set(userId, {
      total: pairs.length,
      processed: pairs.length,
      phase: 'done',
      error: lastError || undefined,
    });

    return {
      nodes,
      edges,
      stats: { concepts: nodes.length, relationships: edges.length, pairsProcessed: pairs.length },
      error: lastError || undefined,
    };
  }

  private async extractSingle(text: string, query: string): Promise<WikiNodeInfo[]> {
    const prompt = `Extract key concepts, entities, and topics from this conversation.
Return ONLY a raw JSON array — no markdown, no explanation, no code fences.
Format: [{"label": "short name", "description": "one sentence", "type": "concept|entity|topic"}]
Limit to 6 most important.

Context: ${query.slice(0, 300)}
Response: ${text.slice(0, 2500)}`;

    const { text: raw } = await generateText({
      model: EXTRACT_MODEL,
      prompt,
      maxTokens: 600,
    } as any);

    return this.parseJSON(raw) || [];
  }

  private async extractFromChunk(chunkText: string): Promise<WikiNodeInfo[]> {
    const prompt = `Extract the key concepts, entities, and topics from these conversation exchanges.

For each concept provide:
- "label": short specific name (2-5 words)
- "description": one-sentence explanation
- "type": "concept" for abstract ideas, "entity" for specific named things, "topic" for discussion subjects

Examples:
[{"label": "React Server Components", "description": "A React architecture for server-side rendering", "type": "concept"},
 {"label": "Next.js", "description": "A React framework for production applications", "type": "entity"},
 {"label": "Performance Optimization", "description": "Techniques to improve application speed", "type": "topic"}]

Return ONLY a raw JSON array. No markdown, no explanation, no code fences. No trailing commas.
Limit to 5 most important.

Conversation:
${chunkText}`;

    const { text: raw } = await generateText({
      model: EXTRACT_MODEL,
      prompt,
      maxTokens: 600,
    } as any);

    return this.parseJSON(raw) || [];
  }

  private async extractRelationships(concepts: WikiNodeInfo[], text: string): Promise<WikiEdgeInfo[]> {
    const names = concepts.map(c => c.label).join(', ');
    const prompt = `Given these concepts: ${names}
Find relationships between them from the text below.
Return ONLY a raw JSON array: [{"source": "A", "target": "B", "relationship": "related_to"}]
Relationship types: mentions, related_to, contradicts, supports, defines, is_part_of, used_by, depends_on, generates
No markdown, no explanation.
Text: ${text.slice(0, 3000)}`;

    const { text: raw } = await generateText({
      model: EXTRACT_MODEL,
      prompt,
      maxTokens: 600,
    } as any);

    return this.parseJSON(raw) || [];
  }

  private parseJSON(raw: string | null | undefined): any[] | null {
    const trimmed = raw?.trim() ?? '';
    if (!trimmed.includes('[')) return null;
    const deFenced = trimmed.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
    const match = deFenced.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      try {
        const cleaned = match[0]
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/(['"])?([a-zA-Z_]\w*)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"');
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }
  }

  private async upsertNodes(userId: string, concepts: WikiNodeInfo[]) {
    const results = [];
    for (const c of concepts) {
      try {
        const result = await prisma.wikiNode.upsert({
          where: {
            userId_label: { userId, label: c.label },
          },
          update: {
            description: c.description ?? undefined,
            type: c.type ?? 'concept',
          },
          create: {
            userId,
            label: c.label,
            description: c.description,
            type: c.type ?? 'concept',
          },
        });
        results.push(result);
      } catch (e) {
        console.warn('[WIKI] upsert node failed:', c.label, e);
      }
    }
    return results;
  }

  private async upsertEdges(relationships: WikiEdgeInfo[], nodes: any[]) {
    const nodeMap = Object.fromEntries(nodes.map(n => [n.label, n.id]));
    const results = [];
    for (const rel of relationships) {
      const sourceId = nodeMap[rel.source];
      const targetId = nodeMap[rel.target];
      if (!sourceId || !targetId) continue;
      try {
        const result = await prisma.wikiEdge.upsert({
          where: {
            sourceId_targetId_relationship: {
              sourceId,
              targetId,
              relationship: rel.relationship,
            },
          },
          update: { weight: { increment: 0.1 } },
          create: { sourceId, targetId, relationship: rel.relationship },
        });
        results.push(result);
      } catch (e) {
        console.warn('[WIKI] upsert edge failed:', rel.source, rel.target, e);
      }
    }
    return results;
  }

  async getGraph(userId: string) {
    const nodes = await prisma.wikiNode.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, label: true, description: true, type: true, x: true, y: true, createdAt: true },
    });
    const nodeIds = nodes.map(n => n.id);
    const edges = nodeIds.length > 0
      ? await prisma.wikiEdge.findMany({
          where: { OR: [{ sourceId: { in: nodeIds } }, { targetId: { in: nodeIds } }] },
          include: { source: { select: { label: true } }, target: { select: { label: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return { nodes, edges };
  }

  async deleteNode(nodeId: string, userId: string) {
    const node = await prisma.wikiNode.findFirst({ where: { id: nodeId, userId }, select: { id: true } });
    if (!node) throw new Error('Node not found');
    await prisma.wikiEdge.deleteMany({
      where: { OR: [{ sourceId: nodeId }, { targetId: nodeId }] },
    });
    await prisma.wikiNode.delete({ where: { id: nodeId } });
  }

  async searchConcepts(userId: string, query: string) {
    const nodes = await prisma.wikiNode.findMany({
      where: {
        userId,
        OR: [
          { label: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, label: true, description: true, type: true },
      take: 10,
    });
    return nodes;
  }
}

export const wikiManager = new WikiManager();
