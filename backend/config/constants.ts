/**
 * Tunables that used to be buried mid-file in index.ts.
 * Anything here is a number or a fixed list; anything environment-dependent
 * lives in config/env.ts.
 */

/** Request body ceiling. File attachments and transcripts arrive as base64. */
export const BODY_LIMIT = '50mb';

/** Maximum concurrent SSE streams per user. Older streams are closed. */
export const MAX_SSE_PER_USER = 5;

/** How often an open SSE stream re-checks that its bearer token is still valid. */
export const SSE_REVALIDATE_MS = 60_000;

export const RATE_LIMITS = {
  global: { windowMs: 15 * 60 * 1000, max: 200 },
  ai: { windowMs: 60 * 1000, max: 10, message: { error: 'Too many requests' } },
  newConversation: { windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many new threads' } },
} as const;

/** Headers the frontend is allowed to read off a response. */
export const CORS_EXPOSED_HEADERS = ['X-Conversation-Id', 'X-Conversation-Slug'];

/** Default wall for sandboxed code execution (pip, builds, test suites,
 *  game engines). 30 minutes; override with SANDBOX_EXEC_TIMEOUT_MS. */
export const EXEC_TIMEOUT_MS = Number.parseInt(process.env.SANDBOX_EXEC_TIMEOUT_MS ?? '1800000', 10) || 1800000;

/** Wall for heavy orchestrator phases (npm install, npm run build). */
export const ORCHESTRATOR_TIMEOUT_MS = Number.parseInt(process.env.ORCHESTRATOR_TIMEOUT_MS ?? '900000', 10) || 900000;

export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Conversation-Id',
  'x-health-secret',
];

export const CORS_METHODS = ['GET', 'POST', 'DELETE', 'OPTIONS'];
