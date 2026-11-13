// index.ts – Full Pipeline Implementation (Complete & Optimized)
import { tavily } from '@tavily/core';
import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { streamText, generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { OrchestratorEngine } from './orchestrator';
import type { StreamWriter } from './orchestrator';
import { SYSTEM_PROMPT } from './prompt';
import { prisma } from "./db/prisma";
import { Prisma } from "./prisma/generated/client";
import { middleware } from './http/middleware/auth';
import { nim } from './nim-client';
import { retrieveMemories, getRecentMemories, extractMemories, buildMemoryContext, pruneMemories } from './memory';
import { compactConversation } from './compaction';
import { toolRegistry } from './tool-registry';
import http from "http";
import https from "https";
import { createAgentWebSocket } from './agent-protocol';
import { codeExecutor } from './tools/codeExecutor';
import { sandboxManager } from './sandbox/sandboxManager';
import { wikiManager } from './wiki/wikiManager';
import { isModelHealthy, recordFailure, recordSuccess, getShortTimeout } from './model-health';
import { taskRouter, recoverInterruptedTasks } from './task-routes';
import { classifyTaskIntent } from './task-detector';
import { planTask, runTaskLoop } from './task-loop';
import { syncManager } from './sync';
import type { SyncEvent } from './sync';
import { initGoogleAuth, handleGoogleCallback, getGoogleStatus, disconnectGoogle } from './google-auth';
import { createGoogleTools } from './google-tools';
import { chunkByHeadings } from './lib/chunking';
import type { PageData } from './lib/chunking';
import { retrieveDocChunks } from './lib/hybrid-retrieval';
import { toOpenAIChunk, fromOpenAITools, mapModelId, sseLine, BUILD_PROJECT_TOOL } from './openai-compat';
import { openAICompatAuth } from './openai-auth';
import { runMultiAgentBuild } from './orchestrator-multiagent';
import { env, assertEnv, isSmoke } from './config/env';
import { BODY_LIMIT, RATE_LIMITS } from './config/constants';
import { corsOptions } from './config/cors';
import {
    writeSafeSSE,
    writeReplaceText,
    sendStatus,
    sendProgress,
    sendAgentStatus,
    sendPermissionRequest,
    sendToolGroup,
    sendToolCall,
    writerFor,
} from './http/sse/writers';
import { trackSseConnection } from './http/sse/connections';
import { applySecurityMiddleware } from './http/middleware/security';
import { aiLimiter, globalLimiter, newConvLimiter } from './http/middleware/rate-limit';
import { detectMimeFromBase64 } from './services/files/mime';
import {
    buildStructuredFileContext,
    detectFileCategory,
    extractCodeSymbols,
    scoreSectionRelevance,
} from './services/files/files';
import {
    cleanAndValidateModelQuery,
    extractEntityQuery,
    extractProperNouns,
    extractTokens,
    isFollowUpQuery,
    isGenericQuery,
    isQueryRelevant,
    smartRewriteQuery,
    deriveSearchQuery,
    STOPWORDS,
} from './services/search/query';
import { fetchWeatherFromAPI } from './services/weather';
import { detectDocumentIntent, extractTopicFromQuery } from './services/documents/intent';
import type { DocType } from './services/documents/intent';
import { robustParseJSON } from './services/documents/json';
import {
    NIM_MODELS,
    VISION_MODELS,
    selectModel,
    routeModel,
    getProviderOptions,
} from './agents/model-router';
import { resolvePermission } from './agents/permissions';
import { createFileTools } from './agents/tools/files';
import { createAppTools } from './agents/tools/apps';
import { createExecTools } from './agents/tools/exec';
import { createDocumentTools } from './agents/tools/documents';
import { createWeatherTools } from './agents/tools/weather';
import { createImageTools } from './agents/tools/images';
import { createWikiTools } from './agents/tools/wiki';
import { createResearchTools } from './agents/tools/research';
import { createSearchTools } from './agents/tools/search';
import type { NewsItemType } from './services/news/feed';
import { getDomain, getUrlTitle } from './http/util/url';
import { tavilyClient } from './services/search/tavily';
import { createFluxTools } from './agents/tools/factory';
import { withToolTimeout, TOOL_TIMEOUTS } from './agents/tools/timeout';
import { createDiagnosticsRouter } from './http/routes/diagnostics';
import { createIntegrationsRouter } from './http/routes/integrations';
import { createSandboxRouter } from './http/routes/sandbox';
import { createWikiRouter } from './http/routes/wiki';
import { createConversationsRouter } from './http/routes/conversations';
import { createTtsRouter } from './http/routes/tts';
import { createArticlesRouter } from './http/routes/articles';
import { createMemoriesRouter } from './http/routes/memories';
import { createNewsRouter } from './http/routes/news';
import type { RoutesContext } from './http/routes/context';
import { availableModels } from './http/routes/catalog';
import { extractDocxText, extractPdf } from './services/pdf/extract';
import { processLargeDocument } from './services/documents/chunks';
import { sanitizeLocation, sanitizeTitle } from './http/util/sanitize';
import type { ToolContext } from './agents/tools/context';
import {
    generateDocumentWithSkill,
    fetchSkillFile,
    SKILL_REGISTRY,
} from './services/documents/generate';
import type { ContextualStatusMessages } from './services/documents/types';
import type { AgentState } from './agents/tools/state';
import { checkSsrFree } from './services/net/ssrf';

assertEnv();

// /health needs a secret. Failing at boot beats answering 404 forever.
if (!env.HEALTH_SECRET && !isSmoke) {
    throw new Error('FATAL: Missing HEALTH_SECRET environment variable.');
}

const app = express();

/** Collaborators the route modules receive instead of reaching into this file. */
const routesContext: RoutesContext = {
    env,
    isSmoke,
    healthSecret: env.HEALTH_SECRET ?? '',
    prisma,
    toolRegistry,
    resolvePermission,
    availableModels,
    wikiManager,
    sandboxManager,
    broadcastSyncEvent,
};

applySecurityMiddleware(app);
// ── SSE connection tracking & token re-validation ─────────
// SSE connection tracking lives in http/sse/connections.ts

// detectMimeFromBase64 lives in services/files/mime.ts
// SSRF helpers live in services/net/ssrf.ts
// ── Rate limiters ──────────────────────────────────────────
app.use(globalLimiter);
// ── Cross-device sync (Supabase Realtime Broadcast) ─────────
function broadcastSyncEvent(supabaseUserId: string, payload: SyncEvent) {
  syncManager.broadcast(supabaseUserId, payload).catch((e: unknown) => {
    console.error('[SYNC] Broadcast error:', (e as Error)?.message || e);
  });
}

app.use(createDiagnosticsRouter(routesContext));
app.use(createIntegrationsRouter());

// Sanitisation helpers live in http/util/sanitize.ts
// Model catalog, selection and fallback live in agents/model-router.ts
function slugify(input: string) {
    const slug = input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
    return slug || `conversation-${Date.now()}`;
}

// ── Auto‑rename ─────────────────────────────────────────────
const TITLE_MODEL = nim.chatModel('meta/llama-4-maverick-17b-128e-instruct');

function extractTitle(query: string): string {
    let q = query.trim();
    q = q.replace(/^(hey|hi|hello|yo)\s*/i, '');
    q = q.replace(/^(can|could|will|would|do|does|did|are|is|i want|i need|i have|i would like)\s+(you\s+)?(please\s+)?/i, '');
    q = q.replace(/\b(please|thanks|thank you|pls|plz)\b.*$/i, '');
    q = q.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    q = q.replace(/^(research|search|find|look up|tell me about|explain|what is|what are|how to|how do|how can|write|create|build|make|generate|edit|update|modify|change|add|remove|delete|fix|debug|refactor|review|analyze|check|test)\s+/i, '');
    if (!q || q.length < 3) q = query.trim().slice(0, 80);
    return q.slice(0, 80).replace(/[<>]/g, '');
}

async function autoRenameConversation(
    conversationId: string,
    firstQuery: string,
    docIntent?: string | null
) {
    const fallbackTitle = sanitizeTitle(extractTitle(firstQuery));

    try {
        const safeQuery = firstQuery.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!safeQuery) {
            if (fallbackTitle) {
                await prisma.conversation.updateMany({ where: { id: conversationId }, data: { title: fallbackTitle } });
            }
            return;
        }

        let context = "";
        if (docIntent === "image") context = "The user created an image. ";
        else if (docIntent) context = `The user created a ${docIntent.toUpperCase()} document. `;

        const { text } = await generateText({
            model: TITLE_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a title generator. Respond with ONLY a short title (5-10 words). No quotes, no punctuation, no explanation.',
                },
                {
                    role: 'user',
                    content: `${context}Generate a title for a conversation that starts with: ${safeQuery}`,
                },
            ],
            maxTokens: 30,
            temperature: 0.1,
            signal: AbortSignal.timeout(6000),
        } as any);

        let clean = sanitizeTitle((text ?? '').trim());
        if (!clean) clean = fallbackTitle;
        if (clean.length > 80) clean = fallbackTitle;

        if (docIntent === "image" && !clean.toLowerCase().includes("image")) clean = `Image: ${clean}`;
        else if (docIntent && docIntent !== "image" && !clean.toLowerCase().includes(docIntent.toLowerCase())) {
            clean = `${docIntent.toUpperCase()}: ${clean}`;
        }

        if (clean) {
            await prisma.conversation.updateMany({
                where: { id: conversationId },
                data: { title: clean },
            });
        }
    } catch (err: any) {
        if (fallbackTitle) {
            try {
                await prisma.conversation.updateMany({ where: { id: conversationId }, data: { title: fallbackTitle } });
            } catch {}
        }
        if (err?.code !== 'P2025' && err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
            console.warn("Failed to auto-rename conversation:", err?.message ?? err);
        }
    }
}

// SSE writers live in http/sse/writers.ts

// File analysis helpers (used by synthesis path)

// File analysis helpers live in services/files/files.ts
// Pending permissions live in agents/permissions.ts

// Permission approval endpoint
function cleanAnswerChunk(text: string): string {
    if (!text) return "";
    let cleaned = text;
    // Remove <THOUGHT>/<think> blocks entirely
    cleaned = cleaned.replace(/<(?:THOUGHT|think)>[\s\S]*?<\/(?:THOUGHT|think)>/gi, '');
    // Remove leftover tags
    cleaned = cleaned
        .replace(/<\/?(?:THOUGHT|think)>/gi, '')
        .replace(/<\/?ANSWER>/gi, '')
        .replace(/<\/?FOLLOW_UPS>/gi, '')
        .replace(/<\/?SEARCH_QUERY>/gi, '');
    // Remove <question> tags (keep content)
    cleaned = cleaned.replace(/<\/?question>/gi, '');
    return cleaned.trim();
}

// ── Strict thought sanitisation – removes any accidental answer content ──
function sanitizeThought(text: string): string {
    const lines = text.split('\n');
    const clean: string[] = [];
    const answerIndicators = [
        /^(The answer is|Here is|Here’s|To summarize|In conclusion|The capital is|The weather is|Right now|Let me|I recommend|You should)/i,
        /^[*-]\s/,
        /^(\d+\.)\s/,
        /^[A-Z][a-z\s]{20,}[:;]?\s*$/,
        /^---$/,
    ];
    for (const line of lines) {
        if (answerIndicators.some(r => r.test(line.trim()))) break;
        clean.push(line);
    }
    return clean.join('\n').trim();
}

