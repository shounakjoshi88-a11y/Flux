# RLS Enable Guide — Flux

## Critical Context Before You Start

### Backend bypasses RLS
Flux's backend connects to PostgreSQL via **Prisma with a direct `DATABASE_URL`** (superuser/service-role connection). This connection **bypasses Row-Level Security entirely** — RLS only filters rows for connections using a limited database role (the `anon` or `authenticated` roles that Supabase's REST API uses).

**Why add RLS then?**
- Defense in depth against direct DB access
- Protects data if Supabase REST API auto-endpoints are accidentally exposed
- Standard security practice even when your app uses a privileged connection

### The critical `(select auth.uid())` mapping
Supabase's `(select auth.uid())` returns the **Supabase Auth UUID** (e.g., `a1b2c3d4-...`).

Your schema has **two IDs** on the `User` table:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `uuid` (PK) | Local Prisma UUID — **used in all foreign keys** |
| `supabaseId` | `text` (unique) | Supabase Auth UUID — **matches `(select auth.uid())`** |

> **Every policy drafted in our earlier review was wrong.** They compared `userId = (select auth.uid())`, but all foreign keys (`Conversation.userId`, `Memory.userId`, `WikiNode.userId`, `Task.userId`, `UserGoogleToken.userId`, `DocumentChunk.userId`) reference `User.id`, **not** `User.supabaseId`.
>
> The correct check: `userId IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)`

---

## Prerequisites

1. **Supabase project URL + service role key** — you need these to run SQL via the Supabase dashboard SQL editor or `psql`
2. **Your app running** — verify everything works *before* and *after* enabling RLS
3. **Back the DB up** — or at least note current row counts per table

---

## Execution Plan

Run these in order. Each section is a block of SQL you can paste into **Supabase Dashboard > SQL Editor**.

| Step | Table(s) | Risk if wrong |
|------|----------|---------------|
| 1 | `_prisma_migrations` | Prisma can't migrate (leave OFF) |
| 2 | `User` | You lock yourself out of your own profile |
| 3 | `Conversation` | Can't list/chat |
| 4 | `Message` | Can't read/send messages |
| 5 | `Memory` | Agent can't store/recall facts |
| 6 | `WikiNode` | Knowledge graph broken |
| 7 | `WikiEdge` | Graph edges broken |
| 8 | `Task` | Tasks can't be read/created |
| 9 | `TaskStep` | Task execution fails |
| 10 | `UserGoogleToken` | OAuth tokens inaccessible |
| 11 | `DocumentChunk` | RAG/document search broken |

---

## Step 0: `_prisma_migrations` — LEAVE OFF

This is Prisma's internal bookkeeping. RLS would break `prisma migrate`. **Do not enable RLS on this table.**

```sql
-- Verify: RLS should remain DISABLED
-- ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;  -- DO NOT RUN
```

---

## Step 1: `public."User"`

**Goal:** Users can only see/update their own User row.

**Enable RLS + policies in the same transaction to avoid lockout:**

```sql
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

-- SELECT: user can read their own row
CREATE POLICY "user_select_own"
ON public."User"
FOR SELECT
TO authenticated
USING ("supabaseId" = (select auth.uid())::text);

-- UPDATE: user can update their own row (name, email, provider)
CREATE POLICY "user_update_own"
ON public."User"
FOR UPDATE
TO authenticated
USING ("supabaseId" = (select auth.uid())::text)
WITH CHECK ("supabaseId" = (select auth.uid())::text);

-- Note: No INSERT or DELETE policies.
-- User rows are created by the middleware upsert in backend/middleware.ts
-- (which runs as service_role and bypasses RLS).
-- If you ever switch to direct Supabase inserts, add INSERT/DELETE policies.
```

---

## Step 2: `public."Conversation"`

**Goal:** Users can CRUD only their conversations.  
**FK:** `Conversation.userId` → `User.id` (not `supabaseId`)

```sql
ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_select_own"
ON public."Conversation"
FOR SELECT
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "conversation_insert_own"
ON public."Conversation"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "conversation_update_own"
ON public."Conversation"
FOR UPDATE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
)
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "conversation_delete_own"
ON public."Conversation"
FOR DELETE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);
```

---

## Step 3: `public."Message"`

**Goal:** Users can CRUD messages only for conversations they own.  
**FK chain:** `Message."conversationId"` → `Conversation.id` → `Conversation."userId"` → `User.id` → `User."supabaseId"` = `(select auth.uid())`

