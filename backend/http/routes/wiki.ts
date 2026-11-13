/**
 * Wiki / knowledge graph routes.
 *
 * The wiki is built from concepts extracted out of past conversations. These
 * routes read the graph, search it, delete a node, and trigger a rebuild.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import type { RoutesContext } from './context';

export function createWikiRouter(ctx: RoutesContext): Router {
    const router = Router();
    const { wikiManager } = ctx;

    router.get('/api/wiki', middleware, async (req: any, res: any) => {
        try {
            const uid = req.appUserId!;
            const graph = await wikiManager.getGraph(uid);
            res.json(graph);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.delete('/api/wiki/node/:nodeId', middleware, async (req: any, res: any) => {
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

    router.get('/api/wiki/search', middleware, async (req: any, res: any) => {
        try {
            const uid = req.appUserId!;
            const query = (req.query.q as string) || '';
            const nodes = await wikiManager.searchConcepts(uid, query);
            res.json(nodes);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/wiki/rebuild/progress', middleware, async (req: any, res: any) => {
        const uid = req.appUserId!;
        const progress = wikiManager.getProgress(uid);
        res.json(progress || { phase: 'idle' });
    });

    router.post('/api/wiki/rebuild', middleware, async (req: any, res: any) => {
        try {
            const uid = req.appUserId!;
            const result = await wikiManager.rebuildAll(uid);
            res.json(result || { nodes: [], edges: [] });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}