// ── Format reminders ─────────────────────────────────────────
const AGENT_SYSTEM_EXTENSION = `
<sandbox_environment>
You have a cloud-isolated Linux sandbox (E2B). Persistent per conversation — files survive across messages.

CRITICAL — FILE LOCATIONS:
  - User-uploaded files are ALWAYS at /home/user/uploads/<filename>. NEVER edit files here — they are read-only originals.
  - To edit an uploaded file, FIRST copy it to /home/user/edits/<filename> using run_bash (cp /home/user/uploads/<file> /home/user/edits/<file>), then edit the copy in /home/user/edits/.
  - Your own created files go to /home/user/<filename>.
  - write_file, read_file, edit_file, and run_bash all share the SAME filesystem under /home/user/ — no cd needed.
  - If you're unsure what files exist, run list_files({ path: "/home/user/uploads/" }) to see uploaded files, or list_files({ path: "/home/user/edits/" }) to see files in progress.

CRITICAL — NEVER install packages (npm install, pip install, apt, etc.). Everything needed is pre-installed.
CRITICAL — NEVER run useless commands like "which", "echo", "ls", "cd", "pwd", "type", "--version", "npx <tool> --version", "tsc --noEmit", or any "2>&1 || true" error suppression. Jump straight to the actual work. All tools (node, tsx, tsc, gcc, rustc, python3, etc.) are pre-installed and verified — no need to check.
CRITICAL — After editing/creating a file, ALWAYS call get_generated_file to deliver it to the user. Files left in the sandbox are invisible to the user.
CRITICAL — NEVER reference /home/user/ paths in your text output to the user. These are internal sandbox paths the user cannot access. Use the download URL from get_generated_file result (format: /api/sandbox/download/&lt;id&gt;/&lt;filename&gt;) if you need to link a file.

<file_reading>
Originals are at /home/user/uploads/<filename> (read-only). For editing, FIRST copy to /home/user/edits/ then read/edit from there.
- For TEXT and CODE files (.ts, .tsx, .js, .py, .rs, .go, .txt, .md, .json, .yaml, .css, .html, .log): use read_file({ path: "/home/user/uploads/<filename>" }) for originals, or from /home/user/edits/ after copying.
- For CSV/TSV: use run_bash with pandas (pd.read_csv("/home/user/uploads/<filename>", nrows=5) to preview).
- For OFFICE files (.pdf, .docx, .xlsx, .pptx): do NOT use read_file. Use run_bash with Python and the full path: pymupdf for PDF, python-docx for DOCX, openpyxl for XLSX, python-pptx for PPTX.
- For images (.jpg, .png, .gif, .webp): already visible in context — no read needed.
- For archives (.zip, .tar): use run_bash with unzip -l / tar -tf to list, never blindly extract.
- ALWAYS check file size with stat before loading large files.
- NEVER install packages — everything (pandas, openpyxl, python-docx, python-pptx, pymupdf, Pillow) is pre-installed.
- NEVER run "which", "echo", "ls", "cd", "pwd", "type", "--version", "npx <tool> --version", or "2>&1 || true" — jump straight to real work.
</file_reading>

CRITICAL RULE — NEVER output shell commands as text. Never write things like:
  /bin/bash -c "...",  $ command,  \`command\`,  gcc -o out file.c  (or any bash syntax)
These commands do NOTHING when written as text. You MUST use the run_bash function call instead.

AVAILABLE FUNCTIONS — call these via function calling, do NOT describe them in text:

  run_python({ code: "..." })
    Execute Python. Pre-installed: pandas, numpy, matplotlib, seaborn, plotly, scipy, scikit-learn, pillow, requests.

  run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/file.c && /home/user/out" })
    Run ANY bash command. NEVER write /bin/bash -c or $ as text — always use this function call.

  write_file({ path: "/home/user/<filename>", content: "..." })
    Create/overwrite a file. AFTER writing code, you MUST IMMEDIATELY call run_bash next.

  read_file({ path: "/home/user/<filename>" }) — Read file contents (TEXT/CODE only).

  edit_file({ path: "...", old_str: "...", new_str: "..." })
    WORKFLOW: read_file first to see the full content, then edit_file with enough surrounding
    context in old_str to make the match unique. PREFER edit_file over write_file for targeted
    changes — only use write_file for entirely new files.

  list_files({ path: "/home/user/uploads/" }) — List user-uploaded originals. list_files({ path: "/home/user/edits/" }) — List files in progress (after copying from uploads). Use "/home/user/" to list your own created files.

  install_package({ package: "tensorflow" }) — pip install.

  create_project({ name: "app", files: [{ path: "src/main.js", content: "..." }] })
    Scaffold multi-file project.

  start_app({ name: "web", command: "node server.js", port: 3000 })
  stop_app({ app_id: "..." })
  list_apps({})
  get_app_logs({ app_id: "..." })
  get_app_url({ app_id: "..." })
    Public URL of running app. Call after start_app.

  get_generated_file({ path: "/home/user/edits/edited_file.ts" })
    Download file to user. AFTER editing (from /home/user/edits/) or generating a new file, call this to deliver it. Images render inline. NEVER deliver from /home/user/uploads/ — those are read-only originals.

REMEMBER: Writing bash commands as text does NOT execute them. Only function calls execute.
REMEMBER: Writing JSON like {"name":"some_tool","parameters":{...}} as text does NOT call that tool. Only actual function calls (via the tools API) execute. Never output raw tool JSON in your text response.
</sandbox_environment>

<code_workflow>
══════════════════════════════════════════════════════════════════════════════════
  CODE WORKFLOW — EXACT SEQUENCE (NEVER SKIP, NEVER REORDER)
══════════════════════════════════════════════════════════════════════════════════

When the user asks you to write code or edit files, you MUST follow this exact cycle.

FILESYSTEM: User-uploaded files are at /home/user/uploads/. Your own created files go to /home/user/.
write_file creates there. run_bash runs from /home/user/ (default CWD).
They share the SAME filesystem — no cd needed. Use ABSOLUTE paths (/home/user/uploads/...) in all commands.

┌──────────────────────────────────────────────────────────────────────────────────┐
│  CORE CYCLE                                                                      │
│                                                                                  │
│  1. write_file({ path: "/home/user/&lt;filename&gt;.&lt;ext&gt;", content: "..." })                      │
│       ↓                                                                          │
│  2. run_bash({ command: "&lt;compile-run command&gt;" })                                            │
│       ↓                                                                          │
│  3. READ the stdout/stderr from step 2                                           │
│       │                                                                          │
│       ├── ALL TESTS PASS (exit 0, no failures) → go to step 4                    │
│       │                                                                          │
│       ├── COMPILATION ERROR (gcc/g++ stderr) → go to DEBUG LOOP                  │
│       │                                                                          │
│       └── TEST FAILURE (any "FAIL" or "got X expected Y" in stdout) → DEBUG LOOP │
│                                                                                  │
│  4. Explain the code using the ACTUAL output from step 2:                        │
│     • What the code does / algorithm description                                  │
│     • Time and space complexity                                                   │
│     • Edge cases handled                                                          │
│     • Exact test output — report which passed/failed, with actual values          │
└──────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│  DEBUG LOOP (when compilation OR tests fail)                                     │
│                                                                                  │
│  Step A — READ the output carefully, line by line                                │
│  Step B — IDENTIFY the exact bug:                                                │
│           • Compile error → note the line number + error message                  │
│           • Test failure → note which test + expected vs actual                   │
│  Step C — edit_file to fix ONE bug at a time                                    │
│  Step D — run_bash to recompile and re-run                                      │
│  Step E — READ the new output                                                   │
│  Step F — If still failing → go back to Step A                                   │
│  Step G — ALL TESTS PASS → exit debug loop and go to explanation (step 4)       │
│                                                                                  │
│  CRITICAL: NEVER explain the code during the debug loop.                         │
│  CRITICAL: NEVER report "it failed" without fixing and re-running.               │
│  CRITICAL: After fixing with edit_file, you MUST call run_bash again.            │
└──────────────────────────────────────────────────────────────────────────────────┘

EXACT COMPILE & RUN COMMANDS — always use full /home/user/ paths:

  Language     | Compile command                                      | Run command
  ─────────────┼──────────────────────────────────────────────────────┼─────────────────────
  .c           | gcc -Wall -Wextra -o /home/user/out /home/user/f.c  | /home/user/out
  .cpp         | g++ -Wall -Wextra -o /home/user/out /home/user/f.cpp| /home/user/out
  .py          | (none — interpreted)                                 | python3 /home/user/f.py
  .js          | (none — interpreted)                                 | node /home/user/f.js
  .ts          | (none — interpreted)                                 | npx tsx /home/user/f.ts
  .rs          | rustc /home/user/f.rs -o /home/user/out             | /home/user/out
  .go          | go build -o /home/user/out /home/user/f.go          | /home/user/out
  .java        | javac /home/user/File.java -d /home/user             | java -cp /home/user File

  Combine compile + run with &&:  gcc -Wall -Wextra -o /home/user/out /home/user/prog.c && /home/user/out
  For Python/JS/TS:               python3 /home/user/script.py
                                  node /home/user/script.js
                                  npx tsx /home/user/script.ts

  IMPORTANT: The sandbox working directory is /home/user/. You do NOT need "cd /home/user"
  before these commands — paths are absolute and the shell starts in /home/user/.

══════════════════════════════════════════════════════════════════════════════════
  EXAMPLE 1 — C linked list reversal (SINGLE PASS: write → run → 4/4 PASS → explain)
══════════════════════════════════════════════════════════════════════════════════

User: Write a C function to reverse a linked list. Include test cases and verify all pass.

─── YOUR RESPONSE (exact sequence) ──────────────────────────────────────────────

write_file({ path: "/home/user/reverse.c", content: \`#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int data; struct Node *next; } Node;
Node* create(int d) { Node* n = malloc(sizeof(Node)); n->data = d; n->next = NULL; return n; }
void append(Node** h, int d) { if (!*h) { *h = create(d); return; } Node* c = *h; while (c->next) c = c->next; c->next = create(d); }
void print(Node* h) { while (h) { printf("%d -> ", h->data); h = h->next; } printf("NULL\\n"); }
Node* reverse(Node* h) { Node* p = NULL; Node* c = h; Node* n = NULL; while (c) { n = c->next; c->next = p; p = c; c = n; } return p; }
int main() {
  int pass = 0, total = 0;
  total++; Node* h1 = NULL; h1 = reverse(h1); if (h1 == NULL) { printf("Test 1 (empty): PASS\\n"); pass++; } else printf("Test 1: FAIL\\n");
  total++; Node* h2 = create(42); h2 = reverse(h2); if (h2 && h2->data == 42 && h2->next == NULL) { printf("Test 2 (single): PASS\\n"); pass++; } else printf("Test 2: FAIL\\n"); free(h2);
  total++; Node* h3 = NULL; append(&h3, 10); append(&h3, 20); h3 = reverse(h3); if (h3 && h3->data == 20 && h3->next && h3->next->data == 10 && h3->next->next == NULL) { printf("Test 3 (two): PASS\\n"); pass++; } else printf("Test 3: FAIL\\n"); free(h3);
  total++; Node* h4 = NULL; for (int i = 1; i <= 5; i++) append(&h4, i); printf("Before: "); print(h4); h4 = reverse(h4); printf("After:  "); print(h4);
  int exp[] = {5,4,3,2,1}, ok = 1; Node* c4 = h4; for (int i = 0; i < 5; i++) { if (!c4 || c4->data != exp[i]) { ok = 0; break; } c4 = c4->next; }
  if (ok && c4 == NULL) { printf("Test 4 (five): PASS\\n"); pass++; } else printf("Test 4: FAIL\\n"); free(h4);
  printf("\\n%d / %d tests passed.\\n", pass, total); return pass == total ? 0 : 1;
}\` })

─── THEN immediately (NEVER explain first) ──────────────────────────────────────

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/reverse.c && /home/user/out" })

─── READ the output ──────────────────────────────────────────────────────────────

[stdout:]
Before: 1 -> 2 -> 3 -> 4 -> 5 -> NULL
After:  5 -> 4 -> 3 -> 2 -> 1 -> NULL
Test 1 (empty): PASS
Test 2 (single): PASS
Test 3 (two): PASS
Test 4 (five): PASS
4 / 4 tests passed.

─── all 4/4 PASS → explain with actual output ───────────────────────────────────

The function uses three pointers (prev, curr, next) to reverse the linked list in-place in a single pass. Time complexity: O(n) — visits each node exactly once. Space complexity: O(1) — only three pointer variables, no recursion, no auxiliary data structures. Edge cases handled: empty list (returns NULL), single node (returns same node), two nodes, five nodes — all 4 test cases passed.

══════════════════════════════════════════════════════════════════════════════════
  EXAMPLE 2 — C linked list reversal (TEST FAILURE: write → run → test FAIL → debug → fix → re-run → PASS → explain)
══════════════════════════════════════════════════════════════════════════════════

User: Write a C function to reverse a linked list. Include tests. Ensure ALL tests pass.

─── TURN 1 ──────────────────────────────────────────────────────────────────────

write_file({ path: "/home/user/reverse.c", content: \`... (version with bug: while (c->next) instead of while (c)) ...\` })

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/reverse.c && /home/user/out" })

[stdout:]
Test 1 (empty): PASS
Test 2 (single): PASS
Test 3 (two): PASS
Test 4 (five): FAIL
3 / 4 passed

─── TEST FAILURE detected! Enter DEBUG LOOP ──────────────────────────────────────

─── TURN 2 — READ the code, IDENTIFY the bug, FIX it ────────────────────────────

read_file({ path: "/home/user/reverse.c" })
→ Inspecting reverse() function: while (c->next) { ... }

IDENTIFIED BUG: The while condition is \`c->next\` instead of \`c\`. When \`c\` points to the last node, \`c->next\` is NULL, so the loop stops before processing it — the last node never gets linked.

edit_file({ path: "/home/user/reverse.c",
  old_str: "while (c->next) { n = c->next; c->next = p; p = c; c = n; }",
  new_str: "while (c) { n = c->next; c->next = p; p = c; c = n; }"
})

─── RE-RUN after fix ─────────────────────────────────────────────────────────────

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/reverse.c && /home/user/out" })

[stdout:]
Before: 1 -> 2 -> 3 -> 4 -> 5 -> NULL
After:  5 -> 4 -> 3 -> 2 -> 1 -> NULL
Test 1 (empty): PASS
Test 2 (single): PASS
Test 3 (two): PASS
Test 4 (five): PASS
4 / 4 tests passed.

─── ALL TESTS PASS now → EXPLAIN with actual output ──────────────────────────────

The bug was in the while loop condition: \`while (c->next)\` stops one node early, skipping the last element because c->next is NULL on the final node. Fixed to \`while (c)\` which processes every node including the last one. After fix: all 4 test cases pass. The three-pointer technique runs in O(n) time with O(1) space.

══════════════════════════════════════════════════════════════════════════════════
  EXAMPLE 3 — Python palindrome (MULTI-CYCLE: write → run → 2 test failures → read → edit 2 bugs → re-run → 5/5 PASS)
══════════════════════════════════════════════════════════════════════════════════

User: Write a Python function to check if a string is a palindrome. Include test cases and verify all pass.

─── TURN 1 ──────────────────────────────────────────────────────────────────────

write_file({ path: "/home/user/palindrome.py", content: \`def is_palindrome(s):
    s = s.lower().replace(" ", "")
    for i in range(len(s)):
        if s[i] != s[-i]:
            return False
    return True

tests = [("racecar", True), ("hello", False), ("", True), ("a", True), ("A man a plan a canal Panama", True)]
passed = 0
for s, expected in tests:
    result = is_palindrome(s)
    status = "PASS" if result == expected else "FAIL"
    if result == expected: passed += 1
    print(f"'{s[:25]}': {status} (got {result}, expected {expected})")
print(f"{passed}/{len(tests)} passed")\` })

run_bash({ command: "python3 /home/user/palindrome.py" })

[stdout:]
'racecar': PASS (got True, expected True)
'hello': FAIL (got True, expected False)
'': PASS (got True, expected True)
'a': PASS (got True, expected True)
'A man a plan a canal Panama': FAIL (got True, expected False)
3/5 passed

─── 2 TEST FAILURES! Enter DEBUG LOOP ───────────────────────────────────────────

─── TURN 2 — READ code, DIAGNOSE both bugs ──────────────────────────────────────

read_file({ path: "/home/user/palindrome.py" })

IDENTIFIED BUG 1: \`s[i] != s[-i]\` when i=0 → compares s[0] with s[-0] = s[0] (same char!). Should be \`s[-i-1]\` because Python negative indexing starts at -1 for the last element.

IDENTIFIED BUG 2: \`.replace(" ", "")\` only removes spaces. "A man, a plan, a canal Panama" becomes "aman,apan,acanalpanama" — the commas remain, so it's not a palindrome.

edit_file({ path: "/home/user/palindrome.py",
  old_str: "s = s.lower().replace(\" \", \"\")",
  new_str: "import re\ns = re.sub(r'[^a-z0-9]', '', s.lower())"
})

edit_file({ path: "/home/user/palindrome.py",
  old_str: "if s[i] != s[-i]:",
  new_str: "if s[i] != s[-i-1]:"
})

─── RE-RUN after fixes ───────────────────────────────────────────────────────────

run_bash({ command: "python3 /home/user/palindrome.py" })

[stdout:]
'racecar': PASS (got True, expected True)
'hello': PASS (got False, expected False)
'': PASS (got True, expected True)
'a': PASS (got True, expected True)
'A man a plan a canal Panama': PASS (got True, expected True)
5/5 passed

─── ALL 5/5 TESTS PASS → EXPLAIN with actual output ─────────────────────────────

Fixed two bugs: (1) Python's negative indexing starts at -1 for the last element, not -0. Changed s[-i] to s[-i-1] so i=0 maps to the last character. (2) Used regex \`re.sub(r'[^a-z0-9]', '', ...)\` to strip ALL non-alphanumeric characters (commas, spaces, punctuation), not just spaces. After both fixes: all 5/5 test cases pass, including edge cases (empty string, single char, all punctuation).

══════════════════════════════════════════════════════════════════════════════════
  EXAMPLE 4 — C quicksort (COMPILATION ERROR: write → compile error → read → fix → recompile → success)
══════════════════════════════════════════════════════════════════════════════════

User: Write a C program that sorts an array using quicksort.

─── TURN 1 ──────────────────────────────────────────────────────────────────────

write_file({ path: "/home/user/quicksort.c", content: \`#include <stdio.h>
#include <stdlib.h>
void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }
int partition(int arr[], int lo, int hi) {
  int pivot = arr[hi], i = lo - 1;
  for (int j = lo; j < hi; j++) if (arr[j] <= pivot) { i++; swap(&arr[i], &arr[j]); }
  swap(&arr[i+1], &arr[hi]); return i+1;
}
void qsort(int arr[], int lo, int hi) {
  if (lo < hi) { int p = partition(arr, lo, hi); qsort(arr, lo, p-1); qsort(arr, p+1, hi); }
}
int main() {
  int arr[] = {9,2,7,1,5,3,8,4,6};
  int n = sizeof(arr)/sizeof(arr[0]);
  qsort(arr, 0, n-1);
  for (int i = 0; i < n; i++) printf("%d ", arr[i]);
  printf("\\n");
  return 0;
}\` })

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/quicksort.c && /home/user/out" })

[stderr:]
/home/user/quicksort.c:13: error: conflicting types for 'qsort'; have 'void(int*, int, int)'
/usr/include/stdlib.h: note: previous declaration of 'qsort' with type 'void(void*, size_t, size_t, __compar_fn_t)'

─── COMPILATION ERROR! Enter DEBUG LOOP ──────────────────────────────────────────

─── TURN 2 — IDENTIFY: name conflict with stdlib.h's built-in qsort(). FIX + RE-RUN

edit_file({ path: "/home/user/quicksort.c",
  old_str: "void qsort(int arr[], int lo, int hi) {",
  new_str: "void quicksort(int arr[], int lo, int hi) {"
})
edit_file({ path: "/home/user/quicksort.c",
  old_str: "qsort(arr, 0, n-1);",
  new_str: "quicksort(arr, 0, n-1);"
})
edit_file({ path: "/home/user/quicksort.c",
  old_str: "qsort(arr, lo, p-1); qsort(arr, p+1, hi);",
  new_str: "quicksort(arr, lo, p-1); quicksort(arr, p+1, hi);"
})

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/quicksort.c && /home/user/out" })

[stdout:]
1 2 3 4 5 6 7 8 9

─── CLEAN COMPILE → EXPLAIN ──────────────────────────────────────────────────────

Fixed name conflict: renamed qsort() to quicksort() to avoid clashing with stdlib.h's built-in qsort(). Output: 1 2 3 4 5 6 7 8 9 — all 9 elements sorted correctly. Uses Lomuto partition scheme. O(n log n) average case, O(n²) worst case.

══════════════════════════════════════════════════════════════════════════════════
  EXAMPLE 5 — FULL TDD: Kadane max subarray sum (write → run → test FAIL → debug → fix → re-run → all PASS → explain)
══════════════════════════════════════════════════════════════════════════════════

User: Write a C function for the maximum subarray sum (Kadane's algorithm). Include edge case tests. Ensure ALL pass.

─── TURN 1 ──────────────────────────────────────────────────────────────────────

write_file({ path: "/home/user/kadane.c", content: \`#include <stdio.h>
int max_subarray(int arr[], int n) {
  int max_sum = 0, cur_sum = 0;
  for (int i = 0; i < n; i++) {
    cur_sum += arr[i];
    if (cur_sum > max_sum) max_sum = cur_sum;
    if (cur_sum < 0) cur_sum = 0;
  }
  return max_sum;
}
int main() {
  int pass = 0, total = 0;
  total++; int t1[] = {-2,1,-3,4,-1,2,1,-5,4}; if (max_subarray(t1,9) == 6) { printf("Test 1 (mixed): PASS\\n"); pass++; } else { printf("Test 1: FAIL (got %d)\\n", max_subarray(t1,9)); }
  total++; int t2[] = {-5,-3,-1};              int r2 = max_subarray(t2,3); if (r2 == -1) { printf("Test 2 (all neg): PASS\\n"); pass++; } else { printf("Test 2: FAIL (got %d, expected -1)\\n", r2); }
  total++; int t3[] = {1,2,3,4};               if (max_subarray(t3,4) == 10) { printf("Test 3 (all pos): PASS\\n"); pass++; } else { printf("Test 3: FAIL\\n"); }
  total++; int t4[] = {7};                     if (max_subarray(t4,1) == 7) { printf("Test 4 (single): PASS\\n"); pass++; } else { printf("Test 4: FAIL\\n"); }
  printf("\\n%d/%d passed\\n", pass, total); return pass == total ? 0 : 1;
}\` })

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/kadane.c && /home/user/out" })

[stdout:]
Test 1 (mixed): PASS
Test 2 (all neg): FAIL (got 0, expected -1)
Test 3 (all pos): PASS
Test 4 (single): PASS
3/4 passed

─── TEST FAILURE! Enter DEBUG LOOP ───────────────────────────────────────────────

─── TURN 2 — DIAGNOSE, FIX, RE-RUN ──────────────────────────────────────────────

IDENTIFIED BUG: max_sum starts at 0. For all-negative arrays (like [-5,-3,-1]),
the algorithm never sets max_sum > 0, so it returns 0 instead of the largest
element (-1). Fix: initialize max_sum = cur_sum = arr[0], start loop from i=1.

edit_file({ path: "/home/user/kadane.c",
  old_str: "int max_subarray(int arr[], int n) {\n  int max_sum = 0, cur_sum = 0;\n  for (int i = 0; i < n; i++) {",
  new_str: "int max_subarray(int arr[], int n) {\n  if (n == 0) return 0;\n  int max_sum = arr[0], cur_sum = arr[0];\n  for (int i = 1; i < n; i++) {"
})

run_bash({ command: "gcc -Wall -Wextra -o /home/user/out /home/user/kadane.c && /home/user/out" })

[stdout:]
Test 1 (mixed): PASS
Test 2 (all neg): PASS (got -1)
Test 3 (all pos): PASS
Test 4 (single): PASS
4/4 passed

─── ALL 4/4 TESTS PASS → EXPLAIN with actual output ─────────────────────────────

Fixed Kadane's algorithm: max_sum must start at arr[0] (not 0) so all-negative arrays correctly return the largest element (-1). Also added n==0 guard for empty input. After fix: all 4/4 test cases pass including edge cases — all negative, all positive, mixed positive/negative, single element. Time: O(n) single pass. Space: O(1).

══════════════════════════════════════════════════════════════════════════════════
  EXAMPLE 6 — Python data processing (INSTALL + ERROR + DISCOVER + FIX + RETRY cycle)
══════════════════════════════════════════════════════════════════════════════════

User: Write a script to download a webpage and extract all image URLs.

─── TURN 1 ──────────────────────────────────────────────────────────────────────

write_file({ path: "/home/user/extract.py", content: \`import requests
from bs4 import BeautifulSoup
r = requests.get("https://example.com")
soup = BeautifulSoup(r.text, "html.parser")
for img in soup.find_all("img"):
    src = img.get("src")
    if src: print(src)\` })

run_bash({ command: "python3 /home/user/extract.py" })

[stderr:]
Traceback (most recent call last):
  File "/home/user/extract.py", line 1, in <module>
    import requests
ModuleNotFoundError: No module named 'requests'

─── DEPENDENCY ERROR! Install missing package, then re-run ───────────────────────

run_bash({ command: "pip install requests beautifulsoup4 -q" })

run_bash({ command: "python3 /home/user/extract.py" })

[stdout:] (empty — no output)

─── No errors but also no output. Script ran but produced nothing. Investigate. ──

─── TURN 2 — Add debug output to verify script behavior ──────────────────────────

edit_file({ path: "/home/user/extract.py",
  old_str: "r = requests.get(\"https://example.com\")",
  new_str: "r = requests.get(\"https://example.com\")\nprint(f\"Status: {r.status_code}, Content length: {len(r.text)} bytes\")"
})

edit_file({ path: "/home/user/extract.py",
  old_str: "for img in soup.find_all(\"img\"):\n    src = img.get(\"src\")\n    if src: print(src)",
  new_str: "imgs = soup.find_all(\"img\")\nprint(f\"Found {len(imgs)} image(s)\")\nfor img in imgs:\n    src = img.get(\"src\")\n    if src: print(src)"
})

run_bash({ command: "python3 /home/user/extract.py" })

[stdout:]
Status: 200, Content length: 1256 bytes
Found 0 image(s)

─── Script runs correctly. Confirmed: example.com has 0 images. → EXPLAIN ───────

Script downloads example.com (status 200, 1256 bytes), parses with BeautifulSoup, and extracts all <img src> attributes. First attempt failed with ModuleNotFoundError — missing requests library. Installed with pip, re-ran. Got empty output (no errors but no results), added debug printing to verify. Confirmed: example.com contains 0 images (expected — it's a minimal placeholder site). Always verify output isn't silently empty.

══════════════════════════════════════════════════════════════════════════════════
  WEB APP WORKFLOW
══════════════════════════════════════════════════════════════════════════════════

Static app (pure HTML/CSS/JS, no backend server):
  1. write_file({ path: "/home/user/index.html", content: "..." }) — all CSS in <style>, JS in <script>
  2. For multi-file: create_project({ name: "app-name", files: [{path: "file.html", content: "..."}] })
  3. Preview: get_generated_file({ path: "/home/user/index.html" }) → renders in iframe
  4. CDN libraries only (Tailwind via CDN, Chart.js, Three.js) — NO npm, NO build tools
  5. NO start_app needed for static HTML — get_generated_file is sufficient

Dynamic app (has server/backend):
  1. create_project({ name, files: [{path, content}] }) — scaffold ALL files at once
  2. start_app({ name: "myapp", command: "node server.js", port: 3000 })
  3. Wait ~2 seconds for server to start
  4. get_app_url({ app_id }) → get public HTTPS URL
  5. Give URL to user — tell them it's live

Updating existing app:
  1. edit_file to change specific parts of a file
  2. Or write_file to overwrite an entire file
  3. Tell user to refresh browser

══════════════════════════════════════════════════════════════════════════════════
  DATA ANALYSIS WORKFLOW
══════════════════════════════════════════════════════════════════════════════════

When user asks to analyze data, make a chart, or process a file:
  Step 1 — File is at /home/user/&lt;filename&gt; (auto-uploaded by frontend)
  Step 2 — run_python with pandas to load and explore data
  Step 3 — matplotlib/seaborn charts → save to /home/user/chart.png → auto-downloads
  Step 4 — Print df.describe(), df.info(), df.head() — output streams live
  Step 5 — Explain findings concisely with actual numbers from the output
  Step 6 — If file not found → use list_files to discover actual filename

══════════════════════════════════════════════════════════════════════════════════
  ERROR RECOVERY — COMPLETE COMPILE-AND-FIX CYCLE
══════════════════════════════════════════════════════════════════════════════════

When run_python or run_bash produces stderr OR test failures in stdout:
  MUST: READ every line of output carefully
  MUST: Identify the exact error (line number, variable, type mismatch, off-by-one, missing import)
  MUST: Fix ONE bug at a time with edit_file
  MUST: Re-run after each fix
  MUST: Repeat until ALL tests pass (exit code 0, no FAIL lines)
  NEVER: Say "it failed" and stop — always fix and retry
  NEVER: Explain code during the debug loop — only after all tests pass

<pattern name="compile-and-fix-cycle">
On compilation error or test failure:
  1. Read stderr or test output line by line — find exact error
  2. Call edit_file to fix ONE specific bug
  3. Re-run compilation/execution
  4. If still failing → go back to step 1
  5. Clean compile + all tests pass → explain with actual output
</pattern>
</error_recovery>
`;

