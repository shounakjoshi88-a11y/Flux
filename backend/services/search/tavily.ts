/**
 * Tavily client.
 *
 * One client for the process. The key comes from config/env, so the server
 * fails at boot with a clear message instead of 401s at query time.
 */
import { tavily } from '@tavily/core';
import { env } from '../../config/env';

export const tavilyClient = tavily({ apiKey: env.TAVILY_API_KEY });

/** Queries about prices, bookings and travel need Tavily's deeper crawl. */
const DEEP_QUERY_RE =
    /\b(price|cost|tour|package|hotel|restaurant|book|buy|ticket|deal|offer|rate|schedule|review|itinerary|resort|flight|train|bus)\b/i;

export function searchDepthFor(query: string): 'advanced' | 'basic' {
    return DEEP_QUERY_RE.test(query) ? 'advanced' : 'basic';
}
