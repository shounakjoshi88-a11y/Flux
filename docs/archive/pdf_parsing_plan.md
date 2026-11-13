# PDF Parsing Overhaul Plan v2 — Enhanced & Optimized

**Changed from v1:** the original plan hand-rolls table detection, heading detection, and OCR-trigger logic on top of raw `pymupdf`. Research shows this is now a solved problem one layer up — `pymupdf4llm` (the LLM-oriented wrapper, not raw PyMuPDF) does all of it natively as of its current release, which cuts your custom Python code by roughly 70% and removes an entire class of "did we get the heuristic right" bugs. Everything downstream (chunking, RAG, retrieval quality) is also upgraded based on 2026 chunking/retrieval research. Security hardening for the subprocess boundary is added, since that wasn't covered in v1 at all.

---

## Current State (Broken) — unchanged from v1

- **Engine:** `pdfjs-dist` — browser-oriented, raw text items only
- **"Table-aware" extraction:** Y-position + median-gap heuristics — fails on real tables
- **Scanned PDFs:** returns nothing
- **Images/charts:** ignored
- **Multi-column layouts:** interleaved wrong

---

## Layer 1: Extraction Engine — Simplified

### The key change: use `pymupdf4llm`, not raw `pymupdf`

`pymupdf4llm` is a purpose-built wrapper on top of PyMuPDF specifically for LLM/RAG ingestion, and as of its current release it directly does everything v1's plan proposed building by hand:

| v1 plan built manually | `pymupdf4llm` does natively |
|---|---|
| Font-size heuristics for heading detection | `IdentifyHeaders` (font-size based) or `TocHeaders` (bookmark-based) — pick one, pass as `hdr_info` |
| `<100 chars → trigger OCR` gibberish detection | Built-in per-page decision: <cite index="23-1">it inspects each page before extraction, and if a page contains no selectable text, OCR is triggered automatically for just that page — pages with native text are never sent through OCR</cite> |
| Manual table Y-position clustering | `page.find_tables()` under the hood, output as proper GitHub-flavored markdown tables inline with surrounding text in correct reading order |
| Manual column-clustering for multi-column layout | <cite index="24-1">Layout-aware reading-order reconstruction is built in</cite> |
| Manual image extraction loop | `write_images=True` / `embed_images=True` params extract and reference images automatically |
| Custom OCR pipeline (`pdf2image` + `pytesseract` manually wired) | Automatic, using Tesseract by default, swappable via `ocr_function` if you ever want a different engine |

This means your **entire OCR decision tree from v1 collapses into a single function call.** You don't need `pdf2image` as a direct dependency, and you don't need to hand-write the "render page → OCR → reconstruct paragraphs" logic — `pymupdf4llm` does this per-page automatically, and <cite index="23-1">the resulting markdown seamlessly combines OCR'd and natively-extracted pages with no visible distinction between them</cite>.

### Revised Python dependencies

| Library | Purpose |
|---------|---------|
| `pymupdf4llm` | Extraction: markdown, tables, headings, images, automatic smart OCR — this one package replaces `pymupdf` (installed as a dependency automatically) + `pytesseract` + `pdf2image` as *direct* dependencies |
| Tesseract (system binary, not a Python package) | OCR backend, still needed system-side since `pymupdf4llm` calls out to it |

**Removed from v1's dependency list:** `pytesseract`, `Pillow`, `pdf2image` as direct project dependencies. They're either unnecessary or pulled transitively — don't manage them yourself.

### Revised extraction pipeline

```python
# backend/pdf_parser.py — full extraction, ~40 lines instead of v1's ~250

import sys
import json
import pymupdf4llm

def extract(pdf_path: str) -> dict:
    result = pymupdf4llm.to_markdown(
        pdf_path,
        page_chunks=True,       # returns list of per-page dicts, not one giant string
        write_images=False,     # embed as base64 instead of writing to disk (stateless subprocess)
        embed_images=True,
        image_format="png",
        ocr_dpi=200,            # balance quality vs. time; default 300 is often overkill for text OCR
    )
    # result is a list of {"text": md_for_page, "metadata": {...}, "images": [...], ...}

    full_markdown = "\n\n".join(page["text"] for page in result)
    is_scanned = any(page["metadata"].get("ocr_applied") for page in result)  # if exposed; else infer from empty native text

    return {
        "metadata": {
            "pages": len(result),
            "is_scanned": is_scanned,
        },
        "markdown": full_markdown,
        "pages": result,  # keep per-page structure for heading-aware chunking downstream
        "token_count": estimate_tokens(full_markdown),
    }

def estimate_tokens(text: str) -> int:
    # Rough heuristic (chars/4) is fine for a routing decision — don't reach for tiktoken here,
    # it's not worth the dependency for a threshold check.
    return len(text) // 4

if __name__ == "__main__":
    pdf_path = sys.argv[1]
    try:
        print(json.dumps(extract(pdf_path)))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
```

