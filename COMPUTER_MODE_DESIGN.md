# Computer Mode Design

## Current State

Computer mode today is a bare scaffold:
- A toggle in ChatInput that routes messages through WebSocket
- A `COMPUTER_MODE_SYSTEM_EXTENSION` in the system prompt telling the LLM it has shell/filesystem access
- A file-explorer sidebar (`ComputerWorkspace`) with placeholder "Changes" and non-functional footer buttons
- Permission modes: Default (ask), Plan (dry-run), YOLO (auto-approve)
- The planner creates a single hardcoded `shell` step — no LLM-driven tool selection loop
- No screen capture, no terminal emulator, no code editor

## Design Goals

1. **LLM-in-the-loop tool execution** — The LLM dynamically decides which tools to call and in what order, not a hardcoded planner step
2. **Rich Workspace** — Terminal emulator, file explorer with live changes, code editor, screen preview
3. **Vision integration** — Screen capture fed to vision-capable models for GUI understanding
4. **Multi-step autonomy** — The agent can research, plan, execute, and verify in a loop
5. **Security** — Per-tool permission levels, workspace sandbox, command allow/block lists

---

## Architecture

### High-Level Flow (proposed)

```
User types "install express and create a server"
  │
  ▼
Frontend (Dashboard.tsx)
  │  route: WS transport (if computer mode)
  ▼
WebSocket Agent (agent-protocol/websocket.ts)
  │
  ▼
/flux_ask SSE endpoint (backend/index.ts)
  │
  ▼
ComputerModeEngine (new)
  ├─ Plan: LLM analyzes query → produces tool steps
  ├─ Execute: For each step, LLM picks a tool, calls it, reviews output
  ├─ Observe: If screen-capture mode, take screenshot, feed to vision model
  └─ Loop: Until task is complete or user intervenes
       │
       ▼
    Tool Registry
    ├─ shell_execute    → process spawner with terminal streaming
    ├─ file_list/read/write → workspace sandboxed
    ├─ screen_capture   → screenshot → base64 → vision model
    ├─ web_search       → research as needed
    ├─ file_search      → grep/find inside workspace
    └─ (future) code_edit → AST-aware code modifications
```

### Component Breakdown

#### 1. ComputerModeEngine (`backend/computer-mode/engine.ts`)

New module. Replaces the current planner's hardcoded `computer_mode` workflow.

```
Input: query, tools, model, screenStream?, mode ("default"|"plan"|"yolo")
  │
  ▼
[REASON] LLM call: "Given the user's request, what should I do?"
  ├─ Returns: list of tool calls with reasoning
  ├─ Example: "I need to: 1) check if node is installed (shell_execute),
  │            2) create package.json (file_write), 3) install express (shell_execute)"
  │
  ▼
[LOOP] For each tool call:
  ├─ Check permissions (mode-dependent)
  ├─ Execute tool
  ├─ Stream result back via SSE/WS
  ├─ [OBSERVE] If screen mode: take screenshot → vision analysis → adjust plan
  └─ Feed result back to LLM for next decision
  │
  ▼
[VERIFY] LLM checks if task is complete
  ├─ Yes → final answer + summary
  └─ No → continue loop (with max iteration guard)
```

Key difference from current orchestrator: The LLM **drives the loop dynamically** rather than executing a pre-defined plan. The planner only provides initial intent classification; the LLM decides actual tool calls at runtime.

#### 2. Tool Execution Protocol

