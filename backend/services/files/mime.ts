/**
 * MIME sniffing by magic bytes.
 *
 * Attachment payloads arrive as base64 without a reliable content type, so the
 * declared type is checked against the first bytes of the decoded data.
 */

const MAGIC_BYTES: [RegExp, string][] = [
    [/^\/9j[0-9A-Za-z]/, 'image/jpeg'],
    [/^iVBORw0KGgo/, 'image/png'],
    [/^R0lGOD/, 'image/gif'],
    [/^UklGR/, 'image/webp'],
    [/^J0lEQVQ/, 'image/avif'],
    [/^Qk0/, 'image/bmp'],
    [/^PHN2Zy/, 'image/svg+xml'],
    [/^JVBERi0/, 'application/pdf'],
    [/^UEsDBBQ/, 'application/zip'],
    [/^UEsDBBAB/, 'application/vnd.openxmlformats-officedocument'],
    [/^UEsDBAo/, 'application/x-tar'],
];

/** Returns the sniffed MIME type, or null when the signature is unknown. */
export function detectMimeFromBase64(b64: string): string | null {
    const raw = b64.startsWith('data:') ? b64.split(',')[1] || '' : b64;
    const signature = raw.slice(0, 10);
    for (const [pattern, mime] of MAGIC_BYTES) {
        if (pattern.test(signature)) return mime;
    }
    return null;
}
