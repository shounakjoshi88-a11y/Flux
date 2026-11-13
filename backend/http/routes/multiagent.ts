/**
 * Multi-agent build route.
 *
 * Streams build progress and the final result as SSE. The build runs in a
 * live sandbox and reports status through an onStatus callback.
 */
import { Router } from 'express';
import * as crypto from 'crypto';
import { middleware } from '../middleware/auth';
import { runMultiAgentBuild } from '../../orchestrator-multiagent';

export function createMultiAgentRouter(): Router {
    const router = Router();

    router.post('/api/multiagent-build', middleware, async (req: any, res: any) => {
        const { projectDescription } = req.body;
        if (!projectDescription) return res.status(400).json({ error: 'projectDescription required' });

        const buildId = crypto.randomUUID();
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const onStatus = (event: string, data: any) => {
            if (!res.writableEnded) {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            }
        };

        try {
            const result = await runMultiAgentBuild({ buildId, projectDescription }, onStatus);
            if (!res.writableEnded) {
                res.write(`event: final_result\ndata: ${JSON.stringify(result)}\n\n`);
            }
        } catch (e: any) {
            if (!res.writableEnded) {
                res.write(`event: error\ndata: ${JSON.stringify({ message: e?.message || 'Build failed' })}\n\n`);
            }
        }
        if (!res.writableEnded) res.end();
    });

    return router;
}
