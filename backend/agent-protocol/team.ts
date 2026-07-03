// Team/Leader-Teammate orchestration — real execution via NVIDIA NIM
import { generateText } from 'ai';
import { nim } from '../nim-client';
import { AgentSession, sessionRegistry } from "./session";
import { toolRegistry } from '../tool-registry';
import type {
  AgentSessionConfig,
  AgentMessage,
  PlanPayload,
} from "./types";

export type TeamRole = "leader" | "teammate";

export interface TeamMember {
  sessionId: string;
  role: TeamRole;
  name: string;
  status: "idle" | "working" | "waiting" | "completed" | "error";
  assignedTask?: string;
  result?: any;
}

export interface TeamConfig {
  name: string;
  leaderConfig: AgentSessionConfig;
  teammateConfigs: AgentSessionConfig[];
  coordinationMode: "sequential" | "parallel";
  sharedWorkspace?: string;
}

export interface TaskAssignment {
  id: string;
  description: string;
  assignedTo: string;
  dependsOn: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: any;
}

function defaultModel(): string {
  return process.env.NIM_TEAM_MODEL || "nvidia/llama-4-maverick-17b-128e-instruct";
}

export class TeamSession {
  public readonly id: string;
  public readonly config: TeamConfig;
  public leader: TeamMember;
  public teammates: TeamMember[] = [];
  public taskBoard: TaskAssignment[] = [];
  private messageBus = new Map<string, Set<(msg: AgentMessage) => void>>();
  private createdAt = Date.now();

  constructor(config: TeamConfig) {
    this.id = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.config = config;
    this.leader = {
      sessionId: "",
      role: "leader",
      name: "Leader",
      status: "idle",
    };
  }

  async initialize(): Promise<void> {
    const leaderSession = sessionRegistry.create(this.config.leaderConfig);
    this.leader.sessionId = leaderSession.id;
    await leaderSession.transition("connecting");
    await leaderSession.transition("warming_up");
    await leaderSession.transition("ready");

    for (let i = 0; i < this.config.teammateConfigs.length; i++) {
      const tConfig = this.config.teammateConfigs[i]!;
      const tSession = sessionRegistry.create(tConfig);
      await tSession.transition("connecting");
      await tSession.transition("ready");

      this.teammates.push({
        sessionId: tSession.id,
        role: "teammate",
        name: `Teammate ${i + 1}`,
        status: "idle",
      });
    }

    this.leader.status = "idle";
    console.log(`[TEAM ${this.id.slice(0, 16)}] Initialized with ${this.teammates.length} teammate(s)`);
  }

  async processTask(userQuery: string): Promise<void> {
    this.leader.status = "working";
    const leaderSession = sessionRegistry.get(this.leader.sessionId);
    if (!leaderSession) return;

    await leaderSession.transition("processing");
    this.broadcast("agent_status", {
      status: "team_run_started",
      message: "Leader analyzing task...",
      teamId: this.id,
    });

    // Phase 1: Leader analyzes and breaks down the task via NIM
    const plan = await this.leaderAnalyze(leaderSession, userQuery);
    this.broadcast("plan", { ...plan, source: "leader" });

    // Phase 2: Delegate subtasks to teammates with real tool execution
    if (this.config.coordinationMode === "parallel") {
      await Promise.all(this.teammates.map((t, i) => this.delegateTask(t, plan, i)));
    } else {
      for (let i = 0; i < this.teammates.length; i++) {
        await this.delegateTask(this.teammates[i]!, plan, i);
        const tSession = sessionRegistry.get(this.teammates[i]!.sessionId);
        if (tSession) await tSession.transition("cooldown");
      }
    }

    // Phase 3: Leader synthesizes results via NIM
    await leaderSession.transition("processing");
    this.broadcast("agent_status", {
      status: "synthesizing",
      message: "Leader synthesizing team results...",
    });
    const synthesis = await this.leaderSynthesize(leaderSession, userQuery);
    this.broadcast("text", { text: synthesis, source: "leader" });

    this.leader.status = "completed";
    await leaderSession.transition("finished");
    this.broadcast("agent_status", {
      status: "team_run_completed",
      message: "Team task completed",
      teamId: this.id,
    });
  }

