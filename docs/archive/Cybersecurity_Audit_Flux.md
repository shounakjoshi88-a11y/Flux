# Cybersecurity Audit — Flux

**Purpose:** A comprehensive, stack-specific audit checklist covering every major attack category relevant to Flux — a full-stack AI assistant platform with Express/Bun, Postgres+Prisma, Supabase auth, SSE streaming, agentic tool-calling, file generation, and third-party model APIs (NVIDIA NIM, Tavily).

**How to use this doc:** Each section = one attack category. Each has: what it is, why it applies to Flux specifically, what to check in your codebase, and concrete fixes. Items already covered by your prior security pass (Helmet, rate limiting, CORS, input sanitization, AbortController timeouts) are marked ✅ — verify, don't assume.

This document intentionally does not include working exploit payloads. Verifying a fix works is best done with your own test requests against your own staging environment, not by copy-pasting attack strings from a doc.

---

## 0. Threat model — what's actually being defended

Before the checklist, be clear about your attack surface. Flux specifically has:

1. A public-facing auth flow (Supabase) → account takeover risk
2. A chat backend that accepts arbitrary user text and feeds it to an LLM → prompt injection risk
3. An agentic pipeline where the LLM can call tools (web search, file generation, weather, etc.) → excessive agency risk
4. File upload (attachments) and file generation (PDF/PPTX/DOCX/XLSX) → malicious file / path traversal risk
5. SSE streaming connections → resource exhaustion / connection abuse risk
6. A Postgres DB via Prisma → injection / access control risk
7. Third-party API keys (NVIDIA NIM, Tavily, OpenWeatherMap) → secret exposure risk
8. A locally-hosted image generation backend (FastAPI) → internal service exposure risk
9. Generated files served back to users → stored XSS / malicious download risk

Two full "Top 10" frameworks apply here simultaneously and you need both:
- **OWASP Top 10:2025** (general web app security) — released Nov 2025, covers the Express/Postgres/auth/file layer
- **OWASP Top 10 for LLM Applications 2025** — covers the parts that are unique to Flux being an LLM product, not just a CRUD app

---

## PART A — OWASP Top 10:2025 (General Web/API Security)

The 2025 edition reorganized categories based on analysis of <cite index="24-1">more than 175,000 CVE records</cite>, and made two structural changes worth knowing up front: <cite index="24-1">Server-Side Request Forgery (SSRF) was rolled into Broken Access Control</cite>, and <cite index="30-1">two new categories were added — Software Supply Chain Failures and Mishandling of Exceptional Conditions</cite>.

### A01 — Broken Access Control (now includes SSRF)

**What it is:** Users acting outside their intended permissions — <cite index="31-1">modifying a URL parameter to view another user's records, escalating privileges through JWT token manipulation, or bypassing function-level restrictions</cite>, plus SSRF (tricking your server into making requests to internal/unintended destinations on the attacker's behalf).

**Why it applies to Flux:**
- Every conversation, message, and generated file is tied to a `userId`. If any endpoint fetches by `conversationId` or `messageId` alone without checking `WHERE userId = req.user.id`, that's an IDOR (Insecure Direct Object Reference) — user A can read user B's chats.
- Your `/api/assets/:messageId/:type/:index` endpoint (used to re-fetch stripped base64 blobs) is a prime IDOR target — check that it verifies the requesting user owns the message before returning the asset.
- SSRF risk: if any backend code takes a user-supplied URL and fetches it (e.g. if Tavily results or user messages containing URLs ever get server-side fetched, or if image generation accepts a URL parameter), an attacker could point it at `http://localhost:PORT/internal-endpoint`, `http://169.254.169.254/` (cloud metadata endpoint), or your FastAPI image-gen service directly, bypassing your public API's auth.

**What to check:**
```
grep -rn "req.params" backend/ | grep -v "userId\|req.user"
```
Look for every route handler that queries by ID — confirm each one also filters by the authenticated user's ID (or explicitly checks role/ownership for shared resources).

