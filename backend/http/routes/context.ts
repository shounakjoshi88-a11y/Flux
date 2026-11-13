/**
 * What the route modules need from the app.
 *
 * Routers are factories that take this context instead of reaching into module
 * state in the entry point, so a route group can be read, moved and tested on
 * its own.
 */
import type { Env } from '../../config/env';
import type { prisma } from '../../db/prisma';
import type { toolRegistry } from '../../agents/tools/registry';
import type { resolvePermission } from '../../agents/permissions';
import type { wikiManager } from '../../services/wiki/manager';
import type { sandboxManager } from '../../sandbox/sandboxManager';
import type { availableModels } from './catalog';
import type { SyncEvent } from '../../sync';

export interface RoutesContext {
    env: Env;
    isSmoke: boolean;
    /** Empty when HEALTH_SECRET is unset, which means /health answers 404. */
    healthSecret: string;
    prisma: typeof prisma;
    toolRegistry: typeof toolRegistry;
    resolvePermission: typeof resolvePermission;
    wikiManager: typeof wikiManager;
    sandboxManager: typeof sandboxManager;
    availableModels: typeof availableModels;
    /** Tell other devices about a conversation change. */
    broadcastSyncEvent: (supabaseUserId: string, payload: SyncEvent) => void;
}
