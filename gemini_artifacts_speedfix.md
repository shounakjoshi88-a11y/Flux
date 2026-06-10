# Artifacts Modal — Full Speed Fix
## Instructions for Gemini CLI

You are making a series of targeted performance fixes to speed up the Artifacts modal
in a React + Express + Prisma + PostgreSQL app. Read every file listed before writing
a single line of code. Make all changes exactly as specified. Do not refactor anything
outside the listed changes.

---

## CONTEXT — Why it was slow

The Artifacts modal fetches a list of the user's uploaded/generated files. It was slow
for four distinct reasons that must all be fixed:

1. **No DB indexes** — PostgreSQL was doing full table scans on every request.
2. **Expensive backend query** — a cross-table JOIN plus a separate COUNT query ran
   sequentially. The COUNT alone can scan millions of rows.
3. **No frontend cache** — every modal open re-fetched from scratch, even if the data
   was 5 seconds old.
4. **Blank loading state** — a spinner on an empty modal felt much slower than it was.

---

## FILES TO MODIFY

```
prisma/schema.prisma          ← add DB indexes
backend/index.ts              ← fix the /artifacts endpoint query
src/components/ArtifactsModal.tsx  ← add module cache + skeleton loader
src/components/Sidebar.tsx    ← add hover-prefetch to Artifacts button
```

Create one new file:
```
prisma/add_artifacts_indexes.sql   ← raw SQL to apply indexes to the live DB
```

---

## CHANGE 1 — `prisma/schema.prisma`

Find the `Conversation` model and add `@@index([userId])`.
Find the `Message` model and add two indexes.

The final `Conversation` model must end with:
```prisma
model Conversation {
  id       String    @id @default(uuid())
  title    String?
  slug     String
  userId   String
  user     User      @relation(fields: [userId], references: [id])
  messages Message[]

  @@index([userId])
}
```

The final `Message` model must end with:
```prisma
model Message {
  id             Int          @id @default(autoincrement())
  content        String
  role           MessageRole
  conversationId String
  createdAt      DateTime     @default(now())
  sources        Json?
  fileAttachment Json?
  followUps      Json?
  thoughtProcess Json?
  generatedFiles Json?
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt(sort: Desc)])
  @@index([conversationId])
}
```

Do not change any other model.

---

## CHANGE 2 — Create `prisma/add_artifacts_indexes.sql`

Create this file with the exact content below. These SQL statements apply the same
indexes to the live database immediately, without waiting for a Prisma migration.
All use `CONCURRENTLY` so they never lock the table.

```sql
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
```

---

## CHANGE 3 — `backend/index.ts`

Find the `app.get("/artifacts", ...)` handler. Inside the try block, replace everything
from the start of the DB query down to (and including) the `const total = ...` line
with the two-step query below.

**Find this block** (it may look slightly different if previous edits were applied — match
by the structure, not character-for-character):

```typescript
// any version of the single-query approach that uses:
//   conversation: { userId: uid }
// as a Prisma where-filter (i.e. filtering via a JOIN)
```

**Replace the entire query section** (from the first `prisma.message.findMany` or
`prisma.message.count` call, down to and including the `const total = ...` line) with:

```typescript
        // Step 1: get this user's conversation IDs + titles in one indexed lookup.
        // Uses the Conversation_userId_idx index — very fast.
        const userConvs = await prisma.conversation.findMany({
            where: { userId: uid },
            select: { id: true, title: true },
        });
        const convIdSet = new Map(userConvs.map(c => [c.id, c.title ?? "Untitled"]));
        const conversationIds = [...convIdSet.keys()];

        if (conversationIds.length === 0) {
            return res.json({ artifacts: [], pagination: { page, limit, total: 0, hasMore: false } });
        }

        // Step 2: fetch artifact messages directly by conversationId.
        // Uses the partial indexes — only scans rows that actually have files.
        // Fetch limit+1 to detect hasMore without a separate COUNT query.
        const rawMessages = await prisma.message.findMany({
            where: {
                conversationId: { in: conversationIds },
                OR: [
                    { fileAttachment: { not: Prisma.AnyNull } },
                    { generatedFiles: { not: Prisma.AnyNull } }
                ]
            },
            select: {
                id: true,
                conversationId: true,
                createdAt: true,
                fileAttachment: true,
                generatedFiles: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            skip: skip
        });

        const hasMore = rawMessages.length > limit;
        const messages = hasMore ? rawMessages.slice(0, limit) : rawMessages;
        const total = skip + messages.length + (hasMore ? 1 : 0);
```

After that change, find every place in the same handler that reads
`msg.conversation?.title` and replace it with:
```typescript
convIdSet.get(msg.conversationId) || "Untitled"
```