const VISUAL_INSTRUCTIONS = `
VISUAL STYLE RULES:
- Use markdown for structure (headings, lists, bold).
- For math, use LaTeX wrapped in $ or $$.
- Use emojis to make the response engaging.
- For charts/graphs/plots, ALWAYS embed an interactive <CHART> block. Never call generate_image or generate_document for charts.

═══════════════════════════════════════
  CHART BLOCK RULES — READ CAREFULLY
═══════════════════════════════════════

MANDATORY: Every chart you produce MUST:
  1. Have a descriptive "title" (never omit this)
  2. Have at least 8 labels/data points (never produce a 3- or 4-bar demo)
  3. Use real, domain-appropriate numbers — NEVER round placeholders (100/200/300)
  4. Include "xLabel" and "yLabel" for bar/line/area charts
  5. Assign a distinct "color" hex to EVERY dataset
  6. Pick the most insightful chart type for the data

DO NOT:
  ✗ Produce a chart with fewer than 6 data points unless the domain truly has fewer
  ✗ Use generic values like 10, 20, 30, 40 or 100, 200, 300
  ✗ Omit "title", "xLabel", or "yLabel" on bar/line/area charts
  ✗ Default to "bar" when "area" or "line" would be more insightful
  ✗ Produce a single-dataset chart when multiple datasets would be more informative

CHART TYPES → "bar" | "line" | "area" | "pie" | "doughnut" | "scatter"
  Pick based on the data:
  • Trend over time          → "area" (shows volume) or "line"
  • Comparing categories     → "bar" (few cats) or "bar" with layout:"horizontal" (many/long names)
  • Multiple trends together → "line" with multiple datasets
  • Part of a whole (≤6)    → "doughnut"
  • Distribution / correlation → "scatter"
  • Bar + trend overlay      → "bar" with one dataset having type:"line"

FULL SCHEMA — use all relevant fields:
  <CHART>
  {
    "type": "area",
    "title": "Global EV Sales by Region (2019–2024)",
    "subtitle": "Cumulative annual sales in thousands of units",
    "labels": ["2019","2020","2021","2022","2023","2024"],
    "xLabel": "Year",
    "yLabel": "Units Sold (thousands)",
    "valueFormat": "number",
    "showValues": false,
    "stacked": true,
    "referenceLine": { "value": 5000, "label": "5M milestone", "color": "#fbbf24" },
    "datasets": [
      { "label": "China",  "data": [1206,1367,3521,5890,8200,11400], "color": "#6366f1" },
      { "label": "Europe", "data": [561, 1367,2290,2700,3200,3800],  "color": "#10b981" },
      { "label": "USA",    "data": [328, 295, 631, 924, 1400,1800],  "color": "#f59e0b" },
      { "label": "Others", "data": [105, 171, 358, 686, 900, 1200],  "color": "#ec4899" }
    ]
  }
  </CHART>

FIELD REFERENCE:
  • type          — chart type (see above guide)
  • title         — REQUIRED: descriptive heading
  • subtitle      — secondary description (use for units, source, or timeframe)
  • labels        — X-axis category labels for bar/line/area
  • xLabel/yLabel — REQUIRED for bar/line/area: axis titles
  • valueFormat   — "number" | "currency" (adds $) | "percent" (adds %)
                    Numbers auto-abbreviate: 1500 → 1.5k, 2300000 → 2.3M
  • showValues    — true = show data labels on bars/points (use for small datasets)
  • stacked       — true = stack bars/areas cumulatively
  • layout        — "horizontal" flips bars (use for long category names like country names)
  • referenceLine — { value, label?, color? } draws a dashed horizontal guide
  • datasets[].type  — per-dataset type override: "bar" | "line" | "area"
                       (allows mixing e.g. bars for actuals + line for a target/trend)
  • datasets[].color — REQUIRED: hex color for each series (choose harmonious palette)
  • datasets[].points — scatter only: [{ x: 1.2, y: 4.5 }, ...] instead of data[]

WHEN ASKED FOR "a demo chart" or "any chart" or "show me a chart":
  Do not ask what kind — instead pick the most interesting one you know, use real-world
  data (e.g. market share, population, revenue trends, climate data), and make it rich:
  multiple datasets, a reference line, axis labels, and at least 8 data points.

- For diagrams, flowcharts, and architecture, use Mermaid syntax in <MERMAID>...</MERMAID> tags:
  <MERMAID>
  graph TD
    A --> B
  </MERMAID>
`;

// ── Weather helpers ──────────────────────────────────────────────────────
// Weather helpers live in services/weather/
// Document intent detection lives in services/documents/intent.ts
// JSON repair lives in services/documents/json.ts
// ─── Document generation ──────────────────────────────────────────────────

// Document generation lives in services/documents/generate.ts

// PDF and DOCX extraction live in services/pdf/extract.ts
// ═══════════════════════════════════════════════════════════
// SANDBOX / CODE INTERPRETER ROUTES
// ═══════════════════════════════════════════════════════════

app.use(createSandboxRouter(routesContext));
app.use(createWikiRouter(routesContext));
// ── Long-running Task System ──────────────────────────────────────
app.use(taskRouter);

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

app.use(createConversationsRouter(routesContext));
app.use(createNewsRouter());

// ─── MEMORY MANAGEMENT ──────────────────────────────────────
app.use(createMemoriesRouter(routesContext));
async function generateContextualStatusMessages(
    query: string,
    thoughtText: string,
    model: any,
    docType?: DocType,
): Promise<ContextualStatusMessages> {
    const dt = docType ?? null;
    const defaults: ContextualStatusMessages = {
        searching: "Searching the web...",
        reading: "Reading through sources...",
        generating: "Composing response...",
        generatingFile: dt ? `Generating your ${dt.toUpperCase()}...` : "Generating document...",
        readingSkill: dt ? `Reading the ${dt.toUpperCase()} skill` : "Reading the skill rules...",
    };

    try {
        const docCtx = dt
            ? `The user wants a ${dt.toUpperCase()} file generated about this topic.`
            : "The user wants a regular chat response.";

        const { text } = await generateText({
            model,
            system: [
                "You are a UI copywriter for Flux, an AI assistant.",
                "Output ONLY a valid JSON object — no markdown fences, no prose, no backticks.",
                "Every value must be 3–8 words and end with '...'",
                "Messages must be SPECIFIC to the actual topic — never generic filler.",
            ].join(" "),
            messages: [{
                role: "user",
                content: `Write SHORT, SPECIFIC loading status messages for Flux AI.
Each message describes what is happening RIGHT NOW for the given query.

User query: "${(query ?? '').slice(0, 200)}"
AI reasoning notes: "${(thoughtText ?? '').slice(0, 500)}"
Document context: ${docCtx}

Respond ONLY with this JSON (no other text):
{"searching":"...","reading":"...","generating":"...","generatingFile":"...","readingSkill":"..."}

RULES:
1. 3–8 words per message, always end with "..."
2. Be SPECIFIC to the query topic — mention actual subject matter
3. Per-key guidelines:
   "searching"      → what is being looked up        e.g. "Fetching latest GPU benchmark data..."
   "reading"        → what is being analysed          e.g. "Scanning hardware reviews and specs..."
   "generating"     → what answer/text is being built e.g. "Writing your detailed analysis now..."
   "generatingFile" → what ${dt ? dt.toUpperCase() + " file" : "file"} is being built e.g. "${dt ? `Assembling your ${dt.toUpperCase()} now...` : "Building your document now..."}"
    "readingSkill"   → loading format rules for type   e.g. "${dt ? `Reading the ${dt.toUpperCase()} skill` : "Reading the skill rules..."}"

FORBIDDEN (too generic — never write these):
  "Searching the web...", "Reading results...", "Generating document...", "Applying rules..."

GOOD examples (specific — write like these):
  searching:      "Looking up recent quantum computing papers...", "Finding 2025 EV range data..."
  reading:        "Scanning research papers and studies...", "Analysing benchmark comparisons..."
  generating:     "Writing your analysis now...", "Composing the explanation step by step..."
  generatingFile: "Building your climate policy PDF...", "Assembling slides on machine learning..."
  readingSkill:   "Reading the PDF skill...", "Reading the PPTX skill..."`,
            }],
            maxTokens: 200,
        } as any);

        const stripped = text.replace(/```json|```/g, "").trim();
        const firstBrace = stripped.indexOf("{");
        const lastBrace = stripped.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace === -1) return defaults;

        const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
        return {
            searching: typeof parsed.searching === "string" ? parsed.searching : defaults.searching,
            reading: typeof parsed.reading === "string" ? parsed.reading : defaults.reading,
            generating: typeof parsed.generating === "string" ? parsed.generating : defaults.generating,
            generatingFile: typeof parsed.generatingFile === "string" ? parsed.generatingFile : defaults.generatingFile,
            readingSkill: typeof parsed.readingSkill === "string" ? parsed.readingSkill : defaults.readingSkill,
        };
    } catch (e) {
        console.warn("[STATUS_MSG] generateContextualStatusMessages failed, using defaults:", e);
        return defaults;
    }
}

