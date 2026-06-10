-- AlterTable
ALTER TABLE "Message" ADD COLUMN "generatedFiles" JSONB;

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt" DESC);
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- Partial Indexes
CREATE INDEX "Message_fileAttachment_partial_idx" ON "Message"("conversationId", "createdAt" DESC) WHERE ("fileAttachment" IS NOT NULL);
CREATE INDEX "Message_generatedFiles_partial_idx" ON "Message"("conversationId", "createdAt" DESC) WHERE ("generatedFiles" IS NOT NULL);
