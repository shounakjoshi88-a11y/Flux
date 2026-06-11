// backend/orchestrator/planner.ts
// Analyzes user intent and generates an explicit, structured execution plan.

import type { ExecutionPlan, Phase, WorkflowKind } from "./types";

const DOC_INTENT_RE =
  /(?:\b(?:create|generate|make|build|write|produce)\b.*\b(pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet|document)\b)|(?:\b(pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html)\b.*\b(?:about|on|for|of)\b)/i;

const WEATHER_RE = /\bweather\b|\btemperature\b|\bforecast\b|\bhow.*hot\b|\bhow.*cold\b/i;

const IMAGE_RE = /\b(?:generate|create|draw|make|render)\b.*\b(?:image|picture|photo|art|illustration|drawing)\b|\b(?:image|picture|photo|art|illustration)\b.*\b(?:of|about|with)\b/i;

function detectDocType(query: string): string | null {
  const q = query.toLowerCase();
  if (/\bpptx\b|\bpowerpoint\b|\bpresentation\b|\bslide\b/.test(q)) return "pptx";
  if (/\bdocx\b|\bword\b|\bdocument\b/.test(q)) return "docx";
  if (/\bxlsx\b|\bexcel\b|\bspreadsheet\b|\bsheet\b/.test(q)) return "xlsx";
  if (/\bcsv\b/.test(q)) return "csv";
  if (/\btsv\b/.test(q)) return "tsv";
  if (/\bmd\b|\bmarkdown\b/.test(q)) return "md";
  if (/\bjson\b/.test(q)) return "json";
  if (/\bsql\b/.test(q)) return "sql";
  if (/\bhtml\b/.test(q)) return "html";
  if (/\bpdf\b/.test(q)) return "pdf";
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
        plan: { steps, userIntent: `Generate ${docType} about ${topic}` },
      };
    }

    if (WEATHER_RE.test(query)) {
      return {
        workflow: "weather",
        plan: { steps: [], userIntent: "Weather query" },
      };
    }

    if (IMAGE_RE.test(query)) {
      return {
        workflow: "image_generation",
        plan: { steps: [], userIntent: "Image generation" },
      };
    }

    return {
      workflow: "simple_qa",
      plan: { steps: [], userIntent: "General query" },
    };
  }
}
