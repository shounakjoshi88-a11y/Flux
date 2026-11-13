/**
 * Chunking a parsed document into searchable sections.
 *
 * A document that is too big to hold in the prompt is split by heading and
 * embedded, so `retrieve_doc_chunks` can pull back only the parts that matter.
 */
import * as crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { chunkByHeadings } from '../../lib/chunking';

/**
 * Store an extracted document as searchable chunks.
 * Documents that were already stored under the same content hash are skipped.
 */
export async function processLargeDocument(
    result: { markdown: string; pages: any[] },
    userId: string,
    docName: string,
    source: string,
    sourceUrl?: string,
): Promise<void> {
    const contentHash = crypto.createHash('sha256').update(Buffer.from(result.markdown)).digest('hex');
    const existing = await (prisma.documentChunk as any).findFirst({ where: { contentHash, userId } });
    if (existing) return;

    const chunks = chunkByHeadings(result.pages, docName);
    const embedded = await Promise.all(
        chunks.map(async (chunk) => {
            const { getEmbedding } = await import('../../local-embedder');
            const embedding = await getEmbedding(chunk.text);
            return { chunk, embedding };
        }),
    );

    await prisma.$transaction(
        embedded.map(({ chunk, embedding }) =>
            (prisma.documentChunk as any).create({
                data: {
                    userId,
                    documentName: docName,
                    source,
                    sourceUrl: sourceUrl ?? null,
                    chunkIndex: chunk.index,
                    heading: chunk.heading,
                    text: chunk.text,
                    embedding: embedding as any,
                    tokenCount: chunk.tokenCount,
                    contentHash,
                },
            }),
        ),
    );
}
