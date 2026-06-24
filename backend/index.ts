// index.ts – Full Pipeline Implementation (Complete & Optimized)
import { tavily } from '@tavily/core';
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { streamText, generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { OrchestratorEngine } from './orchestrator';
import type { StreamWriter } from './orchestrator';
import { SYSTEM_PROMPT } from './prompt';
import { prisma } from "./db";
import { Prisma } from "./prisma/generated/client";
import { middleware } from './middleware';
import { nim } from './nim-client';
import { buildPPTX, buildDOCX, buildPDF, buildXLSX, buildCSV, buildTSV, buildMD, buildJSON, buildSQL, buildHTML } from './agent-tools';
import type { GeneratedFileResult } from './agent-tools';
import { retrieveMemories, extractMemories, buildMemoryContext, pruneMemories } from './memory';
import { toolRegistry } from './tool-registry';
import http from "http";
import https from "https";
import { createAgentWebSocket } from './agent-protocol';
import { codeExecutor } from './tools/codeExecutor';
import { sandboxManager } from './sandbox/sandboxManager';
import { wikiManager } from './wiki/wikiManager';

// ── Lazy pdfjs-dist initializer (disables Web Workers for Bun) ─────────
let pdfjsInit: Promise<void> | null = null;
async function initPdfjs() {
    if (!pdfjsInit) {
        pdfjsInit = (async () => {
            const mod = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
            mod.GlobalWorkerOptions.workerSrc = '';
        })();
    }
    return pdfjsInit;
}

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const app = express();

// ── Global Request Logger ──────────────────────────────────
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'N/A'}`);
    next();
});

// ── Trust proxy for accurate client IP ──
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────
app.use(helmet());

// ── CORS – expanded for local dev stability ─────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: true, // Reflect the request origin
    exposedHeaders: ['X-Conversation-Id'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Conversation-Id', 'x-health-secret'],
    credentials: true,
}));

// ── Body parser with size limit ────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Rate limiters ──────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: "Too many requests" } });
const newConvLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: "Too many new threads" } });

app.use(globalLimiter);

// ─── DIAGNOSTICS & SYSTEM ──────────────────────────────────
app.get("/ping", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/whoami", middleware, (req, res) => {
    console.log(`[WHOAMI] Request from ${req.appUserId}`);
    res.json({
        appUserId: req.appUserId,
        supabaseUserId: req.userId,
        email: req.authUser?.email
    });
});

// ── Skill file registry & generic endpoint ─────────────────────────────────
// Add a filename here to expose a new skill; names not in this map are rejected.
const SKILL_FILES: Record<string, string> = {
    pdf: "pdf-skill.md",
    pptx: "pptx-skill.md",
    docx: "docx-skill.md",
    xlsx: "xlsx-skill.md",
    csv: "csv-skill.md",
    tsv: "tsv-skill.md",
    md: "md-skill.md",
    json: "json-skill.md",
    sql: "sql-skill.md",
    html: "html-skill.md",
    tech: "tech-writer-skill.md",
    finance: "finance-skill.md",
    coder: "coder-skill.md",
    creative: "creative-skill.md",
    legal: "legal-skill.md",
};

app.get('/skills/:name', (req, res) => {
    const safeName = (req.params.name as string).replace(/[^a-z0-9-]/g, '').slice(0, 80);
    if (!safeName) return res.status(400).send('# Invalid\n');
    const p = path.join(__dirname, 'skills', `${safeName}.md`);
    if (!fs.existsSync(p)) return res.status(404).send('# Not found\n');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.sendFile(p);
});

// ── Health check ────────────────────────────────────────────
if (!process.env.HEALTH_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error("FATAL: Missing HEALTH_SECRET environment variable.");
}
const HEALTH_SECRET = process.env.HEALTH_SECRET || 'internal-secret';

app.get("/health", async (req, res) => {
    const provided = req.headers['x-health-secret'];
    if (typeof provided !== 'string') return res.status(404).send('Not Found');

    const pb = Buffer.from(provided);
    const sb = Buffer.from(HEALTH_SECRET);
    if (pb.length !== sb.length || !crypto.timingSafeEqual(pb, sb)) {
        return res.status(404).send('Not Found');
    }
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: "ok", db: "connected" });
    } catch (e) {
        console.error("Health check failed:", e);
        res.status(503).json({ status: "degraded", db: "disconnected" });
    }
});

// ── Tool registry API ──────────────────────────────────────
app.get('/api/tools', (req, res) => {
    res.json({ tools: toolRegistry.getToolList() });
});

// ── Sanitisation helpers ───────────────────────────────────
function sanitizeLocation(input: string): string {
    return input.replace(/[^a-zA-Z0-9\s,.'-]/g, '').slice(0, 100);
}

function sanitizeTitle(title: string): string {
    return title.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// ── Model map ───────────────────────────────────────────────
const NIM_MODELS: Record<string, string> = {
    "llama-4-maverick": "meta/llama-4-maverick-17b-128e-instruct",
    "mistral-large-675b": "mistralai/mistral-large-3-675b-instruct-2512",
    "glm-5.1": "z-ai/glm-5.1",
    "kimi-k2.6": "moonshotai/kimi-k2.6",
    "nemotron-3-ultra-550b": "nvidia/nemotron-3-ultra-550b-a55b",
    "nemotron-3-nano-omni-30b-a3b-reasoning": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "mistral-medium-3.5-128b": "mistralai/mistral-medium-3.5-128b",
    "nemotron-3-super-120b-a12b": "nvidia/nemotron-3-super-120b-a12b",
    "deepseek-v4-flash": "deepseek-ai/deepseek-v4-flash",
    "step-3.7-flash": "stepfun-ai/step-3.7-flash",
    "qwen3.5-397b-a17b": "qwen/qwen3.5-397b-a17b",
    "step-3.5-flash": "stepfun-ai/step-3.5-flash",
    "minimax-m2.7": "minimaxai/minimax-m2.7",
    "minimax-m3": "minimaxai/minimax-m3",
    "deepseek-v4-pro": "deepseek-ai/deepseek-v4-pro",
    "sarvam-m": "sarvamai/sarvam-m",
    "stockmark-2-100b-instruct": "stockmark/stockmark-2-100b-instruct",
    "nemotron-nano-12b-v2-vl": "nvidia/nemotron-nano-12b-v2-vl",
};

// ── Vision-capable models ──────────────────────────────────
const VISION_MODELS = new Set([
    "nemotron-nano-12b-v2-vl",
    "kimi-k2.6",
    "minimax-m3",
    "deepseek-v4-pro",
]);

// ── selectModel returns a proper AI SDK model instance ──
function createFallbackModel(primaryModel: any, preferredModelId: string | undefined, modelsMap: Record<string, string>): any {
    const getFallbackSequence = (prefId?: string) => {
        const list = ["kimi-k2.6"];
        for (const key of Object.keys(modelsMap)) {
            if (key !== prefId && key !== "kimi-k2.6") {
                list.push(key);
            }
        }
        return list;
    };

    return new Proxy(primaryModel, {
        get(target: any, prop: string | symbol, receiver: any) {
            if (prop === 'doGenerate') {
                return async function(options: any) {
                    try {
                        console.log(`[MODEL FALLBACK] Trying primary model: ${preferredModelId || target.modelId}`);
                        return await target.doGenerate(options);
                    } catch (primaryError: any) {
                        console.warn(`[MODEL FALLBACK] Primary model failed:`, primaryError?.message ?? primaryError);
                        const fallbackIds = getFallbackSequence(preferredModelId);
                        for (const fallbackId of fallbackIds) {
                            try {
                                console.log(`[MODEL FALLBACK] Trying fallback model: ${fallbackId}`);
                                const fallbackModel = nim.chatModel(modelsMap[fallbackId]!);
                                const fallbackOptions = { ...options, providerOptions: {} };
                                return await fallbackModel.doGenerate(fallbackOptions);
                            } catch (fallbackError: any) {
                                console.warn(`[MODEL FALLBACK] Fallback model ${fallbackId} failed:`, fallbackError?.message ?? fallbackError);
                            }
                        }
                        throw primaryError;
                    }
                };
            }
            if (prop === 'doStream') {
                return async function(options: any) {
                    try {
                        console.log(`[MODEL FALLBACK] Trying primary model stream: ${preferredModelId || target.modelId}`);
                        return await target.doStream(options);
                    } catch (primaryError: any) {
                        console.warn(`[MODEL FALLBACK] Primary model stream failed:`, primaryError?.message ?? primaryError);
                        const fallbackIds = getFallbackSequence(preferredModelId);
                        for (const fallbackId of fallbackIds) {
                            try {
                                console.log(`[MODEL FALLBACK] Trying fallback model stream: ${fallbackId}`);
                                const fallbackModel = nim.chatModel(modelsMap[fallbackId]!);
                                const fallbackOptions = { ...options, providerOptions: {} };
                                return await fallbackModel.doStream(fallbackOptions);
                            } catch (fallbackError: any) {
                                console.warn(`[MODEL FALLBACK] Fallback model stream ${fallbackId} failed:`, fallbackError?.message ?? fallbackError);
                            }
                        }
                        throw primaryError;
                    }
                };
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

function selectModel(preferredModel: string | undefined): any {
    let primaryModel: any;
    let actualPref;
    if (preferredModel && NIM_MODELS[preferredModel]) {
        primaryModel = nim.chatModel(NIM_MODELS[preferredModel]);
        actualPref = preferredModel;
    } else {
        primaryModel = nim.chatModel('deepseek-ai/deepseek-v4-pro');
        actualPref = 'deepseek-v4-pro';
    }
    return createFallbackModel(primaryModel, actualPref, NIM_MODELS);
}

// ── routeModel — classifies and routes to appropriate model tier
function routeModel(preferredModel: string | undefined, query: string, previousQuery?: string): {
    modelId: string;
    tier: string;
    score: number;
    wasRouted: boolean;
} {
    try {
        const { routeModel: rm } = require('./query-router');
        return rm(preferredModel, query, previousQuery);
    } catch {
        return { modelId: preferredModel || "deepseek-v4-pro", tier: "power", score: 0.5, wasRouted: false };
    }
}

// ── getProviderOptions – used only for thinking stream ──
function getProviderOptions(modelId: string | undefined) {
    if (modelId === "deepseek-r1" || modelId === "deepseek-v4-flash") {
        return { nim: { enable_thinking: true } };
    }
    return {};
}

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

async function autoRenameConversation(
    conversationId: string,
    firstQuery: string,
    docIntent?: string | null
) {
    try {
        const safeQuery = firstQuery.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!safeQuery) return;

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

        if (!clean || clean.length > 80) clean = safeQuery.slice(0, 80);

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
        if (err?.code !== 'P2025' && err?.name !== 'TimeoutError' && err?.name !== 'AbortError') {
            console.warn("Failed to auto-rename conversation:", err?.message ?? err);
        }
    }
}

function getDomain(url: string): string {
    try {
        const { hostname } = new URL(url);
        return hostname.replace(/^www\./, '');
    } catch { return url; }
}

function getUrlTitle(url: string): string {
    try {
        const { pathname, hostname } = new URL(url);
        const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
        // Take the last meaningful path segment (file name or last folder)
        let candidate = segments.pop() || '';
        // Remove file extensions
        candidate = candidate.replace(/\.(html?|php|asp|aspx|jsp|shtml)$/i, '');
        // Decode URL encoding
        candidate = decodeURIComponent(candidate);
        // Replace hyphens/underscores with spaces and capitalize words
        candidate = candidate.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (candidate.length > 4) {
            return candidate.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        // If path gave nothing useful, use hostname
        const host = hostname.replace(/^www\./, '');
        return host.split('.').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } catch { return url; }
}

// ── SSE helper ──────────────────────────────────────────────
function writeSafeSSE(res: any, content: string) {
    if (res.writableEnded) return;
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const escaped = normalized.replace(/\n/g, '\ndata: ');
    res.write(`data: ${escaped}\n\n`);
}

function sendStatus(res: any, subtype: string, message: string, data?: any, track?: any[]) {
    if (res.writableEnded) return;
    const event = { type: "status", subtype, message, data: data || null };
    res.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`);
    if (track) track.push(event);
}

function sendProgress(res: any, subtype: string, progress: number, message: string, data?: any) {
    if (res.writableEnded) return;
    res.write(`event: status\ndata: ${JSON.stringify({ type: "status", subtype, message, data: data || null, progress })}\n\n`);
}

// ── Enhanced SSE events (Flux-style) ─────────────────────

function sendAgentStatus(res: any, status: string, message: string, data?: any) {
    if (res.writableEnded) return;
    res.write(`event: agent_status\ndata: ${JSON.stringify({ type: "agent_status", status, message, data: data || null })}\n\n`);
}

function sendPermissionRequest(res: any, id: string, toolName: string, args: any, description: string) {
    if (res.writableEnded) return;
    res.write(`event: permission\ndata: ${JSON.stringify({ type: "permission", id, toolName, args, description })}\n\n`);
}

function sendToolGroup(res: any, tools: any[]) {
    if (res.writableEnded) return;
    res.write(`event: tool_group\ndata: ${JSON.stringify({ type: "tool_group", tools })}\n\n`);
}

function sendToolCall(res: any, toolName: string, args: any, status: string, result?: any) {
    if (res.writableEnded) return;
    res.write(`event: tool_call\ndata: ${JSON.stringify({ type: "tool_call", toolName, args, status, result })}\n\n`);
}

// ── Permission approval store (in-memory, per-session) ────
interface PendingPermission {
    id: string;
    toolName: string;
    args: any;
    description: string;
    userId: string;
    resolve: (approved: boolean) => void;
    timestamp: number;
}
const pendingPermissions = new Map<string, PendingPermission>();
const PERMISSION_TIMEOUT = 60_000; // 1 minute

// Periodic cleanup of expired permissions
setInterval(() => {
    const now = Date.now();
    for (const [id, perm] of pendingPermissions) {
        if (now - perm.timestamp > PERMISSION_TIMEOUT) {
            perm.resolve(false);
            pendingPermissions.delete(id);
        }
    }
}, 30_000);

// Permission approval endpoint
app.post('/api/permissions/respond', middleware, async (req: any, res: any) => {
    const uid = req.appUserId!;
    const { id, approved } = req.body as { id: string; approved: boolean };
    if (!id) return res.status(400).json({ error: 'Missing permission id' });
    const perm = pendingPermissions.get(id);
    if (!perm) return res.status(404).json({ error: 'Permission request not found or expired' });
    if (perm.userId !== uid) return res.status(403).json({ error: 'Not your permission request' });
    perm.resolve(!!approved);
    pendingPermissions.delete(id);
    res.json({ success: true });
});

function createPermissionRequest(uid: string, toolName: string, args: any, description: string): Promise<boolean> {
    return new Promise((resolve) => {
        const id = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        pendingPermissions.set(id, {
            id, toolName, args, description, userId: uid,
            resolve, timestamp: Date.now(),
        });
        // Auto-approve after timeout if no response (safety valve)
        setTimeout(() => {
            const perm = pendingPermissions.get(id);
            if (perm) {
                perm.resolve(true);
                pendingPermissions.delete(id);
            }
        }, PERMISSION_TIMEOUT);
    });
}

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
All files at /home/user/. write_file and run_bash share the SAME filesystem — no cd needed.

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

  read_file({ path: "/home/user/<filename>" }) — Read file contents.

  edit_file({ path: "...", old_str: "...", new_str: "..." })
    Replace a specific string in a file. ALWAYS read_file first.

  list_files({ path: "/home/user/" }) — List sandbox files.

  install_package({ package: "tensorflow" }) — pip install.

  create_project({ name: "app", files: [{ path: "src/main.js", content: "..." }] })
    Scaffold multi-file project.

  start_app({ name: "web", command: "node server.js", port: 3000 })
  stop_app({ app_id: "..." })
  list_apps({})
  get_app_logs({ app_id: "..." })
  get_app_url({ app_id: "..." })
    Public URL of running app. Call after start_app.

  get_generated_file({ path: "/home/user/chart.png" })
    Download file to user. Images render inline.

REMEMBER: Writing bash commands as text does NOT execute them. Only function calls execute.
</sandbox_environment>

<code_workflow>
══════════════════════════════════════════════════════════════════════════════════
  CODE WORKFLOW — EXACT SEQUENCE (NEVER SKIP, NEVER REORDER)
══════════════════════════════════════════════════════════════════════════════════

When the user asks you to write code (function, algorithm, program, class, script),
you MUST follow this exact cycle. Every step triggers the next. Never stop at step 1.

FILESYSTEM: All files at /home/user/. write_file creates there. run_bash runs from
/home/user/ (sandbox default CWD). They share the SAME filesystem — any file written
by write_file is immediately visible to run_bash. No cd needed.

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
async function geocodeCity(city: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'FluxApp/1.0' } });
        if (!r.ok) return null;
        const d = await r.json() as any[];
        if (!d.length) return null;
        const result = d[0]!;
        return { lat: parseFloat(result.lat), lon: parseFloat(result.lon), displayName: result.display_name?.split(',')[0] ?? city };
    } catch { return null; }
}

function wmoDescription(code: number): string {
    if (code === 0) return 'clear sky';
    if (code <= 3) return 'partly cloudy';
    if (code <= 9) return 'foggy';
    if (code <= 19) return 'drizzle';
    if (code <= 29) return 'rain';
    if (code <= 39) return 'snow';
    if (code <= 49) return 'fog';
    if (code <= 59) return 'drizzle';
    if (code <= 69) return 'rain';
    if (code <= 79) return 'snow';
    if (code <= 84) return 'rain showers';
    if (code <= 94) return 'thunderstorm';
    return 'heavy thunderstorm';
}

interface WeatherResult {
    temperature: number; feelsLike: number; humidity: number;
    windSpeed: number; description: string; resolvedCity: string;
    source: "OpenWeatherMap" | "Open-Meteo";
}

const OW_KEY = process.env.OPENWEATHER_API_KEY;

