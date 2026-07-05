// index.ts – Full Pipeline Implementation (Complete & Optimized)
import { tavily } from '@tavily/core';
import express from "express";
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
import { prisma } from "./db";
import { Prisma } from "./prisma/generated/client";
import { middleware } from './middleware';
import { nim } from './nim-client';
import { buildPPTX, buildDOCX, buildPDF, buildXLSX, buildCSV, buildTSV, buildMD, buildJSON, buildSQL, buildHTML } from './agent-tools';
import type { GeneratedFileResult } from './agent-tools';
import { retrieveMemories, getRecentMemories, extractMemories, buildMemoryContext, pruneMemories } from './memory';
import { compactConversation } from './compaction';
import { toolRegistry } from './tool-registry';
import http from "http";
import https from "https";
import compression from "compression";
import { syncManager } from './sync';
import type { SyncEvent } from './sync';
import { initGoogleAuth, handleGoogleCallback, getGoogleStatus, disconnectGoogle } from './google-auth';
import { createGoogleTools } from './google-tools';
import { chunkByHeadings } from './lib/chunking';
import type { PageData } from './lib/chunking';
import { retrieveDocChunks } from './lib/hybrid-retrieval';
import { createAgentWebSocket } from './agent-protocol';
import { codeExecutor } from './tools/codeExecutor';
import { sandboxManager } from './sandbox/sandboxManager';
import { wikiManager } from './wiki/wikiManager';
import { isModelHealthy, recordFailure, recordSuccess, getShortTimeout } from './model-health';
import { taskRouter, recoverInterruptedTasks } from './task-routes';
import { classifyTaskIntent } from './task-detector';
import { planTask, runTaskLoop } from './task-loop';
import { createSupabaseClient } from "./client";

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

// ── Compression (gzip/brotli) ─────────────────────────────
app.use(compression({ level: 6, threshold: 512 }));

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
app.use(express.json({ limit: '50mb' }));

// ── SSE connection tracking & token re-validation ─────────
const MAX_SSE_PER_USER = 5;
const SSE_REVALIDATE_MS = 60_000;
const supabaseAdmin = createSupabaseClient();
const sseConnections = new Map<string, Set<any>>();

function trackSseConnection(uid: string, req: any, res: any) {
  if (!sseConnections.has(uid)) sseConnections.set(uid, new Set());
  const conns = sseConnections.get(uid)!;
  if (conns.size >= MAX_SSE_PER_USER) {
    conns.forEach(c => { try { c.end(); } catch {} });
    conns.clear();
  }
  conns.add(res);
  const token = req.headers.authorization?.replace('Bearer ', '');
  const revalidateTimer = setInterval(async () => {
    if (res.writableEnded) { clearInterval(revalidateTimer); return; }
    if (!token) { res.end(); return; }
    try {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) { res.end(); }
    } catch { res.end(); }
  }, SSE_REVALIDATE_MS);
  req.on('close', () => {
    clearInterval(revalidateTimer);
    conns.delete(res);
    if (conns.size === 0) sseConnections.delete(uid);
  });
}

// ── Magic byte detection ──────────────────────────────────
const MAGIC_BYTES: [RegExp, string][] = [
  [/^\/9j[0-9A-Za-z]/, 'image/jpeg'],
  [/^iVBORw0KGgo/, 'image/png'],
  [/^R0lGOD/, 'image/gif'],
  [/^UklGR/, 'image/webp'],
  [/^J0lEQVQ/, 'image/avif'],
  [/^Qk0/, 'image/bmp'],
  [/^PHN2Zy/, 'image/svg+xml'],
  [/^JVBERi0/, 'application/pdf'],
  [/^UEsDBBQ/, 'application/zip'],
  [/^UEsDBBAB/, 'application/vnd.openxmlformats-officedocument'],
  [/^UEsDBAo/, 'application/x-tar'],
];
function detectMimeFromBase64(b64: string): string | null {
  const sig = b64.slice(0, 10);
  for (const [pattern, mime] of MAGIC_BYTES) {
    if (pattern.test(sig)) return mime;
  }
  return null;
}

// ── SSRF prevention ────────────────────────────────────────
import * as dns from "dns";
const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
];
function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === 'localhost.localdomain' || lower === '0.0.0.0') return true;
  if (PRIVATE_IP_PATTERNS.some(p => p.test(lower))) return true;
  return false;
}
async function checkSsrFree(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname;
    if (isPrivateHostname(hostname)) return false;
    const { address } = await dns.promises.lookup(hostname, { family: 4 }).catch(() => ({ address: '' }));
    if (address && isPrivateHostname(address)) return false;
    return true;
  } catch { return false; }
}

// ── Rate limiters ──────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10, message: { error: "Too many requests" },
  keyGenerator: (req: any) => req.appUserId || req.ip,
});
const newConvLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, message: { error: "Too many new threads" },
  keyGenerator: (req: any) => req.appUserId || req.ip,
});

app.use(globalLimiter);

// ── Cross-device sync (Supabase Realtime Broadcast) ─────────
function broadcastSyncEvent(supabaseUserId: string, payload: SyncEvent) {
  syncManager.broadcast(supabaseUserId, payload).catch((e: unknown) => {
    console.error('[SYNC] Broadcast error:', (e as Error)?.message || e);
  });
}

// ─── DIAGNOSTICS & SYSTEM ──────────────────────────────────
// ── Google OAuth callback (no auth middleware — called by Google redirect) ──
app.get('/api/integrations/google/callback', handleGoogleCallback);

app.get("/ping", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});

