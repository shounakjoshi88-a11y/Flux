/**
 * Express application assembly.
 *
 * Everything that turns a bare Express instance into the Flux backend: the
 * security stack, the rate limiter, every route group, and the error handler.
 * No listening happens here - that is server.ts's job.
 */
import express from 'express';
import * as path from 'path';
import { env, isSmoke } from './config/env';
import { applySecurityMiddleware } from './http/middleware/security';
import { globalLimiter } from './http/middleware/rate-limit';
import { broadcastSyncEvent } from './sync/broadcast';
import { prisma } from './db/prisma';
import { toolRegistry } from './agents/tools/registry';
import { resolvePermission } from './agents/permissions';
import { wikiManager } from './services/wiki/manager';
import { sandboxManager } from './sandbox/sandboxManager';
import { availableModels } from './http/routes/catalog';
import type { RoutesContext } from './http/routes/context';

import { createDiagnosticsRouter } from './http/routes/diagnostics';
import { createIntegrationsRouter } from './http/routes/integrations';
import { createSandboxRouter } from './http/routes/sandbox';
import { createWikiRouter } from './http/routes/wiki';
import { taskRouter } from './agents/task/routes';
import { createConversationsRouter } from './http/routes/conversations';
import { createNewsRouter } from './http/routes/news';
import { createMemoriesRouter } from './http/routes/memories';
import { createFluxAskRouter } from './http/routes/flux-ask';
import { createChatSdkRouter } from './http/routes/chat-sdk';
import { createTtsRouter } from './http/routes/tts';
import { createArticlesRouter } from './http/routes/articles';
import { createOpenAICompatRouter } from './http/routes/openai-compat';
import { createMultiAgentRouter } from './http/routes/multiagent';
import { createAgentsRouter } from './http/routes/agents';
import { createSkillsRouter } from './http/routes/skills';
import { createConnectorsRouter } from './http/routes/connectors';
import { createPluginsRouter } from './http/routes/plugins';

/** Build and configure the Express app. Idempotent. */
export function createApp(): express.Application {
    const app = express();

    const routesContext: RoutesContext = {
        env,
        isSmoke,
        healthSecret: env.HEALTH_SECRET ?? '',
        prisma,
        toolRegistry,
        resolvePermission,
        availableModels,
        wikiManager,
        sandboxManager,
        broadcastSyncEvent,
    };

    applySecurityMiddleware(app);
    app.use(globalLimiter);

    app.use(createDiagnosticsRouter(routesContext));
    app.use(createIntegrationsRouter());

    app.use(createSandboxRouter(routesContext));
    app.use(createWikiRouter(routesContext));
    app.use(taskRouter);

    app.use(createConversationsRouter(routesContext));
    app.use(createNewsRouter());
    app.use(createMemoriesRouter(routesContext));

    app.use(createFluxAskRouter());
    app.use(createChatSdkRouter());
    app.use(createTtsRouter());
    app.use(createArticlesRouter());
    app.use(createOpenAICompatRouter());
    app.use(createMultiAgentRouter());
    app.use(createAgentsRouter());
    app.use(createSkillsRouter());
    app.use(createConnectorsRouter());
    app.use(createPluginsRouter());

    // Last-resort error handler so a thrown handler becomes a 500, not a hang.
    app.use((err: any, _req: any, res: any, _next: any) => {
        console.error('[APP] Unhandled error:', err?.message ?? err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return app;
}
