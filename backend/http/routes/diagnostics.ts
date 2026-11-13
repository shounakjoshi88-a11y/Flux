/**
 * Diagnostics and system routes: ping, health, whoami, the tool list, the
 * skill files, model discovery and the permission answer endpoint.
 *
 * /ping and /api/tools are intentionally unauthenticated: they are the
 * readiness probes and the browser's tool inspector.
 */
import { Router } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { middleware } from '../middleware/auth';
import type { RoutesContext } from './context';

/** Skill files exposed at /skills/:name. Anything not here is rejected. */
const SKILL_FILES: Record<string, string> = {
    pdf: 'pdf-skill.md',
    pptx: 'pptx-skill.md',
    docx: 'docx-skill.md',
    xlsx: 'xlsx-skill.md',
    csv: 'csv-skill.md',
    tsv: 'tsv-skill.md',
    md: 'md-skill.md',
    json: 'json-skill.md',
    sql: 'sql-skill.md',
    html: 'html-skill.md',
    tech: 'tech-writer-skill.md',
    finance: 'finance-skill.md',
    coder: 'coder-skill.md',
    creative: 'creative-skill.md',
    legal: 'legal-skill.md',
};

export function createDiagnosticsRouter(ctx: RoutesContext): Router {
    const router = Router();
    const { env, isSmoke, healthSecret, prisma, toolRegistry, resolvePermission, availableModels } = ctx;

    router.get('/ping', (_req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });

    router.get('/whoami', middleware, (req, res) => {
        console.log(`[WHOAMI] Request from ${req.appUserId}`);
        res.json({
            appUserId: req.appUserId,
            supabaseUserId: req.userId,
            email: req.authUser?.email,
        });
    });

    router.get('/health', async (req, res) => {
        if (isSmoke) return res.status(200).json({ status: 'ok', db: 'skipped', mode: 'smoke' });

        const provided = req.headers['x-health-secret'];
        if (typeof provided !== 'string') return res.status(404).send('Not Found');

        const pb = Buffer.from(provided);
        const sb = Buffer.from(healthSecret);
        if (pb.length !== sb.length || !crypto.timingSafeEqual(pb, sb)) {
            return res.status(404).send('Not Found');
        }
        try {
            await prisma.$queryRaw`SELECT 1`;
            res.status(200).json({ status: 'ok', db: 'connected' });
        } catch (e) {
            console.error('Health check failed:', e);
            res.status(503).json({ status: 'degraded', db: 'disconnected' });
        }
    });

    router.get('/api/tools', (_req, res) => {
        res.json({ tools: toolRegistry.getToolList() });
    });

    router.get('/skills/:name', (req, res) => {
        const safeName = (req.params.name as string).replace(/[^a-z0-9-]/g, '').slice(0, 80);
        if (!safeName) return res.status(400).send('# Invalid\n');
        const p = path.join(__dirname, '..', '..', 'skills', `${safeName}.md`);
        if (!fs.existsSync(p)) return res.status(404).send('# Not found\n');
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.sendFile(p);
    });

    router.get('/api/models', (_req, res) => {
        res.json({ categories: availableModels, all: availableModels.flatMap((c) => c.models) });
    });

    router.post('/api/permissions/respond', middleware, async (req: any, res: any) => {
        const { id, approved } = req.body || {};
        if (!id) return res.status(400).json({ error: 'Missing permission id' });
        const outcome = resolvePermission(id, req.appUserId!, approved);
        if (outcome === 'not_found') return res.status(404).json({ error: 'Permission request not found or expired' });
        if (outcome === 'forbidden') return res.status(403).json({ error: 'Not your permission request' });
        res.json({ success: true });
    });

    return router;
}

/** The skill allow-list, for callers that need to validate a skill name. */
export { SKILL_FILES };
