// search-cache.ts — In-memory cache for web search results

type CachedResult = {
  sources: { url: string; content?: string }[];
  content: string;
  timestamp: number;
};

const cache = new Map<string, CachedResult>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 100;

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(a|an|the|is|was|are|were|do|does|did|has|have|had|will|would|can|could|shall|should|may|might|to|for|of|in|on|at|by|with|from|and|or|but|not|what|who|why|how|when|where|which)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function getCached(query: string): CachedResult | null {
  const key = normalizeQuery(query);
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
    cache.delete(key);
    return null;
  }
  console.log(`[CACHE] Hit for "${query.slice(0, 60)}..."`);
  return entry;
}

export function setCache(
  query: string,
  sources: { url: string; content?: string }[],
  content: string,
): void {
  const key = normalizeQuery(query);
  if (!key) return;
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.entries().next().value;
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { sources, content, timestamp: Date.now() });
  console.log(`[CACHE] Stored for "${query.slice(0, 60)}..." (${sources.length} sources)`);
}

export function clearCache(): void {
  cache.clear();
  console.log("[CACHE] Cleared");
}

/**
 * Seed the cache with historical search data.
 * Called at startup to pre-populate from recent DB messages.
 */
export function seedCacheFromHistory(
  entries: { query: string; sources: { url: string; content?: string }[]; content: string }[],
): number {
  let count = 0;
  for (const entry of entries) {
    const key = normalizeQuery(entry.query);
    if (!key) continue;
    if (cache.has(key)) continue;
    if (cache.size >= MAX_ENTRIES) break;
    cache.set(key, { sources: entry.sources, content: entry.content, timestamp: Date.now() });
    count++;
  }
  if (count > 0) console.log(`[CACHE] Seeded ${count} entries from history`);
  return count;
}
