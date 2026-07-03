-- Run these directly on your PostgreSQL database.
-- CONCURRENTLY means no table lock — safe on a live production database.
-- Run one statement at a time if your DB client requires it.

-- 1. Conversation.userId — fixes full scan when finding a user's conversations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_userId_idx"
ON "Conversation" ("userId");

-- 2. Message(conversationId, createdAt DESC) — covers the JOIN + ORDER BY together
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_conversationId_createdAt_idx"
ON "Message" ("conversationId", "createdAt" DESC);

-- 3. Partial index — only messages that have uploaded file attachments
--    Much smaller than a full index; PostgreSQL can use this for the OR filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_fileAttachment_partial_idx"
ON "Message" ("conversationId", "createdAt" DESC)
WHERE "fileAttachment" IS NOT NULL;

-- 4. Partial index — only messages that have AI-generated files
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_generatedFiles_partial_idx"
ON "Message" ("conversationId", "createdAt" DESC)
WHERE "generatedFiles" IS NOT NULL;

-- Verify: show all indexes on these two tables
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE tablename IN ('Conversation', 'Message')
ORDER BY tablename, indexname;