app.post('/flux_ask', middleware, aiLimiter, async (req: any, res: any) => {
    let activeConversationId = '';
    let model: any = null;
    let nq = '';

    try {
        const uid = req.appUserId!;
        const suid = req.userId!;

        const {
            query,
            model: pref,
            fileContent,
            attachedFiles,
            location,
            conversationId,
            isComputerMode,
            mode,
        } = req.body as {
            query?: string;
            model?: string;
            fileContent?: string;
            attachedFiles?: { name: string; content?: string; type?: string }[];
            location?: string;
            conversationId?: string;
            isComputerMode?: boolean;
            mode?: string;
        };

        if (!query?.trim()) return res.status(400).json({ error: 'Query is required' });
        nq = query.trim();

        // ── Long-running task detection (multi-step project builder) ──
        const taskIntent = await classifyTaskIntent(nq).catch(() => 'SIMPLE' as const);
        const isLongTask = taskIntent === 'LONG_TASK';

        if (isLongTask) {
            const uid = req.appUserId!;
            const convIsNew = !conversationId;
            const newConv = conversationId ? null : await prisma.conversation.create({
                data: { title: nq.slice(0, 120), slug: slugify(nq), userId: uid },
            });
            const convId = conversationId ?? newConv!.id;
            const convSlug = conversationId ? undefined : newConv!.slug;
            activeConversationId = convId;
            if (convIsNew) broadcastSyncEvent(suid, { type: 'conversation_created' });

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Conversation-Id', convId);
            if (convSlug) res.setHeader('X-Conversation-Slug', convSlug);

            trackSseConnection(uid, req, res);

            await prisma.message.create({
                data: { content: nq, role: 'User', conversationId: convId },
            });

            const task = await prisma.task.create({
                data: { conversationId: convId, userId: uid, title: nq.slice(0, 120), goal: nq },
            });

            const writer = {
                writeStatus: (subtype: string, message: string, data?: any) => { if (!res.writableEnded) res.write(`event: status\ndata: ${JSON.stringify({ subtype, message, data })}\n\n`); },
                writeText: (text: string) => { if (!res.writableEnded) res.write(`data: ${text}\n\n`); },
                writeEvent: (event: string, data: any) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); },
                get writableEnded() { return res.writableEnded; },
            };

            writer.writeEvent('task_created', { taskId: task.id, title: nq.slice(0, 120) });

            const taskText = `I'll start building "${nq.slice(0, 120)}" for you. Follow the progress in the task card above.`;
            writer.writeText(taskText);
            writer.writeText('[DONE]');

            await planTask(task.id).catch(e => {
                console.error('[TASK] planTask error:', e);
                writer.writeText('[TASK] Failed to create plan. Please try a simpler request.');
            });
            runTaskLoop(task.id, writer).catch(e => console.error('[TASK] Loop error:', e));

            await prisma.message.create({
                data: {
                    content: taskText,
                    role: 'Assistant',
                    conversationId: convId,
                },
            });

            const safetyTimer = setTimeout(() => { if (!res.writableEnded) res.end(); }, 30_000);
            if (typeof safetyTimer === 'object' && 'unref' in safetyTimer) (safetyTimer as any).unref();
            req.on('close', () => { if (typeof safetyTimer === 'object' && 'unref' in safetyTimer) (safetyTimer as any).unref(); });

            console.log(`[TASK] Long task created: ${task.id} — "${nq.slice(0, 80)}..."`);
            return;
        }

        const safeFile = typeof fileContent === 'string' ? fileContent.slice(0, 200_000) : '';
        const safeLoc = sanitizeLocation(location ?? '');
        if (attachedFiles && attachedFiles.length > 10)
            return res.status(400).json({ error: 'Too many attachments' });
        const safeAtt = (attachedFiles ?? [])
            .filter(f => f && typeof f.name === 'string')
            .map(f => {
                const rawContent = typeof f.content === 'string' ? f.content : '';
                const detected = rawContent ? detectMimeFromBase64(rawContent) : null;
                const claimedType = f.type || 'text/plain';
                if (detected && !detected.startsWith(claimedType.split('/')[0]!)) {
                    console.warn(`[MIME_MISMATCH] Claimed "${claimedType}", detected "${detected}" for file "${f.name}" — using detected type`);
                }
                const actualType = detected || claimedType;
                const isMedia = actualType.startsWith('image/') || actualType.startsWith('video/');
                return {
                    name: f.name.slice(0, 200),
                    content: rawContent.slice(0, isMedia ? 2_000_000 : 200_000),
                    type: actualType,
                };
            });
        // True if user attached any text/code file (via either channel)
        const hasAnyFile = !!(safeFile || safeAtt.some(f => f.content && !f.type?.startsWith('image/') && !f.type?.startsWith('video/')));
        console.log("[DEBUG /flux_ask] hasAnyFile:", hasAnyFile, "safeFile.length:", safeFile.length, "safeAtt:", safeAtt.map(f => ({ name: f.name, type: f.type, length: f.content.length })));

        const memEnabled = req.authUser?.user_metadata?.enable_memory ?? true;

        // ── Determine or create conversation ────────────────────────────
        let existingConv = null;
        if (conversationId) {
            existingConv = await prisma.conversation.findFirst({
                where: { id: conversationId, userId: uid },
                select: {
                    id: true,
                    compaction: true,
                    compactMsgCount: true,
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        select: { content: true, role: true, createdAt: true },
                    },
                },
            });
        }
        const convIsNew = !existingConv && !conversationId;
        const newConv = convIsNew ? await prisma.conversation.create({
            data: { title: nq.slice(0, 120), slug: slugify(nq), userId: uid },
        }) : null;
        activeConversationId = existingConv?.id ?? newConv!.id;
        if (convIsNew) broadcastSyncEvent(suid, { type: 'conversation_created' });

        // ── SSE setup ───────────────────────────────────────────────────
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Conversation-Id', activeConversationId);
        if (newConv) res.setHeader('X-Conversation-Slug', newConv.slug);
        res.flushHeaders();

        trackSseConnection(uid, req, res);

        const isFollowUp = !!existingConv;
        const locInfo = safeLoc ? `User's location: ${safeLoc}` : "User's location: unknown";
        const nowStr = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric',
            month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        // ── Build conversation history with compaction support ──
        const historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
        let previousQuery: string | undefined;
        if (isFollowUp && existingConv!.messages?.length) {
            const MAX_HIST_CHARS = 10_000;
            let used = 0;
            const memos = existingConv!.messages;
            const skipCount = (existingConv as any).compactMsgCount ?? 0;

            const compaction = (existingConv as any).compaction as string | null;
            if (compaction) {
                historyMessages.push({ role: 'user', content: `[Compacted history]\n${compaction}` });
                used += compaction.length;
            }

            const reversed: { role: 'user' | 'assistant'; content: string }[] = [];
            for (let i = memos.length - 1; i >= skipCount; i--) {
                const m = memos[i]!;
                const content = typeof m.content === 'string' ? m.content.slice(0, 2000) : '';
                if (!content) continue;
                const role = m.role === 'User' ? 'user' : 'assistant';
                if (used + content.length > MAX_HIST_CHARS && reversed.length > 0) break;
                used += content.length;
                reversed.push({ role, content } as any);
            }
            for (let i = reversed.length - 1; i >= 0; i--) historyMessages.push(reversed[i]!);

            const lastUserMsg = [...existingConv!.messages].reverse().find((m: any) => m.role === 'User');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
                previousQuery = lastUserMsg.content;
            }
        }

        // ── Save user message (fire-and-forget — don't block streaming) ──
        const userMsgFileText = '';
        prisma.message.create({
            data: {
                content: userMsgFileText ? `${userMsgFileText}\n--\n${nq}` : nq,
                role: 'User',
                conversationId: activeConversationId,
                fileAttachment: safeAtt.length > 0 ? safeAtt : undefined,
            },
        }).catch((e: any) => console.warn('[SAVE] Failed to save user message:', e?.message));

        // ── Model routing — classify query and route to appropriate tier ──
        const route = routeModel(pref, nq, previousQuery);
        model = selectModel(route.modelId);
        const memCtx = memEnabled
            ? await (isFollowUp
                ? getRecentMemories(uid, 8)
                : retrieveMemories(uid, nq)
            ).then(buildMemoryContext).catch((e) => {
                console.warn('[MEMORY] retrieveMemories failed:', (e as any)?.message ?? e);
                return '';
              })
            : '';

        // Auto-write attached text files to the E2B sandbox so run_bash can reference them
        let sandboxFileNotice = '';
        if (hasAnyFile && activeConversationId) {
            try {
                const cid = activeConversationId;
                const paths: string[] = [];
                // Ensure uploads directory exists
                await codeExecutor.runBash(cid, 'mkdir -p /home/user/uploads /home/user/edits');
                for (const att of safeAtt) {
                    if (!att.content) continue;
                    const fn = att.name || 'attached.bin';
                    const isBinary = att.type?.startsWith('image/') || att.type?.startsWith('video/') || att.type?.includes('pdf');
                    if (isBinary) {
                        const rawBase64 = att.content.startsWith('data:') ? (att.content.split(',')[1] || '') : att.content;
                        if (rawBase64) {
                            await codeExecutor.writeFile(cid, `/home/user/uploads/${fn}`, rawBase64);
                            paths.push(`/home/user/uploads/${fn}`);
                        }
                    } else {
                        const raw = typeof att.content === 'string' ? att.content : '';
                        if (raw) {
                            await codeExecutor.writeFile(cid, `/home/user/uploads/${fn}`, raw);
                            paths.push(`/home/user/uploads/${fn}`);
                        }
                    }
                }
                if (paths.length) {
                    sandboxFileNotice = `\n📁 Uploaded file(s) available in sandbox at:\n${paths.map(p => `  - ${p}`).join('\n')}\nIMPORTANT: These files are in /home/user/uploads/. When reading, editing, or running commands, always use the full /home/user/uploads/<filename> path.\n`;
                    console.log(`[SANDBOX_WRITE] Successfully wrote ${paths.length} file(s) to sandbox:`, paths.join(', '));
                }
            } catch (e: any) {
                console.warn('[SANDBOX_WRITE] Could not write attached files:', e.message);
            }
        }

        // When the user provides a file, prepend a hard instruction to stop the model searching
        const fileGuard = hasAnyFile
            ? `\n⚠️ FILE ATTACHED: The user's file(s) are below (truncated). The FULL file is at /home/user/uploads/<filename> in the sandbox.${sandboxFileNotice}
CRITICAL — FIRST STEP: Call read_skill({ doc_type: "file" }) IMMEDIATELY before doing anything else. This loads the file-reading rules that tell you how to handle each file type (PDF, DOCX, XLSX, code, etc.). Do NOT skip this.
CRITICAL — SEARCH RULES: You may call web_search at most 2 times. Each call must have targeted, specific queries (not broad). After 2 searches, STOP and answer with what you found. Do NOT search again.
CRITICAL — FILE LOCATION: Uploaded originals are at /home/user/uploads/. To edit, FIRST copy to /home/user/edits/ (run_bash: cp /home/user/uploads/<file> /home/user/edits/<file>). All editing happens in /home/user/edits/ — NEVER edit files in uploads/. Deliver from /home/user/edits/ when done.
CRITICAL — You MUST only work on the uploaded file(s). Do NOT create, scaffold, or generate new files or projects unless the user explicitly asks.
CRITICAL — ALWAYS call get_generated_file({ path: "/home/user/edits/<filename>" }) after editing — files left in sandbox are invisible.
CRITICAL — NEVER install packages (pip, npm, apt). Everything is pre-installed.

EDITING WORKFLOW (strict order):
  1. list_files({ path: "/home/user/edits/" }) — see working copies (or list_files({ path: "/home/user/uploads/" }) for originals)
  2. If file is inline text (no upload), write to /home/user/edits/ first via write_file
  3. If file was uploaded as attachment, run_bash({ command: "mkdir -p /home/user/edits && cp /home/user/uploads/<file> /home/user/edits/<file>" }) — copy to edits/
  4. read_file({ path: "/home/user/edits/<filename>" }) — read the copy
  5. edit_file({ path: "/home/user/edits/<filename>", old_str: "...", new_str: "..." }) — edit the copy
  6. run_bash with compile/lint/verify using /home/user/edits/<filename> paths
  7. get_generated_file({ path: "/home/user/edits/<filename>" }) — deliver to user
IMPORTANT: After step 3, ALL subsequent operations use /home/user/edits/. Never go back to /home/user/uploads/. The uploads/ original may not persist.\n`
            : '';

        // Detect system/architecture/code-review questions — strip execution tools
        const systemQueryRE = /\b(architecture|design|codebase|how.*(work|built|implement|structur)|your (code|design|architecture|system)|this (system|code|function|class|file|router))\b/i;
        let isSystemQuery = systemQueryRE.test(nq);
        if (!isSystemQuery && previousQuery) isSystemQuery = systemQueryRE.test(previousQuery);
        if (!isSystemQuery && existingConv?.messages?.length) {
            const firstUserMsg = existingConv.messages.find((m: any) => m.role === 'User');
            if (firstUserMsg && typeof firstUserMsg.content === 'string') isSystemQuery = systemQueryRE.test(firstUserMsg.content);
        }
        const systemGuard = isSystemQuery
            ? `\n⚠️ SYSTEM QUESTION DETECTED: The user is asking about your own architecture, code, or design. Do NOT call create_project, write_file, edit_file, run_bash, run_python, install_package, or any sandbox tools. Do NOT scaffold, build, or execute anything. Answer from your existing knowledge of the codebase. Only read_file and list_files are allowed for referring to actual file contents.\n`
            : '';

        // Detect factual/research queries — strip all non-search tools to prevent tool-hopping
        const searchQueryRE = /\b(find|search|look\s*up|tell\s+me\s+about|information\s+(about|on|regarding)|what\s+(is|are|was|were|does|do|can)|who\s+(is|are|was|were)|where\s+(is|are|was|were|can|does)|when\s+(is|are|was|were|does|did)|why\s+(is|are|was|were|does|did|can)|how\s+(is|are|was|were|does|did|can|do|to)|compare|vs\.?|versus|difference\s+(between|among)|list\s+(the|all|some|various|different)|explain|define|elaborate|details?\s+(about|on|of|regarding)|overview\s+(of|on)|curious\s+about|wondering\s+(about|if|what|why|how)|can\s+you\s+(find|search|look|tell|explain|show|provide|give|list)|summarize|in\s+detail|deep\s+dive|verify|verify\s+if|check|check\s+if|confirm|confirm\s+if|validate|prove|disprove|debunk|fact.?check|legitimate|is\s+it\s+true|is\s+this\s+true|is\s+that\s+true|is\s+it\s+real|tell\s+me\s+if)\b/i;
        const codeExecRE = /\b(write|create|build|develop|implement|code|program|script|compile|run|execute|debug|fix|refactor|deploy)\s+(a|an|the|this|my|some|a\s+simple|a\s+basic|a\s+Python|a\s+JavaScript|a\s+React)\b/i;
        const conversationalRE = /\b(hello|hi\b|hey\b|greetings|thanks|thank\s+you|who\s+are\s+you|what\s+can\s+you|what\s+do\s+you\s+do|your\s+name|how\s+are\s+you)\b/i;
        const isWeatherIntent = /\b(weather|temperature|forecast|humidity|rain|sunny|cloudy|wind|how.*hot|how.*cold)\b/i.test(nq);
        let isSearchQuery = searchQueryRE.test(nq) && !codeExecRE.test(nq) && !isSystemQuery && !conversationalRE.test(nq) && !isWeatherIntent;
        if (!isSearchQuery && previousQuery) {
            const prevWeather = /\b(weather|temperature|forecast|humidity|rain|sunny|cloudy|wind|how.*hot|how.*cold)\b/i.test(previousQuery);
            isSearchQuery = searchQueryRE.test(previousQuery) && !codeExecRE.test(previousQuery) && !conversationalRE.test(previousQuery) && !prevWeather;
        }

        // When a file is attached and the query mentions verifying/analyzing it,
        // don't force system or research mode — the model needs sandbox tools (run_bash, etc.)
        const isFileVerificationQuery = hasAnyFile && (
          safeAtt.some(f => f.name && nq.toLowerCase().includes(f.name.toLowerCase())) ||
          /\b(verify|analyze|review|check|examine|inspect|audit|look\s*(at|over)|debug|test|read)\s+(this|the|my|that)\s*(file|code|function|component|script|class|message|router)\b/i.test(nq) ||
          /\b(this|the|my|that)\s*(file|code|function|component|script|class)\b/i.test(nq)
        );
        if (isFileVerificationQuery) {
          isSystemQuery = false;
          isSearchQuery = false;
        }

        const searchGuard = isSearchQuery
            ? `\n🔍 RESEARCH MODE: The user is asking a factual/research question. Your ONLY allowed tools are web_search and read_url. Do NOT call run_bash, run_python, write_file, edit_file, install_package, create_project, start_app, stop_app, or any sandbox/execution tools. Use web_search first to find sources, then read_url to fetch full content from important URLs (especially PDFs).\n`
            : '';

        // When a file is attached and the user asks to design/style it, auto-load the design skill
        let designSkillGuard = '';
        if (hasAnyFile && /\b(design|style|beautify|make it (look|prett|better|nice)|improve.*(look|ui|design|style|appearance)|redesign|rethink|polish|spruce|refine|restyle|beautiful|modern|sleek|elegant|clean up|touch up|pretty)\b/i.test(nq)) {
            isSystemQuery = false;
            isSearchQuery = false;
            try {
                const designContent = await fetchSkillFile('frontend-design');
                if (designContent) {
                    designSkillGuard = `\n🎨 DESIGN SKILL LOADED — follow these rules when modifying the uploaded file:\n${designContent.slice(0, 7000)}\n\n`;
                }
            } catch (e: any) {
                console.warn('[DESIGN_SKILL] Could not fetch:', e.message);
            }
        }

        const dynSys = [
            SYSTEM_PROMPT
                .replaceAll('{{CURRENT_DATETIME}}', nowStr)
                .replaceAll('{{LOCATION_INFO}}', locInfo)
                .replaceAll('{{MEMORY_CONTEXT}}', memCtx),
            fileGuard,
            designSkillGuard,
            systemGuard,
            searchGuard,
            VISUAL_INSTRUCTIONS,
            isSystemQuery ? '' : AGENT_SYSTEM_EXTENSION,
        ].join('\n\n');

        // ── Abort Controller setup ──────────────────────────────────────
        const abortController = new AbortController();
        req.on('close', () => {
            if (!res.writableEnded) {
                abortController.abort();
            }
        });

        // ── Per-request agent state ──────────────────────────────────────
        const agentState: AgentState = { sources: [], generatedFiles: [], thoughtProcess: [], searchCount: 0, wikiSearchCount: 0 };
        const tools = createFluxTools(res, model, agentState, nq, activeConversationId, uid, abortController.signal);
        if (isSystemQuery) {
            const destructiveTools = ['create_project', 'write_file', 'edit_file', 'run_bash', 'run_python', 'install_package', 'start_app', 'stop_app', 'list_apps', 'get_app_logs', 'get_app_url', 'web_search', 'get_weather', 'wiki_search'];
            for (const name of destructiveTools) {
                delete (tools as any)[name];
            }
        }
        if (isSearchQuery) {
            // Research mode: only search/weather tools allowed (no sandbox/execute tools)
            const allowedResearchTools = new Set(['web_search', 'read_url', 'get_weather']);
            for (const name of Object.keys(tools)) {
                if (!allowedResearchTools.has(name)) {
                    delete (tools as any)[name];
                }
            }
        }

        withToolTimeout(tools, TOOL_TIMEOUTS);

        // ── StreamWriter adapter for orchestrator ──────────────────────────
        const orchStream: StreamWriter = {
            writeStatus: (subtype, message, data) => sendStatus(res, subtype, message, data, agentState.thoughtProcess),
            writeText: (text) => writeSafeSSE(res, text),
            writeFile: (file) => { if (!res.writableEnded) res.write(`event: file\ndata: ${JSON.stringify(file)}\n\n`); },
            writeThought: (content) => {
                const ev = { type: 'thought', content };
                agentState.thoughtProcess.push(ev);
                if (!res.writableEnded) res.write(`event: thought\ndata: ${JSON.stringify(ev)}\n\n`);
            },
            writeTodos: (items) => {
                if (!res.writableEnded) res.write(`event: todos\ndata: ${JSON.stringify({ type: 'todos', items })}\n\n`);
            },
            writePermission: (id, toolName, args, description) => sendPermissionRequest(res, id, toolName, args, description),
            writeToolCall: (toolName, args, status, result) => sendToolCall(res, toolName, args, status, result),
            writeToolGroup: (tools) => sendToolGroup(res, tools),
            writeAgentStatus: (status, message) => sendAgentStatus(res, status, message),
            get writableEnded() { return res.writableEnded; },
        };

        // ── Run orchestrator for complex workflows ─────────────────────────
        const orchestrator = new OrchestratorEngine();
        const orchResult = await orchestrator.process({
            query: nq,
            tools,
            agentState,
            stream: orchStream,
            model,
            skillRegistry: SKILL_REGISTRY,
            fetchSkillFile,
            generateDocumentWithSkill: generateDocumentWithSkill as any,
            fileContent: hasAnyFile ? 'attached' : undefined,
            isComputerMode,
        });

        let fullText = '';
        let sentText = '';             // tracks ONLY cleaned text sent via writeClean (for dedup)
        let charsSent = 0;
        let streamBuf = '';
        let dbBuf = '';
        let hasToolCall = false;
        let toolResultSeen = false;
        const collectedToolResults: Array<{ name: string; args?: any; result: string }> = [];
        const orchestratorHandled = orchResult.executedPlan;

        if (orchestratorHandled) {
            fullText = (orchResult.text ?? '').trim();

            // Stream the answer text to the frontend.
            // Weather: the card is rendered from the status SSE event;
            // the text answer is either a natural summary or empty.
            if (fullText && !res.writableEnded) {
                writeSafeSSE(res, fullText);
                if (typeof (res as any).flush === 'function') (res as any).flush();
            }

            charsSent = fullText.length;
            dbBuf = fullText;
            // hasToolCall and toolResultSeen intentionally NOT set to true here:
            // they are only meaningful in the AI SDK streaming path, and setting
            // them would trigger the `hasToolCall && !closedRef.v` answer-synthesis
            // fallback block (line 2274), which writes extra/surplus text to the client.
        }

        // ── Build user message (with optional image/video attachments) ──
        const imageAttachments = safeAtt.filter(f => f.type?.startsWith('image/'));
        const videoAttachments = safeAtt.filter(f => f.type?.startsWith('video/'));
        const isVisionModel = pref ? VISION_MODELS.has(pref) : false;
        const hasImages = imageAttachments.length > 0 && isVisionModel;

        const videoNotice = videoAttachments.length > 0
            ? `[The user attached ${videoAttachments.length} video(s)]\n\n`
            : '';

        let attachedFilesText = '';
        if (safeFile) {
            attachedFilesText += `[File content]\n${safeFile.slice(0, 200_000)}\n\n`;
        }
        const textAttachments = safeAtt.filter(f => f.content && !f.type?.startsWith('image/') && !f.type?.startsWith('video/'));
        if (textAttachments.length > 0) {
            for (const att of textAttachments) {
                const isPdfAtt = att.name?.toLowerCase().endsWith('.pdf') || att.type?.includes('pdf');
                const isDocxAtt = att.name?.toLowerCase().endsWith('.docx') || att.type?.includes('wordprocessingml');
                let parsedContent = att.content || '';

                if (isPdfAtt || isDocxAtt) {
                    const dataUrlPrefix = parsedContent.startsWith('data:') ? (parsedContent.split(',')[1] || '') : parsedContent;
                    if (!dataUrlPrefix) continue;
                    let rawBuf: Buffer | null = null;
                    try {
                        rawBuf = Buffer.from(dataUrlPrefix, 'base64');
                    } catch { /* ignore */ }

                    if (rawBuf && rawBuf.length > 50) {
                        sendStatus(res, 'parsing', `Parsing ${att.name} (${(rawBuf.length / 1024).toFixed(0)} KB)...`, { name: att.name }, agentState.thoughtProcess);
                        let parseError: string | null = null;
                        if (isPdfAtt) {
                            const pdfResult = await extractPdf(rawBuf);
                            parsedContent = pdfResult.markdown || pdfResult.text || '';
                            if (parsedContent.startsWith('[PDF parsing')) {
                                parseError = parsedContent.replace(/\[PDF parsing (failed|error):\s*/, '').replace(/\]$/, '');
                                parsedContent = `[PDF file: ${att.name}]\nThe automated parser failed to extract text from this PDF (${parseError}). The raw file is at /home/user/uploads/${att.name}. Run Python with PyMuPDF (fitz) to extract its text content, then answer based on that.`;
                            } else if (pdfResult.token_count >= 4000 && uid) {
                                await processLargeDocument(pdfResult, uid, att.name || 'document', 'upload');
                                const preview = (pdfResult.pages?.[0]?.text ?? parsedContent).slice(0, 1500);
                                parsedContent = `[PDF DOCUMENT: ${att.name}]\n${pdfResult.metadata.pages} pages, ${(rawBuf.length / 1024).toFixed(0)} KB.\n\nThe document is large and has been chunked into searchable sections. Use retrieve_doc_chunks(query) to find relevant content.\n\nFirst section preview:\n${preview}`;
                            }
                        } else {
                            parsedContent = await extractDocxText(rawBuf);
                        }
                        if (parseError) {
                            sendStatus(res, 'parsing_error', `${att.name}: ${parseError}`, { name: att.name }, agentState.thoughtProcess);
                        } else {
                            sendStatus(res, 'parsing_done', `Parsed ${att.name} (${(parsedContent.length / 1024).toFixed(0)} KB text)`, { name: att.name }, agentState.thoughtProcess);
                        }
                    }
                }

                attachedFilesText += `[File content: ${att.name}]\n${(parsedContent || '').slice(0, 200_000)}\n\n`;
            }
        }

        const memPrefix = memCtx ? `\n\n[MEMORY: Known facts about this user from past conversations]
${memCtx}
---\n\n` : '';
        const userText = !isVisionModel && imageAttachments.length > 0
            ? `[The user attached ${imageAttachments.length} image(s)]\n\n${videoNotice}${attachedFilesText}${memPrefix}${nq}`
            : `${videoNotice}${attachedFilesText}${memPrefix}${nq}`;

        const userContent: any = hasImages
            ? [
                ...imageAttachments.map(f => ({
                    type: 'image',
                    image: f.content,   // data URL string: 'data:image/png;base64,...'
                    mimeType: f.type,
                })),
                { type: 'text', text: userText },
            ]
            : userText;

        const messages: any[] = [...historyMessages, { role: 'user', content: userContent }];

        // ── Close detection ──────────────────────────────────────────────
        const closedRef = { v: false };
        req.on('close', () => { closedRef.v = true; });
        let hasBackgroundDocGen = false;
        let forceSynthesis = false;
        let partialThought = ''; // Buffer for <THOUGHT> blocks that span multiple text-delta chunks
        let synthesisWritten = false; // Suppress model output after fallback synthesis takes over

        // ── LLM streaming (skipped when orchestrator handled the workflow) ──
        if (!orchestratorHandled) {
            const modelName = route.modelId || pref || 'unknown';
            console.log(`[LLM_STREAM] Starting streamText with model=${modelName} at ${new Date().toISOString()}`);
            const streamStart = Date.now();
            const agentStream = streamText({
                model,
                system: dynSys,
                messages,
                tools,
                stopWhen: stepCountIs(50),
                toolChoice: 'auto',
                temperature: 0.35,
                maxOutputTokens: 8192,
                abortSignal: abortController.signal,
                providerOptions: getProviderOptions(pref),
                onStepFinish: (step: any) => {
                    const hasToolCalls = step.toolCalls?.length > 0;
                    const textLen = step.text?.length ?? 0;
                    const reason = step.finishReason ?? 'unknown';
                    if (hasToolCalls) {
                        step.toolCalls.forEach((tc: any) => {
                            const args = tc.args ?? tc.input ?? '(no args)';
                            console.log(`[STEP] finish=${reason} tools=${step.toolCalls.length} text=${textLen} tool=${tc.toolName}`);
                        });
                    } else {
                        console.log(`[STEP] finish=${reason} tools=0 text=${textLen}`);
                    }
                }
            } as any);

            let seenFollowUpsTag = false;
            let consecutiveBlockedCount = 0;
            let consecutiveSkippedCount = 0;
            const MAX_BLOCKED_CALLS = 1;
            let hasToolCallAfterText = false;
            let repeatBuf = '';
            let dedupSkipLen = 0;
            let preToolBuf = '';
            let preToolHandled = false;
            // synthesisWritten is declared in outer scope

            function drainPreToolBuf(keep: boolean) {
                if (preToolHandled) return;
                preToolHandled = true;
                if (keep && preToolBuf.trim()) {
                    writeSafeSSE(res, preToolBuf);
                    sentText += preToolBuf;
                    charsSent += preToolBuf.length;
                    if (typeof (res as any).flush === 'function') (res as any).flush();
                }
                preToolBuf = '';
            }

            // Writes clean text to SSE, handling multi-step repeat dedup.
            function writeClean(clean: string) {
                if (!clean || synthesisWritten) return;
                if (!preToolHandled) {
                    preToolBuf += clean;
                    if (preToolBuf.length >= 80) drainPreToolBuf(true);
                    return;
                }
                if (hasToolCallAfterText) {
                    repeatBuf += clean;
                    if (repeatBuf.length >= 40) {
                        const prefix = sentText.slice(dedupSkipLen, dedupSkipLen + repeatBuf.length);
                        if (repeatBuf === prefix) {
                            dedupSkipLen += repeatBuf.length;
                            repeatBuf = '';
                            return;
                        }
                        let matchLen = 0;
                        while (matchLen < Math.min(repeatBuf.length, prefix.length) &&
                               repeatBuf[matchLen] === prefix[matchLen]) {
                            matchLen++;
                        }
                        if (matchLen >= 25) {
                            const deduped = repeatBuf.slice(matchLen).trim();
                            dedupSkipLen += matchLen;
                            repeatBuf = '';
                            if (deduped) {
                                writeSafeSSE(res, deduped);
                                sentText += deduped;
                                charsSent += deduped.length;
                                if (typeof (res as any).flush === 'function') (res as any).flush();
                            }
                            return;
                        }
                        writeSafeSSE(res, repeatBuf);
                        sentText += repeatBuf;
                        charsSent += repeatBuf.length;
                        if (typeof (res as any).flush === 'function') (res as any).flush();
                        repeatBuf = '';
                        dedupSkipLen = 0;
                    }
                    return;
                }
                writeSafeSSE(res, clean);
                sentText += clean;
                charsSent += clean.length;
                if (typeof (res as any).flush === 'function') (res as any).flush();
            }

            try {
            for await (const event of agentStream.fullStream) {
                if (res.writableEnded || closedRef.v || forceSynthesis) break;

                if (event.type === 'tool-call') {
                    drainPreToolBuf(false); // discard pre-tool preamble
                    hasToolCall = true;
                    toolResultSeen = true;
                    // If we already streamed text before this tool call, subsequent text-deltas
                    // come from a new step where the model may repeat its earlier answer.
                    // We'll use this flag to detect repeats in the text-delta handler.
                    if (charsSent > 100) hasToolCallAfterText = true;
                }

                if (event.type === 'tool-result') {
                    toolResultSeen = true;
                    try {
                        const ev = event as any;
                        const name = ev.toolName ?? 'tool';
                        const args = ev.args ?? {};
                        const result = ev.output ?? ev.result;
                        let txt = '';
                        if (typeof result === 'string') {
                            txt = result;
                        } else if (result != null) {
                            try {
                                const serialized = JSON.stringify(result);
                                txt = typeof serialized === 'string' ? serialized : String(result);
                            } catch {
                                txt = String(result);
                            }
                        }
                        console.log('[ASK] tool-result captured:', {
                            name,
                            resultLen: txt?.length ?? 0,
                            hasSearchContent: !!agentState.searchContent,
                            searchContentLen: agentState.searchContent?.length ?? 0,
                        });
                        collectedToolResults.push({ name, args, result: String(txt ?? '').slice(0, 50000) });
                        // Track blocked calls — after threshold, force answer synthesis
                        // __SEARCH_SKIPPED__ is NOT a block — it tells the model to answer from knowledge
                        const isHardBlock = txt.includes('__SEARCH_BLOCKED__') || txt.includes('__WIKI_BLOCKED__') || /__[A-Z_]+_BLOCKED__/.test(txt);
                        const isSoftSkip = txt.includes('__SEARCH_SKIPPED__') || /__[A-Z_]+_SKIPPED__/.test(txt);
                        if (isHardBlock) {
                            consecutiveBlockedCount++;
                            console.log(`[STREAM] ${name} blocked (${consecutiveBlockedCount}/${MAX_BLOCKED_CALLS})`);
                            if (consecutiveBlockedCount >= MAX_BLOCKED_CALLS) {
                                console.log(`[STREAM] Too many blocked calls — forcing answer synthesis`);
                                forceSynthesis = true;
                            }
                        } else if (isSoftSkip) {
                            consecutiveSkippedCount++;
                            console.log(`[STREAM] ${name} skipped (${consecutiveSkippedCount}/3) — model should answer from knowledge`);
                            // Force synthesis immediately if we already have search content
                            // — the model already has the info it needs, no reason to keep looping
                            const alreadyHasSearch = agentState.searchContent && agentState.searchContent.length > 200;
                            if (consecutiveSkippedCount >= 2 || (name === 'web_search' && alreadyHasSearch)) {
                                console.log(`[STREAM] Already have search results — forcing answer synthesis`);
                                forceSynthesis = true;
                            }
                        } else {
                            consecutiveBlockedCount = 0;
                            consecutiveSkippedCount = 0;
                            // After 3 successful searches, force synthesis — model should answer, not call more tools
                            if (name === 'web_search' && agentState.searchCount >= 2) {
                                console.log(`[STREAM] 2 searches completed — forcing answer synthesis`);
                                forceSynthesis = true;
                            }
                        }
                    } catch (toolErr) {
                        console.warn('[ASK] tool-result handler error:', (toolErr as any)?.message);
                        if (!res.writableEnded && !forceSynthesis) {
                            res.write(`event: error\ndata: ${JSON.stringify({ message: `Tool error: ${(toolErr as any)?.message || 'Unknown tool error'}` })}\n\n`);
                        }
                    }
                }

                if (event.type === 'text-delta') {
                    const delta = (event as any).textDelta ?? (event as any).text ?? '';
                    const oldLength = fullText.length;
                    fullText += delta;

                    // ── Extract <THOUGHT>/<think> blocks and send as thought SSE events ──
                    // Handles multi-chunk thoughts via partialThought buffer
                    const wasInThought = partialThought.length > 0;
                    const fullForThought = partialThought + delta;
                    partialThought = '';
                    const thoughtRegex = /<(?:THOUGHT|think)>([\s\S]*?)<\/(?:THOUGHT|think)>/gi;
                    let thoughtMatch;
                    let lastIndex = 0;
                    while ((thoughtMatch = thoughtRegex.exec(fullForThought)) !== null) {
                        const thoughtContent = thoughtMatch[1]?.trim();
                        if (thoughtContent && !res.writableEnded) {
                            const thoughtEvent = { type: 'thought', content: thoughtContent };
                            agentState.thoughtProcess.push(thoughtEvent);
                            res.write(`event: thought\ndata: ${JSON.stringify(thoughtEvent)}\n\n`);
                        }
                        lastIndex = thoughtRegex.lastIndex;
                    }
                    // Check for unclosed <THOUGHT> or <think> at the end of this chunk
                    const lastOpenThought = fullForThought.lastIndexOf('<THOUGHT>');
                    const lastOpenThink = fullForThought.lastIndexOf('<think>');
                    const lastCloseThought = fullForThought.lastIndexOf('</THOUGHT>');
                    const lastCloseThink = fullForThought.lastIndexOf('</think>');
                    const openIdx = Math.max(lastOpenThought, lastOpenThink);
                    const closeIdx = Math.max(lastCloseThought, lastCloseThink);
                    if (openIdx > closeIdx) {
                        // Opening tag without closing — buffer the rest
                        partialThought = fullForThought.slice(openIdx);
                    }

                    if (!seenFollowUpsTag) {
                        const lowerFull = fullText.toLowerCase();
                        let followUpsIndex = -1;
                        const fIdx = lowerFull.indexOf("<follow_ups>");
                        const qIdx = lowerFull.indexOf("<question>");
                        if (fIdx !== -1 && qIdx !== -1) {
                            followUpsIndex = Math.min(fIdx, qIdx);
                        } else if (fIdx !== -1) {
                            followUpsIndex = fIdx;
                        } else if (qIdx !== -1) {
                            followUpsIndex = qIdx;
                        }

                        if (followUpsIndex !== -1) {
                            seenFollowUpsTag = true;
                            const charsFromDeltaBeforeTag = followUpsIndex - oldLength;
                            if (charsFromDeltaBeforeTag > 0) {
                                let rawPrefix = delta.slice(0, charsFromDeltaBeforeTag);
                                if (wasInThought) {
                                    const closeIdx = rawPrefix.indexOf('</THOUGHT>');
                                    const closeThinkIdx = rawPrefix.indexOf('</think>');
                                    let cutAt = -1;
                                    if (closeIdx >= 0 && closeThinkIdx >= 0) cutAt = Math.min(closeIdx, closeThinkIdx);
                                    else if (closeIdx >= 0) cutAt = closeIdx;
                                    else if (closeThinkIdx >= 0) cutAt = closeThinkIdx;
                                    if (cutAt >= 0) {
                                        const tagLen = rawPrefix.slice(cutAt).startsWith('</THOUGHT>') ? 10 : 7;
                                        rawPrefix = rawPrefix.slice(cutAt + tagLen);
                                    } else {
                                        rawPrefix = '';
                                    }
                                }
                                const prefix = rawPrefix;
                                    const clean = prefix
                                        .replace(/<\|tool_calls_section_begin\|>[\s\S]*?(?:<\|tool_calls_section_end\|>|$)/gi, '')
                                        .replace(/<\|tool_call_begin\|>[\s\S]*?(?:<\|tool_call_end\|>|$)/gi, '')
                                        .replace(/<(?:THOUGHT|think)>[\s\S]*?<\/(?:THOUGHT|think)>/gi, '')
                                        .replace(/<\/?(?:THOUGHT|think)>/gi, '')
                                        .replace(/<\/?ANSWER>/gi, '')
                                        .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, '')
                                        .replace(/<FOLLOW_UPS>[\s\S]*/gi, '')
                                        .replace(/<\/?FOLLOW_UPS>/gi, '')
                                        .replace(/<\/?question>/gi, '')
                                        .replace(/<\|tool_calls_section_(?:begin|end)\|>/gi, '')
                                        .replace(/<\|tool_call_(?:begin|end)\|>/gi, '')
                                        .replace(/<\/?[A-Za-z][A-Za-z0-9]*$/gm, '');
                                if (clean) {
                                    writeClean(clean);
                                }
                            }
                        } else {
                            // When wasInThought is true, the <THOUGHT> opened in a previous chunk.
                            // Delta may contain thought content before </THOUGHT> — skip it.
                            let sourceForClean = delta;
                            if (wasInThought) {
                                const closeIdx = delta.indexOf('</THOUGHT>');
                                const closeThinkIdx = delta.indexOf('</think>');
                                let cutAt = -1;
                                if (closeIdx >= 0 && closeThinkIdx >= 0) cutAt = Math.min(closeIdx, closeThinkIdx);
                                else if (closeIdx >= 0) cutAt = closeIdx;
                                else if (closeThinkIdx >= 0) cutAt = closeThinkIdx;
                                if (cutAt >= 0) {
                                    const tagLen = delta.slice(cutAt).startsWith('</THOUGHT>') ? 10 : 7;
                                    sourceForClean = delta.slice(cutAt + tagLen);
                                } else {
                                    sourceForClean = '';
                                }
                            }
                            const clean = sourceForClean
                                .replace(/<\|tool_calls_section_begin\|>[\s\S]*?(?:<\|tool_calls_section_end\|>|$)/gi, '')
                                .replace(/<\|tool_call_begin\|>[\s\S]*?(?:<\|tool_call_end\|>|$)/gi, '')
                                .replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, '')
                                .replace(/<\/?THOUGHT>/gi, '')
                                .replace(/<\/?ANSWER>/gi, '')
                                .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, '')
                                .replace(/<FOLLOW_UPS>[\s\S]*/gi, '')
                                .replace(/<\/?FOLLOW_UPS>/gi, '')
                                .replace(/<\/?question>/gi, '')
                                .replace(/<\|tool_calls_section_(?:begin|end)\|>/gi, '')
                                .replace(/<\|tool_call_(?:begin|end)\|>/gi, '')
                                .replace(/<\/?[A-Za-z][A-Za-z0-9]*$/gm, '');
                            if (clean) {
                                writeClean(clean);
                            }
                        }
                    }
                }
            }
            } catch (streamErr: any) {
                console.error('[ASK] Stream error:', streamErr?.message ?? streamErr);
                if (!res.writableEnded) {
                    res.write(`event: error\ndata: ${JSON.stringify({ message: streamErr?.message || 'Stream error' })}\n\n`);
                }
            }

            drainPreToolBuf(true); // flush buffer if no tool call ever arrived

            // ── Mistral-style inline tool call parser ─────────────────────────────
            // Some NIM models (e.g. Mistral) output tool calls as raw text in
            // Mistral format instead of using OpenAI-compatible function calling.
            // The AI SDK doesn't recognize these — they leak into the text stream.
            // We parse and execute them here as a fallback.
            {
                const mistralBlockRe = /<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/gi;
                const toolCallRe = /<\|tool_call_begin\|>\s*functions\.(\w+):\d+\s*<\|tool_call_argument_begin\|>\s*(\{[\s\S]*?\})\s*<\|tool_call_end\|>/gi;
                const safeQuery = query ?? '';
                const blocks: Array<{ raw: string; calls: Array<{ name: string; args: Record<string, any> }> }> = [];
                let bm: RegExpExecArray | null;
                while ((bm = mistralBlockRe.exec(fullText)) !== null) {
                    const calls: Array<{ name: string; args: Record<string, any> }> = [];
                    let cm: RegExpExecArray | null;
                    while ((cm = toolCallRe.exec(bm[0])) !== null) {
                        const toolName = cm[1] ?? '';
                        if (!toolName) continue;
                        let rawArgs: Record<string, any> = {};
                        try { rawArgs = JSON.parse(cm[2]!); } catch { /* skip unparseable */ }
                        const normArgs: Record<string, any> = {};
                        for (const [k, v] of Object.entries(rawArgs)) {
                            const key = k
                                .replace(/^skill_name$/i, 'doc_type')
                                .replace(/^doc_type$/i, 'doc_type')
                                .replace(/^document_type$/i, 'doc_type')
                                .replace(/^file_type$/i, 'doc_type')
                                .replace(/^search_query$/i, 'query')
                                .replace(/^search$/i, 'query')
                                .replace(/^prompt$/i, 'query');
                            normArgs[key] = v;
                        }
                        // Infer doc_type from user query if missing
                        if (toolName === 'read_skill' && !normArgs.doc_type) {
                            const q = safeQuery.toLowerCase();
                            if (q.includes('pdf')) normArgs.doc_type = 'pdf';
                            else if (q.includes('powerpoint') || q.includes('presentation') || q.includes('slide')) normArgs.doc_type = 'pptx';
                            else if (q.includes('word') || q.includes('docx')) normArgs.doc_type = 'docx';
                            else if (q.includes('excel') || q.includes('xlsx') || q.includes('spreadsheet')) normArgs.doc_type = 'xlsx';
                            else if (q.includes('csv')) normArgs.doc_type = 'csv';
                            else if (q.includes('design') || q.includes('style') || q.includes('beautify') || q.includes('ui') || q.includes('make it look')) normArgs.doc_type = 'design';
                            else normArgs.doc_type = 'pdf';
                        }
                        calls.push({ name: toolName, args: normArgs });
                    }
                    if (calls.length > 0) blocks.push({ raw: bm[0], calls });
                }
                // Process collected blocks (iterate in reverse to preserve indices)
                const mistralDocGen: Array<{ docType: string; topic: string }> = [];
                for (let bi = blocks.length - 1; bi >= 0; bi--) {
                    const block = blocks[bi]!;
                    for (const call of block.calls) {
                        const toolDef = (tools as any)[call.name];
                        if (toolDef && typeof toolDef.execute === 'function') {
                            console.log(`[MISTRAL] Executing ${call.name} with`, call.args);
                            try {
                                const result = await toolDef.execute(call.args);
                                const formatted = `\n\n${result}`;
                                fullText = fullText.replace(block.raw, formatted);
                                writeSafeSSE(res, formatted);
                                charsSent += formatted.length;
                                hasToolCall = true;

                                if (call.name === 'read_skill') {
                                    const dt = call.args.doc_type || 'pdf';
                                    const tp = call.args.topic || safeQuery || 'document';
                                    mistralDocGen.push({ docType: dt, topic: tp });
                                }
                            } catch (e: any) {
                                console.warn(`[MISTRAL] ${call.name} failed:`, e?.message);
                                const errMsg = `\n\n[${call.name} failed: ${e?.message ?? 'error'}]`;
                                fullText = fullText.replace(block.raw, errMsg);
                                writeSafeSSE(res, errMsg);
                                charsSent += errMsg.length;
                            }
                        } else {
                            console.warn(`[MISTRAL] Unknown tool: ${call.name}`);
                            fullText = fullText.replace(block.raw, '');
                        }
                        if (typeof (res as any).flush === 'function') (res as any).flush();
                    }
                }
                // Auto-trigger generate_document after read_skill if model didn't
                for (const gen of mistralDocGen) {
                    if (gen.docType === 'design') continue; // design skill is for file editing, not doc generation
                    const genDef = (tools as any)['generate_document'];
                    if (genDef && typeof genDef.execute === 'function') {
                        console.log(`[MISTRAL] Auto-chaining generate_document(${gen.docType}, ${gen.topic})`);
                        try {
                            const result = await genDef.execute({ doc_type: gen.docType, topic: gen.topic });
                            const formatted = `\n\n${result}`;
                            fullText += formatted;
                            writeSafeSSE(res, formatted);
                            charsSent += formatted.length;
                            hasToolCall = true;
                            if (typeof (res as any).flush === 'function') (res as any).flush();
                        } catch (e: any) {
                            console.warn(`[MISTRAL] Auto-chain generate_document failed:`, e?.message);
                        }
                    }
                }
            }

            const streamElapsed = ((Date.now() - streamStart) / 1000).toFixed(1);
            console.log(`[LLM_STREAM] streamText finished — model=${modelName} elapsed=${streamElapsed}s`);

            // ── Markdown bash code block fallback handler ─────────────────────
            // Some NIM models output shell commands as markdown code blocks
            // instead of calling the run_bash function. We detect them here
            // and execute them automatically.
            if (!closedRef.v) {
                const bashRe = /```bash\s*\n([\s\S]*?)```/gi;
                const matches: Array<{ index: number; fullMatch: string; cmd: string }> = [];
                let bm: RegExpExecArray | null;
                while ((bm = bashRe.exec(fullText)) !== null) {
                    let cmd = (bm[1] ?? '').trim();
                    cmd = cmd.replace(/^[$%#]\s*/, '').trim();
                    if (cmd && cmd.length < 2000) {
                        matches.push({ index: bm.index, fullMatch: bm[0], cmd });
                    }
                }
                if (matches.length > 0) {
                    console.log(`[BASH-FALLBACK] Found ${matches.length} bash blocks, executing...`);
                    const cid = activeConversationId || 'default';
                    for (let i = matches.length - 1; i >= 0; i--) {
                        const { index, fullMatch, cmd } = matches[i]!;
                        try {
                            if (!res.writableEnded) {
                                res.write(`event: code_execution\ndata: ${JSON.stringify({ code: cmd, language: 'bash' })}\n\n`);
                            }
                            sendStatus(res, 'sandbox_start', `$ ${cmd.slice(0, 80)}`, { tool: 'bash_fallback', command: cmd }, agentState.thoughtProcess);
                            const result = await codeExecutor.runBash(cid, cmd, (type: string, line: string) => {
                                if (!res.writableEnded) {
                                    res.write(`event: code_output\ndata: ${JSON.stringify({ type, content: line })}\n\n`);
                                }
                            }, abortController.signal);
                            if (!res.writableEnded) {
                                res.write(`event: code_done\ndata: ${JSON.stringify({ exitCode: result.exitCode, duration: result.duration })}\n\n`);
                            }
                            let replacement = `\n\`\`\`\n$ ${cmd}\n`;
                            if (result.stdout.length) replacement += result.stdout.join('\n') + '\n';
                            if (result.stderr.length) replacement += result.stderr.join('\n') + '\n';
                            replacement += `exit code: ${result.exitCode}\n\`\`\`\n`;
                            fullText = fullText.slice(0, index) + replacement + fullText.slice(index + fullMatch.length);
                            writeSafeSSE(res, replacement);
                            charsSent += replacement.length;
                            hasToolCall = true;
                        } catch (e: any) {
                            console.warn(`[BASH-FALLBACK] Failed:`, e?.message);
                            const errMsg = `\n\n[Command failed: ${e?.message ?? 'error'}]\n\n`;
                            fullText = fullText.slice(0, index) + errMsg + fullText.slice(index + fullMatch.length);
                            writeSafeSSE(res, errMsg);
                            charsSent += errMsg.length;
                        }
                        if (typeof (res as any).flush === 'function') (res as any).flush();
                    }
                    sendStatus(res, 'sandbox_success',
                        `Bash fallback finished (${matches.length} commands)`,
                        { tool: 'bash_fallback', count: matches.length },
                        agentState.thoughtProcess);
                }
            }

            // ── Plain-text tool call fallback handler ──────────────────────────
            // Some NIM models output tool calls as raw text like
            //   readfile({ path: "/home/user/file.md" })
            // instead of using the function-calling API.
            if (!closedRef.v) {
                const toolNameMap: Record<string, string> = {
                    read_file: 'read_file', readfile: 'read_file',
                    write_file: 'write_file', writefile: 'write_file',
                    list_files: 'list_files', listfiles: 'list_files',
                    edit_file: 'edit_file', editfile: 'edit_file',
                    get_generated_file: 'get_generated_file', getgeneratedfile: 'get_generated_file', getgenerated: 'get_generated_file',
                    run_bash: 'run_bash', runbash: 'run_bash',
                    run_python: 'run_python', runpython: 'run_python',
                    install_package: 'install_package', installpackage: 'install_package',
                };
                const toolCallRe = /(\w+)\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
                const toolMatches: Array<{ index: number; fullMatch: string; name: string; paramsStr: string }> = [];
                let tcm: RegExpExecArray | null;
                while ((tcm = toolCallRe.exec(fullText)) !== null) {
                    const rawName = tcm[1]!.toLowerCase().trim();
                    const actualName = toolNameMap[rawName];
                    if (actualName && (tools as any)[actualName]?.execute) {
                        toolMatches.push({ index: tcm.index, fullMatch: tcm[0], name: actualName, paramsStr: tcm[2]! });
                    }
                }
                if (toolMatches.length > 0) {
                    console.log(`[TOOL-FALLBACK] Found ${toolMatches.length} plain-text tool calls, executing...`);
                    for (let i = toolMatches.length - 1; i >= 0; i--) {
                        const { index, fullMatch, name, paramsStr } = toolMatches[i]!;
                        try {
                            let params: Record<string, any> = {};
                            try { params = JSON.parse(paramsStr); }
                            catch {
                                const fixed = paramsStr.replace(/'/g, '"').replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
                                try { params = JSON.parse(fixed); }
                                catch {
                                    const kvRe = /["']?(\w+)["']?\s*:\s*["']?([^,"'}]+)["']?/g;
                                    let kv: RegExpExecArray | null;
                                    while ((kv = kvRe.exec(paramsStr)) !== null) {
                                        params[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, '');
                                    }
                                }
                            }
                            const result = await (tools as any)[name].execute(params);
                            const formatted = `\n\n${result}`;
                            fullText = fullText.slice(0, index) + formatted + fullText.slice(index + fullMatch.length);
                            writeSafeSSE(res, formatted);
                            charsSent += formatted.length;
                            hasToolCall = true;
                        } catch (e: any) {
                            console.warn(`[TOOL-FALLBACK] ${name} failed:`, e?.message);
                            const errMsg = `\n\n[${name} failed: ${e?.message ?? 'error'}]`;
                            fullText = fullText.slice(0, index) + errMsg + fullText.slice(index + fullMatch.length);
                            writeSafeSSE(res, errMsg);
                            charsSent += errMsg.length;
                        }
                        if (typeof (res as any).flush === 'function') (res as any).flush();
                    }
                    sendStatus(res, 'sandbox_success',
                        `Tool fallback finished (${toolMatches.length} calls)`,
                        { tool: 'tool_fallback', count: toolMatches.length },
                        agentState.thoughtProcess);
                }
            }

            // ── Auto-document generation (fire-and-forget with 15s timeout) ──
            if (!closedRef.v) {
                const safeQ = (query ?? '').toLowerCase();
                const docIntent = safeQ.includes('pdf') ? 'pdf'
                    : safeQ.includes('pptx') || safeQ.includes('powerpoint') || safeQ.includes('presentation') || safeQ.includes('slide') ? 'pptx'
                        : (safeQ.includes('docx') || safeQ.includes('word')) ? 'docx'
                            : (safeQ.includes('create') || safeQ.includes('generate') || safeQ.includes('make') || safeQ.includes('build') || safeQ.includes('write') || safeQ.includes('produce')) && safeQ.includes('document') ? 'docx'
                                : safeQ.includes('xlsx') || safeQ.includes('excel') || safeQ.includes('spreadsheet') || safeQ.includes('sheet') ? 'xlsx'
                                    : safeQ.includes('csv') ? 'csv'
                                        : null;

                const hasSources = agentState.sources.length > 0;
                const hasFiles = agentState.generatedFiles.length > 0;

                if (docIntent && hasSources && !hasFiles && !res.writableEnded) {
                    hasBackgroundDocGen = true;
                    const bgTopic = extractTopicFromQuery(query ?? '') || 'document';
                    const bgSearchUrls = agentState.sources.map((s: any) => s.url).join('\n');
                    console.log(`[AUTO-DOC] Background generating ${docIntent} for "${bgTopic}" with ${agentState.sources.length} sources`);
                    sendStatus(res, 'generating_file', `Building your ${docIntent.toUpperCase()} on "${bgTopic.slice(0, 30)}"... (background)`, undefined, agentState.thoughtProcess);
                }
            }
        } // end if (!orchestratorHandled)

        // ── Fallback: model called tools but produced little/no visible text ──
        if (hasToolCall && !closedRef.v) {
            const hadSources = agentState.sources.length > 0;
            const hadFiles = agentState.generatedFiles.length > 0;

            // Check if the model only echoed source URLs without real synthesis
            let nonUrlLen = charsSent;
            let containsSources = false;
            if (hadSources && fullText) {
                let stripped = fullText;
                for (const s of agentState.sources) {
                    if (s?.url && stripped.includes(s.url)) {
                        containsSources = true;
                        stripped = stripped.split(s.url).join('');
                    }
                }
                nonUrlLen = stripped.length;
            }
            const isUrlOnly = containsSources && charsSent > 0 && nonUrlLen < 200 && (nonUrlLen / fullText.length < 0.3);
            const hasSubstantialText = !forceSynthesis && !isUrlOnly && charsSent > 400;
            const shouldSynthesize = !hasSubstantialText && (forceSynthesis || !charsSent || (isUrlOnly && charsSent < 300) || (fullText.trim().length < 100 && hadSources)) && hadSources && !res.writableEnded;

            if (shouldSynthesize) {
                console.log(`[ASK] ${charsSent ? 'url-only echo detected' : 'charsSent=0'} with sources — attempting answer synthesis`);
                console.log('[ASK] collectedToolResults length:', collectedToolResults.length);

                const searchResults = collectedToolResults
                    .filter(r => r.name === 'web_search');

                const joinedSearch = searchResults
                    .map(r => r.result)
                    .filter(Boolean)
                    .join('\n\n---\n\n')
                    .trim();

                let synthesized = '';

                // Build context: prefer search result text, fall back to agentState.searchContent, then source URLs
                const searchText = (joinedSearch || agentState.searchContent || '').trim();

                // Build structured file context — metadata + outline + sections instead of raw blob
                const synthTextFiles: Array<{ name: string; content: string }> = [];
                if (safeFile) synthTextFiles.push({ name: 'attached-file', content: safeFile });
                for (const f of safeAtt.filter(f => f.content && !f.type?.startsWith('image/'))) {
                    synthTextFiles.push({ name: f.name, content: f.content ?? '' });
                }
                const fileCtx = synthTextFiles.length > 0
                    ? `\n\n${buildStructuredFileContext(synthTextFiles, nq, 36000, (name, section) => {
                        sendStatus(res, 'sandbox_start', `Reading ${name} — ${section}`,
                            { tool: 'file_analysis', filename: name },
                            agentState.thoughtProcess);
                    })}`
                    : '';
                if (synthTextFiles.length > 0) {
                    sendStatus(res, 'sandbox_success', `File analysis complete (${synthTextFiles.length} file${synthTextFiles.length > 1 ? 's' : ''})`,
                        { tool: 'file_analysis' }, agentState.thoughtProcess);
                }

                const combinedContext = [searchText, fileCtx].filter(Boolean).join('\n\n');

                if (combinedContext.trim()) {
                    try {
                        const synthRes = await generateText({
                            model,
                            system: `You are Flux's synthesis engine. Transform raw context into a precise, high-value answer. Be warm and conversational with a touch of wit — use playful analogies, light sarcasm, and the occasional dad joke when appropriate. Can be real sarcastic sometimes too for better personality. Don't use em dashes 99% of the time.

STEP 1 — DETECT QUERY TYPE and adapt your output:
• FACTUAL/DIRECT (confirmations, quick lookups): One bold direct answer → tight supporting table or 3–5 bullets.
• RESEARCH (comparisons, how-to, multi-source): ## sections, inline citations [Name](url), tables for side-by-side data. Pull every specific fact: names, numbers, dates, codes, prices.
• VERIFICATION (fact-checks, error detection): Open with a verdict — ✓ Correct / ✗ Incorrect / ⚠ Partially correct — then cite evidence line by line.
• FILE ANALYSIS (code, documents, data): Follow the FILE READING PROTOCOL below.

FORMATTING:
- Open with the direct answer — never "Based on the search results" or "According to sources".
- Bold (**) the key fact or verdict on first mention.
- Markdown tables for ANY comparison of 2+ items.
- Cite sources with numbered brackets [1], [2], [3] etc. — NEVER output full URLs or markdown links like [text](url) in the answer body.
- If a detail isn't in the context, say what IS available — never guess.

${fileCtx ? `━━━ FILE READING PROTOCOL ━━━
Files are provided in structured sections: OUTLINE → Header → Query-Relevant Body → Tail.

READ ORDER (follow this strictly):
1. OUTLINE first — understand all functions, classes, routes, and types before reading any section.
2. SECTION 1 (Header/Imports) — establish dependencies, framework, entry points.
3. SECTION 2 (Most relevant) — deepest analysis here; this chunk was scored against the user's query.
4. SECTION 3 (Tail/Exports) — check exports, final logic, return values, cleanup.

ANALYSIS FORMAT per file:
▸ **[filename]** — one-line summary of what this file does
▸ **Structure**: list key symbols with their roles (from OUTLINE)
▸ **Findings**: numbered list of observations, bugs, or answers — always include "line N:" references
▸ **Issues** (if any): each issue on its own line — severity (🔴 critical / 🟡 warning / 🔵 note), location, explanation, suggested fix with a short code snippet
▸ **Action list**: prioritised next steps

CROSS-FILE RULES (when multiple files provided):
- Note where file A calls or imports from file B
- Flag mismatches: a function exported in one file that's missing/misnamed in the importer
- Summarise the interaction between files before individual file breakdowns` : ''}`,
                            messages: [
                                { role: 'user', content: `Context:\n${combinedContext.slice(0, 40000)}\n\nQuestion: ${nq}` },
                            ],
                            maxTokens: 4000,
                        } as any);
                        synthesized = (synthRes?.text ?? '').trim();
                        console.log(`[ASK] synthesis result length: ${synthesized.length}`);
                    } catch (synthErr: any) {
                        console.warn('[ASK] Answer synthesis failed:', synthErr?.message);
                    }
                } else {
                    console.warn('[ASK] No context available for synthesis');
                }

                if (synthesized) {
                    // Strip any <THOUGHT>/<think> tags that the synthesis model might have leaked
                    const cleanSynth = synthesized
                        .replace(/<(?:THOUGHT|think)>[\s\S]*?<\/(?:THOUGHT|think)>/gi, '')
                        .replace(/<\/?(?:THOUGHT|think)>/gi, '')
                        .trim();
                    // If partial text was already streamed (e.g. model started answering before
                    // forceSynthesis kicked in), tell the client to discard it and use the
                    // synthesis as a clean replacement instead of appending to the fragment.
                    if (charsSent > 0) {
                        writeReplaceText(res);
                        console.log(`[ASK] replace_text sent — discarding ${charsSent} partial chars`);
                    }
                    writeSafeSSE(res, cleanSynth);
                    console.log(`[ASK] synthesized answer (${cleanSynth.length} chars) — sent to client`);
                    charsSent += cleanSynth.length;
                    fullText = cleanSynth;
                    synthesisWritten = true;
                } else {
                    // True last resort — only reached if synthesis model itself fails
                    const msg = `I searched but couldn't generate a complete answer. Here are the sources I found — please check the Sources tab for the full content.`;
                    console.log('[ASK] direct-source fallback sent (charsSent=0, sources=' + agentState.sources.length + ')');
                    writeSafeSSE(res, msg);
                    charsSent += msg.length;
                    fullText += msg;
                    synthesisWritten = true;
                }
            }


            if (hadFiles && charsSent < 50 && !res.writableEnded) {
                const msg = 'Your file has been generated — see below for download.';
                writeSafeSSE(res, msg);
                charsSent += msg.length;
                fullText += msg;
            }

            if (!charsSent && !res.writableEnded) {
                const nonSearchResults = collectedToolResults.filter(r => r.name !== 'web_search');
                if (nonSearchResults.length > 0) {
                    const toolResultsText = nonSearchResults.map(r => {
                        let block = `Tool: ${r.name}\nResult: ${r.result}`;
                        if (r.args?.content) {
                            const preview = typeof r.args.content === 'string' ? r.args.content.slice(0, 3000) : JSON.stringify(r.args.content).slice(0, 3000);
                            block += `\nContent:\n${preview}`;
                        }
                        return block;
                    }).join('\n\n');
                    try {
                        const synth = await generateText({
                            model,
                            prompt: `The user asked a coding question. The following tool was executed. Write a thorough explanation of the code: what it does, the algorithm, time/space complexity, edge cases, and how to compile/run it. Do NOT use tags like <ANSWER> or <FOLLOW_UPS>. Just write a natural explanation.\n\n${toolResultsText}`,
                            maxTokens: 1000,
                        } as any);
                        const text = synth.text?.trim() || toolResultsText;
                        writeSafeSSE(res, text);
                        charsSent += text.length;
                        fullText += text;
                    } catch {
                        writeSafeSSE(res, toolResultsText);
                        charsSent += toolResultsText.length;
                        fullText += toolResultsText;
                    }
                } else {
                    const msg = 'Received results. Please try rephrasing your question for a more detailed answer.';
                    console.log('[ASK] last-resort safety net fired');
                    writeSafeSSE(res, msg);
                    fullText += msg;
                }
            }
        }

        // ── Extract follow-up questions from the full text ───────────────
        const followUps: string[] = Array.from(
            fullText.matchAll(/<question>([\s\S]*?)<\/question>/gi),
            m => m[1]!.trim()
        ).filter(Boolean).slice(0, 3);
        const fallbackFups = ['Can you tell me more?', 'What should I know next?', 'Can you elaborate on that?'];
        while (followUps.length < 3) followUps.push(fallbackFups[followUps.length]!);

        // ── Send post-stream events ──────────────────────────────────────
        if (agentState.sources.length && !res.writableEnded) {
            res.write(`event: sources\ndata: ${JSON.stringify(agentState.sources)}\n\n`);
        }
        if (!res.writableEnded) {
            res.write(`event: follow_ups\ndata: ${JSON.stringify(followUps)}\n\n`);
        }

        // ── Send [DONE] immediately — answer stream is complete ─────────
        // The frontend considers the answer finished; background events
        // (file_generated, wiki_update) can still arrive on this SSE connection.
        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
        }

        // ── Clean text for DB ─────────────────────────────────────────
        // Rewrite sandbox:/home/user/... links to proper download URLs
        let cleanText = fullText.replace(
            /sandbox:\/home\/user\/(?:uploads\/|edits\/)?([^\s)\]]+)/gi,
            (_match, filename) => `/api/sandbox/download/${activeConversationId}/${filename}`
        );
        const cleanAnswer = cleanText
            .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, '')
            .replace(/<FOLLOW_UPS>[\s\S]*/gi, '')
            .trim();

        // Schedule connection close: after DB save completes, or 100ms if none needed.
        // Background jobs (auto-doc gen, wiki updates) may still fire events before close.
        const closeConnection = () => {
            if (!res.writableEnded) res.end();
        };

        if (cleanAnswer || agentState.generatedFiles.length) {
            // ── Save to database (fire-and-forget — doesn't block) ────────
            (async () => {
                try {
                    const convExists = await prisma.conversation.findUnique({
                        where: { id: activeConversationId }, select: { id: true },
                    });
                    if (!convExists) { closeConnection(); return; }

                    const created = await prisma.message.create({
                        data: {
                            content: cleanAnswer,
                            role: 'Assistant',
                            conversationId: activeConversationId,
                            sources: agentState.sources.length ? agentState.sources : undefined,
                            thoughtProcess: agentState.thoughtProcess.length
                                ? agentState.thoughtProcess
                                : undefined,
                            followUps,
                            generatedFiles: agentState.generatedFiles.length
                                ? agentState.generatedFiles
                                : undefined,
                        },
                    });
                    const savedMid = created.id.toString();

                    if (!res.writableEnded) {
                        res.write(`event: message_id\ndata: ${JSON.stringify({ id: savedMid })}\n\n`);
                    }

                    broadcastSyncEvent(suid, { type: 'message_created', conversationId: activeConversationId, messageId: savedMid });

                    if (!isFollowUp) autoRenameConversation(activeConversationId, nq).catch(() => { });
                    if (memEnabled && cleanAnswer) {
                        const extractUserMsg = attachedFilesText ? `${attachedFilesText}\n\nUser message: ${nq}` : nq;
                        extractMemories([{ role: 'user', content: extractUserMsg }, { role: 'assistant', content: cleanAnswer }], uid, activeConversationId, model)
                            .then(() => pruneMemories(uid))
                            .catch(e => console.warn('[MEMORY]', e));
                    }

                    if (cleanAnswer && activeConversationId && uid) {
                        wikiManager.updateGraph(uid, cleanAnswer, nq)
                            .then(result => {
                                if (result && !res.writableEnded) {
                                    res.write(`event: wiki_update\ndata: ${JSON.stringify(result)}\n\n`);
                                }
                            })
                            .catch(e => console.warn('[WIKI]', e));
                    }

                    // ── Auto-document generation (fire-and-forget, runs after DB save so files persist) ──
                    if (hasBackgroundDocGen) {
                        const bgSafeQ = (query ?? '').toLowerCase();
                        const bgDocIntent = bgSafeQ.includes('pdf') ? 'pdf'
                            : bgSafeQ.includes('pptx') || bgSafeQ.includes('powerpoint') || bgSafeQ.includes('presentation') || bgSafeQ.includes('slide') ? 'pptx'
                                : (bgSafeQ.includes('docx') || bgSafeQ.includes('word')) ? 'docx'
                                    : (bgSafeQ.includes('create') || bgSafeQ.includes('generate') || bgSafeQ.includes('make') || bgSafeQ.includes('build') || bgSafeQ.includes('write') || bgSafeQ.includes('produce')) && bgSafeQ.includes('document') ? 'docx'
                                        : bgSafeQ.includes('xlsx') || bgSafeQ.includes('excel') || bgSafeQ.includes('spreadsheet') || bgSafeQ.includes('sheet') ? 'xlsx'
                                            : bgSafeQ.includes('csv') ? 'csv'
                                                : null;
                        if (bgDocIntent) {
                            const bgTopic = extractTopicFromQuery(query ?? '') || 'document';
                            const bgSearchUrls = agentState.sources.map((s: any) => s.url).join('\n');
                            (async () => {
                                try {
                                    const skillFile = SKILL_REGISTRY[bgDocIntent]?.fileName;
                                    const skillContent = skillFile ? await fetchSkillFile(skillFile) : '';
                                    if (!skillContent || res.writableEnded) return;

                                    const searchContent = agentState.searchContent || `Search results for reference:\n${bgSearchUrls}`;
                                    const docQuery = `Create a ${bgDocIntent} about: ${bgTopic}`;

                                    const file = await Promise.race([
                                        generateDocumentWithSkill(bgDocIntent as any, docQuery, model, skillContent, searchContent),
                                        new Promise<any>(resolve => setTimeout(() => { console.warn(`[AUTO-DOC] Timed out after 15s for ${bgDocIntent}`); resolve(null); }, 15_000)),
                                    ]);

                                    if (file && !res.writableEnded) {
                                        agentState.generatedFiles.push(file);
                                        res.write(`event: file\ndata: ${JSON.stringify(file)}\n\n`);
                                        sendStatus(res, 'generating_file_success', `${bgDocIntent.toUpperCase()} document generated`, undefined, agentState.thoughtProcess);
                                        const msg = `\n\nI've created a ${bgDocIntent.toUpperCase()} document about "${bgTopic}" based on the search results.`;
                                        writeSafeSSE(res, msg);
                                        charsSent += msg.length;
                                        fullText += msg;
                                        if (typeof (res as any).flush === 'function') (res as any).flush();
                                        // Persist the generated file reference in the DB
                                        prisma.message.update({
                                            where: { id: created.id },
                                            data: { generatedFiles: agentState.generatedFiles },
                                        }).catch(e => console.warn('[AUTO-DOC] DB update failed:', e?.message));
                                    }
                                } catch (e: any) {
                                    console.warn('[AUTO-DOC] Background generation failed:', e?.message);
                                    if (!res.writableEnded) {
                                        sendStatus(res, 'generating_file_error', `${bgDocIntent.toUpperCase()} document generation failed`, undefined, agentState.thoughtProcess);
                                    }
                                }
                            })();
                        }
                    }

                    // Keep connection open for background events (wiki + optional auto-doc gen)
                    const closeDelay = hasBackgroundDocGen ? 16_000 : 2000;
                    setTimeout(closeConnection, closeDelay);
                } catch (dbe: any) {
                    if (dbe?.code !== 'P2025') console.error('DB save error:', dbe?.message ?? dbe);
                    if (hasBackgroundDocGen) {
                        setTimeout(closeConnection, 16_000);
                    } else {
                        closeConnection();
                    }
                }
            })();
        } else {
            // No DB save needed — close after a brief delay for any late file events
            const noSaveDelay = hasBackgroundDocGen ? 16_000 : 100;
            setTimeout(closeConnection, noSaveDelay);
        }

        // Safety timer: force-close after 30s regardless (handles hung background jobs)
        const safetyTimer = setTimeout(closeConnection, 30_000);
        if (typeof safetyTimer === 'object' && 'unref' in safetyTimer) (safetyTimer as any).unref();

        console.log(
            `[ASK] uid=${uid} chars=${charsSent} ` +
            `sources=${agentState.sources.length} files=${agentState.generatedFiles.length}`
        );

        if (activeConversationId && isFollowUp) {
            compactConversation(activeConversationId, model).catch(() => {});
        }

    } catch (err: any) {
        console.error('[ASK] Fatal error:', err?.message ?? err);
        if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || 'Request failed' })}\n\n`);
            res.end();
        }
    }
});

// ─── Standard AI SDK endpoint (assistant-ui compatible) ──────
// This endpoint uses streamText + toDataStreamResponse() so the
// output is in the standard AI SDK data-stream format that
// assistant-ui's Thread component expects natively.
// Uses the same models and tools as /flux_ask but without
// custom SSE events (sendStatus writes are no-op'd).
app.post('/api/chat-sdk', middleware, aiLimiter, async (req: any, res: any) => {
    try {
        const uid = req.appUserId!;
        const { query, model: pref, location } = req.body as { query?: string; model?: string; location?: string; };
        if (!query?.trim()) return res.status(400).json({ error: 'Query is required' });
        const nq = query.trim().slice(0, 10_000);
        const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
        const locInfo = sanitizeLocation(location ?? '');
        const { modelId: routedModel } = routeModel(pref, nq);
        const model = selectModel(routedModel);

        // Noop res so tool execute functions can run without side effects
        const noopRes: any = {
            writableEnded: false,
            write: () => true,
            end: () => { },
            flush: () => { },
            on: () => { },
        };
        const agentState: AgentState = { sources: [], generatedFiles: [], thoughtProcess: [], searchCount: 0, wikiSearchCount: 0 };
        const tools = createFluxTools(noopRes, model, agentState, nq, '');
        withToolTimeout(tools, {
            web_search: 30_000,
            generate_document: 60_000,
            get_weather: 10_000,
            generate_image: 90_000,
            wiki_search: 10_000,
            read_url: 10_000,
            run_bash: 60_000,
            run_python: 60_000,
            shell_execute: 30_000,
            create_project: 30_000,
            start_app: 30_000,
            stop_app: 10_000,
            get_app_logs: 10_000,
            file_read: 10_000,
            file_write: 10_000,
            gmail_search: 30_000,
            gmail_read: 30_000,
            gmail_send: 30_000,
            gmail_list_threads: 30_000,
            calendar_list_events: 30_000,
            calendar_create_event: 30_000,
            drive_search_files: 30_000,
            drive_read_file: 30_000,
            drive_list_folder: 30_000,
        });

        const memEnabled = req.authUser?.user_metadata?.enable_memory ?? true;
        const memCtx = memEnabled
            ? await retrieveMemories(uid, nq).then(buildMemoryContext).catch((e) => {
                console.warn('[MEMORY-SDK] retrieveMemories failed:', (e as any)?.message ?? e);
                return '';
              })
            : '';
        const dynSys = [
            SYSTEM_PROMPT.replaceAll('{{CURRENT_DATETIME}}', nowStr).replaceAll('{{LOCATION_INFO}}', locInfo).replaceAll('{{MEMORY_CONTEXT}}', memCtx),
            AGENT_SYSTEM_EXTENSION,
        ].join('\n\n');

        const memPrefix = memCtx ? `\n\n[MEMORY: Known facts about this user from past conversations]
