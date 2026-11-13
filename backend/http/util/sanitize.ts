/**
 * Input sanitisation for values that end up in queries, URLs or titles.
 *
 * These are deliberately small and boring: strip the characters that would
 * break a URL, a file name or a database column, and nothing else.
 */

/** Strip anything that is not a letter, digit, space or simple punctuation. */
export function sanitizeLocation(input: string): string {
    return input.replace(/[^a-zA-Z0-9\s,.'-]/g, '').slice(0, 100);
}

/** Strip markup and collapse whitespace, then clip to a column width. */
export function sanitizeTitle(title: string): string {
    return title.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
