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
    app.use(compression({ level: 6, threshold: 512 }));
    app.use(cors(corsOptions));
    app.use(express.json({ limit: BODY_LIMIT }));
}
