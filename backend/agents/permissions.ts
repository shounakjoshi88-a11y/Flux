/**
 * Pending tool-permission requests.
 *
 * A tool that needs user approval creates a request and awaits the boolean.
 * The approval arrives over HTTP (`POST /api/permissions/respond`), which calls
 * resolvePermission. Requests that nobody answers are approved after
 * PERMISSION_TIMEOUT so an abandoned tab cannot wedge a request forever.
 *
 * State is per-process and in-memory, so this does not survive a restart and
 * does not work across multiple server instances.
 *
 * NOTE: nothing in the current codebase calls createPermissionRequest - the
 * live approval path is AgentSession in agent-protocol/session.ts. This module
 * is kept because the HTTP route that resolves it is still registered; see
 * TRACKER.md, "permissions route can never succeed".
 */

export interface PendingPermission {
    id: string;
    toolName: string;
    args: any;
    description: string;
    userId: string;
    resolve: (approved: boolean) => void;
    timestamp: number;
}

export const PERMISSION_TIMEOUT = 60_000;

const pendingPermissions = new Map<string, PendingPermission>();

/** Deny anything that has outlived the timeout, in case its own timer was lost. */
setInterval(() => {
    const now = Date.now();
    for (const [id, perm] of pendingPermissions) {
        if (now - perm.timestamp > PERMISSION_TIMEOUT) {
            perm.resolve(false);
            pendingPermissions.delete(id);
        }
    }
}, 30_000);

/**
 * Ask the user for permission to run a tool.
 * Resolves true when approved, false when denied or swept.
 */
export function createPermissionRequest(
    uid: string,
    toolName: string,
    args: any,
    description: string,
): Promise<boolean> {
    return new Promise((resolve) => {
        const id = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        pendingPermissions.set(id, {
            id,
            toolName,
            args,
            description,
            userId: uid,
            resolve,
            timestamp: Date.now(),
        });
        // Safety valve: an unanswered request is approved rather than left hanging.
        setTimeout(() => {
            const perm = pendingPermissions.get(id);
            if (perm) {
                perm.resolve(true);
                pendingPermissions.delete(id);
            }
        }, PERMISSION_TIMEOUT);
    });
}

export type ResolveOutcome = 'ok' | 'not_found' | 'forbidden';

/** Apply an answer from the client. Only the user who was asked may answer. */
export function resolvePermission(id: string, userId: string, approved: boolean): ResolveOutcome {
    const perm = pendingPermissions.get(id);
    if (!perm) return 'not_found';
    if (perm.userId !== userId) return 'forbidden';
    perm.resolve(Boolean(approved));
    pendingPermissions.delete(id);
    return 'ok';
}

/** Number of questions currently waiting on a user. */
export function pendingPermissionCount(): number {
    return pendingPermissions.size;
}
