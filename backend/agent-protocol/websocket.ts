// WebSocket handler for bidirectional agent communication
// AionUi patterns: structured errors, input validation guards, singleton reconnect, heartbeat cleanup
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { AgentSession, sessionRegistry } from "./session";
import type { AgentSessionConfig, AgentMode, AgentMessage, AgentCapabilities } from "./types";
import { AgentError, AuthError, SessionError, ValidationError, TimeoutError, isRetryableError } from "./errors";

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  isAlive?: boolean;
  token?: string;
}

export function createAgentWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/agent" });

  wss.on("connection", (ws: AuthenticatedSocket, req) => {
    ws.isAlive = true;

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (raw) => {
      try {
        // AionUi pattern: input validation guard
        if (typeof raw !== "string" && !Buffer.isBuffer(raw)) {
          return sendError(ws, "invalid_format", "Expected text message");
        }
        const msg = JSON.parse(raw.toString());
        // AionUi pattern: structural validation
        if (!msg || typeof msg !== "object" || !msg.type || typeof msg.type !== "string") {
          return sendError(ws, "invalid_message", "Message must have a 'type' field");
        }
        await handleMessage(ws, msg);
      } catch (e: any) {
        if (e instanceof SyntaxError) {
          sendError(ws, "parse_error", "Invalid JSON");
        } else if (e instanceof AgentError) {
          sendError(ws, e.code, e.message, e.recoverable, e.details);
        } else {
          sendError(ws, "internal_error", e.message || "Unknown error", false);
        }
      }
    });

    ws.on("close", () => {
      if (ws.sessionId) {
        const session = sessionRegistry.get(ws.sessionId);
        if (session && session.state === "processing") {
          session.transition("cooldown");
        }
      }
    });

    ws.on("error", (err) => {
      console.error("[WS] Error:", err.message);
    });

    // Send capabilities on connect
    send(ws, {
      type: "agent_status",
      id: `init_${Date.now()}`,
      sessionId: "system",
      timestamp: Date.now(),
      payload: { status: "connected", message: "Agent WebSocket connected" },
    });
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

async function handleMessage(ws: AuthenticatedSocket, msg: any) {
  const { type, payload } = msg;

  switch (type) {
    case "auth":
      await handleAuth(ws, payload);
      break;
    case "session_start":
      await handleSessionStart(ws, payload);
      break;
    case "user_message":
      await handleUserMessage(ws, payload);
      break;
    case "permission_response":
      await handlePermissionResponse(ws, payload);
      break;
    case "session_stop":
      await handleSessionStop(ws, payload);
      break;
    case "heartbeat":
      send(ws, { type: "heartbeat", id: `hb_${Date.now()}`, sessionId: ws.sessionId || "", timestamp: Date.now(), payload: {} });
      break;
    case "ping":
      send(ws, { type: "pong", id: `pong_${Date.now()}`, sessionId: ws.sessionId || "", timestamp: Date.now(), payload: {} });
      break;
    default:
      sendError(ws, "unknown_type", `Unknown message type: ${type}`, true);
  }
}

async function handleAuth(ws: AuthenticatedSocket, payload: any) {
  // AionUi pattern: input validation guard
  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Invalid auth payload");
  }
  const { token } = payload;
  if (!token || typeof token !== "string") {
    throw new AuthError("Authentication token required");
  }
  ws.token = token;
  try {
    const response = await fetch("http://localhost:3001/whoami", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new AuthError("Authentication failed");
    const data = await response.json() as { appUserId?: string; email?: string };
    ws.userId = data.appUserId;
    send(ws, {
      type: "agent_status",
      id: `auth_${Date.now()}`,
      sessionId: "system",
      timestamp: Date.now(),
      payload: { status: "authenticated", message: `Authenticated as ${data.email ?? "unknown"}` },
    });
  } catch (e: any) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("Authentication service unreachable");
  }
}

async function handleSessionStart(ws: AuthenticatedSocket, payload: any) {
  // AionUi pattern: guard clause — must be authenticated
  if (!ws.userId) {
    throw new AuthError("Authenticate first", { reason: "not_authenticated" });
  }

  // AionUi pattern: input validation guard
  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Invalid session payload");
  }

  const { model, conversationId, mode } = payload;
  const config: AgentSessionConfig = {
    userId: ws.userId,
    conversationId: conversationId || `conv_${Date.now()}`,
    model: model || "kimi-k2.6",
    mode: (mode as AgentMode) || "default",
  };

  const session = sessionRegistry.create(config);
  ws.sessionId = session.id;

  await session.transition("connecting");
  send(ws, makeMsg(session, "agent_status", { status: "connecting", message: "Initializing agent..." }));

  await session.transition("warming_up");
  send(ws, makeMsg(session, "agent_status", { status: "warming_up", message: "Warming up model..." }));

  const caps: AgentCapabilities = {
    maxTools: 10,
    maxSteps: 8,
    supportsStreaming: true,
    supportsVision: ["kimi-k2.6", "nemotron-nano-12b-v2-vl"].includes(config.model),
    supportsThinking: ["deepseek-v4-flash", "step-3.7-flash"].includes(config.model),
    supportedModes: ["default", "plan", "yolo"],
    availableTools: ["web_search", "read_skill", "generate_document", "get_weather", "generate_image"],
    maxContextLength: 128000,
  };
  session.setCapabilities(caps);

  await session.transition("ready");
  send(ws, makeMsg(session, "agent_status", { status: "ready", message: "Agent ready" }));

  send(ws, makeMsg(session, "agent_status", {
    status: "capabilities",
    message: "Agent capabilities",
    capabilities: caps,
  }));
}

