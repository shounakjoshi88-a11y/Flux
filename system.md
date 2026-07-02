# Flux — Long-Running Task System: Research & Recommendations (v2)

Context: Flux already has a single-turn Planner/OrchestratorEngine, a WebSocket-based
Agent Protocol with TeamSession (leader/teammates, state machine), 25+ tools with
per-tool timeouts, persistent E2B sandboxes per conversation (4-min idle cleanup),
18 NIM models with fallback, and Supabase/Postgres/Prisma for persistence.

This is v2 of the doc: same 7 gap areas, now with concrete schemas, API surfaces,
SSE event payloads, sequence flows, an explicit failure-mode catalog, and re-verified
E2B facts (checked 2026-07-02 against e2b.dev/docs, e2b.dev/pricing, and three
independent third-party writeups — see §7 sources). Sections 1–6 are still
architectural recommendations, not mandates — treat the code/schema blocks as
starting points to edit, not gospel.

---

## 0. Guiding Principle: Checkpointing Is Not Durable Execution

Worth stating up front because it shapes every section below. There's a real
distinction the agent-infra ecosystem converged on in the last year:

- **Checkpointing** says "I saved your state." It's a snapshot you can restore *if*
  something else notices the process died and restarts it correctly.
- **Durable execution** says "this workflow will run to completion" — it includes
  the checkpoint, *plus* failure detection, automatic recovery, idempotent retries,
  and a recovery pass that actually gets invoked on boot.

Frameworks like LangGraph get this mostly right at the single-process level: a
checkpointer persists graph state at each step, keyed by thread ID, so a crashed run
can resume from the last completed step rather than the beginning. Flux doesn't need
to adopt LangGraph (TeamSession already gives you the graph/state-machine shape you'd
want), but it should adopt the same *contract*:

1. Every side effect that matters (a file written, a step completed, a sandbox
   created) is durable in Postgres **before** the loop moves on — not "eventually
   synced," not "written after the whole task finishes."
2. Every step is idempotent or checked-before-repeated: if the process dies mid-step
   and a recovery pass re-runs it, re-running shouldn't duplicate the side effect
   (re-writing the same file is fine; re-running `npm create vite` into a directory
   that already has files is not, unless the step checks for that first).
3. There is an actual recovery pass invoked on boot — not just theoretical
   resumability that nothing ever calls.

This is the standard the rest of the doc is designed to meet, and it's why the
recommendation throughout is "Postgres is the source of truth, the sandbox is
reconnectable state, the in-memory loop is disposable."

---

## 1. Task Model & Persistence

**Recommendation: new `Task` + `TaskStep` tables, not overloaded `Message` rows.**

A `Message` is "one turn of a chat." A `Task` is "a stateful, resumable unit of work
that outlives a turn and has its own lifecycle." Encoding subtask state, retries,
dependency edges, and sandbox bindings into `Message.content` JSON works for a demo
and falls apart the moment you need to query "all running tasks" or resume one after
a restart — you'd be doing that via JSON containment queries instead of indexed
columns, and you'd have no place to put a foreign key to `sandboxId` that Prisma can
actually enforce.

### Schema (Prisma)

```prisma
enum TaskStatus {
  PENDING
  PLANNING
  RUNNING
  WAITING_FOR_INPUT
  PAUSED
  INTERRUPTED   // process/server died mid-task, recovery pass flagged it
  COMPLETED
  FAILED
  CANCELLED
  TIMED_OUT
}

enum StepStatus {
  PENDING
  RUNNING
  BLOCKED       // waiting on dependsOn
  DONE
  FAILED
  SKIPPED
}

model Task {
  id                String     @id @default(cuid())
  conversationId    String
  userId            String
  sandboxId         String?
  anchorMessageId   String?    @unique   // the one Message row this task renders as
  status            TaskStatus @default(PENDING)
  title             String
  goal              String     @db.Text   // original user prompt
  planApprovalMode  Boolean    @default(false)
  contextSummary    String?    @db.Text   // rolling structured summary, see §6
  costEstimateSecs  Int        @default(0)
  maxDurationSecs   Int        @default(1800)  // 30 min default, see §4
  maxSteps          Int        @default(20)
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  startedAt         DateTime?
  completedAt       DateTime?
  lastHeartbeatAt   DateTime?  // written by the loop every N seconds; recovery
                                // pass uses staleness of this to detect a dead loop
                                // even when status still says RUNNING
  steps             TaskStep[]
  conversation       Conversation @relation(fields: [conversationId], references: [id])

  @@index([status])
  @@index([conversationId])
  @@index([userId, createdAt])
}

model TaskStep {
  id           String     @id @default(cuid())
  taskId       String
  index        Int
  title        String
  status       StepStatus @default(PENDING)
  dependsOn    Int[]      @default([])   // indices of steps this one blocks on
  toolCalls    Json?                     // array of {tool, args, result, ts}
  result       String?    @db.Text        // 1-3 sentence structured summary, see §6
  filesChanged Json?                     // {created: [], modified: [], deleted: []}
  startedAt    DateTime?
  completedAt  DateTime?
  retryCount   Int        @default(0)
  task         Task       @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@unique([taskId, index])
  @@index([taskId, status])
}
```

