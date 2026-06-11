// index.ts – Full Pipeline Implementation (Complete & Optimized)
import { tavily } from '@tavily/core';
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { streamText, generateText, tool } from 'ai';
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
    "nemotron-mini-4b": "nvidia/nemotron-mini-4b-instruct",
    "nemotron-3-super-120b-a12b": "nvidia/nemotron-3-super-120b-a12b",
    "deepseek-v4-flash": "deepseek-ai/deepseek-v4-flash",
    "step-3.7-flash": "stepfun-ai/step-3.7-flash",
    "qwen3.5-397b-a17b": "qwen/qwen3.5-397b-a17b",
    "step-3.5-flash": "stepfun-ai/step-3.5-flash",
    "minimax-m2.7": "minimaxai/minimax-m2.7",
    "stockmark-2-100b-instruct": "stockmark/stockmark-2-100b-instruct",
    "nemotron-nano-12b-v2-vl": "nvidia/nemotron-nano-12b-v2-vl",
};

// ── Vision-capable models ──────────────────────────────────
const VISION_MODELS = new Set([
    "nemotron-nano-12b-v2-vl",
    "kimi-k2.6",
]);

// ── selectModel returns a proper AI SDK model instance ──
function selectModel(preferredModel: string | undefined): any {
    if (preferredModel && NIM_MODELS[preferredModel]) {
        return nim.chatModel(NIM_MODELS[preferredModel]);
    }
    return nim.chatModel('moonshotai/kimi-k2.6');
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
async function autoRenameConversation(
    conversationId: string,
    firstQuery: string,
    model: any,
    docIntent?: string | null
) {
    try {
        const safeQuery = firstQuery.replace(/"/g, '\\"').slice(0, 200);

        let context = "";
        if (docIntent === "image") context = "The user created an image. ";
        else if (docIntent) context = `The user created a ${docIntent.toUpperCase()} document. `;

        const titlePrompt = `Create a short, descriptive title (max 6 words, no quotes) for a conversation.
${context}Initial request: "${safeQuery}"

Respond with ONLY the title text.
Title:`;

        const { text } = await generateText({ model, prompt: titlePrompt, maxTokens: 40, signal: AbortSignal.timeout(8000) } as any);
        let clean = sanitizeTitle((text ?? '').trim());

        // Force prefix if model forgot and we have an intent
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

function cleanAnswerChunk(text: string): string {
    if (!text) return "";
    let cleaned = text;
    // Remove <THOUGHT> blocks entirely
    cleaned = cleaned.replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, '');
    // Remove leftover tags
    cleaned = cleaned
        .replace(/<\/?THOUGHT>/gi, '')
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
You are Flux — a powerful AI assistant with real tools.

RESPONSE STYLE:
• Write naturally — no <THOUGHT> or <ANSWER> tags ever.
• After tools complete, seamlessly integrate their results into your answer.
• End EVERY response with exactly 3 follow-up questions in this exact format:

<FOLLOW_UPS>
<question>Question one here</question>
<question>Question two here</question>
<question>Question three here</question>
</FOLLOW_UPS>

TOOL RULES:
• web_search     → Search for current info, news, facts. Write SPECIFIC targeted queries.
                   CRITICAL: IGNORE your training data — answer ONLY from search results.
                   Include the current year in your query.
• get_weather    → Use when the user asks about weather in a specific place.
• generate_image → Use when the user asks to create, draw, or generate an image.
• read_skill     → Load generation rules for a document type (pdf/pptx/docx/xlsx/csv).
• generate_document → Create a downloadable document file.

DOCUMENT GENERATION WORKFLOW (follow this EXACT multi-step process):
When the user asks to create a document (PDF, Word, PowerPoint, etc.):

Step 1 — RESEARCH: Call web_search to find relevant information about the topic.
   After the search results return, EXPLAIN to the user what you found.
   Summarize the key information conversationally ("Based on my research...").

Step 2 — LOAD SKILLS: Call read_skill with the document type (e.g., doc_type="pdf").
   After the skill content loads, tell the user what rules/format you'll be following.
   Be specific about the document type's guidelines.

Step 3 — GENERATE: Call generate_document with the doc_type and topic.
   Pass the skill_content from read_skill so the builder follows the correct rules.
   After generation, announce the file to the user.

IMPORTANT: After each tool call, WAIT for the result, then write your explanation
before proceeding to the next step. This creates a conversational agentic flow.
Search multiple times if the first results are insufficient — verify your findings.
`;

const VISUAL_INSTRUCTIONS = `
VISUAL STYLE RULES:
- Use markdown for structure (headings, lists, bold).
- For math, use LaTeX wrapped in $ or $$.
- Use emojis to make the response engaging.
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
    return query
        .replace(/\b(generate|create|make|build|write|give|produce|prepare)\s*(me\s+)?(a\s+|an\s+)?/gi, '')
        .replace(/\b(docx?|pdf|pptx?|powerpoint|word\s+doc(?:ument)?|presentation|slide\s*deck|slides?|file|document|xlsx?|excel|spreadsheet|csv|tsv|markdown|md)\b/gi, '')
        .replace(/\b(about|with\s+topic|with\s+the\s+topic\s+of|on\s+the\s+topic\s+of|on|regarding|for|covering|with)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        || query.trim().slice(0, 80);
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
        const r = await fetch(`http://localhost:${port}/skills/${skillName}`);
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
    statusMsgs?: ContextualStatusMessages
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
        : `${skillContext}Generate a comprehensive, detailed ${docType.toUpperCase()} document about: "${topic}"

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
): Promise<GeneratedFileResult | null> {
    const topic = extractTopicFromQuery(query);
    if (!topic) return null;

    const schema = DOC_SCHEMA[docType];
    const skillContext = preloadedSkillContent
        ? `\n\n=== ${docType.toUpperCase()} GENERATION SKILL FILE ===\n${preloadedSkillContent}\n=== END SKILL FILE ===\n\nFollow all instructions in the skill file exactly.\n\n`
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
        : `${skillContext}Generate a comprehensive ${docType.toUpperCase()} document about: "${topic}"\n\nUse exactly this JSON structure:\n${schema}\n\nRules:\n- Include substantive, professional content.\n${QUOTE_RULE}\n- Output ONLY the JSON object. Start with { end with }.`;

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
}

// ── TOOL FACTORY ───────────────────────────────────────────────────────────
// Creates all 5 tools scoped to the current request (has access to res + state).
function createFluxTools(res: any, model: any, state: AgentState, userQuery?: string) {
    return {

        // ── web_search ────────────────────────────────────────────────────
        web_search: (tool as any)({
            description:
                'Search the web to retrieve LIVE, CURRENT data (recent news, events, facts). ' +
                'Your training data is from 2024-2025 — this tool returns FRESH results from the present day. ' +
                'CRITICAL: After this tool returns, IGNORE what your training data says and answer ONLY from these results. ' +
                'Always include the current year/month in your query. ' +
                'Do NOT use for general knowledge, logic, math, or basic greetings.',
            parameters: z.object({
                query: z.string().describe(
                    'A precise, targeted search query — not the user\'s raw words. REQUIRED — always provide a specific query.'
                ),
                queries: z.array(z.string()).describe(
                    'Alternative to query: multiple search queries to run in parallel. ' +
                    'Use ONLY when you need results from multiple angles; otherwise use query.'
                ).optional(),
            }),
            execute: async ({ query, queries: queriesArr }: any) => {
                // Guard: models occasionally emit malformed tool calls with missing args.
                // Zod reports the error but the AI SDK still invokes execute — leaving
                // `query` as undefined. Without this check, `query.slice()` throws and
                // crashes the whole request (Bun/JSC reports it as `txt.slice`).
                // Some models pass `queries` (array) instead of `query` (string).
                const safeQuery =
                    typeof query === 'string'
                        ? query.trim()
                        : Array.isArray(queriesArr) && queriesArr.length > 0
                            ? queriesArr.filter((q: any) => typeof q === 'string').map((q: string) => q.trim()).filter(Boolean).join(' ')
                            : (typeof userQuery === 'string' ? userQuery.trim() : '');
                if (!safeQuery) {
                    console.warn('[TOOL] web_search called with no query — skipping');
                    sendStatus(res, 'error', 'Search skipped: no query provided.', undefined, state.thoughtProcess);
                    return 'No search query was provided. Answer from training knowledge instead.';
                }
                sendStatus(res, 'searching',
                    `Searching "${safeQuery}"...`,
                    undefined, state.thoughtProcess);
                try {
                    const results = await (client as any).search(safeQuery, {
                        search_depth: 'basic',
                        max_results: 7,
                    });
                    const srcs = (results?.results ?? []).map((r: any, i: number) => ({
                        url: r.url,
                        index: (state.sources?.length ?? 0) + i + 1,
                    }));
                    state.sources.push(...srcs);

                    if (!srcs.length) {
                        sendStatus(res, 'no_results', 'No relevant results found.', undefined, state.thoughtProcess);
                        return 'No search results found.';
                    }

                    sendStatus(res, 'found_sources',
                        `Found ${srcs.length} source${srcs.length > 1 ? 's' : ''}`,
                        { sources: srcs.map((s: any) => s.url) },
                        state.thoughtProcess);

                    const titles = (results.results ?? []).slice(0, 5).map((r: any) =>
                        r.title || getDomain(r.url));
                    const urls = (results.results ?? []).slice(0, 5).map((r: any) => r.url);
                    sendStatus(res, 'reading', `Reading ${titles.length} sources...`, { titles, urls }, state.thoughtProcess);

                    const resultsText = (results.results ?? []).map((r: any, i: number) => {
                        let c = (r.content || r.snippet || '')
                            .replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (c.length > 1500) c = c.slice(0, 1500) + '...';
                        return `[${i + 1}] ${r.url}\n${r.title ? r.title + '\n' : ''}${c}`;
                    }).join('\n\n');
                    return `[IMPORTANT: These search results are from the CURRENT DATE. You MUST answer using ONLY this data — do NOT rely on your training knowledge. Today is not 2024 or 2025. Ignore any dates in your training data that contradict these results.]\n\n${resultsText}`;
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
            parameters: z.object({
                doc_type: z
                    .enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal'])
                    .describe('The document type to load rules for'),
            }),
            execute: async ({ doc_type }: any) => {
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
                    return `Skill file for "${doc_type}" not found on disk. Proceed with defaults.`;
                }
                return content;
            },
        }),

        // ── generate_document ─────────────────────────────────────────────
        generate_document: (tool as any)({
            description:
                'Generate a downloadable document file. ' +
                'Always call read_skill first and pass the content here.',
            parameters: z.object({
                doc_type: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal']),
                topic: z.string().describe('The topic or subject of the document'),
                skill_content: z
                    .string()
                    .optional()
                    .describe('The skill file content returned by read_skill'),
            }),
            execute: async ({ doc_type, topic, skill_content }: any) => {
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
                    skill_content ?? ''
                );
                if (!generatedFile) {
                    return `Failed to generate the ${safeDocType.toUpperCase()} document. Tell the user to try again.`;
                }
                state.generatedFiles.push(generatedFile);
                if (!res.writableEnded) {
                    res.write(`event: file\ndata: ${JSON.stringify(generatedFile)}\n\n`);
                }
                return (
                    `${safeDocType.toUpperCase()} file "${generatedFile.filename}" generated successfully. ` +
                    `Tell the user it is ready to download.`
                );
            },
        }),

        // ── get_weather ───────────────────────────────────────────────────
        get_weather: (tool as any)({
            description: 'Fetch real-time weather data for a specific city.',
            parameters: z.object({
                city: z.string().describe('The city name to get weather for'),
            }),
            execute: async ({ city }: any) => {
                const safeCity = typeof city === 'string' ? city.trim() : '';
                if (!safeCity) {
                    console.warn('[TOOL] get_weather called with no city');
                    return 'No city was provided for weather lookup.';
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
                'Use when user asks to create, draw, or generate an image.',
            parameters: z.object({
                prompt: z.string().describe('Description of the image to generate'),
            }),
            execute: async ({ prompt }: any) => {
                sendStatus(res, 'image_enhancing', 'Enhancing image prompt with AI...', undefined, state.thoughtProcess);
                const enhanced = await enhanceImagePrompt(prompt, model);
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
                        return 'Image service is offline. Start it with: python image_service.py';
                    }
                    const imgRes = await fetch(`${IMAGE_SERVICE_URL}/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: enhanced, width: 1024, height: 1024 }),
                        signal: AbortSignal.timeout(180_000),
                    });
                    if (!imgRes.ok) return `Image service error: HTTP ${imgRes.status}`;
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
                    return (
                        `Image generated (${imgData.width}×${imgData.height}px). ` +
                        `Tell the user the image is displayed below.`
                    );
                } catch (e: any) {
                    return `Image generation failed: ${e.message}`;
                }
            },
        }),

        // ── update_todos ─────────────────────────────────────────────────
        update_todos: (tool as any)({
            description: 'Display or update a dynamic todo list visible to the user. ' +
                'Call this at the start of a multi-step task to show your plan with all steps as "pending", ' +
                'then call it again as you complete each step — update the current step to "in_progress" ' +
                'and finished steps to "completed". Each call replaces the entire list.',
            parameters: z.object({
                items: z.array(z.object({
                    id: z.string().describe('Unique identifier (e.g. "1", "2", "search", "analyze")'),
                    content: z.string().describe('Description of what needs to be done (e.g. "Search for recent papers")'),
                    status: z.enum(['pending', 'in_progress', 'completed']).describe('Current status'),
                })).describe('Full todo list — replaces any previous list'),
            }),
            execute: async ({ items }: any) => {
                const event = { type: "todos", items };
                if (!res.writableEnded) {
                    res.write(`event: todos\ndata: ${JSON.stringify({ items })}\n\n`);
                }
                if (state?.thoughtProcess) state.thoughtProcess.push(event);
                return `Todo list updated with ${items.length} items.`;
            },
        }),
    };
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
        } = req.body as {
            query?: string;
            model?: string;
            fileContent?: string;
            attachedFiles?: { name: string; content?: string; type?: string }[];
            location?: string;
            conversationId?: string;
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
        if (isFollowUp && existingConv!.messages?.length) {
            const hist = existingConv!.messages
                .slice(-MAX_HIST)
                .map((m: any) => {
                    const content = typeof m.content === 'string' ? m.content : '';
                    return `${m.role === 'User' ? 'User' : 'Assistant'}: ${content.slice(0, 2000)}`;
                })
                .join('\n\n');
            contextQuery = `Previous conversation:\n${hist}\n\nFollow-up:\n${nq}`;
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

        // ── Build dynamic system prompt ──────────────────────────────────
        model = selectModel(pref);
        const memCtx = memEnabled
            ? await retrieveMemories(uid, nq).then(buildMemoryContext).catch(() => '')
            : '';
        const dynSys = [
            SYSTEM_PROMPT
                .replaceAll('{{CURRENT_DATETIME}}', nowStr)
                .replaceAll('{{LOCATION_INFO}}', locInfo)
                .replaceAll('{{MEMORY_CONTEXT}}', memCtx),
            VISUAL_INSTRUCTIONS,
            AGENT_SYSTEM_EXTENSION,
        ].join('\n\n');

        // ── Per-request agent state ──────────────────────────────────────
        const agentState: AgentState = { sources: [], generatedFiles: [], thoughtProcess: [] };
        const tools = createFluxTools(res, model, agentState, nq);

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
            get writableEnded() { return res.writableEnded; },
            writeTodos: (items) => {
                const ev = { type: 'todos', items };
                agentState.thoughtProcess.push(ev);
                if (!res.writableEnded) res.write(`event: todos\ndata: ${JSON.stringify({ items })}\n\n`);
            },
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
        });

        let fullText = '';
        let charsSent = 0;
        let streamBuf = '';
        let dbBuf = '';
        let hasToolCall = false;
        let toolResultSeen = false;
        const collectedToolResults: Array<{ name: string; result: string }> = [];
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

        const userText = !isVisionModel && imageAttachments.length > 0
            ? `[The user attached ${imageAttachments.length} image(s)]\n\n${videoNotice}${safeFile ? `[File content]\n${safeFile.slice(0, 100_000)}\n\n` : ''}${contextQuery}`
            : `${videoNotice}${safeFile ? `[File content]\n${safeFile.slice(0, 100_000)}\n\n` : ''}${contextQuery}`;

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

        // ── LLM streaming (skipped when orchestrator handled the workflow) ──
        if (!orchestratorHandled) {
            const agentStream = streamText({
                model,
                system: dynSys,
                messages,
                tools,
                maxSteps: 8,
                toolChoice: 'auto',
                temperature: 0.35,
                providerOptions: getProviderOptions(pref),
                onStepFinish: (step: any) => {
                    if (step.toolCalls?.length) {
                        step.toolCalls.forEach((tc: any) => {
                            // tc.args is the parsed object in AI SDK; tc.input is used in some versions
                            const args = tc.args ?? tc.input ?? '(no args)';
                            console.log(`[TOOL-CALL] ${tc.toolName}`, args);
                        });
                    }
                }
            } as any);

            for await (const event of agentStream.fullStream) {
                if (res.writableEnded || closedRef.v) break;

                if (event.type === 'tool-call') {
                    hasToolCall = true;
                    // Flush buffered pre-tool text BEFORE tool.execute() runs,
                    // so preamble text arrives in SSE before the status events
                    // that the tool's execute() function writes.
                    if (streamBuf) {
                        writeSafeSSE(res, streamBuf);
                        charsSent += streamBuf.length;
                        fullText += streamBuf;
                        if (typeof (res as any).flush === 'function') (res as any).flush();
                    }
                    streamBuf = '';
                    dbBuf = '';
                    toolResultSeen = true; // Subsequent text-delta flows directly
                }

                if (event.type === 'tool-result') {
                    // streamBuf should already be empty from tool-call flush,
                    // but keep as safety net for any edge-case text between
                    // tool-call and tool-result.
                    if (streamBuf) {
                        writeSafeSSE(res, streamBuf);
                        charsSent += streamBuf.length;
                        fullText += streamBuf;
                        if (typeof (res as any).flush === 'function') (res as any).flush();
                    }
                    streamBuf = '';
                    dbBuf = '';
                    toolResultSeen = true;
                    try {
                        const name = (event as any).toolName ?? 'tool';
                        const result = (event as any).result;
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
                        collectedToolResults.push({ name, result: String(txt ?? '').slice(0, 4000) });
                    } catch (toolErr) {
                        console.warn('[ASK] tool-result handler error:', (toolErr as any)?.message);
                    }
                }

                if (event.type === 'text-delta') {
                    const delta = (event as any).textDelta ?? (event as any).text ?? '';
                    // Strip only structural tags (not their content) so the answer
                    // text survives even if the model wraps it in unwanted tags.
                    // THOUGHT blocks ARE fully removed since they're reasoning-only.
                    const clean = delta
                        .replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, '')
                        .replace(/<\/?THOUGHT>/gi, '')
                        .replace(/<\/?ANSWER>/gi, '')
                        .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, '')
                        .replace(/<FOLLOW_UPS>[\s\S]*/gi, '')
                        .replace(/<\/?FOLLOW_UPS>/gi, '')
                        .replace(/<\/?question>/gi, '')
                        .trim();
                    if (clean) {
                        if (toolResultSeen) {
                            writeSafeSSE(res, clean);
                            charsSent += clean.length;
                            if (typeof (res as any).flush === 'function') (res as any).flush();
                        } else {
                            streamBuf += clean;
                        }
                    }
                    if (toolResultSeen) {
                        fullText += delta;
                    } else {
                        dbBuf += delta;
                    }
                }
            }

            if (streamBuf && !toolResultSeen) {
                writeSafeSSE(res, streamBuf);
                charsSent += streamBuf.length;
                fullText = dbBuf;
                if (typeof (res as any).flush === 'function') (res as any).flush();
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

            // ── Auto-document generation ─────────────────────────────────────
            // When the user asked for a document AND the model searched the web
            // but didn't chain to read_skill + generate_document, we do it here.
            if (!closedRef.v) {
                const safeQ = (query ?? '').toLowerCase();
                const docIntent = safeQ.includes('pdf') ? 'pdf'
                    : safeQ.includes('pptx') || safeQ.includes('powerpoint') || safeQ.includes('presentation') || safeQ.includes('slide') ? 'pptx'
                        : safeQ.includes('docx') || safeQ.includes('word') || safeQ.includes('document') ? 'docx'
                            : safeQ.includes('xlsx') || safeQ.includes('excel') || safeQ.includes('spreadsheet') || safeQ.includes('sheet') ? 'xlsx'
                                : safeQ.includes('csv') ? 'csv'
                                    : null;

                const hasSources = agentState.sources.length > 0;
                const hasFiles = agentState.generatedFiles.length > 0;

                if (docIntent && hasSources && !hasFiles && !res.writableEnded) {
                    const topic = extractTopicFromQuery(query ?? '') || 'document';
                    const searchUrls = agentState.sources.map((s: any) => s.url).join('\n');
                    const docQuery = `Create a ${docIntent} about: ${topic}\n\nSearch results for reference:\n${searchUrls}`;
                    console.log(`[AUTO-DOC] Generating ${docIntent} for "${topic}" with ${agentState.sources.length} sources`);
                    const skillFile = SKILL_REGISTRY[docIntent]?.fileName;
                    const skillContent = skillFile ? await fetchSkillFile(skillFile) : '';
                    sendStatus(res, 'reading_skill', `Reading the ${docIntent.toUpperCase()} skill`, { docType: docIntent, loaded: !!skillContent }, agentState.thoughtProcess);
                    sendStatus(res, 'generating_file', `Building your ${docIntent.toUpperCase()} on "${topic.slice(0, 30)}"...`, { docType: docIntent, topic }, agentState.thoughtProcess);
                    try {
                        const file = await generateDocumentWithSkill(docIntent as any, docQuery, model, skillContent);
                        if (file) {
                            agentState.generatedFiles.push(file);
                            if (!res.writableEnded) {
                                res.write(`event: file\ndata: ${JSON.stringify(file)}\n\n`);
                            }
                            const msg = `\n\nI've created a ${docIntent.toUpperCase()} document about "${topic}" based on the search results. You can download it below.`;
                            writeSafeSSE(res, msg);
                            charsSent += msg.length;
                            fullText += msg;
                            if (typeof (res as any).flush === 'function') (res as any).flush();
                        }
                    } catch (e: any) {
                        console.warn('[AUTO-DOC] generation failed:', e?.message);
                    }
                }
            }
        } // end if (!orchestratorHandled)

        // ── Fallback: model called tools but produced little/no visible text ──
        if (hasToolCall && !closedRef.v) {
            const hadSources = agentState.sources.length > 0;
            const hadFiles = agentState.generatedFiles.length > 0;

            if (!charsSent && hadSources && !res.writableEnded) {
                console.log('[ASK] charsSent=0 with sources — attempting answer synthesis');
                console.log('[ASK] collectedToolResults length:', collectedToolResults.length);

                const searchResults = collectedToolResults
                    .filter(r => r.name === 'web_search');

                let synthesized = '';
                const sourceText = searchResults.length > 0
                    ? searchResults.map(r => r.result).join('\n\n---\n\n')
                    : agentState.sources.map((s: any) => s.url).join('\n');

                if (sourceText.trim()) {
                    try {
                        const synthRes = await generateText({
                            model,
                            system: 'Answer the user question based ONLY on the provided information. Write a comprehensive, well-structured answer with paragraphs. Include relevant numbers, dates, and facts. Do NOT mention sources or search results. Answer naturally as if you already knew this.',
                            messages: [
                                { role: 'user', content: `Information:\n${sourceText.slice(0, 15000)}\n\nQuestion: ${nq}` },
                            ],
                            maxTokens: 2000,
                        } as any);
                        synthesized = (synthRes?.text ?? '').trim();
                        console.log(`[ASK] synthesis result length: ${synthesized.length}`);
                    } catch (synthErr: any) {
                        console.warn('[ASK] Answer synthesis failed:', synthErr?.message);
                    }
                } else {
                    console.warn('[ASK] No search text available for synthesis');
                }

                if (synthesized) {
                    writeSafeSSE(res, synthesized);
                    console.log(`[ASK] synthesized answer (${synthesized.length} chars) — sent to client`);
                    charsSent += synthesized.length;
                    fullText = synthesized;
                } else {
                    const formattedSources = agentState.sources
                        .map((s: any, i: number) => `${i + 1}. ${s.url}`)
                        .join('\n');
                    const msg = `I found the following sources with information related to your query:\n\n${formattedSources}\n\nYou can view the full sources in the Sources tab above.`;
                    console.log('[ASK] direct-source fallback sent (charsSent=0, sources=' + agentState.sources.length + ')');
                    writeSafeSSE(res, msg);
                    charsSent += msg.length;
                    fullText += msg;
                }
            }

            if (hadFiles && charsSent < 50 && !res.writableEnded) {
                const msg = 'Your file has been generated — see below for download.';
                writeSafeSSE(res, msg);
                charsSent += msg.length;
                fullText += msg;
            }

            if (!charsSent && !res.writableEnded) {
                const msg = 'Received results. Please try rephrasing your question for a more detailed answer.';
                console.log('[ASK] last-resort safety net fired');
                writeSafeSSE(res, msg);
                fullText += msg;
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
                    if (!isFollowUp) autoRenameConversation(activeConversationId, nq, model).catch(() => { });
                    if (memEnabled && cleanAnswer) {
                        extractMemories([{ role: 'user', content: nq }, { role: 'assistant', content: cleanAnswer }], uid, activeConversationId, model)
                            .then(() => pruneMemories(uid))
                            .catch(e => console.warn('[MEMORY]', e));
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
        const model = selectModel(pref);

        // Noop res so tool execute functions can run without side effects
        const noopRes: any = {
            writableEnded: false,
            write: () => true,
            end: () => {},
            flush: () => {},
            on: () => {},
        };
        const agentState: AgentState = { sources: [], generatedFiles: [], thoughtProcess: [] };
        const tools = createFluxTools(noopRes, model, agentState, nq);

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
            maxSteps: 8,
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

        const response = result.toDataStreamResponse();
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
app.post("/api/tts", middleware, async (req, res) => {
    try {
        const { text, voice } = req.body as { text?: string; voice?: string };
        if (!text || !voice) return res.status(400).json({ error: "text and voice are required" });
        const safeText = text.slice(0, 5000);
        const safeVoice = voice.slice(0, 100);
        // @ts-ignore
        const { EdgeTTS } = await import('@edge-tts/universal');
        const tts = new EdgeTTS(safeText, safeVoice);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');
        for await (const chunk of (tts as any).stream()) {
            if (res.writableEnded) break;
            res.write(chunk);
        }
        res.end();
    } catch (error) {
        console.error("TTS error:", error);
        if (!res.headersSent) res.status(500).json({ error: "TTS failed" });
    }
});

app.get("/api/tts/voices", middleware, async (_req, res) => {
    try {
        // @ts-ignore
        const { listVoices } = await import('@edge-tts/universal');
        const voices = await listVoices();
        const english = voices
            .filter((v: any) => v.Locale?.startsWith('en'))
            .map((v: any) => ({
                name: v.FriendlyName || v.ShortName,
                shortName: v.ShortName,
                locale: v.Locale,
                gender: v.Gender,
            }));
        return res.json({ voices: english });
    } catch (error) {
        console.error("Voice list error:", error);
        return res.status(500).json({ error: "Failed to fetch voices" });
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

// ── SERVER START ─────────────────────────────────────────────
app.listen(3001, () => { console.log("Flux backend running on port 3001"); });