Also find the `pagination` object in the `res.json(...)` call and make sure `hasMore`
is the variable directly (not a computed expression like `skip + messages.length < total`):
```typescript
        return res.json({
            artifacts,
            pagination: {
                page,
                limit,
                total,
                hasMore
            }
        });
```

---

## CHANGE 4 — `src/components/ArtifactsModal.tsx`

This file needs a module-level cache, a cached auth token helper, an exported prefetch
function, stale-while-revalidate on open, and skeleton cards while loading.

### 4a — Add cache + token helpers after the `const supabase = createClient()` line

Insert the following block immediately after `const supabase = createClient();`:

```typescript
// ─── Module-level cache (survives modal close/reopen and component remounts) ──
type ArtifactsCache = {
  artifacts: Artifact[];
  hasMore: boolean;
  page: number;
  ts: number;
};
let _cache: ArtifactsCache | null = null;
const CACHE_TTL_MS = 60_000; // 60 s

// Cached Supabase token — avoids calling getSession() on every fetch
let _tokenCache: { token: string; exp: number } | null = null;
async function getCachedToken(): Promise<string | null> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.exp > now + 5_000) return _tokenCache.token;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const exp = session.expires_at ? session.expires_at * 1000 : now + 3_600_000;
  _tokenCache = { token: session.access_token, exp };
  return session.access_token;
}

// Exported so Sidebar can kick off a background prefetch on hover
export async function prefetchArtifacts(backendUrl: string) {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return; // already fresh
  try {
    const token = await getCachedToken();
    if (!token) return;
    const res = await fetch(`${backendUrl}/artifacts?page=1&limit=24`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    _cache = {
      artifacts: data.artifacts || [],
      hasMore: data.pagination?.hasMore ?? false,
      page: 1,
      ts: Date.now(),
    };
  } catch { /* silently ignore */ }
}
```

Note: the `type Artifact` definition must remain BELOW this block.

### 4b — Initialize state from cache

Find the `useState` declarations at the top of the `ArtifactsModal` component function.
Replace them so they read from cache on first render:

```typescript
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => _cache?.artifacts ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(() => _cache?.page ?? 1);
  const [hasMore, setHasMore] = useState(() => _cache?.hasMore ?? false);
```

### 4c — Replace `fetchArtifacts` with the cached version

Find the `fetchArtifacts` useCallback and replace it entirely with:

```typescript
  const fetchArtifacts = useCallback(async (pageNum: number, isInitial = false, silent = false) => {
    if (!silent) {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
    }
    try {
      const token = await getCachedToken();
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/artifacts?page=${pageNum}&limit=24`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const newItems: Artifact[] = data.artifacts || [];
      const newHasMore = data.pagination?.hasMore ?? false;
      if (pageNum === 1) {
        _cache = { artifacts: newItems, hasMore: newHasMore, page: 1, ts: Date.now() };
      }
      setArtifacts(prev => isInitial ? newItems : [...prev, ...newItems]);
      setHasMore(newHasMore);
      setPage(pageNum);
    } catch (err) {
      console.error("Error fetching artifacts:", err);
    } finally {
      if (!silent) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);
```

### 4d — Replace the `isOpen` useEffect with stale-while-revalidate

Find the `useEffect` that watches `[isOpen, fetchArtifacts]` and replace it with:

```typescript
  useEffect(() => {
    if (isOpen) {
      const isFresh = _cache && Date.now() - _cache.ts < CACHE_TTL_MS;
      if (isFresh) {
        // Show cached data instantly, refresh silently in background
        setArtifacts(_cache!.artifacts);
        setHasMore(_cache!.hasMore);
        setPage(_cache!.page);
        fetchArtifacts(1, true, true); // silent = no loading spinner
      } else {
        fetchArtifacts(1, true); // cold open — show skeleton while loading
      }
      setTimeout(() => searchRef.current?.focus(), 150);
    } else {
      // Keep artifacts in state so next open is instant — only reset UI chrome
      setSearch("");
      setFilter("all");
    }
  }, [isOpen, fetchArtifacts]);
```

### 4e — Replace the `ensureBase64` getSession call

Find inside `ensureBase64`:
```typescript
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");
```

Replace with:
```typescript
    const token = await getCachedToken();
    if (!token) throw new Error("Not authenticated");