A `Task` gets **one anchor `Message`** in the conversation (`anchorMessageId`) so it
renders inline and is part of chat history — that solves "does it show up in the
transcript" without forcing task internals through the message schema. The anchor
message's `parts` array (you already migrated to the `MessagePart[]` model — see
memory of the MessageParts refactor) gets a new part type, `task_ref`, pointing at
`taskId`; `PartsRenderer` resolves it to the live task card component.

### Dependencies: DAG via `dependsOn: number[]`, not a workflow engine

Real tasks ("build a game") are usually a shallow chain (scaffold → implement → test
→ polish) with occasional fan-out (write frontend + backend in parallel, then a step
depending on both). A full workflow engine (Temporal-style) is overkill at this scale
and adds an infra dependency you don't need yet. Validate the DAG once at plan
creation (no cycles, no forward references) and then it's just: a step is eligible to
run when every index in its `dependsOn` has `status = DONE`.

```typescript
function nextEligibleStep(steps: TaskStep[]): TaskStep | null {
  const doneIdx = new Set(steps.filter(s => s.status === 'DONE').map(s => s.index));
  return steps.find(s =>
    s.status === 'PENDING' &&
    s.dependsOn.every(dep => doneIdx.has(dep))
  ) ?? null;
}
```

For fan-out (independent branches), pick *all* currently-eligible `PENDING` steps
instead of just one, and run them concurrently via `Promise.all` — this is the one
place multi-step parallelism is worth it (see §2).

### Survive a server restart: yes

Two things you need, and you already have the pieces for both:

1. `Task`/`TaskStep` rows in Postgres as the source of truth for "what's the plan and
   where are we," not in-memory state.
2. `sandboxId` stored on the `Task` row, so recovery is "reconnect to sandbox by ID,"
   not "recreate everything." `Sandbox.connect(sandboxId)` (§7) is what makes this
   possible — the sandbox isn't tied to your server process.

**Recovery pass, invoked on boot** (this is the "durable execution" part, not just
checkpointing — see §0):

```typescript
async function recoverInterruptedTasks() {
  const stale = await prisma.task.findMany({
    where: {
      status: { in: ['RUNNING', 'PLANNING'] },
      // heartbeat older than 2x the loop's expected interval = the loop that
      // owned this task is dead, not just between steps
      lastHeartbeatAt: { lt: new Date(Date.now() - HEARTBEAT_STALE_MS) },
    },
  });

  for (const task of stale) {
    if (!task.sandboxId) {
      await markInterrupted(task.id, 'no sandbox to recover into');
      continue;
    }
    try {
      await Sandbox.connect(task.sandboxId);
      // don't resume the in-flight LLM call or tool call — resume at the last
      // completed step boundary. Any step left RUNNING when the heartbeat died
      // gets reset to PENDING (or FAILED if retryCount is exhausted) and re-picked
      // up by the loop, not silently continued mid-tool-call.
      await resetDanglingRunningStep(task.id);
      await enqueueTaskLoop(task.id); // re-attach a fresh loop
    } catch {
      await markInterrupted(task.id, 'sandbox expired or unreachable');
    }
  }
}
```

The durability unit is **step completion**: write `TaskStep.status = DONE` and its
`result` to Postgres *before* advancing to the next step, not after the whole task
finishes. Also write `lastHeartbeatAt` on every loop tick (e.g. every 10–15s, not
just on step boundaries) so a hung step (stuck in a long tool call) is distinguishable
from a dead process — otherwise a step that's legitimately still running for 3
minutes looks identical to a crashed loop to any staleness check based on step
timestamps alone.

---

## 2. Agent Loop Architecture

**Single agent per task, sequential subtasks, with narrow parallelism only where
`dependsOn` allows it — don't build a general multi-agent system for this.**

