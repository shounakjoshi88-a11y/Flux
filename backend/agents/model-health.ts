// Rolling-window model health tracker for circuit breaker
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 3;
const HEALTHY_COOLDOWN_MS = 5 * 60 * 1000;

// Models retired/unavailable on NVIDIA NIM as of 2026-11-15 (all return
// Gone / Not Found or accept the connection but never return a byte).
// Marked permanently unhealthy so the fallback chain does not spend a
// failed request on every one of them before reaching a live model on
// every single user message. Re-test with a fresh call before re-adding.
const RETIRED_MODELS = new Set([
  'deepseek-coder-6.7b-instruct',
  'minimax-m3.1-flash',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-v4.1-flash',
  'kimi-k2.6',
  'llama-4-maverick',
  'mistral-large-675b',
  'mistral-medium-3.5-128b',
  'mistral-large-4-1t-a52b',
  'glm-5.3-flash',
  'glm-5.2',
  'nemotron-3-super-120b-a12b',
  'nemotron-nano-12b-v2-vl',
  'step-3.5-flash',
  'step-3.7-flash',
  'minimax-m2.7',
  'minimax-m3',
  'sarvam-m',
  'stockmark-2-100b-instruct',
  'qwen3.5-397b-a17b',
  'inkling',
]);

interface ModelHealth {
    failures: number;
    lastFailure: number;
    lastSuccess: number;
    failureTimestamps: number[];
}

const modelHealth = new Map<string, ModelHealth>();

export function recordFailure(modelId: string) {
    const now = Date.now();
    const health = modelHealth.get(modelId) || { failures: 0, lastFailure: 0, lastSuccess: 0, failureTimestamps: [] };
    health.failures++;
    health.lastFailure = now;
    health.failureTimestamps.push(now);
    // Keep only failures within the window
    health.failureTimestamps = health.failureTimestamps.filter(t => now - t < FAILURE_WINDOW_MS);
    modelHealth.set(modelId, health);
}

export function recordSuccess(modelId: string) {
    const now = Date.now();
    const health = modelHealth.get(modelId) || { failures: 0, lastFailure: 0, lastSuccess: 0, failureTimestamps: [] };
    health.lastSuccess = now;
    modelHealth.set(modelId, health);
}

export function isModelHealthy(modelId: string): boolean {
    if (RETIRED_MODELS.has(modelId)) return false;
    const health = modelHealth.get(modelId);
    if (!health) return true;
    const now = Date.now();
    const recentFailures = health.failureTimestamps.filter(t => now - t < FAILURE_WINDOW_MS).length;
    if (recentFailures >= MAX_FAILURES) {
        const timeSinceLastFailure = now - health.lastFailure;
        return timeSinceLastFailure > HEALTHY_COOLDOWN_MS;
    }
    return true;
}

// Cap on how long a healthy model may take to start responding (headers /
// first stream). NIM cold starts for large models routinely exceed 30 s,
// so the old 30 s default cut off models that were alive but slow — with
// zero output produced and an automatic fallback to another maybe-dead
// model. Override with MODEL_STREAM_TIMEOUT_MS. Unhealthy models stay
// on a short leash so a known-dead endpoint fails fast.
const MODEL_STREAM_TIMEOUT_MS = Number(process.env.MODEL_STREAM_TIMEOUT_MS) || 180_000;

export function getShortTimeout(modelId: string): number {
    return isModelHealthy(modelId) ? MODEL_STREAM_TIMEOUT_MS : 10_000;
}
