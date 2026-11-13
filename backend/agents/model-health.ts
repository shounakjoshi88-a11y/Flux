// Rolling-window model health tracker for circuit breaker
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 3;
const HEALTHY_COOLDOWN_MS = 5 * 60 * 1000;

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
