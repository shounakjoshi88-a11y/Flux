/**
 * Google integration routes.
 *
 * The callback is unauthenticated on purpose: Google redirects to it. The
 * other three require a bearer token and hand straight to the auth module.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import {
    initGoogleAuth,
    handleGoogleCallback,
    getGoogleStatus,
    disconnectGoogle,
} from '../../services/google/auth';

export function createIntegrationsRouter(): Router {
    const router = Router();

    router.get('/api/integrations/google/callback', handleGoogleCallback);
    router.post('/api/integrations/google/init', middleware, initGoogleAuth);
    router.get('/api/integrations/google/status', middleware, getGoogleStatus);
    router.post('/api/integrations/google/disconnect', middleware, disconnectGoogle);

    return router;
}
