// Agent Session Manager — handles lifecycle, state transitions, and message routing
import type {
  AgentSessionState,
  AgentSessionConfig,
  AgentCapabilities,
  AgentMessage,
  AgentMessageType,
  AgentMode,
  ToolCallPayload,
  ToolGroupPayload,
  PermissionRequestPayload,
  PlanPayload,
  AgentStatusPayload,
  ThinkingPayload,
  ContextUsagePayload,
  ErrorPayload,
} from "./types";
import { VALID_TRANSITIONS } from "./types";

type MessageHandler = (msg: AgentMessage) => void | Promise<void>;
type StateChangeHandler = (from: AgentSessionState, to: AgentSessionState) => void;

export class AgentSession {
  public readonly id: string;
  public config: AgentSessionConfig;
  public state: AgentSessionState = "idle";
  public capabilities: AgentCapabilities | null = null;

  private messageHandlers = new Map<AgentMessageType, Set<MessageHandler>>();
  private stateChangeHandlers = new Set<StateChangeHandler>();
  private messageHistory: AgentMessage[] = [];
  private toolResults: Map<string, ToolCallPayload> = new Map();
  private pendingPermissions = new Map<string, PermissionRequestPayload>();
  public readonly createdAt = Date.now();
  private lastActivityAt = Date.now();
  private metadata: Map<string, any> = new Map();

  constructor(config: AgentSessionConfig) {
    this.id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.config = config;
  }

  // ── State Management ──────────────────────────────────────
  async transition(to: AgentSessionState): Promise<boolean> {
    const valid = VALID_TRANSITIONS[this.state];
    if (!valid?.includes(to)) {
      console.warn(`[SESSION] Invalid transition: ${this.state} → ${to}`);
      return false;
    }
    const from = this.state;
    this.state = to;
    this.lastActivityAt = Date.now();
    this.stateChangeHandlers.forEach(h => h(from, to));
    console.log(`[SESSION ${this.id.slice(0, 16)}] ${from} → ${to}`);
    return true;
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  // ── Message Handling ──────────────────────────────────────
  on(type: AgentMessageType, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    return () => this.messageHandlers.get(type)?.delete(handler);
  }

  async send(msg: Omit<AgentMessage, "sessionId" | "timestamp">): Promise<void> {
    const full: AgentMessage = {
      ...msg,
      sessionId: this.id,
      timestamp: Date.now(),
    };
    this.messageHistory.push(full);
    const handlers = this.messageHandlers.get(msg.type);
    if (handlers) {
      await Promise.all([...handlers].map(h => h(full)));
    }
    this.lastActivityAt = Date.now();
  }

  // ── Tool & Permission Management ──────────────────────────
  addToolResult(callId: string, result: ToolCallPayload): void {
    this.toolResults.set(callId, result);
  }

  getToolResult(callId: string): ToolCallPayload | undefined {
    return this.toolResults.get(callId);
  }

  createPermissionRequest(toolName: string, args: any, description: string): PermissionRequestPayload {
    const payload: PermissionRequestPayload = {
      id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      toolName,
      args,
      description,
    };
    this.pendingPermissions.set(payload.id, payload);
    return payload;
  }

  resolvePermission(id: string, approved: boolean): boolean {
    const perm = this.pendingPermissions.get(id);
    if (!perm) return false;
    this.pendingPermissions.delete(id);
    return true;
  }

  // ── Capabilities ──────────────────────────────────────────
  setCapabilities(caps: AgentCapabilities): void {
    this.capabilities = caps;
  }

  // ── Metadata ──────────────────────────────────────────────
  set(key: string, value: any): void {
    this.metadata.set(key, value);
  }

  get(key: string): any {
    return this.metadata.get(key);
  }

  // ── Session Info ──────────────────────────────────────────
  get isActive(): boolean {
    return !["idle", "finished", "error"].includes(this.state);
  }

  get age(): number {
    return Date.now() - this.createdAt;
  }

  get idleTime(): number {
    return Date.now() - this.lastActivityAt;
  }

  get messageCount(): number {
    return this.messageHistory.length;
  }

  recentMessages(count: number = 10): AgentMessage[] {
    return this.messageHistory.slice(-count);
  }
}

// ── Session Registry ────────────────────────────────────────
export class SessionRegistry {
  private sessions = new Map<string, AgentSession>();
  private userSessions = new Map<string, Set<string>>();

  create(config: AgentSessionConfig): AgentSession {
    const session = new AgentSession(config);
    this.sessions.set(session.id, session);

    const userSet = this.userSessions.get(config.userId) || new Set();
    userSet.add(session.id);
    this.userSessions.set(config.userId, userSet);

    return session;
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  getUserSessions(userId: string): AgentSession[] {
    const ids = this.userSessions.get(userId) || new Set();
    return [...ids].map(id => this.sessions.get(id)).filter(Boolean) as AgentSession[];
  }

  getActiveSessions(): AgentSession[] {
    return [...this.sessions.values()].filter(s => s.isActive);
  }

  remove(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      const userSet = this.userSessions.get(session.config.userId);
      if (userSet) {
        userSet.delete(id);
        if (userSet.size === 0) this.userSessions.delete(session.config.userId);
      }
      this.sessions.delete(id);
    }
  }

  cleanup(): void {
    const now = Date.now();
    const TIMEOUT = 30 * 60 * 1000; // 30 min
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > TIMEOUT) {
        this.remove(id);
      }
    }
  }
}

export const sessionRegistry = new SessionRegistry();
setInterval(() => sessionRegistry.cleanup(), 5 * 60 * 1000);
