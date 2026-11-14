// query-router.ts — Classifies queries and routes to appropriate model

// Simple and complex queries were different tiers pre-retirement, but the
// cheap tier was only ever a reasoning model (nemotron-3-nano-omni), which
// emits only ~9 chars of visible text — the reason simple answers came
// back blank. The only verified live model is 550b-a55b, so both tiers
// share it until a cheaper live general model appears.
const CHEAP_MODEL_ID = "nemotron-3-ultra-550b";
const EXPENSIVE_MODELS = new Set([
  "nemotron-3-ultra-550b",
  "laguna-xs-2.1",
]);

type Complexity = "simple" | "complex";

const SEARCH_INTENT_RE = /\b(find|search|look\s*up|tell me about|latest|news|explain|define|compare|vs\b|versus|tutorial|guide|review|price|cost|specs|status|how to|what is|what are|who is|who are|where is|where are|when did|when was|why did|why is|how does|how do|how can|how to)\b/i;

const COMPLEX_RE = /\b(?:analyze|compare|contrast|evaluate|summarize|break\s*down|research|investigate|deep\s*dive|generate|create.*document|write.*code|build.*app|implement|deploy|debug|refactor|fix.*bug|verify|check|confirm|validate|prove|disprove|debunk|fact.?check|legitimate|review.*code|audit|inspect|examine|design|redesign|restyle|styling|layout|component|ui\b|ux\b|beautify|polish|refine)\b/i;

export function classifyQuery(query: string): Complexity {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Very short: greeting, basic opinion, yes/no
  if (wordCount < 5) {
    const hasSubstance = SEARCH_INTENT_RE.test(q) || COMPLEX_RE.test(q);
    if (!hasSubstance) return "simple";
  }

  // Opinion questions without factual anchors
  if (/\b(what do you think|I think| happening|figure out|What could they mean|Can you investigate|What’s going on|Are you sure|opinion|thoughts|your take|how do you feel)\b/.test(q)) {
    const hasFactualAnchor = /\b(announce|shut down|launch|release|acquir|report|new|latest|results?|data|study|research)\b/.test(q);
    if (!hasFactualAnchor) return "complex";
  }

  // Meta chat
  if (/\b(who are you|what can you|are you|do you|your name|what do you do)\b/.test(q) && !SEARCH_INTENT_RE.test(q)) {
    return "simple";
  }

  // Simple personal queries
  if (/\b(i am|my name|i have|i need|i want|i like|i hate|thank|thanks|hello|hi\b|hey\b)\b/.test(q) && !SEARCH_INTENT_RE.test(q)) {
    return "simple";
  }

  // Complex patterns
  if (COMPLEX_RE.test(q)) return "complex";
  if (SEARCH_INTENT_RE.test(q) && wordCount >= 5) return "complex";
  if (wordCount >= 15) return "complex";
  if (/\b(because|therefore|however|although|compared to|difference between)\b/.test(q)) return "complex";

  // Default: route simple queries to cheap model, let complex through
  return wordCount >= 8 && SEARCH_INTENT_RE.test(q) ? "complex" : "simple";
}

export function isExpensiveModel(modelId: string): boolean {
  return EXPENSIVE_MODELS.has(modelId);
}

export function routeModel(preferredModel: string | undefined, query: string): {
  modelId: string;
  complexity: Complexity;
  wasRouted: boolean;
} {
  const modelId = preferredModel || "nemotron-3-ultra-550b";
  const complexity = classifyQuery(query);

  if (complexity === "simple" && isExpensiveModel(modelId)) {
    console.log(`[ROUTER] "${query.slice(0, 60)}..." is simple — routing from ${modelId} to ${CHEAP_MODEL_ID}`);
    return { modelId: CHEAP_MODEL_ID, complexity, wasRouted: true };
  }

  return { modelId, complexity, wasRouted: false };
}
