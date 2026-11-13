/**
 * Rate limiters.
 *
 * `global` applies to every request. `ai` and `newConversation` key on the
 * local user id, which auth middleware sets, and fall back to a shared
 * "local" bucket for unauthenticated traffic.
 */
import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '../../config/constants';

const keyByUser = (req: any) => req.appUserId || 'local';

export const globalLimiter = rateLimit(RATE_LIMITS.global);

export const aiLimiter = rateLimit({
    ...RATE_LIMITS.ai,
    keyGenerator: keyByUser,
});

export const newConvLimiter = rateLimit({
    ...RATE_LIMITS.newConversation,
    keyGenerator: keyByUser,
});
