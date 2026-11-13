#!/usr/bin/env node
/**
 * Boot smoke test.
 *
 * Starts the backend with placeholder credentials, waits for it to listen,
 * then requests every GET route it can safely reach. A handler that fails to
 * import, or a module that throws while wiring up, shows up as a 5xx or as a
 * boot timeout.
 *
 * Usage: node backend/scripts/smoke.mjs [--boot-only]
 *
 * Budget: one process, 30s boot ceiling, 5s per request, 60 requests max.
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..');
const REPO = join(BACKEND, '..');
const PORT = 3901;
const BOOT_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUESTS = 60;

const env = {
    ...process.env,
    SMOKE_MODE: '1',
    NODE_ENV: 'test',
    PORT: String(PORT),
    // Placeholders: nothing connects at import time, and the smoke path never queries.
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://smoke:smoke@127.0.0.1:9/flux',
    SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:9',
    SUPABASE_API_SECRET: process.env.SUPABASE_API_SECRET || 'smoke',
    NIM_API_KEY: process.env.NIM_API_KEY || 'smoke',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY || 'smoke',
    E2B_API_KEY: process.env.E2B_API_KEY || 'smoke',
};

const child = spawn(process.env.BUN_BIN || 'bun', ['index.ts'], {
    cwd: BACKEND,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
});

let output = '';
const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not listen within ${BOOT_TIMEOUT_MS}ms`)), BOOT_TIMEOUT_MS);
    const onData = (chunk) => {
        output += chunk.toString();
        if (/Flux backend running on/.test(output)) {
            clearTimeout(timer);
            resolve();
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited during boot (code ${code})\n${output.slice(-2000)}`));
    });
});

/**
 * Shut the server down and exit.
 *
 * The child is killed and then waited for: on Windows, exiting while the
 * process handle is still closing trips a libuv assertion inside Bun.
 */
function stop(code) {
    if (child.exitCode !== null || child.signalCode !== null) {
        process.exit(code);
    }
    child.once('exit', () => process.exit(code));
    try {
        child.kill('SIGTERM');
    } catch {
        process.exit(code);
    }
    // Do not hang forever if the child ignores the signal.
    setTimeout(() => process.exit(code), 3000).unref();
}

try {
    await ready;
    console.log('smoke: server listening');
} catch (error) {
    console.error(`smoke: boot failed\n${error.message}`);
    stop(1);
}

const inventoryPath = join(REPO, 'docs', 'refactor', 'routes.json');
const paths = new Set(['/ping']);
if (existsSync(inventoryPath)) {
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    for (const route of inventory.routes) {
        if (route.key.startsWith('GET /')) paths.add(route.key.slice(4));
    }
}

let checked = 0;
let failed = 0;
for (const path of [...paths].slice(0, MAX_REQUESTS)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: controller.signal });
        checked += 1;
        if (response.status >= 500) {
            failed += 1;
            console.error(`smoke: ${path} -> ${response.status}`);
        }
    } catch (error) {
        failed += 1;
        console.error(`smoke: ${path} -> ${error.name === 'AbortError' ? 'timeout' : error.message}`);
    } finally {
        clearTimeout(timer);
    }
}

console.log(`smoke: ${checked} route(s) checked, ${failed} failure(s)`);
if (process.argv.includes('--boot-only')) {
    console.log('smoke: boot-only mode, ignoring route failures');
    stop(0);
}
stop(failed === 0 ? 0 : 1);
