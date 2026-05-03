// index.ts
import { tavily } from '@tavily/core';
import express from "express";
import cors from "cors";
import { streamText, generateText } from 'ai';
import { SYSTEM_PROMPT, PROMPT_TEMPLATE } from './prompt';
import { CANVAS_SYSTEM_PROMPT, CANVAS_PROMPT_TEMPLATE } from './prompt_canvas';
import { prisma } from "./db";
import { middleware } from './middleware';
import { nim } from './nim-client';

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const app = express();

app.use(cors({ exposedHeaders: ['X-Conversation-Id'] }));
app.use(express.json());

// ── HEALTH CHECK ────────────────────────────────────
app.get("/health", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: "ok", db: "connected" });
    } catch (e) {
        console.error("Health check failed:", e);
        res.status(503).json({ status: "degraded", db: "disconnected" });
    }
});

// ── AVAILABLE MODELS ────────────────────────────────────
const NIM_MODELS: Record<string, string> = {
    "llama-3.1-405b":          "meta/llama-3.1-405b-instruct",
    "llama-3.1-8b":            "meta/llama-3.1-8b-instruct",
    "llama-3.3-70b":           "meta/llama-3.3-70b-instruct",
    "nemotron-super-49b":      "nvidia/llama-3.3-nemotron-super-49b-v1",
    "kimi-k2":                 "moonshotai/kimi-k2-instruct",
    "qwen3-coder-480b":        "qwen/qwen3-coder-480b-a35b-instruct",
    "mistral-large-675b":      "mistralai/mistral-large-3-675b-instruct-2512",
    "deepseek-r1":             "deepseek-ai/deepseek-v4-flash",
    "seed-oss-36b":            "bytedance/seed-oss-36b-instruct",
    "magistral-small":         "mistralai/magistral-small-2506",
    "nemotron-nano-30b":       "nvidia/nemotron-3-nano-30b-a3b",
    "gemma-3-12b":             "google/gemma-3-12b-it",
    "glm-4.7":                 "z-ai/glm4.7",
    "glm-5":                   "z-ai/glm5",
};

function selectModel(preferredModel: string | undefined) {
    if (preferredModel && NIM_MODELS[preferredModel]) {
        return nim.chatModel(NIM_MODELS[preferredModel]);
    }
    return nim.chatModel('meta/llama-3.1-8b-instruct');
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

async function getAppUserId(supabaseUserId: string) {
    const appUser = await prisma.user.findUnique({
        where: { supabaseId: supabaseUserId },
        select: { id: true }
    });
    return appUser?.id ?? null;
}

async function autoRenameConversation(conversationId: string, firstQuery: string, model: any) {
    try {
        const titlePrompt = `Create a short, descriptive title (maximum 10 words, no quotes, no punctuation at the end) for a conversation that starts with the following query:\n\n"${firstQuery}"\n\nTitle:`;
        const { text } = await generateText({
            model,
            prompt: titlePrompt,
            maxTokens: 30,
        });
        const generatedTitle = text.trim();
        if (generatedTitle) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { title: generatedTitle.slice(0, 120) },
            });
        }
    } catch (err) {
        console.error("Failed to auto-rename conversation:", err);
    }
}

// ── SSE helper: safely write text (only for normal chat) ──
function writeSafeSSE(res: any, content: string) {
    const escaped = content.replace(/\n/g, '\ndata: ');
    res.write(`data: ${escaped}\n\n`);
}

