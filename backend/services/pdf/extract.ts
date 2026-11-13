/**
 * Document text extraction.
 *
 * PDFs go through a Python helper (pdf_parser.py, pymupdf4llm) because no
 * JavaScript PDF parser preserves tables and images well enough. DOCX files
 * are read with mammoth.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import type { PageData } from '../../lib/chunking';

export interface ExtractionResult {
    metadata: { pages: number; ocr_pages: number; is_scanned: boolean; has_images: boolean };
    markdown: string;
    text?: string;
    pages: PageData[];
    token_count: number;
}

const EMPTY_EXTRACTION: ExtractionResult = {
    metadata: { pages: 0, ocr_pages: 0, is_scanned: false, has_images: false },
    markdown: '',
    text: '',
    pages: [],
    token_count: 0,
};

/** The Python helper lives at the backend root, two levels up from here. */
const PDF_PARSER_PATH = path.join(import.meta.dir, '..', '..', 'pdf_parser.py');

const MAX_PDF_BYTES = 50 * 1024 * 1024;

async function findPython(): Promise<string> {
    const candidates = ['python3', 'python'];
    for (const cmd of candidates) {
        try {
            const proc = Bun.spawn([cmd, '--version'], { timeout: 5_000 });
            const exitCode = await proc.exited;
            if (exitCode === 0) return cmd;
        } catch {
            /* try next */
        }
    }
    console.warn('[PDF_PARSER] Python not found, falling back to python3');
    return 'python3';
}

/** Parse a PDF buffer into markdown, per-page text and metadata. */
export async function extractPdf(rawBuf: Buffer): Promise<ExtractionResult> {
    if (rawBuf.length > MAX_PDF_BYTES) return { ...EMPTY_EXTRACTION };

    const tmp = path.join(os.tmpdir(), `flux-pdf-${crypto.randomUUID()}.pdf`);
    try {
        await Bun.write(tmp, rawBuf);
        const pythonCmd = await findPython();
        const proc = Bun.spawn([pythonCmd, PDF_PARSER_PATH, tmp], { timeout: 60_000 });
        const [out, errOut] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ]);
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            console.error('[PDF_PARSER] Subprocess failed:', errOut.slice(0, 500));
            return {
                ...EMPTY_EXTRACTION,
                markdown: `[PDF parsing failed: ${errOut.replace(/\n/g, ' ').slice(0, 200)}]`,
            };
        }

        const result = JSON.parse(out);
        return {
            metadata: result.metadata,
            markdown: result.markdown || '',
            text: result.markdown || '',
            pages: result.pages || [],
            token_count: result.token_count || 0,
        };
    } catch (e: any) {
        console.error('[PDF_PARSER] Exception:', e.message);
        return { ...EMPTY_EXTRACTION, markdown: `[PDF parsing error: ${e.message}]` };
    } finally {
        try {
            await fs.promises.rm(tmp, { force: true });
        } catch {
            /* ignore */
        }
    }
}

/** Plain text out of a DOCX buffer. */
export async function extractDocxText(rawBuf: Buffer): Promise<string> {
    try {
        const mammoth = (await import('mammoth')) as any;
        const result = await mammoth.extractRawText({ buffer: rawBuf });
        const text = (result.value || '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 80000) || 'No extractable text found in DOCX.';
    } catch (e: any) {
        return `Failed to parse DOCX: ${e.message}`;
    }
}
