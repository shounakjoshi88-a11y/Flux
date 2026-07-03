// Persistent Bun Worker — loads BGE-M3 once, handles batched embedding requests off the main thread
import { parentPort } from 'worker_threads';
import { pipeline } from '@xenova/transformers';

let embedder: any = null;

async function getEmbedder() {
    if (!embedder) {
        embedder = await pipeline('feature-extraction', 'Xenova/bge-m3');
    }
    return embedder;
}

const dim = 1024;

parentPort!.on('message', async (msg: any) => {
    try {
        const pipe = await getEmbedder();
        const texts: string[] = Array.isArray(msg.texts) ? msg.texts : [msg.texts];
        const output = await pipe(texts, { pooling: 'cls', normalize: true });
        const embeddings: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
            const start = i * dim;
            embeddings.push(Array.from(output.data.slice(start, start + dim)));
        }
        parentPort!.postMessage({ id: msg.id, embeddings });
    } catch (err: any) {
        parentPort!.postMessage({ id: msg.id, error: err.message });
    }
});
