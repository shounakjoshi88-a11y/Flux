export type PhaseType =
  | "research"
  | "load_skill"
  | "generate_doc"
  | "simple_answer"
  | "image_gen"
  | "weather"
  | "analyze"
  | "execute"
  | "verify";

export interface VerificationCriterion {
  type: "has_sources" | "has_file" | "min_sources" | "has_skill_content" | "has_text_output" | "semantic_match";
  minCount?: number;
  label: string;
  expected?: string;
}

export interface Phase {
  id: string;
  type: PhaseType;
  description: string;
  prompt?: string;
  tools?: string[];
  dependsOn: string[];
  required: boolean;
  criteria: VerificationCriterion[];
  maxRetries: number;
}

export interface ExecutionPlan {
  steps: Phase[];
  userIntent: string;
  reasoning: string;
  estimatedSteps: number;
}

export interface PhaseResult {
  phaseId: string;
  type: PhaseType;
  success: boolean;
  text: string;
  sources: { url: string; index: number }[];
  files: any[];
  skillContent: string;
  errors: string[];
}

export interface VerificationOutcome {
  passed: boolean;
  results: { criterion: VerificationCriterion; passed: boolean; detail: string }[];
}

export interface StreamWriter {
  writeStatus(subtype: string, message: string, data?: any): void;
  writeText(text: string): void;
  writeFile(file: any): void;
  writeThought(content: string): void;
  writeTodos(items: { id: string; content: string; status: string }[]): void;
  writePlan(plan: ExecutionPlan): void;
  writePermission(id: string, toolName: string, args: any, description: string): void;
  writeToolCall(toolName: string, args: any, status: "pending" | "running" | "completed" | "error", result?: any): void;
  writeToolGroup(tools: any[]): void;
  writeAgentStatus(status: string, message: string): void;
  readonly writableEnded: boolean;
}

export type WorkflowKind =
  | "research_document"
  | "simple_qa"
  | "image_generation"
  | "weather"
  | "code"
  | "analysis"
  | "multi_step";
