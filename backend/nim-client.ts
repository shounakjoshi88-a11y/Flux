// nim-client.ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const nim = createOpenAICompatible({
    name: 'nim',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    headers: {
        Authorization: `Bearer ${process.env.NIM_API_KEY}`,
    },
});