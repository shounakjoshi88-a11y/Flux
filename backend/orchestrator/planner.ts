import type { ExecutionPlan, Phase, WorkflowKind } from "./types";

const DOC_INTENT_RE =
  /(?:\b(?:create|generate|make|build|write|produce)\b.*\b(pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet)\b)|(?:\b(pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html)\b.*\b(?:about|on|for|of)\b)|(?:\b(?:create|generate|make|build|write|produce)\b.*\b(pdf|word)\s+document\b)/i;

const WEATHER_RE = /\bweather\b|\btemperature\b|\bforecast\b|\bhow.*hot\b|\bhow.*cold\b/i;

const IMAGE_RE = /\b(?:generate|create|draw|make|render)\b.*\b(?:image|picture|photo|art|illustration|drawing)\b|\b(?:image|picture|photo|art|illustration)\b.*\b(?:of|about|with)\b/i;

const CODE_RE = /\b(?:code|script|program|function|implement|deploy|debug|refactor|fix|write.*code|build.*app)\b/i;

const ANALYSIS_RE = /\b(?:analyze|compare|contrast|evaluate|summarize|break down|research|investigate|deep dive)\b/i;

function detectDocType(query: string): string | null {
  const q = query.toLowerCase();
  if (/\bpptx\b|\bpowerpoint\b|\bpresentation\b|\bslide\b/.test(q)) return "pptx";
  if (/\bdocx\b|\bword document\b/.test(q)) return "docx";
  if (/\bxlsx\b|\bexcel\b|\bspreadsheet\b|\bsheet\b/.test(q)) return "xlsx";
  if (/\bcsv\b/.test(q)) return "csv";
  if (/\btsv\b/.test(q)) return "tsv";
  if (/\bmd\b|\bmarkdown\b/.test(q)) return "md";
  if (/\bjson\b/.test(q)) return "json";
  if (/\bsql\b/.test(q)) return "sql";
  if (/\bhtml\b/.test(q)) return "html";
  if (/\bpdf\b|\bpdf document\b/.test(q)) return "pdf";
  return null;
}

function detectTopic(query: string): string {
  const match = query.match(
    /(?:about|on|for|of|covering|titled|called|with)\s+["""]?([^""".\n]{5,80}?)["""]?(?:\s*(?:\.|$|\b(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html)\b))/i
  );
  if (match) return match[1]!.trim();

  const docPhrase = query.match(
    /(?:create|generate|make|build|write|produce)\s+(?:a|an|the|some|me)\s+(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet|pdf document|word document)\s+(.+)/i
  );
  if (docPhrase) {
    return docPhrase[1]!.trim().replace(/^(?:about|on|for|of|covering|titled|called|with)\s+/i, "").slice(0, 100);
  }

  return "document";
}

export class Planner {
  analyze(query: string, _history?: any[]): { plan: ExecutionPlan; workflow: WorkflowKind } {
    const docType = detectDocType(query);

    if (docType) {
      const topic = detectTopic(query);
      const steps: Phase[] = [];

      steps.push({
        id: "research",
        type: "research",
        description: `Research "${topic}" via web search`,
        tools: ["web_search"],
        dependsOn: [],
        required: true,
        criteria: [
          { type: "has_sources", label: "Sources found" },
          { type: "min_sources", minCount: 1, label: "At least 1 source" },
        ],
        maxRetries: 2,
      });

      steps.push({
        id: "load_skill",
        type: "load_skill",
        description: `Load ${docType.toUpperCase()} generation rules`,
        tools: ["read_skill"],
        dependsOn: [],
        required: true,
        criteria: [
          { type: "has_skill_content", label: "Skill content loaded" },
        ],
        maxRetries: 1,
      });

      steps.push({
        id: "generate_doc",
        type: "generate_doc",
        description: `Generate ${docType.toUpperCase()} about "${topic}"`,
        tools: ["generate_document"],
        dependsOn: ["research", "load_skill"],
        required: true,
        criteria: [
          { type: "has_file", label: "File generated" },
        ],
        maxRetries: 2,
      });

      return {
        workflow: "research_document",
        plan: {
          steps,
          userIntent: `Generate ${docType} about ${topic}`,
          reasoning: "This is a document generation request that requires research, skill loading, and file generation.",
          estimatedSteps: 3,
        },
      };
    }

    if (WEATHER_RE.test(query)) {
      return {
        workflow: "weather",
        plan: {
          steps: [
            {
              id: "weather_lookup",
              type: "weather",
              description: "Fetch weather data",
              tools: ["get_weather"],
              dependsOn: [],
              required: true,
              criteria: [{ type: "has_text_output", label: "Weather data received" }],
              maxRetries: 1,
            },
          ],
          userIntent: "Weather query",
          reasoning: "Simple single-step weather lookup.",
          estimatedSteps: 1,
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

    if (CODE_RE.test(query)) {
      return {
        workflow: "code",
        plan: {
          steps: [
            {
              id: "research",
              type: "research",
              description: "Research code requirements and best practices",
              tools: ["web_search"],
              dependsOn: [],
              required: false,
              criteria: [{ type: "has_sources", label: "Sources found" }],
              maxRetries: 1,
            },
            {
              id: "execute",
              type: "execute",
              description: "Generate code solution",
              tools: [],
              dependsOn: [],
              required: true,
              criteria: [{ type: "has_text_output", label: "Code generated" }],
              maxRetries: 1,
            },
          ],
          userIntent: "Code generation/assistance",
          reasoning: "Research then generate code solution.",
          estimatedSteps: 2,
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
