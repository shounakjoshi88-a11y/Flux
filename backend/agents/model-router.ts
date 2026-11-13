/**
 * Model catalog and routing.
 *
 * NIM_MODELS is the single place a front-end model key maps to a provider
 * model id. selectModel wraps the chosen model in a fallback proxy: if the
 * primary fails or times out, it walks the catalog, healthy models first, and
 * retries. routeModel picks the tier from the query.
 */
import { nim } from '../nim-client';
import { isModelHealthy, recordFailure, recordSuccess, getShortTimeout } from '../model-health';

export const NIM_MODELS: Record<string, string> = {
    "llama-4-maverick": "meta/llama-4-maverick-17b-128e-instruct",
    "mistral-large-675b": "mistralai/mistral-large-3-675b-instruct-2512",
    "glm-5.2": "z-ai/glm-5.2",
    "kimi-k2.6": "moonshotai/kimi-k2.6",
    "nemotron-3-ultra-550b": "nvidia/nemotron-3-ultra-550b-a55b",
    "nemotron-3-nano-omni-30b-a3b-reasoning": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "mistral-medium-3.5-128b": "mistralai/mistral-medium-3.5-128b",
    "nemotron-3-super-120b-a12b": "nvidia/nemotron-3-super-120b-a12b",
    "deepseek-v4-flash": "deepseek-ai/deepseek-v4-flash",
    "step-3.7-flash": "stepfun-ai/step-3.7-flash",
    "qwen3.5-397b-a17b": "qwen/qwen3.5-397b-a17b",
    "step-3.5-flash": "stepfun-ai/step-3.5-flash",
    "minimax-m2.7": "minimaxai/minimax-m2.7",
    "minimax-m3": "minimaxai/minimax-m3",
    "deepseek-v4-pro": "deepseek-ai/deepseek-v4-pro",
    "sarvam-m": "sarvamai/sarvam-m",
    "stockmark-2-100b-instruct": "stockmark/stockmark-2-100b-instruct",
    "nemotron-nano-12b-v2-vl": "nvidia/nemotron-nano-12b-v2-vl",
    "inkling": "thinkingmachines/inkling",
    "laguna-xs-2.1": "poolside/laguna-xs-2.1",
};

// ── Vision-capable models ──────────────────────────────────
export const VISION_MODELS = new Set([
    "nemotron-nano-12b-v2-vl",
    "kimi-k2.6",
    "minimax-m3",
    "deepseek-v4-pro",
    "inkling",
]);