async function handleUserMessage(ws: AuthenticatedSocket, payload: any) {
  if (!ws.sessionId) throw new SessionError("Start a session first", "no_session");
  const session = sessionRegistry.get(ws.sessionId);
  if (!session) throw new SessionError("Session not found", "session_not_found");

  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Invalid message payload");
  }
  const { text, attachments } = payload;
  console.log("[DEBUG WS handleUserMessage] text:", text, "attachments:", attachments ? attachments.map((a: any) => ({ name: a.name, size: a.content?.length, type: a.type })) : null);
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new ValidationError("Message cannot be empty", "empty_message");
  }
  if (text.length > 10000) {
    throw new ValidationError("Message too long (max 10000 characters)", "message_too_long");
  }

  await session.transition("processing");
  send(ws, makeMsg(session, "start", { query: text }));
  send(ws, makeMsg(session, "user_message", { text, attachments }));
  send(ws, makeMsg(session, "agent_status", { status: "processing", message: "Processing your request..." }));

  try {
    // Proxy to /flux_ask SSE endpoint — reuses all existing LLM+tools logic
    const sseUrl = `http://localhost:3001/flux_ask`;
    const body = JSON.stringify({
      query: text,
      model: session.config.model,
      conversationId: session.config.conversationId,
      attachedFiles: attachments || [],
    });

    const sseRes = await fetch(sseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ws.token || ""}`,
      },
      body,
    });

    if (!sseRes.ok) {
      const errText = await sseRes.text().catch(() => "Unknown error");
      throw new Error(`Backend error (${sseRes.status}): ${errText}`);
    }

    const reader = sseRes.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedText = "";

    // Read SSE stream and forward as WS messages
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { currentEvent = ""; continue; }
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw);
            const wsType = mapSseEventToWs(currentEvent, parsed);
            if (wsType === "text") {
              accumulatedText += (parsed.text || parsed.content || "");
              send(ws, makeMsg(session, "text", { text: parsed.text || parsed.content || "" }));
            } else if (wsType === "finish") {
              send(ws, makeMsg(session, "finish", {
                text: accumulatedText,
                sources: parsed.sources || [],
                generatedFiles: parsed.generatedFiles || [],
              }));
            } else if (wsType) {
              send(ws, makeMsg(session, wsType as any, parsed.data || parsed));
            }
          } catch {
            // Unparseable data line — AI SDK plain text output
            if (raw.trim()) {
              accumulatedText += raw;
              send(ws, makeMsg(session, "text", { text: raw }));
            }
          }
        } else {
          // Not SSE format — AI SDK plain text output
          accumulatedText += trimmed + "\n";
          send(ws, makeMsg(session, "text", { text: trimmed + "\n" }));
        }
      }
    }

    // If no finish event was sent, send one
    if (!accumulatedText) {
      send(ws, makeMsg(session, "finish", { text: "", sources: [] }));
    }

    await session.transition("ready");
    send(ws, makeMsg(session, "agent_status", { status: "ready", message: "Ready" }));
  } catch (e: any) {
    const code = e instanceof TimeoutError ? "timeout"
      : "processing_error";
    send(ws, makeMsg(session, "error", {
      code,
      message: e.message,
      recoverable: isRetryableError(e),
    }));
    await session.transition("error");
  }
}

function mapSseEventToWs(eventType: string, parsed: any): string | null {
  // AI SDK data stream events
  if (parsed.type === "text" || parsed.type === "text-delta") return "text";
  if (parsed.type === "finish" || parsed.type === "done" || parsed.type === "error") return "finish";
  if (parsed.type === "tool-call" || parsed.type === "tool_call") return "tool_call";
  if (parsed.type === "tool-result" || parsed.type === "tool_result") return "tool_result";

  // Custom SSE events
  if (eventType === "status") {
    if (parsed.subtype === "generating_file") return null;
    if (parsed.subtype === "searching" || parsed.subtype === "reading") return null;
    return null;
  }
  if (eventType === "plan") return "plan";
  if (eventType === "permission") return "permission_request";
  if (eventType === "tool_group") return "tool_group";
  if (eventType === "tool_call") return "tool_call";
  if (eventType === "agent_status") return "agent_status";

  return null;
}

async function handlePermissionResponse(ws: AuthenticatedSocket, payload: any) {
  if (!ws.sessionId) return;
  const session = sessionRegistry.get(ws.sessionId);
  if (!session) return;

  const { permissionId, approved } = payload || {};
  if (!permissionId) return;

  session.resolvePermission(permissionId, !!approved);
  send(ws, makeMsg(session, "permission_response", {
    id: permissionId,
    approved: !!approved,
  }));
}

async function handleSessionStop(ws: AuthenticatedSocket, payload: any) {
  if (!ws.sessionId) return;
  const session = sessionRegistry.get(ws.sessionId);
  if (!session) return;

  await session.transition("cooldown");
  send(ws, makeMsg(session, "agent_status", { status: "cooldown", message: "Session ending..." }));
  await session.transition("finished");
  send(ws, makeMsg(session, "agent_status", { status: "finished", message: "Session ended" }));
}

// ── Helpers ──
function send(ws: WebSocket, msg: AgentMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, code: string, message: string, recoverable = true, details?: Record<string, unknown>) {
  send(ws, {
    type: "error",
    id: `err_${Date.now()}`,
    sessionId: (ws as any).sessionId || "",
    timestamp: Date.now(),
    payload: { code, message, recoverable, ...(details ? { details } : {}) },
  });
}

function makeMsg(session: AgentSession, type: any, payload: any): AgentMessage {
  return {
    type,
    id: `${type}_${Date.now()}`,
    sessionId: session.id,
    timestamp: Date.now(),
    payload,
  };
}

