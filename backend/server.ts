/**
 * HTTP/HTTPS server bootstrap.
 *
 * Creates the server from the configured app, attaches the Agent Protocol
 * WebSocket handler, seeds the search cache, recovers interrupted tasks and
 * starts listening.
 */
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { isSmoke } from './config/env';
import { prisma } from './db/prisma';
import { Prisma } from './prisma/generated/client';
import { createAgentWebSocket } from './agent-protocol';
import { recoverInterruptedTasks } from './task-routes';
import { createApp } from './app';

export async function startServer(): Promise<void> {
    const app = createApp();

    const certPath = path.join(__dirname, '..', 'certs');
    let server: http.Server | https.Server;
    if (fs.existsSync(path.join(certPath, 'cert.pem')) && fs.existsSync(path.join(certPath, 'key.pem'))) {
        const tlsOpts = {
            cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
            key: fs.readFileSync(path.join(certPath, 'key.pem')),
        };
        server = https.createServer(tlsOpts, app);
        console.log('[TLS] HTTPS enabled');
    } else {
        server = http.createServer(app);
        console.log('[TLS] HTTPS disabled — cert.pem/key.pem not found in ../certs');
    }

    // Attach Agent Protocol WebSocket handler.
    createAgentWebSocket(server as any);

    // Seed search cache from recent DB history (non-blocking).
    if (!isSmoke) {
        (async () => {
            try {
                const { seedCacheFromHistory } = await import('./search-cache');
                const recentMsgs = await prisma.message.findMany({
                    where: { sources: { not: Prisma.DbNull }, role: 'Assistant' },
                    orderBy: { createdAt: 'desc' },
                    take: 100,
                    select: { id: true, sources: true, conversationId: true, createdAt: true },
                });
                const entries: { query: string; sources: { url: string; content?: string }[]; content: string }[] = [];
                for (const msg of recentMsgs) {
                    const sources = (msg.sources as any[]) || [];
                    if (sources.length === 0) continue;
                    const prevUser = await prisma.message.findFirst({
                        where: { conversationId: msg.conversationId, role: 'User', createdAt: { lt: msg.createdAt } },
                        orderBy: { createdAt: 'desc' },
                        select: { content: true },
                    });
                    if (!prevUser) continue;
                    const query = prevUser.content.slice(0, 500);
                    const srcs = sources.map((s: any) => ({ url: s.url, content: s.content || '' }));
                    entries.push({ query, sources: srcs, content: '' });
                }
                seedCacheFromHistory(entries);
            } catch (e) {
                console.warn('[CACHE] Seed from history skipped:', (e as any)?.message ?? e);
            }
        })();
    }

    // Recover any interrupted long-running tasks from previous server instances.
    if (!isSmoke) {
        recoverInterruptedTasks().then((count) => console.log('[TASK] Recovery pass complete'));
    }

    const proto = fs.existsSync(path.join(certPath, 'cert.pem')) ? 'https' : 'http';
    const PORT = parseInt(process.env.PORT || '3001', 10);
    server.listen(PORT, () => {
        console.log(`Flux backend running on ${proto}://localhost:${PORT}`);
    });
}
