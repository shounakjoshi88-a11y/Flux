import { generateText } from 'ai';
import { nim } from './nim-client';

export type TaskIntent = 'SIMPLE' | 'COMPLEX' | 'LONG_TASK';

const CLASSIFIER_SYSTEM = `You classify user requests into three categories:

SIMPLE: Questions, explanations, single code snippet, one-off commands, simple tool calls (weather, news, one search).
COMPLEX: Needs multiple tool calls but fits in one response (research with search+read, document generation, single-file code, data analysis, one-page website).
LONG_TASK: Multi-step project building that requires multiple rounds of sequential work — scaffolding, multi-file systems, full app development, infrastructure setup, refactoring an entire codebase, anything involving 5+ files or 3+ components.

Examples:
SIMPLE:
- "What's the weather in Tokyo?"
- "Explain how React hooks work"
- "Write a Python script to check if a number is prime"
- "What is the capital of France?"
- "Help me debug this error: TypeError: undefined is not a function"
- "Summarize this article for me"
- (Narrative/chat: "Yeah funny part here the coding is not done by me AI did that but you know no AI can make it..." — just chatting about past work, no request)
- (Chat: "I made a custom renderer that handles latex and codeblocks, it took many iterations")
- (Chat: "The thing is I spent hours refining the backend, it went from 400 to 6000 lines")

COMPLEX:
- "Research quantum computing breakthroughs and write a summary with sources" (search + read + synthesize)
- "Generate a PDF report about climate change with charts" (tool + generation)
- "Write a Node.js script to scrape a website and save results to CSV" (single file, multiple steps within one response)
- "Analyze this dataset and create visualizations" (Python code + file generation)
- "Create a single-page portfolio website" (one file, single response)

LONG_TASK:
- "Build a full-stack todo app with React frontend, Express backend, PostgreSQL, and Docker" (multi-file, multi-component)
- "Create a complete e-commerce platform with user auth, product catalog, cart, and checkout" (multi-step, many files)
- "Make a game like Flappy Bird with score tracking and multiple levels" (game development, many iterations)
- "Refactor my project to use TypeScript with proper types and interfaces" (multi-file refactoring)
- "Set up a complete CI/CD pipeline with testing, linting, and deployment" (infrastructure, many steps)
- "Build a chat application with WebSocket support, user presence, and message history" (multi-component)
- "Create a full authentication system with login, signup, password reset, OAuth, and session management" (multi-step)
- "Migrate my backend from Express to Fastify" (multi-file migration, testing needed)

Respond with exactly one word: SIMPLE, COMPLEX, or LONG_TASK`;

const LONG_TASK_HEURISTICS: RegExp[] = [
  /(build|create|make|develop|implement).*(game|app|application|platform|ecommerce|e-commerce|saas|crm|erp|dashboard|portfolio|blog|forum|marketplace|social|chat|messenger)/i,
  /(refactor|migrate|rewrite|restructure|reorganize).*(entire|whole|complete|full).*(codebase|project|app|application|system)/i,
  /(full[-\s]stack|multi[-\s]file|multi[-\s]component|multi[-\s]module|multi[-\s]tier)/i,
  /clone\s+(of\s+)?(twitter|instagram|slack|discord|reddit|github|netflix|spotify|whatsapp|telegram|youtube)/i,
  /set\s+up\s+(a\s+)?(complete|full)\s+(project|app|application|pipeline|infrastructure|ci\/cd|deployment)/i,
  /project\s+(with|that\s+has|containing|including)\s+(auth|authentication|database|user|admin|payment|stripe|api|frontend|backend)/i,
];

function heuristicCheck(query: string): TaskIntent | null {
  const longScore = LONG_TASK_HEURISTICS.reduce((s, rx) => s + (rx.test(query) ? 1 : 0), 0);
  if (longScore >= 2) return 'LONG_TASK';
  if (longScore === 1 && query.length > 100) return 'LONG_TASK';
  // Short queries explicitly asking to build/make a game, app, or platform are LONG_TASK
  if (/(make|build|create|develop).{0,30}(game|app|application|platform|clone)/i.test(query) && query.length < 200) return 'LONG_TASK';
  // "make/build/create/develop a clone of X" or "clone X" is LONG_TASK
  if (/(make|build|create|develop).{0,20}clone|clone\s+(of\s+)?(twitter|instagram|slack|discord|reddit|github|netflix|spotify|whatsapp|telegram|youtube)/i.test(query)) return 'LONG_TASK';
  return null;
}

function isConversational(query: string): boolean {
  const hasNarrative = /i (made|built|created|wrote|did|had|spent|used|worked|added|fixed|changed|implemented|designed|setup|just|was|have|had|used|realized|noticed|mean|think|believe|wanted|needed|tried|said|found|got|seen|been|done)/i.test(query);
  const hasConversationalPhrase = /(you know|the thing is|funny part|the catch is|here.s the thing|honestly|i mean|like you said|as you can see|so yeah|and yeah|long story short|to be honest|tell you what)/i.test(query);
  const hasImperativeRequest = /(can you|could you|will you|would you|please|help me|i want|i need|i'd like|i would like|build me|create for me|make me|write me|generate|create\s+a|build\s+a|make\s+a|implement\s+a|develop\s+a|design\s+a|set\s+up|setup\s+a|install|configure)\b/i.test(query);
  // Narrative/conversational AND not requesting new work
  return (hasNarrative || hasConversationalPhrase) && !hasImperativeRequest;
}

function complexityHeuristic(query: string): TaskIntent {
  // Pure conversational/narrative — no task
  if (isConversational(query)) return 'SIMPLE';

  const multiReq = (query.match(/\band\b/gi) || []).length >= 3;
  const hasTech = /\b(react|vue|angular|node|express|python|django|flask|docker|kubernetes|postgresql|mongodb|redis|graphql|rest|api)\b/i.test(query);
  const hasStructure = /\b(frontend|backend|database|auth|testing|deploy|config|setup|scaffold|boilerplate|template|structure|layout|page|component|module|service|middleware|route|plugin|extension)\b/i.test(query);
  const isLong = query.length > 200;
  const score = (multiReq ? 1 : 0) + (hasTech ? 1 : 0) + (hasStructure ? 1 : 0) + (isLong ? 1 : 0);
  if (score >= 3) return 'LONG_TASK';
  if (score >= 2) return 'COMPLEX';
  return 'SIMPLE';
}

export async function classifyTaskIntent(query: string): Promise<TaskIntent> {
  if (!query || query.length < 20) return 'SIMPLE';

  const heuristic = heuristicCheck(query);
  if (heuristic) return heuristic;

  try {
    const model = nim.chatModel('nemotron-nano-12b-v2-vl');
    const res = await generateText({
      model,
      system: CLASSIFIER_SYSTEM,
      prompt: `Classify this request: """${query.slice(0, 3000)}"""`,
      maxTokens: 10,
      temperature: 0,
    } as any);

    const label = res.text.trim().toUpperCase();
    if (label === 'LONG_TASK' || label === 'COMPLEX' || label === 'SIMPLE') return label;
  } catch {
    // Fall through to heuristic
  }

  return complexityHeuristic(query);
}
