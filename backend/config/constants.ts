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

export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Conversation-Id',
  'x-health-secret',
];

export const CORS_METHODS = ['GET', 'POST', 'DELETE', 'OPTIONS'];
