// backend/huggingface-client.ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
export const hf = createOpenAICompatible({
    name: 'huggingface',
    baseURL: 'https://api-inference.huggingface.co/v1',
    headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
});