```

### 4f — Replace the loading spinner with skeleton cards

Find this block in the JSX:
```typescript
                {loading ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-48 gap-3">
                    <Loader2 className="size-6 text-foreground/20 animate-spin" />
                    <p className="text-xs text-foreground/30">Loading…</p>
                  </motion.div>
                ) : filteredArtifacts.length === 0 ? (
```

Replace with:
```typescript
                {loading && filteredArtifacts.length === 0 ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="flex flex-col bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3.5 gap-2.5 animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="size-7 rounded-lg bg-black/[0.06] dark:bg-white/[0.06]" />
                          <div className="w-10 h-3.5 rounded-full bg-black/[0.04] dark:bg-white/[0.04]" />
                        </div>
                        <div className="w-3/4 h-3 rounded bg-black/[0.06] dark:bg-white/[0.06]" />
                        <div className="w-full h-2.5 rounded bg-black/[0.04] dark:bg-white/[0.04]" />
                        <div className="flex items-center gap-1.5 mt-auto pt-1">
                          <div className="w-8 h-2.5 rounded bg-black/[0.03] dark:bg-white/[0.03]" />
                          <div className="ml-auto w-12 h-5 rounded-lg bg-black/[0.04] dark:bg-white/[0.04]" />
                          <div className="size-5 rounded-lg bg-black/[0.04] dark:bg-white/[0.04]" />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                ) : !loading && filteredArtifacts.length === 0 ? (
```

---

## CHANGE 5 — `src/components/Sidebar.tsx`

### 5a — Add `onArtifactsPrefetch` to `SidebarProps`

Find the `SidebarProps` type. Add the optional prop on the line immediately after
`onArtifactsOpen`:

```typescript
  onArtifactsOpen: () => void;
  onArtifactsPrefetch?: () => void;
```

### 5b — Destructure the new prop

Find the destructuring of `onArtifactsOpen` in the function signature and add the
new prop on the next line:

```typescript
  onArtifactsOpen,
  onArtifactsPrefetch,
```

### 5c — Wire `onMouseEnter` to the Artifacts button

Find the Artifacts `<button>` element. It currently looks like:

```typescript
            <button
              type="button"
              onClick={onArtifactsOpen}
              className="flex items-center w-full h-8 shrink-0 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-foreground/50 hover:text-foreground/90 transition-all"
              title="Artifacts"
            >
```

Add `onMouseEnter={onArtifactsPrefetch}` so it becomes:

```typescript
            <button
              type="button"
              onClick={onArtifactsOpen}
              onMouseEnter={onArtifactsPrefetch}
              className="flex items-center w-full h-8 shrink-0 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-foreground/50 hover:text-foreground/90 transition-all"
              title="Artifacts"
            >
```

---

## CHANGE 6 — Wire prefetch in the parent component

Find the file that renders `<Sidebar>` (likely `App.tsx`, `Layout.tsx`, or `page.tsx`).
Add the import and wire the new prop:

```typescript
import { prefetchArtifacts } from "@/components/ArtifactsModal";
```

Then on the `<Sidebar>` JSX element add:
```tsx
onArtifactsPrefetch={() => prefetchArtifacts(BACKEND_URL)}
```

Where `BACKEND_URL` is however the backend URL is imported/accessed in that file
(e.g. `import { BACKEND_URL } from "@/lib/config"`).

---

## VERIFICATION CHECKLIST

After making all changes, confirm:

- [ ] `prisma/schema.prisma` has `@@index([userId])` on `Conversation`
- [ ] `prisma/schema.prisma` has `@@index([conversationId, createdAt(sort: Desc)])` on `Message`
- [ ] `prisma/add_artifacts_indexes.sql` exists with 4 `CREATE INDEX CONCURRENTLY` statements
- [ ] `backend/index.ts` `/artifacts` handler does two separate `prisma.findMany` calls
      (conversations first, then messages with `conversationId: { in: ... }`)
- [ ] `backend/index.ts` has no remaining `prisma.message.count(...)` call in this handler
- [ ] `backend/index.ts` uses `convIdSet.get(msg.conversationId)` not `msg.conversation?.title`
- [ ] `ArtifactsModal.tsx` exports `prefetchArtifacts`
- [ ] `ArtifactsModal.tsx` state initialises from `_cache` (lazy initialisers)
- [ ] `ArtifactsModal.tsx` loading state shows skeleton grid, not spinner
- [ ] `ArtifactsModal.tsx` close handler does NOT call `setArtifacts([])`
- [ ] `Sidebar.tsx` `SidebarProps` includes `onArtifactsPrefetch?: () => void`
- [ ] `Sidebar.tsx` Artifacts button has `onMouseEnter={onArtifactsPrefetch}`
- [ ] Parent component passes `onArtifactsPrefetch` to `<Sidebar>`

---

## DEPLOYMENT ORDER

1. Apply changes to all TypeScript/TSX files and deploy the backend + frontend.
2. Run `prisma generate` then `prisma db push` (or `prisma migrate dev`) to apply
   schema index changes to the database.
3. **Alternatively** (faster for production): run the SQL in
   `prisma/add_artifacts_indexes.sql` directly against your PostgreSQL database.
   This is safe to run on a live database — all statements are `CONCURRENTLY`.
4. Done. The modal should now open with content in under 100 ms after the first load.
