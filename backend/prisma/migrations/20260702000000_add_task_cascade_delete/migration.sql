-- Drop existing FK on Task.conversationId (auto-named Task_conversationId_fkey)
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_conversationId_fkey";

-- AddForeignKey with ON DELETE CASCADE so deleting a conversation cleans up its tasks
ALTER TABLE "Task" ADD CONSTRAINT "Task_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
