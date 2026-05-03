// src/hooks/useCanvas.ts
import { useState, useCallback, useMemo, useRef } from "react";
import type { Message } from "@/types";

export interface CanvasState {
  isActive: boolean;
  canvasCode: string;
  sourceMessageId: string | null;
}

const DEFAULT_HTML = "<html>\n<head>\n  <meta charset=\"UTF-8\">\n</head>\n<body>\n  <h1>Hello, Flux Canvas!</h1>\n</body>\n</html>";

export function useCanvas(messages: Message[]) {
  const [state, setState] = useState<CanvasState>({
    isActive: false,
    canvasCode: DEFAULT_HTML,
    sourceMessageId: null,
  });

  // Keep latest messages in a ref so we can read it without making openCanvas depend on it
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Extract latest HTML code block from assistant messages (used only as a helper)
  const getLatestHtmlCode = useCallback((): string | null => {
    const reversed = [...messagesRef.current].reverse();
    for (const msg of reversed) {
      if (msg.role === "Assistant") {
        const content = (msg as any).answer ?? msg.content;
        const match = content.match(/```html\n([\s\S]*?)```/);
        if (match) return match[1];
      }
    }
    return null;
  }, []); // no dependency → stable across renders

  // openCanvas uses the ref to get latest HTML code without re-creating itself
  const openCanvas = useCallback(
    (code?: string) => {
      const codeToUse = code || getLatestHtmlCode() || DEFAULT_HTML;
      setState({
        isActive: true,
        canvasCode: codeToUse,
        sourceMessageId: null,
      });
    },
    [getLatestHtmlCode] // getLatestHtmlCode is stable (no dependencies)
  );

  const closeCanvas = useCallback(() => {
    setState((prev) => ({ ...prev, isActive: false }));
  }, []);

  const setCanvasCode = useCallback((newCode: string) => {
    setState((prev) => ({ ...prev, canvasCode: newCode }));
  }, []);

  const setSourceMessageId = useCallback((id: string) => {
    setState((prev) => ({ ...prev, sourceMessageId: id }));
  }, []);

  const reopenFromMessage = useCallback(
    (message: Message) => {
      const content = (message as any).canvasCode ?? "";
      setState({
        isActive: true,
        canvasCode: content || DEFAULT_HTML,
        sourceMessageId: message.id,
      });
    },
    []
  );

  // Wrap returned object in useMemo → stable reference across renders (only changes when state changes)
  return useMemo(() => ({
    isActive: state.isActive,
    canvasCode: state.canvasCode,
    sourceMessageId: state.sourceMessageId,
    openCanvas,
    closeCanvas,
    setCanvasCode,
    setSourceMessageId,
    reopenFromMessage,
    getLatestHtmlCode, // still available if needed elsewhere
  }), [
    state.isActive,
    state.canvasCode,
    state.sourceMessageId,
    openCanvas,
    closeCanvas,
    setCanvasCode,
    setSourceMessageId,
    reopenFromMessage,
    getLatestHtmlCode,
  ]);
}