TeamSession already models leader/teammates with delegation, which is the right
primitive if you truly need parallel specialized agents. But most "build me a game" /
"refactor this service" tasks are naturally sequential — each step needs the
filesystem state left by the previous one. Single-agent-sequential is simpler to
reason about, cheaper (no coordination overhead, no duplicate context), and easier to
debug. Reserve TeamSession-style delegation for the specific case where the DAG has
independent branches (§1) — spin up a teammate per independent branch, rejoin at the
merge step. Don't run two agents editing the same sandbox filesystem concurrently
without isolating their working directories; you'll get race conditions on file state
that are painful to debug (E2B sandboxes are single-VM — concurrent writes from two
tool calls aren't isolated from each other the way two separate sandboxes would be).

### Extend TeamSession, don't build a parallel system

TeamSession already has WebSocket session semantics, a state machine, and delegation.
What's missing for this use case:
- (a) DB-backed task/step persistence (§1) — TeamSession state today is presumably
  in-memory/WebSocket-session-scoped.
- (b) resumability across restarts (§1's recovery pass).
- (c) a driving loop that turns `Task.steps` into planner calls.

That's additive work on top of TeamSession, not a rewrite. A second, parallel "task
agent" system alongside TeamSession means two state machines to maintain and two
mental models for anyone touching this code later — including you in three months.
Concretely: `TaskLoop` becomes a class that *wraps* a `TeamSession` (or drives a
single-member one for the sequential case), rather than reimplementing tool-call
orchestration from scratch.

### Async (out-of-band) execution, not in-band

A 2–30 minute task cannot hold an HTTP request or a single SSE connection open the
whole time — connections drop, mobile clients background, and E2B/NIM calls will
occasionally hang past any reasonable request timeout. The user should be able to
close the tab and come back.

```
POST /api/tasks
  { conversationId, goal, planApprovalMode? } → 202 Accepted, { taskId }
  (returns immediately — the loop is enqueued, not run in-request)

GET  /api/tasks/:id
  → full Task + TaskStep[] snapshot (for reconnect / initial paint)

GET  /api/tasks/:id/stream   (SSE)
  → live event stream, see event table below

POST /api/tasks/:id/cancel
POST /api/tasks/:id/pause
POST /api/tasks/:id/resume
POST /api/tasks/:id/answer   { stepId, answer }   // for WAITING_FOR_INPUT
POST /api/tasks/:id/approve-plan   { edits? }      // for plan-approval mode
```

New SSE event types (additive to your existing 20+):

| Event | Payload | When |
|---|---|---|
| `task_created` | `{taskId, title, plannedSteps}` | plan generated |
| `task_plan_pending_approval` | `{taskId, steps}` | plan-approval mode, before execution |
| `task_step_started` | `{taskId, stepIndex, title}` | step picked up |
| `task_step_progress` | `{taskId, stepIndex, toolCall}` | reuse existing `tool_call` shape, tagged with taskId |
| `task_step_completed` | `{taskId, stepIndex, result, filesChanged}` | step durably written |
| `task_step_failed` | `{taskId, stepIndex, error, willRetry}` | step failed |
| `task_waiting_for_input` | `{taskId, stepIndex, question}` | blocking question |
| `task_paused` / `task_resumed` | `{taskId}` | pause/resume/idle-pause |
| `task_completed` | `{taskId, summary}` | all steps done |
| `task_failed` / `task_cancelled` / `task_timed_out` | `{taskId, reason}` | terminal states |

Store step results in the DB regardless of whether anyone's listening (§1), so a
client reconnecting mid-task fetches `GET /api/tasks/:id` for full history and then
attaches the SSE stream for what's still to come — SSE for live view, the GET + retry
loop as the fallback/recovery path if the stream drops.

### Process model: same Express process, with two guard rails

Don't reach for a separate Bun Worker or microservice on day one — that's solving a
scaling problem you don't have yet and multiplies your deployment surface (you're
running this at ₹0/month). The actual risk with "same process" is a long-running task
loop blocking the event loop or getting killed by a process restart/deploy. Two cheap
mitigations:

1. Keep the task loop genuinely async (awaiting I/O — LLM calls, sandbox calls — not
   doing CPU-bound work inline). Node/Bun handles many concurrent awaited I/O-bound
   loops fine in one process. If you ever add local CPU-heavy work (e.g. hashing
   large files for the change-tracking in §3), push it through `worker_threads` or a
   `setImmediate`-yielding chunked loop so it doesn't starve other requests.
2. Because state is in Postgres (§1) and sandboxes survive via `sandboxId` (§7), a
   process restart mid-task is recoverable — the recovery pass in §1 handles it.
   That safety net is what makes "same process" acceptable rather than fragile.

Move to a separate worker process only when you actually observe the main API
process struggling under concurrent task load — real numbers, not a guess now. A
natural migration path if/when you do: keep the `Task`/`TaskStep` tables and SSE
contract identical, swap `enqueueTaskLoop` from "run in this process" to "push to a
queue (BullMQ/pg-boss) a worker process consumes" — the API and DB schema don't
change, only who executes the loop.

### Concurrency cap

Add a simple in-process semaphore (or a `SELECT ... FOR UPDATE SKIP LOCKED` claim
query if you want it to survive multiple app instances) so you don't accidentally
run more concurrent task loops than your E2B concurrent-sandbox ceiling allows (20 on
Hobby, §7) — a task that can't get a sandbox should queue with a visible `PENDING`
status, not fail.

---

## 3. Sandbox & State Management

**Sandbox lifetime for a long task: keep it alive for the task's duration, but lean
on E2B's pause/resume rather than a raw long-lived timeout.**

Set the sandbox to auto-pause on idle (`sbx.setTimeout()` / auto-pause config, §7)
instead of letting it run — and bill — continuously for the full 30 minutes when much
of that time is spent waiting on an LLM call, not executing code. Reconnect
(`Sandbox.connect`) before each step that needs the filesystem; E2B resumes state
automatically. This directly addresses cost: you pay per second of *running* time,
pausing stops billing immediately, and resume is fast (§7 has the exact numbers).

```typescript
async function withSandboxForStep(task: Task, run: (sbx: Sandbox) => Promise<void>) {
  const sbx = task.sandboxId
    ? await Sandbox.connect(task.sandboxId)
    : await Sandbox.create({ template: 'flux-base', timeoutMs: SANDBOX_IDLE_TIMEOUT });

  if (!task.sandboxId) {
    await prisma.task.update({ where: { id: task.id }, data: { sandboxId: sbx.sandboxId } });
  }

  try {
    await run(sbx);
  } finally {
    // pause, don't kill — filesystem + memory preserved, billing stops
    await sbx.pause();
  }
}
```

### Checkpointing: use E2B's built-in pause/resume, don't build a custom snapshot pipeline

This is the pragmatic answer to "accept restart-from-scratch vs. build
checkpointing" — you don't have to choose, because E2B already gives you
checkpointing at the sandbox level: pausing preserves filesystem *and* memory
(running processes, loaded variables). Store `sandboxId` + a `PAUSED`-adjacent status
on the `Task` row, and on restart, attempt `Sandbox.connect(sandboxId)` before
falling back to "sandbox expired, start fresh from the last completed step's known
file state" (§1's recovery pass).

**Caveats worth designing around (re-verified, §7):**
- Paused sandboxes are retained **indefinitely with no automatic TTL** — you stop
  paying compute while paused, but the filesystem+memory snapshot consumes storage
  until explicitly deleted. A task that pauses and is later cancelled/abandoned needs
  an explicit `sbx.kill()` in the cancel path, or you accumulate storage cost on
  sandboxes nobody will ever resume. Add a cleanup sweep (cron or on-boot) that kills
  paused sandboxes belonging to tasks in a terminal state (`COMPLETED`/`FAILED`/
  `CANCELLED`) older than some retention window.
- Pausing takes roughly **4 seconds per GiB of RAM**; resuming is roughly **1
  second**. At the default 1 GiB spec that's ~4s of pause latency per step boundary
  — fine for a background loop, worth knowing if you ever want pause/resume to feel
  instant in a foreground UI action.
- There's a known rough edge where background processes started *before* an
  auto-pause don't always come back cleanly after resume (a process can still appear
  to hold a port without showing up in `commands.list()`). Don't assume a resumed
  sandbox's `start_app` background processes are guaranteed healthy — add a
  defensive health-check-and-restart step after any resume that a step depends on a
  running background server.