${memCtx}
---\n\n` : '';
        const messages: any[] = [{ role: 'user', content: `${memPrefix}${nq}` }];

        const result = streamText({
            model,
            system: dynSys,
            messages,
            tools,
            stopWhen: stepCountIs(10),
            toolChoice: 'auto',
            temperature: 0.35,
            maxOutputTokens: 4096,
            providerOptions: getProviderOptions(pref),
        } as any);

        // Stream the standard AI SDK data-stream response
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const response = result.toTextStreamResponse();
        const reader = response.body!.getReader();

        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { if (!res.writableEnded) res.end(); break; }
                    res.write(value);
                }
            } catch (e: any) {
                console.error('[SDK] Stream error:', e?.message);
                if (!res.writableEnded) res.end();
            }
        };
        pump();
    } catch (err: any) {
        console.error('[SDK] Error:', err?.message ?? err);
        if (!res.writableEnded) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err?.message || 'Internal error' }));
        }
    }
});

app.use(createTtsRouter());

app.use(createArticlesRouter());
// Model discovery lives in http/routes/diagnostics.ts

// ── OPENAI-COMPATIBLE CHAT COMPLETIONS (opencode connector) ──
const openAICompatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } },
    keyGenerator: (req: any) => req.headers.authorization || 'anonymous',
});

app.post('/v1/chat/completions', openAICompatLimiter, openAICompatAuth, async (req: any, res: any) => {
    const { model, messages, stream = true, temperature, tools: openAiTools } = req.body;

    let mappedModel: string;
    try {
        mappedModel = mapModelId(model, NIM_MODELS);
    } catch (e: any) {
        return res.status(400).json({ error: { message: e.message, type: 'invalid_request_error' } });
    }

    const completionId = `chatcmpl-${crypto.randomUUID()}`;
    const selectedModel = nim.chatModel(NIM_MODELS[mappedModel]);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const mergedTools = {
            ...(openAiTools ? fromOpenAITools(openAiTools) : {}),
            build_project_with_subagents: (tool as any)({
                description: BUILD_PROJECT_TOOL.function.description,
                inputSchema: z.object({ projectDescription: z.string() }),
                execute: async ({ projectDescription }: { projectDescription: string }) => {
                    const buildId = crypto.randomUUID();
                    const statusMessages: string[] = [];
                    const onStatus = (event: string, data: any) => {
                        const line = `[${data?.subagentId || 'orchestrator'}] ${event}: ${JSON.stringify(data)}`;
                        statusMessages.push(line);
                        if (!res.writableEnded) {
                            res.write(sseLine(toOpenAIChunk({
                                completionId, model: mappedModel,
                                delta: { content: `\n${line}` },
                            })));
                        }
                    };
                    const result = await runMultiAgentBuild({ buildId, projectDescription }, onStatus);
                    return {
                        success: result.success,
                        buildId: result.buildId,
                        summary: result.finalOutput,
                        note: 'Project built in a live sandbox.',
                    };
                },
            }),
        };

        const result = streamText({
            model: selectedModel,
            messages,
            temperature: temperature ?? 0.7,
            tools: Object.keys(mergedTools).length > 0 ? mergedTools : undefined,
            providerOptions: getProviderOptions(mappedModel),
        } as any);

        for await (const part of (result as any).fullStream) {
            if (res.writableEnded) break;
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
            } else if (part.type === 'error') {
                res.write(sseLine({ error: { message: part.error || 'Stream error', type: 'server_error' } }));
            }
        }
        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (e: any) {
        console.error('[v1/chat/completions] error:', e?.message);
        if (res.headersSent) {
            if (!res.writableEnded) {
                res.write(sseLine({ error: { message: e?.message || 'Internal error', type: 'server_error' } }));
                res.end();
            }
        } else {
            res.status(500).json({ error: { message: e?.message || 'Internal error', type: 'server_error' } });
        }
    }
});

// ── MULTI-AGENT BUILD (standalone, independent of opencode) ──
app.post('/api/multiagent-build', middleware, async (req: any, res: any) => {
    const { projectDescription } = req.body;
    if (!projectDescription) return res.status(400).json({ error: 'projectDescription required' });

    const buildId = crypto.randomUUID();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const onStatus = (event: string, data: any) => {
        if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    };

    try {
        const result = await runMultiAgentBuild({ buildId, projectDescription }, onStatus);
        if (!res.writableEnded) {
            res.write(`event: final_result\ndata: ${JSON.stringify(result)}\n\n`);
        }
    } catch (e: any) {
        if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify({ message: e?.message || 'Build failed' })}\n\n`);
        }
    }
    if (!res.writableEnded) res.end();
});