Each tool call follows this lifecycle:
1. **LLM proposes** → `{ tool: "shell_execute", args: { command: "npm init" } }`
2. **Permission check** → `default` mode: send permission request to user; `yolo` mode: auto-approve; `plan` mode: dry-run (show but don't execute)
3. **Execute** → Run tool, capture stdout/stderr/exit code
4. **Stream** → Send terminal output events to frontend in real time
5. **LLM reviews** → Feed output back to LLM for next decision

#### 3. Frontend Workspace (`ComputerWorkspace`)

| Panel | Current | Proposed |
|-------|---------|----------|
| File Tree | ✅ Works (fetch-file-tree) | ✅ Keep + add file preview on click |
| Changes | ❌ Placeholder | ✅ Git diff view (git status + diff) |
| Terminal | ❌ Non-functional button | ✅ xterm.js embedded terminal, linked to shell tool |
| Screen Capture | ❌ Not implemented | ✅ Screenshot display, refreshed on each vision step |
| Command History | ❌ Not implemented | ✅ List of previous tool calls with expand/collapse |

##### Terminal Integration
- Embed an xterm.js terminal in the workspace panel
- The `shell_execute` tool streams stdout/stderr to both the SSE event stream AND an in-memory terminal buffer
- The frontend subscribes to `terminal` SSE events and writes them to xterm.js
- User can type input back (for interactive commands) via a `terminal_input` WS message

#### 4. Screen Capture + Vision

For models that support vision (GPT-4o, Claude 3.5 Sonnet, Gemini 2.5 Pro):

1. **Capture**: `screenshot` tool uses platform-specific capture:
   - Windows: `Screenshot.Include` or `P/Invoke` + `sharp` for encode
   - macOS: `screencapture -x` CLI or CoreGraphics API
   - Linux: `import -window root` (ImageMagick) or XDG portal
2. **Encode**: Resize to max 2048px, JPEG quality 85, base64
3. **Feed**: Include as image in the LLM message array alongside text
4. **Loop**: LLM sees the screen, decides next action, executes, captures again

#### 5. Permission System (consolidated)

| Mode | Behavior |
|------|----------|
| `default` | Show permission dialog for every tool call. User approves/rejects per-call. |
| `plan` | Show the full execution plan first. User approves the plan, then YOLO-executes. |
| `yolo` | Auto-approve all tool calls. No dialogs. |

Permission dialog shows: tool name, arguments (truncated), description, and a "Remember for this session" checkbox.

#### 6. Security Model

| Layer | Protection |
|-------|-----------|
| Path sandbox | `resolveSafePath()` — all file ops limited to `WORKSPACE_DIR` |
| Command allowlist | `shell_execute` checks command prefix against allowlist (configurable). Default: allow all. |
| Process isolation | Processes tracked in registry, killed on session end. Max runtime per process (configurable, default 5 min). |
| Rate limiting | Max N tool calls per session (configurable, default 50). Max total execution time. |
| Sensitive file guard | Block reads of `.env`, `.ssh/*`, `id_rsa`, `*.pem` etc. |
| Confirmation for destructive ops | `rm -rf`, `format`, `del /f /s` require extra confirmation even in yolo mode |

---

## Implementation Phases

### Phase 1: Dynamic Tool Loop (3-5 days)
1. Create `backend/computer-mode/engine.ts` with the REASON → LOOP → VERIFY cycle
2. Remove the hardcoded `computer_mode` plan step from `planner.ts`
3. Wire `ComputerModeEngine` into `/flux_ask` (replace planner path for `isComputerMode`)
4. Add permission request streaming for each tool call
5. Add `maxIterations` guard (default 25)

### Phase 2: Terminal + Changes (2-3 days)
1. Embed xterm.js in `ComputerWorkspace` (new `TerminalPanel.tsx`)
2. Wire `sendTerminal` SSE events to xterm.js
3. Implement `git diff` integration for the Changes tab
4. Make file tree clickable (preview in side panel)

### Phase 3: Screen Capture + Vision (3-4 days)
1. Implement `screenshot` tool in backend (platform-specific capture)
2. Add screen preview panel in `ComputerWorkspace`
3. Feed screenshots into vision-capable LLM calls
4. Handle the observe → decide → execute → capture loop

### Phase 4: Polish + Security (2-3 days)
1. Command allowlist/blocklist configuration
2. Sensitive file guards
3. Permission dialog with "Remember" checkbox
4. Rate limiting and timeout configuration
5. Session persistence (reconnect to running task)

---

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `backend/computer-mode/engine.ts` | **Create** | Core LLM-driven tool execution loop |
| `backend/computer-mode/types.ts` | **Create** | Computer mode specific types |
| `backend/computer-mode/tools.ts` | **Create** | Tool registry for computer mode |
| `backend/computer-mode/screenshot.ts` | **Create** | Cross-platform screenshot capture |
| `backend/computer-mode/permissions.ts` | **Create** | Permission checking logic |
| `backend/orchestrator/planner.ts` | **Modify** | Remove hardcoded computer_mode plan |
| `backend/index.ts` | **Modify** | Route `isComputerMode` to `ComputerModeEngine` instead of `OrchestratorEngine` |
| `frontend/.../ComputerWorkspace.tsx` | **Modify** | Add terminal panel, changes panel, screen preview |
| `frontend/.../TerminalPanel.tsx` | **Create** | xterm.js wrapper |
| `frontend/.../ScreenPreview.tsx` | **Create** | Screenshot display panel |

---

## Key Design Decisions

1. **Why not use the existing OrchestratorEngine?** — The orchestrator is designed for pre-planned, multi-phase document/research workflows. Computer mode needs a dynamic, LLM-driven tool selection loop that reacts to command output in real time. These are fundamentally different patterns.

2. **Why WS transport for computer mode?** — WS supports bidirectional communication (user can send interrupt signals, terminal input, permission responses). SSE is one-directional (server → client). Interactive terminal sessions require the user to be able to send input back.

3. **Why keep the existing orchestrator for non-computer workflows?** — The current orchestrator works well for research → document generation, image generation, and code research tasks. No need to refactor it.

4. **Why xterm.js?** — It's the gold standard for web terminals. Supports 256-color, VT100 escape sequences, copy/paste, and integrates with any backend that streams ANSI text.
