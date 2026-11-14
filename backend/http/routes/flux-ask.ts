import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { aiLimiter } from '../middleware/rate-limit';
import { broadcastSyncEvent } from '../../sync/broadcast';
import { autoRenameConversation } from '../../services/conversations/rename';
import { slugify } from '../../http/util/slug';
import { sanitizeLocation } from '../../http/util/sanitize';
import { AGENT_SYSTEM_EXTENSION, VISUAL_INSTRUCTIONS } from '../../prompts/agent-extension';
import { extractTopicFromQuery } from '../../services/documents/intent';
import { generateDocumentWithSkill, fetchSkillFile, SKILL_REGISTRY } from '../../services/documents/generate';
import { checkSsrFree } from '../../services/net/ssrf';
import { detectMimeFromBase64 } from '../../services/files/mime';
import { retrieveDocChunks } from '../../lib/hybrid-retrieval';
import { retrieveMemories, getRecentMemories, extractMemories, buildMemoryContext, pruneMemories } from '../../services/memory/memory';
import { OrchestratorEngine } from '../../agents/orchestrator';
import { buildStructuredFileContext } from '../../services/files/files';
import { extractPdf, extractDocxText } from '../../services/pdf/extract';
import { processLargeDocument } from '../../services/documents/chunks';
import { compactConversation } from '../../services/conversations/compaction';
import { recoverInterruptedTasks, taskRouter } from '../../agents/task/routes';
import { classifyTaskIntent } from '../../agents/task/detect';
import { planTask, runTaskLoop } from '../../agents/task/loop';
import { codeExecutor } from '../../sandbox/executor';
import { wikiManager } from '../../services/wiki/manager';
import { toolRegistry } from '../../agents/tools/registry';
import { nim } from '../../services/models/nim-client';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../prisma/generated/client';
import { generateText, streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import * as crypto from 'crypto';
import { env, isSmoke } from '../../config/env';
import { BODY_LIMIT, RATE_LIMITS } from '../../config/constants';
import { corsOptions } from '../../config/cors';
import { trackSseConnection } from '../../http/sse/connections';
import { writeSafeSSE, sendStatus, sendProgress, sendAgentStatus, sendPermissionRequest, sendToolGroup, sendToolCall, writeReplaceText, writerFor } from '../../http/sse/writers';
import type { StreamWriter } from '../../agents/orchestrator';
import type { AgentState } from '../../agents/tools/state';
import { createFluxTools } from '../../agents/tools/factory';
import { withToolTimeout, TOOL_TIMEOUTS } from '../../agents/tools/timeout';
import { routeModel, selectModel, VISION_MODELS, VISION_NIM_PROVIDER_ID, getProviderOptions } from '../../agents/model-router';
import { SYSTEM_PROMPT } from '../../prompts/prompt';
import { tavilyClient } from '../../services/search/tavily';
export function createFluxAskRouter(): Router {
    const router = Router();
    router.post('/flux_ask', middleware, aiLimiter, async (req: any, res: any) => {
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
        const convIsNew = !existingConv;
        const newConv = convIsNew ? await prisma.conversation.create({
            data: { title: nq.slice(0, 120), slug: slugify(nq), userId: uid },
        }) : null;
        const activeConversation = existingConv ?? newConv!;
        activeConversationId = activeConversation.id;
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
        const userMsgFileText = safeFile || (safeAtt.filter(f => f.content && !f.type?.startsWith('image/') && !f.type?.startsWith('video/')).map(f => `[${f.name}]\n${f.content}`).join('\n\n'));
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

        // ── Two-pass image analysis ─────────────────────────────
        // If the selected model can't see (everything except nano-omni today),
        // a vision pass describes the image exhaustively; the strong model then
        // answers from that description. If the vision pass fails, the user gets
        // an honest can't-see notice instead of a hallucinated scene.
        let imageDescriptionContext = '';
        if (imageAttachments.length > 0 && !isVisionModel) {
            let descText = '';
            try {
                sendStatus(res, 'parsing', imageAttachments.length === 1
                    ? 'Analyzing the attached image...'
                    : `Analyzing ${imageAttachments.length} attached images...`,
                    { tool: 'vision', name: imageAttachments.map(f => f.name).join(', ') }, agentState.thoughtProcess);
                console.log(`[VISION] image analysis pass for ${imageAttachments.length} image(s)`);
                const visionResult = await generateText({
                    model: nim.chatModel(VISION_NIM_PROVIDER_ID),
                    messages: [{
                        role: 'user',
                        content: [
                            ...imageAttachments.map(f => ({ type: 'image' as const, image: f.content, mimeType: f.type })),
                            { type: 'text' as const, text: 'Extract the key facts from this image as terse bullet points. Cover: exact page/test title, course name, status badge text, score/percentage, date+time, voucher codes, pass/fail. Max 120 words. No extra commentary.' },
                        ],
                    }],
                    maxOutputTokens: 1800,
                } as any);
                descText = ((visionResult as any)?.text ?? '').trim()
                    || String((visionResult as any)?.reasoningText ?? '').trim();
                console.log(`[VISION] analysis pass -> ${descText.length} chars`);
            } catch (visionErr: any) {
                console.warn('[VISION] image analysis pass failed:', visionErr?.message ?? visionErr);
            }
            imageDescriptionContext = descText
                ? `[The user attached ${imageAttachments.length} image(s). A vision model analyzed them:]\n${descText.slice(0, 6000)}\n\n`
                : `[The user attached ${imageAttachments.length} image(s), but the vision subsystem could not read them. Answer from what the user typed; if the image content matters, say explicitly that you cannot see the image and ask for the key detail.]\n\n`;
        }

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
            ? `${imageDescriptionContext}${videoNotice}${attachedFilesText}${memPrefix}${nq}`
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
    return router;
}
