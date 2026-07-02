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
  fileContent?: string;
  isComputerMode?: boolean;
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
    const { plan, workflow } = this.planner.analyze(input.query, undefined, input.fileContent, input.isComputerMode);

    // Plan is generated internally but no longer sent to frontend

    const result = await this.executePlan(plan, input, workflow);

    // If the plan had no steps (simple_qa pass-through), don't claim
    // the orchestrator handled it — let the AI SDK streaming path respond.
    if (plan.steps.length === 0) {
      return { ...result, executedPlan: false };
    }

    return result;
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
        const text = typeof result === "string" ? result : JSON.stringify(result);
        return {
          phaseId: phase.id, type: "weather", success: text.length > 0,
          text,
          sources: [], files: [], skillContent: "", errors: text ? [] : ["Weather tool returned empty result"],
        };
      }
      return {
        phaseId: phase.id, type: "weather", success: false,
        text: "Weather lookup is unavailable in the current mode. Try asking without research mode enabled.",
        sources: [], files: [], skillContent: "",
        errors: ["get_weather tool not available"],
      };
    }

    if (phase.type === "analyze") {
      return {
        phaseId: phase.id, type: "analyze", success: true,
        text: query, sources: [], files: [], skillContent: "", errors: [],
      };
    }

    if (phase.type === "shell") {
      const shellTool = tools["shell_execute"];
      if (!shellTool?.execute) {
        return {
          phaseId: phase.id, type: "shell", success: false,
          text: "Tool shell_execute not available", sources: [], files: [], skillContent: "", errors: ["shell_execute tool not found"],
        };
      }

      const resultText = await shellTool.execute({
        command: phase.prompt || query,
      });

      return {
        phaseId: phase.id, type: "shell", success: true,
        text: typeof resultText === "string" ? resultText : JSON.stringify(resultText),
        sources: [], files: [], skillContent: "", errors: [],
      };
    }

    if (phase.type === "filesystem") {
      const toolName = phase.tools?.[0] || "file_list";
      const fsTool = tools[toolName];
      if (!fsTool?.execute) {
        return {
          phaseId: phase.id, type: "filesystem", success: false,
          text: `Tool ${toolName} not available`, sources: [], files: [], skillContent: "", errors: [`${toolName} tool not found`],
        };
      }

      const resultText = await fsTool.execute(phase.prompt ? JSON.parse(phase.prompt) : {});

      return {
        phaseId: phase.id, type: "filesystem", success: true,
        text: typeof resultText === "string" ? resultText : JSON.stringify(resultText),
        sources: [], files: [], skillContent: "", errors: [],
      };
    }

    if (phase.type === "verify") {
      const prevResearch = previousResults.get("research");
      const researchText = prevResearch?.text ?? "";
      if (researchText) {
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
      const lines = weatherResult.text.split('\n').map(l => l.trim()).filter(Boolean);
      const tempLine = lines.find(l => l.startsWith('Temperature'));
      const condLine = lines.find(l => l.startsWith('Conditions'));
      const locLine = lines.find(l => l.startsWith('Live weather'));
      const loc = locLine ? locLine.replace(/^Live weather for\s+/, '').replace(/\s+\(via.*$/, '') : '';
      const temp = tempLine ? tempLine.replace(/^Temperature\s*:\s*/, '') : '';
      const cond = condLine ? condLine.replace(/^Conditions\s*:\s*/, '') : '';
      const summary = [temp && `Currently ${temp}`, cond && `with ${cond.toLowerCase()}`, loc && `in ${loc}`].filter(Boolean).join(' ');
      return {
        text: summary || weatherResult.text.slice(0, 120),
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
  if (/\bdocx\b|\bword\b/.test(q)) return "docx";
  // "document" alone is too broad — require generation verb
  if (/\b(?:create|generate|make|build|write|produce)\b.*\bdocument\b/.test(q)) return "docx";
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
  const q = query.toLowerCase().slice(0, 200);
  const weatherWords = /\b(weather|temperature|forecast|how.*hot|how.*cold|humidity|rain|sunny|cloudy|wind)\b/i;
  const m = q.match(weatherWords);
  if (!m) return "unknown";
  const matchWord = m[0];
  const idx = q.indexOf(matchWord.toLowerCase());
  // Try "weather/temperature WORD in/at/for CITY" pattern first
  const afterWeather = q.slice(idx + matchWord.length).trim();
  const locMatch = afterWeather.match(/^(?:(?:info|information|details|data|forecast|report|conditions?)\s+)?(?:in|at|for|of|about|on|regarding|around|near)\s+((?:[a-z]+(?:\s+[a-z]+){0,2}))/i);
  if (locMatch?.[1]) {
    const city = locMatch[1].trim();
    const stopWords = /^(the|current|today|now|outside|here|local|right|what|is|how)$/i;
    if (!stopWords.test(city.split(' ')[0]!)) return city;
  }
  // Fallback: try "CITY weather" pattern
  const beforeWord = q.slice(0, idx).trim();
  const words = beforeWord.split(/\s+/);
  const lastTwo = words.slice(-2).filter(w => w.length > 1);
  if (lastTwo.length > 0) {
    const stopWords = /^(the|current|today|now|outside|here|local|right|what|is|how|in|at|for)$/i;
    const candidates = lastTwo.filter(w => !stopWords.test(w));
    if (candidates.length > 0) return candidates.join(' ');
  }
  // Last resort: take everything after the weather word
  let after = afterWeather.replace(/^(?:(?:info|information|details|data|forecast|report|conditions?)\s+)?(?:in|at|for|of|about|on|regarding|around|near)\s+/i, "").trim();
  after = after.replace(/[?.!;,].*$/, "").trim();
  const words2 = after.split(/\s+/).filter(Boolean).slice(0, 3);
  return words2.length > 0 ? words2.join(" ") : "unknown";
}