### File change tracking between steps

Hash-and-diff a `list_files` snapshot, not a full git repo. You already have
`list_files`/`read_file` sandbox tools. Before and after each step, snapshot
`{path: contentHash}` for the working directory (skip `node_modules`/build
artifacts) and diff the two maps to get created/modified/deleted files:

```typescript
async function snapshotFiles(sbx: Sandbox, root: string): Promise<Record<string, string>> {
  const files = await sbx.files.list(root, { recursive: true, ignore: ['node_modules', '.git', 'dist', 'build'] });
  const snapshot: Record<string, string> = {};
  for (const f of files) {
    const content = await sbx.files.read(f.path);
    snapshot[f.path] = crypto.createHash('sha1').update(content).digest('hex');
  }
  return snapshot;
}

function diffSnapshots(before: Record<string,string>, after: Record<string,string>) {
  const created = Object.keys(after).filter(p => !(p in before));
  const deleted = Object.keys(before).filter(p => !(p in after));
  const modified = Object.keys(after).filter(p => p in before && before[p] !== after[p]);
  return { created, modified, deleted };
}
```

This is cheap, needs no new infra, and gives the frontend exactly what it needs to
show "these 3 files changed in step 4" (`TaskStep.filesChanged`). For a large
repo-scale sandbox, hashing every file on every step boundary is the part worth
capping — bound `snapshotFiles` to a reasonable file count/size, or switch to `git`
inside the sandbox (`git add -A && git status --porcelain`) once file counts get
large, since git's own tree hashing is already doing this incrementally. If you later
want undo/rollback per-step, initializing a git repo and committing after each step
is a natural upgrade path — don't build that until someone asks for rollback.

