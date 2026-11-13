/**
 * CORS policy.
 *
 * `origin: true` reflects whatever origin asked, which is what the deployed
 * frontend needs today because it runs on several Vercel domains. The parsed
 * allow-list is exported so the policy can be tightened to it without hunting
 * for the default string again. See TRACKER.md, "CORS reflects any origin".
 */
import { env } from './env';
import { CORS_ALLOWED_HEADERS, CORS_EXPOSED_HEADERS, CORS_METHODS } from './constants';

export const allowedOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const corsOptions = {
    origin: true,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    credentials: true,
};
