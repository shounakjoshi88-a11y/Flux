import { nim } from './nim-client';
import { embed, generateText } from 'ai';

const EMBED_MODEL = "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1";
const RERANK_MODEL = "nvidia/llama-3.2-nemoretriever-500m-rerank-v2";

function cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (normA * normB);
}

async function getEmbedding(text: string): Promise<number[]> {
    const model = nim.embeddingModel(EMBED_MODEL);
    const { embedding } = await embed({ model, value: text });
    return embedding as number[];
}

async function getRelevanceScore(query: string, passage: string): Promise<number> {
    const model = nim.chatModel(RERANK_MODEL);
    const prompt = `Query: ${query}\nPassage: ${passage}\nHow relevant is the passage to the query on a scale of 0 to 1? Only output the number.`;
    const { text } = await generateText({ model, prompt, maxTokens: 5 });
    return parseFloat(text.trim()) || 0;
}

export async function searchRAG(query: string, documents: string[]): Promise<string[]> {
    const queryEmbedding = await getEmbedding(query);
    const docEmbeddings = await Promise.all(documents.map(doc => getEmbedding(doc)));

    const rerankScores = await Promise.all(documents.map((doc, idx) =>
        getRelevanceScore(query, doc)
    ));

    const combined = documents.map((doc, idx) => ({
        doc,
        score: rerankScores[idx] ?? cosineSimilarity(queryEmbedding, docEmbeddings[idx]),
    }));
    combined.sort((a, b) => b.score - a.score);
    return combined.map(c => c.doc);
}