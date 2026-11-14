/**
 * Connectors routes.
 *
 * GET    /api/connectors          → built-in Google connector (shared OAuth) + the user's custom MCP connectors
 * POST   /api/connectors          → add a custom MCP connector (validates https + live initialize handshake)
 * PATCH  /api/connectors/:id/toggle → enable/disable a custom connector
 * DELETE /api/connectors/:id      → remove a custom connector
 *
 * Google connectors reuse the existing /api/integrations/google/* flow —
 * one OAuth token covers Gmail, Calendar and Drive.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import { prisma } from '../../db/prisma';
import { McpRemoteClient } from '../../services/mcp/client';

export function createConnectorsRouter(): Router {
    const router = Router();

    router.get('/api/connectors', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const token = await prisma.userGoogleToken.findUnique({ where: { userId: uid } });
            const custom = await prisma.mcpConnector.findMany({
                where: { userId: uid },
                orderBy: { createdAt: 'asc' },
            });
            return res.json({
                builtin: [
                    {
                        id: 'google',
                        kind: 'builtin',
                        name: 'Google Workspace',
                        subtitle: 'Gmail · Google Calendar · Google Drive',
                        description: 'Search and read mail, manage events, search files and read docs.',
                        by: 'Google',
                        connected: !!token,
                        account: token?.email ?? null,
                    },
                ],
                custom: custom.map((c) => ({
                    id: c.id,
                    kind: 'custom',
                    name: c.name,
                    subtitle: new URL(c.url).hostname,
                    description: 'Custom MCP connector',
                    by: 'You',
                    url: c.url,
                    enabled: c.enabled,
                    addedAt: c.createdAt,
                })),
            });
        } catch (e: any) {
            console.error('[CONNECTORS] list failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/api/connectors', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const name = String(req.body?.name ?? '').trim();
            const url = String(req.body?.url ?? '').trim();
            if (!name) return res.status(400).json({ message: 'Name is required — it’s shown in the connectors list.' });
            if (name.length > 60) return res.status(400).json({ message: 'Name is too long (max 60 characters).' });
            if (!/^https:\/\/[^\s]+$/i.test(url)) {
                return res.status(400).json({ message: 'MCP server URL must be a valid https:// address.' });
            }

            // Live handshake before we store anything — a typo'd URL fails fast.
            try {
                const client = new McpRemoteClient(url, name, 8_000);
                const tools = await client.listTools();
                if (tools.length === 0) {
                    return res.status(400).json({ message: 'That server answered, but exposes no tools.' });
                }
            } catch (e: any) {
                return res.status(400).json({ message: `Could not reach an MCP server at that URL: ${e?.message ?? e}` });
            }

            const row = await prisma.mcpConnector.upsert({
                where: { userId_url: { userId: uid, url } },
                update: { name, enabled: true },
                create: { userId: uid, name, url, enabled: true },
            });
            return res.status(201).json({ connector: { id: row.id, name: row.name, url: row.url, enabled: row.enabled } });
        } catch (e: any) {
            console.error('[CONNECTORS] add failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.patch('/api/connectors/:id/toggle', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const id = String(req.params.id);
            const enabled = req.body?.enabled !== false;
            const r = await prisma.mcpConnector.updateMany({ where: { id, userId: uid }, data: { enabled } });
            if (r.count === 0) return res.status(404).json({ message: 'Connector not found' });
            return res.json({ ok: true, enabled });
        } catch (e: any) {
            console.error('[CONNECTORS] toggle failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.delete('/api/connectors/:id', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const id = String(req.params.id);
            const r = await prisma.mcpConnector.deleteMany({ where: { id, userId: uid } });
            if (r.count === 0) return res.status(404).json({ message: 'Connector not found' });
            return res.json({ ok: true });
        } catch (e: any) {
            console.error('[CONNECTORS] delete failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}
