import { nim } from './nim-client';
import { generateText } from 'ai';

const SAFETY_MODEL = 'nvidia/nemotron-3-content-safety'; // free endpoint

export async function checkContentSafety(userQuery: string): Promise<boolean> {
    // Build a prompt that asks the safety model to evaluate
    const prompt = `Safety evaluation:
User query: "${userQuery}"
Classify the user query as either SAFE or UNSAFE.
Consider categories: violence, hate speech, self-harm, sexual content, child safety, illegal activities, harassment, etc.
Respond with only the word "SAFE" or "UNSAFE".`;

    const model = nim.chatModel(SAFETY_MODEL);
    const { text } = await generateText({
        model,
        prompt,
        maxTokens: 5,
    });

    const verdict = text.trim().toUpperCase();
    return verdict === "SAFE";
}