// Model selector — shared between WebSocket and REST handlers
import { nim } from '../../services/models/nim-client';
import { isModelHealthy, recordFailure, recordSuccess, getShortTimeout } from '../model-health';

// Only models verified live on NVIDIA NIM (2026-11-14). Keys the fallback
// walk can reach; the retired catalog entries were removed so every user
// message does not pay a 410 round-trip for 14 dead models first.
// See agents/model-health.ts RETIRED_MODELS for the full retired list.
const NIM_MODELS: Record<string, string> = {
  "nemotron-3-ultra-550b": "nvidia/nemotron-3-ultra-550b-a55b",
  "nemotron-3-nano-omni-30b-a3b-reasoning": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "laguna-xs-2.1": "poolside/laguna-xs-2.1",
};

const VISION_MODELS = new Set();

function createFallbackModel(primaryModel: any, preferredModelId: string | undefined, modelsMap: Record<string, string>): any {
  const getFallbackSequence = (prefId?: string) => {
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

export function selectModel(preferredModel?: string): any {
  let primaryModel: any;
  let actualPref: string;
  if (preferredModel && NIM_MODELS[preferredModel]) {
    primaryModel = nim.chatModel(NIM_MODELS[preferredModel]);
    actualPref = preferredModel;
  } else {
    primaryModel = nim.chatModel('nvidia/nemotron-3-ultra-550b-a55b');
    actualPref = 'nemotron-3-ultra-550b';
  }
  return createFallbackModel(primaryModel, actualPref, NIM_MODELS);
}

export function getModelList(): Array<{ id: string; name: string }> {
  return Object.entries(NIM_MODELS).map(([id, name]) => ({ id, name }));
}

export function isVisionModel(modelId: string): boolean {
  return VISION_MODELS.has(modelId);
}