---

## 4. Resource Limits & Safety

These are product/policy calls as much as technical ones. Concrete starting point:

- **Max task duration: 30 minutes**, hard-stop with a clear `TIMED_OUT` status rather
  than silently killing it. Matches the "build a game" example and stays inside E2B
  Hobby's 1-hour sandbox ceiling (§7) with headroom for pause/resume overhead and
  retries. Make it a `Task.maxDurationSecs` column (already in the schema above), not
  a hardcoded constant, so per-task overrides and later global changes are one-line.
- **Max subtask count: 20 steps** (`Task.maxSteps`). High enough for genuinely
  multi-stage builds, low enough to bound cost and context growth (§6). Enforce in
  the planner — if a plan needs more than 20 steps, that's a signal the task should
  be split into multiple linked tasks (`Task.parentTaskId`, optional future field),
  not a reason to raise the ceiling.
- **Cost limits:** track `costEstimateSecs` on the `Task` row (sandbox seconds
  actually used — E2B exposes usage via the dashboard/API, or you can compute it
  yourself from your own pause/resume timestamps) and enforce a per-task and
  per-user-per-day ceiling. E2B also lets you set **spending limits directly in the
  dashboard's budget page** — worth setting as a hard backstop independent of your
  own app-level tracking, so a bug in your cost accounting can't itself become a
  runaway bill. At ₹0/month you're presumably on Hobby, which is a hard
  concurrency/session ceiling anyway (§7) — but the soft cost cap protects you the
  day you're on Pro and a runaway loop could actually rack up a bill.
- **Pause/cancel: table stakes, not a nice-to-have.** Users will start something,
  realize it's going wrong, and want to stop it before it burns more time/cost.
  Mechanically: a `CANCELLED` status the task loop checks between steps (cooperative
  cancellation — check before each step, not mid-tool-call), plus a direct
  `sbx.pause()`/`sbx.kill()` call so you're not paying for a sandbox nobody's using.
  Pause = "stop consuming resources, keep state"; cancel = "stop and mark done,
  eventually reap the sandbox." Both map cleanly onto E2B's own primitives.
- **Retry policy:** cap `TaskStep.retryCount` at a small number (2–3) with backoff,
  and make a step's failure *after* retries exhausted a `FAILED` step that blocks
  only its dependents, not the whole task — sibling branches with no `dependsOn` on
  the failed step should still be allowed to complete, surfacing a partial-success
  task rather than an all-or-nothing failure.

---

## 5. Frontend UX

**UI paradigm: inline expandable task card in the chat stream, not a separate
dashboard page.** Flux's existing SSE-driven "rail" (styled like Claude.ai's
tool-call display) is the right foundation — extend it. A task renders as a card in
the message flow: title, current step, progress ("4/12 steps"), collapsed/expanded
state for step details. This keeps it consistent with how you already show tool
calls, so users don't learn a second mental model for "big" tool use vs. "small" tool
use. A standalone dashboard is worth revisiting only if/when users routinely run
multiple concurrent tasks and need a "manage all my tasks" view — don't build it
speculatively.

**Mid-task interaction: a narrow, explicit form — plan approval and blocking
questions — not free-form chat injection mid-loop.** Two hooks for v1:

1. **Plan approval (`Task.planApprovalMode`, optional, off by default):** before
   executing, show the step list and let the user edit/approve/reject it via
   `POST /tasks/:id/approve-plan`. Valuable for higher-stakes/higher-cost tasks, costs
   one extra round-trip.
2. **Blocking questions:** if a step genuinely can't proceed without input, the task
   pauses itself in `WAITING_FOR_INPUT` status and surfaces a prompt in the task
   card, resuming via `POST /tasks/:id/answer` when answered. Reuses the same
   pause/resume machinery from §3–4 — not new infrastructure, just a new *reason*
   to pause.

Don't support arbitrary "chat with the agent mid-task" — that reopens the
single-turn-planner-vs-ongoing-conversation ambiguity this system is trying to solve,
and it's a much bigger context-management problem (§6) for uncertain benefit.

**File browsing after a task: reuse the sandbox filesystem, exposed as a read-only
file tree + preview, plus a zip download.** Wrap the existing `read_file`/
`list_files` sandbox tools in a minimal file browser panel attached to the task card
("View files"). Add "Download as zip" that shells out to `zip` in the sandbox and
serves the result. Don't build a full in-browser code editor — that's a separate,
much larger feature; a viewer + zip covers "see what got built" for most cases.

