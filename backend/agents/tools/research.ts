/**
 * Reading tools: read_url and retrieve_doc_chunks.
 *
 * read_url fetches a URL and turns it into text (HTML stripped, PDF and DOCX
 * parsed). Large documents are chunked into the document store so
 * retrieve_doc_chunks can search them later.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { extractDocxText, extractPdf } from '../../services/pdf/extract';
import { processLargeDocument } from '../../services/documents/chunks';
import { retrieveDocChunks } from '../../lib/hybrid-retrieval';
import { checkSsrFree } from '../../services/net/ssrf';
import { shouldBlockFurtherTools } from './context';
import type { ToolContext } from './context';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_PLAIN_TEXT = 50_000;

export function createResearchTools(ctx: ToolContext) {
    const { writer, state, uid } = ctx;

    return {
        read_url: (tool as any)({
            description:
                'Fetch and extract readable text content from a URL - supports web pages (HTML, plain text, JSON), PDF documents, and DOCX files. ' +
                'Use this to read the FULL content from any URL the user provides or that appears in search results. ' +
                'Essential for syllabus PDFs, documentation pages, articles, and any link where snippets alone miss critical data ' +
                '(like course codes in PDF tables, schema tables, nested lists, or DOCX documents). ' +
                'PDFs are parsed with table-aware extraction that preserves row/column structure. DOCX files are parsed to plain text.',
            inputSchema: z.object({
                url: z.string().describe('The full URL to fetch (must start with http:// or https://)'),
            }),
            execute: async ({ url }: any) => {
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using accumulated search results. Do NOT call read_url or any other tool.';
                }
                if (!url || typeof url !== 'string') return 'No URL provided.';
                const trimmed = url.trim();
                if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                    return 'Invalid URL. Must start with http:// or https://';
                }
                const safe = await checkSsrFree(trimmed);
                if (!safe) return 'This URL cannot be accessed - it points to a private or internal network address.';

                writer.status('reading', `Fetching content from ${trimmed}`, { url: trimmed, phase: 'fetching' }, state.thoughtProcess);
                let pageTitle = '';
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                    const resp = await fetch(trimmed, {
                        signal: controller.signal,
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FluxBot/1.0; +https://flux.ai/bot)' },
                    });
                    clearTimeout(timeoutId);
                    if (!resp.ok) {
                        if (resp.status === 404) { writer.status('reading', `Not found: ${trimmed}`, { url: trimmed, phase: 'error' }, state.thoughtProcess); return `The URL "${trimmed}" returned 404 Not Found.`; }
                        writer.status('reading', `Fetch failed (${resp.status})`, { url: trimmed, phase: 'error' }, state.thoughtProcess);
                        return `Failed to fetch "${trimmed}" - HTTP ${resp.status} ${resp.statusText}`;
                    }
                    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
                    const rawBuf = Buffer.from(await resp.arrayBuffer());
                    const isPdf = contentType.includes('pdf') || /\.pdf($|\?)/i.test(trimmed);

                    let extracted = '';
                    const isDocx = contentType.includes('wordprocessingml') || /\.docx($|\?)/i.test(trimmed);
                    if (isPdf) {
                        writer.status(
                            'reading',
                            `Parsing PDF (${(rawBuf.length / 1024).toFixed(0)} KB)`,
                            undefined,
                            state.thoughtProcess,
                        );
                        const pdfResult = await extractPdf(rawBuf);
                        extracted = pdfResult.markdown || pdfResult.text || '';
                        if (pdfResult.token_count >= 4000 && uid) {
                            await processLargeDocument(pdfResult, uid, trimmed, 'read_url', trimmed);
                            extracted = `[PDF DOCUMENT: ${trimmed}]\n${pdfResult.metadata.pages} pages, ${pdfResult.metadata.ocr_pages > 0 ? `${pdfResult.metadata.ocr_pages} OCR pages, ` : ''}${pdfResult.metadata.has_images ? 'contains embedded images, ' : ''}${(pdfResult.token_count * 4 / 1024).toFixed(0)} KB total.\n\nThe document is large and has been chunked into searchable sections. Use retrieve_doc_chunks(query) to find relevant content, then answer based on the retrieved sections.\n\nFirst section preview:\n${(pdfResult.pages?.[0]?.text ?? pdfResult.markdown ?? '').slice(0, 2000)}`;
                        }
                    } else if (isDocx) {
                        writer.status(
                            'reading',
                            `Parsing DOCX (${(rawBuf.length / 1024).toFixed(0)} KB)`,
                            undefined,
                            state.thoughtProcess,
                        );
                        extracted = await extractDocxText(rawBuf);
                    } else {
                        const rawHtml = rawBuf.toString('utf-8');
                        // Pull the <title> before stripping — the UI shows it as
                        // "Fetched: <title>" on the completed row.
                        const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                        pageTitle = (titleMatch?.[1] ?? '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/&nbsp;/g, ' ')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 140);
                        let text = rawHtml
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
                            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
                            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/&nbsp;/g, ' ')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                            .replace(/\s+/g, ' ')
                            .trim();
                        extracted = text.slice(0, MAX_PLAIN_TEXT);
                    }

                    if (!extracted.replace(/\s/g, '').length) {
                        writer.status('reading', 'No readable text found', { url: trimmed, phase: 'error' }, state.thoughtProcess);
                        return `The URL "${trimmed}" returned content but no extractable text was found.`;
                    }

                    // Completed — emit the title so the UI renders
                    // "Fetched: <title>" instead of the eternal "Fetching".
                    // Only a real page <title> (or a PDF/DOCX filename) counts —
                    // no host+path pseudo-title; the UI shows the clean URL once.
                    const urlObj = (() => { try { return new URL(trimmed); } catch { return null; } })();
                    const seg = urlObj?.pathname.split('/').filter(Boolean).pop() ?? '';
                    const isFileish = /\.(pdf|docx?|txt|csv|json|md|html?|xlsx?|pptx?|zip)$/i.test(seg);
                    const finalTitle = pageTitle || (isFileish ? seg : '');
                    writer.status(
                        'reading',
                        'Fetched',
                        { url: trimmed, ...(finalTitle ? { title: finalTitle } : {}), kb: Math.round(rawBuf.length / 1024), phase: 'fetched' },
                        state.thoughtProcess,
                    );
                    return `[CONTENT FROM ${trimmed}]\n${extracted}\n\n---\nUse this content to answer the user. It came directly from the URL, not from a search snippet.`;
                } catch (e: any) {
                    writer.status('reading', 'Fetch failed', { url: trimmed, phase: 'error' }, state.thoughtProcess);
                    if (e.name === 'AbortError') {
                        return `Request to "${trimmed}" timed out. The site may be slow or unreachable.`;
                    }
                    return `Failed to fetch "${trimmed}": ${e.message}`;
                }
            },
        }),

        retrieve_doc_chunks: (tool as any)({
            description:
                "Search a previously uploaded or fetched document for sections relevant to the user's question. " +
                'Use this when the user asks about a large document that was chunked into sections. ' +
                'Provide a specific query related to what you need to find in the document. ' +
                'Returns the most relevant text sections with their headings.',
            inputSchema: z.object({
                query: z.string().describe('What to search for in the document - be specific, like a search engine query'),
                documentName: z.string().optional().describe('Optional: restrict search to a specific document name'),
                topK: z.number().optional().describe('Number of sections to return (default 5, max 10)'),
            }),
            execute: async ({ query, documentName, topK }: { query: string; documentName?: string; topK?: number }) => {
                if (!uid) return 'No user session - cannot search documents.';
                if (!query || typeof query !== 'string') return 'No query provided.';
                const results = await retrieveDocChunks(query, uid, documentName, Math.min(topK ?? 5, 10));
                if (results.length === 0) return 'No matching sections found in the document. Try a different query.';
                return results
                    .map((r, i) => `[Section ${i + 1}]${r.heading ? ` (${r.heading})` : ''}\n${r.text}`)
                    .join('\n\n---\n\n');
            },
        }),
    };
}
