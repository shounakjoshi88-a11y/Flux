-- Run after `npx prisma migrate dev --name add_document_chunk`
-- This adds the generated tsvector column and HNSW index that Prisma can't model directly.

ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;

CREATE INDEX IF NOT EXISTS "DocumentChunk_searchVector_idx"
  ON "DocumentChunk" USING GIN ("searchVector");

-- HNSW index for fast approximate nearest-neighbor search on the embedding column.
-- IVFFlat would require a training step; HNSW does not and gives better recall.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
  ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