async function fetchWeatherFromOpenWeatherMap(city: string): Promise<WeatherResult | null> {
    if (!OW_KEY) return null;
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OW_KEY}&units=metric`;
        const r = await fetch(url);
        if (!r.ok) { console.warn(`[WEATHER] OpenWeatherMap error ${r.status} for: ${city}`); return null; }
        const d = await r.json() as any;
        if (!d?.main?.temp) return null;
        return {
            temperature: Math.round(d.main.temp * 10) / 10,
            feelsLike: Math.round(d.main.feels_like * 10) / 10,
            humidity: d.main.humidity ?? 0,
            windSpeed: Math.round((d.wind?.speed ?? 0) * 3.6 * 10) / 10,
            description: d.weather?.[0]?.description ?? 'unknown',
            resolvedCity: d.name + (d.sys?.country ? `, ${d.sys.country}` : ''),
            source: "OpenWeatherMap",
        };
    } catch (e) { console.error('[WEATHER] OpenWeatherMap fetch error:', e); return null; }
}

async function fetchWeatherFromOpenMeteo(city: string): Promise<WeatherResult | null> {
    try {
        const geo = await geocodeCity(city);
        if (!geo) { console.warn(`[WEATHER] Geocode failed for: ${city}`); return null; }
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
            `&current=temperature_2m,apparent_temperature,relativehumidity_2m,windspeed_10m,weathercode&timezone=auto`;
        const r = await fetch(url);
        if (!r.ok) { console.warn(`[WEATHER] Open-Meteo error ${r.status}`); return null; }
        const d = await r.json() as any;
        const c = d.current;
        if (c?.temperature_2m === undefined) return null;
        return {
            temperature: Math.round(c.temperature_2m * 10) / 10,
            feelsLike: Math.round(c.apparent_temperature * 10) / 10,
            humidity: c.relativehumidity_2m ?? 0,
            windSpeed: Math.round(c.windspeed_10m * 10) / 10,
            description: wmoDescription(c.weathercode ?? 0),
            resolvedCity: geo.displayName,
            source: "Open-Meteo",
        };
    } catch (e) { console.error('[WEATHER] Open-Meteo fetch error:', e); return null; }
}

async function fetchWeatherFromAPI(city: string): Promise<WeatherResult | null> {
    const owm = await fetchWeatherFromOpenWeatherMap(city);
    if (owm) return owm;
    console.info('[WEATHER] Falling back to Open-Meteo for:', city);
    return fetchWeatherFromOpenMeteo(city);
}

function extractCityFromQuery(query: string): string | null {
    const q = query.slice(0, 200);
    const T = "temp[a-z]{1,5}tur[ae]?";
    const W = `(?:weather|${T}|forecast|rain|sunny|cloudy|wind(?:y)?)`;
    const WF = `(?:weather|${T}|forecast)`;
    const patterns = [
        new RegExp(`${W}\\s+(?:in|for|at|of)\\s+((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))`, 'i'),
        new RegExp(`current\\s+(?:weather|${T})\\s+(?:in|for|at)?\\s*((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))`, 'i'),
        new RegExp(`(?:in|at|for)\\s+((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))\\s+${WF}`, 'i'),
        new RegExp(`${WF}\\s+((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))`, 'i'),
        new RegExp(`((?:[A-Za-z]+(?:\\s+[A-Za-z]+){0,2}))\\s+${WF}`, 'i'),
    ];
    const stopWords = /^(the|current|today|now|outside|here|local|right|what|is|how)$/i;
    for (const p of patterns) {
        const m = q.match(p);
        if (m?.[1]) {
            const city = m[1].trim();
            const firstWord = city.split(' ')[0] || "";
            if (firstWord && !stopWords.test(firstWord)) return city;
        }
    }
    return null;
}

function deriveSearchQuery(query: string): string {
    return query
        .replace(/^(?:what(?:'s| is| are| was| were)|how (?:do|does|did|can|to|about)|why (?:is|does|are|did)|when (?:is|was|did|will)|where (?:is|are|can|do)|who (?:is|are|was|were)|can you|please|tell me(?: about)?|explain|i want to know|i need to know|i'm looking for|give me|show me|find me|do you know)\s+/i, '')
        .replace(/\?+$/, '')
        .trim()
        .slice(0, 200) || query.slice(0, 200);
}

const wrapUser = (label: string, content: string) =>
    `[USER_INPUT - ${label}]\n${content}\n[/USER_INPUT]`;

// ─── Document intent detection ──────────────────────────────────────────────
type DocType = 'pptx' | 'docx' | 'pdf' | 'xlsx' | 'csv' | 'tsv' | 'md' | 'json' | 'sql' | 'html' | 'tech' | 'finance' | 'coder' | 'creative' | 'legal' | null;

function detectDocumentIntent(query: string): DocType {
    const q = query.toLowerCase();
    if (/\b(pptx?|powerpoint|presentation|slide\s*deck|slides)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'pptx';
    if (/\b(docx?|word\s+doc(?:ument)?|word\s+file)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'docx';
    if (/\bpdf\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'pdf';
    if (/\b(xlsx?|excel|spreadsheet|sheet)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'xlsx';
    if (/\b(csv|comma\s+separated)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'csv';
    if (/\b(tsv|tab\s+separated)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'tsv';
    if (/\b(json|data\s+file)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'json';
    if (/\b(sql|database\s+script|migration)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'sql';
    if (/\b(html|website|web\s+page|ui\s+mockup)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'html';
    if (/\b(markdown|md)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'md';
    if (/\ba\s+(docx?|word\s+doc(?:ument)?)\b/i.test(q)) return 'docx';
    if (/\ba\s+pptx?\b/i.test(q)) return 'pptx';
    if (/\ba\s+pdf\b/i.test(q)) return 'pdf';
    if (/\ba\s+(xlsx?|excel|spreadsheet)\b/i.test(q)) return 'xlsx';
    return null;
}

function extractTopicFromQuery(query: string): string {
    const q = query.trim();
    // For long multi-sentence prompts, extract the actual topic
    if (q.length > 150 || q.includes('\n')) {
        // Try topic after "about/on/for/covering/titled/called"
        const tm = q.match(/(?:about|on|for|of|covering|titled|called)\s+["""]?([^""".\n]{5,120}?)["""]?(?:\s*[.\n]|$)/i);
        if (tm) return tm[1]!.trim().slice(0, 100);
        // Try task description after "Task:"
        const taskM = q.match(/Task:\s*(.+?)(?:\.\s|$)/i);
        if (taskM) return taskM[1]!.trim().slice(0, 100);
        // First sentence
        const firstSent = q.split(/[.\n]/)[0]?.trim();
        if (firstSent && firstSent.length < 120) return firstSent;
    }
    // Standard cleanup for shorter queries
    return q
        .replace(/\b(generate|create|make|build|write|give|produce|prepare)\s*(me\s+)?(a\s+|an\s+)?/gi, '')
        .replace(/\b(docx?|pdf|pptx?|powerpoint|word\s+doc(?:ument)?|presentation|slide\s*deck|slides?|file|document|report|xlsx?|excel|spreadsheet|csv|tsv|markdown|md)\b/gi, '')
        .replace(/\b(about|with\s+topic|with\s+the\s+topic\s+of|on\s+the\s+topic\s+of|on|regarding|for|covering|with)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100)
        || 'document';
}

// ─── Robust JSON parser (handles LLM truncation / trailing commas) ────────

/** Stateful pass: replace literal control characters that appear INSIDE JSON
 *  string literals with proper escape sequences. Structural whitespace between
 *  tokens is left untouched. Must run after invalid-escape sanitisation so the
 *  escape-pair walker sees a clean backslash state. */
function fixControlChars(s: string): string {
    const out: string[] = [];
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i]!;
        if (inStr) {
            if (c === '\\') { out.push(c); if (i + 1 < s.length) out.push(s[++i]!); }
            else if (c === '"') { inStr = false; out.push(c); }
            else if (c === '\n') { out.push('\\n'); }
            else if (c === '\r') { out.push('\\r'); }
            else if (c === '\t') { out.push('\\t'); }
            else if (c < ' ') { /* drop other ASCII control chars */ }
            else { out.push(c); }
        } else {
            if (c === '"') inStr = true;
            out.push(c);
        }
    }
    return out.join('');
}

/**
 * Stateful pass: escape bare double-quote characters that appear INSIDE JSON
 * string values (e.g. LaTeX labels like "AABB", code like player.state = "jumping").
 *
 * A `"` inside a string is treated as a closing delimiter only when it is
 * immediately followed (ignoring inline spaces/tabs) by a JSON structural
 * character: , } ] : or end-of-input or a newline (since multi-line JSON uses
 * real newlines between tokens, not inside values).
 *
 * Must run BEFORE fixControlChars so that fixControlChars sees correct inStr
 * state and doesn't misidentify LaTeX braces as JSON structure.
 */
function fixUnescapedQuotes(s: string): string {
    const out: string[] = [];
    let inStr = false;

    for (let i = 0; i < s.length; i++) {
        const c = s[i]!;

        // Always forward escape pairs intact (handles \", \\, \n, \uXXXX, etc.)
        if (c === '\\' && inStr) {
            out.push(c);
            if (i + 1 < s.length) out.push(s[++i]!);
            continue;
        }

        if (c === '"') {
            if (!inStr) {
                // Opening a new string
                inStr = true;
                out.push(c);
                continue;
            }

            // Inside a string: is this `"` a real closing delimiter or an
            // embedded bare quote?  Look ahead past inline horizontal space.
            let j = i + 1;
            while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++;
            const next = j < s.length ? s[j] : '';

            // Treat as closing if followed by a structural token or line-end
            const isClosing = next === '' || next === ',' || next === '}'
                || next === ']' || next === ':' || next === '\n'
                || next === '\r';

            if (isClosing) {
                inStr = false;
                out.push(c);
            } else {
                // Embedded bare quote — escape it so downstream parsers don't
                // flip their inStr state incorrectly
                out.push('\\', '"');
            }
            continue;
        }

        out.push(c);
    }
    return out.join('');
}

/**
 * Best-effort JSON parser that survives every common way LLMs mangle output:
 *  ① markdown fences  ② leading/trailing prose  ③ invalid escapes (\-, \(…)
 *  ④ bare " inside string values (LaTeX labels, quoted code strings)
 *  ⑤ literal newlines inside strings  ⑥ trailing commas  ⑦ truncation /
 *    missing closing braces  ⑧ unterminated string at end of output
 */
