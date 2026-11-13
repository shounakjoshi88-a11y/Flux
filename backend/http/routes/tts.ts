/**
 * Local text-to-speech proxy.
 *
 * The Piper binary is an optional, platform-specific install, so it is loaded
 * lazily and the route fails with a clear message when it is absent.
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';

export function createTtsRouter(): Router {
    const router = Router();

    router.post('/api/tts/local', middleware, async (req, res) => {
        try {
            const { text } = req.body as { text?: string };
            if (!text) return res.status(400).json({ error: 'text is required' });
            const safeText = text.slice(0, 5000);

            const { ensureModel, findPiperBinary, synthesizeToWav } = await import('../../tts-local');
            const piperPath = findPiperBinary();
            if (!piperPath) {
                return res.status(500).json({
                    error: 'Piper TTS binary not found. Download it from https://github.com/rhasspy/piper/releases and place piper.exe in backend/tts/ or add it to PATH.',
                });
            }

            const wav = await synthesizeToWav(safeText, piperPath);
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Content-Length', wav.length);
            res.end(wav);
        } catch (error: any) {
            console.error('Local TTS error:', error);
            if (!res.headersSent) res.status(500).json({ error: error.message || 'Local TTS failed' });
        }
    });

    return router;
}
