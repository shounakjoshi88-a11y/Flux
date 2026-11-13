/**
 * SSE connection bookkeeping.
 *
 * Keeps at most MAX_SSE_PER_USER streams per user, and re-checks the bearer
 * token on every open stream so a revoked session stops receiving output.
 */
import type { Request, Response } from 'express';
import { createSupabaseClient } from '../../client';
import { MAX_SSE_PER_USER, SSE_REVALIDATE_MS } from '../../config/constants';

const supabaseAdmin = createSupabaseClient();
const sseConnections = new Map<string, Set<Response>>();

export function activeConnectionCount(): number {
    let total = 0;
    for (const set of sseConnections.values()) total += set.size;
    return total;
}

export function trackSseConnection(uid: string, req: Request, res: Response): void {
    if (!sseConnections.has(uid)) sseConnections.set(uid, new Set());
    const conns = sseConnections.get(uid)!;

    if (conns.size >= MAX_SSE_PER_USER) {
        conns.forEach((connection) => {
            try {
                connection.end();
            } catch {
                /* the socket is already gone */
            }
        });
        conns.clear();
    }

    conns.add(res);

    const token = req.headers.authorization?.replace('Bearer ', '');
    const revalidateTimer = setInterval(async () => {
        if (res.writableEnded) {
            clearInterval(revalidateTimer);
            return;
        }
        if (!token) {
            res.end();
            return;
        }
        try {
            const {
                data: { user },
            } = await supabaseAdmin.auth.getUser(token);
            if (!user) res.end();
        } catch {
            res.end();
        }
    }, SSE_REVALIDATE_MS);

    req.on('close', () => {
        clearInterval(revalidateTimer);
        conns.delete(res);
        if (conns.size === 0) sseConnections.delete(uid);
    });
}