// ── ACP HANDSHAKE / CAPABILITIES ───────────────────────────
app.get("/api/acp/capabilities", (_req, res) => {
    res.json({
        protocolVersion: 1,
        agentInfo: {
            name: "Flux",
            version: "1.0.0",
            description: "Flux AI agent with tool orchestration and team mode",
        },
        capabilities: {
            supportsStreaming: true,
            supportsVision: true,
            supportsThinking: true,
            maxTools: 25,
            maxSteps: 30,
            supportedModes: ["default", "plan", "yolo"],
            availableTools: toolRegistry.getToolList().map((t) => ({
                name: t.name,
                description: t.description,
                category: t.category,
                requiresApproval: t.requiresApproval,
            })),
        },
        configOptions: {
            categories: [
                {
                    name: "mode",
                    options: [
                        { value: "default", label: "Default — ask before tool execution" },
                        { value: "plan", label: "Plan — create execution plan first" },
                        { value: "yolo", label: "YOLO — execute without asking" },
                    ],
                },
            ],
        },
    });
});

// ── CUSTOM AGENTS ───────────────────────────────────────────
interface CustomAgentEntry {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Array<{ name: string; value: string }>;
    icon?: string;
    advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        description?: string;
    };
    createdAt: string;
}

const customAgents: Map<string, CustomAgentEntry> = new Map();