```sql
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_select_own_conversations"
ON public."Message"
FOR SELECT
TO authenticated
USING (
  "conversationId" IN (
    SELECT id FROM public."Conversation"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "message_insert_own_conversations"
ON public."Message"
FOR INSERT
TO authenticated
WITH CHECK (
  "conversationId" IN (
    SELECT id FROM public."Conversation"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "message_update_own_conversations"
ON public."Message"
FOR UPDATE
TO authenticated
USING (
  "conversationId" IN (
    SELECT id FROM public."Conversation"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
)
WITH CHECK (
  "conversationId" IN (
    SELECT id FROM public."Conversation"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "message_delete_own_conversations"
ON public."Message"
FOR DELETE
TO authenticated
USING (
  "conversationId" IN (
    SELECT id FROM public."Conversation"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);
```

---

## Step 4: `public."Memory"`

**Goal:** Users can CRUD only their own memory rows.  
**FK:** `Memory."userId"` → `User.id`

```sql
ALTER TABLE public."Memory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_select_own"
ON public."Memory"
FOR SELECT
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "memory_insert_own"
ON public."Memory"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "memory_update_own"
ON public."Memory"
FOR UPDATE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
)
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "memory_delete_own"
ON public."Memory"
FOR DELETE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);
```

---

## Step 5: `public."WikiNode"`

**Goal:** Users can CRUD only their own nodes.  
**FK:** `WikiNode."userId"` → `User.id`

```sql
ALTER TABLE public."WikiNode" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wikinode_select_own"
ON public."WikiNode"
FOR SELECT
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "wikinode_insert_own"
ON public."WikiNode"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "wikinode_update_own"
ON public."WikiNode"
FOR UPDATE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
)
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "wikinode_delete_own"
ON public."WikiNode"
FOR DELETE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);
```

---

## Step 6: `public."WikiEdge"`

**Goal:** Users can CRUD edges only where both the source and target nodes belong to them.  
**FK chain:** `WikiEdge."sourceId"`/`"targetId"` → `WikiNode.id` → `WikiNode."userId"` → `User.id`

```sql
ALTER TABLE public."WikiEdge" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wikipedia_edge_select_own_both_ends"
ON public."WikiEdge"
FOR SELECT
TO authenticated
USING (
  "sourceId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
  AND
  "targetId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "wikipedia_edge_insert_own_both_ends"
ON public."WikiEdge"
FOR INSERT
TO authenticated
WITH CHECK (
  "sourceId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
  AND
  "targetId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "wikipedia_edge_update_own_both_ends"
ON public."WikiEdge"
FOR UPDATE
TO authenticated
USING (
  "sourceId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
  AND
  "targetId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
)
WITH CHECK (
  "sourceId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
  AND
  "targetId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "wikipedia_edge_delete_own_both_ends"
ON public."WikiEdge"
FOR DELETE
TO authenticated
USING (
  "sourceId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
  AND
  "targetId" IN (
    SELECT id FROM public."WikiNode"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);
```

---

## Step 7: `public."Task"`

**Goal:** Users can CRUD only their own tasks.  
**FK:** `Task."userId"` → `User.id`

```sql
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_select_own"
ON public."Task"
FOR SELECT
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "task_insert_own"
ON public."Task"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "task_update_own"
ON public."Task"
FOR UPDATE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
)
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "task_delete_own"
ON public."Task"
FOR DELETE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);
```

---

## Step 8: `public."TaskStep"`

**Goal:** Users can CRUD only steps belonging to their tasks.  
**FK chain:** `TaskStep."taskId"` → `Task.id` → `Task."userId"` → `User.id`

```sql
ALTER TABLE public."TaskStep" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taskstep_select_own_tasks"
ON public."TaskStep"
FOR SELECT
TO authenticated
USING (
  "taskId" IN (
    SELECT id FROM public."Task"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "taskstep_insert_own_tasks"
ON public."TaskStep"
FOR INSERT
TO authenticated
WITH CHECK (
  "taskId" IN (
    SELECT id FROM public."Task"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "taskstep_update_own_tasks"
ON public."TaskStep"
FOR UPDATE
TO authenticated
USING (
  "taskId" IN (
    SELECT id FROM public."Task"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
)
WITH CHECK (
  "taskId" IN (
    SELECT id FROM public."Task"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);

CREATE POLICY "taskstep_delete_own_tasks"
ON public."TaskStep"
FOR DELETE
TO authenticated
USING (
  "taskId" IN (
    SELECT id FROM public."Task"
    WHERE "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
  )
);
```

---

## Step 9: `public."UserGoogleToken"`

**Goal:** Users can CRUD only their own OAuth tokens.  
**FK:** `UserGoogleToken."userId"` → `User.id`

