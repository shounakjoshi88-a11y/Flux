/**
 * What the route modules need from the app.
 *
 * Routers are factories that take this context instead of reaching into module
 * state in the entry point, so a route group can be read, moved and tested on
 * its own.
 */
import type { Env } from '../../config/env';
import type { prisma } from '../../db/prisma';
import type { toolRegistry } from '../../tool-registry';
import type { resolvePermission } from '../../agents/permissions';
import type { availableModels } from './catalog';

export interface RoutesContext {
    env: Env;
    isSmoke: boolean;
    /** Empty when HEALTH_SECRET is unset, which means /health answers 404. */
    healthSecret: string;
    prisma: typeof prisma;
    toolRegistry: typeof toolRegistry;
    resolvePermission: typeof resolvePermission;
    availableModels: typeof availableModels;
}