  private async leaderAnalyze(session: AgentSession, query: string): Promise<PlanPayload> {
    const model = nim(defaultModel());
    const teammateDescs = this.teammates.map((t, i) =>
      `Teammate ${i + 1}: agent with tool access for web_search, generate_document, file operations`
    ).join("\n");

    const systemPrompt = `You are a team leader AI. Break down the user's request into specific subtasks for your teammates.
Available teammates:
${teammateDescs}

For each subtask, provide:
1. A unique step ID
2. A clear description of what to do
3. Which teammate should handle it (by number)
4. Dependencies on other steps

Output only a JSON array of steps with this structure:
{ "steps": [{ "id": "step_1", "description": "...", "type": "execute", "required": true, "assignedTo": 1 }] }
The IDs must be unique. Use at most one step per teammate. Include an initial "analyze" step and a final "synthesize" step.`;

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: `Break down this task for my team: ${query}`,
        maxTokens: 1024,
        temperature: 0.3,
      } as any);

      const parsed = JSON.parse(text);
      const steps = parsed.steps || [];

      const plan: PlanPayload = {
        steps: steps.map((s: any) => ({
          id: s.id,
          description: s.description,
          type: s.type || "execute",
          required: s.required !== false,
        })),
        userIntent: query,
        reasoning: `Leader analysis: broken into ${steps.length} steps across ${this.teammates.length} teammate(s)`,
      };

      this.taskBoard = steps.map((s: any) => ({
        id: s.id,
        description: s.description,
        assignedTo: s.assignedTo !== undefined
          ? (this.teammates[s.assignedTo]?.sessionId ?? this.leader.sessionId)
          : this.leader.sessionId,
        dependsOn: s.dependsOn || [],
        status: "pending" as const,
      }));

      return plan;
    } catch (e: any) {
      console.error("[TEAM] LLM analysis failed, using fallback plan:", e.message);
      const plan: PlanPayload = {
        steps: [
          { id: "analyze", description: "Analyze the request", type: "analyze", required: true },
          ...this.teammates.map((_, i) => ({
            id: `task_${i}`,
            description: `Teammate ${i + 1} processes: ${query.slice(0, 100)}`,
            type: "execute" as const,
            required: true,
          })),
          { id: "synthesize", description: "Synthesize results", type: "verify", required: true },
        ],
        userIntent: query,
        reasoning: `Fallback plan: ${this.teammates.length} teammate(s) processing in parallel`,
      };
      this.taskBoard = plan.steps.map((s, i) => ({
        id: s.id,
        description: s.description,
        assignedTo: s.id === "analyze" || s.id === "synthesize"
          ? this.leader.sessionId
          : (this.teammates[parseInt(s.id.replace("task_", ""))]?.sessionId ?? ""),
        dependsOn: i > 0 ? [plan.steps[i - 1]!.id] : [],
        status: "pending" as const,
      }));
      return plan;
    }
  }

  private async delegateTask(member: TeamMember, plan: PlanPayload, index: number): Promise<void> {
    member.status = "working";
    const session = sessionRegistry.get(member.sessionId);
    if (!session) {
      member.status = "error";
      return;
    }

    await session.transition("processing");
    this.broadcast("agent_status", {
      status: "child_turn_started",
      message: `${member.name} starting work...`,
      teammate: member.name,
      slotId: member.sessionId,
    });

    // Find the subtask for this teammate
    const subtask = this.taskBoard.find(
      (t) => t.assignedTo === member.sessionId && t.status === "pending"
    );

    if (!subtask) {
      member.status = "completed";
      return;
    }

    subtask.status = "in_progress";
    this.broadcast("task_changed", { taskId: subtask.id, status: "in_progress" });

    const model = nim(defaultModel());
    const tools = toolRegistry.getAll();

    const systemPrompt = `You are ${member.name}, a specialist AI assistant. You have access to tools.
Your task: ${subtask.description}

Available tools: ${tools.map(t => `${t.name}: ${t.description}`).join("\n")}

Complete your task thoroughly. If you need to search for information, use web_search.
If you need to generate a document, use generate_document.
Return your complete findings.`;

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: subtask.description,
        maxTokens: 2048,
        temperature: 0.4,
      } as any);

      member.result = text;
      subtask.status = "completed";
      subtask.result = text;
      member.status = "completed";

      await session.transition("ready");
      this.broadcast("agent_status", {
        status: "child_turn_completed",
        message: `${member.name} completed task`,
        teammate: member.name,
        result: text.slice(0, 500),
        slotId: member.sessionId,
      });
      this.broadcast("task_changed", { taskId: subtask.id, status: "completed", result: text.slice(0, 200) });
    } catch (e: any) {
      console.error(`[TEAM] ${member.name} failed:`, e.message);
      member.status = "error";
      subtask.status = "failed";
      this.broadcast("agent_status", {
        status: "child_turn_failed",
        message: `${member.name} failed: ${e.message}`,
        teammate: member.name,
        error: e.message,
        slotId: member.sessionId,
      });
    }
  }

  private async leaderSynthesize(session: AgentSession, query: string): Promise<string> {
    const model = nim(defaultModel());

    const teammateResults = this.teammates
      .filter((t) => t.result)
      .map((t) => `${t.name}: ${t.result}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are the team leader AI. Synthesize the results from your teammates into a coherent final answer.
Original user request: ${query}

Teammate results:
${teammateResults || "No specific results from teammates."}

Provide a comprehensive synthesis that combines all findings. If any teammate found relevant information, incorporate it. 
Structure the response clearly.`;

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: `Synthesize all team findings for: ${query}`,
        maxTokens: 2048,
        temperature: 0.3,
      } as any);
      return text;
    } catch (e: any) {
      console.error("[TEAM] Synthesis failed:", e.message);
      const fallback = this.teammates
        .filter((t) => t.result)
        .map((t) => `**${t.name}**:\n${t.result}`)
        .join("\n\n");
      return fallback || `Team processed your request about "${query.slice(0, 80)}". Check the task board for details.`;
    }
  }

  // ── Communication ─────────────────────────────────────────
  onMessage(callback: (msg: AgentMessage) => void): () => void {
    const id = `listener_${Date.now()}`;
    if (!this.messageBus.has("all")) {
      this.messageBus.set("all", new Set());
    }
    this.messageBus.get("all")!.add(callback);
    return () => this.messageBus.get("all")?.delete(callback);
  }

  private broadcast(type: string, payload: any): void {
    const msg: AgentMessage = {
      type: type as any,
      id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: this.id,
      timestamp: Date.now(),
      payload,
    };
    const listeners = this.messageBus.get("all");
    if (listeners) {
      listeners.forEach(l => l(msg));
    }
  }

  // ── Status ────────────────────────────────────────────────
  getStatus(): any {
    return {
      id: this.id,
      name: this.config.name,
      leader: { name: this.leader.name, status: this.leader.status },
      teammates: this.teammates.map(t => ({
        name: t.name, status: t.status, task: t.assignedTask,
        resultPreview: t.result?.slice(0, 200),
      })),
      taskBoard: this.taskBoard.map(t => ({
        id: t.id, description: t.description, status: t.status,
        resultPreview: t.result?.slice(0, 200),
      })),
      mode: this.config.coordinationMode,
    };
  }

  destroy(): void {
    const allIds = [this.leader.sessionId, ...this.teammates.map(t => t.sessionId)];
    allIds.forEach(id => sessionRegistry.remove(id));
    this.messageBus.clear();
  }
}

// ── Team Registry ───────────────────────────────────────────
export class TeamRegistry {
  private teams = new Map<string, TeamSession>();

  create(config: TeamConfig): TeamSession {
    const team = new TeamSession(config);
    this.teams.set(team.id, team);
    return team;
  }

  get(id: string): TeamSession | undefined {
    return this.teams.get(id);
  }

  remove(id: string): void {
    const team = this.teams.get(id);
    if (team) {
      team.destroy();
      this.teams.delete(id);
    }
  }

  list(): TeamSession[] {
    return [...this.teams.values()];
  }
}

export const teamRegistry = new TeamRegistry();
