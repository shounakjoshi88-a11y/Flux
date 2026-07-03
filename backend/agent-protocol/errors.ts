// AionUi-inspired structured error classes with machine-readable codes
export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export class AuthError extends AgentError {
  constructor(message = "Authentication failed", details?: Record<string, unknown>) {
    super(message, "auth_failed", false, details);
    this.name = "AuthError";
  }
}

export class SessionError extends AgentError {
  constructor(message: string, code = "session_error", details?: Record<string, unknown>) {
    super(message, code, true, details);
    this.name = "SessionError";
  }
}

export class ToolError extends AgentError {
  constructor(message: string, public toolName: string, code = "tool_error", details?: Record<string, unknown>) {
    super(message, code, true, { ...details, tool: toolName });
    this.name = "ToolError";
  }
}

export class TimeoutError extends AgentError {
  constructor(message = "Operation timed out", details?: Record<string, unknown>) {
    super(message, "timeout", true, details);
    this.name = "TimeoutError";
  }
}

export class ValidationError extends AgentError {
  constructor(message: string, code = "validation_error", details?: Record<string, unknown>) {
    super(message, code, false, details);
    this.name = "ValidationError";
  }
}

export function isAgentError(err: unknown): err is AgentError {
  return err instanceof AgentError
    || (typeof err === "object" && err !== null && "code" in err && "recoverable" in err);
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof AgentError) return err.recoverable;
  if (err instanceof TypeError) return true;
  return false;
}