// ── Google OAuth protected routes ──────────────────────────────────
app.post('/api/integrations/google/init', middleware, initGoogleAuth);
app.get('/api/integrations/google/status', middleware, getGoogleStatus);
app.post('/api/integrations/google/disconnect', middleware, disconnectGoogle);

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
if (!process.env.HEALTH_SECRET) {
    throw new Error("FATAL: Missing HEALTH_SECRET environment variable.");
}
const HEALTH_SECRET = process.env.HEALTH_SECRET;

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
        const list = ["step-3.7-flash", "kimi-k2.6"];
        for (const key of Object.keys(modelsMap)) {
            if (key !== prefId && key !== "kimi-k2.6" && key !== "step-3.7-flash") {
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
                    const FIRST_TOKEN_TIMEOUT = 30000;
                    try {
                        console.log(`[MODEL FALLBACK] Trying primary model stream: ${preferredModelId || target.modelId}`);
                        const result = await Promise.race([
                            target.doStream(options),
                            new Promise<any>((_, reject) =>
                                setTimeout(() => reject(new Error(`[TIMEOUT] ${preferredModelId || 'primary'} no response within ${FIRST_TOKEN_TIMEOUT}ms`)), FIRST_TOKEN_TIMEOUT)
                            ),
                        ]);
                        return result;
                    } catch (primaryError: any) {
                        if (primaryError.message?.includes('[TIMEOUT]')) {
                            console.warn(`[MODEL FALLBACK] Primary model ${preferredModelId || 'primary'} timed out (>${FIRST_TOKEN_TIMEOUT}ms) — falling back`);
                        } else {
                            console.warn(`[MODEL FALLBACK] Primary model stream failed:`, primaryError?.message ?? primaryError);
                        }
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
    let deglitched = content;
    const cjkGlitchRe = /([a-zA-Z\u2019\s,.'!?;:()\-–])([\u4e00-\u9fff\u3040-\u30ff\u30a0-\u30ff\uff00-\uffef]{1,8})([a-zA-Z\s,.'!?;:()\-–])/g;
    let prev = '';
    while (prev !== deglitched) {
        prev = deglitched;
        deglitched = deglitched.replace(cjkGlitchRe, '$1$3');
    }
    const normalized = deglitched.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const escaped = normalized.replace(/\n/g, '\ndata: ');
    res.write(`data: ${escaped}\n\n`);
}

function writeReplaceText(res: any) {
    if (res.writableEnded) return;
    res.write(`event: replace_text\ndata: {}\n\n`);
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

// ── File analysis helpers (used by synthesis path) ──────────────────────────

type FileCategory = 'code' | 'document' | 'data' | 'config';

function detectFileCategory(name: string, content: string): FileCategory {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['ts','tsx','js','jsx','py','go','rs','java','c','cpp','cs','rb','php','swift','kt','vue','svelte'].includes(ext)) return 'code';
    if (['json','jsonl','csv','tsv','xml','yaml','yml','toml'].includes(ext)) return 'data';
    if (['env','sh','bash','zsh','dockerfile','makefile'].includes(ext) || name.toLowerCase().startsWith('.env')) return 'config';
    if (['md','txt','html','htm','rst','tex'].includes(ext)) return 'document';
    const snip = content.slice(0, 200).trim();
    if (snip.startsWith('{') || snip.startsWith('[')) return 'data';
    if (/\b(function|const|class|import|export|def |fn |pub fn)\b/.test(snip)) return 'code';
    return 'document';
}

function extractCodeSymbols(content: string, maxSymbols = 45): string {
    const lines = content.split('\n');
    const importLines: string[] = [];
    const symbols: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 1200); i++) {
        const line = (lines[i] ?? '').trim();
        if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('#')) continue;

        // Imports — first 25 lines only, cap at 6
        if (i < 25 && importLines.length < 6 &&
            (line.startsWith('import ') || line.startsWith('from ') || /^const .* = require/.test(line))) {
            importLines.push(`  ${line.slice(0, 90)}`);
            continue;
        }
        // Express/Hono routes
        const route = line.match(/(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s]+)/);
        if (route && route[1] && route[2]) { symbols.push(`  route  ${route[1].toUpperCase().padEnd(6)} ${route[2]} — line ${i + 1}`); continue; }
        // Classes
        const cls = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
        if (cls) { symbols.push(`  class  ${cls[1]} — line ${i + 1}`); continue; }
        // Interfaces / Types
        const iface = line.match(/^(?:export\s+)?(?:interface|type)\s+(\w+)/);
        if (iface) { symbols.push(`  type   ${iface[1]} — line ${i + 1}`); continue; }
        // Named functions
        const fn = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (fn) { symbols.push(`  fn     ${fn[1]} — line ${i + 1}`); continue; }
        // Arrow / const lambdas (camelCase only)
        const arrow = line.match(/^(?:export\s+)?const\s+([a-z]\w+)\s*(?::[^=]+)?\s*=\s*(?:async\s+)?\(/);
        if (arrow) { symbols.push(`  fn     ${arrow[1]} — line ${i + 1}`); continue; }
        // React / PascalCase components
        const comp = line.match(/^(?:export\s+)?(?:default\s+)?(?:const|function)\s+([A-Z]\w+)/);
        if (comp) { symbols.push(`  cmp    ${comp[1]} — line ${i + 1}`); continue; }
    }

    const parts: string[] = [];
    if (importLines.length) parts.push('Imports:\n' + importLines.join('\n'));
    if (symbols.length) parts.push('Symbols:\n' + symbols.slice(0, maxSymbols).join('\n'));
    return parts.join('\n');
}

function scoreSectionRelevance(sectionText: string, query: string): number {
    const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const lower = sectionText.toLowerCase();
    return words.reduce((acc, w) => acc + (lower.split(w).length - 1), 0);
}

/**
 * Converts raw file data into a structured, section-labeled representation
 * that mirrors careful sequential file reading:
 *   metadata → structural outline → header section → query-relevant body → tail
 */