Heading detection: pass `hdr_info=pymupdf4llm.TocHeaders(doc)` when the PDF has a real table of contents (more reliable), falling back to `IdentifyHeaders` (font-size heuristic) when it doesn't — this two-tier fallback is itself built into the library's design, you just choose which to call.

### TypeScript integration (`backend/index.ts`) — same shape as v1, smaller surface

```typescript
async function extractPdf(rawBuf: Buffer): Promise<ExtractionResult> {
  const tmp = path.join(os.tmpdir(), `flux-pdf-${crypto.randomUUID()}.pdf`);
  try {
    await Bun.write(tmp, rawBuf);
    const proc = Bun.spawn(
      ['python3', path.resolve('pdf_parser.py'), tmp],
      { timeout: 15_000 }, // hard ceiling — see Security section below for why this matters
    );
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`pdf_parser.py failed: ${err.slice(0, 500)}`);
    }
    return JSON.parse(out);
  } finally {
    await fs.rm(tmp, { force: true }); // guaranteed cleanup even on throw
  }
}
```

Same callsite replacements as v1 (`read_url` tool, attachment parsing) — unchanged.

---

## Layer 2: Smart Chunking + RAG — Upgraded

### Chunking strategy: structure-aware first, fixed-window fallback

v1's plan already had the right instinct ("chunk by headings, preferred") but under-specified it. Current guidance for production RAG in 2026 is consistent across sources: <cite index="35-1">start with recursive/structure-aware chunking at 300-500 tokens with 10-15% overlap — this works for most use cases, and each chunk should be semantically complete enough to answer a question on its own</cite>. Pure fixed-size chunking without structure awareness is explicitly called out as a "fast start, slow ceiling."

Two concrete upgrades to v1's chunking:

1. **Chunk size: 300–500 tokens, not 512 with 128 overlap.** v1's numbers weren't wrong, but tune the overlap ratio to be *relative*, not fixed: <cite index="37-1">10-20% overlap, typical chunk size 256-1024 tokens</cite> — for markdown-structured content from `pymupdf4llm`'s output (which already has clean heading boundaries), splitting on headings first, then sub-splitting any section that's still too long, at ~400 tokens with ~15% overlap is a good default.