**Fixes:**
- Every Prisma query that fetches a specific resource must include the owner check in the `where` clause, not as a separate `if` after the fact:
```typescript
// Vulnerable: fetches by ID alone, checks ownership after
const msg = await prisma.message.findUnique({ where: { id: messageId } });
if (msg.userId !== req.user.id) return res.status(403).send();

// Better: ownership is part of the query itself — no record returned if not yours
const msg = await prisma.message.findFirst({
  where: { id: messageId, conversation: { userId: req.user.id } },
});
if (!msg) return res.status(404).send(); // 404, not 403 — don't confirm existence
```
- For SSRF: never let user input directly construct a URL your backend fetches. If you must fetch external URLs server-side (link previews, etc.), maintain an allowlist of schemes (`https:` only) and explicitly block private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`) before making the request.
- Your internal FastAPI image-gen service should **not** be reachable from the public internet at all — bind it to localhost/internal network only, and never accept a raw pass-through URL to it from user input.

### A02 — Security Misconfiguration

**What it is:** <cite index="27-1">Introduced in the 2021 edition and now the #2 risk overall</cite> — debug endpoints left on, verbose error messages, default credentials, unnecessary features enabled, permissive CORS.

**Why it applies to Flux:** You already did a security pass with Helmet + CORS restriction ✅ — this section is about verifying it's actually locked down, not assuming it is.

**Check:**
- [ ] `NODE_ENV=production` is actually set in your production deploy (many frameworks skip security middleware or leak stack traces when this isn't set)
- [ ] Express error handler doesn't leak stack traces to the client in prod:
```typescript
app.use((err, req, res, next) => {
  console.error(err); // log full detail server-side
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});
```
- [ ] CORS is an explicit allowlist of your actual frontend origin(s), not `origin: '*'` or `origin: true` reflecting any request origin
- [ ] Helmet's CSP (`Content-Security-Policy`) is actually configured, not left at defaults — defaults are permissive. At minimum restrict `script-src` to your own origin and known CDNs you use (cdnjs, etc.)
- [ ] No `.env`, `.git`, or `node_modules` directories are served statically — verify your static file middleware has an explicit allowlist of directories, not a blanket `express.static(root)`
- [ ] Swagger/API docs, admin panels, or debug routes are not reachable in production without auth
- [ ] Database connection strings, API keys never appear in frontend bundle — run `grep -r "sk-\|api_key\|DATABASE_URL" frontend/dist/` after a build to confirm nothing leaked via `import.meta.env` misuse

### A03 — Software Supply Chain Failures *(new in 2025)*

**What it is:** Vulnerable or malicious third-party packages, models, or plugins — <cite index="16-1">a real-world example being a remote-code-execution vulnerability introduced by unsafe pickle deserialization when loading an untrusted model</cite>.

**Why it applies to Flux:** Full-stack TypeScript project = large `node_modules` dependency tree on both frontend and backend. Plus you have a Python FastAPI service (Bonsai Image 4B + Real-ESRGAN) — Python ML dependencies are a common vector for supply-chain attacks because of `pickle`-based model loading.

**Check:**
```bash
npm audit --production
pip list --outdated  # in the FastAPI image-gen venv
```
- [ ] Run `npm audit` on both frontend and backend `package.json` — fix or explicitly document any unfixed high/critical CVEs
- [ ] Pin exact dependency versions in production (`package-lock.json` committed, not just `package.json` ranges)
- [ ] For the Python image-gen service: confirm any model weights loaded are from trusted sources (official HuggingFace repos, not random mirrors) and that you're not using `torch.load()` / `pickle.load()` on untrusted files — prefer `safetensors` format models where possible, since pickle deserialization can execute arbitrary code
- [ ] Enable Dependabot or equivalent automated dependency scanning on your GitHub repo
- [ ] Audit any MCP servers or third-party tool integrations you connect to Flux's agentic pipeline the same way — a malicious or compromised MCP server is now part of your supply chain too

### A04 — Cryptographic Failures

**What it is:** Sensitive data exposed due to weak or missing encryption — in transit or at rest.

**Check:**
- [ ] All production traffic is HTTPS-only; backend rejects/redirects plain HTTP
- [ ] Cookies (especially Supabase session cookies) are `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict`
- [ ] Any sensitive fields stored in Postgres (if you ever store API keys per-user, payment info, etc.) are encrypted at rest, not plaintext
- [ ] JWTs (Supabase issues these) are verified with signature check on every request, not just decoded and trusted:
```typescript
// Vulnerable — decodes without verifying signature
const payload = jwt.decode(token);

