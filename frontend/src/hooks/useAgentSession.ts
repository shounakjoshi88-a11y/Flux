// Agent Session hook — AionUi-grade implementation
// Features: O(1) message index, throttled thoughts, turn state machine guards,
// approval store with session memory, tool normalizer
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";
import type { Message, AttachedFile, MessagePart } from "@/types";
import { createMessageIndex, composeMessageWithIndex } from "@/lib/message-index";
import { normalizeToolCall } from "@/lib/tool-normalizer";
import { ApprovalStore, approvalKeyForTool, globalApprovalStore } from "@/lib/approval-store";

const supabase = createClient();

type AgentSessionState =
  | "idle" | "connecting" | "warming_up" | "ready"
  | "processing" | "awaiting_permission" | "cooldown"
  | "error" | "finished";

export type AgentMode = "default" | "plan" | "yolo";

interface AgentCapabilities {
  maxTools: number;
  maxSteps: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportedModes: AgentMode[];
  availableTools: string[];
}

interface AgentMessage {
  type: string;
  id: string;
  sessionId: string;
  timestamp: number;
  payload: any;
}

interface UseAgentSessionCallbacks {
  onNewConversationId?: (id: string) => void;
  onComplete?: () => void;
  onMessageId?: (id: string) => void;
  onPermissionRequest?: (request: any) => void;
  onPlan?: (plan: any) => void;
}

let nextId = 1;

// ── Throttle helper (50ms like AionUi) ────────────────────
function createThrottledUpdater<T>(ms: number, setter: (val: T) => void, getRef: () => { pending: T | null; timer: ReturnType<typeof setTimeout> | null; lastUpdate: number }) {
  return (data: T) => {
    const now = Date.now();
    const ref = getRef();
    if (now - ref.lastUpdate >= ms) {
      ref.lastUpdate = now;
      setter(data);
    } else {
      ref.pending = data;
      if (!ref.timer) {
        const delay = ms - (now - ref.lastUpdate);
        ref.timer = setTimeout(() => {
          ref.lastUpdate = Date.now();
          if (ref.pending) { setter(ref.pending); ref.pending = null; }
          ref.timer = null;
        }, delay);
      }
    }
  };
}

