# Flux Upgrade Plan: opencode Connector + Sandboxed Subagent Orchestration

## Audience note for the implementing model

This document will be executed by an AI coding model (not the original author). Follow it literally and in order. Every phase has an **Exit Criteria** section — do not proceed to the next phase until those criteria are verifiably met. Where this document says "VERIFY BEFORE PROCEEDING," stop and confirm the assumption against the actual codebase before writing dependent code, since guessing here will produce code that silently doesn't fit the existing architecture.

This plan integrates two independent features into the existing Flux backend (`backend/index.ts`, a ~6600-line Express server):

- **Track A**: An OpenAI-compatible `/v1/chat/completions` endpoint so the terminal coding tool **opencode** can use Flux's NVIDIA NIM-backed models as a provider.
- **Track B**: A sandboxed multi-subagent project builder using E2B sandboxes, where a planner agent splits a project into subtasks, dispatches isolated subagents in parallel, and integrates their output into one working project.
- **Track A+B seam**: Exposing Track B's subagent builder as a callable tool from inside Track A's endpoint, so an opencode user can trigger full project generation from their terminal.

Tracks A and B do **not** depend on each other and can be built and tested independently. Only Phase 3 connects them. Do not skip independent testing of A and B before attempting the seam.

---

## Known facts about the existing codebase (already verified — do not re-derive)

### `backend/nim-client.ts`
```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
export const nim = createOpenAICompatible({
    name: 'nim',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    headers: { Authorization: `Bearer ${process.env.NIM_API_KEY}` },
    fetch: customFetch, // has built-in 429 retry with exponential backoff
});
```
This is a Vercel AI SDK provider. Model instances are obtained via `nim.chatModel(modelId)` or similar (VERIFY exact accessor method against installed `@ai-sdk/openai-compatible` version before use — the plan assumes `nim.chatModel(id)` based on prior codebase description, but confirm the actual export shape in `nim-client.ts` usage elsewhere in `index.ts` first).

### `backend/index.ts` (6630 lines) — relevant known locations
- Line 264: `NIM_MODELS` — list of 18 available NIM model IDs
- Line 294: `createFallbackModel` — Proxy wrapping `doGenerate`/`doStream` with timeout + fallback chain
- Line 382: `selectModel` — returns a `nim.chatModel()` instance with Proxy-based fallback
- Line 396: `routeModel` — classifies query → model tier via `query-router.ts`
- Line 411: `getProviderOptions` — sets `{ nim: { enable_thinking: true } }` for reasoning models
- Line 536: `writeSafeSSE(res, content)` — writes `data: <content>\n\n` (NOT OpenAI delta format)
- Line 550: `writeReplaceText` — sends `event: replace_text\ndata: {}\n\n`
- Line 555: `sendStatus(res, ...)` — sends `event: status\ndata: <JSON>\n\n`
- Line 2634–3675: `createFluxTools(res, model, state, userQuery?, activeConversationId?, uid?, abortSignal?)` — returns an object of Vercel AI SDK `tool()` definitions: `web_search, read_skill, generate_document, get_weather, generate_image, run_python, run_bash, read_file, write_file, list_files, install_package, edit_file, wiki_search, create_project, start_app, stop_app, list_apps, get_app_logs, get_app_url, get_generated_file, read_url, retrieve_doc_chunks, ...createGoogleTools(uid, res, state)`. **Every tool's `execute` function calls `sendStatus(res, ...)` or `res.write(...)` directly — tools are NOT pure functions, they are bound to a live SSE response.** This is the central architectural obstacle Phase 2 must solve.
- Line 4313: `/flux_ask` route — custom Flux SSE format (`event: status`, `event: thought`, `event: error`, `event: sources`, `event: follow_ups`, `event: replace_text`, `event: code_execution`, `event: file`, `event: wiki_update`, `event: message_id`). Do not modify this route. Do not reuse its logic path for Track A.
- Line 5805: `/api/chat-sdk` route — uses `streamText().toTextStreamResponse()`. Already uses a "noop res" pattern at line 5817 for cases where direct SSE writing isn't wanted — **read this exact pattern before writing Phase 2's headless tool refactor**, since it's precedent already in the codebase for decoupling tools from `res`.
- Line 6266: `/summarize` route — simple `data: <text>\n\n` format, ends `data: [DONE]\n\n`.
- Line 6496: `GET /api/models` — returns `{ categories: AVAILABLE_MODELS, all: [...] }`.
- `AgentState` type — carries `sources, generatedFiles, thoughtProcess, searchCount, wikiSearchCount, searchContent, weatherDone` across a single request's tool calls. Each subagent in Track B needs its own independent `AgentState` instance.