2. **Prepend a short context header to every chunk before embedding.** This is the single highest-leverage retrieval quality improvement and is missing from v1 entirely: <cite index="34-1">every chunk should carry source, section, page, and parent-chunk ID as metadata</cite> — but beyond just *metadata*, prepend a one-line textual context (`"Document: {name} | Section: {heading}"`) directly into the text that gets embedded, not just stored as a side column. This disambiguates chunks that would otherwise be near-identical out of context (e.g. a table row that says "Q3: 12%" means nothing without knowing which document/section it's from) and meaningfully improves retrieval on documents with repetitive structure — which financial/technical PDFs (a lot of what Flux users will upload) are prone to.

```python
def chunk_by_headings(pages: list[dict], doc_name: str, max_tokens: int = 400, overlap_ratio: float = 0.15) -> list[dict]:
    chunks = []
    current_heading = "Introduction"
    for page in pages:
        sections = split_on_markdown_headings(page["text"])  # split on ## boundaries
        for heading, body in sections:
            current_heading = heading or current_heading
            sub_chunks = fixed_window_split(body, max_tokens, overlap_ratio)
            for sub in sub_chunks:
                # Context header prepended to the actual embedded text, not just metadata
                contextualized = f"Document: {doc_name} | Section: {current_heading}\n\n{sub}"
                chunks.append({
                    "text": contextualized,
                    "heading": current_heading,
                    "page": page["metadata"]["page"],
                })
    return chunks
```

### Updated decision flow

```
Extraction result: { markdown, pages, token_count }
                                │
                          token_count?
                                │
              ┌─────────────────┴─────────────────┐
              │  < 4000                           │  ≥ 4000
              ▼                                   ▼
      Inject directly into                 chunk_by_headings() — structure-aware,
      LLM context                          ~400 tokens, 15% overlap, context-prefixed
                                           Embed with BGE-M3
                                           Store in DocumentChunk
                                           Inject summary into context:
                                             "Document {name} has {N} sections.
                                              Use retrieve_doc_chunks(query) to search."
```

(Same shape as v1 — the 4000-token threshold for "inject directly vs. chunk" is a reasonable number to keep.)

### Retrieval: hybrid search, not pure vector top-k

v1's `retrieve_doc_chunks` tool did pure `pgvector <=>` nearest-neighbor. This misses an entire class of queries: <cite index="35-1">pure vector search fails on queries with exact lexical signals — names, IDs, codes, specific numbers</cite> — which is a real problem for Flux given that financial/technical PDF analysis (per your fintech testing work) leans heavily on exact figures and identifiers. <cite index="35-1">Combining a BM25 keyword search with dense vector search via Reciprocal Rank Fusion achieves 66.4% MRR versus 56.7% for semantic-only — a 9+ point improvement</cite>, and <cite index="35-1">if you're using pgvector, BM25-equivalent behavior comes via PostgreSQL's built-in full-text search running alongside vector similarity</cite> — no new infrastructure needed, since you're already on Postgres.

**Updated Prisma model** (adds a `tsvector` column for full-text search alongside the embedding):

```prisma
model DocumentChunk {
  id           String   @id @default(uuid())
  userId       String
  documentName String
  source       String   // "upload" | "read_url"
  sourceUrl    String?
  chunkIndex   Int
  heading      String?
  text         String   @db.Text
  embedding    Unsupported("vector(1024)")
  searchVector Unsupported("tsvector")?  // generated column for full-text search, see migration below
  tokenCount   Int
  contentHash  String   // sha256 of source PDF bytes — cache key, see "Idempotency" below
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([userId, documentName])
  @@index([contentHash])
}
```

Raw migration to add the generated tsvector column and its index (Prisma doesn't model generated columns directly, so this needs a manual migration):

```sql
ALTER TABLE "DocumentChunk" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;

CREATE INDEX "DocumentChunk_searchVector_idx" ON "DocumentChunk" USING GIN ("searchVector");

-- HNSW instead of no index / IVFFlat for the embedding column:
CREATE INDEX "DocumentChunk_embedding_idx" ON "DocumentChunk"
  USING hnsw (embedding vector_cosine_ops);
```

**Why HNSW over IVFFlat here:** <cite index="39-1">HNSW is generally preferred for high-recall, low-latency queries where user experience is sensitive to search quality</cite>, and at Flux's expected per-user document scale (dozens to low hundreds of chunks per document, not millions), <cite index="35-1">pgvector's HNSW indexing delivers sub-100ms performance at millions of vectors</cite> — you're nowhere near the scale where IVFFlat's faster-build/lower-recall tradeoff would matter, so just take the better recall by default.

**Updated `retrieve_doc_chunks` tool implementation:**

```typescript
async function retrieveDocChunks(query: string, userId: string, documentName?: string, topK = 5) {
  const embedding = await getEmbedding(query); // BGE-M3, unchanged from v1

  // Run vector search and full-text search in parallel, fuse with RRF
  const [vectorResults, textResults] = await Promise.all([
    prisma.$queryRaw`
      SELECT id, text, heading, 1 - (embedding <=> ${embedding}::vector) AS score
      FROM "DocumentChunk"
      WHERE "userId" = ${userId} ${documentName ? Prisma.sql`AND "documentName" = ${documentName}` : Prisma.empty}
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${topK * 4}
    `,
    prisma.$queryRaw`
      SELECT id, text, heading, ts_rank("searchVector", to_tsquery('english', ${toTsQuery(query)})) AS score
      FROM "DocumentChunk"
      WHERE "userId" = ${userId} ${documentName ? Prisma.sql`AND "documentName" = ${documentName}` : Prisma.empty}
        AND "searchVector" @@ to_tsquery('english', ${toTsQuery(query)})
      ORDER BY score DESC
      LIMIT ${topK * 4}
    `,
  ]);

  return reciprocalRankFusion(vectorResults, textResults, topK);
}

function reciprocalRankFusion(listA: RankedResult[], listB: RankedResult[], topK: number, k = 60) {
  const scores = new Map<string, number>();
  [listA, listB].forEach((list) => {
    list.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  });
  const merged = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
  const byId = new Map([...listA, ...listB].map((r) => [r.id, r]));
  return merged.map(([id]) => byId.get(id));
}
```

`$queryRaw` (tagged template, auto-parameterized) is used here rather than `$queryRawUnsafe` — this matters for injection safety even though `query` is going through `to_tsquery`, which itself needs a sanitizing helper (`toTsQuery`) to strip characters that have special meaning in `tsquery` syntax (`&`, `|`, `!`, `:`) before use, otherwise a crafted search query could alter the query's logical structure.

### Idempotency / caching — refined from v1

v1 already had the right idea ("re-parsing only happens if PDF hasn't been seen before"). Make the cache key explicit and correct: **hash the actual PDF bytes (SHA-256), not `userId + documentName`** — two different files can share a name, and the same file re-uploaded should hit cache regardless of what the user named it this time.

```typescript
const contentHash = crypto.createHash('sha256').update(rawBuf).digest('hex');
const existing = await prisma.documentChunk.findFirst({ where: { contentHash, userId } });
if (existing) {
  // Skip extraction + chunking + embedding entirely — just point at existing chunks
}
```

---

## Security — new section, absent from v1

v1's plan spawns a Python subprocess to parse arbitrary user-uploaded files. This is exactly the kind of boundary that needs explicit hardening, and ties directly into the malicious-file and supply-chain sections of the broader Flux security audit.

- [ ] **Command construction is already safe by shape** — `Bun.spawn(['python3', script, tmp])` uses an argv array, not a shell string, so there's no shell-interpolation injection risk from the filename. Keep it this way; never switch to a string-based `Bun.$\`...\`` call with the path interpolated into it.
- [ ] **Hard timeout on the subprocess.** Malicious or pathologically complex PDFs (deeply nested vector graphics, huge embedded images that trigger expensive OCR, PDF "bombs" analogous to zip bombs) can hang extraction indefinitely. The `timeout: 15_000` option shown above is not optional — pick a number based on your worst realistic legitimate PDF and add headroom, but always cap it.
- [ ] **File size limit before spawning at all.** Reject PDFs above a size threshold (e.g. 50MB) at the upload layer, before they ever reach the Python subprocess — cheaper to reject early than to let the subprocess discover the problem.
- [ ] **Resource limits on the subprocess itself**, not just a wall-clock timeout — a memory-bomb PDF (e.g. one embedded image that decompresses to gigabytes) can OOM the whole backend process, not just time out. If deploying via Docker, set a memory limit (`--memory`) on the container running this, or use `resource.setrlimit` inside `pdf_parser.py` to cap its own memory before starting extraction.
- [ ] **Never trust the `is_scanned` / metadata fields coming back from the Python subprocess as authoritative for anything security-relevant** — they're extraction hints for your chunking logic, not a trust boundary. The generated markdown itself should still go through the same output-handling rules as any other LLM-adjacent content once it's injected into a prompt (see the injection/output-handling sections of the Flux security audit) — a PDF can absolutely contain text specifically crafted as an indirect prompt injection payload aimed at whatever tool-calling LLM eventually reads the extracted markdown.
- [ ] **Guaranteed temp file cleanup** — the `try/finally` shown in the TypeScript integration above ensures the temp PDF is removed even if extraction throws. v1's plan had a cleanup comment but no actual guarantee against a throw skipping it.
- [ ] **Run the Python subprocess with the minimum OS permissions needed** — it should not run as the same user/context that has, e.g., direct DB credentials in its environment. If your deploy setup makes this easy (e.g. a scoped service account), use it; if not, at minimum don't pass unrelated environment variables (API keys, DB connection strings) into the subprocess's env — pass only what `pdf_parser.py` actually needs.

---

## What Each PDF Type Gets — updated

| PDF Type | v1 | v2 |
|---|---|---|
| Simple text PDF | Garbled | Clean markdown via `pymupdf4llm`, direct to context |
| PDF with tables | Broken heuristics | Native `find_tables()` → GFM markdown tables, inline, correct order |
| Scanned/image-only PDF | Empty string | Automatic per-page OCR, indistinguishable output from native text |
| Research paper (multi-column) | Interleaved | Built-in reading-order reconstruction |
| Large report (50+ pages) | Truncated | Heading-aware chunked RAG, context-prefixed chunks, hybrid retrieval |
| PDF with embedded images | Ignored | Extracted as base64 automatically via `embed_images=True` |
| PDF from `read_url` | Same broken parsing | Same pipeline, same security limits apply (arguably higher risk since it's a remote URL, not a direct upload — see indirect prompt injection note above) |
| Follow-up questions on same PDF | Re-parsed each time | Content-hash cache hit, zero re-parsing |
| Exact-figure queries ("what was the Q3 number") | Would fail under pure vector search | Hybrid BM25+vector retrieval handles exact lexical matches correctly |

---

## Files to Create/Modify — updated

### New Files
| File | Est. Lines | Purpose |
|---|---|---|
| `backend/pdf_parser.py` | ~50–70 (down from ~250) | Thin wrapper around `pymupdf4llm` |
| `backend/pdf_parsing_backend/requirements.txt` | ~1 | Just `pymupdf4llm` |
| `backend/lib/chunking.ts` | ~80 | `chunk_by_headings`, context-prefixing, token estimation |
| `backend/lib/hybrid-retrieval.ts` | ~60 | Vector + full-text parallel query, RRF fusion |

### Modified Files
Same list as v1 (`schema.prisma`, `index.ts`, `Dockerfile`, `memory-enhanced.ts`, `Dashboard.tsx`, `useChat.ts`), plus:
- `backend/Dockerfile` — still needs `tesseract-ocr` system package, but **not** `pytesseract`/`pdf2image` pip installs anymore
- New raw SQL migration file for the generated `tsvector` column + HNSW index (Prisma migrate won't generate this correctly on its own — write it by hand and mark as applied)

### Apply to Both
Same as v1 — `Flux/` and `flux_2/` both get all changes.

---

## Deployment Considerations — updated

- **Python dependency:** unchanged, Python 3.9+
- **Tesseract binary:** unchanged, `apt-get install tesseract-ocr tesseract-ocr-eng`
- **`pymupdf4llm`:** pulls in PyMuPDF automatically; still a pure-Python-plus-C-extension wheel, no extra system deps beyond Tesseract
- **Latency:** likely *lower* than v1's estimate for non-scanned PDFs, since you're no longer running your own multi-step heuristic pipeline — `pymupdf4llm` skips OCR entirely on pages with usable text, so the ~200-800ms estimate from v1 should be treated as an upper bound for mixed documents, not a baseline
- **Memory:** add an explicit container memory limit per the Security section above — this wasn't a v1 consideration and matters for OCR-heavy documents in particular (OCR rendering is the memory-hungriest step)

---

## Out of Scope (for now) — unchanged from v1

- DOCX / XLSX / PPTX chunking + RAG (only PDF) — note: `pymupdf4llm` *can* extend to Office formats via `PyMuPDF Pro`, worth revisiting this scope decision later since the same library could cover it, but that's a licensing/cost decision, not a technical blocker
- Persistent document library across conversations
- Streaming OCR progress to frontend
- Image extraction serving via dedicated API (base64 embedded in tool response, unchanged from v1)

---

## Priority order for implementation

1. Swap raw `pdfjs-dist` for the `pymupdf4llm` subprocess — this alone fixes the "current state broken" bullet list and is the highest-leverage, lowest-risk change
2. Add the subprocess security hardening (timeout, size limit, cleanup guarantee) at the same time you build the subprocess call — much easier to bake in now than retrofit later
3. Heading-aware chunking with context-prefixing
4. Hybrid retrieval (vector + full-text + RRF) — meaningful upgrade for exact-figure queries specifically, which matters for the financial-document use case you've already been testing Flux against
5. Content-hash-based caching

---

## Sources

- PyMuPDF — [PyMuPDF4LLM documentation](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/)
- PyMuPDF4LLM — [GitHub](https://github.com/pymupdf/pymupdf4llm) / [PyPI](https://pypi.org/project/pymupdf4llm/)
- PyMuPDF — [LLM & RAG integration guide](https://pymupdf.readthedocs.io/en/latest/rag.html)
- Firecrawl — [Best Chunking Strategies for RAG in 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- jobsbyculture — [RAG Architecture Guide 2026](https://jobsbyculture.com/blog/rag-architecture-guide-2026)
- digitalapplied — [Self-Hosted RAG with Postgres pgvector: 2026 Guide](https://www.digitalapplied.com/blog/build-self-hosted-rag-postgres-pgvector-tutorial-2026)
- Instaclustr — [pgvector: Key features, tutorial, and pros and cons](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/)