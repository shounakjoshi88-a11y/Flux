/**
 * Conversation routes: list, create, read, search, rename, delete, plus the
 * assets attached to messages and the artifact gallery.
 *
 * Every route scopes by the local user id, never by a supabase id, so the
 * ownership check cannot be bypassed by a wrong id type.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { newConvLimiter } from '../middleware/rate-limit';
import type { RoutesContext } from './context';

const PAGE_SIZE = 50;
const ARTIFACT_PAGE_SIZE = 24;

/** Messages carry base64 payloads; strip them from list and detail queries. */
const SELECT_MESSAGES_SQL = `
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
`;

export function createConversationsRouter(ctx: RoutesContext): Router {
    const router = Router();
    const { prisma, broadcastSyncEvent, sandboxManager } = ctx;

    router.get('/conversations', middleware, async (req, res) => {
        try {
            const uid = req.appUserId!;
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            // Sorting by id desc would return an arbitrary 50-of-N threads
            // (UUIDv4 order) and hide the newest conversation entirely —
            // that was the "new thread never shows up" bug.
            // Sort by the latest message in JS after a single join.
            const convs = await prisma.conversation.findMany({
                where: { userId: uid },
                orderBy: { id: 'desc' },
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
                },
                take: 1000,
            });
            const mapped = convs
              .map((c) => ({
                  id: c.id,
                  title: c.title,
                  slug: c.slug,
                  lastMessageAt: c.messages[0]?.createdAt ?? null,
              }))
              .sort((a, b) => {
                  const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                  const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                  return tb - ta;
              })
              .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return res.json({ conversations: mapped, page, take: PAGE_SIZE });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/conversations/new', middleware, newConvLimiter, async (req, res) => {
        try {
            const uid = req.appUserId!;
            const c = await prisma.conversation.create({
                data: { title: 'New Thread', slug: `new-thread-${Date.now()}`, userId: uid },
                select: { id: true, title: true, slug: true },
            });
            broadcastSyncEvent(req.userId!, { type: 'conversation_created' });
            return res.status(201).json({ conversation: { id: c.id, title: c.title, slug: c.slug, lastMessageAt: null } });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/conversation/:conversationId', middleware, async (req, res) => {
        try {
            const uid = req.appUserId!;
            const cid = req.params.conversationId as string;
            if (!cid) return res.status(400).json({ message: 'conversationId is required' });

            const messages = await prisma.$queryRawUnsafe<any[]>(SELECT_MESSAGES_SQL, cid, uid);

            if (!messages.length) {
                const conv = await prisma.conversation.findFirst({
                    where: { id: cid, userId: uid },
                    select: { id: true, title: true, slug: true },
                });
                if (!conv) return res.status(404).json({ message: 'Conversation not found' });
                return res.json({ conversation: { ...conv, messages: [] } });
            }

            const optimizedMessages = messages.map((msg) => {
                const m = { ...msg };
                if (Array.isArray(m.generatedFiles)) {
                    m.generatedFiles = (m.generatedFiles as any[]).map((f) => ({ ...f, placeholder: true }));
                }
                if (Array.isArray(m.fileAttachment)) {
                    m.fileAttachment = (m.fileAttachment as any[]).map((f) => ({ ...f, placeholder: true }));
                }
                return m;
            });

            const convInfo = await prisma.conversation.findUnique({
                where: { id: cid },
                select: { id: true, title: true, slug: true },
            });

            return res.json({ conversation: { ...convInfo, messages: optimizedMessages } });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/conversations/search', middleware, async (req, res) => {
        try {
            const uid = req.appUserId!;
            const q = (req.query.q as string)?.trim().slice(0, 200);
            if (!q) return res.json({ conversations: [] });
            const convs = await prisma.conversation.findMany({
                where: {
                    userId: uid,
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { messages: { some: { content: { contains: q, mode: 'insensitive' } } } },
                    ],
                },
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
                },
                take: PAGE_SIZE,
            });
            const mapped = convs.map((c) => ({
                id: c.id,
                title: c.title,
                slug: c.slug,
                lastMessageAt: c.messages[0]?.createdAt ?? null,
            }));
            return res.json({ conversations: mapped });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/api/assets/:messageId/:type/:index', middleware, async (req, res) => {
        try {
            const uid = req.appUserId!;
            const mid = parseInt(req.params.messageId as string);
            const type = req.params.type as 'generated' | 'upload';
            const idx = parseInt(req.params.index as string);

            const msg = await prisma.message.findFirst({
                where: { id: mid, conversation: { userId: uid } },
                select: {
                    generatedFiles: type === 'generated',
                    fileAttachment: type === 'upload',
                },
            });

            if (!msg) return res.status(404).json({ error: 'Message not found' });

            if (type === 'generated' && Array.isArray(msg.generatedFiles)) {
                const file = (msg.generatedFiles as any[])[idx];
                if (file?.base64) return res.json({ base64: file.base64 });
            }

            if (type === 'upload' && Array.isArray(msg.fileAttachment)) {
                const file = (msg.fileAttachment as any[])[idx];
                if (file?.content) return res.json({ base64: file.content });
            }

            return res.status(404).json({ error: 'Asset not found' });
        } catch (e) {
            console.error('[ASSETS] Fetch error:', e);
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.get('/artifacts', middleware, async (req, res) => {
        console.log(`[ARTIFACTS] Request received from UID: ${req.appUserId}`);
        try {
            const uid = req.appUserId!;
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const skip = (page - 1) * ARTIFACT_PAGE_SIZE;

            const messages = await prisma.$queryRawUnsafe<any[]>(
                `
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
        `,
                uid,
                ARTIFACT_PAGE_SIZE + 1,
                skip,
            );

            const hasMore = messages.length > ARTIFACT_PAGE_SIZE;
            const finalMessages = hasMore ? messages.slice(0, ARTIFACT_PAGE_SIZE) : messages;

            const artifacts: any[] = [];
            finalMessages.forEach((msg) => {
                if (Array.isArray(msg.fileAttachment)) {
                    (msg.fileAttachment as any[]).forEach((file, idx) => {
                        artifacts.push({
                            id: `upload-${msg.id}-${idx}`,
                            name: file.name,
                            filename: file.name,
                            mime: file.type || 'application/octet-stream',
                            type: 'uploaded',
                            placeholder: true,
                            conversationId: msg.conversationId,
                            conversationTitle: msg.conversationTitle || 'Untitled',
                            createdAt: msg.createdAt,
                            messageId: msg.id,
                            index: idx,
                        });
                    });
                }
                if (Array.isArray(msg.generatedFiles)) {
                    (msg.generatedFiles as any[]).forEach((file, idx) => {
                        artifacts.push({
                            id: `gen-${msg.id}-${idx}`,
                            name: file.filename || file.name || 'Generated File',
                            filename: file.filename || file.name,
                            mime: file.mime || 'image/png',
                            thumbnail: file.thumbnail,
                            type: 'generated',
                            placeholder: true,
                            conversationId: msg.conversationId,
                            conversationTitle: msg.conversationTitle || 'Untitled',
                            createdAt: msg.createdAt,
                            messageId: msg.id,
                            index: idx,
                            width: file.width,
                            height: file.height,
                        });
                    });
                }
            });

            const total = skip + artifacts.length + (hasMore ? 1 : 0);
            return res.json({ artifacts, pagination: { page, limit: ARTIFACT_PAGE_SIZE, total, hasMore } });
        } catch (e) {
            console.error('[ARTIFACTS] Fetch error:', e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.delete('/conversations/:conversationId/messages/:messageId', middleware, async (req, res) => {
        try {
            const appUserId = req.appUserId!;
            const conversationId = req.params.conversationId as string;
            const messageId = parseInt(req.params.messageId as string, 10);
            if (!conversationId || isNaN(messageId)) return res.status(400).json({ message: 'Invalid parameters' });
            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, userId: appUserId },
                select: { id: true },
            });
            if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
            const message = await prisma.message.findFirst({
                where: { id: messageId, conversationId },
                select: { id: true },
            });
            if (!message) return res.status(404).json({ message: 'Message not found' });
            await prisma.message.delete({ where: { id: messageId } });
            broadcastSyncEvent(req.userId!, { type: 'message_deleted', conversationId, messageId });
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Delete message error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.delete('/conversations/:conversationId', middleware, async (req, res) => {
        try {
            const appUserId = req.appUserId!;
            const conversationId = req.params.conversationId as string;
            if (!conversationId) return res.status(400).json({ message: 'conversationId is required' });
            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, userId: appUserId },
                select: { id: true },
            });
            if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
            await prisma.$transaction([
                prisma.task.deleteMany({ where: { conversationId } }),
                prisma.message.deleteMany({ where: { conversationId } }),
                prisma.conversation.delete({ where: { id: conversationId } }),
            ]);
            sandboxManager.kill(conversationId);
            broadcastSyncEvent(req.userId!, { type: 'conversation_deleted', id: conversationId });
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Delete conversation error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.patch('/conversations/:conversationId', middleware, async (req, res) => {
        try {
            const appUserId = req.appUserId!;
            const conversationId = req.params.conversationId as string;
            const { title } = req.body as { title?: string };
            if (!conversationId) return res.status(400).json({ message: 'conversationId is required' });
            if (!title || !title.trim()) return res.status(400).json({ message: 'title is required' });

            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, userId: appUserId },
                select: { id: true },
            });
            if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

            const slug =
                title
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '') || `thread-${Date.now()}`;
            const updated = await prisma.conversation.update({
                where: { id: conversationId },
                data: { title: title.trim(), slug },
                select: { id: true, title: true, slug: true },
            });

            broadcastSyncEvent(req.userId!, { type: 'conversation_updated', id: conversationId, title: updated.title });
            return res.status(200).json({ conversation: updated });
        } catch (error) {
            console.error('Update conversation error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}
