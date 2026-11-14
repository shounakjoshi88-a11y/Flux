/**
 * Model catalog and routing.
 *
 * NIM_MODELS is the single place a front-end model key maps to a provider
 * model id. selectModel wraps the chosen model in a fallback proxy: if the
 * primary fails or times out, it walks the catalog, healthy models first, and
 * retries. routeModel picks the tier from the query.
 */
import { nim } from '../services/models/nim-client';
import { isModelHealthy, recordFailure, recordSuccess, getShortTimeout } from './model-health';

// Only models verified live on NVIDIA NIM (2026-11-14). Retired entries
// (see RETIRED_MODELS in model-health.ts) were removed; re-add after
// verifying with a fresh call.
export const NIM_MODELS: Record<string, string> = {
    "nemotron-3-ultra-550b": "nvidia/nemotron-3-ultra-550b-a55b",
    "nemotron-3-nano-omni-30b-a3b-reasoning": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "laguna-xs-2.1": "poolside/laguna-xs-2.1",
};

// ── Vision-capable models ──────────────────────────────────
// Verified live on NIM (2026-11-14): nemotron-3-nano-omni-30b-a3b-reasoning
// accepts image content parts and reads screenshots correctly. It emits
// reasoning-heavy output, so for image questions the backend runs a two-pass
// flow: this model describes the image, then the user's selected model writes
// the answer from that description.
export const VISION_MODEL_ID = 'nemotron-3-nano-omni-30b-a3b-reasoning';
export const VISION_NIM_PROVIDER_ID = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
export const VISION_MODELS = new Set<string>([VISION_MODEL_ID]);

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
        primaryModel = nim.chatModel('nvidia/nemotron-3-ultra-550b-a55b');
        actualPref = 'nemotron-3-ultra-550b';
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
        const { routeModel: rm } = require('../services/search/query-router');
        return rm(preferredModel, query, previousQuery);
    } catch {
        return { modelId: preferredModel || "nemotron-3-ultra-550b", tier: "power", score: 0.5, wasRouted: false };
    }
}

// ── getProviderOptions – used only for thinking stream ──
export function getProviderOptions(_modelId: string | undefined) {
    return {};
}


// The selectable catalog shown by the frontend. Only models verified live
// on NVIDIA NIM on 2026-11-14 are listed; the retired ones (see
// RETIRED_MODELS in model-health.ts) were removed instead of being listed
// and failing on every pick. Re-add after verifying with a fresh call.
export const AVAILABLE_MODELS = [
    {
        category: "General Purpose", models: [
            { id: "nemotron-3-ultra-550b", label: "Nemotron 3 Ultra 550B (NVIDIA)" },
            { id: "laguna-xs-2.1", label: "Laguna XS 2.1 (Poolside)" },
        ]
    },
    {
        category: "Reasoning & Agents", models: [
            { id: "nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B Reasoning (NVIDIA)" },
        ]
    },
];

