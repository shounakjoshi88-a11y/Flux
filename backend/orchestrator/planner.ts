import type { ExecutionPlan, Phase, WorkflowKind } from "./types";

const DOC_INTENT_RE =
  /(?:\b(?:create|generate|make|build|write|produce)\b.*\b(pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet|document)\b)|(?:\b(pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html)\b.*\b(?:about|on|for|of)\b)/i;

const SYSTEM_WORDS_RE = /\b(architecture|prototype|router|codebase|classify|tier|regex|embedding|classifier|pipeline|workflow|orchestrat|diagram|api|sdk|integration|endpoint|middleware|deploy|debug|refactor|implementation|config|algorithm|variable|function|method)\b/i;

const IMAGE_RE = /\b(?:generate|create|draw|make|render)\b.*\b(?:image|picture|photo|art|illustration|drawing)\b|\b(?:image|picture|photo|art|illustration)\b.*\b(?:of|about|with)\b/i;

const CODE_RE = /\b(?:code|script|program|function|implement|deploy|debug|refactor|fix|write.*code|build.*app)\b/i;

const ANALYSIS_RE = /\b(?:analyze|compare|contrast|evaluate|summarize|break down|research|investigate|deep dive)\b/i;

// Diagram/chart requests with user-provided content → no search needed
const DIAGRAM_RE = /\b(?:mermaid|diagram|flowchart|chart|graph|visualize|visualise|draw.*flow|pipeline|architecture)\b/i;

// Detects that the query already has file context → skip web search
function hasFileContext(query: string, fileContent?: string): boolean {
  return !!(fileContent && fileContent.trim().length > 0);
}

function detectDocType(query: string): string | null {
  const q = query.toLowerCase();
  if (/\bpptx\b|\bpowerpoint\b|\bpresentation\b|\bslide\b/.test(q)) return "pptx";
  if (/\bdocx\b|\bword\b/.test(q)) return "docx";
  if (/\bxlsx\b|\bexcel\b|\bspreadsheet\b|\bsheet\b/.test(q)) return "xlsx";
  if (/\bcsv\b/.test(q)) return "csv";
  if (/\btsv\b/.test(q)) return "tsv";
  if (/\bmd\b|\bmarkdown\b/.test(q)) return "md";
  if (/\bjson\b/.test(q)) return "json";
  if (/\bsql\b/.test(q)) return "sql";
  if (/\bhtml\b/.test(q)) return "html";
  if (/\bpdf\b/.test(q)) return "pdf";
  // "document" alone is too broad — only match with generation verbs
  if (/\b(?:create|generate|make|build|write|produce)\b.*\bdocument\b/.test(q)) return "docx";
  return null;
}

