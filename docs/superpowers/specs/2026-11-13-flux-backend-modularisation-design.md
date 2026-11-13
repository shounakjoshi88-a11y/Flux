# Flux backend modularisation — design

Status: approved 2026-11-13
Branch: `refactor/backend-modularisation`
Scope: backend structure only. Behaviour, API contracts and UI are unchanged.

## Why

`backend/index.ts` is 6,120 lines and holds six unrelated jobs: server bootstrap,
security middleware, SSE plumbing, model routing, the 21-tool factory, document
generation, and every HTTP route. Around it, 33 loose top-level `.ts` files and
single-file folders (`lib/`, `tools/`, `wiki/`, `sandbox/`) give no consistent
answer to "where does this belong".

There is no test suite and no typecheck baseline, so the refactor needs an
independent pass/fail signal before any code moves.

## Goals

1. `backend/index.ts` becomes a ~80-line entry point: build app, mount routes, listen.
2. Every file has one reason to exist and lives in a folder that says why.
3. Dependency direction is one-way: `index.ts → server.ts → app.ts → http/routes → agents|services → config|db`.
4. Tools receive a `StreamWriter`, not a live Express `res`, so they can run headless and be tested.
5. Module-level mutable state is owned by a module with explicit `init()` / `close()`.
6. The repository stops carrying dead files, generated code and planning documents in the root.

## Non-goals

- No framework change, ORM change, or API contract change.
- No model catalog refresh, no dependency upgrades beyond what the build needs.
- No frontend restructuring in this phase (phase 2, same strangler pattern).
- No new product features.

## Method

Strangler: one module per commit. In every commit the code moves, imports are
repointed in the same commit, the bundle is built, the route inventory is
diffed, and the commit lands only when both agree. The app is runnable at every
commit.

## Step 0 — safety net

| Artifact | Purpose |
|---|---|
| `backend/config/env.ts` | zod schema over every env var, parsed once, fatal message lists what is missing. |
| `backend/.env.example` | Documented var list, marks optional vs required. |
| `backend/scripts/route-inventory.mjs` | Boots the app in SMOKE_MODE and writes the registered route table to `docs/refactor/routes.json`. |
| `backend/scripts/smoke.mjs` | Boots in SMOKE_MODE, hits every route, reports non-2xx/3xx and any 5xx as failure. |
| `docs/refactor/baseline-types.txt` | `tsc --noEmit` output at the start. Later runs may not add errors. |

`SMOKE_MODE=1` swaps Prisma, Supabase, E2B and NIM for inert stubs so the app
boots on a machine with no database and no keys.

## Target tree

```
backend/
  index.ts                 entry, ~80 lines
  server.ts                http/https + websocket bootstrap
  app.ts                   express assembly: middleware, routers, error handler
  config/                  env, constants, cors, limits
  db/                      prisma singleton, schema, migrations
  http/
    middleware/            auth, rate limiters, security, error handler
    sse/                   writers + event name registry
    routes/                one router per route group
  agents/
    tools/                 tool implementations by domain
    tools/registry.ts      tool metadata
    permissions.ts         pending permissions, approve/deny
    model-router.ts        selectModel, fallback proxy, circuit breaker, vision set
    orchestrator/          planner, executor, verifier
    subagent.ts
    task/                  intent detection, DAG loop, task routes
    protocol/              websocket, session, team (renamed from agent-protocol)
  services/
    documents/             builders by format + generation pipeline
    memory/                extraction, retrieval, embedder, pruning
    wiki/                  graph manager
    sandbox/               E2B manager
    search/                tavily, cache, query sanitation, relevance
    weather/
    news/
    voice/
    pdf/
    files/                 mime, category, symbol extraction, context building
  prompts/                 system prompt parts, generation prompts, skills index
  scripts/                 route inventory, smoke
```

## Move order

1. `config/`
2. `http/sse/`
3. `http/middleware/` + `db/prisma.ts`
4. `services/files/`, `services/search/`
5. `services/documents/`
6. `services/news/`, `weather/`, `voice/`, `pdf/`
7. `agents/model-router.ts`
8. `agents/permissions.ts`
9. `agents/tools/`
10. `http/routes/`
11. `/flux_ask` + `/api/chat-sdk`
12. `index.ts` → `app.ts` + `server.ts`

## Verification per commit

1. `bun build backend/index.ts --target=bun --outdir .tmp/build` — import graph resolves.
2. `tsc --noEmit -p backend` — no new errors against baseline.
3. Route inventory diff — same paths, same methods, no accidental duplicate.
4. `SMOKE_MODE=1 bun backend/scripts/smoke.mjs` when deps are installed.
5. A commit moving more than ~400 lines is split.

## Known defects carried in from the audit

- Duplicate `GET /news` (lines 4220 and 6207) — the second is unreachable.
- `backend/tsconfig.json` aliases `@common/*` and `@host/*` to folders that do not exist.
- `frontend/src/components/MessageItem.tsx.bak` — 1,592 dead lines.
- `backend/prisma/generated` — 18,560 generated lines tracked in git.
- Two lockfiles at the root.
- Twelve planning `.md` files in the repository root.
- Azure Container Registry admin password hardcoded in the deploy workflow; Unsplash key hardcoded in `frontend/src/lib/config.ts`.

## Risks

| Risk | Mitigation |
|---|---|
| No tests, so a silent behaviour change looks like success | Bundle + route inventory + smoke; keep each commit small; move the 1,400-line `/flux_ask` last. |
| Circular imports once tools and services split | Enforce the layer rule; `agents/` may import `services/`, never the reverse. |
| `res`-bound tools break when converted to `StreamWriter` | Convert one tool group at a time, keeping an adapter that wraps `res` into a writer. |
| Shallow clone (depth 1) hides history | Accept for the refactor; do not rewrite history in this branch. |
