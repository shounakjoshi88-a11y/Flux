// Model selector — shared between WebSocket and REST handlers
import { nim } from '../nim-client';

const NIM_MODELS: Record<string, string> = {
  "llama-4-maverick": "meta/llama-4-maverick-17b-128e-instruct",
  "mistral-large-675b": "mistralai/mistral-large-3-675b-instruct-2512",
  "glm-5.1": "z-ai/glm-5.1",
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
  "stockmark-2-100b-instruct": "stockmark/stockmark-2-100b-instruct",
  "nemotron-nano-12b-v2-vl": "nvidia/nemotron-nano-12b-v2-vl",
};

const VISION_MODELS = new Set(["nemotron-nano-12b-v2-vl", "kimi-k2.6"]);

function createFallbackModel(primaryModel: any, preferredModelId: string | undefined, modelsMap: Record<string, string>): any {
  const getFallbackSequence = (prefId?: string) => {
    const list = ["kimi-k2.6"];
    for (const key of Object.keys(modelsMap)) {
      if (key !== prefId && key !== "kimi-k2.6") {
        list.push(key);
      }
    }
    return list;
  };

  return new Proxy(primaryModel, {
    get(target: any, prop: string | symbol, receiver: any) {
      if (prop === 'doGenerate') {
        return async function(options: any) {
          try {
            console.log(`[MODEL FALLBACK] Trying primary model: ${preferredModelId || target.modelId}`);
            return await target.doGenerate(options);
          } catch (primaryError: any) {
            console.warn(`[MODEL FALLBACK] Primary model failed:`, primaryError?.message ?? primaryError);
            const fallbackIds = getFallbackSequence(preferredModelId);
            for (const fallbackId of fallbackIds) {
              try {
                console.log(`[MODEL FALLBACK] Trying fallback model: ${fallbackId}`);
                const fallbackModel = nim.chatModel(modelsMap[fallbackId]!);
                const fallbackOptions = { ...options, providerOptions: {} };
                return await fallbackModel.doGenerate(fallbackOptions);
              } catch (fallbackError: any) {
                console.warn(`[MODEL FALLBACK] Fallback model ${fallbackId} failed:`, fallbackError?.message ?? fallbackError);
              }
            }
            throw primaryError;
          }
        };
      }
      if (prop === 'doStream') {
        return async function(options: any) {
          try {
            console.log(`[MODEL FALLBACK] Trying primary model stream: ${preferredModelId || target.modelId}`);
            return await target.doStream(options);
          } catch (primaryError: any) {
            console.warn(`[MODEL FALLBACK] Primary model stream failed:`, primaryError?.message ?? primaryError);
            const fallbackIds = getFallbackSequence(preferredModelId);
            for (const fallbackId of fallbackIds) {
              try {
                console.log(`[MODEL FALLBACK] Trying fallback model stream: ${fallbackId}`);
                const fallbackModel = nim.chatModel(modelsMap[fallbackId]!);
                const fallbackOptions = { ...options, providerOptions: {} };
                return await fallbackModel.doStream(fallbackOptions);
              } catch (fallbackError: any) {
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
    primaryModel = nim.chatModel('moonshotai/kimi-k2.6');
    actualPref = 'kimi-k2.6';
  }
  return createFallbackModel(primaryModel, actualPref, NIM_MODELS);
}

export function getModelList(): Array<{ id: string; name: string }> {
  return Object.entries(NIM_MODELS).map(([id, name]) => ({ id, name }));
}

export function isVisionModel(modelId: string): boolean {
  return VISION_MODELS.has(modelId);
}
