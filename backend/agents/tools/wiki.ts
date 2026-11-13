/**
 * Wiki tool.
 *
 * The wiki is the knowledge graph of concepts extracted from earlier
 * conversations. It may be searched once per turn.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { wikiManager } from '../../wiki/wikiManager';
import { shouldBlockFurtherTools } from './context';
import type { ToolContext } from './context';

export function createWikiTools(ctx: ToolContext) {
    const { state, uid } = ctx;

    return {
        wiki_search: (tool as any)({
            description:
                'Search the knowledge graph / wiki for concepts, entities, and topics extracted from this conversation. Returns related nodes and their relationships. Use this when the user asks about topics or concepts previously discussed. May only be called ONCE per query.',
            inputSchema: z.object({
                query: z.string().describe('The concept or topic to search for in the wiki'),
            }),
            execute: async ({ query }: any) => {
                if (!uid || !query) return 'No user or query provided.';
                if (state.wikiSearchCount >= 1) {
                    return `__TOOL_BLOCKED__ You already searched the wiki and the model is still tool-looping. ANSWER THE USER NOW. Do NOT call any more tools.`;
                }
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call wiki_search or any other tool.';
                }
                state.wikiSearchCount++;
                try {
                    const nodes = await wikiManager.searchConcepts(uid, query);
                    if (!nodes.length) return `No wiki entries found for "${query}".`;
                    return `Wiki results for "${query}":\n${nodes
                        .map((n: any) => `  - ${n.label} (${n.type}): ${n.description || 'no description'}`)
                        .join('\n')}`;
                } catch (e: any) {
                    return `Wiki search failed: ${e.message}`;
                }
            },
        }),
    };
}
