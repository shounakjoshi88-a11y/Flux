// voice-client.ts – Free STT/TTS via NVIDIA NIM
import { nim } from './nim-client';

const ASR_MODEL = 'nvidia/parakeet-1.1b-rnnt-multilingual-asr';
const TTS_MODEL = 'nvidia/magpie-tts-multilingual';

export async function transcribeAudio(audioBase64: string): Promise<string> {
    // NIM ASR expects a specific format; the model may accept audio passed as a message.
    // For simplicity, use a direct API call (OpenAI‑style audio transcription endpoint).
    const res = await fetch('https://integrate.api.nvidia.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.NIM_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: ASR_MODEL,
            audio: audioBase64,
            response_format: 'text',
        }),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.text();
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
    // TTS via NIM: the model expects a prompt and returns audio bytes.
    const model = nim.chatModel(TTS_MODEL);
    const { text: audioBase64 } = await model.generate({
        prompt: text,
    });
    return Buffer.from(audioBase64, 'base64');
}