```sql
ALTER TABLE public."UserGoogleToken" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_token_select_own"
ON public."UserGoogleToken"
FOR SELECT
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "google_token_insert_own"
ON public."UserGoogleToken"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "google_token_update_own"
ON public."UserGoogleToken"
FOR UPDATE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
)
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "google_token_delete_own"
ON public."UserGoogleToken"
FOR DELETE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);
```

---

## Step 10: `public."DocumentChunk"`

**Missing from the original draft** — this table exists in the Prisma schema and has a `userId` FK.

```sql
ALTER TABLE public."DocumentChunk" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentchunk_select_own"
ON public."DocumentChunk"
FOR SELECT
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "documentchunk_insert_own"
ON public."DocumentChunk"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "documentchunk_update_own"
ON public."DocumentChunk"
FOR UPDATE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
)
WITH CHECK (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);

CREATE POLICY "documentchunk_delete_own"
ON public."DocumentChunk"
FOR DELETE
TO authenticated
USING (
  "userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)
);
```

---

## Testing After Enabling

### 1. Quick smoke test (restart app first)
```bash
cd backend && bun index.ts     # In one terminal
cd frontend && bun dev         # In another
```
Sign in, send a message, view conversations, check memories. Everything should work because the **backend runs as service_role** and bypasses RLS.

### 2. Verify RLS is active (Supabase SQL Editor)
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
Every table (except `_prisma_migrations`) should show `rowsecurity = true`.

### 3. Verify a policy works (optional — real test)

**Supabase SQL Editor runs as a privileged role** — `auth.uid()` returns null there, so SQL Editor queries can't exercise RLS policies. Use one of these instead:

**Option A — Test from the app with a real session token:**
```bash
# 1. Sign in via the frontend
# 2. Open browser dev tools → Application → Local Storage → supabase.auth.token
# 3. Copy the access_token
# 4. Try to fetch another user's conversation directly (should return 403/empty):
curl -H "Authorization: Bearer <access_token>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  "https://<project>.supabase.co/rest/v1/Conversation?id=eq.<some-other-user-conversation-id>"
```

**Option B — Use Supabase Dashboard's JWT-impersonation SQL Editor (if available):**
Some Supabase projects support running SQL as `authenticated` with a user context. Look for a **"Run as"** dropdown in SQL Editor, select `authenticated`, then:
```sql
-- Should return exactly 1 row (your own User record)
SELECT id, email, name, "supabaseId"
FROM public."User"
WHERE "supabaseId" = (select auth.uid())::text;

-- Should return 0 rows (you don't own this)
SELECT * FROM public."User" WHERE id != (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text) LIMIT 1;
```

**Option C — Quick RLS-exercising service_role test (limited):**
Run this in SQL Editor (as service_role — exercises the SQL, not the policy):
```sql
-- Confirm per-user isolation logic is sound (same SQL the policy uses)
SELECT u.id, u.email, c.id as conversation_id
FROM public."User" u
JOIN public."Conversation" c ON c."userId" = u.id
WHERE u."supabaseId" = '<your-actual-supabase-uid>';

-- Test "other user has no access" — pick a different supabaseId
SELECT c.id
FROM public."Conversation" c
WHERE c."userId" IN (
  SELECT id FROM public."User" WHERE "supabaseId" = '<a-supabaseid-that-isnt-yours>'
);
-- Should return zero rows you don't own
```

---

## Rollback (if something breaks)

To remove RLS from all tables:
```sql
ALTER TABLE public."User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Conversation" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Memory" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."WikiNode" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."WikiEdge" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskStep" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserGoogleToken" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."DocumentChunk" DISABLE ROW LEVEL SECURITY;
```

To also drop all policies:
```sql
-- Replace 'tablename' with each table
DROP POLICY IF EXISTS "user_select_own" ON public."User";
DROP POLICY IF EXISTS "user_update_own" ON public."User";
-- ... repeat for all policy names above
```

---

## Summary of Changes from the Draft

| Issue | Draft version | Correct version |
|-------|--------------|-----------------|
| `(select auth.uid())` comparison | `userId = (select auth.uid())::text` (wrong — compares local UUID to auth UUID) | `"userId" IN (SELECT id FROM public."User" WHERE "supabaseId" = (select auth.uid())::text)` |
| `User` policy | Compared `User.id` to `(select auth.uid())` | Compared `User."supabaseId"` to `(select auth.uid())` directly |
| `UserGoogleToken_` name | Had trailing underscore | Table is `UserGoogleToken` (no underscore) |
| `DocumentChunk` | Missing entirely | Added with full policies |
| `_prisma_migrations` | Listed as "should NOT RLS" | Confirmed — leave OFF |
