/**
 * SSRF guard for anything that fetches a user-supplied URL.
 *
 * Rejects literal private hostnames, then resolves the hostname and rejects it
 * if it points at a private address. DNS rebinding between this check and the
 * actual fetch is still possible; the correct long-term fix is to pin the
 * resolved address and connect to it, which belongs with the HTTP client, not
 * here.
 */
import * as dns from 'dns';

const PRIVATE_IP_PATTERNS = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
];

export function isPrivateHostname(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower === 'localhost.localdomain' || lower === '0.0.0.0') return true;
    return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(lower));
}

/** True when the URL is safe to fetch: public scheme, public host, public address. */
export async function checkSsrFree(urlStr: string): Promise<boolean> {
    try {
        const parsed = new URL(urlStr);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        const hostname = parsed.hostname;
        if (isPrivateHostname(hostname)) return false;
        const { address } = await dns.promises.lookup(hostname, { family: 4 }).catch(() => ({ address: '' }));
        if (address && isPrivateHostname(address)) return false;
        return true;
    } catch {
        return false;
    }
}