function buildStructuredFileContext(
    files: Array<{ name: string; content: string }>,
    query: string,
    totalBudget = 36_000,
    onStatus?: (filename: string, section: string) => void
): string {
    if (!files.length) return '';
    const perFile = Math.floor(totalBudget / files.length);
    const out: string[] = [];

    for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        if (!file) continue;
        const { name, content } = file;
        if (!content?.trim()) continue;

        const lines = content.split('\n');
        const n = lines.length;
        const kb = (content.length / 1024).toFixed(1);
        const cat = detectFileCategory(name, content);

        onStatus?.(name, 'outline');

        // ── File banner ───────────────────────────────────────────────────
        out.push(`━━━ FILE ${fi + 1}/${files.length}: ${name}  (${n} lines · ${kb} KB · ${cat}) ━━━`);

        // ── Structural outline (code only) ────────────────────────────────
        if (cat === 'code') {
            const symbols = extractCodeSymbols(content);
            if (symbols) out.push(`OUTLINE (auto-extracted):\n${symbols}`);
        }

        const budget = Math.max(perFile - 600, 4000); // 600 chars reserved for labels/outline

        if (content.length <= budget) {
            // Small enough: include the whole file verbatim
            onStatus?.(name, 'full');
            out.push(`[FULL CONTENT · lines 1–${n}]\n${content}`);
        } else {
            // Strategic 3-section sampling ─────────────────────────────────
            const secBudget = Math.floor(budget / 3);

            // Section 1 — Header/Imports (first ~15 %, max 100 lines)
            onStatus?.(name, 'section 1/3: header/imports');
            const s1End = Math.min(Math.ceil(n * 0.15), 100);
            out.push(
                `[SECTION 1/3 · Header / Imports · lines 1–${s1End}]\n` +
                lines.slice(0, s1End).join('\n').slice(0, secBudget)
            );

            // Section 2 — Query-relevant body chunk
            onStatus?.(name, 'section 2/3: query-relevant body');
            const bodyStart = s1End;
            const bodyEnd = Math.floor(n * 0.85);
            const step = 80;
            let bestScore = -1, bestStart = bodyStart;
            for (let c = bodyStart; c < bodyEnd - step; c += step) {
                const score = scoreSectionRelevance(lines.slice(c, c + step).join('\n'), query);
                if (score > bestScore) { bestScore = score; bestStart = c; }
            }
            const s2End = Math.min(bestStart + 140, bodyEnd);
            out.push(
                `[SECTION 2/3 · Most relevant to query · lines ${bestStart + 1}–${s2End}]\n` +
                lines.slice(bestStart, s2End).join('\n').slice(0, secBudget)
            );

            // Section 3 — Tail/Exports (last ~10 %, max 80 lines)
            onStatus?.(name, 'section 3/3: tail/exports');
            const s3Start = Math.max(n - 80, s2End);
            if (s3Start < n) {
                out.push(
                    `[SECTION 3/3 · Tail / Exports · lines ${s3Start + 1}–${n}]\n` +
                    lines.slice(s3Start).join('\n').slice(0, secBudget)
                );
            }

            const shownLines = s1End + (s2End - bestStart) + (n - s3Start);
            const skipped = n - shownLines;
            if (skipped > 30) {
                out.push(
                    `[⚠ ${skipped} lines in mid-body not shown here — ` +
                    `full file was passed to the primary model context.]`
                );
            }
        }

        out.push(`━━━ END: ${name} ━━━`);
    }

    return out.join('\n\n');
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

CRITICAL — FILE LOCATIONS:
  - User-uploaded files are ALWAYS at /home/user/uploads/<filename>. NEVER edit files here — they are read-only originals.
  - To edit an uploaded file, FIRST copy it to /home/user/edits/<filename> using run_bash (cp /home/user/uploads/<file> /home/user/edits/<file>), then edit the copy in /home/user/edits/.
  - Your own created files go to /home/user/<filename>.
  - write_file, read_file, edit_file, and run_bash all share the SAME filesystem under /home/user/ — no cd needed.
  - If you're unsure what files exist, run list_files({ path: "/home/user/uploads/" }) to see uploaded files, or list_files({ path: "/home/user/edits/" }) to see files in progress.

CRITICAL — NEVER install packages (npm install, pip install, apt, etc.). Everything needed is pre-installed.
CRITICAL — NEVER run useless commands like "which", "echo", "ls", "cd", "pwd", "type", "--version", "npx <tool> --version", "tsc --noEmit", or any "2>&1 || true" error suppression. Jump straight to the actual work. All tools (node, tsx, tsc, gcc, rustc, python3, etc.) are pre-installed and verified — no need to check.
CRITICAL — After editing/creating a file, ALWAYS call get_generated_file to deliver it to the user. Files left in the sandbox are invisible to the user.

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
    design: { fileName: 'frontend-design', label: 'Frontend design & styling' },
    file: { fileName: 'file-reading', label: 'File reading & analysis per type' },
};

