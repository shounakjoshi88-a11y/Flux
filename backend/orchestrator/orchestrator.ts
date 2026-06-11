// backend/orchestrator/orchestrator.ts
// Deterministic plan → execute → verify → revise loop for agentic workflows.

import { Planner } from "./planner";
import { Verifier } from "./verifier";
import type {
  ExecutionPlan,
  Phase,
  PhaseResult,
  StreamWriter,
  WorkflowKind,
} from "./types";

interface OrchestratorInput {
  query: string;
  tools: Record<string, any>;
  agentState: {
    sources: { url: string; index: number }[];
    generatedFiles: any[];
    thoughtProcess: any[];
  };
  stream: StreamWriter;
  model: any;
  skillRegistry: Record<string, { fileName: string; label: string }>;
  fetchSkillFile: (fileName: string) => Promise<string | null>;
  generateDocumentWithSkill: (
    docType: string,
    query: string,
    model: any,
    skillContent: string
  ) => Promise<any>;
}

interface OrchestratorOutput {
  text: string;
  sources: { url: string; index: number }[];
  files: any[];
  thoughtProcess: any[];
  executedPlan: boolean;
}

export class OrchestratorEngine {
  private planner = new Planner();
  private verifier = new Verifier();

  async process(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { query, tools, agentState, stream, model, skillRegistry, fetchSkillFile, generateDocumentWithSkill } = input;

    const { plan, workflow } = this.planner.analyze(query);

    // For document-generation workflows, let the AI SDK streaming path handle
    // the multi-step tool calling so the model can explain each step
    // conversationally (search → explain → read_skill → explain → generate).
    // The orchestrator only handles quick non-document tasks here.
    if (workflow === "research_document") {
      return {
        text: "",
        sources: agentState.sources,
        files: agentState.generatedFiles,
        thoughtProcess: agentState.thoughtProcess,
        executedPlan: false,
      };
    }

    return {
      text: "",
      sources: agentState.sources,
      files: agentState.generatedFiles,
      thoughtProcess: agentState.thoughtProcess,
      executedPlan: false,
    };
  }

  private async executePlan(
    plan: ExecutionPlan,
    input: OrchestratorInput,
    workflow: WorkflowKind
  ): Promise<OrchestratorOutput> {
    const { query, tools, agentState, stream, model, fetchSkillFile, generateDocumentWithSkill } = input;

    const phaseResults = new Map<string, PhaseResult>();

    for (const phase of plan.steps) {
      stream.writeThought(
        `[PLAN] Executing step: ${phase.description}`
      );

      let lastResult: PhaseResult | null = null;
      let retries = 0;

      while (retries <= phase.maxRetries) {
        const result = await this.executePhase(
          phase,
          input,
          phaseResults,
          retries
        );

        if (phase.type === "research") {
          agentState.sources.push(...result.sources);
        }
        if (phase.type === "generate_doc") {
          agentState.generatedFiles.push(...result.files);
        }

        const verification = this.verifier.verify(phase, result);

        if (verification.passed) {
          lastResult = result;
          phaseResults.set(phase.id, result);
          break;
        }

        retries++;
        if (retries <= phase.maxRetries) {
          const issues = verification.results
            .filter((r) => !r.passed)
            .map((r) => r.detail)
            .join("; ");

          stream.writeThought(
            `[VERIFY] Step "${phase.description}" failed (${issues}). Retry ${retries}/${phase.maxRetries}...`
          );
        } else {
          lastResult = result;
          if (phase.required) {
            stream.writeThought(
              `[VERIFY] Step "${phase.description}" failed all retries. Proceeding with partial result.`
            );
          }
          phaseResults.set(phase.id, result);
        }
      }

      if (!lastResult) {
        lastResult = {
          phaseId: phase.id,
          type: phase.type,
          success: false,
          text: "",
          sources: [],
          files: [],
          skillContent: "",
          errors: [`Phase ${phase.id} failed after ${phase.maxRetries + 1} attempts`],
        };
        phaseResults.set(phase.id, lastResult);
      }
    }

    return this.compileResults(plan, phaseResults, agentState, workflow);
  }

