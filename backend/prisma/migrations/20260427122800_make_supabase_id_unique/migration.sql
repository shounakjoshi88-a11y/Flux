-- Add unique constraint for Supabase identity mapping
CREATE UNIQUE INDEX "User_supabaseId_key" ON "User"("supabaseId");