// ── Helper: extract code from fenced block ──────────
function extractCode(text: string): string {
    const match = text.match(/```html\n([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
}

// ── ROUTES ──────────────────────────────────────────────

app.get("/conversations", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });
        const conversations = await prisma.conversation.findMany({
            where: { userId: appUserId },
            include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } }
        });
        const sorted = conversations.sort((a, b) => {
            const aTime = a.messages[0]?.createdAt?.getTime() ?? 0;
            const bTime = b.messages[0]?.createdAt?.getTime() ?? 0;
            return bTime - aTime;
        }).map(c => ({
            id: c.id, title: c.title, slug: c.slug,
            lastMessageAt: c.messages[0]?.createdAt ?? null
        }));
        return res.json({ conversations: sorted });
    } catch (error) {
        console.error("Failed to fetch conversations:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/conversations/new", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        let appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) {
            const authUser = req.authUser;
            if (!authUser) return res.status(500).json({ message: "Authentication data missing" });
            const provider = authUser.app_metadata.provider === "github" ? "Github" : "Google";
            const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || "Unknown User";
            const email = authUser.email ?? `${supabaseUserId}@no-email.local`;
            const created = await prisma.user.create({ data: { supabaseId: supabaseUserId, email, provider, name } });
            appUserId = created.id;
        }
        const conversation = await prisma.conversation.create({
            data: { title: "New Thread", slug: `new-thread-${Date.now()}`, userId: appUserId }
        });
        return res.status(201).json({ conversation: { id: conversation.id, title: conversation.title, slug: conversation.slug, lastMessageAt: null } });
    } catch (error) {
        console.error("Failed to create conversation:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/conversation/:conversationId", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });
        const conversationId = req.params.conversationId;
        if (!conversationId) return res.status(400).json({ message: "conversationId is required" });
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: appUserId },
            include: { messages: { orderBy: { createdAt: "asc" } } }
        });
        if (!conversation) return res.status(404).json({ message: "Conversation not found" });
        return res.json({ conversation });
    } catch (error) {
        console.error("Failed to fetch conversation:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ── FLUX ASK (unchanged) ────────────────────────────
app.post("/flux_ask", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });

        const { query, model: preferredModel, fileContent, attachedFiles } = req.body as {
            query?: string;
            model?: string;
            fileContent?: string;
            attachedFiles?: { name: string; content?: string }[];
        };
        if (!query || !query.trim()) return res.status(400).json({ error: "Query is required" });
        const normalizedQuery = query.trim();

        const conversation = await prisma.conversation.create({
            data: { title: normalizedQuery.slice(0, 120), slug: slugify(normalizedQuery), userId: appUserId }
        });

        await prisma.message.create({
            data: {
                content: normalizedQuery,
                role: "User",
                conversationId: conversation.id,
                fileAttachment: attachedFiles && attachedFiles.length > 0
                    ? attachedFiles.map((f) => ({ name: f.name, content: f.content }))
                    : undefined
            }
        });

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Conversation-Id', conversation.id);
        res.flushHeaders();

        const model = selectModel(preferredModel);
        let webSearchResults = "";
        let allSources: { url: string; index: number }[] = [];

        res.write(`event: status\ndata: 🔍 Searching the web…\n\n`);
        try {
            const searchQuery = normalizedQuery.slice(0, 400);
            const webSearchResponse = await client.search(searchQuery, { search_depth: "advanced", max_results: 10 });
            if (webSearchResponse.results.length === 0) {
                res.write(`event: status\ndata: ⚠️ No relevant web results found. Answering from my own knowledge…\n\n`);
            } else {
                const totalResults = webSearchResponse.results.length;
                res.write(`event: status\ndata: 📖 Reading ${totalResults} sources…\n\n`);
                allSources = webSearchResponse.results.map((r, idx) => ({
                    url: r.url,
                    index: idx + 1,
                }));
                webSearchResults = allSources
                    .map((s, i) => `[${s.index}] ${s.url}\n${webSearchResponse.results[i].content}`)
                    .join("\n\n");
            }
        } catch (searchErr) {
            console.error("Search error:", searchErr);
            res.write(`event: status\ndata: ⚠️ Search service is temporarily unavailable. Answering without web results…\n\n`);
        }

        const finalPrompt = PROMPT_TEMPLATE
            .replace("{{FILE_CONTENT}}", fileContent || "No file uploaded.")
            .replace("{{USER_QUERY}}", normalizedQuery)
            .replace("{{WEB_SEARCH_RESULTS}}", webSearchResults || "No web search results available.");

        const currentDateTime = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const isDeepSeek = preferredModel === "deepseek-r1";
        const dynamicSystem = SYSTEM_PROMPT.replace('{{CURRENT_DATETIME}}', currentDateTime)
            + "\n\nNever output <TOOLS>, <THINK>, or any reasoning tags.";

        const abortController = new AbortController();
        let streamClosed = false;
        req.on('close', () => {
            streamClosed = true;
            abortController.abort();
            try { res.end(); } catch {}
        });

        const result = streamText({
            model,
            system: isDeepSeek ? undefined : dynamicSystem,
            prompt: isDeepSeek ? `${dynamicSystem}\n\n${finalPrompt}` : finalPrompt,
            abortSignal: abortController.signal,
        });

        let assistantText = "";
        for await (const textPart of result.textStream) {
            if (streamClosed) break;
            assistantText += textPart;
            writeSafeSSE(res, textPart);
        }

        if (streamClosed) return;

        let citedSources: { url: string }[] = [];
        if (allSources.length > 0) {
            const citationNumbers = [...new Set(
                [...assistantText.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10))
            )].filter(num => num > 0 && num <= allSources.length);
            citedSources = citationNumbers.map(num => ({ url: allSources[num - 1].url }));
        }

        res.write(`event: sources\ndata: ${JSON.stringify(citedSources)}\n\n`);
        res.end();

        await prisma.message.create({
            data: {
                content: assistantText,
                role: "Assistant",
                conversationId: conversation.id,
                sources: citedSources
            }
        });

        autoRenameConversation(conversation.id, normalizedQuery, model).catch(() => {});

    } catch (error) {
        console.error("Server Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        } else {
            res.write(`event: error\ndata: Connection lost\n\n`);
            res.end();
        }
    }
});

// ── FLUX FOLLOW UP (unchanged) ──────────────────────
app.post("/flux_ask/follow_up", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });

        const { conversationId, query, model: preferredModel, fileContent, attachedFiles } = req.body as {
            conversationId?: string;
            query?: string;
            model?: string;
            fileContent?: string;
            attachedFiles?: { name: string; content?: string }[];
        };
        if (!conversationId || !query || !query.trim())
            return res.status(400).json({ message: "conversationId and query are required" });

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: appUserId },
            include: { messages: { orderBy: { createdAt: "asc" } } }
        });
        if (!conversation) return res.status(404).json({ message: "Conversation not found" });

        const normalizedQuery = query.trim();
        const historyMessages = conversation.messages.map(m => `${m.role}: ${m.content}`);

        await prisma.message.create({
            data: {
                content: normalizedQuery,
                role: "User",
                conversationId: conversation.id,
                fileAttachment: attachedFiles && attachedFiles.length > 0
                    ? attachedFiles.map((f) => ({ name: f.name, content: f.content }))
                    : undefined
            }
        });

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Conversation-Id', conversation.id);
        res.flushHeaders();

        const model = selectModel(preferredModel);
        let webSearchResults = "";
        let allSources: { url: string; index: number }[] = [];

        res.write(`event: status\ndata: 🔍 Searching the web…\n\n`);
        try {
            const searchQuery = normalizedQuery.slice(0, 400);
            const webSearchResponse = await client.search(searchQuery, { search_depth: "advanced", max_results: 20 });
            if (webSearchResponse.results.length === 0) {
                res.write(`event: status\ndata: ⚠️ No relevant web results found. Answering from my own knowledge…\n\n`);
            } else {
                const totalResults = webSearchResponse.results.length;
                res.write(`event: status\ndata: 📖 Reading ${totalResults} sources…\n\n`);
                allSources = webSearchResponse.results.map((r, idx) => ({
                    url: r.url,
                    index: idx + 1,
                }));
                webSearchResults = allSources
                    .map((s, i) => `[${s.index}] ${s.url}\n${webSearchResponse.results[i].content}`)
                    .join("\n\n");
            }
        } catch (searchErr) {
            console.error("Search error:", searchErr);
            res.write(`event: status\ndata: ⚠️ Search service is temporarily unavailable. Answering without web results…\n\n`);
        }

        const fullHistory = historyMessages.join("\n\n");
        const promptWithHistory = `Previous conversation:\n${fullHistory}\n\nFollow-up question:\n${normalizedQuery}`;
        const finalPrompt = PROMPT_TEMPLATE
            .replace("{{FILE_CONTENT}}", fileContent || "No file uploaded.")
            .replace("{{USER_QUERY}}", promptWithHistory)
            .replace("{{WEB_SEARCH_RESULTS}}", webSearchResults || "No web search results available.");

        const currentDateTime = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const isDeepSeek = preferredModel === "deepseek-r1";
        const dynamicSystem = SYSTEM_PROMPT.replace('{{CURRENT_DATETIME}}', currentDateTime)
            + "\n\nNever output <TOOLS>, <THINK>, or any reasoning tags.";

        const abortController = new AbortController();
        let streamClosed = false;
        req.on('close', () => {
            streamClosed = true;
            abortController.abort();
            try { res.end(); } catch {}
        });

        const result = streamText({
            model,
            system: isDeepSeek ? undefined : dynamicSystem,
            prompt: isDeepSeek ? `${dynamicSystem}\n\n${finalPrompt}` : finalPrompt,
            abortSignal: abortController.signal,
        });

        let assistantText = "";
        for await (const textPart of result.textStream) {
            if (streamClosed) break;
            assistantText += textPart;
            writeSafeSSE(res, textPart);
        }

        if (streamClosed) return;

        let citedSources: { url: string }[] = [];
        if (allSources.length > 0) {
            const citationNumbers = [...new Set(
                [...assistantText.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10))
            )].filter(num => num > 0 && num <= allSources.length);
            citedSources = citationNumbers.map(num => ({ url: allSources[num - 1].url }));
        }

        res.write(`event: sources\ndata: ${JSON.stringify(citedSources)}\n\n`);
        res.end();

        await prisma.message.create({
            data: {
                content: assistantText,
                role: "Assistant",
                conversationId: conversation.id,
                sources: citedSources
            }
        });

    } catch (error) {
        console.error("Follow-up Server Error:", error);
        if (!res.headersSent) {
            return res.status(500).json({ error: "Internal server error" });
        }
        res.write(`event: error\ndata: Connection lost\n\n`);
        res.end();
    }
});

// ── FLUX CANVAS ASK (full‑code streaming, abort‑safe) ──
app.post("/flux_ask/canvas", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });

        const { query, model: preferredModel, existingCode } = req.body as {
            query?: string;
            model?: string;
            existingCode?: string;
        };
        if (!query || !query.trim()) return res.status(400).json({ error: "Query is required" });
        const normalizedQuery = query.trim();

        const model = selectModel(preferredModel);

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const abortController = new AbortController();
        let streamClosed = false;
        req.on('close', () => {
            streamClosed = true;
            abortController.abort();
            try { res.end(); } catch {}
        });

        const currentDateTime = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const dynamicSystem = CANVAS_SYSTEM_PROMPT.replace('{{CURRENT_DATETIME}}', currentDateTime);
        const canvasPrompt = CANVAS_PROMPT_TEMPLATE
            .replace("{{EXISTING_CODE}}", existingCode ? `\`\`\`html\n${existingCode}\n\`\`\`` : "")
            .replace("{{USER_QUERY}}", normalizedQuery);

        const result = streamText({
            model,
            system: dynamicSystem,
            prompt: canvasPrompt,
            abortSignal: abortController.signal,
        });

        let fullResponse = "";
        let lastSend = Date.now();

        for await (const textPart of result.textStream) {
            if (streamClosed) break;
            fullResponse += textPart;

            if (Date.now() - lastSend > 200) {
                const currentCode = extractCode(fullResponse);
                res.write(`data: ${JSON.stringify({ type: "stream", code: currentCode })}\n\n`);
                lastSend = Date.now();
            }
        }

        if (streamClosed) return;

        const finalCode = extractCode(fullResponse);
        res.write(`event: canvasCode\ndata: ${JSON.stringify({ code: finalCode })}\n\n`);
        res.end();
    } catch (error) {
        console.error("Canvas Server Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        } else {
            res.write(`event: error\ndata: Connection lost\n\n`);
            res.end();
        }
    }
});