  private async executePhase(
    phase: Phase,
    input: OrchestratorInput,
    previousResults: Map<string, PhaseResult>,
    retryIndex: number
  ): Promise<PhaseResult> {
    const { query, tools, agentState, stream, model, skillRegistry, fetchSkillFile, generateDocumentWithSkill } = input;

    if (phase.type === "research") {
      const searchTool = tools["web_search"];
      if (!searchTool?.execute) {
        return {
          phaseId: phase.id,
          type: "research",
          success: false,
          text: "Tool web_search not available",
          sources: [],
          files: [],
          skillContent: "",
          errors: ["web_search tool not found"],
        };
      }

      const prevSources = agentState.sources.length;
      const resultText = await searchTool.execute({
        query: retryIndex > 0 ? retryQuery(query, retryIndex) : query,
      });

      const newSources = agentState.sources.slice(prevSources);

      return {
        phaseId: phase.id,
        type: "research",
        success: newSources.length > 0,
        text: typeof resultText === "string" ? resultText : JSON.stringify(resultText),
        sources: newSources,
        files: [],
        skillContent: "",
        errors: [],
      };
    }

    if (phase.type === "load_skill") {
      const prevResults = previousResults.get("research");
      let docType = detectSimpleDocType(query);

      if (!docType) {
        docType = "pdf";
      }

      const skillTool = tools["read_skill"];
      if (skillTool?.execute) {
        const skillContent = await skillTool.execute({ doc_type: docType });
        return {
          phaseId: phase.id,
          type: "load_skill",
          success: typeof skillContent === "string" && skillContent.length > 100,
          text: "",
          sources: [],
          files: [],
          skillContent: typeof skillContent === "string" ? skillContent : "",
          errors: [],
        };
      }

      const fileName = skillRegistry[docType]?.fileName;
      if (!fileName) {
        return {
          phaseId: phase.id,
          type: "load_skill",
          success: false,
          text: "",
          sources: [],
          files: [],
          skillContent: "",
          errors: [`No skill file for ${docType}`],
        };
      }

      const content = await fetchSkillFile(fileName);
      const success = content !== null && content.length > 100;
      if (success) {
        stream.writeStatus("reading_skill", `Reading the ${(skillRegistry[docType]?.label || docType).toUpperCase()} skill`, { docType });
      }

      return {
        phaseId: phase.id,
        type: "load_skill",
        success,
        text: "",
        sources: [],
        files: [],
        skillContent: content ?? "",
        errors: success ? [] : [`Failed to load skill ${fileName}`],
      };
    }

    if (phase.type === "generate_doc") {
      const prevResearch = previousResults.get("research");
      const prevSkill = previousResults.get("load_skill");
      const docType = detectSimpleDocType(query) || "pdf";
      const topic = extractTopic(query) || "document";

      const docTool = tools["generate_document"];
      if (docTool?.execute) {
        const skillContent = prevSkill?.skillContent ?? "";
        const result = await docTool.execute({
          doc_type: docType,
          topic,
          skill_content: skillContent,
        });

        const files = [...agentState.generatedFiles];
        const newFiles = files.slice(0);

        return {
          phaseId: phase.id,
          type: "generate_doc",
          success: agentState.generatedFiles.length > 0,
          text: typeof result === "string" ? result : JSON.stringify(result),
          sources: [],
          files: newFiles,
          skillContent: "",
          errors: agentState.generatedFiles.length > 0 ? [] : ["No file generated"],
        };
      }

      const skillContent = prevSkill?.skillContent ?? "";
      const file = await generateDocumentWithSkill(docType, query, model, skillContent);
      if (file) {
        agentState.generatedFiles.push(file);
        stream.writeFile(file);

        const msg = `\n\nI've created a ${docType.toUpperCase()} document about "${topic}" based on the search results. You can download it below.`;
        stream.writeText(msg);
      }

      return {
        phaseId: phase.id,
        type: "generate_doc",
        success: !!file,
        text: file ? `Generated ${file.filename}` : "Generation failed",
        sources: [],
        files: file ? [file] : [],
        skillContent: "",
        errors: file ? [] : ["generateDocumentWithSkill returned null"],
      };
    }

    return {
      phaseId: phase.id,
      type: phase.type,
      success: false,
      text: "",
      sources: [],
      files: [],
      skillContent: "",
      errors: [`Unknown phase type: ${phase.type}`],
    };
  }

  private compileResults(
    plan: ExecutionPlan,
    phaseResults: Map<string, PhaseResult>,
    agentState: any,
    workflow: WorkflowKind
  ): OrchestratorOutput {
    // Only include text from the generate_doc phase — the research phase
    // text is raw search results, not meant for the answer.
    const docResult = phaseResults.get("generate_doc");
    const text = docResult?.text ?? "";

    // agentState already has everything — files, sources were pushed during executePlan.
    // Don't re-collect from phase results to avoid duplication.
    return {
      text,
      sources: agentState.sources,
      files: agentState.generatedFiles,
      thoughtProcess: agentState.thoughtProcess,
      executedPlan: true,
    };
  }
}

function detectSimpleDocType(query: string): string | null {
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

function extractTopic(query: string): string {
  const match = query.match(
    /(?:about|on|for|of|covering|titled|called|with)\s+["""]?([^""".\n]{5,80}?)["""]?(?:\s*(?:\.|$|\b(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html)\b))/i
  );
  if (match) return match[1]!.trim();

  // Fallback: find the doc-intent phrase anywhere, grab everything after (minus connectors)
  const docPhrase = query.match(
    /(?:create|generate|make|build|write|produce)\s+(?:a|an|the|some|me)\s+(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html|powerpoint|presentation|slide|word|excel|spreadsheet|document)\s+(.+)/i
  );
  if (docPhrase) {
    return docPhrase[1]!.trim().replace(/^(?:about|on|for|of|covering|titled|called|with)\s+/i, "").slice(0, 100);
  }

  return "document";
}

function retryQuery(original: string, attempt: number): string {
  const prefixes = [
    "Find detailed, comprehensive information about",
    "Search extensively for recent, authoritative information about",
    "Find more specific, detailed data about",
  ];
  const topic = extractTopic(original) || original;
  const prefix = prefixes[Math.min(attempt - 1, prefixes.length - 1)];
  return `${prefix} "${topic}"`;
}
