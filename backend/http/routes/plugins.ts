/**
 * Plugins routes.
 *
 * GET    /api/plugins              → catalog + install state
 * POST   /api/plugins/:id/install  → install (idempotent)
 * DELETE /api/plugins/:id          → uninstall
 * PATCH  /api/plugins/:id/toggle   → enable/disable an installed plugin
 *
 * Installing a plugin force-enables its bundled skills in the catalog the
 * agent reads (see listSkillsForUser). Uninstalling restores per-skill toggles.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { prisma } from '../../db/prisma';
import { PLUGIN_CATALOG, getPlugin } from '../../services/plugins/catalog';

export function createPluginsRouter(): Router {
    const router = Router();

    async function installState(userId: string) {
        const installs = await prisma.pluginInstall.findMany({
            where: { userId },
            select: { pluginId: true, enabled: true, createdAt: true },
        });
        return new Map(installs.map((i) => [i.pluginId, i]));
    }

    router.get('/api/plugins', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const state = await installState(uid);
            const plugins = PLUGIN_CATALOG.map((p) => {
                const inst = state.get(p.id);
                return {
                    ...p,
                    installed: !!inst,
                    enabled: inst?.enabled ?? false,
                    installedAt: inst?.createdAt ?? null,
                };
            });
            return res.json({ plugins });
        } catch (e: any) {
            console.error('[PLUGINS] list failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/api/plugins/:id/install', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const id = String(req.params.id);
            if (!getPlugin(id)) return res.status(404).json({ message: 'Plugin not found in the catalog' });
            const row = await prisma.pluginInstall.upsert({
                where: { userId_pluginId: { userId: uid, pluginId: id } },
                update: { enabled: true },
                create: { userId: uid, pluginId: id, enabled: true },
            });
            return res.status(201).json({ pluginId: row.pluginId, enabled: row.enabled });
        } catch (e: any) {
            console.error('[PLUGINS] install failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.patch('/api/plugins/:id/toggle', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const id = String(req.params.id);
            const enabled = req.body?.enabled !== false;
            const r = await prisma.pluginInstall.updateMany({ where: { userId: uid, pluginId: id }, data: { enabled } });
            if (r.count === 0) return res.status(404).json({ message: 'Plugin not installed' });
            return res.json({ ok: true, enabled });
        } catch (e: any) {
            console.error('[PLUGINS] toggle failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.delete('/api/plugins/:id', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const id = String(req.params.id);
            const r = await prisma.pluginInstall.deleteMany({ where: { userId: uid, pluginId: id } });
            if (r.count === 0) return res.status(404).json({ message: 'Plugin not installed' });
            return res.json({ ok: true });
        } catch (e: any) {
            console.error('[PLUGINS] uninstall failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}