// ── SAVE CANVAS STATE (upsert + version history + auto‑rename) ──
app.post("/canvas/save", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });

        const { conversationId, canvasCode, versions } = req.body as {
            conversationId?: string;
            canvasCode?: string;
            versions?: string[];
        };
        if (!conversationId || !canvasCode) {
            return res.status(400).json({ message: "conversationId and canvasCode are required" });
        }

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: appUserId },
        });
        if (!conversation) return res.status(404).json({ message: "Conversation not found" });

        const metadata: any = { canvasCode };
        if (Array.isArray(versions) && versions.length > 0) {
            metadata.versions = versions;
        }

        const existing = await prisma.message.findFirst({
            where: { conversationId, type: "canvas" },
        });

        if (existing) {
            await prisma.message.update({
                where: { id: existing.id },
                data: { metadata },
            });
        } else {
            await prisma.message.create({
                data: {
                    content: "",
                    role: "Assistant",
                    type: "canvas",
                    metadata,
                    conversationId,
                },
            });

            if (
                conversation.title === "New Thread" ||
                conversation.slug.startsWith("new-thread-")
            ) {
                const firstUserMsg = await prisma.message.findFirst({
                    where: { conversationId, role: "User" },
                    orderBy: { createdAt: "asc" },
                });

                const queryForTitle = firstUserMsg?.content?.trim() || "Canvas project";
                const model = selectModel(undefined);

                autoRenameConversation(conversationId, queryForTitle, model).catch((err) =>
                    console.error("Canvas auto‑rename failed:", err)
                );
            }
        }

        return res.status(201).json({ success: true });
    } catch (error) {
        console.error("Canvas save error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ── DELETE CONVERSATION ────────────────────────────
app.delete("/conversations/:conversationId", middleware, async (req, res) => {
    try {
        const supabaseUserId = req.userId;
        if (!supabaseUserId) return res.status(401).json({ message: "Unauthorized" });
        const appUserId = await getAppUserId(supabaseUserId);
        if (!appUserId) return res.status(404).json({ message: "User not found" });
        const conversationId = req.params.conversationId;
        if (!conversationId) return res.status(400).json({ message: "conversationId is required" });
        const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId: appUserId } });
        if (!conversation) return res.status(404).json({ message: "Conversation not found" });
        await prisma.conversation.delete({ where: { id: conversationId } });
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Delete conversation error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// ✅ Local development only: start the server
if (process.env.NODE_ENV !== 'production') {
    app.listen(3001, () => {
        console.log("Flux backend running on port 3001");
    });
}

// ✅ Export for serverless environments (Vercel)
export default app;
