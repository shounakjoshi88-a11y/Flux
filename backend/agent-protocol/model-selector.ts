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
  "nemotron-mini-4b": "nvidia/nemotron-mini-4b-instruct",
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

export function selectModel(preferredModel?: string): any {
  if (preferredModel && NIM_MODELS[preferredModel]) {
    return nim.chatModel(NIM_MODELS[preferredModel]);
  }
  return nim.chatModel('moonshotai/kimi-k2.6');
}

export function getModelList(): Array<{ id: string; name: string }> {
  return Object.entries(NIM_MODELS).map(([id, name]) => ({ id, name }));
}

export function isVisionModel(modelId: string): boolean {
  return VISION_MODELS.has(modelId);
}
