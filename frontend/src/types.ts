export type Source = { url: string };

export type ConversationListItem = {
  id: string;
  title: string | null;
  slug: string;
  lastMessageAt: string | null;
  matchType?: 'title' | 'content' | 'file';
  snippet?: string;
  messageId?: number;
};

export type GeneratedFile = {
  base64: string;
  filename: string;
  mime: string;
  slides?: { title: string; content: string }[];
  sections?: { heading: string; body: string }[];
  pages?: { text: string }[];
  rows?: any[][];
  md?: string;
};

export type TodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type PlanStep = {
  id: string;
  type: string;
  description: string;
  required: boolean;
  maxRetries: number;
};

export type ExecutionPlan = {
  steps: PlanStep[];
  userIntent: string;
  reasoning: string;
  estimatedSteps: number;
};

export type PermissionRequest = {
  id: string;
  toolName: string;
  args: any;
  description: string;
};

export type ToolGroup = {
  tools: { name: string; args: any }[];
};

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input?: any; output?: any; status: "pending" | "running" | "completed" | "error" }
  | { type: "thought"; content: string }
  | { type: "image"; url: string; filename: string; mime: string }
  | { type: "file"; filename: string; mime: string; base64?: string }
  | { type: "source"; url: string; title?: string }
  | { type: "todos"; items: TodoItem[] }
  | { type: "plan"; steps: PlanStep[]; userIntent: string; reasoning: string }
  | { type: "permission"; id: string; toolName: string; args: any; description: string; status: "pending" | "approved" | "denied" }
  | { type: "tool_group"; tools: { name: string; args: any }[] }
  | { type: "agent_status"; status: string; message: string };

export type Message = {
  id: string | number;
  role: "User" | "Assistant";
  content: string;
  createdAt: string;
  sources?: Source[];
  followUps?: string[];
  generatedFiles?: GeneratedFile[];
  fileAttachment?: { name: string; content?: string; type?: string }[];
  error?: boolean;
  errorMessage?: string;
  thoughtProcess?: any[];
  parts?: MessagePart[];
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  slug: string;
  messages: Message[];
};

export type AttachedFile = {
  name: string;
  content: string;
  type?: string;
};
