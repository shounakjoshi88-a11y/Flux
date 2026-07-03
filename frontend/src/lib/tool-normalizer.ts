// Unified Tool Call Normalizer — inspired by AionUi's normalizeToolCall.ts
// Normalizes tool_group, tool_call, tool_result, and acp_tool_call into a single format

export type NormalizedToolStatus = "pending" | "running" | "completed" | "error";

export interface NormalizedToolCall {
  key: string;
  name: string;
  status: NormalizedToolStatus;
  description?: string;
  input?: string;
  output?: string;
  truncated?: boolean;
}

function buildParamSummary(name: string, input: any): string {
  if (!input) return "";
  const raw = typeof input === "string" ? input : JSON.stringify(input);
  const lower = name.toLowerCase();
  if (lower.includes("search") || lower.includes("web")) {
    const q = input.query || input.q || input.prompt || "";
    return `"${String(q).slice(0, 80)}"`;
  }
  if (lower.includes("read") || lower.includes("edit") || lower.includes("file")) {
    return input.file_path || input.path || input.filename || raw;
  }
  if (lower.includes("execute") || lower.includes("run") || lower.includes("bash")) {
    return input.command || input.cmd || raw;
  }
  if (lower.includes("generate") || lower.includes("doc") || lower.includes("create")) {
    return input.topic || input.title || input.prompt || raw;
  }
  return raw.length > 100 ? raw.slice(0, 100) + "..." : raw;
}

export function normalizeToolCall(
  type: string,
  payload: any
): NormalizedToolCall | null {
  switch (type) {
    case "tool_call":
      return {
        key: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: payload.toolName || payload.name || "unknown",
        status: payload.status || "running",
        input: buildParamSummary(payload.toolName || "", payload.args),
        output: payload.result ? String(payload.result).slice(0, 500) : undefined,
      };

    case "tool_result":
      return {
        key: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: payload.toolName || "unknown",
        status: "completed",
        input: buildParamSummary(payload.toolName || "", payload.args),
        output: payload.result ? String(payload.result).slice(0, 500) : undefined,
      };

    case "tool_group":
      if (!payload.tools?.length) return null;
      return {
        key: `tg_${Date.now()}`,
        name: `Tool Group (${payload.tools.length})`,
        status: "completed",
        description: payload.tools.map((t: any) => t.name || t.toolName).join(", "),
      };

    default:
      return null;
  }
}

export function normalizeToolGroup(tools: any[]): NormalizedToolCall[] {
  return tools.map((t, i) => ({
    key: `tool_${Date.now()}_${i}`,
    name: t.name || t.toolName || "unknown",
    status: "completed",
    input: buildParamSummary(t.name || "", t.args || t.input),
  }));
}

export function shouldAutoApprove(name: string): boolean {
  const safe = ["web_search", "read_skill", "get_weather", "list_dir"];
  return safe.some((s) => name.toLowerCase().includes(s));
}
