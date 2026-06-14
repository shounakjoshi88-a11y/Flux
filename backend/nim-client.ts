// nim-client.ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const nim = createOpenAICompatible({
    name: 'nim',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    headers: {
        Authorization: `Bearer ${process.env.NIM_API_KEY}`,
    },
    // Add retry policy to handle transient 429 (Rate Limit) errors
    fetch: async (url, options) => {
        let retries = 0;
        const maxRetries = 3;
        
        while (retries <= maxRetries) {
            try {
                const response = await fetch(url, options);
                
                // If we get a 429 and have retries left, wait and try again
                if (response.status === 429 && retries < maxRetries) {
                    const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
                    console.warn(`[NIM] Rate limited (429). Retrying in ${Math.round(delay)}ms... (Attempt ${retries + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries++;
                    continue;
                }
                
                return response;
            } catch (error) {
                if (retries < maxRetries) {
                    const delay = Math.pow(2, retries) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries++;
                    continue;
                }
                throw error;
            }
        }
        return fetch(url, options); // Final fallback
    }
});