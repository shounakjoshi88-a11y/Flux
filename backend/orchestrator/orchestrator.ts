import { generateText } from 'ai';
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
  requestToolApproval?: (toolName: string, args: any) => Promise<boolean>;
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
    const {
      query, tools, agentState, stream, model,
      skillRegistry, fetchSkillFile, generateDocumentWithSkill,
      requestToolApproval,
    } = input;

    const { plan, workflow } = this.planner.analyze(query);

    // For research_document workflow, execute the full plan deterministically:
    // research → load_skill → generate_doc. This is faster and more reliable
    // than relying on the model to chain tool calls correctly.
    if (workflow === "research_document") {
      stream.writePlan(plan);
      stream.writeStatus("orchestrator", "Starting document generation workflow...", {});

      // Execute the full plan
      const result = await this.executePlan(plan, input, workflow);

      // Generate summary text if document was created
      const hasFiles = agentState.generatedFiles.length > 0;
      const topic = extractTopicFromQuery(query) || "document";
      const summary = hasFiles
        ? `I've created your document about "${topic}". You can download it below.`
        : `I researched "${topic}" but couldn't generate the document.`;

      stream.writeText(summary);

      return {
        text: summary,
        sources: agentState.sources,
        files: agentState.generatedFiles,
        thoughtProcess: agentState.thoughtProcess,
        executedPlan: true,
      };
    }

    // For multi-step workflows, execute the plan fully
    if (plan.steps.length > 1) {
      stream.writePlan(plan);
      const result = await this.executePlan(plan, input, workflow);
      stream.writeThought(`Finished executing all steps.`);
      return result;
    }

    // For single-step weather, execute directly (LLM struggles with city extraction)
    // Skip executePlan's generic "Executing step"/"Completed" thoughts since
    // the status events already show progress.
    if (workflow === "weather") {
      stream.writePlan(plan);
      const weatherPhase = plan.steps[0];
      if (weatherPhase) {
        const result = await this.executePhase(weatherPhase, input, new Map(), 0);
        if (result.success) {
          return {
            text: result.text,
            sources: agentState.sources,
            files: agentState.generatedFiles,
            thoughtProcess: agentState.thoughtProcess,
            executedPlan: true,
          };
        }
      }
      return {
        text: "",
        sources: agentState.sources,
        files: agentState.generatedFiles,
        thoughtProcess: agentState.thoughtProcess,
        executedPlan: true,
      };
    }

    // For single-step or simple workflows, return control to AI SDK
    if (workflow === "image_generation") {
      stream.writePlan(plan);
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
      stream.writeThought(`Executing step: ${phase.description}`);

      let lastResult: PhaseResult | null = null;
      let retries = 0;

      while (retries <= phase.maxRetries) {
        const result = await this.executePhase(phase, input, phaseResults, retries);

        if (phase.type === "research") {
          agentState.sources.push(...result.sources);
        }
        if (phase.type === "generate_doc" || phase.type === "image_gen") {
          agentState.generatedFiles.push(...result.files);
        }

        const verification = this.verifier.verify(phase, result);

        if (verification.passed) {
          lastResult = result;
          phaseResults.set(phase.id, result);
          stream.writeThought(`Completed: ${phase.description}`);
          break;
        }

        retries++;
        if (retries <= phase.maxRetries) {
          const issues = verification.results
            .filter((r) => !r.passed)
            .map((r) => r.detail)
            .join("; ");

          stream.writeThought(`Step "${phase.description}" failed (${issues}). Retry ${retries}/${phase.maxRetries}...`);
        } else {
          lastResult = result;
          if (phase.required) {
            stream.writeThought(`Step "${phase.description}" failed all retries. Proceeding with partial result.`);
          }
          phaseResults.set(phase.id, result);
        }
      }

      if (!lastResult) {
        lastResult = {
          phaseId: phase.id, type: phase.type, success: false,
          text: "", sources: [], files: [], skillContent: "",
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
    const { query, tools, agentState, stream, model, skillRegistry, fetchSkillFile, generateDocumentWithSkill, requestToolApproval } = input;

    if (phase.type === "research") {
      const searchTool = tools["web_search"];
      if (!searchTool?.execute) {
        return {
          phaseId: phase.id, type: "research", success: false,
          text: "Tool web_search not available", sources: [], files: [], skillContent: "", errors: ["web_search tool not found"],
        };
      }

      const prevSources = agentState.sources.length;
      const resultText = await searchTool.execute({
        query: retryIndex > 0 ? retryQuery(query, retryIndex) : query,
      });

      const newSources = agentState.sources.slice(prevSources);

      return {
        phaseId: phase.id, type: "research", success: newSources.length > 0,
        text: typeof resultText === "string" ? resultText : JSON.stringify(resultText),
        sources: newSources, files: [], skillContent: "", errors: [],
      };
    }

    if (phase.type === "load_skill") {
      let docType = detectSimpleDocType(query);
      if (!docType) docType = "pdf";

      const skillTool = tools["read_skill"];
      if (skillTool?.execute) {
        const skillContent = await skillTool.execute({ doc_type: docType });
        return {
          phaseId: phase.id, type: "load_skill", success: typeof skillContent === "string" && skillContent.length > 100,
          text: "", sources: [], files: [], skillContent: typeof skillContent === "string" ? skillContent : "", errors: [],
        };
      }

      const fileName = skillRegistry[docType]?.fileName;
      if (!fileName) {
        return {
          phaseId: phase.id, type: "load_skill", success: false,
          text: "", sources: [], files: [], skillContent: "", errors: [`No skill file for ${docType}`],
        };
      }

      const content = await fetchSkillFile(fileName);
      const success = content !== null && content.length > 100;
      if (success) {
        stream.writeStatus("reading_skill", `Reading the ${(skillRegistry[docType]?.label || docType).toUpperCase()} skill`, { docType });
      }

      return {
        phaseId: phase.id, type: "load_skill", success,
        text: "", sources: [], files: [], skillContent: content ?? "", errors: success ? [] : [`Failed to load skill ${fileName}`],
      };
    }

    if (phase.type === "generate_doc") {
      const prevSkill = previousResults.get("load_skill");
      const docType = detectSimpleDocType(query) || "pdf";
      const topic = extractTopicFromQuery(query) || "document";

      const skillContent = prevSkill?.skillContent ?? "";
      const file = await generateDocumentWithSkill(docType, query, model, skillContent);
      if (file) {
        agentState.generatedFiles.push(file);
        stream.writeFile(file);
        stream.writeText(`I've created a ${docType.toUpperCase()} document about "${topic}". You can download it below.`);
      }

      return {
        phaseId: phase.id, type: "generate_doc", success: !!file,
        text: file ? `Generated ${file.filename}` : "Generation failed",
        sources: [], files: file ? [file] : [], skillContent: "", errors: file ? [] : ["generateDocumentWithSkill returned null"],
      };
    }

    if (phase.type === "image_gen") {
      const imgTool = tools["generate_image"];
      if (imgTool?.execute) {
        const result = await imgTool.execute({ prompt: query });
        return {
          phaseId: phase.id, type: "image_gen", success: agentState.generatedFiles.length > 0,
          text: typeof result === "string" ? result : JSON.stringify(result),
          sources: [], files: [...agentState.generatedFiles], skillContent: "", errors: [],
        };
      }
    }

    if (phase.type === "weather") {
      const weatherTool = tools["get_weather"];
      if (weatherTool?.execute) {
        const city = extractCityFromQuery(query);
        const result = await weatherTool.execute({ city });
        return {
          phaseId: phase.id, type: "weather", success: true,
          text: typeof result === "string" ? result : JSON.stringify(result),
          sources: [], files: [], skillContent: "", errors: [],
        };
      }
    }

    if (phase.type === "analyze") {
      return {
        phaseId: phase.id, type: "analyze", success: true,
        text: query, sources: [], files: [], skillContent: "", errors: [],
      };
    }

    if (phase.type === "verify") {
      const prevResearch = previousResults.get("research");
      const researchText = prevResearch?.text ?? "";
      if (researchText) {
        stream.writeStatus("analyzing", "Synthesizing answer from research...", {});
        try {
          const synthQuery = query.length > 300 ? query.slice(0, 300) + "..." : query;
          const synthResult = await generateText({
            model,
            system: "You are a research analyst. Synthesize a thorough, well-structured answer using ONLY the search results provided. Include specific details, facts, and figures. Cite sources by [1], [2] etc.",
            prompt: `Question: ${synthQuery}\n\nResearch results:\n${researchText.slice(0, 15000)}\n\nProvide a comprehensive answer based on these sources:`,
            maxTokens: 2000,
            temperature: 0.3,
          } as any);
          const answer = (synthResult.text ?? "").trim();
          if (answer) {
            stream.writeText(answer);
            return {
              phaseId: phase.id, type: "verify", success: true,
              text: answer, sources: prevResearch?.sources ?? [], files: [], skillContent: "", errors: [],
            };
          }
        } catch (e: any) {
          console.warn("[ORCH] Verify synthesis failed:", e?.message ?? e);
        }
      }
      return {
        phaseId: phase.id, type: "verify", success: true,
        text: "", sources: [], files: [], skillContent: "", errors: [],
      };
    }

    if (phase.type === "execute") {
      return {
        phaseId: phase.id, type: "execute", success: true,
        text: "", sources: [], files: [], skillContent: "", errors: [],
      };
    }

    return {
      phaseId: phase.id, type: phase.type, success: false,
      text: "", sources: [], files: [], skillContent: "", errors: [`Unknown phase type: ${phase.type}`],
    };
  }

  private compileResults(
    plan: ExecutionPlan,
    phaseResults: Map<string, PhaseResult>,
    agentState: any,
    workflow: WorkflowKind
  ): OrchestratorOutput {
    const weatherResult = phaseResults.get("weather_lookup");
    if (weatherResult?.text) {
      return {
        text: weatherResult.text,
        sources: agentState.sources,
        files: agentState.generatedFiles,
        thoughtProcess: agentState.thoughtProcess,
        executedPlan: true,
      };
    }
    const docResult = phaseResults.get("generate_doc") || phaseResults.get("image_gen") || phaseResults.get("execute");
    const text = docResult?.text ?? "";

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

function extractTopicFromQuery(query: string): string {
  const match = query.match(
    /(?:about|on|for|of|covering|titled|called|with)\s+["""]?([^""".\n]{5,80}?)["""]?(?:\s*(?:\.|$|\b(?:pdf|pptx|docx|xlsx|csv|tsv|md|json|sql|html)\b))/i
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

function retryQuery(original: string, attempt: number): string {
  const prefixes = [
    "Find detailed, comprehensive information about",
    "Search extensively for recent, authoritative information about",
    "Find more specific, detailed data about",
  ];
  const topic = extractTopicFromQuery(original) || original;
  const prefix = prefixes[Math.min(attempt - 1, prefixes.length - 1)];
  return `${prefix} "${topic}"`;
}

function extractCityFromQuery(query: string): string {
  // Find "weather" in the query, take everything after it
  const idx = query.toLowerCase().indexOf("weather");
  if (idx < 0) return "unknown";
  let after = query.slice(idx + 7).trim();
  // Strip leading noise words
  after = after.replace(/^(?:(?:info|information|details|data|forecast|report|conditions?)\s+)?(?:in|at|for|of|about|on|regarding|around|near)\s+/i, "").trim();
  // Strip trailing punctuation and noise
  after = after.replace(/[?.!;,].*$/, "").trim();
  // Take up to 3 words (covers "New York City", "Buenos Aires", etc.)
  const words = after.split(/\s+/).filter(Boolean).slice(0, 3);
  return words.length > 0 ? words.join(" ") : "unknown";
}
