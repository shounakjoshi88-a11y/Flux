/**
 * Article reading routes: search the news, summarise an article, and proxy a
 * page so it can be embedded in the app.
 *
 * All of these fetch third-party content, so every URL goes through the SSRF
 * guard first.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { checkSsrFree } from '../../services/net/ssrf';
import { tavilyClient } from '../../services/search/tavily';
import { getDomain } from '../../http/util/url';
import { nim } from '../../nim-client';
import { streamText } from 'ai';
import { writeSafeSSE } from '../../http/sse/writers';
import type { NewsItemType } from '../../services/news/feed';

export function createArticlesRouter(): Router {
    const router = Router();

    router.get('/news/search', middleware, async (req: any, res: any) => {
        const q = ((req.query.q as string) || '').trim();
        if (!q || q.length < 2) {
            return res.status(400).json({ error: 'query too short' });
        }
        console.log(`[NEWS SEARCH] query="${q}"`);

        try {
            const result = await tavilyClient.search(q, {
                searchDepth: 'basic',
                topic: 'news',
                days: 3,
                maxResults: 20,
                includeAnswer: false,
                includeRawContent: false,
            });

            const articles: NewsItemType[] = (result.results ?? []).map((r: any) => ({
                title: (r.title ?? '').slice(0, 200),
                url: r.url ?? '',
                content: (r.content ?? r.snippet ?? '').slice(0, 400),
                publishedDate: r.publishedDate ?? new Date().toISOString(),
                source: r.url ? getDomain(r.url) : 'Unknown',
            })).filter((a: NewsItemType) => a.title && a.url);

            console.log(`[NEWS SEARCH] "${q}" -> ${articles.length} results`);
            res.json({ news: articles });
        } catch (e: any) {
            console.error('[NEWS SEARCH] Error:', e?.message ?? e);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    router.post('/summarize', middleware, async (req: any, res: any) => {
        const { url, title, content } = req.body ?? {};
        if (!title && !content) {
            return res.status(400).json({ error: 'title or content required' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        console.log(`[SUMMARIZE] title="${String(title).slice(0, 60)}" url=${url ?? '-'}`);

        try {
            let fullContent = content || '';

            if (url) {
                try {
                    console.log(`[SUMMARIZE] Attempting content extraction for: ${url}`);
                    const extractResult = await tavilyClient.extract([url]);
                    const firstResult = extractResult?.results?.[0];
                    if (firstResult?.rawContent) {
                        fullContent = firstResult.rawContent;
                        console.log(`[SUMMARIZE] Successfully extracted ${fullContent.length} chars`);
                    }
                } catch (extractErr) {
                    console.warn('[SUMMARIZE] Tavily extraction failed, falling back to provided content.', extractErr);
                }
            }

            const system = `... (system prompt) ...`;

            const userMsg = [
                `Title: ${title}`,
                url ? `Source URL: ${url}` : '',
                '',
                'Full article text (use every detail you can find):',
                String(fullContent).slice(0, 15000),
            ]
                .filter(Boolean)
                .join('\n');

            const model = nim.chatModel('meta/llama-4-maverick-17b-128e-instruct');
            const result = streamText({
                model,
                system,
                messages: [{ role: 'user', content: userMsg }],
                maxOutputTokens: 1800,
                temperature: 0.2,
            } as any);

            let charsSent = 0;
            for await (const chunk of result.textStream) {
                if (res.writableEnded) break;
                writeSafeSSE(res, chunk);
                charsSent += chunk.length;
                if (typeof (res as any).flush === 'function') (res as any).flush();
            }

            console.log(`[SUMMARIZE] done - ${charsSent} chars streamed`);
            if (!res.writableEnded) {
                res.write('data: [DONE]\n\n');
                res.end();
            }
        } catch (e: any) {
            console.error('[SUMMARIZE] Error:', e?.message ?? e);
            if (!res.writableEnded) {
                writeSafeSSE(res, '\n[Summary unavailable - please read the full article]');
                res.write('data: [DONE]\n\n');
                res.end();
            }
        }
    });
    router.get('/proxy', middleware, async (req: any, res: any) => {
        const rawUrl = ((req.query.url as string) ?? '').trim();
        if (!rawUrl) return res.status(400).json({ error: 'url required' });

        let parsed: URL;
        try {
            parsed = new URL(rawUrl);
        } catch {
            return res.status(400).json({ error: 'invalid url' });
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(400).json({ error: 'invalid protocol' });
        }

        const safe = await checkSsrFree(rawUrl);
        if (!safe) return res.status(403).json({ error: 'access to private/internal network is not allowed' });

        console.log(`[PROXY] ${parsed.hostname}${parsed.pathname.slice(0, 80)}`);

        try {
            const upstream = await fetch(rawUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity',
                    'Cache-Control': 'no-cache',
                },
                redirect: 'follow',
            });

            const contentType = upstream.headers.get('content-type') ?? 'text/html; charset=utf-8';

            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
                const buf = await upstream.arrayBuffer();
                res.setHeader('Content-Type', contentType);
                res.removeHeader('X-Frame-Options');
                res.removeHeader('Content-Security-Policy');
                res.setHeader('Content-Security-Policy', 'frame-ancestors *');
                return res.status(upstream.status).send(Buffer.from(buf));
            }

            let html = await upstream.text();
            const base = `${parsed.protocol}//${parsed.host}`;

            html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
            html = html.replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

            const baseTag =
                `<base href="${base}/" target="_blank">` +
                `<style>` +
                `*{max-width:100%!important;box-sizing:border-box!important}` +
                `img,video{height:auto!important}` +
                `body{padding:16px!important;font-family:system-ui,sans-serif}` +
                `[class*="cookie"],[id*="cookie"],[class*="consent"],[id*="consent"],` +
                `[class*="gdpr"],[id*="gdpr"],[class*="paywall"],[class*="popup"],[class*="modal"]{` +
                `display:none!important}` +
                `</style>`;

            if (/<head[\s>]/i.test(html)) {
                html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
            } else {
                baseTag + html;
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'no-store');
            res.removeHeader('X-Frame-Options');
            res.removeHeader('Content-Security-Policy');
            res.removeHeader('Content-Security-Policy-Report-Only');
            res.setHeader('Content-Security-Policy', 'frame-ancestors *');

            console.log(`[PROXY] OK ${upstream.status} ${parsed.hostname}`);
            return res.status(200).send(html);
        } catch (e: any) {
            console.error('[PROXY] fetch error:', e?.message ?? e);
            const errorHtml = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:32px;color:#888;text-align:center">
            <p style="font-size:14px">Unable to load article preview.</p>
            <a href="${rawUrl}" target="_blank" rel="noopener noreferrer"
               style="color:#C4502A;font-size:13px">Open in new tab →</a>
        </body></html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.removeHeader('X-Frame-Options');
            res.setHeader('Content-Security-Policy', 'frame-ancestors *');
            return res.status(200).send(errorHtml);
        }
    });

    router.get('/preview', middleware, async (req: any, res: any) => {
        const rawUrl = ((req.query.url as string) ?? '').trim();
        if (!rawUrl) return res.status(400).json({ error: 'url required' });
        let parsed: URL;
        try {
            parsed = new URL(rawUrl);
        } catch {
            return res.status(400).json({ error: 'invalid url' });
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'invalid protocol' });
        const safe = await checkSsrFree(rawUrl);
        if (!safe) return res.status(403).json({ error: 'access to private/internal network is not allowed' });
        try {
            const upstream = await fetch(rawUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(5000),
            });
            const html = await upstream.text();
            const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || parsed.hostname.replace('www.', '');

            // Strip tags and extract first meaningful paragraph
            const body = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const sentences = body.split(/[.!?]\s+/).filter((s) => s.trim().length > 40);
            const snippet = (sentences[0] || body.slice(0, 300)).slice(0, 300).trim() + (body.length > 300 ? '...' : '');

            res.json({ title, snippet, url: rawUrl });
        } catch (e: any) {
            console.error('[PREVIEW] error:', e?.message);
            res.json({ title: parsed.hostname.replace('www.', ''), snippet: '', url: rawUrl });
        }
    });

    return router;
}