async function fetchSkillFile(skillName: string): Promise<string> {
    try {
        const safeName = (skillName || '').replace(/[^a-z0-9-]/g, '').slice(0, 80);
        if (!safeName) return '';
        const p = path.join(__dirname, 'skills', `${safeName}.md`);
        if (!fs.existsSync(p)) {
            console.warn(`[SKILL] File not found: ${p}`);
            return '';
        }
        const text = fs.readFileSync(p, 'utf-8');
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
    weatherDone?: boolean;
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

/** Returns proper nouns: PascalCase words (not at position 0) + known Indian city/landmark names */
function extractProperNouns(text: string): string[] {
    const words = text.split(/\s+/);
    const out: string[] = [];
    for (let i = 0; i < words.length; i++) {
        const w = (words[i] ?? '').replace(/[^a-zA-Z0-9]/g, '');
        if (!w) continue;
        // PascalCase (not first word, length > 2)
        if (/^[A-Z][a-z]{1,}/.test(w) && i > 0) out.push(w.toLowerCase());
        // Indian geography / landmark names
        if (/^(nagpur|mumbai|delhi|pune|gujarat|kerala|goa|rajasthan|agra|jaipur|varanasi|chennai|kolkata|bangalore|hyderabad|ahmedabad|vadodara|baroda|kevadiya|statue|unity|patel|sardar|ajanta|ellora|shirdi|aurangabad|lonavala|mahabaleshwar|manali|shimla|rishikesh|haridwar|mathura|dwarka|coorg|ooty|munnar|alleppey|kasauli|darjeeling|gangtok|leh|ladakh)$/i.test(w)) {
            out.push(w.toLowerCase());
        }
    }
    return [...new Set(out)];
}

function isQueryRelevant(userQuery: string, modelQuery: string): boolean {
    const uTokens = extractTokens(userQuery);
    const mTokens = extractTokens(modelQuery);

    if (mTokens.length === 0) return false;
    if (uTokens.length === 0) return true;

    const mLower = modelQuery.toLowerCase();

    // Hard gate: user query has ≥2 proper nouns but model query has ZERO of them
    // This is the instruction-echo signature — reject it
    const uProperNouns = extractProperNouns(userQuery);
    if (uProperNouns.length >= 2) {
        const hits = uProperNouns.filter(pn => mLower.includes(pn));
        if (hits.length === 0) return false;
    }

    // Require stricter overlap for long user queries (more entities = higher bar)
    const overlapping = mTokens.filter((t: string) => uTokens.includes(t));
    const minRequired = uTokens.length > 5 ? 2 : 1;
    if (overlapping.length >= minRequired) return true;

    // Bigram phrase check
    for (let i = 0; i < uTokens.length - 1; i++) {
        const bigram = `${uTokens[i]} ${uTokens[i + 1]}`;
        if (mLower.includes(bigram)) return true;
    }

    return false;
}

// ── Smart query rewriting ────────────────────────────────────────────────────

const INSTRUCTION_ECHO_RE = /^(search\s+(for|up|about|the|on|regarding)?\s*|look\s+up\s+|find\s+(out\s+)?(about\s+)?|tell\s+me\s+(about\s+|the\s+)?|show\s+me\s+|get\s+(me\s+)?|what\s+(is|are|does|were)\s+|can\s+you\s+(find|search|tell|show)\s+|please\s+(search|find|look\s+up)?\s+|i\s+(want|need)\s+to\s+(find|know|search)(\s+about)?\s+)/gi;
const TRAVEL_FILLER_RE = /^(tours?\s+and\s+travels?\s+(for\s+(visiting|going\s+to)?\s*|to\s+)?|travel\s+(to|for)\s+|visit(?:ing)?\s+(to\s+)?)/i;
const TRAILING_NOISE_RE = /\s*(,\s*)?(and\s+)?(please|for\s+me|right\s+now|asap|as\s+well|also|too|with\s+details?|in\s+detail)\.?$/gi;
const PRICE_SUFFIX_RE = /\s+(and\s+)?(prices?|costs?|pricing|fees?|charges?|rates?)\s+too\.?$/i;

/**
 * Strips instruction-echo prefixes and travel filler from a model-generated query.
 * Returns cleaned query string, or null if nothing meaningful remains or the
 * query is missing key proper nouns from the original user request.
 */
function cleanAndValidateModelQuery(modelQuery: string, userQuery: string): string | null {
    let q = modelQuery.trim();

    // Strip instruction prefixes iteratively
    let prev = '';
    while (prev !== q) {
        prev = q;
        q = q.replace(INSTRUCTION_ECHO_RE, '').trim();
        q = q.replace(TRAVEL_FILLER_RE, '').trim();
    }
    q = q.replace(TRAILING_NOISE_RE, '').trim();

    // Preserve price intent: if original had "prices" but we stripped it, add back
    if (PRICE_SUFFIX_RE.test(modelQuery) && !/\bpric/i.test(q)) q += ' prices';

    q = q.replace(/\s{2,}/g, ' ').trim();
    if (!q || q.length < 5) return null;

    const cleanedTokens = extractTokens(q);
    if (cleanedTokens.length < 2) return null;

    // Reject if user query has ≥2 proper nouns and cleaned query contains none of them
    const userProperNouns = extractProperNouns(userQuery);
    if (userProperNouns.length >= 2) {
        const qLower = q.toLowerCase();
        const hits = userProperNouns.filter(pn => qLower.includes(pn));
        if (hits.length === 0) return null;
    }

    return q;
}

/**
 * Entity-priority query extraction from the raw user message.
 * Used when the model generates instruction echo or missing-entity queries.
 */
function extractEntityQuery(userQuery: string): string {
    const currentYear = new Date().getFullYear().toString();

    // Strip instruction preamble from user query
    let q = userQuery.trim();
    let prev = '';
    while (prev !== q) { prev = q; q = q.replace(INSTRUCTION_ECHO_RE, '').trim(); }
    q = q
        .replace(TRAVEL_FILLER_RE, '')
        .replace(/\s+and\s+travels?\s+/i, ' ')
        .replace(/\s+for\s+visiting\s+/i, ' ')
        .replace(PRICE_SUFFIX_RE, (m) => /pric/i.test(m) ? ' prices' : '')
        .replace(/\s+(please|for\s+me)\.?$/i, '')
        .replace(/\s{2,}/g, ' ').trim();

    const words = q.split(/\s+/).filter(Boolean);

    // Score each word for search-query usefulness
    const scored = words.map((word, i) => {
        const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!lower || lower.length < 2) return { word, score: -99, i };

        let score = 0;
        if (STOPWORDS.has(lower)) return { word, score: -5, i };

        // Proper noun (PascalCase, not position 0)
        if (/^[A-Z]/.test(word) && i > 0) score += 8;
        // Known Indian cities / landmarks
        if (/^(nagpur|mumbai|delhi|pune|gujarat|kerala|goa|rajasthan|agra|jaipur|varanasi|chennai|kolkata|bangalore|hyderabad|ahmedabad|vadodara|baroda|kevadiya|statue|unity|patel|sardar|ajanta|ellora|shirdi|aurangabad|lonavala|manali|shimla|rishikesh|haridwar|mathura|dwarka|coorg|ooty|munnar|alleppey|kasauli|darjeeling|ladakh)$/i.test(lower)) score += 14;
        // Tourism / product nouns
        if (/^(tour|tours|package|packages|ticket|tickets|hotel|resort|bus|train|flight|price|prices|cost|costs|entry|visit|trip|travel|stay|booking|itinerary)$/i.test(lower)) score += 5;
        // Verification / fact-check intent
        if (/^(verify|check|confirm|validate|prove|disprove|debunk|legitimate|authentic|true|false|claim|rumor)$/i.test(lower)) score += 6;
        // Word immediately after "from" or "to" in travel context
        if (i > 0 && /^(from|to|via)$/i.test(words[i - 1] ?? '')) score += 7;
        // Year
        if (/^20[0-9]{2}$/.test(word)) score += 4;
        // Generic prepositions
        if (/^(from|to|via|and|or|in|at|near|around|for)$/i.test(lower)) score -= 2;
        // Length bonus
        if (lower.length >= 4) score += 1;

        return { word, score, i };
    });

    const kept = scored
        .filter(s => s.score > -4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 9)
        .sort((a, b) => a.i - b.i)
        .map(s => s.word);

    // Add year for time-sensitive queries
    const resultStr = kept.join(' ');
    const hasYear = /\b20[0-9]{2}\b/.test(resultStr);
    const isTimeSensitive = /\b(price|cost|tour|package|hotel|travel|news|latest|current|today|now|recent|deal|offer|rate|schedule|ticket)\b/i.test(resultStr);
    if (!hasYear && isTimeSensitive && kept.length < 9) kept.push(currentYear);

    return kept.join(' ');
}

/**
 * Master query rewriter. Takes the raw model query + original user message.
 * Returns 1 clean, entity-rich, Tavily-ready query string.
 *
 * Flow: try to salvage model query → if instruction echo, extract from user query.
 */
function smartRewriteQuery(rawModelQuery: string, userQuery: string): string {
    const TAVILY_MAX = 395;
    const currentYear = new Date().getFullYear().toString();

    // 1. Try to salvage model's query
    const cleaned = cleanAndValidateModelQuery(rawModelQuery, userQuery ?? rawModelQuery);

    let finalQuery: string;
    if (cleaned) {
        finalQuery = cleaned;
        // Add year for time-sensitive queries if absent
        const hasYear = /\b20[0-9]{2}\b/.test(finalQuery);
        const isTimeSensitive = /\b(price|cost|tour|package|hotel|deal|latest|news|current|ticket|schedule)\b/i.test(finalQuery);
        if (!hasYear && isTimeSensitive) {
            const words = finalQuery.split(/\s+/);
            if (words.length < 9) finalQuery += ` ${currentYear}`;
        }
        // Smart truncation to 10 words: preserve entity-dense words
        const words = finalQuery.split(/\s+/).filter(Boolean);
        if (words.length > 10) {
            const scored = words.map((w, i) => ({
                w, i,
                s: (STOPWORDS.has(w.toLowerCase()) ? -2 : 0)
                 + (/^[A-Z]/.test(w) ? 4 : 0)
                 + (/^20[0-9]{2}$/.test(w) ? 3 : 0)
                 + (/\b(price|tour|package|hotel|from|nagpur|statue|unity)\b/i.test(w) ? 3 : 0)
                 + (i < 3 || i >= words.length - 2 ? 1 : 0),
            }));
            finalQuery = scored
                .sort((a, b) => b.s - a.s)
                .slice(0, 10)
                .sort((a, b) => a.i - b.i)
                .map(s => s.w)
                .join(' ');
        }
    } else {
        // 2. Model query was instruction echo or missing entities — extract from user query
        finalQuery = extractEntityQuery(userQuery ?? rawModelQuery);
        console.log(`[TOOL] web_search — rewrote instruction echo to entity query: "${finalQuery}"`);
    }

    return finalQuery.slice(0, TAVILY_MAX);
}

// ── Tool timeout wrapper ────────────────────────────────────────────────────
function withToolTimeout(tools: Record<string, any>, timeouts: Record<string, number>): void {
    for (const [name, timeoutMs] of Object.entries(timeouts)) {
        const tool = tools[name];
        if (!tool || !tool.execute || typeof tool.execute !== 'function') continue;
        const originalExecute = tool.execute;
        tool.execute = async (args: any) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => { ctrl.abort(); }, timeoutMs);
            try {
                return await Promise.race([
                    originalExecute(args),
                    new Promise<never>((_, reject) =>
                        ctrl.signal.addEventListener('abort', () =>
                            reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`))
                        )
                    ),
                ]);
            } finally {
                clearTimeout(timer);
            }
        };
    }
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
                    'A precise, targeted search query (6–10 words). ' +
                    'Extract ONLY the KEY ENTITIES: place names, product names, brand names, specific topics, years. ' +
                    'CRITICAL — NEVER echo the user\'s instruction preamble. If the user says "search for tours to X", the query is "tours X", NOT "search for tours to X". ' +
                    'NEVER include: instruction words (search for, find, tell me, look up), filler (tours and travels for visiting, information about), or verification words (true, false, verify, confirm, legit). ' +
                    'Example: user says "search for tours and travels for visiting Statue of Unity from Nagpur and prices too" → query "Statue Unity tour packages Nagpur prices 2026". ' +
                    'Example: user says "Is it true Meta is cancelling AI projects?" → query "Meta cancelling AI projects 2026". ' +
                    'Example: user says "Hey can you find 2nd year courses at RBU Nagpur Btech CSE" → query "RBU Nagpur Btech CSE 2nd year courses 2026". ' +
                    'Rule: your query should look like what appears in a browser address bar for this topic, not like a sentence. ' +
                    'For travel/price/product queries, always append the current year. ' +
                    'REQUIRED — always provide a specific query.'
                ),
                queries: z.array(z.string()).describe(
                    'Run multiple search queries in parallel (each 6–10 words, same rules as query). ' +
                    'USE THIS for: travel routes (query origin + destination separately), product comparisons, multi-part questions. ' +
                    'Example: "tours Nagpur to Statue of Unity prices" + "Kevadiya Statue Unity entry ticket 2026". ' +
                    'Do NOT use for single-topic queries — use query instead.'
                ).optional(),
            }),
                execute: async ({ query, queries: queriesArr }: any) => {
                // ── Re-search guard: max 1 auto + 1 re-search before blocking ──
                if (state.searchCount >= 2) {
                    console.warn(`[TOOL] web_search blocked (already searched ${state.searchCount}x)`);
                    const blockedMsg = `__SEARCH_BLOCKED__ SEARCH LIMIT REACHED. You already performed ${state.searchCount} search(es). Do NOT call any more tools. Answer the user IMMEDIATELY using the search results already in context. If you call web_search again, your response will be discarded.`;
                    return blockedMsg;
                }

                // Block re-search when we already have results from the first search
                if (state.searchCount >= 1 && (state.searchContent?.length ?? 0) > 500) {
                    console.warn(
                        `[TOOL] web_search — re-search blocked; already have ` +
                        `${state.searchContent!.length} chars from first search. Forcing synthesis.`
                    );
                    return (
                        `__SEARCH_SKIPPED__ Already have comprehensive search results ` +
                        `${state.searchContent!.length} chars. Answer using the information you already have.`
                    );
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

                // Rewrite each query: strip instruction echo, extract key entities,
                // add year for time-sensitive queries, smart-truncate to ≤10 words.
                let safeQueries = queriesToRun.slice(0, 3).map(q =>
                    smartRewriteQuery(q, userQuery ?? q)
                );
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
                            search_depth: /\b(price|cost|tour|package|hotel|restaurant|book|buy|ticket|deal|offer|rate|schedule|review|itinerary|resort|flight|train|bus)\b/i.test(q)
                                ? 'advanced'
                                : 'basic',
                            max_results: 7,
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
                'Load rules for handling files or generating documents. ' +
                'Use doc_type="file" when a user uploads a file — this is the FIRST thing you should call. ' +
                'Use doc_type="design" for UI/styling rules on uploaded HTML/CSS files. ' +
                'Use other doc types (pdf, docx, pptx, xlsx, etc.) before generate_document to get generation rules.',
            inputSchema: z.object({
                doc_type: z
                    .enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal', 'design', 'file'])
                    .describe('The skill type to load rules for'),
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
                if (state.weatherDone) {
                    return `Weather already fetched for this conversation turn. Answer the user using that data.`;
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
                    {
                        source: result.source,
                        city: result.resolvedCity,
                        temperature: result.temperature,
                        feelsLike: result.feelsLike,
                        humidity: result.humidity,
                        windSpeed: result.windSpeed,
                        description: result.description,
                        tempF: parseFloat(fahrenheit),
                        feelsF: parseFloat(feelsF),
                    },
                    state.thoughtProcess);
                state.weatherDone = true;
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
            description: 'Run a bash command in the sandbox. Used for compiling/running code (gcc, python3, node, etc.), running linters/type-checkers, and file operations. NEVER run "which", "echo", "ls", "cd", "pwd", "type", "--version", or install packages — the sandbox already has everything pre-installed. After write_file creates a code file, call this to compile and test it.',
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
            description: 'Read contents of a TEXT or CODE file from the sandbox. Do NOT use on binary files (PDF, DOCX, XLSX, PPTX, images, archives) — use run_bash with Python tools instead (pandas for CSV, pymupdf for PDF, openpyxl for XLSX, python-docx for DOCX, python-pptx for PPTX).',
            inputSchema: z.object({
                path: z.string().describe('Absolute path like /home/user/data.csv'),
            }),
            execute: async ({ path }: any) => {
                const cid = activeConversationId || 'default';
                const filename = path.split('/').pop() || 'file';
                sendStatus(res, 'reading_file', `Reading ${filename}...`, { path, filename }, state.thoughtProcess);
                try {
                    const content = await codeExecutor.readFile(cid, path);
                    sendStatus(res, 'reading_file_success', `Read ${filename}`, { path, filename, size: content.length }, state.thoughtProcess);
                    return `Contents of ${path}:\n\n${content}`;
                } catch (e: any) {
                    sendStatus(res, 'reading_file_error', `Failed to read ${filename}: ${e.message}`, { path, error: e.message }, state.thoughtProcess);
                    return `Failed to read ${path}: ${e.message}`;
                }
            },
        }),

        // ── write_file ────────────────────────────────────────────────────
        write_file: (tool as any)({
            description: 'ONLY use for NEW files (creating from scratch). For editing existing files, ALWAYS prefer edit_file (surgical string replacement) instead. After writing a code file, call run_bash next to compile and execute it.',
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
                    const codeExts = ['c', 'cpp', 'cs', 'py', 'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'rs', 'go', 'java', 'kt', 'swift', 'rb', 'php'];
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
            description: 'Surgically edit a file by replacing the FIRST occurrence of old_str with new_str. ALWAYS read_file first to see the full content. Include enough surrounding context in old_str to make it unique. PREFER edit_file over write_file for targeted changes — only use write_file for entirely new files.',
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
                const addedLines = (new_str?.match(/\n/g) || []).length;
                const removedLines = (old_str?.match(/\n/g) || []).length;
                sendStatus(res, 'generating_file', `Editing ${filename}...`, { path, old_str: old_str.slice(0, 80), diffAdded: addedLines, diffRemoved: removedLines }, state.thoughtProcess);
                try {
                    const result = await codeExecutor.editFile(cid, path, old_str || '', new_str || '');
                    if (result.success) {
                        sendStatus(res, 'generating_file_success', `Edited ${filename}`, { path, diffAdded: addedLines, diffRemoved: removedLines }, state.thoughtProcess);
                        return `File ${path} edited successfully. After editing code, call run_bash to re-compile and re-run to verify the fix.`;
                    }
                    sendStatus(res, 'generating_file_error', `Edit failed on ${filename}: ${result.error}`, { path }, state.thoughtProcess);
                    return `Edit failed: ${result.error} -- read the file and try edit_file again with more surrounding context so the old_str is unique.`;
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
            description: 'Download a file from the sandbox and return its base64-encoded content with MIME type. Use this to return files (images, PDFs, CSVs, code files, edited documents) directly to the user in chat. Call this AFTER you finish editing or generating a file the user should receive.',
            inputSchema: z.object({
                path: z.string().describe('Absolute path to the file in the sandbox. For edited files use /home/user/edits/<filename>, for originals use /home/user/uploads/<filename>, for new files use /home/user/<filename>.'),
            }),
            execute: async ({ path }: any) => {
                const cid = activeConversationId || 'default';
                const filename = path.split('/').pop() || 'file';
                sendStatus(res, 'generating_file', `Delivering ${filename}...`, { path, filename }, state.thoughtProcess);
                try {
                    const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, path);
                    const filename = path.split('/').pop() || 'file';
                    if (!res.writableEnded) {
                        res.write(`event: file\ndata: ${JSON.stringify({ filename, path, mime: mimeType, base64, downloadUrl: `/api/sandbox/download/${cid}/${filename}` })}\n\n`);
                    }
                    sendStatus(res, 'generating_file_success', `Delivered ${filename}`, { path, filename, mime: mimeType }, state.thoughtProcess);
                    return `File "${filename}" (${mimeType}, ${Math.round(base64.length * 0.75 / 1024)}KB) has been sent to the user.`;
                } catch (e: any) {
                    sendStatus(res, 'generating_file_error', `Failed to deliver ${path.split('/').pop() || 'file'}: ${e.message}`, { path, error: e.message }, state.thoughtProcess);
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
                const safe = await checkSsrFree(trimmed);
                if (!safe) return 'This URL cannot be accessed — it points to a private or internal network address.';

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
                        const pdfResult = await extractPdf(rawBuf);
                        extracted = pdfResult.markdown || pdfResult.text || '';
                        if (pdfResult.token_count >= 4000 && uid) {
                            await processLargeDocument(pdfResult, uid, trimmed, 'read_url', trimmed);
                            extracted = `[PDF DOCUMENT: ${trimmed}]\n${pdfResult.metadata.pages} pages, ${pdfResult.metadata.ocr_pages > 0 ? `${pdfResult.metadata.ocr_pages} OCR pages, ` : ''}${pdfResult.metadata.has_images ? 'contains embedded images, ' : ''}${(pdfResult.token_count * 4 / 1024).toFixed(0)} KB total.\n\nThe document is large and has been chunked into searchable sections. Use retrieve_doc_chunks(query) to find relevant content, then answer based on the retrieved sections.\n\nFirst section preview:\n${(pdfResult.pages?.[0]?.text ?? pdfResult.markdown ?? '').slice(0, 2000)}`;
                        }
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
        // ── retrieve_doc_chunks ─────────────────────────────────────────────
        retrieve_doc_chunks: (tool as any)({
            description:
                'Search a previously uploaded or fetched document for sections relevant to the user\'s question. ' +
                'Use this when the user asks about a large document that was chunked into sections. ' +
                'Provide a specific query related to what you need to find in the document. ' +
                'Returns the most relevant text sections with their headings.',
            inputSchema: z.object({
                query: z.string().describe('What to search for in the document — be specific, like a search engine query'),
                documentName: z.string().optional().describe('Optional: restrict search to a specific document name'),
                topK: z.number().optional().describe('Number of sections to return (default 5, max 10)'),
            }),
            execute: async ({ query, documentName, topK }: { query: string; documentName?: string; topK?: number }) => {
                if (!uid) return 'No user session — cannot search documents.';
                if (!query || typeof query !== 'string') return 'No query provided.';
                const results = await retrieveDocChunks(query, uid, documentName, Math.min(topK ?? 5, 10));
                if (results.length === 0) return 'No matching sections found in the document. Try a different query.';
                return results.map((r, i) =>
                    `[Section ${i + 1}]${r.heading ? ` (${r.heading})` : ''}\n${r.text}`
                ).join('\n\n---\n\n');
            },
        }),
        ...createGoogleTools(uid, res, state),
    };
}

// ── PDF parsing (pymupdf4llm subprocess) ────────────────────────────────

interface ExtractionResult {
    metadata: { pages: number; ocr_pages: number; is_scanned: boolean; has_images: boolean };
    markdown: string;
    text?: string;
    pages: PageData[];
    token_count: number;
}

async function extractPdf(rawBuf: Buffer): Promise<ExtractionResult> {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (rawBuf.length > MAX_FILE_SIZE) {
        return {
            metadata: { pages: 0, ocr_pages: 0, is_scanned: false, has_images: false },
            markdown: '',
            text: '',
            pages: [],
            token_count: 0,
        };
    }

    const tmp = path.join(os.tmpdir(), `flux-pdf-${crypto.randomUUID()}.pdf`);
    try {
        await Bun.write(tmp, rawBuf);
        const proc = Bun.spawn(['python3', path.resolve('pdf_parser.py'), tmp], {
            timeout: 30_000,
        });
        const [out, errOut] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ]);
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            console.error('[PDF_PARSER] Subprocess failed:', errOut.slice(0, 500));
            const errMsg = errOut.replace(/\n/g, ' ').slice(0, 200);
            return {
                metadata: { pages: 0, ocr_pages: 0, is_scanned: false, has_images: false },
                markdown: `[PDF parsing failed: ${errMsg}]`,
                text: `[PDF parsing failed: ${errMsg}]`,
                pages: [],
                token_count: 0,
            };
        }

        const result = JSON.parse(out);
        return {
            metadata: result.metadata,
            markdown: result.markdown || '',
            text: result.markdown || '',
            pages: result.pages || [],
            token_count: result.token_count || 0,
        };
    } catch (e: any) {
        console.error('[PDF_PARSER] Exception:', e.message);
        return {
            metadata: { pages: 0, ocr_pages: 0, is_scanned: false, has_images: false },
            markdown: `[PDF parsing error: ${e.message}]`,
            text: `[PDF parsing error: ${e.message}]`,
            pages: [],
            token_count: 0,
        };
    } finally {
        try { await fs.promises.rm(tmp, { force: true }); } catch { /* ignore cleanup failure */ }
    }
}

async function processLargeDocument(
    result: ExtractionResult,
    userId: string,
    docName: string,
    source: string,
    sourceUrl?: string,
): Promise<void> {
    const contentHash = crypto.createHash('sha256').update(Buffer.from(result.markdown)).digest('hex');
    const existing = await prisma.documentChunk.findFirst({ where: { contentHash, userId } });
    if (existing) return;

    const chunks = chunkByHeadings(result.pages, docName);
    const embeddingPromises = chunks.map(async (chunk) => {
        const { getEmbedding } = await import('./local-embedder');
        const embedding = await getEmbedding(chunk.text);
        return { chunk, embedding };
    });

    const embedded = await Promise.all(embeddingPromises);

    await prisma.$transaction(
        embedded.map(({ chunk, embedding }) =>
            prisma.documentChunk.create({
                data: {
                    userId,
                    documentName: docName,
                    source,
                    sourceUrl: sourceUrl ?? null,
                    chunkIndex: chunk.index,
                    heading: chunk.heading,
                    text: chunk.text,
                    embedding: embedding as any,
                    tokenCount: chunk.tokenCount,
                    contentHash,
                },
            }),
        ),
    );
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
        const uid = req.appUserId!;
        const { conversationId, filename, content } = req.body;
        if (!conversationId || !filename || content === undefined) {
            return res.status(400).json({ error: 'conversationId, filename, and content required' });
        }
        const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: uid } });
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const remotePath = await sandboxManager.uploadFile(conversationId, safeName, Buffer.from(content, 'base64'));
        res.json({ success: true, filename: safeName, remotePath });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sandbox/download/:conversationId/:filename', middleware, async (req: any, res: any) => {
    try {
        const uid = req.appUserId!;
        const { conversationId, filename } = req.params;
        const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: uid } });
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });
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
        const uid = req.appUserId!;
        await wikiManager.deleteNode(req.params.nodeId, uid);
        res.json({ success: true });
    } catch (e: any) {
        const msg = (e as Error).message;
        if (msg === 'Node not found') return res.status(404).json({ error: msg });
        res.status(500).json({ error: msg });
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

// ── Long-running Task System ──────────────────────────────────────
app.use(taskRouter);

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
        broadcastSyncEvent(req.userId!, { type: 'conversation_created' });
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
                include: { messages: { orderBy: { createdAt: 'asc' } } },
            });
        }
        activeConversationId = existingConv?.id ?? (
            await prisma.conversation.create({
                data: { title: nq.slice(0, 120), slug: slugify(nq), userId: uid },
            })
        ).id;
        if (!existingConv) broadcastSyncEvent(suid, { type: 'conversation_created' });

        // ── SSE setup ───────────────────────────────────────────────────
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Conversation-Id', activeConversationId);
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

            // If compaction exists, inject it as the first history message
            const compaction = (existingConv as any).compaction as string | null;
            if (compaction) {
                historyMessages.push({ role: 'user', content: `[Compacted history]\n${compaction}` });
                used += compaction.length;
            }

            const reversed: { role: 'user' | 'assistant'; content: string }[] = [];
            for (let i = memos.length - 1; i >= skipCount; i--) {
                const m = memos[i];
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

        // ── Long-running task detection (multi-step project builder) ──
        const taskIntent = await classifyTaskIntent(nq).catch(() => 'SIMPLE' as const);
        const isLongTask = taskIntent === 'LONG_TASK';

        if (isLongTask) {
            const uid = req.appUserId!;
            const convCreated = !conversationId;
            const convId = conversationId ?? (
                await prisma.conversation.create({
                    data: { title: nq.slice(0, 120), slug: slugify(nq), userId: uid },
                })
            ).id;
            if (convCreated) broadcastSyncEvent(suid, { type: 'conversation_created' });
            activeConversationId = convId;

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Conversation-Id', convId);

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

            return res.end();
        }

        // ── Save user message ────────────────────────────────────────────
        await prisma.message.create({
            data: {
                content: attachedFilesText ? `${attachedFilesText}\n--\n${nq}` : nq,
                role: 'User',
                conversationId: activeConversationId,
                fileAttachment: safeAtt.length > 0 ? safeAtt : undefined,
            },
        });

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
                            await codeExecutor.writeFile(cid, `/home/user/uploads/${fn}`, Buffer.from(rawBase64, 'base64'));
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
CRITICAL — FILE LOCATION: Uploaded originals are at /home/user/uploads/. To edit, FIRST copy to /home/user/edits/ (run_bash: cp /home/user/uploads/<file> /home/user/edits/<file>). All editing happens in /home/user/edits/ — NEVER edit files in uploads/. Deliver from /home/user/edits/ when done.
CRITICAL — You MUST only work on the uploaded file(s). Do NOT create, scaffold, or generate new files or projects unless the user explicitly asks.
CRITICAL — ALWAYS call get_generated_file({ path: "/home/user/edits/<filename>" }) after editing — files left in sandbox are invisible.
CRITICAL — NEVER install packages (pip, npm, apt). Everything is pre-installed.

EDITING WORKFLOW (strict order):
  1. list_files({ path: "/home/user/uploads/" }) — see uploaded files
  2. run_bash({ command: "mkdir -p /home/user/edits && cp /home/user/uploads/<file> /home/user/edits/<file>" }) — copy to edits/
  3. read_file({ path: "/home/user/edits/<filename>" }) — read the copy
  4. edit_file({ path: "/home/user/edits/<filename>", old_str: "...", new_str: "..." }) — edit the copy
  5. run_bash with compile/lint/verify using /home/user/edits/<filename> paths
  6. get_generated_file({ path: "/home/user/edits/<filename>" }) — deliver to user\n`
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
            // Research mode: only web_search + read_url allowed (no sandbox/execute tools)
            const allowedResearchTools = new Set(['web_search', 'read_url', 'get_weather']);
            for (const name of Object.keys(tools)) {
                if (!allowedResearchTools.has(name)) {
                    delete (tools as any)[name];
                }
            }
        }

        withToolTimeout(tools, {
            web_search: 30_000,
            read_skill: 10_000,
            generate_document: 60_000,
            get_weather: 10_000,
            generate_image: 90_000,
            wiki_search: 10_000,
            read_url: 10_000,
            run_bash: 60_000,
            run_python: 60_000,
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
                        if (isPdfAtt) {
                            const pdfResult = await extractPdf(rawBuf);
                            parsedContent = pdfResult.markdown || pdfResult.text || '';
                            if (pdfResult.token_count >= 4000 && uid) {
                                await processLargeDocument(pdfResult, uid, att.name || 'document', 'upload');
                                const preview = (pdfResult.pages?.[0]?.text ?? parsedContent).slice(0, 1500);
                                parsedContent = `[PDF DOCUMENT: ${att.name}]\n${pdfResult.metadata.pages} pages, ${(rawBuf.length / 1024).toFixed(0)} KB.\n\nThe document is large and has been chunked into searchable sections. Use retrieve_doc_chunks(query) to find relevant content.\n\nFirst section preview:\n${preview}`;
                            }
                        } else {
                            parsedContent = await extractDocxText(rawBuf);
                        }
                        sendStatus(res, 'parsing_done', `Parsed ${att.name} (${(parsedContent.length / 1024).toFixed(0)} KB text)`, { name: att.name }, agentState.thoughtProcess);
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
                            system: `You are Flux's synthesis engine. Transform raw context into a precise, high-value answer.

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
                    broadcastSyncEvent(suid, { type: 'message_created', conversationId: activeConversationId, messageId: savedMid });
                    if (!isFollowUp) autoRenameConversation(activeConversationId, nq).catch(() => { });
                    if (memEnabled && cleanAnswer) {
                        const extractUserMsg = attachedFilesText ? `${attachedFilesText}\n\nUser message: ${nq}` : nq;
                        extractMemories([{ role: 'user', content: extractUserMsg }, { role: 'assistant', content: cleanAnswer }], uid, activeConversationId, model)
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

        // ── Background compaction (non-blocking) — triggers when history exceeds budget ──
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
            read_skill: 10_000,
            generate_document: 60_000,
            get_weather: 10_000,
            generate_image: 90_000,
            wiki_search: 10_000,
            read_url: 10_000,
            run_bash: 60_000,
            run_python: 60_000,
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
        broadcastSyncEvent(req.userId!, { type: 'conversation_deleted', id: conversationId });
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
            maxOutputTokens: 1800,
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

    const safe = await checkSsrFree(rawUrl);
    if (!safe) return res.status(403).json({ error: "access to private/internal network is not allowed" });

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
    const safe = await checkSsrFree(rawUrl);
    if (!safe) return res.status(403).json({ error: "access to private/internal network is not allowed" });
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

// Recover any interrupted long-running tasks from previous server instances
recoverInterruptedTasks().then(count => console.log('[TASK] Recovery pass complete'));

// Attach Agent Protocol WebSocket handler
createAgentWebSocket(server);

const proto = server instanceof https.Server ? "https" : "http";
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => { console.log(`Flux backend running on ${proto}://localhost:${PORT}`); });