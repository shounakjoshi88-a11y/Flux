/**
 * WS-vs-SSE transport auto-detection.
 *
 * Flux can talk to the backend over a WebSocket agent session (plan/yolo
 * modes, team mode, live status) or over Server-Sent Events (the classic
 * chat pipeline). We always try the WebSocket first: after mounting we
 * connect it and wait up to 5 seconds to reach `ready`/`processing`. If
 * that succeeds the UI pins `"ws"`; if it throws or times out we fall back
 * to `"sse"` and stay there for this session.
 *
 * The detection runs once on mount. `wsAvailableRef` is exposed because the
 * send path must distinguish "WS was detected but the transport flipped"
 * (not currently possible without a re-mount) from "this is an SSE-only
 * session".
 *
 * Extracted from `pages/Dashboard.tsx`.
 *
 * Usage:
 *   const { activeTransport, setActiveTransport, wsAvailableRef } =
 *     useTransportAutoDetect(ws);
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

export function useTransportAutoDetect(ws: AgentSession) {
  const [activeTransport, setActiveTransport] = useState<ActiveTransport>("sse");
  const wsAvailableRef = useRef(false);
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
            if (instance.sessionState === "ready" || instance.sessionState === "processing") {
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

  return { activeTransport, setActiveTransport, wsAvailableRef };
}