app.get("/api/agents/custom", (_req, res) => {
    res.json({ agents: [...customAgents.values()] });
});

app.post("/api/agents/custom", (req, res) => {
    const { name, command, args, env, icon, advanced } = req.body || {};
    if (!name || !command) return res.status(400).json({ error: "name and command required" });
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: CustomAgentEntry = {
        id, name, command, args: args || [], env, icon, advanced,
        createdAt: new Date().toISOString(),
    };
    customAgents.set(id, entry);
    res.status(201).json({ agent: entry });
});

app.delete("/api/agents/custom/:id", (req, res) => {
    if (!customAgents.delete(req.params.id!)) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
});

// ── SERVER START ─────────────────────────────────────────────
const certPath = path.join(__dirname, '..', 'certs');
let server: http.Server | https.Server;
if (fs.existsSync(path.join(certPath, 'cert.pem')) && fs.existsSync(path.join(certPath, 'key.pem'))) {
  const tlsOpts = {
    cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
    key: fs.readFileSync(path.join(certPath, 'key.pem')),
  };
  server = https.createServer(tlsOpts, app);
  console.log('[TLS] HTTPS enabled');
} else {
  server = http.createServer(app);
  console.log('[TLS] HTTPS disabled — cert.pem/key.pem not found in ../certs');
}

