// backend/orchestrator/types.ts

export type PhaseType =
  | "research"
  | "load_skill"
  | "generate_doc"
  | "simple_answer"
  | "image_gen"
  | "weather";

export interface VerificationCriterion {
  type: "has_sources" | "has_file" | "min_sources" | "has_skill_content" | "has_text_output";
  minCount?: number;
  label: string;
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
  readonly writableEnded: boolean;
}

export type WorkflowKind =
  | "research_document"
  | "simple_qa"
  | "image_generation"
  | "weather";