### `backend/sandboxManager.ts` (full file, already read — reproduced for reference)
```ts
import { Sandbox } from '@e2b/code-interpreter';

export class SandboxManager {
  private sandboxes = new Map<string, { sandbox: Sandbox; lastUsed: number }>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }

  async getOrCreate(conversationId: string): Promise<Sandbox> {
    // Keyed by conversationId. Reuses existing sandbox if healthy, else creates new.
    // Timeout extended to 1_800_000ms (30 min) on every access.
    // Health-checked via 'echo alive' only if idle > 3 min.
    // New sandboxes get pandas/numpy/matplotlib/seaborn/plotly/scipy/scikit-learn/pillow/requests pre-installed.
  }

  async uploadFile(conversationId: string, filename: string, content: Buffer | string): Promise<string> {
    // Writes to /home/user/${filename}. Returns remote path.
  }

  async downloadFile(conversationId: string, remotePath: string): Promise<Buffer> {
    // Reads file, returns Buffer.
  }

  async kill(conversationId: string): Promise<void> { /* kills and removes from map */ }

  private async cleanup(): Promise<void> {
    // Kills sandboxes idle > 12 minutes, runs every 2 minutes.
  }
}

export const sandboxManager = new SandboxManager();
```

**Critical fact: there is NO sandbox-to-sandbox file transfer method.** File movement between sandboxes must round-trip through Node: `downloadFile(sourceId, path)` → `Buffer` → `uploadFile(destId, path, buffer)`.

**Critical fact: there is NO `listFiles` method.** Phase 2 must add one (see Phase 2, Step 2.1).

**Critical fact: `getOrCreate` is keyed by an arbitrary string, not strictly a real conversation ID.** This means passing a synthetic ID like `${buildId}-subagent-backend` transparently creates an isolated sandbox per subagent — no changes needed to `SandboxManager` itself for isolation, only the addition of `listFiles`.

