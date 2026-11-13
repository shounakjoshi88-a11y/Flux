/**
 * Memory management routes.
 *
 * Memories are facts the system extracted from past conversations. The client
 * can list them and delete the ones it does not want kept.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import type { RoutesContext } from './context';

export function createMemoriesRouter(ctx: RoutesContext): Router {
    const router = Router();
    const { prisma } = ctx;

    router.get('/memories', middleware, async (req, res) => {
        try {
            const uid = req.appUserId!;
            console.log(`[MEMORIES] Fetching memories for appUserId: ${uid}`);
            const memories = await prisma.memory.findMany({
                where: { userId: uid },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    category: true,
                    fact: true,
                    importance: true,
                    accessCount: true,
                    createdAt: true,
                    sourceConversationId: true,
                },
            });
            console.log(`[MEMORIES] Found ${memories.length} memories for UID: ${uid}`);
            return res.json({ memories, debugUid: uid });
        } catch (e) {
            console.error('[MEMORIES] Fetch error:', e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.delete('/memories/:id', middleware, async (req, res) => {
        try {
            const uid = req.appUserId!;
            const id = req.params.id as string;
            const memory = await prisma.memory.findFirst({
                where: { id, userId: uid },
                select: { id: true },
            });
            if (!memory) return res.status(404).json({ message: 'Memory not found' });
            await prisma.memory.delete({ where: { id } });
            return res.json({ success: true });
        } catch (e) {
            console.error('[MEMORIES] Delete error:', e);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}
