# Efficient Storage for Flux — Design & Implementation Guide

**Scope:** Client-side (IndexedDB) storage engine for conversation caching, offline queueing, and low-connectivity support in Flux.
**Goal:** Maximize cache hit rate and offline usability while keeping on-device storage small, predictable, and safe across mobile browsers.
**Status:** Supersedes the plain-LRU design in the original "Low-Connectivity with Storage Efficiency" plan. Same phase structure, upgraded internals.

---

## 1. Why the original plain-LRU plan needs upgrading

The original plan (30MB budget, `SizedLRUCache`, blob stripping, 30 conversations / 50 messages) is directionally correct and the blob-stripping + re-fetch-on-demand pattern should stay exactly as designed. Two things are missing before it's production-grade:

1. **Plain LRU has a scan-pollution problem.** If a user scrolls through 10 old conversations once (e.g. searching for something), a pure recency-ordered LRU will evict the conversation the user is *actively* chatting in, because "most recently touched" and "most valuable to keep" diverge the moment there's a one-off scan. This is a well-documented weakness of LRU in caching literature — a single sequential scan can flush a working set that was otherwise stable for hours.
2. **Storage is being spent uncompressed.** Chat text — markdown, repeated tool-call JSON, repeated system/follow-up templates — compresses very well, and you're currently paying full byte cost for zero compression.

Both are cheap to fix and don't require replacing the architecture — they slot into the existing `ConversationCache` class.

---

## 2. Eviction algorithm: Segmented LRU (SLRU) instead of plain LRU

### 2.1 The concept

Segmented LRU splits the cache into two logical segments:

- **Probationary segment** — new entries land here first.
- **Protected segment** — entries get promoted here only after a *second* access (i.e. they've proven they're not a one-off scan).

Eviction always drains the probationary segment first. The protected segment is only touched once probationary is empty. This means a single sequential scan (open 10 old chats once each) fills up probationary and gets evicted first, while your actively re-opened conversation (accessed twice) sits safely in protected.

