# Flux backend — module map

The backend is a Bun/Express/Prisma application. `index.ts` is the entry point;
`app.ts` assembles the Express app and `server.ts` starts listening.

## Layout

```
backend/
  index.ts              entry point (12 lines)
  app.ts                Express assembly: security stack, routers, error handler
  server.ts             http/https + WebSocket bootstrap, cache seed, task recovery
  config/
    env.ts              zod schema over every env var; assertEnv() fails fast
    constants.ts        body limit, SSE limits, rate-limit budgets
    cors.ts             CORS options (origin: true today; allow-list exported)
  db/
    prisma.ts           Prisma client singleton (PrismaPg adapter)
    supabase.ts         Supabase service-role client
  http/
    middleware/         auth, security stack, rate limiters
    sse/                writers (+ StreamWriter), connection tracking
    util/               sanitize, url, slug
    routes/             one router per route group (see below)
  agents/
    model-router.ts     NIM_MODELS, VISION_MODELS, selectModel, routeModel,
                        getProviderOptions, AVAILABLE_MODELS
    permissions.ts      pending permission store
    tools/              ToolContext, factory, timeout table, AgentState
      groups:           search, documents, weather, images, exec, files, apps,
                        wiki, research
  services/
    files/              mime sniffing, file analysis
    search/             tavily client, query rewriting
    documents/          intent, JSON repair, generation pipeline, chunks, types
    pdf/                PDF/DOCX extraction
    images/             image service client + prompt helpers
    weather/            weather providers
    conversations/      auto-rename
    news/               feed + categories
    net/ssrf.ts         SSRF guard
  prompts/              agent extension, sanitize, user-input wrapper
  sync/                 SyncManager, types, broadcast helper
  scripts/              route-inventory.mjs, smoke.mjs, cut-block.mjs
```

## Route groups (http/routes/)

| Router | Mounts |
|---|---|
| diagnostics | /ping, /whoami, /health, /api/tools, /skills/:name, /api/models, /api/permissions/respond |
| integrations | Google OAuth callback/init/status/disconnect |
| sandbox | /api/sandbox/upload, /api/sandbox/download/:id/:file |
| wiki | /api/wiki, /api/wiki/node/:id, /api/wiki/search, /api/wiki/rebuild/* |
| conversations | /conversations*, /conversation/:id, /api/assets/:id/:type/:index, /artifacts |
| news | /news |
| memories | /memories, /memories/:id |
| flux-ask | /flux_ask |
| chat-sdk | /api/chat-sdk |
| tts | /api/tts/local |
| articles | /news/search, /summarize, /proxy, /preview |
| openai-compat | /v1/chat/completions |
| multiagent | /api/multiagent-build |
| agents | /api/acp/capabilities, /api/agents/custom |

`taskRouter` (from task-routes.ts) is also mounted for the long-running task system.

## Verification

```powershell
cd backend
bunx tsc --noEmit          # baseline: 1 pre-existing error
node scripts/route-inventory.mjs --check   # 43 unique routes
node scripts/smoke.mjs                     # 23 GET routes, 0 failures
```

## Environment

Copy `backend/.env.example` to `backend/.env` and fill in the required values.
`SMOKE_MODE=1` boots with placeholder credentials (no database needed).