// Correct — verifies signature against Supabase's public key/secret
const payload = jwt.verify(token, SUPABASE_JWT_SECRET);
```
- [ ] No hardcoded secrets in source (check git history too, not just current HEAD — `git log -p | grep -i "api_key\|secret"` on a fresh clone)

### A05 — Injection

**What it is:** <cite index="24-1">Ranges from Cross-site Scripting (high frequency, lower impact) to SQL Injection (lower frequency, higher impact)</cite>.

**Why it applies to Flux:**
- Prisma protects against classic SQL injection by parameterizing queries automatically — **but only if you use its query builder**. Any raw SQL (`prisma.$queryRawUnsafe`) reintroduces the risk.
- XSS is a real risk anywhere Flux renders markdown/HTML from either user messages or LLM output — your `MessageRenderer.tsx` and the KaTeX/Mermaid rendering pipeline are exactly the kind of place this bites.

**Check:**
```bash
grep -rn "queryRawUnsafe\|\\$executeRawUnsafe" backend/
```
- [ ] Zero uses of `$queryRawUnsafe`/`$executeRawUnsafe` with any string built from user input. If you need raw SQL, use `$queryRaw` with tagged templates (auto-parameterized) instead.
- [ ] Markdown rendering (`MessageRenderer.tsx`) uses a sanitizing renderer — if you're using `dangerouslySetInnerHTML` anywhere to render markdown-to-HTML output, it **must** go through `DOMPurify` or equivalent first:
```typescript
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(renderedHtml);
```
- [ ] This applies to LLM-generated output too, not just user input — treat model output as untrusted, since <cite index="21-1">the model generates text, and downstream code passing that text into shell commands, SQL queries, HTML renderers, or email templates recreates the same vulnerability classes the original OWASP Top 10 catalogued twenty years ago</cite>. If the model can be induced (via prompt injection, see Part B) to output an XSS payload wrapped in markdown, and your renderer doesn't sanitize, that payload executes in the victim's browser.
- [ ] KaTeX/Mermaid: both have had historical XSS CVEs via crafted input. Confirm you're on a patched version, and that Mermaid diagrams generated from LLM output are rendered with `securityLevel: 'strict'`, not `'loose'`.
- [ ] Any place user input constructs a filename, file path, or shell command (e.g. calling out to a CLI tool for PDF/PPTX generation) — never string-concatenate user input into a shell command. Use parameterized subprocess calls (`execFile` with an args array, never `exec` with a built string).

### A06 — Insecure Design

**What it is:** Architectural/business-logic flaws that exist independent of any single coding bug — <cite index="27-1">poor trust boundary definition, business-logic vulnerabilities like price manipulation or discount escalation</cite>. For Flux, the equivalent is things like: can a free-tier user manipulate a request to get unlimited premium model access? Can a user spoof their own usage limits?

**Check:**
- [ ] Model tier / rate limit enforcement happens server-side, keyed off the authenticated user, never trusting a client-supplied plan/tier field
- [ ] File generation limits (if any) are enforced server-side, not just hidden in the frontend UI
- [ ] Conversation/message limits per user are enforced at the DB/API layer, not just UX-level graying-out of buttons

### A07 — Identification and Authentication Failures

**Check:**
- [ ] Supabase auth: email verification is actually enforced before granting full access (not just a nice-to-have banner)
- [ ] Password reset / magic link tokens are single-use and time-limited (Supabase handles this by default — verify you haven't overridden defaults)
- [ ] No endpoint allows account enumeration (e.g. a login error that says "user not found" vs "wrong password" — use identical generic messages for both)
- [ ] Session tokens are invalidated server-side on logout, not just cleared client-side
- [ ] Consider rate-limiting login/signup attempts specifically (separate, tighter limit than your general API rate limit) to slow credential-stuffing attacks

### A08 — Software and Data Integrity Failures

**What it is:** Trusting data or code without verifying its integrity — insecure deserialization, unsigned/unverified updates, CI/CD pipeline compromise.

**Check:**
- [ ] Your CI/CD (GitHub Actions or equivalent) doesn't run untrusted PR code with access to production secrets — use environment protection rules for anything that touches deploy secrets
- [ ] Generated file downloads (PDF/PPTX/DOCX) aren't reconstructible/tamperable in transit — served over HTTPS, with a `Content-Disposition` header that doesn't allow path traversal in the filename (see Part D)
- [ ] Any use of `eval()`, `new Function()`, or dynamic `require()`/`import()` with a variable path built from user input — should be zero instances

### A09 — Security Logging and Alerting Failures

**What it is:** <cite index="29-1">Insufficient logging of critical transactions like failed login attempts, log integrity issues, and lack of real-time alerting on suspicious thresholds like many failed logins in a short window</cite>.

**Check:**
- [ ] Failed auth attempts, rate-limit trips, and 403/401 responses are logged with enough context (IP, user ID if known, endpoint, timestamp) to investigate later
- [ ] Logs don't themselves leak sensitive data (don't log full request bodies containing passwords, tokens, or full message content indiscriminately)
- [ ] Some alerting exists for anomalies — even a simple threshold alert (e.g. "500 rate limit trips from one IP in 5 minutes") is far better than nothing at solo-dev scale
- [ ] Logs are append-only / shipped somewhere an attacker who compromises the app server can't also delete them (even just piping to a separate logging service, not only local files)

### A10 — Mishandling of Exceptional Conditions *(new in 2025)*

**What it is:** <cite index="31-1">What happens when applications encounter unexpected inputs, resource shortages, timeouts, or internal failures — poor exception handling can leak sensitive data through verbose stack traces, bypass security controls through fail-open logic, or create denial-of-service conditions</cite>.

**Why it applies to Flux specifically:** This is directly relevant to your SSE pipeline and tool-calling architecture. What happens when:
- A tool call (web search, weather API) times out or throws?
- The NVIDIA NIM API returns a malformed response mid-stream?
- The image-gen FastAPI service is down?

**Check:**
- [ ] Every external API call (NIM, Tavily, OpenWeatherMap, FastAPI image service) has explicit timeout + error handling that **fails closed** (denies/degrades gracefully) not **fails open** (accidentally grants access or skips a check because an exception was swallowed)
```typescript
// Bad: catch swallows the error and continues as if auth succeeded
try {
  await verifyPermission(userId);
} catch {
  // continues silently — fail-open bug
}
proceedWithAction();

