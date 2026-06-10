-- Standard indexes for immediate application
CREATE INDEX IF NOT EXISTS "Conversation_userId_idx" ON "Conversation" ("userId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message" ("conversationId", "createdAt" DESC);

-- Partial indexes — these are the "Secret Sauce" for Artifacts speed
CREATE INDEX IF NOT EXISTS "Message_fileAttachment_partial_idx"
ON "Message" ("conversationId", "createdAt" DESC)
WHERE "fileAttachment" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Message_generatedFiles_partial_idx"
ON "Message" ("conversationId", "createdAt" DESC)
WHERE "generatedFiles" IS NOT NULL;

-- Verify results
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE tablename IN ('Conversation', 'Message')
ORDER BY tablename, indexname;
