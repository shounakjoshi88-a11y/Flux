export type TaskIntent = 'SIMPLE' | 'COMPLEX' | 'LONG_TASK';

// ── LONG_TASK heuristics: require 2+ strong matches ──
const LONG_TASK_HEURISTICS: RegExp[] = [
  /(build|create|make|develop|implement).{0,40}(game|app|application|platform|ecommerce|e-commerce|saas|crm|erp|dashboard|portfolio|blog|forum|marketplace|social|chat|messenger)/i,
  /(refactor|migrate|rewrite|restructure|reorganize).{0,40}(entire|whole|complete|full).{0,40}(codebase|project|app|application|system)/i,
  /(full[-\s]stack|multi[-\s]file|multi[-\s]component|multi[-\s]module|multi[-\s]tier)/i,
  /clone\s+(of\s+)?(twitter|instagram|slack|discord|reddit|github|netflix|spotify|whatsapp|telegram|youtube)/i,
  /set\s+up\s+(a\s+)?(complete|full)\s+(project|app|application|pipeline|infrastructure|ci\/cd|deployment)/i,
  /project\s+(with|that\s+has|containing|including)\s+(auth|authentication|database|user|admin|payment|stripe|api|frontend|backend)/i,
];

function heuristicCheck(query: string): TaskIntent | null {
  const longScore = LONG_TASK_HEURISTICS.reduce((s, rx) => s + (rx.test(query) ? 1 : 0), 0);
  if (longScore >= 2) return 'LONG_TASK';
  return null;
}

function isConversational(query: string): boolean {
  const hasNarrative = /i (made|built|created|wrote|did|had|spent|used|worked|added|fixed|changed|implemented|designed|setup|just|was|have|had|used|realized|noticed|mean|think|believe|wanted|needed|tried|said|found|got|seen|been|done)/i.test(query);
  const hasConversationalPhrase = /(you know|the thing is|funny part|the catch is|here.s the thing|honestly|i mean|like you said|as you can see|so yeah|and yeah|long story short|to be honest|tell you what)/i.test(query);
  const hasImperativeRequest = /(can you|could you|will you|would you|please|help me|i want|i need|i'd like|i would like|build me|create for me|make me|write me|generate|create\s+a|build\s+a|make\s+a|implement\s+a|develop\s+a|design\s+a|set\s+up|setup\s+a|install|configure)\b/i.test(query);
  return (hasNarrative || hasConversationalPhrase) && !hasImperativeRequest;
}

export async function classifyTaskIntent(query: string): Promise<TaskIntent> {
  if (!query || query.length < 20) return 'SIMPLE';
  if (isConversational(query)) return 'SIMPLE';

  // LONG_TASK requires 2+ strong pattern matches — no length-based heuristics
  const heuristic = heuristicCheck(query);
  if (heuristic) return heuristic;

  // COMPLEX vs SIMPLE: based on structure/scope signals, NOT length
  const hasTech = /\b(react|vue|angular|node|express|python|django|flask|docker|kubernetes|postgresql|mongodb|redis|graphql|rest|api)\b/i.test(query);
  const hasStructure = /\b(frontend|backend|database|auth|testing|deploy|config|setup|scaffold|boilerplate|template|structure|layout|page|component|module|service|middleware|route|plugin|extension)\b/i.test(query);
  const score = (hasTech ? 1 : 0) + (hasStructure ? 1 : 0);

  if (score >= 2) return 'COMPLEX';
  return 'SIMPLE';
}