### E2B free tier limits (verified via web search, current as of plan writing — re-verify if significant time has passed)
- 100 sandbox hours/month, no credit card required
- Up to 5 concurrent sandboxes on the free "Hobby" tier per some sources, up to 20 per others — **VERIFY BEFORE PROCEEDING with Phase 2**: check the actual current E2B dashboard limit for the account in use, since sources disagreed (5 vs 20) and this determines the hard concurrency cap enforced in Phase 2 Step 2.4.
- Max 1 hour session duration on free tier (NOT 24 hours — that's Pro only)
- 40,000 requests per 60 seconds per IP, globally across all sandbox operations

---

## PHASE 1: Track A — opencode Connector

### Step 1.1 — Create `backend/openai-compat.ts`

New file. Contains pure translation functions, no side effects, no `res` access.

Required exports:

```ts
// Converts an AI SDK streamText fullStream part into an OpenAI-format SSE chunk object (not yet stringified).
function toOpenAIChunk(params: {
  completionId: string;
  model: string;
  delta: { content?: string; tool_calls?: any[] };
  finishReason?: string | null;
}): object

// Converts opencode's OpenAI-format `tools` array (from request body) into Vercel AI SDK tool() definitions
// using the `tool` import from 'ai' and z.object() schemas built from each tool's JSON schema `parameters`.
function fromOpenAITools(openAiTools: any[]): Record<string, any>

// Validates an incoming `model` string from the request body against NIM_MODELS (imported from index.ts —
// VERIFY NIM_MODELS is exported from index.ts; if not, export it before importing here, or move the
// NIM_MODELS constant to a shared file both index.ts and openai-compat.ts can import).
function mapModelId(requestedModel: string): string // throws or returns validated ID
```

Write a helper `sseLine(obj: object): string` that returns `` `data: ${JSON.stringify(obj)}\n\n` `` — use this everywhere chunks are written to avoid format drift.

### Step 1.2 — Add new route to `backend/index.ts`

Add near the other route definitions (do not insert inside the 2634–3675 `createFluxTools` block or inside `/flux_ask` or `/api/chat-sdk`). Suggested location: immediately after the `/api/models` block (~line 6498), before `/api/acp/capabilities`.

```ts
import { toOpenAIChunk, fromOpenAITools, mapModelId, sseLine } from './openai-compat';

// Dedicated rate limiter — do NOT reuse aiLimiter, opencode may poll more frequently than chat UI usage.
const openAICompatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // adjust based on observed opencode usage patterns after Phase 1 testing
  message: { error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } },
  keyGenerator: (req: any) => req.headers.authorization || 'anonymous',
});

app.post('/v1/chat/completions', openAICompatLimiter, /* AUTH MIDDLEWARE — see Step 1.3 */, async (req, res) => {
  const { model, messages, stream = true, temperature, tools } = req.body;

  let mappedModel: string;
  try {
    mappedModel = mapModelId(model);
  } catch (e: any) {
    return res.status(400).json({ error: { message: e.message, type: 'invalid_request_error' } });
  }

  const completionId = `chatcmpl-${crypto.randomUUID()}`;
  const selectedModel = nim.chatModel(mappedModel); // VERIFY this accessor matches nim-client.ts's actual API

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const result = streamText({
      model: selectedModel,
      messages,
      temperature,
      tools: tools ? fromOpenAITools(tools) : undefined,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        res.write(sseLine(toOpenAIChunk({
          completionId, model: mappedModel,
          delta: { content: part.textDelta },
        })));
      } else if (part.type === 'tool-call') {
        res.write(sseLine(toOpenAIChunk({
          completionId, model: mappedModel,
          delta: {
            tool_calls: [{
              index: 0,
              id: part.toolCallId,
              type: 'function',
              function: { name: part.toolName, arguments: JSON.stringify(part.args) },
            }],
          },
        })));
      } else if (part.type === 'finish') {
        res.write(sseLine(toOpenAIChunk({
          completionId, model: mappedModel,
          delta: {},
          finishReason: part.toolCalls?.length ? 'tool_calls' : 'stop',
        })));
      }
      // NOTE: handle part.type === 'error' explicitly — write an OpenAI-format error chunk and end the stream,
      // do not let an unhandled part type silently hang the connection.
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e: any) {
    console.error('[v1/chat/completions] error:', e?.message);
    // If headers already sent (mid-stream), write an SSE error event and end. Otherwise, send a normal JSON error.
    if (res.headersSent) {
      res.write(sseLine({ error: { message: e?.message || 'Internal error', type: 'server_error' } }));
      res.end();
    } else {
      res.status(500).json({ error: { message: e?.message || 'Internal error', type: 'server_error' } });
    }
  }
});
```

### Step 1.3 — Auth decision (must be made explicitly, not deferred)

opencode sends `Authorization: Bearer <key>`. This is NOT a Supabase user session token — opencode users are not logged into Flux's web app. Two options, pick one and implement it before Step 1.4:

- **Option A (simpler, recommended for v1)**: Generate a small number of static API keys (env var, e.g. `OPENCODE_API_KEYS=key1,key2`), check `req.headers.authorization` against this list in a small dedicated middleware function. No DB involved.
- **Option B (more work, defer unless multi-user access is needed immediately)**: Issue per-user API keys tied to Supabase user IDs, stored in a new Prisma table, validated per-request against the DB.

Write the chosen middleware as `backend/openai-auth.ts`, export a function `openAICompatAuth(req, res, next)`, and insert it into the route signature at Step 1.2 in place of the `/* AUTH MIDDLEWARE */` placeholder.

### Step 1.4 — Client-side opencode config

This is what the end user (not the implementing model) will put in `~/.config/opencode/config.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "flux": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Flux",
      "options": {
        "baseURL": "https://<your-flux-backend-domain>/v1"
      },
      "models": {
        "deepseek-v4-pro": { "name": "DeepSeek V4 Pro" },
        "kimi-k2.6": { "name": "Kimi K2.6" }
      }
    }
  }
}
```
Model IDs in this block must exactly match what `mapModelId` accepts (i.e., entries in `NIM_MODELS`). Store the API key from Step 1.3 via `opencode auth login` → select "Other" → paste the key, or place it directly in opencode's credential store per its docs.

### Phase 1 Testing (mandatory before Phase 2 or Phase 3)

1. Test plain chat (send a request with no `tools` field) — confirm opencode displays coherent streamed text, no malformed JSON errors in opencode's logs.
2. Test with opencode's own local tools active (file edit, bash) — confirm tool-call deltas are correctly received and opencode successfully invokes its local tools based on them. **Test against at least 2 different NIM models** (e.g., `deepseek-v4-pro` and `kimi-k2.6`) since open models vary in tool-call output reliability — pick whichever is more consistent as the recommended default in Step 1.4's example config.
3. Test error handling: send a malformed request (bad model ID) and confirm a clean 400 response, not a hung connection.

### Phase 1 Exit Criteria
- [ ] opencode can complete a full chat turn using a Flux-backed model with plain text streaming
- [ ] opencode can successfully call its own local file/bash tools using tool-calls proxied through Flux
- [ ] Auth rejects requests with missing/invalid keys with a proper 401
- [ ] No unhandled promise rejections or hung SSE connections observed in server logs during a 20+ message test session

Do not proceed to Phase 3 until all four boxes are checked. Phase 2 may proceed in parallel since it is independent.

---

## PHASE 2: Track B — Sandboxed Subagent Orchestration

### Step 2.1 — Add `listFiles` to `backend/sandboxManager.ts`

Add this method to the existing `SandboxManager` class (do not create a new file for this — it belongs with the other sandbox primitives):

```ts
async listFiles(conversationId: string, dir = '/home/user'): Promise<string[]> {
  const sandbox = await this.getOrCreate(conversationId);
  const result = await sandbox.commands.run(`find ${dir} -type f`, { timeoutMs: 10_000 });
  return result.stdout.trim().split('\n').filter(Boolean);
}
```

VERIFY: `sandbox.commands.run` return shape includes `.stdout` as used elsewhere in the codebase (it does, per existing `run_bash`/`run_python` tool implementations inside `createFluxTools` — confirm by reading those tool bodies at line 2634+ before assuming this exact property name).

### Step 2.2 — Create `backend/agent-tools-headless.ts`

This is a refactor of `createFluxTools` (line 2634 of `index.ts`), not a new tool set. Copy the function, rename to `createHeadlessFluxTools`, and change its signature and internals as follows:

```ts
type StatusCallback = (event: string, data: any) => void;

function createHeadlessFluxTools(
  onStatus: StatusCallback,   // REPLACES the `res` parameter
  model: any,
  state: AgentState,
  userQuery?: string,
  activeConversationId?: string, // this will be the synthetic subagent sandbox ID, see Step 2.3
  uid?: string,
  abortSignal?: AbortSignal
) {
  // Copy each tool definition from the original createFluxTools.
  // Inside each tool's execute(), replace every occurrence of:
  //   sendStatus(res, 'eventName', data)
  // with:
  //   onStatus('eventName', data)
  // And replace every direct res.write(...) call similarly — route through onStatus instead.
  // Tool logic itself (the actual work each tool does) does NOT change, only the output channel.
  return { /* same tool keys as createFluxTools */ };
}
```

VERIFY BEFORE PROCEEDING: read the actual bodies of `sendStatus`, `writeSafeSSE`, and each tool's `execute` function in the real `index.ts` (lines 2634–3675 plus the helper definitions around lines 536–555) to find every `res`-touching call site. The plan above assumes all such calls funnel through `sendStatus`/`writeSafeSSE`/direct `res.write` — if any tool has additional direct `res` access not captured by these helpers, it must also be redirected to `onStatus`, or that tool will crash when `res` is undefined in the headless context.

Reference the existing "noop res" pattern at `index.ts` line 5817 (inside `/api/chat-sdk`) — this is precedent in the codebase for a similar problem and may contain a reusable pattern or existing noop object shape worth adopting here for consistency, rather than inventing a new one.

### Step 2.3 — Create `backend/subagent.ts`

```ts
import { sandboxManager } from './sandboxManager';
import { createHeadlessFluxTools } from './agent-tools-headless';
// import runTaskLoop or streamText directly — VERIFY which is more appropriate by reading task-loop.ts
// (not yet reviewed as of this plan — see "Open Verification Items" at the end of this document)

interface SubagentTask {
  id: string;            // e.g. "backend", "frontend", "tests"
  buildId: string;        // groups all subagents + integration under one build
  instructions: string;   // the specific task description from the planner step
}

interface SubagentResult {
  id: string;
  sandboxId: string;      // the synthetic conversationId used — needed by integration step
  filesWritten: string[];
  summary: string;
  success: boolean;
  error?: string;
}

async function runSubagent(
  task: SubagentTask,
  onStatus: (event: string, data: any) => void
): Promise<SubagentResult> {
  const sandboxId = `${task.buildId}-subagent-${task.id}`;

  const state: AgentState = {
    sources: [], generatedFiles: [], thoughtProcess: [],
    searchCount: 0, wikiSearchCount: 0, searchContent: [], weatherDone: false,
  };

  const tools = createHeadlessFluxTools(
    (event, data) => onStatus(event, { ...data, subagentId: task.id }), // tag every event with subagent ID
    /* model */ nim.chatModel(/* choose a model — VERIFY which model ID to default to based on Phase 1 testing results */),
    state,
    task.instructions,
    sandboxId, // this becomes activeConversationId, which sandboxManager.getOrCreate uses as its key
  );

  try {
    // IMPLEMENTATION CHOICE — pick one after reading task-loop.ts:
    // (a) call streamText directly here with tools + a system prompt instructing the subagent
    //     to write all files under a subdirectory named after task.id (e.g. /home/user/backend/...)
    //     to avoid path collisions during integration (Step 2.4).
    // (b) reuse runTaskLoop/planTask from task-loop.ts if their signatures accept a custom tools object.
    // This plan defaults to (a) as the safer assumption until task-loop.ts is reviewed.

    const result = await streamText({
      model: nim.chatModel(/* same model as above */),
      messages: [
        { role: 'system', content: `You are the ${task.id} subagent. Write all files under /home/user/${task.id}/. ${task.instructions}` },
        { role: 'user', content: task.instructions },
      ],
      tools,
      stopWhen: stepCountIs(15), // hard cap on tool-call steps per subagent — prevents runaway loops burning sandbox hours
    });

    // Drain the stream (headless — no client waiting on this directly)
    for await (const _ of result.fullStream) { /* consumed for side effects via onStatus */ }

    const filesWritten = await sandboxManager.listFiles(sandboxId, `/home/user/${task.id}`);
    return { id: task.id, sandboxId, filesWritten, summary: state.thoughtProcess.join('\n'), success: true };
  } catch (e: any) {
    return { id: task.id, sandboxId, filesWritten: [], summary: '', success: false, error: e?.message };
  }
}

export { runSubagent };
export type { SubagentTask, SubagentResult };
```

### Step 2.4 — Create `backend/orchestrator-multiagent.ts`

```ts
import { sandboxManager } from './sandboxManager';
import { runSubagent } from './subagent';
import type { SubagentTask, SubagentResult } from './subagent';
import { generateText } from 'ai';
import { z } from 'zod';

const MAX_SUBAGENTS = 3;          // hard cap — do not exceed regardless of planner output
const MAX_ITERATIONS = 2;         // hard cap on retry loops
const MAX_CONCURRENT_SANDBOXES = 3; // VERIFY actual E2B free-tier concurrency limit on the account in use before finalizing this number — sources disagreed between 5 and 20; 3 is a conservative default safe under either reading

interface BuildRequest {
  buildId: string;
  projectDescription: string;
}

async function planSubtasks(projectDescription: string): Promise<SubagentTask[]> {
  const buildId = crypto.randomUUID();
  const { text } = await generateText({
    model: nim.chatModel(/* pick a model good at structured planning — VERIFY choice after Phase 1 testing */),
    prompt: `Break this project into at most ${MAX_SUBAGENTS} independent subtasks (e.g. backend, frontend, tests). Respond ONLY with JSON: [{"id": "backend", "instructions": "..."}, ...]. Project: ${projectDescription}`,
  });
  const parsed = JSON.parse(text); // WRAP IN TRY/CATCH — model may not always return clean JSON, add a retry-once-on-parse-failure path
  return parsed.slice(0, MAX_SUBAGENTS).map((t: any) => ({ ...t, buildId }));
}

async function integrateSubagentResults(
  buildId: string,
  results: SubagentResult[],
  onStatus: (event: string, data: any) => void
): Promise<{ success: boolean; output: string }> {
  const integrationId = `${buildId}-integration`;

  for (const result of results) {
    if (!result.success) continue; // skip failed subagents — surfaced separately below
    for (const filePath of result.filesWritten) {
      const content = await sandboxManager.downloadFile(result.sandboxId, filePath);
      const relativePath = filePath.replace('/home/user/', ''); // already prefixed with subagent id per Step 2.3's instruction
      await sandboxManager.uploadFile(integrationId, relativePath, content);
    }
  }

  const sandbox = await sandboxManager.getOrCreate(integrationId);
  onStatus('integration_status', { message: 'Installing dependencies...' });
  const install = await sandbox.commands.run('npm install', { cwd: '/home/user', timeoutMs: 120_000 }).catch((e: any) => ({ exitCode: 1, stdout: '', stderr: e.message }));
  if (install.exitCode !== 0) {
    return { success: false, output: `Install failed: ${install.stderr}` };
  }
  onStatus('integration_status', { message: 'Running build...' });
  const build = await sandbox.commands.run('npm run build', { cwd: '/home/user', timeoutMs: 60_000 }).catch((e: any) => ({ exitCode: 1, stdout: '', stderr: e.message }));

  return { success: build.exitCode === 0, output: build.stdout + build.stderr };
}

async function runMultiAgentBuild(
  request: BuildRequest,
  onStatus: (event: string, data: any) => void
): Promise<{ success: boolean; buildId: string; finalOutput: string }> {
  let iteration = 0;
  let lastError = '';

  while (iteration < MAX_ITERATIONS) {
    const tasks = await planSubtasks(
      iteration === 0 ? request.projectDescription : `${request.projectDescription}\n\nPrevious attempt failed with: ${lastError}\nFix the issue.`
    );

    onStatus('plan_ready', { tasks: tasks.map(t => ({ id: t.id, instructions: t.instructions })) });

    // Concurrency cap enforcement — do not use Promise.all unbounded if tasks.length could exceed MAX_CONCURRENT_SANDBOXES.
    // Since MAX_SUBAGENTS === 3 and MAX_CONCURRENT_SANDBOXES === 3, direct Promise.all is safe under current caps.
    // If either constant is changed later, add a concurrency-limiting queue (e.g. p-limit) here.
    const results = await Promise.all(
      tasks.map(t => runSubagent(t, onStatus))
    );

    const anyFailed = results.some(r => !r.success);
    if (anyFailed) {
      lastError = results.filter(r => !r.success).map(r => `${r.id}: ${r.error}`).join('; ');
      onStatus('subagent_failure', { errors: lastError });
      iteration++;
      continue;
    }

    const integration = await integrateSubagentResults(request.buildId, results, onStatus);
    if (integration.success) {
      onStatus('build_complete', { buildId: request.buildId });
      return { success: true, buildId: request.buildId, finalOutput: integration.output };
    }

    lastError = integration.output;
    onStatus('integration_failure', { output: integration.output });
    iteration++;
  }

  return { success: false, buildId: request.buildId, finalOutput: `Build failed after ${MAX_ITERATIONS} iterations. Last error: ${lastError}` };
}

export { runMultiAgentBuild };
export type { BuildRequest };
```

### Step 2.5 — Add standalone route `/api/multiagent-build` to `index.ts`

For direct testing, independent of Track A/opencode:

```ts
import { runMultiAgentBuild } from './orchestrator-multiagent';

app.post('/api/multiagent-build', middleware, async (req, res) => {
  const { projectDescription } = req.body;
  if (!projectDescription) return res.status(400).json({ error: 'projectDescription required' });

  const buildId = crypto.randomUUID();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onStatus = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runMultiAgentBuild({ buildId, projectDescription }, onStatus);
    res.write(`event: final_result\ndata: ${JSON.stringify(result)}\n\n`);
  } catch (e: any) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: e?.message })}\n\n`);
  }
  res.end();
});
```

### Phase 2 Testing (mandatory before Phase 3)

1. Call `/api/multiagent-build` directly (curl, Postman, or a simple test page) with a small, well-defined project description (e.g., "a single-file Express hello-world server with one test").
2. Confirm: planner produces a sane task list, subagents run in isolated sandboxes without file collisions, integration step successfully assembles and builds the result.
3. Deliberately test a failure path: give it a project description likely to produce a build error, confirm the retry loop triggers once and either recovers or cleanly reports failure after `MAX_ITERATIONS`.
4. Monitor E2B dashboard sandbox-hours consumption during testing to sanity-check the cost model before scaling up test frequency.

### Phase 2 Exit Criteria
- [ ] A simple multi-file project can be built end-to-end via `/api/multiagent-build` without manual intervention
- [ ] Subagents write to isolated sandboxes with no file-path collisions during integration
- [ ] Retry loop correctly caps at `MAX_ITERATIONS` and reports a clean failure message if unrecoverable
- [ ] Sandbox hour consumption per build run is measured and documented (needed to size Phase 4's circuit breaker)

---

## PHASE 3: The A+B Seam

Do not begin this phase until Phase 1 and Phase 2 have both independently met their exit criteria.

### Step 3.1 — Define the injected tool

In `backend/openai-compat.ts`, add:

```ts
const BUILD_PROJECT_TOOL = {
  type: 'function',
  function: {
    name: 'build_project_with_subagents',
    description: 'Builds a complete multi-file software project using parallel sandboxed AI subagents. Use this when the user asks to build, create, or scaffold a full application or project, rather than editing existing files.',
    parameters: {
      type: 'object',
      properties: {
        projectDescription: { type: 'string', description: 'A clear, complete description of the project to build.' },
      },
      required: ['projectDescription'],
    },
  },
};
```

### Step 3.2 — Modify the `/v1/chat/completions` route (from Step 1.2)

Inject the tool and intercept calls to it before they're treated as normal passthrough tool-calls:

```ts
// In the route handler, before calling streamText:
const mergedTools = {
  ...(tools ? fromOpenAITools(tools) : {}),
  build_project_with_subagents: tool({
    description: BUILD_PROJECT_TOOL.function.description,
    inputSchema: z.object({ projectDescription: z.string() }),
    execute: async ({ projectDescription }) => {
      const buildId = crypto.randomUUID();
      const statusMessages: string[] = [];
      const onStatus = (event: string, data: any) => {
        // Phase 3 design decision (see "Open Decisions" below): stream progress as assistant text,
        // not as opencode tool-call UI, since opencode has no native concept of subagent progress.
        const line = `[${data?.subagentId || 'orchestrator'}] ${event}: ${JSON.stringify(data)}`;
        statusMessages.push(line);
        res.write(sseLine(toOpenAIChunk({
          completionId, model: mappedModel,
          delta: { content: `\n${line}` }, // interleave progress into the visible assistant stream
        })));
      };
      const result = await runMultiAgentBuild({ buildId, projectDescription }, onStatus);
      // RETURN VALUE DESIGN DECISION — see "Open Decisions" item 2 below. This plan defaults to
      // returning a live sandbox preview URL rather than file contents, per the recommended Option 3
      // from the original planning discussion.
      return {
        success: result.success,
        buildId: result.buildId,
        summary: result.finalOutput,
        note: 'Project built in a live sandbox. File delivery to local disk is not yet implemented — see plan Phase 3 Open Decisions.',
      };
    },
  }),
};

