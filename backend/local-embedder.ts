// backend/local-embedder.ts
import { pipeline, env } from '@xenova/transformers';

// Store the model directly inside the project folder
env.cacheDir = './models_cache';

let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    // First call downloads ~1.2 GB into ./models_cache, then cached forever
    embedder = await pipeline('feature-extraction', 'Xenova/bge-m3');
  }
  return embedder;
}

/**
 * Generate a 1024‑dimensional embedding for the given text.
 * Runs completely offline after the first download.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: 'cls', normalize: true });
  return Array.from(output.data);
}