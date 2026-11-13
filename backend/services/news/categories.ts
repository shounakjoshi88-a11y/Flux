/**
 * Curated news sources per category, plus a query-to-category classifier.
 *
 * NOTE: nothing in the current codebase calls these - the live GET /news
 * handler uses a fixed Hacker News + The Verge list. They are kept here so the
 * richer multi-source view can be wired back up if the product wants it; see
 * TRACKER.md, "duplicate GET /news".
 */
import { fetchRSSCached, fetchHackerNews } from './feed';

const BBC = 'https://feeds.bbci.co.uk/news';
const NPR = 'https://feeds.npr.org';

export type NewsFetcher = () => Promise<import('./feed').NewsItemType[]>;

export const CATEGORY_FETCHERS: Record<string, NewsFetcher[]> = {
    all: [
        () => fetchRSSCached(`${BBC}/rss.xml`, 'BBC News', 15),
        () => fetchHackerNews(12),
        () => fetchRSSCached(`${NPR}/1001/rss.xml`, 'NPR', 10),
        () => fetchRSSCached('https://feeds.reuters.com/reuters/topNews', 'Reuters', 10),
        () => fetchRSSCached('https://rss.cnn.com/rss/edition.rss', 'CNN', 10),
    ],
    world: [
        () => fetchRSSCached(`${BBC}/world/rss.xml`, 'BBC World', 15),
        () => fetchRSSCached('https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera', 12),
        () => fetchRSSCached('https://feeds.reuters.com/Reuters/worldNews', 'Reuters World', 10),
    ],
    tech: [
        () => fetchHackerNews(20),
        () => fetchRSSCached(`${BBC}/technology/rss.xml`, 'BBC Tech', 10),
        () => fetchRSSCached('https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica', 10),
        () => fetchRSSCached('https://www.wired.com/feed/rss', 'Wired', 8),
    ],
    business: [
        () => fetchRSSCached(`${BBC}/business/rss.xml`, 'BBC Business', 15),
        () => fetchRSSCached(`${NPR}/1006/rss.xml`, 'NPR Economy', 10),
        () => fetchRSSCached('https://feeds.reuters.com/reuters/businessNews', 'Reuters Business', 10),
    ],
    science: [
        () => fetchRSSCached(`${BBC}/science_and_environment/rss.xml`, 'BBC Science', 15),
        () => fetchRSSCached('https://www.sciencedaily.com/rss/all.xml', 'ScienceDaily', 10),
        () => fetchRSSCached('https://www.nasa.gov/rss/dyn/breaking_news.rss', 'NASA', 8),
    ],
    politics: [
        () => fetchRSSCached(`${BBC}/politics/rss.xml`, 'BBC Politics', 15),
        () => fetchRSSCached(`${NPR}/1014/rss.xml`, 'NPR Politics', 10),
        () => fetchRSSCached('https://feeds.reuters.com/Reuters/PoliticsNews', 'Reuters Politics', 10),
    ],
};

export function detectCategoryKey(query: string): string {
    const q = (query || '').toLowerCase();
    if (!q || /latest.*breaking|breaking.*news|top.*news/.test(q)) return 'all';
    if (/tech|technology|ai|software|digital|cyber|hack/.test(q)) return 'tech';
    if (/business|economy|finance|market|trade|stock/.test(q)) return 'business';
    if (/science|research|discovery|space|climate|biology/.test(q)) return 'science';
    if (/politic|government|election|policy|parliament|senate/.test(q)) return 'politics';
    if (/world|international|global|foreign/.test(q)) return 'world';
    return 'all';
}
