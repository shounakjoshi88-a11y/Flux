/**
 * Convenience wrapper around SyncManager.broadcast.
 *
 * Fire-and-forget: a failed broadcast is logged but never fails the request.
 */

import { syncManager } from './SyncManager';
import type { SyncEvent } from './types';

export function broadcastSyncEvent(supabaseUserId: string, payload: SyncEvent): void {
    syncManager.broadcast(supabaseUserId, payload).catch((e: unknown) => {
        console.error('[SYNC] Broadcast error:', (e as Error)?.message || e);
    });
}