// Seed search cache from recent DB history (non-blocking)
if (!isSmoke) (async () => {
    try {
        const { seedCacheFromHistory } = await import('./search-cache');
        const recentMsgs = await prisma.message.findMany({
            where: { sources: { not: Prisma.DbNull }, role: 'Assistant' },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: { id: true, sources: true, conversationId: true, createdAt: true },
        });
        const entries: { query: string; sources: { url: string; content?: string }[]; content: string }[] = [];
        for (const msg of recentMsgs) {
            const sources = (msg.sources as any[]) || [];
            if (sources.length === 0) continue;
            const prevUser = await prisma.message.findFirst({
                where: { conversationId: msg.conversationId, role: 'User', createdAt: { lt: msg.createdAt } },
                orderBy: { createdAt: 'desc' },
                select: { content: true },
            });
            if (!prevUser) continue;
            const query = prevUser.content.slice(0, 500);
            const srcs = sources.map((s: any) => ({ url: s.url, content: s.content || '' }));
            entries.push({ query, sources: srcs, content: '' });
        }
        seedCacheFromHistory(entries);
    } catch (e) {
        console.warn('[CACHE] Seed from history skipped:', (e as any)?.message ?? e);
    }
})();

// Recover any interrupted long-running tasks from previous server instances
if (!isSmoke) recoverInterruptedTasks().then(count => console.log('[TASK] Recovery pass complete'));

// Attach Agent Protocol WebSocket handler
createAgentWebSocket(server);

const proto = server instanceof https.Server ? "https" : "http";
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => { console.log(`Flux backend running on ${proto}://localhost:${PORT}`); });
