/**
 * Sandbox routes: upload a file into a conversation's workspace and download
 * one back out.
 *
 * Both check that the conversation belongs to the caller before touching the
 * sandbox, and both normalise the file name so it cannot escape the sandbox.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import type { RoutesContext } from './context';

export function createSandboxRouter(ctx: RoutesContext): Router {
    const router = Router();
    const { prisma, sandboxManager } = ctx;

    router.post('/api/sandbox/upload', middleware, async (req: any, res: any) => {
        try {
            const uid = req.appUserId!;
            const { conversationId, filename, content } = req.body;
            if (!conversationId || !filename || content === undefined) {
                return res.status(400).json({ error: 'conversationId, filename, and content required' });
            }
            const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: uid }, select: { id: true } });
            if (!conv) return res.status(404).json({ error: 'Conversation not found' });
            const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const remotePath = await sandboxManager.uploadFile(conversationId, safeName, Buffer.from(content, 'base64'));
            res.json({ success: true, filename: safeName, remotePath });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/sandbox/download/:conversationId/:filename', middleware, async (req: any, res: any) => {
        try {
            const uid = req.appUserId!;
            const { conversationId, filename } = req.params;
            const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: uid }, select: { id: true } });
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

    return router;
}
