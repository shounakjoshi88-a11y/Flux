/**
 * Flux backend entry point.
 *
 * Build the app, start listening. Everything else lives in app.ts and server.ts.
 */
import { assertEnv } from './config/env';
import { startServer } from './server';

assertEnv();

startServer().catch((error) => {
    console.error('[BOOT] Failed to start:', error?.message ?? error);
    process.exit(1);
});
