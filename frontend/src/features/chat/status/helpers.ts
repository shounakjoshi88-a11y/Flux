/**
 * Small helpers shared by the status families.
 */

/**
 * Hostname for a source URL, without the `www.` prefix.
 *
 * Falls back to the raw URL (or "unknown") when the URL cannot be parsed.
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "unknown";
  }
}
