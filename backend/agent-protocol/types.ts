// Agent Communication Protocol — message types and session management
// Inspired by AionUi's ACP (Agent Communication Protocol)

// ── Agent Session States ────────────────────────────────────
export type AgentSessionState =
  | "idle"
  | "connecting"
  | "warming_up"
  | "ready"
  | "processing"
  | "awaiting_permission"
  | "cooldown"
  | "error"
  | "finished";

// ── Session Configuration ───────────────────────────────────
export interface AgentSessionConfig {
  userId: string;
  conversationId: string;
  model: string;
  mode: AgentMode;
  workspace?: string;
  locale?: string;
}

export type AgentMode =
  | "default"
  | "plan"
  | "yolo"
  | "bypass_permissions";

export interface AgentCapabilities {
  maxTools: number;
  maxSteps: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportedModes: AgentMode[];
  availableTools: string[];
  maxContextLength: number;
}

// ── Protocol Message Types ──────────────────────────────────
export type AgentMessageType =
  | "start"
  | "text"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "tool_group"
  | "permission_request"
  | "permission_response"
  | "plan"
  | "agent_status"
  | "context_usage"
  | "finish"
  | "error"
  | "user_message"
  | "heartbeat"
  | "pong"
  | "trace";

export interface AgentMessage {
  type: AgentMessageType;
  id: string;
  sessionId: string;
  timestamp: number;
  payload: any;
}

// ── Specific Message Payloads ───────────────────────────────
export interface ToolCallPayload {
  toolName: string;
  args: Record<string, any>;
  status: "pending" | "running" | "completed" | "error";
  result?: any;
  startTime?: number;
  duration?: number;
}

export interface ToolGroupPayload {
  parallel: boolean;
  tools: Array<{
    name: string;
    args: Record<string, any>;
    description: string;
  }>;
}

export interface PermissionRequestPayload {
  id: string;
  toolName: string;
  args: Record<string, any>;
  description: string;
  requiresFileDiff?: boolean;
  fileDiff?: string;
  commandPreview?: string;
}

export interface PlanPayload {
  steps: Array<{
    id: string;
    description: string;
    type: string;
    required: boolean;
    estimatedDuration?: number;
  }>;
  userIntent: string;
  reasoning: string;
}

export interface AgentStatusPayload {
  status: string;
  message: string;
  progress?: number;
  substatus?: string;
}

export interface ThinkingPayload {
  content: string;
  depth?: number;
}

export interface ContextUsagePayload {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  contextWindow: number;
  usageRatio: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

// ── Session State Transitions ───────────────────────────────
export const VALID_TRANSITIONS: Record<AgentSessionState, AgentSessionState[]> = {
  idle: ["connecting"],
  connecting: ["warming_up", "error"],
  warming_up: ["ready", "error"],
  ready: ["processing", "idle"],
  processing: ["awaiting_permission", "ready", "cooldown", "finished", "error"],
  awaiting_permission: ["processing", "ready", "error"],
  cooldown: ["idle", "error"],
  error: ["idle", "connecting"],
  finished: ["idle"],
};
