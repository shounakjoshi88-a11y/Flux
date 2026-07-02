// Uses a persistent Bun Worker to run BGE-M3 inference off the main thread.
// The worker is created once and stays warm; batched embeddings are handled via message passing.

import { Worker } from 'worker_threads';
import * as path from 'path';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: number[][]) => void; reject: (e: any) => void }>();
let warmResolve: (() => void) | null = null;
let warmPromise: Promise<void> | null = null;

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(path.join(__dirname, 'embedder-worker.ts'));
        worker.on('message', ({ id, embeddings, error }) => {
            const p = pending.get(id);
            if (!p) return;
            pending.delete(id);
            if (error) p.reject(new Error(error));
            else p.resolve(embeddings);
        });
        worker.on('error', (err) => {
            for (const [, p] of pending) p.reject(err);
            pending.clear();
            worker = null;
        });
        worker.on('exit', () => {
            if (pending.size > 0) {
                for (const [, p] of pending) p.reject(new Error('Embedder worker exited'));
                pending.clear();
            }
            worker = null;
        });
        warmPromise = null;
    }
    return worker;
}

/**
 * Pre-warm the embedder worker (call once at startup).
 */
export async function warmEmbedder(): Promise<void> {
    if (warmPromise) return warmPromise;
    warmPromise = new Promise((resolve) => {
        try {
            const w = getWorker();
            const id = nextId++;
            pending.set(id, { resolve: () => { resolve(); }, reject: () => { resolve(); } });
            w.postMessage({ id, texts: ['warmup'] });
        } catch {
            resolve();
        }
    });
    return warmPromise;
}

/**
 * Generate a single 1024-dimensional embedding.
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const embeddings = await getEmbeddings([text]);
    return embeddings[0]!;
}

/**
 * Generate 1024-dimensional embeddings for multiple texts in one batch.
 * Uses the Worker to keep ONNX inference off the main thread.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const id = nextId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ id, texts });
    });
}