function detectTopic(query: string): string {
  const match = query.match(
    /(?:about|on|for|of|covering|titled|called|with)\s+["""]?([^""".\n]{5,80}?)["""]?(?:\s*(?:\.|$|\b(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet|document)\b))/i
  );
  if (match) return match[1]!.trim();

  const docPhrase = query.match(
    /(?:create|generate|make|build|write|produce)\s+(?:a|an|the|some|me)\s+(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet|document)\s+(.+)/i
  );
  if (docPhrase) {
    return docPhrase[1]!.trim().replace(/^(?:about|on|for|of|covering|titled|called|with)\s+/i, "").slice(0, 100);
  }

  return "document";
}

// Detects genuine weather ASKING intent — avoids false positives on
// casual mentions ("the weather in this code"), metaphors ("temperature of the debate"),
// and technical/system context ("weather API endpoint").
function isWeatherQuery(query: string): boolean {
  const q = query.toLowerCase().slice(0, 300);
  const pre = query.slice(0, 300);

  // Technical/system context — almost certainly not asking about real weather
  if (SYSTEM_WORDS_RE.test(q)) return false;

  // Must have a weather keyword
  const WEATHER_WORD = /\b(weather|temperature|forecast|humidity|rain(?:fall|y)?|sunny|cloudy|wind(?:y)?)\b/;
  if (!WEATHER_WORD.test(q)) return false;

  // "how hot / how cold / how warm" — always a weather question
  if (/\bhow\s+(hot|cold|warm|chilly|rainy|sunny|windy|humid)\b/i.test(q)) return true;

  // Named entity (capitalized word) near weather word → strong signal for a location
  if (/\b(?:weather|temperature|forecast|rain)\b.{0,40}\b([A-Z][a-z]{2,})\b/.test(pre)) return true;
  if (/\b([A-Z][a-z]{2,})\b.{0,40}\b(?:weather|temperature|forecast|rain)\b/.test(pre)) return true;

  // Question/request pattern asking about weather
  if (/^(?:what(?:'s| is| are)|how (?:is|does|about)|is it|can (?:you|i)|tell me|show me|give me|check|find|do you)\b/.test(q) && WEATHER_WORD.test(q)) return true;

  // Weather word + location preposition + word (not a generic filler)
  if (/\b(?:weather|temperature|forecast|humidity|rain|sunny|cloudy|wind)\b\s*(?:info|information|details|data|report|conditions?)?\s*(?:in|at|for|of|about|on)\s+(?!my|your|our|their|this|that|the|a|an|some|any|no|its|his|her)\w+/i.test(q)) return true;

  // Short query (2–10 words) with a weather keyword → likely direct ask
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 10) {
    // Exclude personal statements ("I like hot weather", "It is rainy today")
    const noIntent = /^(?:i\s+(?:like|love|enjoy|hate|prefer|think|guess|wonder|was|am)|(?:weather|temperature)\s+(?:is|was|has|can|will)|it(?:'s| is)\s+(?:hot|cold|warm|rainy|sunny|windy))\b/i;
    if (!noIntent.test(q.trim())) return true;
  }

  return false;
}

export class Planner {
  analyze(query: string, _history?: any[], fileContent?: string, isComputerMode?: boolean): { plan: ExecutionPlan; workflow: WorkflowKind } {
    if (isComputerMode) {
      return {
        workflow: "computer_mode",
        plan: {
          steps: [
            {
              id: "computer_task",
              type: "shell",
              description: "Execute local command",
              tools: ["shell_execute", "file_list", "file_read", "file_write", "web_search"],
              dependsOn: [],
              required: true,
              criteria: [{ type: "has_text_output", label: "Task completed" }],
              maxRetries: 1,
            },
          ],
          userIntent: "Local computer task",
          reasoning: "Computer Mode is ACTIVE. Flux will work directly on the local file system and execute commands as needed.",
          estimatedSteps: 1,
        },
      };
    }

    const docType = detectDocType(query);
    const withFile = hasFileContext(query, fileContent);

    if (docType) {
      const topic = detectTopic(query);
      return {
        workflow: "research_document",
        plan: {
          steps: [],
          userIntent: `Document generation: ${topic}`,
          reasoning: `Flux will automatically research and create a ${docType} document about "${topic}".`,
          estimatedSteps: 0,
        },
      };
    }

    if (IMAGE_RE.test(query)) {
      return {
        workflow: "image_generation",
        plan: {
          steps: [
            {
              id: "enhance_prompt",
              type: "analyze",
              description: "Enhance image prompt",
              tools: [],
              dependsOn: [],
              required: true,
              criteria: [{ type: "has_text_output", label: "Prompt enhanced" }],
              maxRetries: 0,
            },
            {
              id: "generate_img",
              type: "image_gen",
              description: "Generate image",
              tools: ["generate_image"],
              dependsOn: ["enhance_prompt"],
              required: true,
              criteria: [{ type: "has_file", label: "Image generated" }],
              maxRetries: 1,
            },
          ],
          userIntent: "Image generation",
          reasoning: "Two-step: enhance prompt then generate image.",
          estimatedSteps: 2,
        },
      };
    }

    // If user uploaded a file and asks for a diagram/chart/analysis → work from the file directly
    if (withFile && (DIAGRAM_RE.test(query) || ANALYSIS_RE.test(query) || CODE_RE.test(query))) {
      return {
        workflow: "simple_qa",
        plan: {
          steps: [],
          userIntent: "Analyze uploaded file",
          reasoning: "User provided file content — analyze it directly without web search.",
          estimatedSteps: 0,
        },
      };
    }

    // Diagram/chart requests without a file (the model generates from knowledge)
    if (DIAGRAM_RE.test(query)) {
      return {
        workflow: "simple_qa",
        plan: {
          steps: [],
          userIntent: "Generate diagram or chart",
          reasoning: "Diagram/chart request — generate inline using CHART or MERMAID blocks.",
          estimatedSteps: 0,
        },
      };
    }

    if (CODE_RE.test(query)) {
      return {
        workflow: "simple_qa",
        plan: {
          steps: [],
          userIntent: "Code generation/assistance",
          reasoning: "Code-related query — using streaming path for flexible tool usage.",
          estimatedSteps: 0,
        },
      };
    }

    if (isWeatherQuery(query)) {
      return {
        workflow: "simple_qa",
        plan: {
          steps: [],
          userIntent: "Weather query",
          reasoning: "Let the LLM handle weather naturally — it has the get_weather tool and can write an engaging response.",
          estimatedSteps: 0,
        },
      };
    }

    if (ANALYSIS_RE.test(query)) {
      return {
        workflow: "analysis",
        plan: {
          steps: [
            {
              id: "research",
              type: "research",
              description: "Gather information for analysis",
              tools: ["web_search"],
              dependsOn: [],
              required: true,
              criteria: [
                { type: "has_sources", label: "Sources found" },
                { type: "min_sources", minCount: 2, label: "At least 2 sources" },
              ],
              maxRetries: 2,
            },
            {
              id: "verify",
              type: "verify",
              description: "Analyze and synthesize findings",
              tools: [],
              dependsOn: ["research"],
              required: true,
              criteria: [{ type: "has_text_output", label: "Analysis complete" }],
              maxRetries: 1,
            },
          ],
          userIntent: "Deep research/analysis",
          reasoning: "Multi-source research followed by synthesis.",
          estimatedSteps: 2,
        },
      };
    }

    return {
      workflow: "simple_qa",
      plan: {
        steps: [],
        userIntent: "General query",
        reasoning: "Simple question answering — no structured plan needed.",
        estimatedSteps: 0,
      },
    };
  }
}
