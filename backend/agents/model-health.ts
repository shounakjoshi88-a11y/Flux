// Rolling-window model health tracker for circuit breaker
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 3;
const HEALTHY_COOLDOWN_MS = 5 * 60 * 1000;

// Models retired/unavailable on NVIDIA NIM as of 2026-11-14 (all return
// Gone / Not Found). Marked permanently unhealthy so the fallback chain
// does not spend a failed request on every one of them before reaching a
// live model on every single user message. Re-test with a fresh call
// before re-adding.
const RETIRED_MODELS = new Set([
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'kimi-k2.6',
  'llama-4-maverick',
  'mistral-large-675b',
  'mistral-medium-3.5-128b',
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

export function getShortTimeout(modelId: string): number {
    return isModelHealthy(modelId) ? 30000 : 10000;
}