**Task history: single collapsed message in the conversation, expandable to full
detail — not a separate section.** Matches how task progress already threads into
the message stream and keeps the transcript coherent: "user asked for X → here's the
task that built it → conversation continues." A separate "tasks" section is more to
build and fragments the story of a given conversation.

---

## 6. Context Window Strategy

**Layered approach — don't rely on a single technique:**

1. **Always include:** the original task goal, a running structured summary of
   completed steps (not raw transcripts), and the current/next step's full detail.
   This is the backbone — "task description + latest subtask + planning context."
2. **Summarize, don't slide-window, completed steps.** A sliding window (last N
   steps) silently drops information the agent might need later — "I already chose
   Postgres for storage in step 2" matters in step 9 even if it's long out of the
   window. Instead, after each step completes, generate a 1–3 sentence structured
   summary (stored in `TaskStep.result`) — "Step 3: Implemented user auth via JWT in
   auth.ts, added /login and /register routes." Feed the planner accumulated
   summaries, not accumulated raw tool outputs. One small LLM call per step (or a
   template if the step's structure is predictable) keeps growth roughly linear
   instead of exponential.
3. **Full detail is fetched on demand, not carried forward by default.** If the
   agent needs the actual current contents of a file written 5 steps ago, it calls
   `read_file` again rather than keeping that content live in context the whole
   time. The sandbox filesystem is the source of truth — no need to duplicate it in
   context. This alone removes most of what would otherwise blow up the window.
4. **Hard cap with graceful degradation:** if the running summary approaches a size
   budget (say 20% of context window), summarize the summary (a second-pass
   compression) rather than truncating. Truncation silently loses information;
   re-summarization degrades gracefully and keeps older steps proportionally smaller
   than recent ones.

This avoids the two failure modes either technique alone hits: sliding windows lose
early decisions later steps depend on; naive full-history accumulation blows the
context budget by step 6–8 on anything nontrivial.

**Note on prior art:** this is functionally the same shape LangGraph's checkpointing
converged on for long conversations — e.g. its `DeltaChannel` pattern stores a fold/
reducer over message history rather than the full list at every checkpoint,
specifically to avoid the same exponential-growth problem. You don't need the
framework, but "store a reduced/summarized form, not the raw accumulation" is the
same underlying idea — a signal this approach isn't a guess, it's converged practice.

---

## 7. E2B Technical Details (re-verified 2026-07-02)

**Concurrent sandbox limits by plan:**
- **Hobby (free) tier:** 20 concurrent sandboxes.
- **Pro tier ($150/month base):** 100 concurrent sandboxes by default, expandable to
  up to 1,100 with a concurrency add-on.
- Upgrading to Pro does **not** grant additional usage credits — the $150/month buys
  higher limits (concurrency, session length, resource ceilings), not included
  compute. You still pay per-second usage on top.
Given Flux runs at ₹0/month, you're very likely on Hobby — 20 concurrent sandboxes is
your real ceiling right now (see the concurrency-cap note in §2).

**Cost per sandbox-second/minute/hour:**
E2B bills per second of *running* compute, split across vCPU and RAM:
- vCPU: ≈ $0.000014/s → ≈ **$0.0504/vCPU-hour**
- RAM: ≈ $0.0000045/s per GiB → ≈ **$0.0162/GiB-hour**
- Default sandbox spec is 2 vCPU / 1 GiB RAM; a common agent-workload spec (2 vCPU /
  4 GiB) works out to about **$0.17/hour** in compute — e.g. `(2 × $0.000014) +
  (4 × $0.0000045) ≈ $0.000046/s`.
- Billing stops immediately when a sandbox is paused or killed — you are not charged
  for idle/paused compute. **However, paused sandboxes are retained indefinitely
  with no automatic TTL** — the saved filesystem+memory snapshot accrues storage
  cost until you explicitly delete it (this is the one place the original doc
  underclaimed "free to hold indefinitely" — storage isn't free, only compute is
  paused). Budget for a cleanup sweep (§3).
- Hobby has a one-time $100 signup credit and no subscription fee; Pro is $150/month
  base plus usage.
- You can set explicit **spending limits** in the E2B dashboard's budget page — a
  useful independent backstop to your own app-level cost tracking (§4).

**Can sandbox IDs be reused after a server restart? Yes.** A sandbox's ID is issued
and tracked by E2B's own infrastructure, not your server process. As long as you
persist `sandboxId` to your DB (§1), any process — including a freshly restarted one
— can call `Sandbox.connect(sandboxId)` and resume the same sandbox, filesystem and
(if paused) in-memory state intact. This is the documented pattern: save the ID,
pause when done for now, reconnect later to resume.

**Pause/resume mechanics (new detail, not in the original doc):**
- Pausing takes roughly **4 seconds per GiB of RAM allocated** to the sandbox.
- Resuming takes roughly **1 second**, regardless of RAM.
- The continuous-runtime clock (the 1hr/24hr session cap below) **resets on
  resume/`connect()`** — so "pause when idle, reconnect when the next step starts"
  effectively lets a task span far longer than the ceiling in wall-clock time, since
  only *actively connected* duration counts toward it.
- Known rough edge: background processes started before an *auto*-pause don't
  always come back cleanly after resume — worth a defensive health-check step for
  anything like `start_app` (§3).
- Sandbox persistence itself is still noted by third-party sources as a relatively
  new/evolving feature (documented but with known limitations) — worth treating the
  pause/resume path as something to monitor in production rather than assume is
  bulletproof, and worth re-checking E2B's changelog periodically since this is an
  area they're actively iterating on.

**Max sandbox lifetime allowed by E2B:**
- **Hobby tier:** 1 hour (3,600s) max continuous session.
- **Pro tier:** 24 hours (86,400s) max continuous session.
- As above, this resets on `connect()`, which is what makes the 30-minute task limit
  recommended in §4 comfortably fit inside Hobby's cap even with retry margin.

**Other details worth knowing for planning purposes (new in v2):**
- Default resources are 2 vCPU / 1 GiB RAM; you can customize `cpuCount`/`memoryMB`
  when building a custom template (`Template.build(...)`), and RAM is decoupled from
  vCPU count — e.g. 2 vCPU / 8 GiB is a valid config for memory-heavy workloads.
  Higher ceilings than the template defaults require contacting E2B support.
  Building Flux's own base template (rather than the stock one) is worth doing early
  if you know you'll want Node/Bun + common build tools pre-installed — it avoids
  paying setup time on every fresh sandbox.
- E2B uses Firecracker microVMs (same primitive AWS Lambda and Fly.io use), giving
  each sandbox its own kernel — meaningfully stronger isolation than container-based
  sandboxing for running arbitrary AI-generated code, which matters given Flux
  executes code an LLM wrote with the `write_file`/tool-call pipeline. This isn't a
  new decision to make, just useful context for why E2B rather than a plain
  container was presumably the original choice.
- If a future task ever needs GPU compute (e.g. local model inference inside the
  sandbox), E2B does not offer a GPU tier at any plan level — that would require a
  different provider entirely, not a plan upgrade. Not relevant to the current
  "build a game" scope, but worth knowing before anyone assumes E2B covers it.

**Sources (checked 2026-07-02):**
- e2b.dev/pricing, e2b.dev/docs (billing, persistence, template/SDK reference) —
  primary source for all limit/pricing figures above.
- Beam's "E2B Pricing Explained (2026)" writeup (beam.cloud/blog) — cross-checked
  per-second rates and the paused-storage-isn't-free nuance, cited as verified
  against e2b.dev/pricing on 2026-06-16.
- Northflank's "E2B vs Vercel Sandbox" comparison (northflank.com/blog) and ZenML's
  "E2B Alternatives" writeup (zenml.io/blog) — cross-checked concurrency/session
  limits, both independently confirming Hobby=20/1hr, Pro=100(-1,100)/24hr.
- Figures are current as of the checked date; worth re-verifying against the live
  pricing page before finalizing any cost model, since per-second rates and tier
  limits are the kind of thing vendors adjust without much notice — especially given
  E2B's persistence feature is still actively evolving per third-party sources.

---

## 8. Failure Mode Catalog

A list worth having explicit answers for before shipping, not discovering in
production:

| Failure | Detection | Response |
|---|---|---|
| Server restarts mid-task | `lastHeartbeatAt` stale on boot | Recovery pass (§1): reconnect sandbox, reset dangling step to `PENDING`, re-enqueue loop |
| Sandbox expired/killed underneath a task | `Sandbox.connect()` throws | Mark task `INTERRUPTED`, surface to user — don't silently resume into a dead environment |
| Step fails after retries exhausted | `retryCount` hits cap | Step → `FAILED`; task continues on independent branches, fails overall only if the failed step blocks all remaining work (§4) |
| Task exceeds `maxDurationSecs` | Loop checks elapsed time each tick | Task → `TIMED_OUT`, sandbox paused (not killed, in case user wants to inspect/resume manually) |
| Task exceeds `maxSteps` at planning time | Planner validates step count before creating rows | Reject plan, surface "split into multiple tasks" to user rather than silently truncating |
| User cancels mid-step | `CANCELLED` status set, loop checks before next step | Current step allowed to finish (cooperative, not `kill -9` mid-tool-call) unless a hard-cancel is also offered; sandbox paused/killed per §4 |
| Two fan-out branches both write the same file | `filesChanged` diff shows unexpected overlap | Not automatically resolved — surface a warning in the task card; this is the argument for keeping fan-out branches on genuinely independent file paths at planning time, not a runtime fix |
| Sandbox resumed but a background process (`start_app`) didn't come back healthy | Health-check step after resume | Restart the background process before the step proceeds, rather than assuming it's up (§3, §7 caveat) |
| Cost ceiling hit mid-task | `costEstimateSecs` checked each loop tick | Pause task, mark `WAITING_FOR_INPUT`-adjacent status requesting explicit user continue, don't silently keep spending |
| Context summary itself grows too large | Size check before each planner call (§6) | Second-pass re-summarization, not truncation |
| Plan-approval task never gets approved | No timeout on `PENDING` approval | Worth adding a soft expiry (e.g. auto-cancel after 24h unactioned) so stale tasks don't sit as phantom `PENDING` rows forever |

---

## 9. Suggested Build Order

Given everything above is additive to existing infra, not a rewrite, a rough
sequencing that lets each phase be independently shippable:

1. **Schema + recovery pass** (§1) — `Task`/`TaskStep` tables, boot-time recovery
   function (even with nothing driving tasks yet, this is safe to land and test).
2. **Task loop wrapping TeamSession, async/SSE contract** (§2) — single-agent
   sequential only, no fan-out yet, no plan-approval yet. Get one straight-line task
   working end to end.
3. **Sandbox pause/resume + file-change tracking** (§3) — wire the loop to actually
   pause between steps instead of holding the sandbox open.
4. **Resource limits + cancel/pause** (§4) — before this ships to real users, not
   after; this is the safety rail.
5. **Frontend task card + SSE rendering** (§5) — inline card, no file browser or
   plan-approval UI yet.
6. **Context summarization** (§6) — needed once tasks routinely exceed ~5 steps;
   can ship after the above with a naive "just send everything" placeholder if a
   couple steps' worth of raw context fits fine initially.
7. **Fan-out/parallel branches, plan-approval, file browser + zip download** — the
   nice-to-haves layered on last, once the sequential single-branch path is solid.

---

## Summary Table — What's a Decision vs. What's Settled

| # | Question | Status |
|---|----------|--------|
| 1 | New `Task` table vs. reuse `Message` | **Recommended: new table** — schema above |
| 1 | Subtask dependencies | **Recommended: yes, simple DAG via `dependsOn[]`** |
| 1 | Survive restart | **Recommended: yes**, via DB state + `sandboxId` + heartbeat-based recovery pass |
| 2 | Single vs multi-agent | **Recommended: single-agent sequential**, narrow parallelism on independent DAG branches only |
| 2 | Sync vs async | **Recommended: async**, non-negotiable given task lengths |
| 2 | Process model | **Recommended: same process for now**, revisit with real load data; migration path to a queue-backed worker sketched in §2 |
| 2 | Extend TeamSession vs new system | **Recommended: extend**, via a `TaskLoop` wrapper class |
| 3 | Sandbox lifetime strategy | **Recommended: pause-on-idle + reconnect**, not held open |
| 3 | Checkpointing | **Recommended: E2B pause/resume**, no custom snapshot pipeline — but add a cleanup sweep for abandoned paused sandboxes (storage isn't free) |
| 3 | File change tracking | **Recommended: hash-diff `list_files` snapshots**, upgrade path to `git` if file counts get large |
| 4 | Max duration / steps / cost caps | **Proposed defaults: 30 min, 20 steps, per-task+per-day cost ceiling** — confirm against real usage, and set an E2B dashboard spending limit as a backstop |
| 4 | Pause/cancel | **Recommended: yes**, table stakes, cooperative cancellation |
| 5 | UI paradigm | **Recommended: inline expandable task card**, not a dashboard |
| 5 | Mid-task interaction | **Recommended: plan approval (optional) + blocking questions only** |
| 5 | File browsing | **Recommended: read-only file tree + zip download** |
| 5 | Task history | **Recommended: single collapsed message, expandable** |
| 6 | Context strategy | **Recommended: goal + step summaries + on-demand file fetch**, second-pass compression as safety valve — same shape as LangGraph's DeltaChannel pattern |
| 7 | E2B facts | **Re-verified 2026-07-02 — see §7, with sources**; new detail added on pause/resume timing and paused-storage cost |
| 8 | Failure modes | **New in v2** — explicit catalog, see §8 |
| 9 | Build order | **New in v2** — suggested phased rollout, see §9 |

Everything marked "Recommended" is a default worth shipping, not a claim it's the
only correct answer — most worth pressure-testing against real Flux usage: the
resource limits in §4 (calibrated to "build a game," not measured against real task
data), whether plan-approval should default on or off in §5, and whether the 30-min/
20-step ceilings actually match what users try to build once this ships.