export function useAgentSession(user: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionState, setSessionState] = useState<AgentSessionState>("idle");
  const [capabilities, setCapabilities] = useState<AgentCapabilities | null>(null);
  const [mode, setMode] = useState<AgentMode>("default");
  const [thought, setThought] = useState<{ subject?: string; description?: string; elapsed: number } | null>(null);

  type ThoughtData = { subject?: string; description?: string; elapsed: number } | null;

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // AionUi: singleton reconnect guard

  // ── Turn lifecycle guards (like AionUi's turnFinishedRef) ──
  const turnFinishedRef = useRef(false);
  const hasContentInTurnRef = useRef(false);
  const runningRef = useRef(false);
  const activeAssistantIdRef = useRef<string | null>(null);

  // ── AionUi pattern: cancelled flag + active message ID for stale event filtering ──
  const cancelledRef = useRef(false);
  const activeMsgIdRef = useRef<string | null>(null);

  // ── O(1) message index ──
  const indexRef = useRef(createMessageIndex([]));
  const approvalStoreRef = useRef(globalApprovalStore);

  // ── Streaming buffers ──
  const streamingPartsRef = useRef<MessagePart[]>([]);
  const textAccumRef = useRef<string>("");

  // ── Thought throttling (50ms like AionUi) ──
  const thoughtThrottleRef = useRef<{
    pending: { subject?: string; description?: string; elapsed: number } | null;
    timer: ReturnType<typeof setTimeout> | null;
    lastUpdate: number;
  }>({ pending: null, timer: null, lastUpdate: 0 });

  const throttledSetThought = useMemo(
    () => createThrottledUpdater(50, setThought, () => thoughtThrottleRef.current),
    []
  );

  // ── Elapsed timer for thoughts ──
  const thoughtStartRef = useRef<number>(0);
  const thoughtTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startThoughtTimer = useCallback(() => {
    thoughtStartRef.current = Date.now();
    if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current);
    thoughtTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - thoughtStartRef.current) / 1000);
      setThought((prev) => prev ? { ...prev, elapsed } : null);
    }, 1000);
  }, []);

  const stopThoughtTimer = useCallback(() => {
    if (thoughtTimerRef.current) {
      clearInterval(thoughtTimerRef.current);
      thoughtTimerRef.current = null;
    }
  }, []);

  // ── WebSocket Connection ─── AionUi patterns: exponential backoff, singleton guard, connect timeout ──
  const CONNECT_TIMEOUT_MS = 8000;
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = await getAccessToken();
    if (!token) return;

    const protocol = BACKEND_URL.startsWith("https") ? "wss" : "ws";
    const wsUrl = `${protocol}://${BACKEND_URL.replace(/^https?:\/\//, "")}/agent`;

    // AionUi pattern: connect timeout
    const connectTimeout = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        wsRef.current?.close();
        wsRef.current = null;
        setSessionState("error");
      }
    }, CONNECT_TIMEOUT_MS);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: "auth", payload: { token } }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: AgentMessage = JSON.parse(event.data);
        handleAgentMessage(msg);
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = () => {
      clearTimeout(connectTimeout);
      cancelledRef.current = true;
      // AionUi pattern: singleton reconnect guard
      if (reconnectTimerRef.current) return;
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          cancelledRef.current = false;
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {};
  }, []);

  const disconnect = useCallback(() => {
    // AionUi pattern: enterTerminal — null out ALL handlers to prevent double-fire
    cancelledRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    sessionIdRef.current = null;
    setSessionState("idle");
    stopThoughtTimer();
  }, [stopThoughtTimer]);

  // ── O(1) message update helper ──
  const updateMessages = useCallback(
    (updater: (prev: Message[], index: typeof indexRef.current) => Message[]) => {
      setMessages((prev) => {
        const next = updater(prev, indexRef.current);
        indexRef.current = createMessageIndex(next);
        return next;
      });
    },
    []
  );

  // ── Message Handler ───────────────────────────────────────
  const handleAgentMessage = useCallback((msg: AgentMessage) => {
    // AionUi pattern: stale event filtering via activeMsgIdRef
    const id = msg.payload?.msg_id || msg.id;
    if (activeMsgIdRef.current && id && id !== activeMsgIdRef.current) {
      return;
    }
    const { type, payload } = msg;

    switch (type) {
      case "agent_status": handleAgentStatus(payload); break;
      case "start": handleStart(payload); break;
      case "user_message": break;
      case "text": handleText(payload); break;
      case "thinking": handleThinking(payload); break;
      case "tool_call": handleToolCall(payload); break;
      case "tool_result": handleToolResult(payload); break;
      case "tool_group": handleToolGroup(payload); break;
      case "permission_request": handlePermissionRequest(payload); break;
      case "plan": handlePlan(payload); break;
      case "context_usage": break;
      case "error": handleAgentError(payload); break;
      case "finish": handleFinish(); break;
      case "heartbeat": break;
    }
  }, []);

  const flushPartsToMessage = useCallback(() => {
    const id = activeAssistantIdRef.current;
    if (!id || streamingPartsRef.current.length === 0) return;

    const cleanText = textAccumRef.current;
    const allParts = cleanText
      ? [...streamingPartsRef.current, { type: "text" as const, text: cleanText }]
      : streamingPartsRef.current;

    updateMessages((prev, index) => {
      const idx = index.msgIdIndex.get(id) ?? index.tempIdIndex.get(id);
      if (idx === undefined || idx >= prev.length) return prev;
      const existing = prev[idx];
      if (!existing) return prev;
      const updated = { ...existing, parts: allParts };
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  }, [updateMessages]);

  // ── Turn lifecycle (AionUi-style guards) ──
  const handleStart = useCallback((payload: any) => {
    turnFinishedRef.current = false;
    hasContentInTurnRef.current = false;
    runningRef.current = true;
    setIsLoading(true);
    isLoadingRef.current = true;
    streamingPartsRef.current = [];
    textAccumRef.current = "";

    const msgParts: MessagePart[] = [{
      type: "thought" as const,
      content: `Processing: ${payload.query?.slice(0, 80) || "..."}`,
    }];
    const id = activeAssistantIdRef.current;
    if (id) {
      updateMessages((prev, index) => {
        const list = composeMessageWithIndex(
          { id, role: "Assistant" as const, content: "", createdAt: new Date().toISOString(), parts: msgParts },
          prev, index
        );
        indexRef.current = createMessageIndex(list);
        return list;
      });
    }

    throttledSetThought({ subject: "Processing", description: payload.query?.slice(0, 60), elapsed: 0 });
    startThoughtTimer();
  }, [throttledSetThought, startThoughtTimer, updateMessages]);

  const handleText = useCallback((payload: any) => {
    if (!runningRef.current && !turnFinishedRef.current) {
      runningRef.current = true;
      setIsLoading(true);
      isLoadingRef.current = true;
    }
    if (!hasContentInTurnRef.current) {
      hasContentInTurnRef.current = true;
      stopThoughtTimer();
      throttledSetThought(null as any);
    }
    textAccumRef.current += payload.text || "";
    flushPartsToMessage();
  }, [flushPartsToMessage, stopThoughtTimer, throttledSetThought]);

  const handleThinking = useCallback((payload: any) => {
    if (!payload.content?.trim()) return;
    if (!hasContentInTurnRef.current) {
      throttledSetThought({
        subject: "Thinking",
        description: payload.content.slice(0, 60),
        elapsed: Math.floor((Date.now() - thoughtStartRef.current) / 1000),
      });
    }
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current,
      { type: "thought" as const, content: payload.content },
    ];
    flushPartsToMessage();
  }, [flushPartsToMessage, throttledSetThought]);

  const handleToolCall = useCallback((payload: any) => {
    const normalized = normalizeToolCall("tool_call", payload);
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current,
      normalized ? {
        type: "tool_call" as const,
        name: normalized.name,
        input: normalized.input,
        output: normalized.output,
        status: normalized.status as "pending" | "running" | "completed" | "error",
      } : {
        type: "tool_call" as const,
        name: payload.toolName || "unknown",
        input: payload.args,
        status: "running",
      },
    ];
    flushPartsToMessage();
  }, [flushPartsToMessage]);

  const handleToolResult = useCallback((payload: any) => {
    const normalized = normalizeToolCall("tool_result", payload);
    if (!normalized) return;
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current.slice(0, -1),
      {
        type: "tool_call" as const,
        name: normalized.name,
        input: normalized.input,
        output: normalized.output,
        status: "completed",
      },
    ];
    flushPartsToMessage();
  }, [flushPartsToMessage]);

  const handleToolGroup = useCallback((payload: any) => {
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current,
      { type: "tool_group" as const, tools: payload.tools || [] },
    ];
    flushPartsToMessage();
  }, [flushPartsToMessage]);

  const handlePermissionRequest = useCallback((payload: any) => {
    const key = approvalKeyForTool(payload.toolName);
    if (approvalStoreRef.current.isApproved(key) || mode === "yolo") {
      wsRef.current?.send(JSON.stringify({
        type: "permission_response",
        payload: { permissionId: payload.id, approved: true },
      }));
      return;
    }
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current,
      {
        type: "permission" as const,
        id: payload.id,
        toolName: payload.toolName,
        args: payload.args,
        description: payload.description,
        status: "pending",
      },
    ];
    setSessionState("awaiting_permission");
    flushPartsToMessage();
  }, [mode, flushPartsToMessage]);

  const handlePlan = useCallback((payload: any) => {
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current,
      {
        type: "plan" as const,
        steps: payload.steps || [],
        userIntent: payload.userIntent || "",
        reasoning: payload.reasoning || "",
      },
    ];
    flushPartsToMessage();
  }, [flushPartsToMessage]);

  const handleAgentStatus = useCallback((payload: any) => {
    switch (payload.status) {
      case "authenticated": setSessionState("connecting"); break;
      case "connecting": setSessionState("connecting"); break;
      case "warming_up":
        setSessionState("warming_up");
        throttledSetThought({ subject: "Warming up", description: payload.message, elapsed: 0 });
        startThoughtTimer();
        break;
      case "ready":
        setSessionState("ready");
        isLoadingRef.current = false;
        setIsLoading(false);
        stopThoughtTimer();
        throttledSetThought(null as any);
        break;
      case "capabilities": setCapabilities(payload.capabilities); break;
      case "processing": setSessionState("processing"); break;
      case "cooldown": setSessionState("cooldown"); break;
      case "finished":
        setSessionState("finished");
        setIsLoading(false);
        isLoadingRef.current = false;
        stopThoughtTimer();
        break;
    }

    if (["connecting", "warming_up", "processing"].includes(payload.status)) {
      flushPartsToMessage();
      streamingPartsRef.current = [
        ...streamingPartsRef.current,
        { type: "agent_status" as const, status: payload.status, message: payload.message || "" },
      ];
      flushPartsToMessage();
    }
  }, [throttledSetThought, startThoughtTimer, stopThoughtTimer, flushPartsToMessage]);

  const handleAgentError = useCallback((payload: any) => {
    flushPartsToMessage();
    streamingPartsRef.current = [
      ...streamingPartsRef.current,
      { type: "agent_status" as const, status: "error", message: payload.message || "Unknown error" },
    ];
    flushPartsToMessage();
    setIsLoading(false);
    isLoadingRef.current = false;
    stopThoughtTimer();
    throttledSetThought(null as any);
  }, [flushPartsToMessage, stopThoughtTimer, throttledSetThought]);

  const handleFinish = useCallback(() => {
    turnFinishedRef.current = true;
    runningRef.current = false;
    setIsLoading(false);
    isLoadingRef.current = false;
    setSessionState("ready");
    activeAssistantIdRef.current = null;
    stopThoughtTimer();
    throttledSetThought(null as any);
    flushPartsToMessage();
  }, [stopThoughtTimer, throttledSetThought, flushPartsToMessage]);

  // ── Send Message ──────────────────────────────────────────
  const sendMessage = useCallback(
    async (
      text: string,
      conversationId: string | null,
      model: string,
      attachments: AttachedFile[] | null,
      callbacks?: UseAgentSessionCallbacks
    ) => {
      if (!text.trim() || isLoadingRef.current || !user) return;

      setIsLoading(true);
      isLoadingRef.current = true;
      streamingPartsRef.current = [];
      textAccumRef.current = "";
      turnFinishedRef.current = false;
      hasContentInTurnRef.current = false;

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connect();
      }

      if (!sessionIdRef.current) {
        wsRef.current?.send(JSON.stringify({
          type: "session_start",
          payload: { model, conversationId, mode },
        }));
        await new Promise((r) => setTimeout(r, 500));
      }

      // Optimistic messages with O(1) index
      const userMsgId = nextId++;
      const assistantMsgId = `temp-assistant-${nextId++}`;
      activeAssistantIdRef.current = assistantMsgId;
      activeMsgIdRef.current = assistantMsgId;

      updateMessages((prev, index) => {
        const userMsg: Message = {
          id: userMsgId, role: "User", content: text,
          createdAt: new Date().toISOString(),
        };
        const assistantMsg: Message = {
          id: assistantMsgId, role: "Assistant", content: "",
          createdAt: new Date().toISOString(),
          sources: [], followUps: [], generatedFiles: [],
        };
        return composeMessageWithIndex(
          assistantMsg,
          composeMessageWithIndex(userMsg, prev, index),
          index
        );
      });

      wsRef.current?.send(JSON.stringify({
        type: "user_message",
        payload: {
          text,
          attachments: attachments?.map((a) => ({ name: a.name, content: a.content, type: a.type })) || [],
        },
      }));

      // Poll for parts updates — AionUi pattern: cancelled flag guard
      const pollInterval = setInterval(() => {
        if (cancelledRef.current) { clearInterval(pollInterval); return; }
        flushPartsToMessage();
      }, 100);

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (cancelledRef.current || !isLoadingRef.current) {
            clearInterval(check);
            clearInterval(pollInterval);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(check);
          clearInterval(pollInterval);
          isLoadingRef.current = false;
          setIsLoading(false);
          resolve();
        }, 60000);
      });

      const id = activeAssistantIdRef.current;
      if (id) {
        updateMessages((prev, index) => {
          const idx = index.msgIdIndex.get(id) ?? index.tempIdIndex.get(id);
          if (idx === undefined || idx >= prev.length) return prev;
          const existing = prev[idx];
          if (!existing) return prev;
          const finalParts = streamingPartsRef.current;
          const next = prev.slice();
          next[idx] = { ...existing, parts: finalParts, content: textAccumRef.current };
          return next;
        });
      }

      callbacks?.onComplete?.();
    },
    [user, connect, mode, updateMessages, flushPartsToMessage]
  );

  // ── Permission Response ───────────────────────────────────
  const respondPermission = useCallback((id: string, approved: boolean) => {
    wsRef.current?.send(JSON.stringify({
      type: "permission_response",
      payload: { permissionId: id, approved },
    }));

    if (approved) {
      // Find the permission part to auto-approve future similar requests
      streamingPartsRef.current.forEach((p) => {
        if (p.type === "permission") {
          approvalStoreRef.current.approve(approvalKeyForTool(p.toolName));
        }
      });
      // Update UI
      const updatedParts = streamingPartsRef.current.map((p) =>
        p.type === "permission" && p.id === id
          ? { ...p, status: approved ? ("approved" as const) : ("denied" as const) }
          : p
      );
      streamingPartsRef.current = updatedParts;
      flushPartsToMessage();
      if (approved) setSessionState("processing");
    }
  }, [flushPartsToMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    indexRef.current = createMessageIndex([]);
    streamingPartsRef.current = [];
    textAccumRef.current = "";
    turnFinishedRef.current = false;
    hasContentInTurnRef.current = false;
    activeAssistantIdRef.current = null;
    stopThoughtTimer();
    throttledSetThought(null as any);
  }, [stopThoughtTimer, throttledSetThought]);

  // ── Cleanup ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disconnect();
      stopThoughtTimer();
    };
  }, [disconnect, stopThoughtTimer]);

  return {
    messages,
    setMessages,
    isLoading,
    sessionState,
    capabilities,
    mode,
    setMode,
    thought,
    approvalStore: approvalStoreRef.current,
    sendMessage,
    respondPermission,
    clearMessages,
    connect,
    disconnect,
    runningRef,
  };
}

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}
