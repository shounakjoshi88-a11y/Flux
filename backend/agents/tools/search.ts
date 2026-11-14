/**
 * Web search tool.
 *
 * The most guarded tool in the set: it refuses to run when the question is not
 * factual, drops model-invented queries that have nothing to do with the
 * user's question, refuses generic filler like "tell me more", and stops after
 * two searches. Everything it returns is accumulated into state.searchContent
 * so later turns can build on it.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { tavilyClient, searchDepthFor } from '../../services/search/tavily';
import {
    isFollowUpQuery,
    isGenericQuery,
    isQueryRelevant,
    smartRewriteQuery,
    STOPWORDS,
} from '../../services/search/query';
import { getUrlTitle } from '../../http/util/url';
import type { ToolContext } from './context';

const MAX_RESULTS = 7;
const MAX_SOURCES = 10;
const MAX_QUERY_CHARS = 400;
const MAX_EXTRACT_CHARS = 3000;

const HEDGE_INSTRUCTION =
    'Above are ALL search results accumulated across your searches. When answering, match your confidence to the evidence: ' +
    "if numbers appear in only one source, present them as estimates rather than facts. Use hedging language (\"appears to\", " +
    '"suggests", "reportedly", "according to") - especially for claims that rely on secondary reporting. Never state an ' +
    'unsupported claim as settled fact. Answer now. Do NOT search again.';

export function createSearchTools(ctx: ToolContext) {
    const { writer, state, userQuery } = ctx;

    return {
        web_search: (tool as any)({
            description:
                'Search the web to retrieve LIVE, CURRENT data (recent news, events, facts). ' +
                'MAX 2 CALLS TOTAL. After 2 searches, answer immediately. Further calls will be blocked. ' +
                'Your training data is from 2024-2025 - this tool returns FRESH results from the present day. ' +
                'CRITICAL: After this tool returns, IGNORE what your training data says and answer ONLY from these results. ' +
                'Always include the current year/month in your query. ' +
                'Do NOT use for general knowledge, logic, math, or basic greetings. ' +
                'Call this tool SILENTLY - no preamble. Never say "The user is asking me to" or "Let me search". Just call the tool directly. ' +
                "The query MUST be directly related to the user's topic.",
            inputSchema: z.object({
                query: z.string().describe(
                    'TARGETED search (6-10 words). Extract KEY ENTITIES only: specific names, topics, years. ' +
                    'NEVER include instruction words (search for, find, tell me), filler (information about), or verification words (true, false, verify). ' +
                    'Example: "Statue Unity tour packages Nagpur prices 2026". ' +
                    'Example: "Meta cancelling AI projects 2026". ' +
                    'Example: "RBU Nagpur Btech CSE 2nd year courses 2026". ' +
                    'Should look like a browser search bar query, not a sentence. Always append current year.',
                ),
                queries: z
                    .array(z.string())
                    .describe(
                        'MAX 3 parallel queries max (each targeted, same rules as query). ' +
                            'Only use for multi-part questions needing separate angles. ' +
                            'Example: "tours Nagpur to Statue of Unity prices" + "Kevadiya Statue Unity entry ticket 2026".',
                    )
                    .optional(),
            }),
            execute: async ({ query, queries: queriesArr }: any) => {
                // Re-search guard: max 1 auto + 1 re-search before blocking.
                if (state.searchCount >= 2) {
                    console.warn(`[TOOL] web_search blocked (already searched ${state.searchCount}x)`);
                    return `__SEARCH_BLOCKED__ SEARCH LIMIT REACHED. You already performed ${state.searchCount} search(es). Do NOT call any more tools. Answer the user IMMEDIATELY using the search results already in context. If you call web_search again, your response will be discarded.`;
                }

                // Block re-search when we already have results from the first search.
                if (state.searchCount >= 1 && (state.searchContent?.length ?? 0) > 500) {
                    console.warn(
                        `[TOOL] web_search - re-search blocked; already have ` +
                            `${state.searchContent!.length} chars from first search. Forcing synthesis.`,
                    );
                    return (
                        `__SEARCH_SKIPPED__ Already have comprehensive search results ` +
                        `${state.searchContent!.length} chars. Answer using the information you already have.`
                    );
                }

                // Skip search only for genuine no-ops: greetings, chitchat and
                // self-referential meta — nothing where a search could help.
                // (Previously any short query with no question-word was blocked,
                //  which trapped "yeah pull them"-style instructions behind a wall.)
                if (typeof userQuery === 'string') {
                    const uq = userQuery.trim().toLowerCase();
                    const words = uq.split(/\s+/).filter(Boolean);
                    const isExactGreeting = /^(hi|hello|hey|yo|sup|hiya|heya|gm|gn|good (morning|afternoon|evening|night)|thanks|thank you|ty|cheers|lol|lmao|haha|hehe|bye|goodbye|ok|okay|cool|nice|great|awesome|perfect|got it|sure|alright|no problem|np)$/.test(uq);
                    const isMetaChat = /\b(who are you|what can you|are you .{0,20}?|do you .{0,20}?)\b/.test(uq) && words.length <= 6;
                    const isSystemQuery =
                        /\b(architecture|design|codebase|how.*(work|built|implement|structur)|your (code|design|architecture|system)|this (system|code|function|class|file|router))\b/i.test(uq);

                    if (isSystemQuery || isMetaChat || isExactGreeting) {
                        console.log(`[TOOL] web_search skipped - not a factual query`);
                        return `__SEARCH_SKIPPED__ Answer naturally without searching.`;
                    }
                }

                // Build query list. Model-generated queries come first; the user's
                // own query is only a last resort.
                const queriesToRun: string[] = [];

                const modelQueries: string[] = [];
                if (Array.isArray(queriesArr) && queriesArr.length > 0) {
                    modelQueries.push(
                        ...queriesArr
                            .filter((q: any) => typeof q === 'string')
                            .map((q: string) => q.trim())
                            .filter(Boolean),
                    );
                } else if (typeof query === 'string' && query.trim()) {
                    modelQueries.push(query.trim());
                }

                // Refuse affirmation-matching queries: if the model query is the
                // user's short affirmation verbatim, do not search the internet for
                // it — the model is guessing at the referent, not resolving it.
                // Steer it to answer from history instead (which has the PDF + analysis).
                const AFFIRM_ONLY = /^(yes|yeah|yep|yup|sure|ok|okay|alright|fine|do it|go ahead|go for it|fetch it|get it|pull it|pull them|pull that|pull everything|just fetch|just do it|yes please|please do|sure thing)\s*[.!?]?$/i;
                const isShortAffirmation = typeof userQuery === 'string'
                    && AFFIRM_ONLY.test(userQuery.trim());
                if (isShortAffirmation && userQuery) {
                    const mqLower = (typeof query === 'string' ? query : (Array.isArray(queriesArr) && queriesArr[0]))?.toLowerCase() ?? '';
                    const matches = queriesArr?.some((q: any) => String(q).toLowerCase() === userQuery.toLowerCase()) || mqLower === userQuery.toLowerCase();
                    if (matches) {
                        console.warn('[TOOL] web_search refused 1:1 affirmation query — model must use conversation context');
                        writer.status('searching', `Skipping search: query matches the affirmation verbatim`, undefined, state.thoughtProcess);
                        return `__SEARCH_SKIPPED__ Your search query is identical to the user's affirmation ("${userQuery}"), not a topic. 
The user told you to pull up something you already offered or discussed in this conversation. FIND that referent
in the history (the PDF they attached, your legitimacy analysis, the docs or posts you mentioned) and search for
THAT — or answer directly from the history without calling web_search again.`;
                    }
                }
                for (const mq of modelQueries) {
                    if (userQuery && mq.toLowerCase() === userQuery?.toLowerCase()) {
                        if (state.searchCount === 0) queriesToRun.push(mq);
                        continue;
                    }
                    if (userQuery && !isFollowUpQuery(userQuery) && !isQueryRelevant(userQuery, mq)) {
                        console.warn(
                            `[TOOL] web_search dropped hallucinated query - model query "${mq}" has no relation to user query "${userQuery}"`,
                        );
                        continue;
                    }
                    queriesToRun.push(mq);
                }

                // Fallback: only add the user's raw query if the model generated nothing and
                // it's not a bare affirmation (an affirmation would produce zero-signal junk).
                const AFFIRM_FALLBACK = /^(yes|yeah|yep|yup|sure|ok|okay|alright|fine|do it|go ahead|go for it|fetch it|get it|pull it|pull them|pull that|pull everything|just fetch|just do it|yes please|please do|sure thing)\s*[.!?]?$/i;
                if (queriesToRun.length === 0 && state.searchCount === 0 && typeof userQuery === 'string' && userQuery.trim()) {
                    if (!AFFIRM_FALLBACK.test(userQuery.trim())) queriesToRun.push(userQuery.trim());
                }

                // Rewrite each query: strip instruction echo, extract key entities,
                // add the year for time-sensitive queries, truncate to ~10 words.
                let safeQueries = queriesToRun.slice(0, 3).map((q) => smartRewriteQuery(q, userQuery ?? q));
                // Deduplicate and remove empty/stopword-only queries.
                safeQueries = [
                    ...new Set(
                        safeQueries.filter((q: string) => {
                            if (q.trim().length === 0) return false;
                            // Must have at least one meaningful (non-stopword, >=3 chars) token.
                            const meaningful = q
                                .toLowerCase()
                                .split(/\s+/)
                                .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
                            return meaningful.length > 0;
                        }),
                    ),
                ];

                // No valid queries after filtering.
                if (safeQueries.length === 0) {
                    const msg = state.searchContent
                        ? `__SEARCH_SKIPPED__ Your search query was unrelated to the user's question. You already have search results below - answer using those instead of searching again.`
                        : 'No search query was provided. Answer from training knowledge instead.';
                    console.warn('[TOOL] web_search - no valid query:', msg);
                    writer.status('error', 'Search skipped: no valid query.', undefined, state.thoughtProcess);
                    return msg;
                }

                const nonGeneric = safeQueries.filter((q) => !isGenericQuery(q));
                if (nonGeneric.length === 0) {
                    const genQ = safeQueries.find((q) => isGenericQuery(q));
                    console.warn('[TOOL] web_search - all queries are generic/filler, skipping:', genQ);
                    writer.status('error', 'Search skipped: generic request.', undefined, state.thoughtProcess);
                    return `Search skipped: The query is generic ('${genQ}'). Do NOT search the web for generic phrases or requests to elaborate (e.g. 'tell me more'). Instead, answer by elaborating on the information already present in the conversation history, or ask the user to specify what they want to search for.`;
                }
                safeQueries.length = 0;
                safeQueries.push(...nonGeneric);

                // Validation passed - this counts as a real search.
                state.searchCount++;

                writer.status(
                    'searching',
                    `Searching for: ${safeQueries.map((q) => `"${q}"`).join(', ')}...`,
                    { query: safeQueries[0] || userQuery || '' },
                    state.thoughtProcess,
                );

                // Check the search cache.
                const { getCached, setCache } = await import('../../services/search/cache');
                const cacheKey = safeQueries[0] || userQuery || '';
                const cached = getCached(cacheKey);
                if (cached) {
                    console.log(`[TOOL] Using cached search results (${cached.sources.length} sources)`);
                    const idxOffset = state.sources.length;
                    const withIndex = cached.sources.map((s: any, i: number) => ({ url: s.url, index: idxOffset + i + 1 }));
                    state.sources.push(...withIndex);
                    // Emit found_sources so the frontend shows each search cycle's steps.
                    const cachedUrls = cached.sources.map((s: any) => s.url);
                    const cachedTitles = cached.sources.map((s: any) => s.title || getUrlTitle(s.url));
                    writer.status(
                        'found_sources',
                        `Found ${cached.sources.length} source${cached.sources.length > 1 ? 's' : ''}`,
                        { sources: cachedUrls, titles: cachedTitles, query: safeQueries[0] || userQuery || '' },
                        state.thoughtProcess,
                    );
                    if (cached.content) {
                        state.searchContent = (state.searchContent || '') + '\n\n' + cached.content;
                        return `[ACCUMULATED SEARCH RESULTS - ALL SEARCHES COMBINED]\n${state.searchContent}\n\n---\nINSTRUCTION: ${HEDGE_INSTRUCTION}`;
                    }
                    const cacheText = cached.sources
                        .map((s: any, i: number) => `[${i + 1}] ${s.url}\n${(s.content || '').slice(0, 3000)}`)
                        .join('\n\n');
                    state.searchContent = (state.searchContent || '') + '\n\n[Search Results (cached)]\n\n' + cacheText;
                    return `[ACCUMULATED SEARCH RESULTS - ALL SEARCHES COMBINED]\n${state.searchContent}\n\n---\nINSTRUCTION: ${HEDGE_INSTRUCTION}`;
                }

                try {
                    const searchPromises = safeQueries.map((q) =>
                        (tavilyClient as any)
                            .search(q, {
                                search_depth: searchDepthFor(q),
                                max_results: MAX_RESULTS,
                            })
                            .catch((err: any) => {
                                console.error(`[TOOL] Tavily search failed for "${q}":`, err);
                                return null;
                            }),
                    );
                    const searchOutputs = await Promise.all(searchPromises);

                    const allResults: any[] = [];
                    const seenUrls = new Set<string>();
                    for (const out of searchOutputs) {
                        if (out && Array.isArray(out.results)) {
                            for (const r of out.results) {
                                if (r.url && !seenUrls.has(r.url)) {
                                    seenUrls.add(r.url);
                                    allResults.push(r);
                                }
                            }
                        }
                    }

                    const uniqueResults = allResults.slice(0, MAX_SOURCES);

                    const srcs = uniqueResults.map((r: any, i: number) => ({
                        url: r.url,
                        index: (state.sources?.length ?? 0) + i + 1,
                        content: ((r.content || r.snippet || '')
                            .replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                        ).slice(0, MAX_QUERY_CHARS),
                    }));
                    state.sources.push(...srcs);

                    if (!srcs.length) {
                        writer.status('no_results', 'No relevant results found.', undefined, state.thoughtProcess);
                        return 'No search results found.';
                    }

                    const foundTitles = uniqueResults.slice(0, MAX_SOURCES).map((r: any) => r.title || getUrlTitle(r.url));
                    writer.status(
                        'found_sources',
                        `Found ${srcs.length} source${srcs.length > 1 ? 's' : ''}`,
                        { sources: srcs.map((s: any) => s.url), titles: foundTitles, query: safeQueries[0] || userQuery || '' },
                        state.thoughtProcess,
                    );

                    const resultsText = uniqueResults
                        .map((r: any, i: number) => {
                            let c = (r.content || r.snippet || '')
                                .replace(/<[^>]*>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();
                            if (c.length > MAX_EXTRACT_CHARS) c = c.slice(0, MAX_EXTRACT_CHARS) + '...';
                            return `[${i + 1}] ${r.url}\n${r.title ? r.title + '\n' : ''}${c}`;
                        })
                        .join('\n\n');
                    // Full-page extraction is intentionally not attempted: it
                    // produced no verifiable user-visible result, so it was removed.
                    const extraContent = '';

                    const safeQueryStr = safeQueries.join('; ');
                    const fullSearchRes = `[Search Results for "${safeQueryStr}"]\n\n${resultsText}${extraContent}`;
                    state.searchContent = (state.searchContent || '') + '\n\n' + fullSearchRes;

                    // Cache search results after building the full text.
                    setCache(cacheKey, srcs, fullSearchRes);

                    writer.status('done', `Search complete: "${safeQueryStr}"`, { searchCount: state.searchCount }, state.thoughtProcess);

                    return `[ACCUMULATED SEARCH RESULTS - ALL SEARCHES COMBINED]
${state.searchContent}

---
INSTRUCTION: Above are ALL search results accumulated across your searches. Use ALL of this information together to answer the user comprehensively. Match your confidence to the evidence: if numbers appear in only one source, present them as estimates rather than facts. Use hedging language ("appears to", "suggests", "reportedly", "according to") - especially for claims that rely on secondary reporting. Never state an unsupported claim as settled fact. Do NOT search again - answer now using everything above.`;
                } catch (e: any) {
                    writer.status('error', 'Search failed.', undefined, state.thoughtProcess);
                    return `Search failed: ${e.message}`;
                }
            },
        }),
    };
}
