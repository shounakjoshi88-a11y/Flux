/**
 * News feeds: Hacker News and RSS.
 *
 * Every source is fetched with a timeout and RSS responses are cached for a
 * couple of minutes, so a slow or broken feed degrades to an empty list rather
 * than holding up the request.
 */

import { getDomain } from '../../http/util/url';

export type NewsItemType = {
    title: string;
    url: string;
    content: string;
    publishedDate: string;
    source: string;
};

function withTimeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
}

const rssCache = new Map<string, { articles: NewsItemType[]; ts: number }>();
const RSS_CACHE_TTL = 2 * 60 * 1000;

/** Fetch an RSS feed, served from the in-process cache while it is fresh. */
export async function fetchRSSCached(url: string, sourceName: string, limit = 20): Promise<NewsItemType[]> {
    const cached = rssCache.get(url);
    if (cached && Date.now() - cached.ts < RSS_CACHE_TTL) {
        return cached.articles.slice(0, limit);
    }
    const articles = await fetchRSS(url, sourceName, limit);
    if (articles.length > 0) rssCache.set(url, { articles, ts: Date.now() });
    return articles;
}

/** Hacker News front page, expanded into article items. */
export async function fetchHackerNews(limit = 18): Promise<NewsItemType[]> {
    try {
        const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: withTimeout(8000) });
        if (!idsRes.ok) throw new Error(`HN list: ${idsRes.status}`);
        const ids = (await idsRes.json()) as number[];
        const items = await Promise.allSettled(
            ids
                .slice(0, limit)
                .map((id) =>
                    fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: withTimeout(5000) })
                        .then((r) => (r.ok ? r.json() : null))
                        .catch(() => null),
                ),
        );
        return items
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && !!(r.value as any)?.url)
            .map(({ value: v }) => ({
                title: v.title,
                url: v.url,
                content: `${(v.score ?? 0).toLocaleString()} points · ${v.descendants ?? 0} comments on Hacker News`,
                publishedDate: new Date((v.time ?? Date.now() / 1000) * 1000).toISOString(),
                source: getDomain(v.url),
            }));
    } catch (e) {
        console.warn('[NEWS] HackerNews fetch failed:', (e as Error).message);
        return [];
    }
}

export function decodeHTMLEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
}

export function stripHTML(str: string): string {
    return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractRSSField(xml: string, tag: string): string {
    const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
    const cm = xml.match(cdataRe);
    if (cm) return cm[1]!.trim();
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1]!.trim() : '';
}

export function parseRSSFeed(xml: string, defaultSource: string): NewsItemType[] {
    const results: NewsItemType[] = [];
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
        const item = m[1]!;
        const title = decodeHTMLEntities(stripHTML(extractRSSField(item, 'title'))).slice(0, 200);
        const link = extractRSSField(item, 'link') || extractRSSField(item, 'guid');
        const pubDate = extractRSSField(item, 'pubDate');
        const desc = decodeHTMLEntities(stripHTML(extractRSSField(item, 'description'))).slice(0, 400);
        const srcM = item.match(/<source[^>]+url="([^"]+)"/i);
        const source = srcM?.[1] ? getDomain(srcM[1]) : defaultSource;
        if (!title || !link) continue;
        try {
            results.push({
                title,
                url: link,
                content: desc || `From ${defaultSource}`,
                publishedDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                source,
            });
        } catch {
            /* skip malformed dates */
        }
    }
    return results;
}

export async function fetchRSS(url: string, sourceName: string, limit = 20): Promise<NewsItemType[]> {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FluxNews/2.0; +https://flux.app)',
                Accept: 'application/rss+xml, application/xml, text/xml, */*',
                'Cache-Control': 'no-cache',
            },
            signal: withTimeout(10000),
        });
        if (!res.ok) throw new Error(`${sourceName}: ${res.status}`);
        const xml = await res.text();
        const items = parseRSSFeed(xml, sourceName).slice(0, limit);
        console.log(`[NEWS] RSS ${sourceName} → ${items.length} items`);
        return items;
    } catch (e) {
        console.warn(`[NEWS] RSS ${sourceName} failed:`, (e as Error).message);
        return [];
    }
}