This is the same idea behind ARC (Adaptive Replacement Cache, used in ZFS and PostgreSQL's buffer manager) and LRU-2, but SLRU is far simpler to implement correctly in a single evening, which matters more than theoretical optimality for a client-side cache this size.

### 2.2 Implementation

```typescript
// frontend/src/lib/segmented-lru-cache.ts

interface CacheEntry<V> {
  value: V;
  size: number;
  lastAccess: number;
  segment: 'probationary' | 'protected';
}

export class SegmentedLRUCache<K extends string, V> {
  private entries = new Map<K, CacheEntry<V>>();
  private totalBytes = 0;

  constructor(
    private maxBytes: number,
    private maxEntries: number,
    // Protected segment gets a cap too, so it can't swallow the whole budget
    private protectedRatio = 0.7, // protected segment ≤ 70% of maxBytes
  ) {}

  get(key: K): V | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    entry.lastAccess = Date.now();

    if (entry.segment === 'probationary') {
      entry.segment = 'protected';
      this.rebalanceProtected();
    }

    return entry.value;
  }

  set(key: K, value: V, size: number): boolean {
    if (size > this.maxBytes) return false; // reject oversized single entries

    // Remove existing entry first (re-insert resets to probationary — correct:
    // a re-fetched/updated conversation should re-earn protected status)
    if (this.entries.has(key)) {
      this.remove(key);
    }

    this.evictUntilFits(size);

    this.entries.set(key, {
      value,
      size,
      lastAccess: Date.now(),
      segment: 'probationary',
    });
    this.totalBytes += size;
    return true;
  }

  private evictUntilFits(incomingSize: number) {
    while (
      (this.totalBytes + incomingSize > this.maxBytes ||
        this.entries.size >= this.maxEntries)
    ) {
      const victim = this.pickEvictionVictim();
      if (!victim) break; // nothing left to evict
      this.remove(victim);
    }
  }

  private pickEvictionVictim(): K | null {
    // 1. Prefer evicting from probationary (LRU order within segment)
    // 2. Tie-break: evict largest-and-oldest first (frees more space per eviction)
    let victim: K | null = null;
    let victimScore = -Infinity;

    for (const [key, entry] of this.entries) {
      // probationary entries always outrank protected entries as eviction targets
      const segmentWeight = entry.segment === 'probationary' ? 1_000_000_000 : 0;
      const age = Date.now() - entry.lastAccess;
      const score = segmentWeight + age * 1 + entry.size * 0.001;
      if (score > victimScore) {
        victimScore = score;
        victim = key;
      }
    }
    return victim;
  }

  private rebalanceProtected() {
    // If protected segment exceeds its ratio cap, demote the oldest
    // protected entries back to probationary instead of evicting them outright
    const protectedBytes = [...this.entries.values()]
      .filter((e) => e.segment === 'protected')
      .reduce((sum, e) => sum + e.size, 0);

    const cap = this.maxBytes * this.protectedRatio;
    if (protectedBytes <= cap) return;

    const protectedEntries = [...this.entries.entries()]
      .filter(([, e]) => e.segment === 'protected')
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess); // oldest first

    let excess = protectedBytes - cap;
    for (const [, entry] of protectedEntries) {
      if (excess <= 0) break;
      entry.segment = 'probationary';
      excess -= entry.size;
    }
  }

  private remove(key: K) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalBytes -= entry.size;
    this.entries.delete(key);
  }

  getTotalSize(): number {
    return this.totalBytes;
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }
}
```

**Why this specific tie-break (`age + size * 0.001`):** pure LRU-by-age alone tends to leave a handful of huge stale entries sitting around if something more recent but tiny keeps "winning" the recency check. Weighting in size (lightly) means that when two candidates are close in age, the cache prefers to evict the larger one, freeing more headroom per eviction and reducing total eviction *operations* — which matters because each eviction is an IndexedDB delete transaction.

### 2.3 Where this plugs into the existing plan

Nothing about `ConversationCache`'s public API changes. Internally, swap:

```typescript
// Before
private cache: SizedLRUCache<string, CachedConversation>;

// After
private cache: SegmentedLRUCache<string, CachedConversation>;
```

`getConversations()`, `putMessages()`, etc. keep their signatures. This is a drop-in internals swap, not a schema migration.

---

## 3. Compression: the single highest-ROI change

### 3.1 Why this matters more than the eviction tuning

Your 25MB conversation budget is a *byte* budget. Chat data — markdown text, repeated JSON shapes from tool calls, repeated system/follow-up boilerplate, search-result snippets — is highly compressible. Generic text/JSON typically compresses 3–6x with gzip, sometimes more when there's a lot of structural repetition (which Flux has a lot of: `sources`, `followUps`, tool-call schemas). That turns a 25MB logical budget into 75–150MB of *actual* stored conversation content for free, with no eviction-policy changes needed.

### 3.2 Browser support (verified, as of mid-2026)

The native `CompressionStream` / `DecompressionStream` API is supported by <cite index="12-1">93.44% of global browser usage</cite>, and is supported in <cite index="12-1">Chrome and Edge from version 80 onward, Firefox from version 113, and Safari (desktop and iOS) from version 16.4 onward</cite>. That comfortably covers any modern Android/iOS device Flux would target. The API now also exposes a `'zstd'` format option alongside `'gzip'` and `'deflate'` in recent browser builds, per <cite index="9-1">the CompressionStream constructor supporting gzip, deflate, deflate-raw, and zstd algorithms</cite> — gzip is still the safest cross-browser default today, with zstd as a future upgrade once support is universal.

This means: **no third-party compression library needed.** No `pako`, no `zlib.js`, no bundle-size cost. The API is built into the browser exactly for this use case — <cite index="4-1">using CompressionStream is explicitly recommended for local storage use cases, where the goal is saving more information into IndexedDB without saturating the user's disk space</cite>, and <cite index="4-1">the native implementation is optimized by browser vendors, making it faster and more battery-efficient than manually written JavaScript compression libraries</cite>.

### 3.3 Implementation

```typescript
// frontend/src/lib/compression.ts

const COMPRESSION_FORMAT: CompressionFormat = 'gzip';
// Below this size, compression overhead isn't worth it (small messages,
// short status pings) — skip compression and store raw.
const MIN_COMPRESS_SIZE = 512; // bytes

export async function compressText(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(input);
  const stream = new Blob([rawBytes]).stream().pipeThrough(
    new CompressionStream(COMPRESSION_FORMAT),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function decompressText(compressed: Uint8Array): Promise<string> {
  const stream = new Blob([compressed]).stream().pipeThrough(
    new DecompressionStream(COMPRESSION_FORMAT),
  );
  return new Response(stream).text();
}

/**
 * Wraps a message's content field for storage. Stores raw JSON string if
 * small, gzip-compressed bytes if large. `_c` flag disambiguates on read.
 */
export async function packForStorage(
  content: string,
): Promise<{ data: string | Uint8Array; compressed: boolean }> {
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength < MIN_COMPRESS_SIZE) {
    return { data: content, compressed: false };
  }
  const compressed = await compressText(content);
  // Guard: if compression didn't actually help (rare, e.g. already-compact
  // JSON with high entropy), fall back to raw rather than pay decode cost
  // for no storage win.
  if (compressed.byteLength >= byteLength) {
    return { data: content, compressed: false };
  }
  return { data: compressed, compressed: true };
}

export async function unpackFromStorage(
  packed: { data: string | Uint8Array; compressed: boolean },
): Promise<string> {
  if (!packed.compressed) return packed.data as string;
  return decompressText(packed.data as Uint8Array);
}
```

### 3.4 Feature detection & fallback

Because 6–7% of traffic still lacks support (old Edge/Firefox/Safari versions, some in-app WebViews), guard the call site rather than assuming availability:

```typescript
export const supportsNativeCompression =
  typeof CompressionStream !== 'undefined' &&
  typeof DecompressionStream !== 'undefined';
```

If unsupported, skip compression entirely and store raw — do **not** pull in a JS polyfill library just for the ~6% tail; it's not worth the bundle-size cost for a purely storage-optimization feature. The cache still works correctly without compression, it's just less space-efficient for that user.

### 3.5 Where this plugs in

Inside `ConversationCache.putMessages()`, before writing each message to the `messages` object store:

```typescript
const packedContent = await packForStorage(message.content);
await store.put({
  ...stripBlobs(message),
  content: packedContent.data,
  contentCompressed: packedContent.compressed,
});
```

And symmetrically in `getMessages()` — unpack after read, before returning to the UI layer. This is invisible to every caller above `ConversationCache`.

---

## 4. Content-addressable deduplication (optional, Phase 2.5)

### 4.1 When this is worth it

Only implement this if profiling (see §7) shows genuine byte-level repetition across messages — which is likely in Flux specifically because of:
- Repeated tool-call/tool-result JSON shapes (same schema, similar values)
- Repeated `followUps` suggestion templates
- Repeated search-result snippet boilerplate (favicon URLs, domain attribution strings)
- System/instruction text that's identical across many messages

If it's not a measurable win, skip it — compression alone (§3) already captures most of the redundancy *within* a single message. Dedup captures redundancy *across* messages, which gzip's per-message compression can't see.

### 4.2 Implementation

```typescript
// frontend/src/lib/content-dedup.ts

async function sha256Truncated(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer)).slice(0, 16); // 16 bytes = 128 bits, plenty for this scale
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface BlobRecord {
  hash: string;
  content: string;
  refCount: number;
}

export class ContentDedupStore {
  constructor(private db: IDBDatabase) {}

  async intern(content: string): Promise<string> {
    // Only worth hashing content above a size threshold — hashing tiny
    // strings costs more than it saves.
    if (content.length < 200) return content; // store inline, not as a ref

    const hash = await sha256Truncated(content);
    const tx = this.db.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const existing = await this.getBlob(store, hash);

    if (existing) {
      existing.refCount += 1;
      store.put(existing);
    } else {
      store.put({ hash, content, refCount: 1 } satisfies BlobRecord);
    }
    return `ref:${hash}`;
  }

  async resolve(contentOrRef: string): Promise<string> {
    if (!contentOrRef.startsWith('ref:')) return contentOrRef;
    const hash = contentOrRef.slice(4);
    const tx = this.db.transaction('blobs', 'readonly');
    const record = await this.getBlob(tx.objectStore('blobs'), hash);
    return record?.content ?? '';
  }

  async release(contentOrRef: string) {
    if (!contentOrRef.startsWith('ref:')) return;
    const hash = contentOrRef.slice(4);
    const tx = this.db.transaction('blobs', 'readwrite');
    const store = tx.objectStore('blobs');
    const record = await this.getBlob(store, hash);
    if (!record) return;
    record.refCount -= 1;
    if (record.refCount <= 0) {
      store.delete(hash);
    } else {
      store.put(record);
    }
  }

  private getBlob(
    store: IDBObjectStore,
    hash: string,
  ): Promise<BlobRecord | undefined> {
    return new Promise((resolve, reject) => {
      const req = store.get(hash);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}
```

**Schema addition:**
```
'blobs' store: { hash: string (key), content: string, refCount: number }
```

**Important:** dedup composes with compression, not instead of it — intern the *raw* text, then compress at write time as usual. Also make sure `removeConversation()` calls `release()` for every deduped reference in that conversation's messages, or `refCount` will drift and blobs will never get garbage collected.

---

## 5. Adaptive, quota-aware budget sizing

### 5.1 The problem with a hardcoded 30MB

A fixed budget doesn't account for actual device conditions. A user on a low-end Android phone with 200MB of free storage and a user on a modern phone with 40GB free shouldn't get the same treatment — the first needs headroom protected, the second could comfortably cache far more (faster offline access, fewer refetches).

### 5.2 Implementation

```typescript
// frontend/src/lib/storage-budget.ts

interface StorageBudget {
  totalBytes: number;
  conversationBytes: number;
  offlineQueueBytes: number;
  metaBytes: number;
}

const HARD_CEILING = 30 * 1024 * 1024; // never exceed this regardless of quota
const HARD_FLOOR = 5 * 1024 * 1024; // below this, caching isn't worth the complexity
const QUOTA_FRACTION = 0.05; // use at most 5% of available quota

export async function computeStorageBudget(): Promise<StorageBudget> {
  let available = HARD_CEILING;

  if (navigator.storage?.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota && usage !== undefined) {
        const free = quota - usage;
        available = Math.min(HARD_CEILING, Math.max(HARD_FLOOR, free * QUOTA_FRACTION));
      }
    } catch {
      // estimate() can throw in some private-browsing contexts — fall back
      // to the hard ceiling silently.
    }
  }

  return {
    totalBytes: available,
    conversationBytes: available * 0.83, // ~25/30 ratio preserved from original plan
    offlineQueueBytes: available * 0.067, // ~2/30
    metaBytes: available * 0.1, // ~3/30
  };
}
```

Call this once on app boot and whenever storage pressure events fire (see §5.3), then feed the result into `SegmentedLRUCache`'s constructor instead of a hardcoded constant.

### 5.3 Reacting to storage pressure

Browsers can evict IndexedDB data under storage pressure even within your self-imposed budget, particularly on Safari, which is more aggressive about clearing site data than Chromium browsers. Two defensive measures:

```typescript
// Request persistent storage so the browser deprioritizes evicting Flux's
// data before other sites' data under global storage pressure.
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
```

Call `requestPersistence()` once, after the user has interacted meaningfully with the app (browsers are more likely to grant it for engaged users, and some browsers auto-grant based on engagement heuristics — no guarantee, but worth requesting).

---

## 6. Updated database schema

```
IndexedDB: 'flux-cache' (version 2 — bump from v1 for the schema change)

├─ 'conversations' store (keyPath: 'id')
│   { id, title, slug, lastMessageAt, cachedAt, lastAccess, segment }
│   Index: 'lastAccess'
│
├─ 'messages' store (keyPath: 'id')
│   { id, conversationId, role, content: string | Uint8Array,
│     contentCompressed: boolean, createdAt, sources, followUps,
│     generatedFiles (stripped), parts (stripped) }
│   Index: 'conversationId', compound index: ['conversationId', 'createdAt']
│
├─ 'blobs' store (keyPath: 'hash')          [optional, Phase 2.5]
│   { hash, content, refCount }
│
└─ 'meta' store (keyPath: 'key')
    { key: 'totalSize', value: bytes }
    { key: 'budget', value: StorageBudget }
    { key: 'schemaVersion', value: 2 }
```

**Migration note:** bump the IndexedDB version number to trigger `onupgradeneeded`, and in that handler, either (a) wipe and rebuild the cache (simplest — it's a cache, not source of truth, so this is safe) or (b) lazily re-pack existing entries to the compressed format on next access. Given this is pure cache data backed by the server as source of truth, **wipe-and-rebuild is the correct choice** — don't over-engineer a migration for disposable cache data.

---

## 7. Measuring before optimizing further

Before implementing §4 (dedup) or tuning §2's weighting constants, instrument actual usage:

```typescript
// frontend/src/lib/cache-metrics.ts

interface CacheMetrics {
  hitRate: number;
  compressionRatio: number; // rawBytes / compressedBytes
  avgEvictionsPerSession: number;
  protectedSegmentUtilization: number;
}
```

Log these (locally, or batched to your existing analytics pipeline if Flux has one) for at least a few days of real usage before deciding whether dedup is worth the added complexity. Compression ratio alone will tell you a lot: if you're seeing 4x+ compression, dedup will likely add diminishing returns and isn't worth the refCount-management complexity. If compression is only giving ~1.5x (meaning content is mostly unique, high-entropy text) but you're also seeing highly repeated tool-schema blocks specifically, that's the signal dedup is worth adding.

---

## 8. Revised storage budget table

| Component | Old plan (fixed) | New plan (adaptive, typical device) |
|---|---|---|
| App shell (service worker) | ~2MB | ~2MB (unchanged, not affected by this doc) |
| Conversation cache (compressed) | 25MB budget, ~3–5MB actual content | Adaptive budget (5–30MB), effectively 15–150MB of *logical* content after 3–6x compression |
| Offline queue | 2MB / 20 messages | Same, compression applied if messages are large |
| Metadata/indexes | 3MB | Same |
| **Worst case device impact** | ~1.8% of Safari's 500MB origin quota | Capped at same hard ceiling (30MB), but now self-scales down on constrained devices instead of assuming 30MB is always safe to request |

---

## 9. Implementation checklist (delta from original plan)

- [ ] Replace `SizedLRUCache` with `SegmentedLRUCache` in `conversation-cache.ts`
- [ ] Add `compression.ts` with `packForStorage` / `unpackFromStorage`
- [ ] Wire compression into `putMessages()` / `getMessages()` read-write paths
- [ ] Add `supportsNativeCompression` feature detection, no-op fallback path
- [ ] Add `storage-budget.ts`, call `computeStorageBudget()` on app boot
- [ ] Call `navigator.storage.persist()` after meaningful engagement (e.g. after 3rd message sent)
- [ ] Bump IndexedDB schema version to 2, wipe-and-rebuild on upgrade
- [ ] Add `cache-metrics.ts` instrumentation, log for a few days before deciding on §4
- [ ] (Conditional) Implement `content-dedup.ts` only if metrics justify it

Everything else in the original Phase 1–4 plan (gzip on the server, service worker caching, code splitting, connection-quality adaptive matrix, virtualization with react-virtuoso) stays as-is — this document only replaces the client-side storage *internals*, not the surrounding architecture.

---

## 10. Key sources

- MDN — [CompressionStream API](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream) and [constructor formats](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream)
- Can I Use — [CompressionStream browser support](https://caniuse.com/mdn-api_compressionstream)
- MDN — [Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- Lionel Peramo — [CompressionStream API: Optimize Your Data Transfers Natively](https://lionel-peramo.com/posts/compression-stream-api-native-performance/)