// Good: explicit fail-closed
try {
  await verifyPermission(userId);
} catch (err) {
  logger.error('permission check failed', err);
  return res.status(403).json({ error: 'Permission check failed' });
}
proceedWithAction();
```
- [ ] Your AbortController timeouts (already implemented ✅) actually propagate a clean error state to the SSE stream rather than leaving a connection hanging or the UI stuck
- [ ] Circuit breakers (already implemented ✅ per your recent work) — confirm they have a defined fallback behavior, not just "stop trying," so a downstream outage degrades gracefully instead of cascading

---

## PART B — OWASP Top 10 for LLM Applications 2025 (Flux-specific)

This is the part general web security checklists miss entirely, and it's the more novel attack surface for a product like Flux. <cite index="20-1">Version 2.0, released in 2025, reflects the shift from standalone chatbot deployments to production agentic systems with tool access, RAG pipelines, and multi-model architectures</cite> — which describes Flux's architecture almost exactly.

### LLM01 — Prompt Injection

**What it is:** <cite index="17-1">User inputs unintentionally alter the behavior or output of an LLM, potentially leading to guideline violations, harmful content generation, unauthorized access, or influence over critical decisions</cite>. <cite index="20-1">The indirect variant — where adversarial instructions are embedded in external content the model retrieves rather than typed directly by the user — is the most widely exploited vulnerability in production deployments</cite>.

**Why this is your #1 LLM-specific risk:** Flux does web search (Tavily) and can browse/retrieve external content as part of its agentic pipeline. That external content — a webpage, a search result snippet — is a vector for **indirect** prompt injection: an attacker plants "ignore previous instructions and do X" inside a webpage that Flux's search pipeline retrieves and feeds to the model as context. The user never typed the malicious instruction; it arrived via the tool result.

**Check:**
- [ ] Is search/tool output clearly delimited from the system prompt and user instructions in the prompt structure sent to the model (e.g. wrapped in clear tags like `<search_result>...</search_result>` with an explicit instruction that content inside is data, not commands)? This is the single most effective mitigation and costs nothing to implement.
- [ ] Does anything downstream of the model's output get executed automatically without a trust boundary — e.g. if the model's response contains something that looks like a tool call, is that validated against an allowlist of actually-available tools/parameters before execution, or trusted blindly?
- [ ] Are there any actions Flux's agent can take (file generation, external API calls) that a successfully-injected prompt could trigger without the *user's* actual intent? (This overlaps heavily with LLM06 below.)

**Fixes:**
- Structurally separate trusted (system prompt, your own instructions) from untrusted (user message, retrieved search content, tool outputs) content in every prompt you construct, and make that separation explicit to the model via prompt structure, not just comments in your code.
- <cite index="19-1">Apply semantic filters and string-checking to scan for non-allowed content, and separate and clearly denote untrusted content to limit its influence on user prompts</cite> — this is OWASP's own recommended baseline mitigation.
- Accept that prompt injection cannot be 100% prevented today — <cite index="19-1">given the stochastic nature of how models work, there's no fool-proof prevention method</cite> — so the real defense is defense-in-depth: even if injection succeeds, limit what damage it can cause via LLM06 (Excessive Agency) controls below.

### LLM02 — Sensitive Information Disclosure

**What it is:** <cite index="16-1">The model or application exposes PII, credentials, or proprietary data in its outputs</cite>.

**Why it applies:** Your system prompt itself, any user data pulled into context (memory, past conversation summaries), and any secrets accidentally included in a prompt template are all things a sufficiently motivated user could try to extract via clever questioning.

**Check:**
- [ ] System prompt never contains API keys, internal URLs, or credentials — it should be treated as something that *could* leak (see LLM07 below), so keep it clean by design
- [ ] Memory extraction / summarization (which you've done hardening work on ✅) doesn't accidentally surface one user's data into another user's context — verify memory retrieval is always scoped to `userId`
- [ ] If Flux ever logs full prompts (including system prompt + user data) for debugging, those logs are access-controlled and not something that ends up in a public bug tracker or shared Slack channel

### LLM03 — Supply Chain

Same category as Part A's A03, but LLM-specific: <cite index="16-1">third-party models, datasets, packages, and plugins introduce vulnerable or malicious components</cite>.

**Check:**
- [ ] Any MCP servers or third-party "tools" you wire into Flux's agentic pipeline are from trusted sources, and you understand exactly what each tool can do (file system access? network access?) before giving the model access to it
- [ ] If Flux ever allows the model to install/load additional tools dynamically, that's a significant risk surface — require explicit human approval for any new tool integration, never auto-approve based on model suggestion alone

### LLM04 — Data and Model Poisoning

Less directly applicable since you're consuming hosted models (NVIDIA NIM) rather than training your own — but relevant if you ever fine-tune or do RAG with a vector store built from scraped/user-submitted content (poisoned documents could skew retrieval).

### LLM05 — Improper Output Handling

**What it is:** <cite index="16-1">Model output is passed to downstream systems without validation, enabling injection, SSRF, or remote code execution</cite>. This is the same root issue as A05 (Injection) above, described from the LLM angle — the model's text output is not automatically safe just because it came from an AI rather than a user.

**This is your highest-leverage fix if not already done:** every place Flux takes LLM output and does something with it programmatically — renders it as HTML/Markdown, uses it to construct a filename, uses it as a tool-call parameter, uses it to build a file path for the PDF/PPTX generator — treat that output exactly as you'd treat raw user input. Sanitize, validate, allowlist.

**Check specific to your file generation pipeline:**
- [ ] Generated filenames (PDF/PPTX/DOCX/XLSX) are sanitized against path traversal — if the model or user can influence the filename, `../../etc/passwd`-style traversal attempts must be stripped/rejected server-side, not just client-side
```typescript
import path from 'node:path';
function sanitizeFilename(name: string): string {
  const base = path.basename(name); // strips directory components
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}
```
- [ ] Generated file content itself (e.g. if a PPTX template ever embeds raw HTML/macros) doesn't allow the model to embed active content (macros in DOCX/XLSX are a classic malware vector — confirm your generation library doesn't support or enable macros by default)

### LLM06 — Excessive Agency

**What it is:** <cite index="17-1">Excessive functionality, permissions, or autonomy granted to an LLM-based system can compromise confidentiality, integrity, and availability, depending on which systems it's connected to</cite>. This is arguably your single most important LLM-specific category, because Flux is explicitly agentic — it calls tools, generates files, and (per your architecture) has a "parallel thinking/search pipeline."

**Check:**
- [ ] Does every tool the model can call have the *minimum* permission needed, not broad access "just in case"? E.g. does your web search tool have network access only to the search API, not general outbound access to arbitrary URLs?
- [ ] Are there any irreversible or high-impact actions (sending an email, deleting data, spending money via an API) that the model can trigger *without* an explicit user confirmation step in the UI? If so, that's excessive agency — add a human-in-the-loop confirmation for anything irreversible.
- [ ] Is there a hard ceiling on how many tool calls / how much compute a single user turn can trigger, independent of your existing rate limiting? (Prevents a successful prompt injection from turning into an expensive or damaging tool-call loop.)
- [ ] Your parallelized tool-call architecture — confirm parallel tool calls can't be used to bypass a rate limit that assumes sequential calls (e.g. if rate limiting is applied per-request rather than per-tool-invocation, 10 parallel tool calls in one turn might slip past a naive limiter).

### LLM07 — System Prompt Leakage

**What it is:** Users tricking the model into revealing its system prompt, which can expose internal logic, hidden rules, or (worse) secrets accidentally embedded in it.

**Check:**
- [ ] Assume the system prompt *will* eventually leak — because it functionally always can given enough attempts — and audit it for anything you wouldn't want public: internal reasoning about business logic, unpublished feature flags, or (critically) any embedded credentials.
- [ ] Don't rely on system-prompt-based rules as your *only* enforcement of anything security-critical (e.g. "don't reveal user data from other accounts" should be enforced by your data access layer, which literally cannot return other users' data, not by asking the model nicely not to).

### LLM08 — Vector and Embedding Weaknesses

Relevant if/when your BGE-M3 embedding work is used for retrieval (RAG) rather than just query classification. If embeddings are used to retrieve context that gets fed back into a prompt, the same injection concerns from LLM01 apply to whatever gets retrieved — and access control matters too (a user's query shouldn't be able to retrieve another user's embedded/stored content).

**Check:**
- [ ] If you build a vector store of user data (memory, past conversations) for retrieval, confirm retrieval queries are scoped per-user at the query level, not filtered after the fact
- [ ] If BGE-M3 embeddings are ever used for anything beyond your own query classification (e.g. semantic search across shared/public content), audit what's actually being embedded and whether it could contain anything sensitive

### LLM09 — Misinformation

**What it is:** The model generating confident-sounding but false content. Directly relevant given your own stated practice of "adversarial stress-testing and fact-checking of Flux's outputs" — keep doing that, and consider:
- [ ] Surfacing source attribution (you already do this — the Perplexity-style search block with favicons/domain attribution ✅) so users can verify claims themselves
- [ ] Being conservative about letting the model state things with unwarranted confidence in domains where hallucination risk is high (medical, legal, financial) — this is a prompt/product design question more than a "security" one, but it's in the same OWASP category

### LLM10 — Unbounded Consumption

**What it is:** <cite index="16-1">Uncontrolled resource or query use enabling denial of service and runaway cost</cite> — and one of the most concrete, actionable risks for a solo-dev project paying for API usage out of pocket. <cite index="21-1">A token-flood attack sends prompts engineered to maximize generation costs; recursive context expansion forces the model to process ever-larger inputs; a buggy agent stuck in a loop can run up six figures of API spend over a weekend before anyone notices</cite>.

**This deserves real attention given Flux's usage-based cost model (NVIDIA NIM, Tavily calls all cost money per request).**

**Check:**
- [ ] Per-user rate limits exist specifically on LLM-invoking endpoints (not just general API rate limiting) — <cite index="21-1">token rate limiting per agent, per user, per application, per model</cite>
- [ ] Hard caps on max tokens per request/response, max context window size accepted, and max tool-calls per conversation turn
- [ ] Quota enforcement by time window (per minute/day/month) with alerting — even a simple daily-spend-check cron job that emails you if usage crosses a threshold is far better than discovering a $2,000 bill after the fact
- [ ] Your circuit breakers (already implemented ✅) should specifically include a cost/usage circuit breaker, not just a latency/error-rate one
- [ ] If Flux allows very long conversations, confirm context isn't unboundedly growing per-turn — trimming/summarization should cap the token cost of each subsequent request regardless of conversation length

---

## PART C — SSE / Real-time Streaming Specific

Not covered by either Top 10 list directly, but a real Flux-specific surface given your architecture.

- [ ] **Connection exhaustion:** is there a cap on concurrent SSE connections per user/IP? An attacker opening hundreds of streaming connections simultaneously can exhaust server file descriptors / worker threads.
- [ ] **Slowloris-style abuse:** does your reverse proxy / server have a reasonable idle-connection timeout for SSE streams that stop being consumed by the client but aren't closed?
- [ ] Your fixed `.trim()`-stripping-spaces-at-chunk-boundaries bug ✅ — good that it's fixed, but confirm the fix didn't introduce a new issue where malformed/adversarial chunk boundaries could break your SSE parser in a way that hangs the connection.
- [ ] Are SSE messages authenticated per-connection (token checked at connection open) and is that token re-validated if the connection is long-lived, in case a session is revoked mid-stream?

---

## PART D — File Upload & Generation Specific

You have both directions here — user uploads (attachments) and server generation (PDF/PPTX/DOCX/XLSX) — each with different risks.

### Uploads (user → Flux)
- [ ] File type validation checks actual file content/magic bytes, not just the extension or client-supplied MIME type (a `.pdf` extension with an executable inside is a classic bypass)
- [ ] Uploaded files are stored outside the web root, or in object storage (S3-equivalent) with no direct public URL unless explicitly granted, and served through your own auth-checked endpoint
- [ ] Upload size limits are enforced server-side (not just in the frontend dropzone component)
- [ ] Antivirus/malware scanning on uploads if feasible (ClamAV or a cloud scanning API) — at minimum for anything that gets processed server-side (e.g. if you parse uploaded PDFs/DOCX for content, a malformed file could be crafted to exploit the parsing library itself — keep those libraries current)

### Generation (Flux → user)
- [ ] Covered above in LLM05 — filename sanitization is the top concrete risk
- [ ] Generated documents don't embed live macros/scripts (DOCX/XLSX macro injection) — verify your generation library (whatever you're using for these formats) doesn't have macro support enabled by default
- [ ] `Content-Disposition: attachment` header set correctly so browsers download rather than execute/render generated files inline where that could matter (e.g. an SVG or HTML "export" format rendered inline could carry XSS)

---

## PART E — Quick Reference: Testing Tools Worth Running

None of these require paid tools at solo-dev scale:

| Tool | What it checks | Cost |
|---|---|---|
| `npm audit` / `pip-audit` | Known CVEs in dependencies | Free |
| OWASP ZAP | Automated web app scanning (XSS, injection, headers) | Free |
| `sqlmap` (only against your own staging, never production without a plan) | SQL injection surface — mostly moot with Prisma, but useful to confirm | Free |
| Mozilla Observatory (observatory.mozilla.org) | Security headers (CSP, HSTS, etc.) grading | Free |
| GitHub Dependabot / CodeQL | Automated dependency + static analysis scanning | Free for public/most private repos |
| Manual prompt injection red-teaming | Try to get your own agent to ignore instructions via crafted search results / uploaded documents | Free (your own time) |

---

## Priority Order (if doing this incrementally)

Given Flux's specific architecture, tackle in this order for maximum risk reduction per hour spent:

1. **IDOR audit (A01)** — one missing ownership check on `/api/assets/...` or conversation endpoints is a full data breach. Highest severity, usually fastest to fix.
2. **Unbounded Consumption (LLM10)** — directly protects your wallet, not just abstract "security."
3. **Improper Output Handling / Injection (A05 + LLM05)** — sanitize LLM output before rendering/executing, sanitize generated filenames.
4. **Excessive Agency (LLM06)** — scope down what tools can do, add confirmation for irreversible actions.
5. **Prompt Injection defenses (LLM01)** — structurally delimit untrusted tool/search content from instructions.
6. Everything else in Part A (misconfiguration, logging, supply chain) — important but lower urgency for a pre-scale solo project than the five above.

---

## Sources

- OWASP — [Top 10:2025 Introduction](https://owasp.org/Top10/2025/0x00_2025-Introduction/)
- OWASP GenAI Security Project — [Top 10 for LLM Applications 2025 (PDF)](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf)
- Repello AI — [OWASP LLM Top 10 (2026) Explained](https://repello.ai/blog/owasp-llm-top-10-2026)
- Kodem Security — [OWASP Top 10 for LLM Applications](https://www.kodemsecurity.com/resources/owasp-top-10-for-llm-applications)
- Gravitee — [OWASP Top 10 for LLM Applications (2025): A Practical Guide](https://www.gravitee.io/blog/owasp-top-10-for-llm-applications-2025-a-practical-guide)
- SentinelOne — [OWASP Top 10: Vulnerabilities, Risks and How to Fix Them](https://www.sentinelone.com/cybersecurity-101/cybersecurity/owasp-top-10/)
- Equixly — [OWASP Top 10 2025 vs 2021](https://equixly.com/blog/2025/12/01/owasp-top-10-2025-vs-2021/)
