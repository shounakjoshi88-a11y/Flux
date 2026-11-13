/**
 * News routes.
 *
 * GET /news serves a merged, deduplicated feed from Hacker News and The Verge,
 * which is what the live product serves. The richer category-based fetchers
 * live in services/news/categories.ts and are not currently reachable from any
 * route; see TRACKER.md.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { fetchHackerNews, fetchRSSCached } from '../../services/news/feed';

export function createNewsRouter(): Router {
    const router = Router();

    router.get('/news', middleware, async (req, res) => {
        try {
            const hn = await fetchHackerNews(12);
            const verge = await fetchRSSCached('https://www.theverge.com/rss/index.xml', 'The Verge', 8);
            const all = [...hn, ...verge].sort(
                (a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime(),
            );
            return res.json({ news: all });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}
