import { prisma } from "../db/prisma";
import { getEmbedding } from "../local-embedder";

export interface RankedResult {
  id: string;
  text: string;
  heading: string;
  score: number;
}

interface RawVectorResult {
  id: string;
  text: string;
  heading: string;
  score: number;
}

interface RawTextResult {
  id: string;
  text: string;
  heading: string;
  score: number;
}

export async function retrieveDocChunks(
  query: string,
  userId: string,
  documentName?: string,
  topK = 5,
): Promise<RankedResult[]> {
  const embedding = await getEmbedding(query);

  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(embedding, userId, documentName, topK),
    fullTextSearch(query, userId, documentName, topK),
  ]);

  return reciprocalRankFusion(vectorResults, textResults, topK);
}

async function vectorSearch(
  embedding: number[],
  userId: string,
  documentName?: string,
  topK = 5,
): Promise<RankedResult[]> {
  const embeddingStr = `[${embedding.join(",")}]`;
  const docFilter = documentName
    ? `AND "documentName" = ${escLiteral(documentName)}`
    : "";

  const results = await prisma.$queryRawUnsafe<RawVectorResult[]>(
    `SELECT id, text, heading, 1 - (embedding <=> $1::vector) AS score
     FROM "DocumentChunk"
     WHERE "userId" = $2 ${docFilter}
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    embeddingStr,
    userId,
    topK * 4,
  );

  return results.map((r) => ({ ...r, score: Number(r.score) }));
}

async function fullTextSearch(
  query: string,
  userId: string,
  documentName?: string,
  topK = 5,
): Promise<RankedResult[]> {
  const tsQuery = toTsQuery(query);
  if (!tsQuery) return [];

  const docFilter = documentName
    ? `AND "documentName" = ${escLiteral(documentName)}`
    : "";

  const results = await prisma.$queryRawUnsafe<RawTextResult[]>(
    `SELECT id, text, heading, ts_rank("searchVector", to_tsquery('english', $1::text)) AS score
     FROM "DocumentChunk"
     WHERE "userId" = $2 ${docFilter}
       AND "searchVector" @@ to_tsquery('english', $1::text)
     ORDER BY score DESC
     LIMIT $3`,
    tsQuery,
    userId,
    topK * 4,
  );

  return results.map((r) => ({ ...r, score: Number(r.score) }));
}

function reciprocalRankFusion(
  listA: RankedResult[],
  listB: RankedResult[],
  topK: number,
  k = 60,
): RankedResult[] {
  const scores = new Map<string, number>();
  const byId = new Map<string, RankedResult>();

  for (const [idx, item] of listA.entries()) {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + idx + 1));
    byId.set(item.id, item);
  }
  for (const [idx, item] of listB.entries()) {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + idx + 1));
    byId.set(item.id, item);
  }

  const merged = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);

  return merged.map(([id]) => byId.get(id)!).filter(Boolean);
}

function toTsQuery(raw: string): string {
  return raw
    .replace(/[&|!:()*'"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");
}

function escLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