// ── selectModel returns a proper AI SDK model instance ──
export function createFallbackModel(primaryModel: any, preferredModelId: string | undefined, modelsMap: Record<string, string>): any {
    const getFallbackSequence = (prefId?: string) => {
        // Exclude the already-failed primary; healthy models first, unhealthy last
        const allKeys = Object.keys(modelsMap).filter(k => k !== prefId);
        const healthy = allKeys.filter(k => isModelHealthy(k));
        const unhealthy = allKeys.filter(k => !isModelHealthy(k));
        return [...healthy, ...unhealthy];
    };

    return new Proxy(primaryModel, {
        get(target: any, prop: string | symbol, receiver: any) {
            if (prop === 'doGenerate') {
                return async function(options: any) {
                    try {
                        console.log(`[MODEL FALLBACK] Trying primary model: ${preferredModelId || target.modelId}`);
                        const result = await target.doGenerate(options);
                        if (preferredModelId) recordSuccess(preferredModelId);
                        return result;
                    } catch (primaryError: any) {
                        if (preferredModelId) recordFailure(preferredModelId);
                        console.warn(`[MODEL FALLBACK] Primary model failed:`, primaryError?.message ?? primaryError);
                        const fallbackIds = getFallbackSequence(preferredModelId);
                        for (const fallbackId of fallbackIds) {
                            try {
                                console.log(`[MODEL FALLBACK] Trying fallback model: ${fallbackId}`);
                                const fallbackModel = nim.chatModel(modelsMap[fallbackId]!);
                                const fallbackOptions = { ...options, providerOptions: {} };
                                const result = await fallbackModel.doGenerate(fallbackOptions);
                                recordSuccess(fallbackId);
                                return result;
                            } catch (fallbackError: any) {
                                recordFailure(fallbackId);
                                console.warn(`[MODEL FALLBACK] Fallback model ${fallbackId} failed:`, fallbackError?.message ?? fallbackError);
                            }
                        }
                        throw primaryError;
                    }
                };
            }
            if (prop === 'doStream') {
                return async function(options: any) {
                    const modelTimeout = getShortTimeout(preferredModelId || 'unknown');
                    try {
                        console.log(`[MODEL FALLBACK] Trying primary model stream: ${preferredModelId || target.modelId} (timeout=${modelTimeout}ms)`);
                        const result = await Promise.race([
                            target.doStream(options),
                            new Promise<any>((_, reject) =>
                                setTimeout(() => reject(new Error(`[TIMEOUT] ${preferredModelId || 'primary'} no response within ${modelTimeout}ms`)), modelTimeout)
                            ),
                        ]);
                        if (preferredModelId) recordSuccess(preferredModelId);
                        return result;
                    } catch (primaryError: any) {
                        if (preferredModelId) recordFailure(preferredModelId);
                        if (primaryError.message?.includes('[TIMEOUT]')) {
                            console.warn(`[MODEL FALLBACK] Primary model ${preferredModelId || 'primary'} timed out (>${modelTimeout}ms) — falling back`);
                        } else {
                            console.warn(`[MODEL FALLBACK] Primary model stream failed:`, primaryError?.message ?? primaryError);
                        }
                        const fallbackIds = getFallbackSequence(preferredModelId);
                        for (const fallbackId of fallbackIds) {
                            try {
                                const fbTimeout = getShortTimeout(fallbackId);
                                console.log(`[MODEL FALLBACK] Trying fallback model stream: ${fallbackId} (timeout=${fbTimeout}ms)`);
                                const fallbackModel = nim.chatModel(modelsMap[fallbackId]!);
                                const fallbackOptions = { ...options, providerOptions: {} };
                                const result = await Promise.race([
                                    fallbackModel.doStream(fallbackOptions),
                                    new Promise<any>((_, reject) =>
                                        setTimeout(() => reject(new Error(`[TIMEOUT] ${fallbackId} no response within ${fbTimeout}ms`)), fbTimeout)
                                    ),
                                ]);
                                recordSuccess(fallbackId);
                                return result;
                            } catch (fallbackError: any) {
                                recordFailure(fallbackId);
                                console.warn(`[MODEL FALLBACK] Fallback model stream ${fallbackId} failed:`, fallbackError?.message ?? fallbackError);
                            }
                        }
                        throw primaryError;
                    }
                };
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}

export function selectModel(preferredModel: string | undefined): any {
    let primaryModel: any;
    let actualPref;
    if (preferredModel && NIM_MODELS[preferredModel]) {
        primaryModel = nim.chatModel(NIM_MODELS[preferredModel]);
        actualPref = preferredModel;
    } else {
        primaryModel = nim.chatModel('deepseek-ai/deepseek-v4-pro');
        actualPref = 'deepseek-v4-pro';
    }
    return createFallbackModel(primaryModel, actualPref, NIM_MODELS);
}

// ── routeModel — classifies and routes to appropriate model tier
export function routeModel(preferredModel: string | undefined, query: string, previousQuery?: string): {
    modelId: string;
    tier: string;
    score: number;
    wasRouted: boolean;
} {
    try {
        const { routeModel: rm } = require('../query-router');
        return rm(preferredModel, query, previousQuery);
    } catch {
        return { modelId: preferredModel || "deepseek-v4-pro", tier: "power", score: 0.5, wasRouted: false };
    }
}

// ── getProviderOptions – used only for thinking stream ──
export function getProviderOptions(modelId: string | undefined) {
    if (modelId === "deepseek-r1" || modelId === "deepseek-v4-flash") {
        return { nim: { enable_thinking: true } };
    }
    return {};
}

