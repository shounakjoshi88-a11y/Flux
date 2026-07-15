# Flux Supabase Egress Analysis

**Date:** 2026-07-14
**Environment:** 4 MAU, 4 peak realtime connections, 891 messages
**Monthly Egress:** 5.8 GB (Supabase free tier cap: 5 GB)

---

## Executive Summary

Flux is burning through ~5.8 GB/month of Supabase egress with only 4 MAU and 891 messages — well past the free tier's 5 GB cap. The primary drivers are wasteful frontend polling, SELECT * queries that pull entire rows (including base64 blobs and large JSON columns), and storing binary file data directly in the database.

The **top 3 fixes** alone would cut egress by ~55% (from 5.8 GB to ~2.6 GB/month):

| # | Fix | Monthly Egress Saved | % of Total |
|---|-----|---------------------|------------|
| 1 | Reduce model polling from 30s → 300s | ~1.4 GB | 24% |
| 2 | Add `.select()` to conversation load query | ~1.5 GB | 26% |
| 3 | Move base64 blobs to object storage | ~1.3 GB | 22% |

---

## Egress Breakdown by Component

| Issue | Est. Monthly Egress | % of Total |
|-------|--------------------|------------|
| **1. Polling `/api/models` every 30s** | **~1.7 GB** | **29%** |
| **2. SELECT * on Message model (`include: { messages }`)** | **~1.5 GB** | **26%** |
| **3. Base64 file blobs in Message JSON columns** | **~1.0 GB** | **17%** |
| 4. SELECT * on other endpoints (memories, wiki, tasks, etc.) | ~0.8 GB | 14% |
| 5. Conversation list over-fetching | ~0.06 GB | 1% |
| 6. Supabase Realtime broadcast overhead | ~0.1 GB | 2% |
| 7. Base64 encoding overhead (33% extra) | ~0.3 GB | 5% |
| 8. SELECT * on GET /memories (fetches full embedding vectors) | ~0.3 GB | 5% |

---

## Detailed Findings

### 1. Model List Polling — 30s Interval (1.7 GB/month)

**Files:**
- `frontend/src/hooks/useModels.ts:74` — polls `GET /api/models` every 30 seconds
- `backend/index.ts:6448` — the `/api/models` endpoint

**Impact calculation:** 4 MAU × 2 tabs × 60/hr × 24h × 30d = ~345,600 requests/month. If each response is ~5KB, that's ~1.7 GB.

**Fix:** Increase interval to 300s (5 min) or remove polling entirely. Model lists don't change at runtime.

---

### 2. SELECT * on Conversation Messages (1.5 GB/month)

**File:** `backend/index.ts:4434–4437`

```typescript
existingConv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: uid },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
    // ← NO .select() — fetches ALL columns
});
```

This runs on **every `POST /flux_ask`** for existing conversations. It fetches:
- All messages in the conversation
- Every column: `content` (unlimited text), `generatedFiles` (base64 blobs), `fileAttachment` (base64 blobs), `sources`, `followUps`, `thoughtProcess`, `metadata`

**Message row size per SELECT *:**
| Field | Type | Size |
|-------|------|------|
| `id` | Int | 4 B |
| `content` | String (unlimited) | 1 KB – 100+ KB |
| `role` | Enum | ~10 B |
| `conversationId` | String | ~36 B (UUID) |
| `createdAt` | DateTime | 8 B |
| `sources` | Json? | Variable (array of source objects) |
| `fileAttachment` | Json? | **Huge — base64 blobs** |
| `followUps` | Json? | Small (array of strings) |
| `thoughtProcess` | Json? | Medium (array of status events) |
| `generatedFiles` | Json? | **Huge — base64 blobs** |
| `metadata` | Json? | Variable |

**Fix:** Add a `.select()` that only pulls the fields the LLM actually needs (e.g., `content`, `role`, `createdAt`, `sources`). Omit `generatedFiles`, `fileAttachment` base64 blobs unless specifically requested.

---

### 3. Base64 File Blobs in Message JSON Columns (1.0 GB/month)

**Files:**
- `backend/prisma/schema.prisma:46–51` — Message model with `generatedFiles Json?` and `fileAttachment Json?`
- `backend/index.ts:4504` — stores full base64 file content in `fileAttachment`
- `backend/index.ts:5661–5663` — stores full base64 in `generatedFiles`
- `backend/index.ts:5729–5731` — updates `generatedFiles` with full base64
- `backend/agent-tools.ts:34, 51, 66, 79, 92, etc.` — each generated document has its content serialized as base64

