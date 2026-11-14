/**
 * WS-vs-SSE transport auto-detection.
 *
 * Flux can talk to the backend over a WebSocket agent session (plan/yolo
 * modes, team mode, live status) or over Server-Sent Events (the classic
 * chat pipeline).
 *
 * We always try the WebSocket first: on mount we connect it and wait up to
 * 5 seconds for it to reach `ready`/`processing`. The flip to `"ws"` is
 * applied ONLY while no stream is in flight (`isLoading`), because changing
 * the live transport of a message halfway through its stream strands the
 * in-flight SSE events (they land in the SSE store while the UI reads the
 * WS store).
 *
 * The detection runs on mount; callers re-evaluate on every render for the
 * same reason.
 *
 * Usage:
 *   const { activeTransport, setActiveTransport, wsAvailableRef } =
 *     useTransportAutoDetect(ws, isStreaming);
 */
import { useEffect, useRef, useState } from "react";
import type { useAgentSession } from "./useAgentSession";

export type ActiveTransport = "sse" | "ws";
/** The WebSocket agent session as returned by `useAgentSession`. */
export type AgentSession = ReturnType<typeof useAgentSession>;

/** How long to wait for the WS handshake before falling back to SSE. */
const WS_READY_TIMEOUT_MS = 5_000;
/** Poll cadence while waiting for `ready`/`processing`. */
const WS_READY_POLL_MS = 200;

export function useTransportAutoDetect(ws: AgentSession, isStreaming: boolean) {
  const [activeTransport, setActiveTransport] = useState<ActiveTransport>("sse");
  const wsAvailableRef = useRef(false);
  // Live view of the ws object — the previous version captured the first
  // render's object, so its sessionState never updated and WS never
  // flipped.
  const wsRef = useRef(ws);
  wsRef.current = ws;

  useEffect(() => {
    let cancelled = false;
    const tryWs = async () => {
      const instance = wsRef.current;
      try {
        instance.connect();
        // Wait up to WS_READY_TIMEOUT_MS for the session to reach "ready"
        await new Promise<void>((resolve, reject) => {
          const check = setInterval(() => {
            if (cancelled) { clearInterval(check); reject(new Error("cancelled")); return; }
            const s = wsRef.current.sessionState;
            if (s === "ready" || s === "processing") {
              clearInterval(check);
              wsAvailableRef.current = true;
              if (!cancelled) setActiveTransport("ws");
              resolve();
            }
          }, WS_READY_POLL_MS);
          setTimeout(() => { clearInterval(check); reject(new Error("timeout")); }, WS_READY_TIMEOUT_MS);
        });
      } catch {
        wsAvailableRef.current = false;
        setActiveTransport("sse");
      }
    };
    tryWs();
    return () => { cancelled = true; };
    // Detection runs once on mount; re-detecting on every ws object change
    // would flip transports mid-conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flip to WS the moment a stream ends and WS is ready, but never during
  // one. Flipping mid-stream orphans the SSE events in the SSE store while
  // the UI reads the WS store (the "answer renders out of nowhere" /
  // duplicated-message bug).
  useEffect(() => {
    if (isStreaming) return;
    if (activeTransport === "ws") return;
    const s = wsRef.current.sessionState;
    if (s === "ready" || s === "processing") {
      wsAvailableRef.current = true;
      setActiveTransport("ws");
    }
  }, [isStreaming, activeTransport]);

  return { activeTransport, setActiveTransport, wsAvailableRef };
}
