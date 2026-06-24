// query-router.ts — Classifies queries and routes to appropriate model tier

const FAST_MODEL = "llama-4-maverick";
const MEDIUM_MODEL = "kimi-k2.6";

const EXPENSIVE_MODELS = new Set([
  "kimi-k2.6",
  "mistral-large-675b",
  "glm-5.1",
  "nemotron-3-ultra-550b",
  "mistral-medium-3.5-128b",
  "qwen3.5-397b-a17b",
  "deepseek-v4-pro",
  "minimax-m3",
]);

export type Tier = "fast" | "medium" | "power";

export type RouteResult = {
  modelId: string;
  tier: Tier;
  score: number;
  wasRouted: boolean;
};

const SEARCH_INTENT_RE = /\b(find|search|look\s*up|tell me about|latest|news|explain|define|compare|vs\b|versus|tutorial|guide|review|price|cost|specs|status|how to|what is|what are|who is|who are|where is|where are|when did|when was|why did|why is|how does|how do|how can|how to|weather|temperature|forecast|humidity|rain|sunny|cloudy|wind)\b/i;

const COMPLEX_RE = /\b(?:analyze|compare|contrast|evaluate|summarize|break\s*down|research|investigate|deep\s*dive|generate|create.*document|write.*code|build.*app|implement|deploy|debug|refactor|fix.*bug)\b/i;

function classifyWithScore(query: string): { tier: Tier; score: number } {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < 5) {
    const hasSubstance = SEARCH_INTENT_RE.test(q) || COMPLEX_RE.test(q);
    if (!hasSubstance) return { tier: "fast", score: 0.1 };
  }

  if (/\b(what do you think|opinion|thoughts|your take|how do you feel)\b/.test(q)) {
    const hasFactualAnchor = /\b(announce|shut down|launch|release|acquir|report|new|latest|results?|data|study|research)\b/.test(q);
    if (!hasFactualAnchor) return { tier: "power", score: 0.8 };
  }

  if (/\b(are you sure|is that correct|is that right|confirm|double.?check|verify|can you check|please check|is this accurate|is this correct)\b/i.test(q)) {
    return { tier: "medium", score: 0.65 };
  }

  if (/\b(who are you|what can you|are you|do you|your name|what do you do)\b/.test(q) && !SEARCH_INTENT_RE.test(q)) {
    return { tier: "fast", score: 0.1 };
  }

  if (/\b(i am|my name|i have|i need|i want|i like|i hate|thank|thanks|hello|hi\b|hey\b)\b/.test(q) && !SEARCH_INTENT_RE.test(q)) {
    return { tier: "fast", score: 0.15 };
  }

  if (COMPLEX_RE.test(q)) return { tier: "power", score: 0.85 };
  if (SEARCH_INTENT_RE.test(q) && wordCount >= 7) return { tier: "power", score: 0.75 };
  if (wordCount >= 15) return { tier: "power", score: 0.7 };
  if (/\b(because|therefore|however|although|compared to|difference between)\b/.test(q)) return { tier: "power", score: 0.75 };

  if (SEARCH_INTENT_RE.test(q) && wordCount >= 3) return { tier: "medium", score: 0.55 };
  if (wordCount >= 8) return { tier: "medium", score: 0.5 };

  return { tier: "fast", score: 0.3 };
}

function applyContextBias(
  base: { tier: Tier; score: number },
  previousTier?: Tier
): { tier: Tier; score: number } {
  if (!previousTier || previousTier !== "power") return base;

  const biasedScore = Math.min(1, base.score * 0.8 + 0.2);
  const tier: Tier = biasedScore >= 0.65 ? "power" : biasedScore >= 0.4 ? "medium" : "fast";
  return { tier, score: biasedScore };
}

export function routeModel(
  preferredModel: string | undefined,
  query: string,
  previousQuery?: string
): RouteResult {
  const userModel = preferredModel || "deepseek-v4-pro";

  let result = classifyWithScore(query);

  if (previousQuery) {
    const prevTier = classifyWithScore(previousQuery).tier;
    result = applyContextBias(result, prevTier);
  }

  if (userModel === FAST_MODEL) {
    return { modelId: userModel, tier: result.tier, score: result.score, wasRouted: false };
  }

  let modelId: string;
  let wasRouted = false;

  if (result.tier === "fast") {
    modelId = FAST_MODEL;
    wasRouted = userModel !== FAST_MODEL;
  } else if (result.tier === "medium") {
    if (userModel !== FAST_MODEL && userModel !== MEDIUM_MODEL) {
      modelId = MEDIUM_MODEL;
      wasRouted = true;
    } else {
      modelId = userModel;
    }
  } else {
    modelId = userModel;
  }

  if (wasRouted) {
    console.log(`[ROUTER] "${query.slice(0, 60)}..." → tier ${result.tier} (score ${result.score.toFixed(3)}), ${userModel} → ${modelId}`);
  }

  return { modelId, tier: result.tier, score: result.score, wasRouted };
}

export function isExpensiveModel(modelId: string): boolean {
  return EXPENSIVE_MODELS.has(modelId);
}
