/**
 * URL helpers.
 *
 * Small, dependency-free functions for turning a URL into something a human
 * can read: the domain, or a title guessed from the path.
 */

/** The hostname without a leading `www.`. Falls back to the input. */
export function getDomain(url: string): string {
    try {
        const { hostname } = new URL(url);
        return hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/**
 * Guess a readable title from a URL.
 *
 * Uses the last meaningful path segment; if that is too short to be useful,
 * falls back to the domain name with its first letter capitalised.
 */
export function getUrlTitle(url: string): string {
    try {
        const { pathname, hostname } = new URL(url);
        const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
        // Take the last meaningful path segment (file name or last folder).
        let candidate = segments.pop() || '';
        // Remove file extensions.
        candidate = candidate.replace(/\.(html?|php|asp|aspx|jsp|shtml)$/i, '');
        // Decode URL encoding.
        candidate = decodeURIComponent(candidate);
        // Replace hyphens/underscores with spaces and capitalise words.
        candidate = candidate.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (candidate.length > 4) {
            return candidate.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        // If the path gave nothing useful, use the hostname.
        const host = hostname.replace(/^www\./, '');
        return host.split('.').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } catch {
        return url;
    }
}
