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
import { createAgentsRouter } from './http/routes/agents';
import { createMultiAgentRouter } from './http/routes/multiagent';
import { createChatSdkRouter } from './http/routes/chat-sdk';
import { createFluxAskRouter } from './http/routes/flux-ask';
import { createOpenAICompatRouter } from './http/routes/openai-compat';
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
import { slugify } from './http/util/slug';
import { autoRenameConversation } from './services/conversations/rename';
import { AGENT_SYSTEM_EXTENSION, VISUAL_INSTRUCTIONS } from './prompts/agent-extension';
import { broadcastSyncEvent } from './sync/broadcast';

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

app.use(createDiagnosticsRouter(routesContext));
app.use(createIntegrationsRouter());

// Sanitisation helpers live in http/util/sanitize.ts
// Model catalog, selection and fallback live in agents/model-router.ts
// slugify lives in http/util/slug.ts
// ── Auto‑rename ─────────────────────────────────────────────
// Auto-rename lives in services/conversations/rename.ts
// cleanAnswerChunk and sanitizeThought live in prompts/sanitize.ts
// ── Format reminders ─────────────────────────────────────────
// AGENT_SYSTEM_EXTENSION lives in prompts/agent-extension.ts
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

app.use(createFluxAskRouter());

// ─── Standard AI SDK endpoint (assistant-ui compatible) ──────
// This endpoint uses streamText + toDataStreamResponse() so the
// output is in the standard AI SDK data-stream format that
// assistant-ui's Thread component expects natively.
// Uses the same models and tools as /flux_ask but without
// custom SSE events (sendStatus writes are no-op'd).
app.use(createChatSdkRouter());
app.use(createTtsRouter());

app.use(createArticlesRouter());
// Model discovery lives in http/routes/diagnostics.ts

app.use(createOpenAICompatRouter());
app.use(createMultiAgentRouter());
app.use(createAgentsRouter());
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
