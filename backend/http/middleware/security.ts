/**
 * The security and parsing stack, applied in the order Express needs.
 *
 * Kept as one function so the order cannot drift: a body parser added before
 * the security headers or after the router would silently change behaviour.
 */
import type { Express } from 'express';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { BODY_LIMIT } from '../../config/constants';
import { corsOptions } from '../../config/cors';

export function applySecurityMiddleware(app: Express): void {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'N/A'}`);
        next();
    });

    // Accurate client IPs behind a proxy.
    app.set('trust proxy', 1);

    app.use(helmet());

    // Skip compression on event streams: compression() buffers writes
    // internally, so SSE chunks don't reach the client until the response
    // ends ("answer appears all at once at the end"). Everything else is
    // compressed exactly as before.
    const SSE_PATHS = new Set([
        '/flux_ask',
        '/api/chat-sdk',
        '/v1/chat/completions',
        '/api/multiagent-build',
        '/summarize',
    ]);
    const compressionMiddleware = compression({ level: 6, threshold: 512 });
    app.use((req, res, next) => {
        if (SSE_PATHS.has(req.path)) return next();
        return compressionMiddleware(req, res, next);
    });
    app.use(cors(corsOptions));
    app.use(express.json({ limit: BODY_LIMIT }));
}