const result = streamText({ model: selectedModel, messages, temperature, tools: mergedTools });
```

VERIFY: the exact `tool()` import and usage pattern matches what's already used inside `createFluxTools` in `index.ts` (it should, since both use the Vercel AI SDK) — copy the existing pattern's import statement rather than assuming.

### Open Decisions Required Before Phase 3 Is Truly Complete

These are not implementation details — they are product decisions that must be made by a human, not inferred by the implementing model:

1. **File delivery**: How does a built project actually reach the user's local machine? Three options were considered:
   - Return a zip/base64 blob in the tool result (requires opencode's model to know how to unpack it locally — likely unreliable)
   - Return structured `{path, content}` pairs and instruct the model to use opencode's own local `write_file` tool per file (more reliable, more steps, needs explicit prompting)
   - Return only a live sandbox preview URL via a `get_app_url`-equivalent call in the integration step, deferring local file delivery entirely (simplest to ship first)

   **This plan implements option 3 by default in Step 3.2.** If option 1 or 2 is preferred, Step 3.2's `execute` return value and `integrateSubagentResults` (Step 2.4) both need revision — do not silently change this without updating both.

2. **Progress visibility**: This plan streams subagent status as interleaved plain text in the assistant's response (Step 3.2). This is a readable-but-crude solution. If a cleaner UX is wanted later, consider whether opencode's tool-call UI can be repurposed to show one "subagent" tool call per task instead of one combined text stream — this would require restructuring Step 3.2 to emit multiple tool-call deltas (one per subagent) instead of one combined tool call, which is a bigger change and out of scope for this plan's v1.

### Phase 3 Testing

1. From an actual opencode session (configured per Step 1.4), send a prompt like "build me a simple todo app with a REST API," confirm the model chooses to call `build_project_with_subagents` rather than trying to hand-write the whole thing itself via its own local tools.
2. Confirm subagent progress is visible as it streams into the opencode terminal.
3. Confirm the final result (sandbox URL per the default Option 3) is clearly presented to the user at the end.
4. Test a deliberately ambiguous prompt that could go either to normal chat/local-tool editing or to the subagent builder — confirm the model's tool-choice behavior is reasonable (may require refining the tool's `description` field if the model over- or under-triggers it).

### Phase 3 Exit Criteria
- [ ] A user in opencode can trigger a full subagent build via natural language
- [ ] Progress is visible during the build, not just a long silent wait
- [ ] The final result is delivered per whichever Open Decision option was actually chosen and implemented
- [ ] The model does not spuriously call `build_project_with_subagents` for simple edits to existing local files

---

## PHASE 4: Hardening (do not skip — this phase prevents real cost/security incidents)

### Step 4.1 — Sandbox hour circuit breaker

Add a simple in-memory (or Prisma-backed, for persistence across restarts) counter tracking cumulative sandbox-seconds consumed this billing month. Before `runMultiAgentBuild` starts, check remaining budget; refuse new builds with a clear error if within a safety margin (e.g., 90%) of the 100-hour free-tier cap. VERIFY the actual current cap on the E2B account in use — free-tier terms can change.

### Step 4.2 — Tighter rate limiting on expensive operations

`build_project_with_subagents` and `/api/multiagent-build` should have a stricter, separate rate limiter from both `aiLimiter` and `openAICompatLimiter` — this is by far the most expensive operation per call (multiple sandboxes, multiple model calls, potentially multiple iterations). Suggest something like 3 builds per hour per API key as a starting point, tune after observing real usage.

### Step 4.3 — Observability

Every subagent sandbox and every integration attempt should log with a consistent `buildId` tag so a failed build can be traced end-to-end in server logs without cross-referencing multiple untagged log lines.

### Step 4.4 — Cleanup verification

Confirm `sandboxManager`'s existing 12-minute idle cleanup (already implemented, see Known Facts section) actually reaps subagent and integration sandboxes correctly — since these use synthetic IDs (`${buildId}-subagent-${id}`, `${buildId}-integration`) rather than real conversation IDs, verify nothing in the existing cleanup logic assumes conversation IDs have a particular format that synthetic IDs might violate.

---

## Summary of Open Verification Items (must be resolved during implementation, not assumed)

1. Exact model-instance accessor method on the `nim` export from `nim-client.ts` (assumed `nim.chatModel(id)` throughout this plan — confirm against actual usage elsewhere in `index.ts`).
2. Whether `NIM_MODELS` (line 264 of `index.ts`) is exported and importable, or needs to be moved/re-exported for use in `openai-compat.ts`.
3. Full contents of `task-loop.ts` — not yet reviewed. Determines whether Step 2.3 (`subagent.ts`) should call `runTaskLoop`/`planTask` or use `streamText` directly, as this plan currently defaults to.
4. Actual current E2B free-tier concurrent-sandbox limit on the account in use (sources disagreed between 5 and 20 during research) — determines `MAX_CONCURRENT_SANDBOXES` in Step 2.4.
5. Exact `tool()` import path and usage convention already established elsewhere in `index.ts` (inside `createFluxTools`) — copy that exact pattern in Steps 2.2 and 3.2 rather than assuming Vercel AI SDK defaults.
6. Which specific NIM model to set as the default for subagents and the planner step — this plan defers the choice to "whichever performs more reliably at tool-calling" per Phase 1 testing, and does not hardcode a specific model ID anywhere a decision is required.