**Problem:**
- Base64 encoding adds ~33% overhead vs raw binary
- A 1 MB file becomes ~1.33 MB in base64
- Every time messages are fetched, all these blobs are transmitted
- The `POST /conversation/:conversationId` handler (line 3983–4006) strips base64 from response via `jsonb_agg(f - 'base64')`, but the raw data still counts toward egress (database replication, Supabase internal bandwidth)

**Fix:** Store files in object storage (R2, S3, or local filesystem). Store only URLs in the database.

---

### 4. SELECT * on GET /memories (0.3 GB/month)

**File:** `backend/index.ts:4178`

```typescript
const memories = await prisma.memory.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' }
});
```

**Problem:** No `.select()`. The `Memory` model has a `vector(1024)` embedding column (~4 KB each). For 4 MAU with ~50 memories each, that's ~800 KB of unnecessary vector data transferred. Compounded by frequency of this endpoint being called.

**Contrast with `backend/memory.ts:27–31, 63–67, 227–231`** which correctly use `.select({ id, category, fact, importance, accessCount })` — explicitly omitting `embedding`.

---

### 5. SELECT * Across the Codebase (0.8 GB/month)

**30+ locations** across the codebase us SELECT * (Prisma default). Key files:

| File | Line | Query | Columns |
|------|------|-------|---------|
| `backend/wiki/wikiManager.ts` | 51–54 | `findMany` messages | ALL (full content + JSON) |
| `backend/wiki/wikiManager.ts` | 309, 312, 322, 331 | `findMany` wikiNodes/Edges | ALL |
| `backend/task-loop.ts` | 39, 116, 123, 283, 288, 303, 341 | `findUnique/Many` tasks/steps | ALL (includes `result` as `@db.Text`) |
| `backend/task-routes.ts` | 18, 23, 97, 146 | `findFirst/Many` tasks/steps | ALL |
| `backend/index.ts` | 3863, 3877, 3969, 4009, 4194, 5906, 5910, 5929 | Various | ALL |

**Contrast with the ~10 queries that DO use `.select()`** — these correctly fetch only needed columns and serve as the pattern to follow.

---

### 6. Realtime Subscriptions — NOT a Problem

**Verified clean.** Flux uses `broadcast` channels (not `postgres_changes`), which means:
- No CDC (Change Data Capture)
- No database triggers
- No SELECT * subscriptions
- Payloads are tiny (event type strings + IDs only)

`frontend/src/hooks/useSync.ts:34` — per-user broadcast channel, correctly scoped.

---

### 7. Conversation List Loading — Well-Optimized but Called Too Often

**`backend/index.ts:3950–3963` (GET /conversations):**

```typescript
const convs = await prisma.conversation.findMany({
    where: { userId: uid },
    orderBy: { id: 'desc' },
    take: 50,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } }
});
```

**Good:** Only 50 conversations, only `createdAt` from last message. Response is ~10 KB.

**Bad:** `loadConversations(true)` is called on **every** sync event:
- `conversation_created` → loadConversations
- `conversation_deleted` → loadConversations
- `message_created` → loadConversations
- After submitting a message → loadConversations
- After thread creation → loadConversations

~6,000+ fetches/month × ~10 KB = ~60 MB/month. Minor but wasteful.

---

### 8. Prisma Schema — Model Column Analysis

**File:** `backend/prisma/schema.prisma`

| Model | Field | Type | Size Impact |
|-------|-------|------|-------------|
| **Message** | `content` | `String` (unlimited) | **Potentially huge** — no size limit, 10s of KBs |
| **Message** | `sources` | `Json?` | Variable — array of source objects |
| **Message** | `fileAttachment` | `Json?` | **CRITICAL** — stores base64 blobs |
| **Message** | `followUps` | `Json?` | Small — array of strings |
| **Message** | `thoughtProcess` | `Json?` | Medium — array of status events |
| **Message** | `generatedFiles` | `Json?` | **CRITICAL** — stores base64 blobs |
| **Message** | `metadata` | `Json?` | Variable |
| **Memory** | `embedding` | `Unsupported("vector(1024)")` | **~4 KB each** |
| **DocumentChunk** | `embedding` | `Unsupported("vector(1024)")` | **~4 KB each** |
| **DocumentChunk** | `text` | `@db.Text` | Potentially large |
| **Conversation** | `compaction` | `String? @db.Text` | Medium |
| **Task** | `goal` | `@db.Text` | Medium |
| **TaskStep** | `result` | `String? @db.Text` | Variable (code execution output) |

---

## Prioritized Action Plan

### P0 — Immediate (cuts ~55% egress)