function robustParseJSON(raw: string): any {
    if (!raw?.trim()) throw new Error('robustParseJSON: empty input');

    // 1. Strip markdown code fences (handles ```json, ```JSON, plain ```)
    let s = raw.trim()
        .replace(/^`{3,}(?:json|JSON)?\s*/m, '')
        .replace(/\s*`{3,}\s*$/m, '');

    // 2. Strip accidental doubled opening brace
    while (s.startsWith('{{')) s = s.slice(1);

    // 3. Seek the first JSON container character ({ or [).
    //    The model sometimes prepends a sentence before the JSON.
    const braceIdx = s.indexOf('{');
    const bracketIdx = s.indexOf('[');
    if (braceIdx === -1 && bracketIdx === -1)
        throw new Error('robustParseJSON: no JSON structure found in response');
    const startIdx = braceIdx === -1 ? bracketIdx
        : bracketIdx === -1 ? braceIdx
            : Math.min(braceIdx, bracketIdx);
    s = s.slice(startIdx);

    // 4. Fix invalid escape sequences (\- \( \) \. etc. — not legal in JSON)
    s = s.replace(/\\([^"\\\/bfnrtu])/g, (_, c: string) => c);

    // 4.5. Escape bare double-quotes inside string values BEFORE fixControlChars
    //      so that the control-char walker's inStr state is never thrown off by
    //      unescaped " from LaTeX labels ("AABB") or code ("jumping").
    s = fixUnescapedQuotes(s);

    // 5. Fix literal control chars inside strings (raw 0x0A → \n, etc.)
    s = fixControlChars(s);

    // 6. Happy path
    try { return JSON.parse(s); } catch { /* fall through */ }

    // 7. Find the longest structurally-complete prefix by tracking brace depth
    {
        const depth: ('brace' | 'bracket')[] = [];
        let inStr = false, esc = false, lastGoodPos = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (esc) { esc = false; continue; }
            if (c === '\\' && inStr) { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{') depth.push('brace');
            else if (c === '[') depth.push('bracket');
            else if (c === '}') { if (depth.at(-1) === 'brace') depth.pop(); }
            else if (c === ']') { if (depth.at(-1) === 'bracket') depth.pop(); }
            if (depth.length === 0) lastGoodPos = i + 1;
        }
        if (lastGoodPos > 0)
            try { return JSON.parse(s.slice(0, lastGoodPos)); } catch { /* continue */ }
    }

    // 8. Aggressive repair: strip trailing incomplete fragments
    let repaired = s
        .replace(/,?\s*"[^"]*"\s*:\s*"[^"]*$/s, '')  // truncated string value
        .replace(/,?\s*"[^"]*"\s*:\s*\[[^\]]*$/s, '')  // truncated array value
        .replace(/,?\s*"[^"]*"\s*:\s*\{[^}]*$/s, '')  // truncated object value
        .replace(/,?\s*"[^"]*"\s*:\s*[^,\]{}"]*$/s, '') // truncated scalar
        .replace(/,?\s*"[^"]*"\s*:\s*$/s, '')  // key with no value
        .replace(/,?\s*"[^"]*"\s*$/s, '')  // dangling key
        .replace(/,\s*$/s, ''); // trailing comma

    // Close any unterminated string (odd number of unescaped quotes)
    const unescapedQuotes = repaired.match(/(?<!\\)"/g)?.length ?? 0;
    if (unescapedQuotes % 2 !== 0) repaired += '"';

    // Close all open braces/brackets
    const rDepth: ('brace' | 'bracket')[] = [];
    {
        let inStr2 = false, esc2 = false;
        for (let i = 0; i < repaired.length; i++) {
            const c = repaired[i];
            if (esc2) { esc2 = false; continue; }
            if (c === '\\' && inStr2) { esc2 = true; continue; }
            if (c === '"') { inStr2 = !inStr2; continue; }
            if (inStr2) continue;
            if (c === '{') rDepth.push('brace');
            else if (c === '[') rDepth.push('bracket');
            else if (c === '}') { if (rDepth.at(-1) === 'brace') rDepth.pop(); }
            else if (c === ']') { if (rDepth.at(-1) === 'bracket') rDepth.pop(); }
        }
    }
    const suffix = rDepth.reduceRight((acc, t) => acc + (t === 'brace' ? '}' : ']'), '');

    try { return JSON.parse(repaired + suffix); } catch (e) {
        throw new Error(
            `robustParseJSON: all repair strategies exhausted. ` +
            `Last attempt (truncated): "${(repaired + suffix).slice(0, 300)}"`
        );
    }
}

// ─── Document generation ──────────────────────────────────────────────────

// ── SKILL REGISTRY ─────────────────────────────────────────────────────────
// Add entries here as you add skill files to the skills/ folder.
const SKILL_REGISTRY: Record<string, { fileName: string; label: string }> = {
    pdf: { fileName: 'pdf-skill', label: 'PDF generation' },
    pptx: { fileName: 'pptx-skill', label: 'PowerPoint generation' },
    docx: { fileName: 'docx-skill', label: 'Word document generation' },
    xlsx: { fileName: 'xlsx-skill', label: 'Excel spreadsheet generation' },
    csv: { fileName: 'csv-skill', label: 'CSV export generation' },
    tsv: { fileName: 'tsv-skill', label: 'TSV export generation' },
    md: { fileName: 'md-skill', label: 'Markdown document generation' },
    json: { fileName: 'json-skill', label: 'JSON data generation' },
    sql: { fileName: 'sql-skill', label: 'SQL script generation' },
    html: { fileName: 'html-skill', label: 'HTML mockup generation' },
    tech: { fileName: 'tech-writer-skill', label: 'Technical documentation' },
    finance: { fileName: 'finance-skill', label: 'Financial analysis' },
    coder: { fileName: 'coder-skill', label: 'Software engineering' },
    creative: { fileName: 'creative-skill', label: 'Creative copywriting' },
    legal: { fileName: 'legal-skill', label: 'Legal drafting' },
};

async function fetchSkillFile(skillName: string): Promise<string> {
    try {
        const port = process.env.PORT || '3001';
        const proto = fs.existsSync(path.join(__dirname, '..', 'certs', 'cert.pem')) ? 'https' : 'http';
        const r = await fetch(`${proto}://localhost:${port}/skills/${skillName}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        console.log(`[SKILL] "${skillName}" loaded — ${text.length} chars`);
        return text;
    } catch (e) {
        console.warn(`[SKILL] Could not load "${skillName}":`, e);
        return '';
    }
}

/** Exact JSON schema shown to the model for each doc type */
const DOC_SCHEMA: Record<Exclude<DocType, null>, string> = {
    pptx: `{"title":"Presentation Title","slides":[{"title":"Slide Title","content":"Slide body text"},{"title":"Slide 2","content":"More content"}]}`,
    docx: `{"title":"Document Title","sections":[{"heading":"Introduction","body":"Section content"},{"heading":"Section 2","body":"More content"}]}`,
    pdf: `{"title":"Document Title","template":"corporate","pages":[{"text":"# Section\n\nContent here.\n\n## Subsection\n\nMore content."},{"text":"# Next Section\n\nFurther detail."}]}`,
    xlsx: `{"title":"Spreadsheet Title","rows":[["Header 1","Header 2","Header 3"],["Row 1 A","Row 1 B","Row 1 C"],["Row 2 A","Row 2 B","Row 2 C"]]}`,
    csv: `{"title":"CSV Title","rows":[["Header 1","Header 2"],["Row 1 A","Row 1 B"],["Row 2 A","Row 2 B"]]}`,
    tsv: `{"title":"TSV Title","rows":[["Header 1","Header 2"],["Row 1 A","Row 1 B"],["Row 2 A","Row 2 B"]]}`,
    md: `{"title":"Document Title","content":"# Document Title\\n\\n## Section 1\\n\\nContent paragraph.\\n\\n## Section 2\\n\\nMore content."}`,
    json: `{"title":"Data Filename","content":"{\\n  \\"key\\": \\"value\\",\\n  \\"nested\\": {\\n    \\"id\\": 1\\n  }\\n}"}`,
    sql: `{"title":"Database Script","content":"-- Schema Setup\\nCREATE TABLE users (\\n  id SERIAL PRIMARY KEY,\\n  email TEXT UNIQUE\\n);"}`,
    html: `{"title":"Web Page","content":"<!DOCTYPE html>\\n<html>\\n<head>\\n<title>Page Title</title>\\n</head>\\n<body>\\n<h1>Hello World</h1>\\n</body>\\n</html>"}`,
    tech: `{"title":"Technical Document","content":"# Technical Overview\\n\\n## Architecture\\nDetailed description...\\n\\n## API Reference\\nParameters and endpoints..."}`,
    finance: `{"title":"Financial Report","content":"# Quarterly Analysis\\n\\n## Performance Metrics\\nRevenue and growth data...\\n\\n## Risk Assessment\\nMarket variables..."}`,
    coder: `{"title":"System Design","content":"# Implementation Plan\\n\\n## Module Structure\\nComponent definitions...\\n\\n## Migration Strategy\\nData handling..."}`,
    creative: `{"title":"Brand Strategy","content":"# Creative Direction\\n\\n## Narrative Framework\\nStory arcs and tone...\\n\\n## Visual Identity\\nStyle and aesthetics..."}`,
    legal: `{"title":"Legal Agreement","content":"# Service Terms\\n\\n## Clauses\\nDefinitions and obligations...\\n\\n## Disclaimers\\nLiability and compliance..."}`,
};

/** Guaranteed-valid fallback data — used when the LLM response is unparseable */
function makeFallbackData(docType: Exclude<DocType, null>, topic: string): any {
    switch (docType) {
        case 'pptx': return {
            title: topic, slides: [
                { title: 'Introduction', content: `An overview of ${topic}.` },
                { title: 'Key Points', content: `Important aspects of ${topic}.` },
                { title: 'Details', content: `Further details about ${topic}.` },
                { title: 'Summary', content: `Key takeaways about ${topic}.` },
            ]
        };
        case 'docx': return {
            title: topic, sections: [
                { heading: 'Introduction', body: `This document provides an overview of ${topic}.` },
                { heading: 'Background', body: `Background information on ${topic}.` },
                { heading: 'Details', body: `Detailed information about ${topic}.` },
                { heading: 'Conclusion', body: `Summary and conclusions about ${topic}.` },
            ]
        };
        case 'pdf': return {
            title: topic, template: 'corporate', pages: [
                { text: `# ${topic}\n\nThis document was generated by Flux AI.` },
            ]
        };
        case 'xlsx':
        case 'csv':
        case 'tsv': return {
            title: topic, rows: [
                ['Topic', 'Details', 'Notes'],
                [topic, 'Generated by Flux AI', '—'],
            ]
        };
        default: return { title: topic, content: `Content about ${topic} generated by Flux AI.` };
    }
}

/**
 * Walk through `raw` collecting every structurally-complete JSON object that
 * lives at depth 1 inside the array identified by `arrayKey`.
 * Returns an empty array (never throws) so callers can decide what to do with
 * the results.
 */
function extractCompleteItems(raw: string, arrayKey: string): any[] {
    const keyIdx = raw.indexOf(`"${arrayKey}"`);
    if (keyIdx === -1) return [];
    const arrStart = raw.indexOf('[', keyIdx);
    if (arrStart === -1) return [];

    const results: any[] = [];
    let depth = 0;
    let inStr = false, esc = false;
    let objStart = -1;

    for (let i = arrStart + 1; i < raw.length; i++) {
        const c = raw[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;

        if (c === '{') {
            if (depth === 0) objStart = i;
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0 && objStart !== -1) {
                const fragment = raw.slice(objStart, i + 1);
                try {
                    // Try the full repair pipeline on each individual object
                    results.push(robustParseJSON(fragment));
                } catch { /* incomplete fragment — discard */ }
                objStart = -1;
            }
        } else if (c === ']' && depth === 0) {
            break; // Reached end of the array
        }
    }
    return results;
}

/**
 * Best-effort partial-content extractor.  Called only when robustParseJSON
 * gives up entirely.  Returns whatever complete items were generated before
 * the truncation point, or null if nothing useful could be salvaged.
 *
 * Callers should merge the result with makeFallbackData so required fields
 * (title, arrays) are never absent.
 */
function tryExtractPartialContent(
    raw: string,
    docType: Exclude<DocType, null>,
    topic: string,
): any | null {
    try {
        // Extract the title (almost always appears first and is short enough to survive truncation)
        const titleM = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        let title = topic;
        if (titleM) {
            try { title = JSON.parse(`"${titleM[1]}"`); } catch { /* keep topic */ }
        }

        switch (docType) {
            case 'pptx': {
                const items = extractCompleteItems(raw, 'slides');
                const slides = items
                    .map(o => (typeof o?.title === 'string' && typeof o?.content === 'string'
                        ? { title: o.title, content: o.content } : null))
                    .filter(Boolean) as { title: string; content: string }[];
                return slides.length ? { title, slides } : null;
            }
            case 'docx': {
                const items = extractCompleteItems(raw, 'sections');
                const sections = items
                    .map(o => (typeof o?.heading === 'string' && typeof o?.body === 'string'
                        ? { heading: o.heading, body: o.body } : null))
                    .filter(Boolean) as { heading: string; body: string }[];
                return sections.length ? { title, sections } : null;
            }
            case 'pdf': {
                const items = extractCompleteItems(raw, 'pages');
                const pages = items
                    .map(o => (typeof o?.text === 'string' ? { text: o.text } : null))
                    .filter(Boolean) as { text: string }[];
                return pages.length ? { title, pages } : null;
            }
            case 'xlsx':
            case 'csv':
            case 'tsv': {
                // rows is an array of arrays — try extracting the outer array
                const rowsKeyIdx = raw.indexOf('"rows"');
                if (rowsKeyIdx === -1) return null;
                const arrStart = raw.indexOf('[', rowsKeyIdx);
                if (arrStart === -1) return null;
                // Find complete inner arrays by depth tracking
                const rows: any[][] = [];
                let depth = 0, inStr2 = false, esc2 = false;
                let rowStart = -1;
                for (let i = arrStart + 1; i < raw.length; i++) {
                    const c = raw[i];
                    if (esc2) { esc2 = false; continue; }
                    if (c === '\\' && inStr2) { esc2 = true; continue; }
                    if (c === '"') { inStr2 = !inStr2; continue; }
                    if (inStr2) continue;
                    if (c === '[') { if (depth === 0) rowStart = i; depth++; }
                    else if (c === ']') {
                        depth--;
                        if (depth === 0 && rowStart !== -1) {
                            try { rows.push(JSON.parse(raw.slice(rowStart, i + 1))); } catch { /* skip */ }
                            rowStart = -1;
                        } else if (depth < 0) break;
                    }
                }
                return rows.length >= 2 ? { title, rows } : null;
            }
            case 'md':
            case 'json':
            case 'sql':
            case 'html': {
                // Grab whatever has been generated of the content field, even if truncated
                const contentM = raw.match(/"content"\s*:\s*"([\s\S]*)/);
                if (!contentM) return null;
                // Unescape known sequences from the partial string
                let partial = contentM[1]!
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\r/g, '\r')
                    .replace(/\\\\/g, '\\');
                // Strip trailing incomplete escape or orphaned quote
                partial = partial.replace(/\\$/, '').replace(/"$/, '').trimEnd();
                return partial.length > 10 ? { title, content: partial } : null;
            }
            default:
                return null;
        }
    } catch {
        return null;
    }
}

/** Dispatch parsed (or fallback) data to the appropriate builder */
async function buildDocFromData(
    docType: Exclude<DocType, null>,
    data: any,
): Promise<GeneratedFileResult | null> {
    try {
        switch (docType) {
            case 'pptx': return await buildPPTX(data);
            case 'docx': return await buildDOCX(data);
            case 'pdf': {
                // Forward template; validate it's a known value
                const VALID_TEMPLATES = ['corporate', 'minimal', 'creative', 'report'];
                const template = VALID_TEMPLATES.includes(data.template) ? data.template : 'corporate';
                console.log(`[PDF] Using template: ${template}`);
                return await buildPDF({ title: data.title, pages: data.pages, template });
            }
            case 'xlsx': return await buildXLSX(data);
            case 'csv': return await buildCSV(data);
            case 'tsv': return await buildTSV(data);
            case 'md': return await buildMD(data);
            case 'json': return await buildJSON(data);
            case 'sql': return await buildSQL(data);
            case 'html': return await buildHTML(data);
            default: return null;
        }
    } catch (e) {
        console.error('buildDocFromData: builder threw:', e);
        return null;
    }
}

async function generateDocument(
    docType: Exclude<DocType, null>,
    query: string,
    model: any,
    res?: any,
    statusMsgs?: ContextualStatusMessages,
    searchContent: string = ""
): Promise<GeneratedFileResult | null> {
    const topic = extractTopicFromQuery(query);
    if (!topic) return null;

    const schema = DOC_SCHEMA[docType];

    // Fetch the skill file for this doc type if one exists in the registry.
    // This gives the LLM full format awareness (templates, layout rules, content rules).
    let skillContext = "";
    if (docType && docType in SKILL_REGISTRY) {
        if (res && statusMsgs?.readingSkill) {
            sendStatus(res, "reading_skill", statusMsgs.readingSkill);
        }
        const skillMd = await fetchSkillFile(SKILL_REGISTRY[docType]!.fileName);
        if (skillMd) {
            skillContext = `\n\n=== ${docType.toUpperCase()} GENERATION SKILL FILE ===\n${skillMd}\n=== END SKILL FILE ===\n\nRead the skill file above carefully. Follow all instructions, templates, and content rules exactly.\n\n`;
        }
    }

    const searchContext = searchContent
        ? `\n\n=== REFERENCE SEARCH RESULTS ===\n${searchContent}\n=== END REFERENCE SEARCH RESULTS ===\n\nUse the search results content above to write detailed, substantive information in the document.`
        : "";

    const SYSTEM = [
        "You are a JSON document generator.",
        "Output ONLY a valid JSON object — no markdown fences, no prose, no explanations.",
        "The response must start with { and end with }.",
        skillContext ? "You have been provided a skill file with full instructions. Follow them exactly." : "",
    ].filter(Boolean).join(" ");

    const QUOTE_RULE = `CRITICAL — string escaping rules (violations will break the parser):
- Use \\n (backslash + n) for line breaks inside strings, never a literal newline character.
- Escape every double-quote character that appears INSIDE a string value as \\". This applies to: LaTeX labels like \\"Axis Aligned Bounding Box\\", quoted code like player.state = \\"jumping\\", inline quotations, and any \\"word\\" wrapped in double quotes within text.
- Escape every backslash as \\\\ (two backslashes). LaTeX commands like \\\\frac, \\\\sqrt, \\\\le must be written with double backslashes.
- Do NOT use Markdown formatting (no **bold**, no # headings, no bullet - or * prefixes) inside string values — write plain text only.`;

    const makeUserPrompt = (isRetry: boolean) => isRetry
        ? `Your previous response did not contain a valid JSON object. You MUST output ONLY a JSON object — no other text whatsoever.

Generate a ${docType.toUpperCase()} document about "${topic}" using exactly this structure:
${schema}

${QUOTE_RULE}

Start your entire response with { and end with }.`
        : `${skillContext}${searchContext}Generate a comprehensive, detailed ${docType.toUpperCase()} document about: "${topic}"

Use exactly this JSON structure:
${schema}

Rules:
- Include substantive, professional content directly relevant to the topic.
${QUOTE_RULE}
- Output ONLY the JSON object. Your response must start with { and end with }.`;

    let text = '';

    // ── Attempt 1 ────────────────────────────────────────────────────────
    try {
        ({ text } = await generateText({
            model,
            system: SYSTEM,
            messages: [{ role: 'user', content: makeUserPrompt(false) }],
            maxTokens: 8000,   // raised from 4000 — long physics/technical docs need headroom
        } as any));
    } catch (e) {
        console.error('generateDocument: LLM call failed (attempt 1):', e);
        return buildDocFromData(docType, makeFallbackData(docType, topic));
    }

    // ── Retry if the response contains no JSON at all ────────────────────
    if (!text.includes('{')) {
        console.warn('generateDocument: no JSON in response, retrying with correction prompt…');
        try {
            ({ text } = await generateText({
                model,
                system: SYSTEM,
                messages: [
                    { role: 'user', content: makeUserPrompt(false) },
                    { role: 'assistant', content: text },
                    { role: 'user', content: makeUserPrompt(true) },
                ],
                maxTokens: 8000,
            } as any));
        } catch (e) {
            console.error('generateDocument: LLM call failed (retry):', e);
            return buildDocFromData(docType, makeFallbackData(docType, topic));
        }
    }

    // ── Parse (with full repair pipeline) ────────────────────────────────
    let data: any;
    try {
        data = robustParseJSON(text);
    } catch (e) {
        console.warn('generateDocument: robustParseJSON exhausted, trying partial-content extraction…', e);
        // Smart fallback: rescue whatever complete items the LLM generated before truncation
        data = tryExtractPartialContent(text, docType, topic) ?? makeFallbackData(docType, topic);
        if (data !== makeFallbackData(docType, topic)) {
            console.info('generateDocument: partial content salvaged successfully');
        }
    }

    // Patch missing title and required content arrays
    if (!data.title) data.title = topic;
    const fb = makeFallbackData(docType, topic);
    switch (docType) {
        case 'pptx': if (!Array.isArray(data.slides) || !data.slides.length) data.slides = fb.slides; break;
        case 'docx': if (!Array.isArray(data.sections) || !data.sections.length) data.sections = fb.sections; break;
        case 'pdf': if (!Array.isArray(data.pages) || !data.pages.length) data.pages = fb.pages; break;
        case 'xlsx':
        case 'csv':
        case 'tsv': if (!Array.isArray(data.rows) || data.rows.length < 2) data.rows = fb.rows; break;
        case 'md':
        case 'json':
        case 'sql':
        case 'html': if (!data.content) data.content = fb.content; break;
    }

    return buildDocFromData(docType, data);
}

/**
 * Like generateDocument() but accepts skill content that was already
 * fetched in the agentic tool-execution phase.
 * If skillContent is empty, falls back to fetching it internally.
 */
async function generateDocumentWithSkill(
    docType: Exclude<DocType, null>,
    query: string,
    model: any,
    preloadedSkillContent: string = "",
    searchContent: string = ""
): Promise<GeneratedFileResult | null> {
    const topic = extractTopicFromQuery(query);
    if (!topic) return null;

    const schema = DOC_SCHEMA[docType];
    const skillContext = preloadedSkillContent
        ? `\n\n=== ${docType.toUpperCase()} GENERATION SKILL FILE ===\n${preloadedSkillContent}\n=== END SKILL FILE ===\n\nFollow all instructions in the skill file exactly.\n\n`
        : "";
    const searchContext = searchContent
        ? `\n\n=== REFERENCE SEARCH RESULTS ===\n${searchContent}\n=== END REFERENCE SEARCH RESULTS ===\n\nUse the search results content above to write detailed, substantive information in the document.`
        : "";

    const SYSTEM = [
        "You are a JSON document generator.",
        "Output ONLY a valid JSON object — no markdown fences, no prose, no explanations.",
        "The response must start with { and end with }.",
        skillContext ? "A skill file with full generation instructions is provided. Follow them exactly." : "",
    ].filter(Boolean).join(" ");

    const QUOTE_RULE = `CRITICAL — string escaping rules:
- Use \\n for line breaks inside strings, never a literal newline.
- Escape every double-quote inside a string value as \\".
- Escape every backslash as \\\\.
- No Markdown formatting inside string values.`;

    const makePrompt = (isRetry: boolean) => isRetry
        ? `Your previous response had no valid JSON. Output ONLY a JSON object for a ${docType.toUpperCase()} about "${topic}":\n${schema}\n${QUOTE_RULE}\nStart with { and end with }.`
        : `${skillContext}${searchContext}Generate a comprehensive ${docType.toUpperCase()} document about: "${topic}"\n\nUse exactly this JSON structure:\n${schema}\n\nRules:\n- Include substantive, professional content.\n${QUOTE_RULE}\n- Output ONLY the JSON object. Start with { end with }.`;

    let text = '';
    try {
        ({ text } = await generateText({
            model,
            system: SYSTEM,
            messages: [{ role: 'user', content: makePrompt(false) }],
            maxTokens: 8000,
        } as any));
    } catch (e) {
        console.error('generateDocumentWithSkill: LLM call failed:', e);
        return buildDocFromData(docType, makeFallbackData(docType, topic));
    }

    if (!text.includes('{')) {
        try {
            ({ text } = await generateText({
                model, system: SYSTEM,
                messages: [
                    { role: 'user', content: makePrompt(false) },
                    { role: 'assistant', content: text },
                    { role: 'user', content: makePrompt(true) },
                ],
                maxTokens: 8000,
            } as any));
        } catch (e) {
            return buildDocFromData(docType, makeFallbackData(docType, topic));
        }
    }

    let data: any;
    try {
        data = robustParseJSON(text);
    } catch {
        data = tryExtractPartialContent(text, docType, topic) ?? makeFallbackData(docType, topic);
    }

    if (!data.title) data.title = topic;
    const fb = makeFallbackData(docType, topic);
    return buildDocFromData(docType, data);
}

// ── PER-REQUEST AGENT STATE ────────────────────────────────────────────────
interface AgentState {
    sources: { url: string; index: number }[];
    generatedFiles: any[];
    thoughtProcess: any[];
    searchContent?: string;
    searchCount: number;
    wikiSearchCount: number;
}

function isGenericQuery(q: string): boolean {
    const clean = q.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const genericPatterns = [
        /^tell me more( about (it|this|that))?$/i,
        /^can you tell me more( about (it|this|that))?$/i,
        /^could you tell me more( about (it|this|that))?$/i,
        /^elaborate( further| more)?$/i,
        /^can you elaborate( further| more)?$/i,
        /^please elaborate( further| more)?$/i,
        /^explain( further| more)?$/i,
        /^give me more details$/i,
        /^more details$/i,
        /^what else$/i,
        /^continue$/i,
        /^go on$/i,
        /^what do you mean$/i,
        /^(why|how|what|more|tell)$/i,
        /^can you tell( (me|us))? (in detail|more)/i,
        /^(tell|explain|elaborate|expand) (me|us)? (more|further|in detail)/i,
        /^what about (it|this|that|the)/i,
        /^i'd like to know (more|further)/i,
    ];
    return genericPatterns.some(pat => pat.test(clean));
}

/** Returns true if the user's message is a generic follow-up that
 *  doesn't contain the topic itself. In this case we trust the model's
 *  own generated query rather than requiring token overlap. */
function isFollowUpQuery(q: string): boolean {
    const clean = q.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    return [
        /^can you tell( (me|us))? in detail/i,
        /^can you tell( (me|us))? more/i,
        /^can you (explain|elaborate|expand)( (further|more))?/i,
        /^(tell|explain|elaborate|expand) (me|us)? (more|further|in detail)/i,
        /^what about (it|this|that|the)/i,
        /^tell (me|us) (more|about)/i,
        /^i'd like to know (more|further)/i,
    ].some(p => p.test(clean));
}

// ── Query relevance guard ──────────────────────────────────────────
// Prevents the model from searching for topics completely unrelated
// to what the user actually asked (hallucination guard).
const STOPWORDS = new Set([
    'the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could',
    'should','may','might','can','shall','to','of','in','for',
    'on','with','at','by','from','as','into','through','during',
    'before','after','above','below','between','out','off','over',
    'under','again','further','then','once','here','there','when',
    'where','why','how','all','each','every','both','few','more',
    'most','other','some','such','no','nor','not','only','own',
    'same','so','than','too','very','just','because','about',
    'what','which','who','whom','this','that','these','those',
    'it','its','it\'s','and','but','or','if','while','up','down',
    'get','got','does','doesn\'t','don\'t','won\'t','can\'t',
]);

function extractTokens(s: string): string[] {
    return s.toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function isQueryRelevant(userQuery: string, modelQuery: string): boolean {
    const uTokens = extractTokens(userQuery);
    const mTokens = extractTokens(modelQuery);
    // If model query has no meaningful tokens (all stopwords/short words), it's junk — reject
    if (mTokens.length === 0) return false;
    // If user query has no meaningful tokens, can't judge — let it through
    if (uTokens.length === 0) return true;
    // Check if any meaningful token from the user query appears in the model query
    const hasOverlap = mTokens.some((t: string) => uTokens.includes(t));
    // Also check bigram overlap for phrases
    if (!hasOverlap) {
        for (let i = 0; i < uTokens.length - 1; i++) {
            const bigram = `${uTokens[i]} ${uTokens[i + 1]}`;
            if (modelQuery.toLowerCase().includes(bigram)) return true;
        }
    }
    return hasOverlap;
}

// ── TOOL FACTORY ───────────────────────────────────────────────────────────
// Creates all 5 tools scoped to the current request (has access to res + state).
function createFluxTools(res: any, model: any, state: AgentState, userQuery?: string, activeConversationId?: string, uid?: string, abortSignal?: AbortSignal) {
    return {

        // ── web_search ────────────────────────────────────────────────────
        web_search: (tool as any)({
            description:
                'Search the web to retrieve LIVE, CURRENT data (recent news, events, facts). ' +
                'Your training data is from 2024-2025 — this tool returns FRESH results from the present day. ' +
                'CRITICAL: After this tool returns, IGNORE what your training data says and answer ONLY from these results. ' +
                'Always include the current year/month in your query. ' +
                'Do NOT use for general knowledge, logic, math, or basic greetings. ' +
                'Call this tool SILENTLY — no preamble. Never say "The user is asking me to" or "Let me search". Just call the tool directly. ' +
                'The query MUST be directly related to the user\'s topic. ' +
                'CRITICAL: Search EXACTLY ONCE per user question. After results come back, answer immediately. Do NOT call web_search a second time. ' +
                'If you call web_search a second time it will be BLOCKED and your entire response will be discarded.',
            inputSchema: z.object({
                query: z.string().describe(
                    'A precise, targeted search query (5 to 7 words max). ' +
                    'Extract ONLY the core NOUNS from the user\'s request. ' +
                    'NEVER include verification words (true, false, claim, verify, confirm, fact, real, actually, legit). ' +
                    'Example: user asks "Is it true Meta is cancelling AI projects?" → search "Meta cancelling AI projects 2026" (omit "is it true"). ' +
                    'Example: "Hey can you find out about 2nd year courses at RBU Nagpur Btech CSE 2026" → "RBU Nagpur Btech CSE 2nd year courses 2026". ' +
                    'The query MUST contain only the topic\'s key nouns — the words that would appear on a real results page about this topic. ' +
                    'If you search for an unrelated topic, the query will be silently dropped. ' +
                    'REQUIRED — always provide a specific query, 5-7 words only.'
                ),
                queries: z.array(z.string()).describe(
                    'Alternative to query: multiple search queries to run in parallel (each 5-7 words max). ' +
                    'Same rules as query — only key nouns, no verification words. ' +
                    'Use ONLY when you need results from multiple angles; otherwise use query.'
                ).optional(),
            }),
                execute: async ({ query, queries: queriesArr }: any) => {
                // ── Re-search guard: max 1 auto + 1 re-search before blocking ──
                if (state.searchCount >= 2) {
                    console.warn(`[TOOL] web_search blocked (already searched ${state.searchCount}x)`);
                    const blockedMsg = `__SEARCH_BLOCKED__ SEARCH LIMIT REACHED. You already performed ${state.searchCount} search(es). Do NOT call any more tools. Answer the user IMMEDIATELY using the search results already in context. If you call web_search again, your response will be discarded.`;
                    return blockedMsg;
                }

                // ── Skip search if query doesn't ask for factual information ──
                if (typeof userQuery === 'string') {
                    const uq = userQuery.trim().toLowerCase();
                    const words = uq.split(/\s+/).filter(Boolean);
                    const isShort = words.length < 5;
                    const hasQuestionWord = /\b(what|who|why|how|when|where)\b/.test(uq);
                    const hasSearchWord = /\b(find|search|look\s*up|tell me about|latest|news|explain|define|compare|vs\b|versus|tutorial|guide|review|price|cost|specs|status|how to|verify|check|confirm|validate|prove|disprove|debunk|fact.?check|legitimate|authentic|true|false|claim|rumor)\b/.test(uq);
                    const isMetaChat = /\b(who are you|what can you|are you .{0,20}?|do you .{0,20}?)\b/.test(uq);
                    const isPersonal = /\b(i|my|me|we)\b/.test(uq) && !hasQuestionWord && !hasSearchWord;
                    const isSystemQuery = /\b(architecture|design|codebase|how.*(work|built|implement|structur)|your (code|design|architecture|system)|this (system|code|function|class|file|router))\b/i.test(uq);
                    const hasEntity = /\b(university|college|institute|school|company|course|syllabus|program|department|faculty|professor|exam|admission|fee|placement)\b/i.test(uq);

                    if (isSystemQuery || (!hasQuestionWord && !hasSearchWord && !hasEntity && (isShort || isMetaChat || isPersonal))) {
                        console.log(`[TOOL] web_search skipped — not a factual query`);
                        return `__SEARCH_SKIPPED__ Answer naturally without searching.`;
                    }
                }

                // ── Build query list ─────────────────────────────────────────
                // Collect model-generated queries FIRST — these get priority.
                // Only auto-include user's full query as a LAST RESORT if model
                // didn't generate any valid queries.
                const queriesToRun: string[] = [];

                const modelQueries: string[] = [];
                if (Array.isArray(queriesArr) && queriesArr.length > 0) {
                    modelQueries.push(...queriesArr.filter((q: any) => typeof q === 'string').map((q: string) => q.trim()).filter(Boolean));
                } else if (typeof query === 'string' && query.trim()) {
                    modelQueries.push(query.trim());
                }

                for (const mq of modelQueries) {
                    if (userQuery && mq.toLowerCase() === userQuery?.toLowerCase()) {
                        if (state.searchCount === 0) queriesToRun.push(mq);
                        continue;
                    }
                    if (userQuery && !isFollowUpQuery(userQuery) && !isQueryRelevant(userQuery, mq)) {
                        console.warn(`[TOOL] web_search dropped hallucinated query — model query "${mq}" has no relation to user query "${userQuery}"`);
                        continue;
                    }
                    queriesToRun.push(mq);
                }

                // Fallback: only add user's raw query if model generated nothing
                if (queriesToRun.length === 0 && state.searchCount === 0 && typeof userQuery === 'string' && userQuery.trim()) {
                    queriesToRun.push(userQuery.trim());
                }

                // Enforce max query length: first 7 meaningful words
                const FILLER = /^(hey|hi|hello|can|could|would|will|shall|do|does|did|find|get|tell|show|give|need|want|know|about|for|the|a|an|is|are|was|were|please|regarding|looking|some|information|details|tell\s+me)\s+/i;
                const MAX_QUERY_WORDS = 7;
                const MIN_QUERY_WORDS = 3;
                const TAVILY_MAX_QUERY = 395;
                let safeQueries = queriesToRun.slice(0, 3).map(q => {
                    // Strip leading filler words iteratively
                    let stripped = q.trim();
                    while (FILLER.test(stripped)) {
                        stripped = stripped.replace(FILLER, '').trim();
                    }
                    const words = stripped.split(/\s+/).filter(Boolean);
                    if (words.length < MIN_QUERY_WORDS) {
                        // Filtered too aggressively — use original query minimally cleaned
                        const raw = q.replace(FILLER, '').trim();
                        const rawWords = raw.split(/\s+/).filter(Boolean);
                        const rawTrunc = rawWords.length > MAX_QUERY_WORDS
                            ? rawWords.slice(0, MAX_QUERY_WORDS).join(' ')
                            : rawWords.join(' ');
                        return rawTrunc.length > TAVILY_MAX_QUERY
                            ? rawTrunc.slice(0, TAVILY_MAX_QUERY)
                            : rawTrunc;
                    }
                    const truncated = words.length > MAX_QUERY_WORDS
                        ? words.slice(0, MAX_QUERY_WORDS).join(' ')
                        : words.join(' ');
                    return truncated.length > TAVILY_MAX_QUERY
                        ? truncated.slice(0, TAVILY_MAX_QUERY)
                        : truncated;
                });
                // Deduplicate and remove empty/stopword-only queries
                safeQueries = [...new Set(safeQueries.filter((q: string) => {
                    if (q.trim().length === 0) return false;
                    // Must have at least one meaningful (non-stopword, >=3 chars) token
                    const meaningful = q.toLowerCase().split(/\s+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
                    return meaningful.length > 0;
                }))];

                // No valid queries after filtering
                if (safeQueries.length === 0) {
                    const msg = state.searchContent
                        ? `__SEARCH_SKIPPED__ Your search query was unrelated to the user's question. You already have search results below — answer using those instead of searching again.`
                        : 'No search query was provided. Answer from training knowledge instead.';
                    console.warn('[TOOL] web_search — no valid query:', msg);
                    sendStatus(res, 'error', 'Search skipped: no valid query.', undefined, state.thoughtProcess);
                    return msg;
                }

                const nonGeneric = safeQueries.filter(q => !isGenericQuery(q));
                if (nonGeneric.length === 0) {
                    const genQ = safeQueries.find(q => isGenericQuery(q));
                    console.warn('[TOOL] web_search — all queries are generic/filler, skipping:', genQ);
                    sendStatus(res, 'error', 'Search skipped: generic request.', undefined, state.thoughtProcess);
                    return `Search skipped: The query is generic ('${genQ}'). Do NOT search the web for generic phrases or requests to elaborate (e.g. 'tell me more'). Instead, answer by elaborating on the information already present in the conversation history, or ask the user to specify what they want to search for.`;
                }
                safeQueries.length = 0;
                safeQueries.push(...nonGeneric);

                // Validation passed — this counts as a real search
                state.searchCount++;

                sendStatus(res, 'searching',
                    `Searching for: ${safeQueries.map(q => `"${q}"`).join(', ')}...`,
                    { query: safeQueries[0] || userQuery || '' },
                    state.thoughtProcess);

                // ── Check search cache ────────────────────────────────────────
                const { getCached, setCache } = await import('./search-cache');
                const cacheKey = (safeQueries[0] || userQuery || '');
                const cached = getCached(cacheKey);
                if (cached) {
                    console.log(`[TOOL] Using cached search results (${cached.sources.length} sources)`);
                    const idxOffset = state.sources.length;
                    const withIndex = cached.sources.map((s, i) => ({ url: s.url, index: idxOffset + i + 1 }));
                    state.sources.push(...withIndex);
                    // Emit found_sources and reading status so the frontend shows each search cycle's steps
                    const cachedUrls = cached.sources.map((s: any) => s.url);
                    const cachedTitles = cached.sources.map((s: any) => s.title || getUrlTitle(s.url));
                    sendStatus(res, 'found_sources',
                        `Found ${cached.sources.length} source${cached.sources.length > 1 ? 's' : ''}`,
                        { sources: cachedUrls, titles: cachedTitles, query: safeQueries[0] || userQuery || '' },
                        state.thoughtProcess);
                    sendStatus(res, 'reading', `Reading ${Math.min(cachedTitles.length, 7)} sources...`,
                        { titles: cachedTitles.slice(0, 7), urls: cachedUrls.slice(0, 7) },
                        state.thoughtProcess);
                    const hedgeInstr = `Above are ALL search results accumulated across your searches. When answering, match your confidence to the evidence: if numbers appear in only one source, present them as estimates rather than facts. Use hedging language ("appears to", "suggests", "reportedly", "according to") — especially for claims that rely on secondary reporting. Never state an unsupported claim as settled fact. Answer now. Do NOT search again.`;
                    if (cached.content) {
                        state.searchContent = (state.searchContent || "") + "\n\n" + cached.content;
                        return `[ACCUMULATED SEARCH RESULTS — ALL SEARCHES COMBINED]\n${state.searchContent}\n\n---\nINSTRUCTION: ${hedgeInstr}`;
                    }
                    const cacheText = cached.sources.map((s, i) =>
                        `[${i + 1}] ${s.url}\n${(s.content || '').slice(0, 3000)}`
                    ).join('\n\n');
                    state.searchContent = (state.searchContent || "") + "\n\n[Search Results (cached)]\n\n" + cacheText;
                    return `[ACCUMULATED SEARCH RESULTS — ALL SEARCHES COMBINED]\n${state.searchContent}\n\n---\nINSTRUCTION: ${hedgeInstr}`;
                }

                try {
                    const searchPromises = safeQueries.map(q => 
                        (client as any).search(q, {
                            search_depth: 'basic',
                            max_results: 6,
                        }).catch((err: any) => {
                            console.error(`[TOOL] Tavily search failed for "${q}":`, err);
                            return null;
                        })
                    );
                    const searchOutputs = await Promise.all(searchPromises);

                    const allResults: any[] = [];
                    const seenUrls = new Set<string>();
                    for (const out of searchOutputs) {
                        if (out && Array.isArray(out.results)) {
                            for (const r of out.results) {
                                if (r.url && !seenUrls.has(r.url)) {
                                    seenUrls.add(r.url);
                                    allResults.push(r);
                                }
                            }
                        }
                    }

                    const uniqueResults = allResults.slice(0, 10);

                    const srcs = uniqueResults.map((r: any, i: number) => ({
                        url: r.url,
                        index: (state.sources?.length ?? 0) + i + 1,
                        content: ((r.content || r.snippet || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 400),
                    }));
                    state.sources.push(...srcs);

                    if (!srcs.length) {
                        sendStatus(res, 'no_results', 'No relevant results found.', undefined, state.thoughtProcess);
                        return 'No search results found.';
                    }

                    const foundTitles = uniqueResults.slice(0, 10).map((r: any) => r.title || getUrlTitle(r.url));
                    sendStatus(res, 'found_sources',
                        `Found ${srcs.length} source${srcs.length > 1 ? 's' : ''}`,
                        { sources: srcs.map((s: any) => s.url), titles: foundTitles, query: safeQueries[0] || userQuery || '' },
                        state.thoughtProcess);

                    const titles = uniqueResults.slice(0, 7).map((r: any) => r.title || getUrlTitle(r.url));
                    const urls = uniqueResults.slice(0, 7).map((r: any) => r.url);
                    sendStatus(res, 'reading', `Reading ${titles.length} sources...`, { titles, urls }, state.thoughtProcess);

                    const resultsText = uniqueResults.map((r: any, i: number) => {
                        let c = (r.content || r.snippet || '')
                            .replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (c.length > 3000) c = c.slice(0, 3000) + '...';
                        return `[${i + 1}] ${r.url}\n${r.title ? r.title + '\n' : ''}${c}`;
                    }).join('\n\n');
                    let extraContent = '';
                    try {
                        const topUrls = uniqueResults.slice(0, 3).map((r: any) => r.url).filter(Boolean);
                        if (topUrls.length > 0) {
                            sendStatus(res, 'extracting', 'Extracting full content from top sources...', {}, state.thoughtProcess);
                            const extractResult = await client.extract(topUrls);
                            const extracted = extractResult?.results?.filter((r: any) => r.rawContent) ?? [];
                            if (extracted.length > 0) {
                                extraContent = '\n\n--- Full page content from top sources ---\n' + extracted.map((r: any, i: number) => {
                                    const txt = r.rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                                    return `[SOURCE ${i + 1}] ${r.url || topUrls[i]}\n${txt.slice(0, 3000)}`;
                                }).join('\n\n');
                            }
                        }
                    } catch (e: any) {
                        console.warn('[TOOL] web_search extract failed (non-fatal):', e?.message ?? e);
                    }

                    const safeQueryStr = safeQueries.join('; ');
                    const fullSearchRes = `[Search Results for "${safeQueryStr}"]\n\n${resultsText}${extraContent}`;
                    state.searchContent = (state.searchContent || "") + "\n\n" + fullSearchRes;

                    // ── Cache search results (after building full text) ──────
                    setCache(cacheKey, srcs, fullSearchRes);

                    sendStatus(res, 'done', `Search complete: "${safeQueryStr}"`, { searchCount: state.searchCount }, state.thoughtProcess);

                    return `[ACCUMULATED SEARCH RESULTS — ALL SEARCHES COMBINED]
${state.searchContent}

---
INSTRUCTION: Above are ALL search results accumulated across your searches. Use ALL of this information together to answer the user comprehensively. Match your confidence to the evidence: if numbers appear in only one source, present them as estimates rather than facts. Use hedging language ("appears to", "suggests", "reportedly", "according to") — especially for claims that rely on secondary reporting. Never state an unsupported claim as settled fact. Do NOT search again — answer now using everything above.`;
                } catch (e: any) {
                    sendStatus(res, 'error', 'Search failed.', undefined, state.thoughtProcess);
                    return `Search failed: ${e.message}`;
                }
            },
        }),

        // ── read_skill ────────────────────────────────────────────────────
        read_skill: (tool as any)({
            description:
                'Load the generation rules/skill file for a document type. ' +
                'ALWAYS call this before generate_document.',
            inputSchema: z.object({
                doc_type: z
                    .enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal'])
                    .describe('The document type to load rules for'),
            }),
            execute: async ({ doc_type }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call read_skill or any other tool.';
                }
                const entry = SKILL_REGISTRY[doc_type];
                if (!entry) {
                    return `No skill file registered for "${doc_type}" yet. Proceed with defaults.`;
                }
                sendStatus(res, 'reading_skill',
                    `Reading ${entry.label} rules...`,
                    { docType: doc_type },
                    state.thoughtProcess);
                const content = await fetchSkillFile(entry.fileName);
                if (!content) {
                    sendStatus(res, 'reading_skill_error',
                        `Skill file for "${doc_type}" not found on disk.`,
                        { docType: doc_type },
                        state.thoughtProcess);
                    return `Skill file for "${doc_type}" not found on disk. Proceed with defaults.`;
                }
                sendStatus(res, 'reading_skill_success',
                    `${entry.label} rules loaded`,
                    { docType: doc_type },
                    state.thoughtProcess);
                return content;
            },
        }),

        // ── generate_document ─────────────────────────────────────────────
        generate_document: (tool as any)({
            description:
                'Generate a downloadable document file. Do NOT use this tool for requests to create charts, graphs, diagrams, or flowcharts, unless the user explicitly requested a document file format (like "create a chart PDF" or "put the chart in a Word document"). For standard chart/diagram requests, render them inline instead. ' +
                'Always call read_skill first and pass the content here.',
            inputSchema: z.object({
                doc_type: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal']),
                topic: z.string().describe(
                    'The detailed topic, content, research findings, and data to be included in the document. ' +
                    'Provide all specific facts, sections, text, questions, or answers that must be written into the document. ' +
                    'The document generator ONLY sees this parameter, so you MUST pass all relevant content here.'
                ),
                skill_content: z
                    .string()
                    .optional()
                    .describe('The skill file content returned by read_skill'),
            }),
            execute: async ({ doc_type, topic, skill_content }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call generate_document or any other tool.';
                }
                const safeDocType = typeof doc_type === 'string' ? doc_type : '';
                const safeTopic = typeof topic === 'string' ? topic.trim() : '';
                if (!safeDocType || !safeTopic) {
                    console.warn('[TOOL] generate_document called with missing doc_type or topic');
                    return 'Document generation failed: missing doc_type or topic. Please try again.';
                }
                sendStatus(res, 'generating_file',
                    `Building your ${safeDocType.toUpperCase()} on "${safeTopic.slice(0, 30)}"...`,
                    { docType: safeDocType, topic: safeTopic }, state.thoughtProcess);
                const fakeQuery = `Create a ${safeDocType} about: ${safeTopic}`;

                // Map persona types to md if needed for the builder
                let actualDocType: any = safeDocType;
                if (['tech', 'finance', 'coder', 'creative', 'legal'].includes(safeDocType)) {
                    actualDocType = 'md';
                }

                const generatedFile = await generateDocumentWithSkill(
                    actualDocType,
                    fakeQuery,
                    model,
                    skill_content ?? '',
                    state.searchContent ?? ''
                );
                if (!generatedFile) {
                    sendStatus(res, 'generating_file_error',
                        `Failed to generate the ${safeDocType.toUpperCase()} document.`,
                        { docType: safeDocType },
                        state.thoughtProcess);
                    return `Failed to generate the ${safeDocType.toUpperCase()} document. Tell the user to try again.`;
                }
                state.generatedFiles.push(generatedFile);
                if (!res.writableEnded) {
                    res.write(`event: file\ndata: ${JSON.stringify(generatedFile)}\n\n`);
                }
                sendStatus(res, 'generating_file_success',
                    `${safeDocType.toUpperCase()} "${generatedFile.filename}" ready`,
                    { docType: safeDocType, filename: generatedFile.filename },
                    state.thoughtProcess);
                return (
                    `${safeDocType.toUpperCase()} file "${generatedFile.filename}" generated successfully. ` +
                    `Tell the user it is ready to download.`
                );
            },
        }),

        // ── get_weather ───────────────────────────────────────────────────
        get_weather: (tool as any)({
            description: 'Fetch real-time weather data for a specific city. ONLY call when the user explicitly asks about weather, temperature, or forecast for a location. NEVER call this when the user is asking about code, architecture, routing, classifiers, prototypes, or any technical/system topic — even if the word "weather" appears in their message as part of an example or quote. If in doubt, do NOT call this tool.',
            inputSchema: z.object({
                city: z.string().describe('The city name to get weather for'),
            }),
            execute: async ({ city }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call get_weather or any other tool.';
                }
                const safeCity = typeof city === 'string' ? city.trim() : '';
                if (!safeCity) {
                    console.warn('[TOOL] get_weather called with no city');
                    return 'No city was provided for weather lookup.';
                }
                // Hallucination guard: only call weather if user actually asked about weather
                if (typeof userQuery === 'string') {
                    const hasWeatherIntent = /\b(weather|temperature|forecast|humidity|rain|sunny|cloudy|wind|rainfall|climate|degrees)\b/i.test(userQuery);
                    const hasSystemWords = /\b(architecture|prototype|router|codebase|classify|tier|regex|embedding|classifier|pipeline|workflow|orchestrat|diagram|query.*router|route.*model)\b/i.test(userQuery);
                    if (!hasWeatherIntent || hasSystemWords) {
                        console.warn(`[TOOL] get_weather skipped — ${!hasWeatherIntent ? 'no weather intent' : 'query has system/architecture context'} (called with city: ${safeCity})`);
                        return `__SEARCH_SKIPPED__ Answer naturally without searching. The user's request has nothing to do with weather.`;
                    }
                }
                sendStatus(res, 'weather', `Fetching weather for ${safeCity}...`, undefined, state.thoughtProcess);
                const result = await fetchWeatherFromAPI(sanitizeLocation(safeCity));
                if (!result) {
                    sendStatus(res, 'weather_error', `Weather unavailable for ${safeCity}.`, undefined, state.thoughtProcess);
                    return `Could not fetch weather for ${safeCity}.`;
                }
                const fahrenheit = ((result.temperature * 9 / 5) + 32).toFixed(1);
                const feelsF = ((result.feelsLike * 9 / 5) + 32).toFixed(1);
                sendStatus(res, 'weather_success',
                    `${result.resolvedCity}: ${result.temperature}°C (${fahrenheit}°F), ` +
                    `feels like ${result.feelsLike}°C (${feelsF}°F) — ${result.description}`,
                    { source: result.source },
                    state.thoughtProcess);
                return [
                    `Live weather for ${result.resolvedCity} (via ${result.source}):`,
                    `  Temperature : ${result.temperature}°C  (${fahrenheit}°F)`,
                    `  Feels like  : ${result.feelsLike}°C  (${feelsF}°F)`,
                    `  Humidity    : ${result.humidity}%`,
                    `  Wind        : ${result.windSpeed} km/h`,
                    `  Conditions  : ${result.description}`,
                ].join('\n');
            },
        }),

        // ── generate_image ────────────────────────────────────────────────
        generate_image: (tool as any)({
            description:
                'Generate an AI image, illustration, photo, or artwork. ' +
                'Use when user asks to create, draw, or generate an image. ' +
                'Do NOT use this tool for charts, graphs, or diagrams (which should be rendered inline using CHART or MERMAID tags).',
            inputSchema: z.object({
                prompt: z.string().describe('Description of the image to generate'),
            }),
            execute: async ({ prompt }: any) => {
                sendStatus(res, 'image_enhancing', 'Enhancing image prompt with AI...', undefined, state.thoughtProcess);
                const enhanced = await enhanceImagePrompt(prompt, model);
                sendStatus(res, 'image_enhancing_success', 'Image prompt enhanced', undefined, state.thoughtProcess);

                const thoughtEvent = { type: 'thought', content: `Enhanced prompt: ${enhanced}` };
                state.thoughtProcess.push(thoughtEvent);
                res.write(
                    `event: thought\ndata: ${JSON.stringify(thoughtEvent)}\n\n`
                );
                sendStatus(res, 'image_generating', 'Generating image with Bonsai...', undefined, state.thoughtProcess);
                try {
                    const health = await fetch(`${IMAGE_SERVICE_URL}/health`, {
                        signal: AbortSignal.timeout(3000),
                    }).catch(() => null);
                    if (!health?.ok) {
                        sendStatus(res, 'image_generating_error', 'Image service is offline.', undefined, state.thoughtProcess);
                        return 'Image service is offline. Start it with: python image_service.py';
                    }
                    const imgRes = await fetch(`${IMAGE_SERVICE_URL}/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: enhanced, width: 1024, height: 1024 }),
                        signal: AbortSignal.timeout(180_000),
                    });
                    if (!imgRes.ok) {
                        sendStatus(res, 'image_generating_error', `Image service error: HTTP ${imgRes.status}`, undefined, state.thoughtProcess);
                        return `Image service error: HTTP ${imgRes.status}`;
                    }
                    const imgData = await imgRes.json() as any;
                    const file = {
                        base64: imgData.image_base64,
                        thumbnail: imgData.thumbnail_base64,
                        filename: `bonsai-${Date.now()}.png`,
                        mime: 'image/png',
                        width: imgData.width,
                        height: imgData.height,
                    };
                    state.generatedFiles.push(file);
                    if (!res.writableEnded) {
                        res.write(`event: file\ndata: ${JSON.stringify(file)}\n\n`);
                    }
                    sendStatus(res, 'image_generating_success', 'Image generated successfully', undefined, state.thoughtProcess);
                    return (
                        `Image generated (${imgData.width}×${imgData.height}px). ` +
                        `Tell the user the image is displayed below.`
                    );
                } catch (e: any) {
                    sendStatus(res, 'image_generating_error', `Image generation failed: ${e.message}`, undefined, state.thoughtProcess);
                    return `Image generation failed: ${e.message}`;
                }
            },
        }),

        // ── run_python ────────────────────────────────────────────────────
        run_python: (tool as any)({
            description: 'Execute Python code in an isolated sandbox. Use for data analysis, visualization, file processing, calculations. Has pandas, numpy, matplotlib, seaborn, plotly, scipy, scikit-learn pre-installed.',
            inputSchema: z.object({
                code: z.string().describe('Complete, runnable Python code to execute'),
            }),
            execute: async ({ code }: any) => {
                // Post-search guard: if model already has search results, it should answer, not run code
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ You already have substantial search results from 3 searches. ANSWER THE USER NOW using the accumulated information. Do NOT call any more tools.';
                }
                const cid = activeConversationId || 'default';
                sendStatus(res, 'sandbox_start', 'Starting Python execution...', { tool: 'run_python' }, state.thoughtProcess);
                try {
                    const result = await codeExecutor.runPython(cid, code || '', (type, line) => {
                        if (!res.writableEnded) {
                            res.write(`event: code_output\ndata: ${JSON.stringify({ type, content: line })}\n\n`);
                        }
                    }, abortSignal);
                    if (!res.writableEnded) {
                        res.write(`event: code_done\ndata: ${JSON.stringify({ exitCode: result.exitCode, duration: result.duration })}\n\n`);
                    }
                    for (const filePath of result.generatedFiles) {
                        const filename = filePath.split('/').pop() || 'output';
                        try {
                            const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, filePath);
                            if (!res.writableEnded) {
                                res.write(`event: file_generated\ndata: ${JSON.stringify({ filename, path: filePath, mime: mimeType, base64, downloadUrl: `/api/sandbox/download/${cid}/${filename}` })}\n\n`);
                            }
                        } catch {
                            if (!res.writableEnded) {
                                res.write(`event: file_generated\ndata: ${JSON.stringify({ filename, path: filePath, downloadUrl: `/api/sandbox/download/${cid}/${filename}` })}\n\n`);
                            }
                        }
                    }
                    sendStatus(res, 'sandbox_success',
                        `Python finished (exit ${result.exitCode}, ${(result.duration / 1000).toFixed(1)}s)`,
                        {
                            tool: 'run_python',
                            exitCode: result.exitCode,
                            code,
                            stdout: result.stdout.join('\n'),
                            stderr: result.stderr.join('\n'),
                            duration: result.duration
                        },
                        state.thoughtProcess);
                    const outFull = result.stdout.join('\n');
                    const errFull = result.stderr.join('\n');
                    const out = outFull.slice(0, 4000);
                    const err = errFull.slice(0, 2000);
                    const outTruncated = outFull.length > 4000 ? '\n[output truncated]' : '';
                    const errTruncated = errFull.length > 2000 ? '\n[output truncated]' : '';
                    return `Exit code: ${result.exitCode} (${(result.duration / 1000).toFixed(1)}s)\n${out ? `STDOUT:\n${out}${outTruncated}\n` : ''}${err ? `STDERR:\n${err}${errTruncated}\n` : ''}${result.generatedFiles.length ? `Generated files: ${result.generatedFiles.join(', ')} (sent to user)\n` : ''}${result.error ? `Error: ${result.error}` : ''}`;
                } catch (e: any) {
                    sendStatus(res, 'sandbox_error', `Python execution failed: ${e.message}`, { tool: 'run_python', code, error: e.message }, state.thoughtProcess);
                    return `Python execution failed: ${e.message}`;
                }
            },
        }),

        // ── run_bash ──────────────────────────────────────────────────────
        run_bash: (tool as any)({
            description: 'Run a bash command in the sandbox. Used for compiling/running code (gcc, python3, node, etc.), file operations, installing packages, and checking system info. After write_file creates a code file, call this to compile and test it.',
            inputSchema: z.object({
                command: z.string().describe('Bash command to execute'),
            }),
            execute: async ({ command }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have detailed search results from earlier searches. Do NOT call any more tools.';
                }
                const cid = activeConversationId || 'default';
                // Emit code_execution FIRST so streaming output lines have a visible container
                if (!res.writableEnded) {
                    res.write(`event: code_execution\ndata: ${JSON.stringify({ code: command || '', language: 'bash' })}\n\n`);
                }
                sendStatus(res, 'sandbox_start', `$ ${(command || '').slice(0, 80)}`, { tool: 'run_bash', command }, state.thoughtProcess);
                try {
                    const result = await codeExecutor.runBash(cid, command || '', (type, line) => {
                        if (!res.writableEnded) {
                            res.write(`event: code_output\ndata: ${JSON.stringify({ type, content: line })}\n\n`);
                        }
                    }, abortSignal);
                    if (!res.writableEnded) {
                        res.write(`event: code_done\ndata: ${JSON.stringify({ exitCode: result.exitCode, duration: result.duration })}\n\n`);
                    }
                    for (const filePath of result.generatedFiles) {
                        const filename = filePath.split('/').pop() || 'output';
                        try {
                            const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, filePath);
                            if (!res.writableEnded) {
                                res.write(`event: file_generated\ndata: ${JSON.stringify({ filename, path: filePath, mime: mimeType, base64, downloadUrl: `/api/sandbox/download/${cid}/${filename}` })}\n\n`);
                            }
                        } catch {
                            if (!res.writableEnded) {
                                res.write(`event: file_generated\ndata: ${JSON.stringify({ filename, path: filePath, downloadUrl: `/api/sandbox/download/${cid}/${filename}` })}\n\n`);
                            }
                        }
                    }
                    sendStatus(res, 'sandbox_success',
                        `Bash finished (exit ${result.exitCode}, ${(result.duration / 1000).toFixed(1)}s)`,
                        {
                            tool: 'run_bash',
                            exitCode: result.exitCode,
                            command,
                            stdout: result.stdout.join('\n'),
                            stderr: result.stderr.join('\n'),
                            duration: result.duration
                        },
                        state.thoughtProcess);
                    const outFull = result.stdout.join('\n');
                    const errFull = result.stderr.join('\n');
                    const out = outFull.slice(0, 4000);
                    const err = errFull.slice(0, 2000);
                    const outTruncated = outFull.length > 4000 ? '\n[output truncated]' : '';
                    const errTruncated = errFull.length > 2000 ? '\n[output truncated]' : '';
                    return `Exit code: ${result.exitCode} (${(result.duration / 1000).toFixed(1)}s)\n${out ? `STDOUT:\n${out}${outTruncated}\n` : ''}${err ? `STDERR:\n${err}${errTruncated}\n` : ''}${result.generatedFiles.length ? `Generated files: ${result.generatedFiles.join(', ')} (sent to user)\n` : ''}`;
                } catch (e: any) {
                    sendStatus(res, 'sandbox_error', `Bash failed: ${e.message}`, { tool: 'run_bash', command, error: e.message }, state.thoughtProcess);
                    return `Bash failed: ${e.message}`;
                }
            },
        }),

        // ── read_file ─────────────────────────────────────────────────────
        read_file: (tool as any)({
            description: 'Read contents of a file from the sandbox.',
            inputSchema: z.object({
                path: z.string().describe('Absolute path like /home/user/data.csv'),
            }),
            execute: async ({ path }: any) => {
                const cid = activeConversationId || 'default';
                try {
                    const content = await codeExecutor.readFile(cid, path);
                    return `Contents of ${path}:\n\n${content}`;
                } catch (e: any) {
                    return `Failed to read ${path}: ${e.message}`;
                }
            },
        }),

        // ── write_file ────────────────────────────────────────────────────
        write_file: (tool as any)({
            description: 'Create or overwrite a file in the sandbox. After writing a code file, call run_bash next to compile and execute it — do NOT explain yet, do NOT output bash commands as text, just call run_bash.',
            inputSchema: z.object({
                path: z.string().describe('File path like /home/user/output.csv'),
                content: z.string().describe('Full file content'),
            }),
            execute: async ({ path, content }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have search results. Do NOT call tools.';
                }
                const cid = activeConversationId || 'default';
                const filename = path.split('/').pop() || 'file';
                const ext = filename.split('.').pop()?.toLowerCase() || '';
                const langMap: Record<string, string> = { c: 'c', cpp: 'cpp', py: 'python', js: 'javascript', ts: 'typescript', html: 'html', css: 'css', sh: 'bash', json: 'json', md: 'markdown', rs: 'rust', go: 'go', java: 'java' };
                const language = langMap[ext] || 'text';
                sendStatus(res, 'generating_file', `Writing ${filename}...`, { path, filename, content, language }, state.thoughtProcess);
                try {
                    await codeExecutor.writeFile(cid, path, content);
                    sendStatus(res, 'generating_file_success', `Wrote ${filename}`, { path, filename, content, language }, state.thoughtProcess);
                    const codeExts = ['c', 'cpp', 'py', 'js', 'ts', 'rs', 'go', 'java'];
                    const isCode = codeExts.includes(ext);
                    return isCode
                        ? `File written to ${path}. Now call run_bash to compile and test it. Do NOT explain yet — just call run_bash.`
                        : `File written to ${path}.`;
                } catch (e: any) {
                    sendStatus(res, 'generating_file_error', `Failed to write ${filename}: ${e.message}`, { path }, state.thoughtProcess);
                    return `Failed to write ${path}: ${e.message}`;
                }
            },
        }),

        // ── list_files ────────────────────────────────────────────────────
        list_files: (tool as any)({
            description: 'List files in a sandbox directory.',
            inputSchema: z.object({
                path: z.string().optional().describe('Directory path, default /home/user'),
            }),
            execute: async ({ path }: any) => {
                const cid = activeConversationId || 'default';
                try {
                    const files = await codeExecutor.listFiles(cid, path || '/home/user');
                    return `Files in ${path || '/home/user'}:\n${files.join('\n') || '(empty)'}`;
                } catch (e: any) {
                    return `Failed to list files: ${e.message}`;
                }
            },
        }),

        // ── install_package ───────────────────────────────────────────────
        install_package: (tool as any)({
            description: 'Install a Python package via pip in the sandbox.',
            inputSchema: z.object({
                package: z.string().describe('Package name e.g. tensorflow or opencv-python'),
            }),
            execute: async ({ package: pkg }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have search results. Do NOT call tools.';
                }
                const cid = activeConversationId || 'default';
                sendStatus(res, 'sandbox_start', `Installing ${pkg}...`, { tool: 'install_package' }, state.thoughtProcess);
                try {
                    await codeExecutor.installPackage(cid, pkg || '', (type, line) => {
                        if (!res.writableEnded) {
                            res.write(`event: code_output\ndata: ${JSON.stringify({ type, content: line })}\n\n`);
                        }
                    });
                    sendStatus(res, 'sandbox_success', `${pkg} installed`, { tool: 'install_package' }, state.thoughtProcess);
                    return `Package ${pkg} installed successfully.`;
                } catch (e: any) {
                    sendStatus(res, 'sandbox_error', `Install failed: ${e.message}`, { tool: 'install_package' }, state.thoughtProcess);
                    return `Install failed: ${e.message}`;
                }
            },
        }),

        // ── edit_file ─────────────────────────────────────────────────────
        edit_file: (tool as any)({
            description: 'Surgically edit a file by replacing a specific string. ALWAYS read_file first. After editing code, call run_bash to re-compile and re-run.',
            inputSchema: z.object({
                path: z.string().describe('File path'),
                old_str: z.string().describe('EXACT string to replace (must be unique)'),
                new_str: z.string().describe('Replacement string'),
            }),
            execute: async ({ path, old_str, new_str }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have search results. Do NOT call tools.';
                }
                const cid = activeConversationId || 'default';
                const filename = path.split('/').pop() || 'file';
                sendStatus(res, 'generating_file', `Editing ${filename}...`, { path }, state.thoughtProcess);
                try {
                    const result = await codeExecutor.editFile(cid, path, old_str || '', new_str || '');
                    if (result.success) {
                        sendStatus(res, 'generating_file_success', `Edited ${filename}`, { path }, state.thoughtProcess);
                        return `File ${path} edited successfully. After editing code, call run_bash to re-compile and re-run to verify the fix.`;
                    }
                    sendStatus(res, 'generating_file_error', `Edit failed on ${filename}: ${result.error}`, { path }, state.thoughtProcess);
                    return `Edit failed: ${result.error}`;
                } catch (e: any) {
                    sendStatus(res, 'generating_file_error', `Edit failed on ${filename}: ${e.message}`, { path }, state.thoughtProcess);
                    return `Edit failed: ${e.message}`;
                }
            },
        }),

        // ── wiki_search ───────────────────────────────────────────────────
        wiki_search: (tool as any)({
            description: 'Search the knowledge graph / wiki for concepts, entities, and topics extracted from this conversation. Returns related nodes and their relationships. Use this when the user asks about topics or concepts previously discussed. May only be called ONCE per query.',
            inputSchema: z.object({
                query: z.string().describe('The concept or topic to search for in the wiki'),
            }),
            execute: async ({ query }: any) => {
                if (!uid || !query) return 'No user or query provided.';
                if (state.wikiSearchCount >= 1) {
                    return `__TOOL_BLOCKED__ You already searched the wiki and the model is still tool-looping. ANSWER THE USER NOW. Do NOT call any more tools.`;
                }
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call wiki_search or any other tool.';
                }
                state.wikiSearchCount++;
                try {
                    const nodes = await wikiManager.searchConcepts(uid, query);
                    if (!nodes.length) return `No wiki entries found for "${query}".`;
                    return `Wiki results for "${query}":\n${nodes.map((n: any) => `  - ${n.label} (${n.type}): ${n.description || 'no description'}`).join('\n')}`;
                } catch (e: any) {
                    return `Wiki search failed: ${e.message}`;
                }
            },
        }),

        // ── create_project ────────────────────────────────────────────────
        create_project: (tool as any)({
            description: 'Scaffold a full project directory with files in the sandbox. Use this when building a complete app (HTML/CSS/JS, React, Python web app, etc.). Provide the project name and an array of { path, content } objects.',
            inputSchema: z.object({
                name: z.string().describe('Project name (folder name under /home/user)'),
                files: z.array(z.object({
                    path: z.string().describe('Relative file path within the project, e.g. src/index.js'),
                    content: z.string().describe('Full file content'),
                })).describe('Array of files to create in the project'),
            }),
            execute: async ({ name, files }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have search results. Do NOT call tools.';
                }
                const cid = activeConversationId || 'default';
                const projectDir = `/home/user/${name}`;
                sendStatus(res, 'generating_file', `Scaffolding project "${name}"...`, { name }, state.thoughtProcess);
                try {
                    await codeExecutor.runBash(cid, `mkdir -p ${projectDir}`);
                    let created = 0;
                    for (const f of files || []) {
                        const fullPath = f.path.startsWith('/') ? f.path : `${projectDir}/${f.path}`;
                        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
                        await codeExecutor.runBash(cid, `mkdir -p ${dir}`);
                        await codeExecutor.writeFile(cid, fullPath, f.content || '');
                        created++;
                    }
                    sendStatus(res, 'generating_file_success', `Project "${name}" created with ${created} files.`, { name, created }, state.thoughtProcess);
                    return `Project "${name}" created with ${created} files at ${projectDir}`;
                } catch (e: any) {
                    sendStatus(res, 'generating_file_error', `Failed to create project "${name}": ${e.message}`, { name }, state.thoughtProcess);
                    return `Failed to create project: ${e.message}`;
                }
            },
        }),

        // ── start_app ─────────────────────────────────────────────────────
        start_app: (tool as any)({
            description: 'Start a long-running background process (web server, dev server, API) in the sandbox. Use this after creating project files with create_project or write_file. The process runs in the background — use stop_app to kill it and get_app_url for the public URL.',
            inputSchema: z.object({
                name: z.string().describe('A human-readable name for this app/process'),
                command: z.string().describe('The command to run (e.g. "python3 app.py", "npm start", "node server.js")'),
                cwd: z.string().optional().describe('Working directory (default: /home/user)'),
                port: z.number().optional().describe('The port the app listens on (e.g. 3000, 8000, 5000). Required for get_app_url to work.'),
            }),
            execute: async ({ name, command, cwd, port }: any) => {
                const cid = activeConversationId || 'default';
                sendStatus(res, 'sandbox_start', `Launching app "${name}"...`, { name, command, port }, state.thoughtProcess);
                try {
                    const app = await codeExecutor.startApp(cid, name || 'app', command, cwd || '/home/user', port);
                    sendStatus(res, 'sandbox_success', `App "${name}" launched on port ${port || 'auto'}`, { name, app_id: app.id }, state.thoughtProcess);
                    return `App "${app.name}" started (ID: ${app.id})${port ? ` on port ${port}` : ''}. Use get_app_url with ID "${app.id}" to get the public URL, and stop_app to stop it.`;
                } catch (e: any) {
                    sendStatus(res, 'sandbox_error', `Failed to launch app "${name}": ${e.message}`, { name }, state.thoughtProcess);
                    return `Failed to start app: ${e.message}`;
                }
            },
        }),

        // ── stop_app ──────────────────────────────────────────────────────
        stop_app: (tool as any)({
            description: 'Stop a running background app by its ID (returned by start_app).',
            inputSchema: z.object({
                app_id: z.string().describe('The app ID returned by start_app'),
            }),
            execute: async ({ app_id }: any) => {
                const cid = activeConversationId || 'default';
                try {
                    const stopped = await codeExecutor.stopApp(cid, app_id);
                    return stopped ? `App ${app_id} stopped.` : `App ${app_id} not found.`;
                } catch (e: any) {
                    return `Failed to stop app: ${e.message}`;
                }
            },
        }),

        // ── list_apps ─────────────────────────────────────────────────────
        list_apps: (tool as any)({
            description: 'List all running background apps in the current sandbox session.',
            inputSchema: z.object({}),
            execute: async () => {
                const cid = activeConversationId || 'default';
                const apps = codeExecutor.listApps(cid);
                if (!apps.length) return 'No running apps.';
                return apps.map(a =>
                    `  ID: ${a.id} | Name: ${a.name} | Command: ${a.command} | CWD: ${a.cwd} | Port: ${a.port || '-'} | Started: ${new Date(a.startedAt).toLocaleTimeString()}`
                ).join('\n');
            },
        }),

        // ── get_app_logs ──────────────────────────────────────────────────
        get_app_logs: (tool as any)({
            description: 'Get the stdout/stderr output from a running or finished app. Returns whatever output has been buffered so far.',
            inputSchema: z.object({
                app_id: z.string().describe('The app ID returned by start_app'),
            }),
            execute: async ({ app_id }: any) => {
                const cid = activeConversationId || 'default';
                try {
                    const logs = await codeExecutor.getAppLogs(cid, app_id);
                    let result = '';
                    if (logs.stdout) result += `STDOUT:\n${logs.stdout}\n`;
                    if (logs.stderr) result += `STDERR:\n${logs.stderr}\n`;
                    return result || 'No logs available yet.';
                } catch (e: any) {
                    return `Failed to get logs: ${e.message}`;
                }
            },
        }),

        // ── get_app_url ───────────────────────────────────────────────────
        get_app_url: (tool as any)({
            description: 'Get the public HTTPS URL for a running web app started with start_app. The app must have been started with a port number. Use this to provide the user with a clickable link to their app.',
            inputSchema: z.object({
                app_id: z.string().describe('The app ID returned by start_app'),
            }),
            execute: async ({ app_id }: any) => {
                const cid = activeConversationId || 'default';
                sendStatus(res, 'searching', 'Generating public preview URL...', { app_id }, state.thoughtProcess);
                try {
                    const url = await codeExecutor.getAppUrl(cid, app_id);
                    if (url) {
                        sendStatus(res, 'found_sources', 'Preview ready!', { url }, state.thoughtProcess);
                        return `Your app is live at: ${url}`;
                    }
                    sendStatus(res, 'error', 'App preview not ready yet.', { app_id }, state.thoughtProcess);
                    return 'App URL not yet available. The app may still be starting up or may not be listening on the expected port.';
                } catch (e: any) {
                    sendStatus(res, 'error', `Failed to get preview URL: ${e.message}`, { app_id }, state.thoughtProcess);
                    return `Failed to get app URL: ${e.message}`;
                }
            },
        }),

        // ── get_generated_file ────────────────────────────────────────────
        get_generated_file: (tool as any)({
            description: 'Download a file from the sandbox and return its base64-encoded content with MIME type. Use this to return files (images, PDFs, CSVs) directly to the user in chat.',
            inputSchema: z.object({
                path: z.string().describe('Absolute path to the file in the sandbox, e.g. /home/user/output.png'),
            }),
            execute: async ({ path }: any) => {
                const cid = activeConversationId || 'default';
                try {
                    const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, path);
                    const filename = path.split('/').pop() || 'file';
                    if (!res.writableEnded) {
                        res.write(`event: file_generated\ndata: ${JSON.stringify({ filename, path, mime: mimeType, base64, downloadUrl: `/api/sandbox/download/${cid}/${filename}` })}\n\n`);
                    }
                    return `File "${filename}" (${mimeType}, ${Math.round(base64.length * 0.75 / 1024)}KB) has been sent to the user.`;
                } catch (e: any) {
                    return `Failed to get file: ${e.message}`;
                }
            },
        }),

        // ── read_url ───────────────────────────────────────────────────────
        read_url: (tool as any)({
            description:
                'Fetch and extract readable text content from a URL — supports web pages (HTML, plain text, JSON), PDF documents, and DOCX files. ' +
                'Use this to read the FULL content from any URL the user provides or that appears in search results. ' +
                'Essential for syllabus PDFs, documentation pages, articles, and any link where snippets alone miss critical data ' +
                '(like course codes in PDF tables, schema tables, nested lists, or DOCX documents). ' +
                'PDFs are parsed with table-aware extraction that preserves row/column structure. DOCX files are parsed to plain text.',
            inputSchema: z.object({
                url: z.string().describe('The full URL to fetch (must start with http:// or https://)'),
            }),
            execute: async ({ url }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using accumulated search results. Do NOT call read_url or any other tool.';
                }
                if (!url || typeof url !== 'string') return 'No URL provided.';
                const trimmed = url.trim();
                if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return 'Invalid URL. Must start with http:// or https://';

                sendStatus(res, 'reading', `Fetching content from ${trimmed}...`, { url: trimmed }, state.thoughtProcess);
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 20000);
                    const resp = await fetch(trimmed, {
                        signal: controller.signal,
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FluxBot/1.0; +https://flux.ai/bot)' },
                    });
                    clearTimeout(timeoutId);
                    if (!resp.ok) {
                        if (resp.status === 404) return `The URL "${trimmed}" returned 404 Not Found.`;
                        return `Failed to fetch "${trimmed}" — HTTP ${resp.status} ${resp.statusText}`;
                    }
                    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
                    const rawBuf = Buffer.from(await resp.arrayBuffer());
                    const isPdf = contentType.includes('pdf') || /\.pdf($|\?)/i.test(trimmed);

                    let extracted = '';
                    const isDocx = contentType.includes('wordprocessingml') || /\.docx($|\?)/i.test(trimmed);
                    if (isPdf) {
                        sendStatus(res, 'reading', `Parsing PDF (${(rawBuf.length / 1024).toFixed(0)} KB)...`, undefined, state.thoughtProcess);
                        extracted = await extractPdfTableAware(rawBuf);
                    } else if (isDocx) {
                        sendStatus(res, 'reading', `Parsing DOCX (${(rawBuf.length / 1024).toFixed(0)} KB)...`, undefined, state.thoughtProcess);
                        extracted = await extractDocxText(rawBuf);
                    } else {
                        let text = rawBuf.toString('utf-8');
                        text = text
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
                            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
                            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/&nbsp;/g, ' ')
                            .replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                            .replace(/\s+/g, ' ')
                            .trim();
                        extracted = text.slice(0, 50000);
                    }

                    if (!extracted.replace(/\s/g, '').length) {
                        return `The URL "${trimmed}" returned content but no extractable text was found.`;
                    }

                    sendStatus(res, 'found_sources', `Read ${trimmed} (${(extracted.length / 1024).toFixed(0)} KB of text)`, undefined, state.thoughtProcess);
                    return `[CONTENT FROM ${trimmed}]\n${extracted}\n\n---\nUse this content to answer the user. It came directly from the URL, not from a search snippet.`;
                } catch (e: any) {
                    if (e.name === 'AbortError') return `Request to "${trimmed}" timed out. The site may be slow or unreachable.`;
                    return `Failed to fetch "${trimmed}": ${e.message}`;
                }
            },
        }),
    };
}

// ── PDF parsing (table-aware) ──────────────────────────────────────────
async function extractPdfTableAware(rawBuf: Buffer): Promise<string> {
    try {
        await initPdfjs();
        const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
        const data = new Uint8Array(rawBuf);
        const doc = await getDocument({ data, useSystemFonts: true }).promise;

        const Y_TOLERANCE = 4;
        const MAX_CHARS = 80000;
        const allPages: string[] = [];

        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            const items = content.items as any[];

            const rows = new Map<number, any[]>();
            for (const item of items) {
                const y = Math.round(item.transform[5] / Y_TOLERANCE) * Y_TOLERANCE;
                if (!rows.has(y)) rows.set(y, []);
                rows.get(y)!.push(item);
            }

            const sortedY = [...rows.keys()].sort((a, b) => b - a);
            const pageLines: string[] = [];
            let prevY = -1000;

            for (const y of sortedY) {
                const rowItems = rows.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);

                const gaps: number[] = [];
                for (let i = 1; i < rowItems.length; i++) {
                    const prevEnd = rowItems[i - 1].transform[4] + (rowItems[i - 1].width || rowItems[i - 1].str.length * 5);
                    const gap = rowItems[i].transform[4] - prevEnd;
                    if (gap > 0) gaps.push(gap);
                }
                gaps.sort((a, b) => a - b);
                const medianGap: number = gaps.length > 0 ? (gaps[Math.floor(gaps.length / 2)] ?? 0) : 0;
                const colThreshold = Math.max(medianGap * 3, 20);

                const lineParts: string[] = [];
                let lastX = -100;
                for (const item of rowItems) {
                    const x = item.transform[4];
                    const text = item.str;
                    if (!text.trim()) continue;
                    const gap = x - lastX;
                    if (gap > colThreshold && lastX > 0) {
                        lineParts.push(' | ');
                    } else if (lineParts.length > 0 && lastX > 0 && gap > 2) {
                        lineParts.push(' ');
                    }
                    lineParts.push(text);
                    lastX = x + (item.width || text.length * 5);
                }

                const line = lineParts.join('').trim();
                if (line) {
                    if (prevY - y > 15) pageLines.push('');
                    pageLines.push(line);
                    prevY = y;
                }
            }

            allPages.push(pageLines.join('\n'));
            if (allPages.join('\n\n').length > MAX_CHARS) break;
        }

        let result = allPages.join('\n\n--- Page ---\n\n').slice(0, MAX_CHARS);

        const wordCount = result.split(/\s+/).length;
        if (wordCount < 10 || result.length < 200) {
            const simple = await extractPdfSimple(rawBuf);
            return simple || result;
        }

        return result;
    } catch {
        return await extractPdfSimple(rawBuf);
    }
}

async function extractPdfSimple(rawBuf: Buffer): Promise<string> {
    try {
        await initPdfjs();
        const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
        const data = new Uint8Array(rawBuf);
        const doc = await getDocument({ data, useSystemFonts: true }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const items = (await page.getTextContent()).items as any[];
            pages.push(items.map((t: any) => t.str).join(' '));
            if (pages.join('\n').length > 60000) break;
        }
        return pages.join('\n').slice(0, 80000);
    } catch {
        return '';
    }
}

// ── DOCX parsing ─────────────────────────────────────────────────────────
async function extractDocxText(rawBuf: Buffer): Promise<string> {
    try {
        const mammoth = await import('mammoth') as any;
        const result = await mammoth.extractRawText({ buffer: rawBuf });
        const text = (result.value || '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 80000) || 'No extractable text found in DOCX.';
    } catch (e: any) {
        return `Failed to parse DOCX: ${e.message}`;
    }
}

// ═══════════════════════════════════════════════════════════
//   IMAGE GENERATION — Bonsai Image 4B (local Python service)
// ═══════════════════════════════════════════════════════════

const IMAGE_SERVICE_URL = process.env.IMAGE_SERVICE_URL || "http://127.0.0.1:8001";

function detectImageIntent(query: string): boolean {
    const q = query.toLowerCase().trim();
    const genVerb = /\b(generate|create|make|draw|paint|render|design|illustrate|produce|imagine|visualize|sketch|craft)\b/i;
    const imgNoun = /\b(image|photo|photograph|picture|pic|illustration|artwork|art|painting|drawing|portrait|landscape|wallpaper|poster|logo|banner|thumbnail)\b/i;
    if (genVerb.test(q) && imgNoun.test(q)) return true;
    if (/^(draw|paint|sketch|illustrate)\s+(me\s+)?(a\s+|an\s+|the\s+)?\S/i.test(q)) return true;
    return false;
}

async function enhanceImagePrompt(rawPrompt: string, model: any): Promise<string> {
    try {
        const { text } = await generateText({
            model,
            system: [
                "You are a professional image-generation prompt engineer.",
                "Expand the user's short request into a vivid, detailed prompt for a diffusion model.",
                "Focus on: subject, composition, lighting, colour palette, mood, art style, and quality keywords.",
                "Output ONLY the enhanced prompt — no preamble, no quotes, no explanations.",
                "Target length: 60-150 words. End with: highly detailed, 8k, cinematic lighting.",
            ].join(" "),
            prompt: `Enhance this image prompt: "${rawPrompt}"`,
            maxTokens: 250,
        } as any);
        return text.trim() || rawPrompt;
    } catch {
        return rawPrompt;
    }
}

async function generateImageFollowUps(originalQuery: string, enhancedPrompt: string, model: any): Promise<string[]> {
    try {
        const { text } = await generateText({
            model,
            system: "You are a creative assistant. Generate exactly 3 short, engaging follow-up questions for a user who just generated an image. Focus on variations, edits, or related creative ideas. Output ONLY the questions wrapped in <question> tags.",
            prompt: `User originally asked for: "${originalQuery}"\nAI enhanced it to: "${enhancedPrompt}"\nGenerate 3 follow-up questions.`,
            maxTokens: 150,
        } as any);
        const matches = Array.from(text.matchAll(/<question>([\s\S]*?)<\/question>/g), m => m[1]!.trim()).filter(Boolean);
        return matches.length >= 3 ? matches.slice(0, 3) : ["Can you generate another one with a different style?", "Make this wear a hat", "What model was used for this?"];
    } catch {
        return ["Can you generate another one with a different style?", "Make this wear a hat", "What model was used for this?"];
    }
}

// ═══════════════════════════════════════════════════════════
// SANDBOX / CODE INTERPRETER ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/sandbox/upload', middleware, async (req: any, res: any) => {
    try {
        const { conversationId, filename, content } = req.body;
        if (!conversationId || !filename || content === undefined) {
            return res.status(400).json({ error: 'conversationId, filename, and content required' });
        }
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const remotePath = await sandboxManager.uploadFile(conversationId, safeName, Buffer.from(content, 'base64'));
        res.json({ success: true, filename: safeName, remotePath });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sandbox/download/:conversationId/:filename', middleware, async (req: any, res: any) => {
    try {
        const { conversationId, filename } = req.params;
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const remotePath = `/home/user/${safeName}`;
        const buffer = await sandboxManager.downloadFile(conversationId, remotePath);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(buffer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════
// WIKI / KNOWLEDGE GRAPH ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/wiki', middleware, async (req: any, res: any) => {
    try {
        const uid = req.appUserId!;
        const graph = await wikiManager.getGraph(uid);
        res.json(graph);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/wiki/node/:nodeId', middleware, async (req: any, res: any) => {
    try {
        await wikiManager.deleteNode(req.params.nodeId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/wiki/search', middleware, async (req: any, res: any) => {
    try {
        const uid = req.appUserId!;
        const query = (req.query.q as string) || '';
        const nodes = await wikiManager.searchConcepts(uid, query);
        res.json(nodes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/wiki/rebuild/progress', middleware, async (req: any, res: any) => {
    const uid = req.appUserId!;
    const progress = wikiManager.getProgress(uid);
    res.json(progress || { phase: 'idle' });
});

app.post('/api/wiki/rebuild', middleware, async (req: any, res: any) => {
    try {
        const uid = req.appUserId!;
        const result = await wikiManager.rebuildAll(uid);
        res.json(result || { nodes: [], edges: [] });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

app.get("/conversations", middleware, async (req, res) => {
    try {
        const uid = req.appUserId!;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const take = 50;
        const convs = await prisma.conversation.findMany({
            where: { userId: uid },
            orderBy: { id: 'desc' },
            take, skip: (page - 1) * take,
            include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } }
        });
        const mapped = convs.map(c => ({ id: c.id, title: c.title, slug: c.slug, lastMessageAt: c.messages[0]?.createdAt ?? null }));
        return res.json({ conversations: mapped, page, take });
    } catch (e) { console.error(e); return res.status(500).json({ message: "Internal server error" }); }
});

app.post("/conversations/new", middleware, newConvLimiter, async (req, res) => {
    try {
        const uid = req.appUserId!;
        const c = await prisma.conversation.create({
            data: { title: "New Thread", slug: `new-thread-${Date.now()}`, userId: uid }
        });
        return res.status(201).json({ conversation: { id: c.id, title: c.title, slug: c.slug, lastMessageAt: null } });
    } catch (e) { console.error(e); return res.status(500).json({ message: "Internal server error" }); }
});

app.post("/conversation/:conversationId", middleware, async (req, res) => {
    try {
        const uid = req.appUserId!;
        const cid = req.params.conversationId as string;
        if (!cid) return res.status(400).json({ message: "conversationId is required" });

        const messages = await prisma.$queryRawUnsafe<any[]>(`
            SELECT 
                id, 
                content, 
                role, 
                "createdAt", 
                sources, 
                "followUps", 
                "thoughtProcess",
                CASE 
                    WHEN "generatedFiles" IS NOT NULL 
                    THEN (SELECT jsonb_agg(f - 'base64') FROM jsonb_array_elements("generatedFiles") f)
                    ELSE NULL 
                END as "generatedFiles",
                CASE 
                    WHEN "fileAttachment" IS NOT NULL 
                    THEN (SELECT jsonb_agg(f - 'content') FROM jsonb_array_elements("fileAttachment") f)
                    ELSE NULL 
                END as "fileAttachment"
            FROM "Message"
            WHERE "conversationId" = $1 
              AND EXISTS (SELECT 1 FROM "Conversation" WHERE id = $1 AND "userId" = $2)
            ORDER BY "createdAt" ASC
        `, cid, uid);

        if (!messages.length) {
            const conv = await prisma.conversation.findFirst({ where: { id: cid, userId: uid } });
            if (!conv) return res.status(404).json({ message: "Conversation not found" });
            return res.json({ conversation: { ...conv, messages: [] } });
        }

        const optimizedMessages = messages.map((msg) => {
            const m = { ...msg };
            if (Array.isArray(m.generatedFiles)) {
                m.generatedFiles = (m.generatedFiles as any[]).map(f => ({ ...f, placeholder: true }));
            }
            if (Array.isArray(m.fileAttachment)) {
                m.fileAttachment = (m.fileAttachment as any[]).map(f => ({ ...f, placeholder: true }));
            }
            return m;
        });

        const convInfo = await prisma.conversation.findUnique({
            where: { id: cid },
            select: { id: true, title: true, slug: true }
        });

        return res.json({ conversation: { ...convInfo, messages: optimizedMessages } });
    } catch (e) { console.error(e); return res.status(500).json({ message: "Internal server error" }); }
});

app.get("/api/assets/:messageId/:type/:index", middleware, async (req, res) => {
    try {
        const uid = req.appUserId!;
        const mid = parseInt(req.params.messageId as string);
        const type = req.params.type as 'generated' | 'upload';
        const idx = parseInt(req.params.index as string);

        const msg = await prisma.message.findFirst({
            where: { id: mid, conversation: { userId: uid } },
            select: {
                generatedFiles: type === 'generated',
                fileAttachment: type === 'upload'
            }
        });

        if (!msg) return res.status(404).json({ error: "Message not found" });

        if (type === 'generated' && Array.isArray(msg.generatedFiles)) {
            const file = (msg.generatedFiles as any[])[idx];
            if (file?.base64) return res.json({ base64: file.base64 });
        }

        if (type === 'upload' && Array.isArray(msg.fileAttachment)) {
            const file = (msg.fileAttachment as any[])[idx];
            if (file?.content) return res.json({ base64: file.content });
        }

        return res.status(404).json({ error: "Asset not found" });
    } catch (e) {
        console.error("[ASSETS] Fetch error:", e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/conversations/search", middleware, async (req, res) => {
    try {
        const uid = req.appUserId!;
        const q = (req.query.q as string)?.trim().slice(0, 200);
        if (!q) return res.json({ conversations: [] });
        const convs = await prisma.conversation.findMany({
            where: {
                userId: uid,
                OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { messages: { some: { content: { contains: q, mode: 'insensitive' } } } }
                ]
            },
            take: 50,
            include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } }
        });
        const mapped = convs.map(c => ({ id: c.id, title: c.title, slug: c.slug, lastMessageAt: c.messages[0]?.createdAt ?? null }));
        return res.json({ conversations: mapped });
    } catch (e) { console.error(e); return res.status(500).json({ message: "Internal server error" }); }
});

app.get("/artifacts", middleware, async (req, res) => {
    console.log(`[ARTIFACTS] Request received from UID: ${req.appUserId}`);
    try {
        const uid = req.appUserId!;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = 24;
        const skip = (page - 1) * limit;

        const messages = await prisma.$queryRawUnsafe<any[]>(`
            SELECT 
                m.id, 
                m."conversationId", 
                m."createdAt",
                c.title as "conversationTitle",
                CASE 
                    WHEN m."generatedFiles" IS NOT NULL 
                    THEN (SELECT jsonb_agg(f - 'base64') FROM jsonb_array_elements(m."generatedFiles") f)
                    ELSE NULL 
                END as "generatedFiles",
                CASE 
                    WHEN m."fileAttachment" IS NOT NULL 
                    THEN (SELECT jsonb_agg(f - 'content') FROM jsonb_array_elements(m."fileAttachment") f)
                    ELSE NULL 
                END as "fileAttachment"
            FROM "Message" m
            JOIN "Conversation" c ON m."conversationId" = c.id
            WHERE c."userId" = $1
              AND (m."fileAttachment" IS NOT NULL OR m."generatedFiles" IS NOT NULL)
            ORDER BY m."createdAt" DESC
            LIMIT $2 OFFSET $3
        `, uid, limit + 1, skip);

        const hasMore = messages.length > limit;
        const finalMessages = hasMore ? messages.slice(0, limit) : messages;

        const artifacts: any[] = [];
        finalMessages.forEach(msg => {
            if (Array.isArray(msg.fileAttachment)) {
                (msg.fileAttachment as any[]).forEach((file, idx) => {
                    artifacts.push({
                        id: `upload-${msg.id}-${idx}`,
                        name: file.name,
                        filename: file.name,
                        mime: file.type || "application/octet-stream",
                        type: "uploaded",
                        placeholder: true,
                        conversationId: msg.conversationId,
                        conversationTitle: msg.conversationTitle || "Untitled",
                        createdAt: msg.createdAt,
                        messageId: msg.id,
                        index: idx
                    });
                });
            }
            if (Array.isArray(msg.generatedFiles)) {
                (msg.generatedFiles as any[]).forEach((file, idx) => {
                    artifacts.push({
                        id: `gen-${msg.id}-${idx}`,
                        name: file.filename || file.name || "Generated File",
                        filename: file.filename || file.name,
                        mime: file.mime || "image/png",
                        thumbnail: file.thumbnail,
                        type: "generated",
                        placeholder: true,
                        conversationId: msg.conversationId,
                        conversationTitle: msg.conversationTitle || "Untitled",
                        createdAt: msg.createdAt,
                        messageId: msg.id,
                        index: idx,
                        width: file.width,
                        height: file.height
                    });
                });
            }
        });

        const total = skip + artifacts.length + (hasMore ? 1 : 0);
        return res.json({ artifacts, pagination: { page, limit, total, hasMore } });
    } catch (e) {
        console.error("[ARTIFACTS] Fetch error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── MEMORY MANAGEMENT ──────────────────────────────────────
app.get("/memories", middleware, async (req, res) => {
    try {
        const uid = req.appUserId!;
        console.log(`[MEMORIES] Fetching memories for appUserId: ${uid}`);
        const memories = await prisma.memory.findMany({
            where: { userId: uid },
            orderBy: { createdAt: 'desc' }
        });
        console.log(`[MEMORIES] Found ${memories.length} memories for UID: ${uid}`);
        return res.json({ memories, debugUid: uid });
    } catch (e) {
        console.error("[MEMORIES] Fetch error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/memories/:id", middleware, async (req, res) => {
    try {
        const uid = req.appUserId!;
        const id = req.params.id as string;
        const memory = await prisma.memory.findFirst({
            where: { id, userId: uid }
        });
        if (!memory) return res.status(404).json({ message: "Memory not found" });
        await prisma.memory.delete({ where: { id } });
        return res.json({ success: true });
    } catch (e) {
        console.error("[MEMORIES] Delete error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ─── NEWS ───────────────────────────────────────────────────
app.get("/news", middleware, async (req, res) => {
    try {
        const hn = await fetchHackerNews(12);
        const verge = await fetchRSSCached("https://www.theverge.com/rss/index.xml", "The Verge", 8);
        const all = [...hn, ...verge].sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
        return res.json({ news: all });
    } catch (e) { console.error(e); return res.status(500).json({ message: "Internal server error" }); }
});

interface ContextualStatusMessages {
    searching: string;
    reading: string;
    generating: string;
    generatingFile: string;
    readingSkill: string;
}

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
        nq = query.trim().slice(0, 10_000);

        const safeFile = typeof fileContent === 'string' ? fileContent.slice(0, 200_000) : '';
        const safeLoc = sanitizeLocation(location ?? '');
        if (attachedFiles && attachedFiles.length > 10)
            return res.status(400).json({ error: 'Too many attachments' });
        const safeAtt = (attachedFiles ?? [])
            .filter(f => f && typeof f.name === 'string')
            .map(f => {
                const isMedia = f.type?.startsWith('image/') || f.type?.startsWith('video/');
                return {
                    name: f.name.slice(0, 200),
                    content: typeof f.content === 'string' ? f.content.slice(0, isMedia ? 2_000_000 : 200_000) : '',
                    type: f.type || 'text/plain',
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
                include: { messages: { orderBy: { createdAt: 'asc' } } },
            });
        }
        activeConversationId = existingConv?.id ?? (
            await prisma.conversation.create({
                data: { title: nq.slice(0, 120), slug: slugify(nq), userId: uid },
            })
        ).id;

        // ── SSE setup ───────────────────────────────────────────────────
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Conversation-Id', activeConversationId);
        res.flushHeaders();

        const isFollowUp = !!existingConv;
        const locInfo = safeLoc ? `User's location: ${safeLoc}` : "User's location: unknown";
        const nowStr = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric',
            month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        // ── Build conversation history ───────────────────────────────────
        const MAX_HIST = 10;
        let contextQuery = nq;
        let previousQuery: string | undefined;
        if (isFollowUp && existingConv!.messages?.length) {
            const hist = existingConv!.messages
                .slice(-MAX_HIST)
                .map((m: any) => {
                    const content = typeof m.content === 'string' ? m.content : '';
                    return `${m.role === 'User' ? 'User' : 'Assistant'}: ${content.slice(0, 2000)}`;
                })
                .join('\n\n');
            contextQuery = `Previous conversation:\n${hist}\n\nFollow-up:\n${nq}`;
            const lastUserMsg = [...existingConv!.messages].reverse().find((m: any) => m.role === 'User');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
                previousQuery = lastUserMsg.content;
            }
        }

        // ── Save user message ────────────────────────────────────────────
        await prisma.message.create({
            data: {
                content: nq,
                role: 'User',
                conversationId: activeConversationId,
                fileAttachment: safeAtt.length > 0 ? safeAtt : undefined,
            },
        });

        // ── Model routing — classify query and route to appropriate tier ──
        const route = routeModel(pref, nq, previousQuery);
        model = selectModel(route.modelId);
        const memCtx = memEnabled
            ? await retrieveMemories(uid, nq).then(buildMemoryContext).catch(() => '')
            : '';
        // When the user provides a file, prepend a hard instruction to stop the model searching
        const fileGuard = hasAnyFile
            ? `\n⚠️ FILE ATTACHED: The user has provided file content in this message. You MUST NOT call web_search or any search tool. Analyze the provided file content directly and answer from it. Searching the web for user-provided code or documents is forbidden.\n`
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
        let isSearchQuery = searchQueryRE.test(nq) && !codeExecRE.test(nq) && !isSystemQuery;
        if (!isSearchQuery && previousQuery) isSearchQuery = searchQueryRE.test(previousQuery) && !codeExecRE.test(previousQuery);
        const searchGuard = isSearchQuery
            ? `\n🔍 RESEARCH MODE: The user is asking a factual/research question. Your ONLY allowed tools are web_search and read_url. Do NOT call run_bash, run_python, write_file, edit_file, install_package, create_project, start_app, stop_app, or any sandbox/execution tools. Use web_search first to find sources, then read_url to fetch full content from important URLs (especially PDFs).\n`
            : '';

        const dynSys = [
            SYSTEM_PROMPT
                .replaceAll('{{CURRENT_DATETIME}}', nowStr)
                .replaceAll('{{LOCATION_INFO}}', locInfo)
                .replaceAll('{{MEMORY_CONTEXT}}', memCtx),
            fileGuard,
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
        if (hasAnyFile) {
            delete (tools as any).web_search;
        }
        if (isSystemQuery) {
            const destructiveTools = ['create_project', 'write_file', 'edit_file', 'run_bash', 'run_python', 'install_package', 'start_app', 'stop_app', 'list_apps', 'get_app_logs', 'get_app_url', 'web_search', 'get_weather', 'wiki_search'];
            for (const name of destructiveTools) {
                delete (tools as any)[name];
            }
        }
        if (isSearchQuery) {
            // Research mode: only web_search + read_url allowed (no sandbox/execute tools)
            const allowedResearchTools = new Set(['web_search', 'read_url']);
            for (const name of Object.keys(tools)) {
                if (!allowedResearchTools.has(name)) {
                    delete (tools as any)[name];
                }
            }
        }

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

            // If orchestrator produced no visible text, synthesize a minimal
            // user-facing answer so UI doesn't fall back to “sources only”.
            if (!fullText) {
                const hasSources = agentState.sources.length > 0;
                const hasFiles = agentState.generatedFiles.length > 0;
                const topic = extractTopicFromQuery(query ?? '') || 'your requested document';

                if (hasFiles) {
                    fullText = `I've created your document about "${topic}" based on the research. You can download it below.`;
                } else if (hasSources) {
                    fullText = `I researched "${topic}" and found relevant sources. Please review them in the Sources tab above.`;
                } else {
                    fullText = `I couldn't complete the requested workflow for "${topic}".`;
                }
            }

            // Stream the answer text to the frontend (until now it was only
            // set in fullText but never written to the SSE stream).
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
            attachedFilesText += `[File content]\n${safeFile.slice(0, 100_000)}\n\n`;
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
                        if (isPdfAtt) {
                            parsedContent = await extractPdfTableAware(rawBuf);
                        } else {
                            parsedContent = await extractDocxText(rawBuf);
                        }
                        sendStatus(res, 'parsing_done', `Parsed ${att.name} (${(parsedContent.length / 1024).toFixed(0)} KB text)`, { name: att.name }, agentState.thoughtProcess);
                    }
                }

                attachedFilesText += `[File content: ${att.name}]\n${(parsedContent || '').slice(0, 80_000)}\n\n`;
            }
        }

        const userText = !isVisionModel && imageAttachments.length > 0
            ? `[The user attached ${imageAttachments.length} image(s)]\n\n${videoNotice}${attachedFilesText}${contextQuery}`
            : `${videoNotice}${attachedFilesText}${contextQuery}`;

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

        const messages: any[] = [{ role: 'user', content: userContent }];

        // ── Close detection ──────────────────────────────────────────────
        const closedRef = { v: false };
        req.on('close', () => { closedRef.v = true; });
        let forceSynthesis = false;
        let partialThought = ''; // Buffer for <THOUGHT> blocks that span multiple text-delta chunks
        let synthesisWritten = false; // Suppress model output after fallback synthesis takes over

        // ── LLM streaming (skipped when orchestrator handled the workflow) ──
        if (!orchestratorHandled) {
            const agentStream = streamText({
                model,
                system: dynSys,
                messages,
                tools,
                stopWhen: stepCountIs(10),
                toolChoice: 'auto',
                temperature: 0.35,
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
            // synthesisWritten is declared in outer scope

            // Writes clean text to SSE, handling multi-step repeat dedup.
            function writeClean(clean: string) {
                if (!clean || synthesisWritten) return;
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

            for await (const event of agentStream.fullStream) {
                if (res.writableEnded || closedRef.v || forceSynthesis) break;

                if (event.type === 'tool-call') {
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
                            if (consecutiveSkippedCount >= 3) {
                                console.log(`[STREAM] Too many consecutive skips — forcing answer synthesis`);
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
                                .replace(/<\/?[A-Za-z][A-Za-z0-9]*$/gm, '');
                            if (clean) {
                                writeClean(clean);
                            }
                        }
                    }
                }
            }

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

            // ── Auto-document generation ─────────────────────────────────────
            // When the user asked for a document AND the model searched the web
            // but didn't chain to read_skill + generate_document, we do it here.
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
                    const topic = extractTopicFromQuery(query ?? '') || 'document';
                    const searchUrls = agentState.sources.map((s: any) => s.url).join('\n');
                    const docQuery = `Create a ${docIntent} about: ${topic}`;
                    console.log(`[AUTO-DOC] Generating ${docIntent} for "${topic}" with ${agentState.sources.length} sources`);
                    sendStatus(res, 'reading_skill', `Reading the ${docIntent.toUpperCase()} skill`, undefined, agentState.thoughtProcess);
                    const skillFile = SKILL_REGISTRY[docIntent]?.fileName;
                    const skillContent = skillFile ? await fetchSkillFile(skillFile) : '';
                    sendStatus(res, 'reading_skill_success', `Reading the ${docIntent.toUpperCase()} skill`, undefined, agentState.thoughtProcess);
                    sendStatus(res, 'generating_file', `Building your ${docIntent.toUpperCase()} on "${topic.slice(0, 30)}"...`, undefined, agentState.thoughtProcess);
                    try {
                        const searchContent = agentState.searchContent || `Search results for reference:\n${searchUrls}`;
                        const file = await generateDocumentWithSkill(
                            docIntent as any,
                            docQuery,
                            model,
                            skillContent,
                            searchContent
                        );
                        if (file) {
                            agentState.generatedFiles.push(file);
                            if (!res.writableEnded) {
                                res.write(`event: file\ndata: ${JSON.stringify(file)}\n\n`);
                            }
                            sendStatus(res, 'generating_file_success', `Building your ${docIntent.toUpperCase()} on "${topic.slice(0, 30)}"...`, undefined, agentState.thoughtProcess);
                            const msg = `\n\nI've created a ${docIntent.toUpperCase()} document about "${topic}" based on the search results. You can download it below.`;
                            writeSafeSSE(res, msg);
                            charsSent += msg.length;
                            fullText += msg;
                            if (typeof (res as any).flush === 'function') (res as any).flush();
                        } else {
                            sendStatus(res, 'generating_file_error', `Failed to build ${docIntent.toUpperCase()}`, undefined, agentState.thoughtProcess);
                        }
                    } catch (e: any) {
                        console.warn('[AUTO-DOC] generation failed:', e?.message);
                        sendStatus(res, 'generating_file_error', `Failed to build ${docIntent.toUpperCase()}: ${e.message}`, undefined, agentState.thoughtProcess);
                    }
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
            const shouldSynthesize = (forceSynthesis || !charsSent || (isUrlOnly && charsSent < 300) || (fullText.trim().length < 100 && hadSources)) && hadSources && !res.writableEnded;

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

                // Also include the user's file if they attached one (this is the key fix
                // for "searched user's code then got no answer" situations)
                const fileCtx = safeFile
                    ? `\n\nUser's attached file content:\n${safeFile.slice(0, 16000)}`
                    : safeAtt.filter(f => f.content && !f.type?.startsWith('image/')).length > 0
                        ? `\n\nUser's attached files:\n${safeAtt.filter(f => f.content && !f.type?.startsWith('image/')).map(f => `[${f.name}]\n${(f.content ?? '').slice(0, 12000)}`).join('\n\n')}`
                        : '';

                const combinedContext = [searchText, fileCtx].filter(Boolean).join('\n\n');

                if (combinedContext.trim()) {
                    try {
                        const synthRes = await generateText({
                            model,
                            system: `You are a research analyst. Produce a comprehensive, structured, detail-rich answer.

RULES:
- ORGANIZE with sections, tables, bullet points, and bold highlights. Use markdown tables (with | pipes) when comparing items.
- Include SPECIFIC details: names, numbers, dates, fees, URLs, course codes — every fact you can extract from the context.
- Cite sources inline as [source-name](url) when the URL is available in the search results.
- Use tables for comparison: specializations side-by-side, semester-wise course lists, fee structures, etc.
- NEVER say "based on the search results" or "according to the sources". State facts directly.
- Be exhaustive, not generic. If the context has 30 sources, use ALL of them.
- If the context is insufficient for a detail, state what's available rather than making up data.
${fileCtx ? '\nThe user attached a file — analyze it directly and answer from the file content.' : ''}`,
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

        // ── Clean text for DB (remove <FOLLOW_UPS> block) ───────────────
        const cleanAnswer = fullText
            .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, '')
            .replace(/<FOLLOW_UPS>[\s\S]*/gi, '')
            .trim();

        // ── Save to database ─────────────────────────────────────────────
        let savedMid: string | null = null;
        if (cleanAnswer || agentState.generatedFiles.length) {
            try {
                const convExists = await prisma.conversation.findUnique({
                    where: { id: activeConversationId }, select: { id: true },
                });
                if (convExists) {
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
                    savedMid = created.id.toString();
                    if (!isFollowUp) autoRenameConversation(activeConversationId, nq).catch(() => { });
                    if (memEnabled && cleanAnswer) {
                        extractMemories([{ role: 'user', content: nq }, { role: 'assistant', content: cleanAnswer }], uid, activeConversationId, model)
                            .then(() => pruneMemories(uid))
                            .catch(e => console.warn('[MEMORY]', e));
                    }

                    // ── Wiki graph extraction (async, non-blocking) ────
                    if (cleanAnswer && activeConversationId && uid) {
                        wikiManager.updateGraph(uid, cleanAnswer, nq)
                            .then(result => {
                                if (result && !res.writableEnded) {
                                    res.write(`event: wiki_update\ndata: ${JSON.stringify(result)}\n\n`);
                                }
                            })
                            .catch(e => console.warn('[WIKI]', e));
                    }
                }
            } catch (dbe: any) {
                if (dbe?.code !== 'P2025') console.error('DB save error:', dbe?.message ?? dbe);
            }
        }

        if (savedMid && !res.writableEnded) {
            res.write(`event: message_id\ndata: ${JSON.stringify({ id: savedMid })}\n\n`);
        }
        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }

        console.log(
            `[ASK] uid=${uid} chars=${charsSent} ` +
            `sources=${agentState.sources.length} files=${agentState.generatedFiles.length}`
        );

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
app.post('/api/chat-sdk', middleware, async (req: any, res: any) => {
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

        const memCtx = '';
        const dynSys = [
            SYSTEM_PROMPT.replaceAll('{{CURRENT_DATETIME}}', nowStr).replaceAll('{{LOCATION_INFO}}', locInfo).replaceAll('{{MEMORY_CONTEXT}}', memCtx),
            AGENT_SYSTEM_EXTENSION,
        ].join('\n\n');

        const messages: any[] = [{ role: 'user', content: nq }];

        const result = streamText({
            model,
            system: dynSys,
            messages,
            tools,
            stopWhen: stepCountIs(10),
            toolChoice: 'auto',
            temperature: 0.35,
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

// ─── DELETE CONVERSATION ────────────────────────────────────
app.delete("/conversations/:conversationId", middleware, async (req, res) => {
    try {
        const appUserId = req.appUserId!;
        const conversationId = req.params.conversationId as string;
        if (!conversationId) return res.status(400).json({ message: "conversationId is required" });
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: appUserId },
        });
        if (!conversation) return res.status(404).json({ message: "Conversation not found" });
        await prisma.$transaction([
            prisma.message.deleteMany({ where: { conversationId } }),
            prisma.conversation.delete({ where: { id: conversationId } }),
        ]);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Delete conversation error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ── TTS PROXY ──────────────────────────────────────────────
app.post("/api/tts/local", middleware, async (req, res) => {
    try {
        const { text } = req.body as { text?: string };
        if (!text) return res.status(400).json({ error: "text is required" });
        const safeText = text.slice(0, 5000);

        const { ensureModel, findPiperBinary, synthesizeToWav } = await import('./tts-local');
        const piperPath = findPiperBinary();
        if (!piperPath) {
            return res.status(500).json({
                error: "Piper TTS binary not found. Download it from https://github.com/rhasspy/piper/releases and place piper.exe in backend/tts/ or add it to PATH."
            });
        }

        const wav = await synthesizeToWav(safeText, piperPath);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', wav.length);
        res.end(wav);
    } catch (error: any) {
        console.error("Local TTS error:", error);
        if (!res.headersSent) res.status(500).json({ error: error.message || "Local TTS failed" });
    }
});

// ════════════════════════════════════════════════════════════
//   NEWS — HackerNews Firebase API + RSS
// ════════════════════════════════════════════════════════════

type NewsItemType = {
    title: string; url: string; content: string;
    publishedDate: string; source: string;
};

function withTimeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
}

const rssCache = new Map<string, { articles: NewsItemType[]; ts: number }>();
const RSS_CACHE_TTL = 2 * 60 * 1000;

async function fetchRSSCached(url: string, sourceName: string, limit = 20): Promise<NewsItemType[]> {
    const cached = rssCache.get(url);
    if (cached && Date.now() - cached.ts < RSS_CACHE_TTL) {
        return cached.articles.slice(0, limit);
    }
    const articles = await fetchRSS(url, sourceName, limit);
    if (articles.length > 0) rssCache.set(url, { articles, ts: Date.now() });
    return articles;
}

async function fetchHackerNews(limit = 18): Promise<NewsItemType[]> {
    try {
        const idsRes = await fetch(
            "https://hacker-news.firebaseio.com/v0/topstories.json",
            { signal: withTimeout(8000) }
        );
        if (!idsRes.ok) throw new Error(`HN list: ${idsRes.status}`);
        const ids = (await idsRes.json()) as number[];
        const items = await Promise.allSettled(
            ids.slice(0, limit).map(id =>
                fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: withTimeout(5000) })
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            )
        );
        return items
            .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && !!(r.value as any)?.url)
            .map(({ value: v }) => ({
                title: v.title,
                url: v.url,
                content: `${(v.score ?? 0).toLocaleString()} points · ${v.descendants ?? 0} comments on Hacker News`,
                publishedDate: new Date((v.time ?? Date.now() / 1000) * 1000).toISOString(),
                source: getDomain(v.url),
            }));
    } catch (e) {
        console.warn("[NEWS] HackerNews fetch failed:", (e as Error).message);
        return [];
    }
}

function decodeHTMLEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function stripHTML(str: string): string {
    return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractRSSField(xml: string, tag: string): string {
    const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
    const cm = xml.match(cdataRe);
    if (cm) return cm[1]!.trim();
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1]!.trim() : '';
}

function parseRSSFeed(xml: string, defaultSource: string): NewsItemType[] {
    const results: NewsItemType[] = [];
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
        const item = m[1]!;
        const title = decodeHTMLEntities(stripHTML(extractRSSField(item, 'title'))).slice(0, 200);
        const link = extractRSSField(item, 'link') || extractRSSField(item, 'guid');
        const pubDate = extractRSSField(item, 'pubDate');
        const desc = decodeHTMLEntities(stripHTML(extractRSSField(item, 'description'))).slice(0, 400);
        const srcM = item.match(/<source[^>]+url="([^"]+)"/i);
        const source = srcM?.[1] ? getDomain(srcM[1]) : defaultSource;
        if (!title || !link) continue;
        try {
            results.push({
                title,
                url: link,
                content: desc || `From ${defaultSource}`,
                publishedDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                source,
            });
        } catch { /* skip malformed dates */ }
    }
    return results;
}

async function fetchRSS(url: string, sourceName: string, limit = 20): Promise<NewsItemType[]> {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FluxNews/2.0; +https://flux.app)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                'Cache-Control': 'no-cache',
            },
            signal: withTimeout(10000),
        });
        if (!res.ok) throw new Error(`${sourceName}: ${res.status}`);
        const xml = await res.text();
        const items = parseRSSFeed(xml, sourceName).slice(0, limit);
        console.log(`[NEWS] RSS ${sourceName} → ${items.length} items`);
        return items;
    } catch (e) {
        console.warn(`[NEWS] RSS ${sourceName} failed:`, (e as Error).message);
        return [];
    }
}

type NewsFetcher = () => Promise<NewsItemType[]>;

const BBC = 'https://feeds.bbci.co.uk/news';
const NPR = 'https://feeds.npr.org';

const CATEGORY_FETCHERS: Record<string, NewsFetcher[]> = {
    all: [
        () => fetchRSSCached(`${BBC}/rss.xml`, 'BBC News', 15),
        () => fetchHackerNews(12),
        () => fetchRSSCached(`${NPR}/1001/rss.xml`, 'NPR', 10),
        () => fetchRSSCached('https://feeds.reuters.com/reuters/topNews', 'Reuters', 10),
        () => fetchRSSCached('https://rss.cnn.com/rss/edition.rss', 'CNN', 10),
    ],
    world: [
        () => fetchRSSCached(`${BBC}/world/rss.xml`, 'BBC World', 15),
        () => fetchRSSCached('https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera', 12),
        () => fetchRSSCached('https://feeds.reuters.com/Reuters/worldNews', 'Reuters World', 10),
    ],
    tech: [
        () => fetchHackerNews(20),
        () => fetchRSSCached(`${BBC}/technology/rss.xml`, 'BBC Tech', 10),
        () => fetchRSSCached('https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica', 10),
        () => fetchRSSCached('https://www.wired.com/feed/rss', 'Wired', 8),
    ],
    business: [
        () => fetchRSSCached(`${BBC}/business/rss.xml`, 'BBC Business', 15),
        () => fetchRSSCached(`${NPR}/1006/rss.xml`, 'NPR Economy', 10),
        () => fetchRSSCached('https://feeds.reuters.com/reuters/businessNews', 'Reuters Business', 10),
    ],
    science: [
        () => fetchRSSCached(`${BBC}/science_and_environment/rss.xml`, 'BBC Science', 15),
        () => fetchRSSCached('https://www.sciencedaily.com/rss/all.xml', 'ScienceDaily', 10),
        () => fetchRSSCached('https://www.nasa.gov/rss/dyn/breaking_news.rss', 'NASA', 8),
    ],
    politics: [
        () => fetchRSSCached(`${BBC}/politics/rss.xml`, 'BBC Politics', 15),
        () => fetchRSSCached(`${NPR}/1014/rss.xml`, 'NPR Politics', 10),
        () => fetchRSSCached('https://feeds.reuters.com/Reuters/PoliticsNews', 'Reuters Politics', 10),
    ],
};

function detectCategoryKey(query: string): string {
    const q = (query || "").toLowerCase();
    if (!q || /latest.*breaking|breaking.*news|top.*news/.test(q)) return "all";
    if (/tech|technology|ai|software|digital|cyber|hack/.test(q)) return "tech";
    if (/business|economy|finance|market|trade|stock/.test(q)) return "business";
    if (/science|research|discovery|space|climate|biology/.test(q)) return "science";
    if (/politic|government|election|policy|parliament|senate/.test(q)) return "politics";
    if (/world|international|global|foreign/.test(q)) return "world";
    return "all";
}

app.get("/news", middleware, async (req, res) => {
    try {
        const categoryParam = (req.query.category as string) || "";
        const key = detectCategoryKey(categoryParam);
        const fetchers = CATEGORY_FETCHERS[key] || CATEGORY_FETCHERS["all"]!;

        const batches = await Promise.all(fetchers.map(fn => fn().catch(() => [] as NewsItemType[])));

        const seen = new Set<string>();
        const merged: NewsItemType[] = [];
        for (const batch of batches) {
            for (const item of batch) {
                if (item.title && item.url && !seen.has(item.url)) {
                    seen.add(item.url);
                    merged.push(item);
                }
            }
        }

        merged.sort((a, b) =>
            new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
        );

        console.log(`[NEWS] key="${key}" sources=${fetchers.length} results=${merged.length}`);
        res.json({ news: merged.slice(0, 30) });
    } catch (e) {
        console.error("[NEWS] Endpoint error:", e);
        res.status(500).json({ message: "Failed to fetch news" });
    }
});

app.get("/news/search", middleware, async (req: any, res: any) => {
    const q = ((req.query.q as string) || "").trim();
    if (!q || q.length < 2) {
        return res.status(400).json({ error: "query too short" });
    }
    console.log(`[NEWS SEARCH] query="${q}"`);

    try {
        const result = await client.search(q, {
            searchDepth: "basic",
            topic: "news",
            days: 3,
            maxResults: 20,
            includeAnswer: false,
            includeRawContent: false,
        });

        const articles: NewsItemType[] = (result.results ?? []).map((r: any) => ({
            title: (r.title ?? "").slice(0, 200),
            url: r.url ?? "",
            content: (r.content ?? r.snippet ?? "").slice(0, 400),
            publishedDate: r.publishedDate ?? new Date().toISOString(),
            source: r.url ? getDomain(r.url) : "Unknown",
        })).filter((a: NewsItemType) => a.title && a.url);

        console.log(`[NEWS SEARCH] "${q}" → ${articles.length} results`);
        res.json({ news: articles });
    } catch (e: any) {
        console.error("[NEWS SEARCH] Error:", e?.message ?? e);
        res.status(500).json({ error: "Search failed" });
    }
});

// ── AI ARTICLE SUMMARY ──────────────────────────────────────
app.post("/summarize", middleware, async (req: any, res: any) => {
    const { url, title, content } = req.body ?? {};
    if (!title && !content) {
        return res.status(400).json({ error: "title or content required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    console.log(`[SUMMARIZE] title="${String(title).slice(0, 60)}" url=${url ?? "—"}`);

    try {
        let fullContent = content || "";

        if (url) {
            try {
                console.log(`[SUMMARIZE] Attempting content extraction for: ${url}`);
                const extractResult = await client.extract([url]);
                const firstResult = extractResult?.results?.[0];
                if (firstResult?.rawContent) {
                    fullContent = firstResult.rawContent;
                    console.log(`[SUMMARIZE] Successfully extracted ${fullContent.length} chars`);
                }
            } catch (extractErr) {
                console.warn("[SUMMARIZE] Tavily extraction failed, falling back to provided content.", extractErr);
            }
        }

        const system = `... (system prompt) ...`;

        const userMsg = [
            `Title: ${title}`,
            url ? `Source URL: ${url}` : "",
            "",
            "Full article text (use every detail you can find):",
            String(fullContent).slice(0, 15000),
        ].filter(Boolean).join("\n");

        const model = nim.chatModel('meta/llama-4-maverick-17b-128e-instruct');
        const result = streamText({
            model,
            system,
            messages: [{ role: "user", content: userMsg }],
            maxTokens: 1800,
            temperature: 0.2,
        } as any);

        let charsSent = 0;
        for await (const chunk of result.textStream) {
            if (res.writableEnded) break;
            writeSafeSSE(res, chunk);
            charsSent += chunk.length;
            if (typeof (res as any).flush === "function") (res as any).flush();
        }

        console.log(`[SUMMARIZE] done — ${charsSent} chars streamed`);
        if (!res.writableEnded) {
            res.write("data: [DONE]\n\n");
            res.end();
        }
    } catch (e: any) {
        console.error("[SUMMARIZE] Error:", e?.message ?? e);
        if (!res.writableEnded) {
            writeSafeSSE(res, "\n[Summary unavailable — please read the full article]");
            res.write("data: [DONE]\n\n");
            res.end();
        }
    }
});

// ── ARTICLE PROXY ────────────────────────────────────────────
app.get("/proxy", middleware, async (req: any, res: any) => {
    const rawUrl = ((req.query.url as string) ?? "").trim();
    if (!rawUrl) return res.status(400).json({ error: "url required" });

    let parsed: URL;
    try { parsed = new URL(rawUrl); }
    catch { return res.status(400).json({ error: "invalid url" }); }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).json({ error: "invalid protocol" });
    }

    console.log(`[PROXY] ${parsed.hostname}${parsed.pathname.slice(0, 80)}`);

    try {
        const upstream = await fetch(rawUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "identity",
                "Cache-Control": "no-cache",
            },
            redirect: "follow",
        });

        const contentType = upstream.headers.get("content-type") ?? "text/html; charset=utf-8";

        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
            const buf = await upstream.arrayBuffer();
            res.setHeader("Content-Type", contentType);
            res.removeHeader("X-Frame-Options");
            res.removeHeader("Content-Security-Policy");
            res.setHeader("Content-Security-Policy", "frame-ancestors *");
            return res.status(upstream.status).send(Buffer.from(buf));
        }

        let html = await upstream.text();
        const base = `${parsed.protocol}//${parsed.host}`;

        html = html.replace(
            /<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, ""
        );
        html = html.replace(
            /<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, ""
        );

        const baseTag =
            `<base href="${base}/" target="_blank">` +
            `<style>` +
            `*{max-width:100%!important;box-sizing:border-box!important}` +
            `img,video{height:auto!important}` +
            `body{padding:16px!important;font-family:system-ui,sans-serif}` +
            `[class*="cookie"],[id*="cookie"],[class*="consent"],[id*="consent"],` +
            `[class*="gdpr"],[id*="gdpr"],[class*="paywall"],[class*="popup"],[class*="modal"]{` +
            `display:none!important}` +
            `</style>`;

        if (/<head[\s>]/i.test(html)) {
            html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
        } else {
            html = baseTag + html;
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "no-store");
        res.removeHeader("X-Frame-Options");
        res.removeHeader("Content-Security-Policy");
        res.removeHeader("Content-Security-Policy-Report-Only");
        res.setHeader("Content-Security-Policy", "frame-ancestors *");

        console.log(`[PROXY] OK ${upstream.status} ${parsed.hostname}`);
        return res.status(200).send(html);
    } catch (e: any) {
        console.error("[PROXY] fetch error:", e?.message ?? e);
        const errorHtml = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:32px;color:#888;text-align:center">
            <p style="font-size:14px">Unable to load article preview.</p>
            <a href="${rawUrl}" target="_blank" rel="noopener noreferrer"
               style="color:#C4502A;font-size:13px">Open in new tab →</a>
        </body></html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.removeHeader("X-Frame-Options");
        res.setHeader("Content-Security-Policy", "frame-ancestors *");
        return res.status(200).send(errorHtml);
    }
});

// ── ARTICLE PREVIEW (text snippet) ──────────────────────────
app.get("/preview", middleware, async (req: any, res: any) => {
    const rawUrl = ((req.query.url as string) ?? "").trim();
    if (!rawUrl) return res.status(400).json({ error: "url required" });
    let parsed: URL;
    try { parsed = new URL(rawUrl); }
    catch { return res.status(400).json({ error: "invalid url" }); }
    if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "invalid protocol" });
    try {
        const upstream = await fetch(rawUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            redirect: "follow", signal: AbortSignal.timeout(5000),
        });
        const html = await upstream.text();
        const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || parsed.hostname.replace("www.", "");

        // Strip tags and extract first meaningful paragraph
        const body = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ").trim();
        const sentences = body.split(/[.!?]\s+/).filter(s => s.trim().length > 40);
        const snippet = (sentences[0] || body.slice(0, 300)).slice(0, 300).trim() + (body.length > 300 ? "..." : "");

        res.json({ title, snippet, url: rawUrl });
    } catch (e: any) {
        console.error("[PREVIEW] error:", e?.message);
        res.json({ title: parsed.hostname.replace("www.", ""), snippet: "", url: rawUrl });
    }
});

// ── MODEL DISCOVERY ──────────────────────────────────────────
const AVAILABLE_MODELS = [
    {
        category: "General Purpose", models: [
            { id: "mistral-large-675b", label: "Mistral Large 3 675B (Mistral AI)" },
            { id: "glm-5.1", label: "GLM 5.1 (Z‑AI)" },
            { id: "kimi-k2.6", label: "Kimi K2.6 (Moonshot AI)" },
            { id: "nemotron-3-ultra-550b", label: "Nemotron 3 Ultra 550B (NVIDIA)" },
            { id: "mistral-medium-3.5-128b", label: "Mistral Medium 3.5 128B (Mistral AI)" },
            { id: "nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B (NVIDIA)" },
            { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash (DeepSeek)" },
            { id: "qwen3.5-397b-a17b", label: "Qwen 3.5 397B (Qwen)" },
            { id: "minimax-m2.7", label: "MiniMax M2.7 (MiniMax)" },
            { id: "minimax-m3", label: "MiniMax M3 (MiniMax)" },
            { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (DeepSeek)" },
            { id: "sarvam-m", label: "Sarvam-M (Sarvam AI)" },
            { id: "stockmark-2-100b-instruct", label: "Stockmark 2 100B (Stockmark)" },
            { id: "nemotron-nano-12b-v2-vl", label: "Nemotron Nano 12B v2 VL (NVIDIA)" },
            { id: "sarvamai", label: "Sarvamai (Sarvamai)" },
        ]
    },
    {
        category: "Reasoning & Agents", models: [
            { id: "step-3.7-flash", label: "Step 3.7 Flash (StepFun)" },
            { id: "step-3.5-flash", label: "Step 3.5 Flash (StepFun)" },
            { id: "nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B Reasoning (NVIDIA)" },
        ]
    },
];

app.get("/api/models", (_req, res) => {
    res.json({ categories: AVAILABLE_MODELS, all: AVAILABLE_MODELS.flatMap((c) => c.models) });
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
            maxTools: 10,
            maxSteps: 8,
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
(async () => {
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

// Attach Agent Protocol WebSocket handler
createAgentWebSocket(server);

const proto = server instanceof https.Server ? "https" : "http";
server.listen(3001, () => { console.log(`Flux backend running on ${proto}://localhost:3001`); });