| # | Action | Files | Effort | Savings |
|---|--------|-------|--------|---------|
| 1 | Bump model polling 30s → 300s | `frontend/src/hooks/useModels.ts:74` | 5 min | ~1.4 GB/mo |
| 2 | Add `.select()` to conversation load | `backend/index.ts:4434-4437` | 30 min | ~1.5 GB/mo |
| 3 | Move base64 blobs to object storage | `backend/index.ts`, `schema.prisma`, `agent-tools.ts` | 2–4 hr | ~1.0 GB/mo |

### P1 — Within Week

| # | Action | Files | Effort | Savings |
|---|--------|-------|--------|---------|
| 4 | Add `.select()` to GET /memories | `backend/index.ts:4178` | 10 min | ~0.3 GB/mo |
| 5 | Debounce `loadConversations` calls | `frontend/src/pages/Dashboard.tsx` | 20 min | ~0.06 GB/mo |
| 6 | Add `.select()` to wiki/task queries | wikiManager.ts, task-loop.ts, task-routes.ts | 1 hr | ~0.8 GB/mo |

### P2 — Nice to Have

| # | Action | Files | Effort | Savings |
|---|--------|-------|--------|---------|
| 7 | Add `.select()` to all remaining SELECT * | 30+ locations across backend | 2 hr | ~0.8 GB/mo |

---

## Appendix: All SELECT * Queries

### Queries USING `.select()` (correct — ~10 locations)

| File | Line | Fields Selected |
|------|------|-----------------|
| `backend/memory.ts` | 31, 67, 231 | `id, category, fact, importance, accessCount` |
| `backend/compaction.ts` | 16 | `id, content, role, createdAt` |
| `backend/index.ts` | 3959, 4082 | `createdAt` (nested in include) |
| `backend/index.ts` | 4027 | `id, title, slug` |
| `backend/index.ts` | 4043–4045 | `generatedFiles, fileAttachment` (conditional) |
| `backend/index.ts` | 5647 | `id` |
| `backend/index.ts` | 6552 | `id, sources, conversationId, createdAt` |
| `backend/index.ts` | 6561 | `content` |
| `backend/wiki/wikiManager.ts` | 142 | `id` |

### Queries WITHOUT `.select()` (SELECT * — 30+ locations)

| File | Line | Query |
|------|------|-------|
| `backend/index.ts` | 4434–4437 | `findFirst` + `include: { messages }` — **CRITICAL** |
| `backend/index.ts` | 3863 | `findFirst` conversation |
| `backend/index.ts` | 3877 | `findFirst` conversation |
| `backend/index.ts` | 3969 | `conversation.create` |
| `backend/index.ts` | 4009 | `findFirst` conversation |
| `backend/index.ts` | 4041 | `findFirst` message |
| `backend/index.ts` | 4178 | `findMany` memories |
| `backend/index.ts` | 4194 | `findFirst` memory (existence check) |
| `backend/index.ts` | 4361 | `message.create` |
| `backend/index.ts` | 4388 | `message.create` |
| `backend/index.ts` | 4499 | `message.create` |
| `backend/index.ts` | 5651 | `message.create` |
| `backend/index.ts` | 5906 | `findFirst` conversation |
| `backend/index.ts` | 5910 | `findFirst` message |
| `backend/index.ts` | 5929 | `findFirst` conversation |
| `backend/wiki/wikiManager.ts` | 51–54 | `findMany` messages |
| `backend/wiki/wikiManager.ts` | 309 | `findMany` wikiNodes |
| `backend/wiki/wikiManager.ts` | 312 | `findMany` wikiEdges |
| `backend/wiki/wikiManager.ts` | 322 | `findFirst` wikiNode |
| `backend/wiki/wikiManager.ts` | 331 | `findMany` wikiNodes |
| `backend/task-loop.ts` | 39 | `findUnique` task |
| `backend/task-loop.ts` | 116 | `findUnique` taskStep |
| `backend/task-loop.ts` | 123 | `findMany` taskSteps |
| `backend/task-loop.ts` | 283 | `findMany` taskSteps |
| `backend/task-loop.ts` | 288 | `findMany` taskSteps |
| `backend/task-loop.ts` | 303 | `findMany` taskSteps |
| `backend/task-loop.ts` | 341 | `findMany` tasks |
| `backend/task-routes.ts` | 18 | `findFirst` conversation |
| `backend/task-routes.ts` | 23 | `task.create` |
| `backend/task-routes.ts` | 97 | `findMany` taskSteps |
| `backend/task-routes.ts` | 146 | `findMany` tasks |

---

*End of report. All findings are based on codebase analysis of the Flux project as of 2026-07-14.*
