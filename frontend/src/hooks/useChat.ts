// src/hooks/useChat.ts
import { useState, useRef, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";
import { extractLiveContent } from "@/lib/chat-utils";
import type { Message, AttachedFile, Source, GeneratedFile, MessagePart } from "@/types";

const supabase = createClient();

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

type UseChatCallbacks = {
  onNewConversationId?: (id: string) => void;
  onStreamUpdate?: (parsed: { content: string; sources: Source[] }) => void;
  onComplete?: () => void;
  onMessageId?: (id: string) => void;
  fileContent?: string;
  attachedFiles?: { name: string; content?: string }[];
};

let nextId = 1;

export function useChat(user: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeGenerationStatus, setActiveGenerationStatus] = useState<{
    subtype: string;
    message: string;
  } | null>(null);
  const isLoadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{
    prompt: string;
    activeConversationId: string | null;
    selectedModel: string;
    attachedFiles: AttachedFile[] | null;
    fileContent: string;
  } | null>(null);
  const realMessageIdRef = useRef<string | null>(null);
  const lastCallbacksRef = useRef<UseChatCallbacks | undefined>(undefined);
  const streamErrorRef = useRef<string | null>(null);

  const latestFollowUpsRef = useRef<string[]>([]);
  const latestGeneratedFilesRef = useRef<GeneratedFile[]>([]);

  // ── Track the assistant raw buffer ──
  const assistantRawRef = useRef<string>("");   // full text — for backward compat `content` field
  const streamingPartsRef = useRef<MessagePart[]>([]); // finalized parts (non-text + flushed text segments)
  const textAccumRef = useRef<string>("");      // current in-progress text segment

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const resetMessages = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
    isLoadingRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    lastRequestRef.current = null;
    realMessageIdRef.current = null;
    lastCallbacksRef.current = undefined;
    latestFollowUpsRef.current = [];
    latestGeneratedFilesRef.current = [];
    setActiveGenerationStatus(null);
    assistantRawRef.current = "";
    streamingPartsRef.current = [];
    textAccumRef.current = "";
  }, []);

  // ── Clean thought tags ──
  function cleanThoughtText(raw: string): string {
    const closeIdx = raw.indexOf("</THOUGHT>");
    if (closeIdx === -1) return "";
    const openIdx = raw.indexOf("<THOUGHT>");
    if (openIdx === -1) return "";
    return raw.slice(openIdx + 9, closeIdx).trim();
  }

  // ── Clean answer tags ──
  // The backend strips <ANSWER>...</ANSWER> before SSE-sending chunks, so
  // assistantRawRef contains plain answer text.  We still handle the rare
  // case where the tags leak through (e.g. model puts them in mid-stream).
  function cleanAnswerText(raw: string): string {
    if (!raw.trim()) return "";

    // Case A: both tags present — extract the content between them
    const openIdx = raw.indexOf("<ANSWER>");
    const closeIdx = raw.indexOf("</ANSWER>");
    if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
      return raw.slice(openIdx + 8, closeIdx).trim();
    }
    // Case B: opening tag present but not yet closed (mid-stream) — show what arrived
    if (openIdx !== -1) {
      return raw.slice(openIdx + 8).trim();
    }

    // Case C (normal): backend already stripped the tags — return raw content
    // but defensively strip any residual structural tags that might have leaked.
    return raw
      .replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, "")
      .replace(/<\/?THOUGHT>/gi, "")
      .replace(/<\/?ANSWER>/gi, "")
      .replace(/<\/?FOLLOW_UPS>/gi, "")
      .replace(/<\/?question>/gi, "")
      .trim();
  }

  // ── Flush current textAccum segment into streamingPartsRef ──
  function flushPendingText() {
    const clean = cleanAnswerText(textAccumRef.current);
    if (clean) {
      streamingPartsRef.current = [...streamingPartsRef.current, { type: "text", text: clean }];
    }
    textAccumRef.current = "";
  }

  const handleSubmit = useCallback(
    async (
      prompt: string,
      activeConversationId: string | null,
      selectedModel: string,
      attachedFiles: AttachedFile[] | null,
      callbacks?: UseChatCallbacks
    ) => {
      if (!prompt.trim() || isLoadingRef.current || !user) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      isLoadingRef.current = true;
      streamingPartsRef.current = [];
      textAccumRef.current = "";
      setActiveGenerationStatus(null);
      realMessageIdRef.current = null;
      latestFollowUpsRef.current = [];
      latestGeneratedFilesRef.current = [];
      streamErrorRef.current = null;
      assistantRawRef.current = "";

      lastRequestRef.current = {
        prompt,
        activeConversationId,
        selectedModel,
        attachedFiles,
        fileContent: callbacks?.fileContent ?? "",
      };
      lastCallbacksRef.current = callbacks;

      const token = await getAccessToken();

      const body: any = {
        query: prompt,
        model: selectedModel,
        fileContent: callbacks?.fileContent ?? "",
        attachedFiles: attachedFiles && attachedFiles.length > 0
          ? attachedFiles.map((f) => ({ name: f.name, content: f.content, type: f.type }))
          : undefined,
        conversationId: activeConversationId ?? undefined,
      };

      const endpoint = `${BACKEND_URL}/flux_ask`;

      const userMsgId = nextId++;
      const optimisticUser: Message = {
        id: userMsgId,
        role: "User",
        content: attachedFiles && attachedFiles.length > 0
          ? `${prompt}\n\n${attachedFiles.map((f) => `[attached: ${f.name}]`).join("\n")}`
          : prompt,
        createdAt: new Date().toISOString(),
        fileAttachment: attachedFiles
          ? attachedFiles.map((f) => ({ name: f.name, content: f.content }))
          : [],
      };

      const assistantMsgId = `temp-assistant-${nextId++}`;
      const optimisticAssistant: Message = {
        id: assistantMsgId,
        role: "Assistant",
        content: "",
        createdAt: new Date().toISOString(),
        sources: [],
        followUps: [],
        generatedFiles: [],
      };

      setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);

      let finalAssistantId: string | null = null;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("Request failed");

        const incomingConversationId = response.headers.get("X-Conversation-Id");
        if (incomingConversationId && callbacks?.onNewConversationId) {
          callbacks.onNewConversationId(incomingConversationId);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let latestSources: Source[] = [];
        let hasReceivedFinalAnswer = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const idx = buffer.indexOf("\n\n");
            if (idx === -1) break;
            const eventStr = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (!eventStr.trim()) continue;

            const lines = eventStr.split("\n");
            let eventType = "";
            const dataLines: string[] = [];

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataLines.push(line.slice(6));
              }
            }

            const data = dataLines.join("\n");
            if (!data) continue;

            // ─── SERVER ERROR ───────────────────────────
            if (eventType === "error") {
              let errorMessage = "Server error";
              try {
                const parsed = JSON.parse(data);
                errorMessage = parsed.message || "Server error";
              } catch { }
              streamErrorRef.current = errorMessage;
              await reader.cancel();
              break;
            }

            // ─── SOURCES ───────────────────────────────
            if (eventType === "sources") {
              try { latestSources = JSON.parse(data) as Source[]; } catch { }
            }
            // ─── FOLLOW_UPS ────────────────────────────
            else if (eventType === "follow_ups") {
              try { latestFollowUpsRef.current = JSON.parse(data) as string[]; } catch { }
            }
            // ─── STATUS ─────────────────────────────────
            else if (eventType === "status") {
              try {
                const parsed = JSON.parse(data);
                // Flush any pending text segment before adding the tool_call part
                flushPendingText();
                const statusPart: MessagePart = {
                  type: "tool_call",
                  name: parsed.subtype,
                  input: parsed.data,
                  output: parsed.message,
                  status: "running",
                };
                streamingPartsRef.current = [...streamingPartsRef.current, statusPart];
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                setMessages((prev) =>
                  prev.map((m) =>
                    String(m.id) === String(targetId) || String(m.id) === String(assistantMsgId) || String(m.id) === "-1"
                      ? { ...m, parts: [...streamingPartsRef.current] }
                      : m
                  )
                );
                if (
                  parsed.subtype === 'generating_file' ||
                  parsed.subtype === 'generating_chart' ||
                  parsed.subtype === 'image_enhancing' ||
                  parsed.subtype === 'image_generating'
                ) {
                  setActiveGenerationStatus({ subtype: parsed.subtype, message: parsed.message });
                }
              } catch { }
            }
            // ─── THOUGHT ───────────────────────────────
            else if (eventType === "thought") {
              try {
                const parsed = JSON.parse(data);
                const cleanContent = cleanThoughtText(parsed.content || "");
                if (cleanContent) {
                  // Flush any pending text segment before adding the thought part
                  flushPendingText();
                  const thoughtPart: MessagePart = {
                    type: "thought",
                    content: cleanContent,
                  };
                  streamingPartsRef.current = [...streamingPartsRef.current, thoughtPart];
                  const targetId = realMessageIdRef.current ?? assistantMsgId;
                  setMessages((prev) =>
                    prev.map((m) =>
                      String(m.id) === String(targetId) || String(m.id) === String(assistantMsgId) || String(m.id) === "-1"
                        ? { ...m, parts: [...streamingPartsRef.current] }
                        : m
                    )
                  );
                }
              } catch { }
            }
            // ─── FILE ──────────────────────────────────
            else if (eventType === "file") {
              try {
                const parsed = JSON.parse(data) as GeneratedFile;
                const alreadyExists = latestGeneratedFilesRef.current.some(
                  (f) => f.filename === parsed.filename
                );
                if (!alreadyExists) {
                  latestGeneratedFilesRef.current.push(parsed);
                }
                // Flush any pending text segment before adding the file part
                flushPendingText();
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                const filePart: MessagePart = parsed.mime?.startsWith("image/")
                  ? { type: "image", url: parsed.base64 || "", filename: parsed.filename, mime: parsed.mime }
                  : { type: "file", filename: parsed.filename, mime: parsed.mime, base64: parsed.base64 };
                streamingPartsRef.current = [...streamingPartsRef.current, filePart];
                setMessages((prev) =>
                  prev.map((m) =>
                    String(m.id) === String(targetId) || String(m.id) === String(assistantMsgId) || String(m.id) === "-1"
                      ? {
                        ...m,
                        generatedFiles: [...latestGeneratedFilesRef.current],
                        parts: [...streamingPartsRef.current],
                      }
                      : m
                  )
                );
                // Clear inline generation indicator once file arrives
                setActiveGenerationStatus(null);
              } catch (e) {
                console.error("Failed to parse file event:", e);
              }
            }
            // ─── MESSAGE_ID ────────────────────────────
            else if (eventType === "message_id") {
              try {
                const parsed = JSON.parse(data);
                realMessageIdRef.current = parsed.id;
                finalAssistantId = parsed.id;
                callbacks?.onMessageId?.(parsed.id);
              } catch { }
            }
            // ─── TODOS ─────────────────────────────────
            else if (eventType === "todos") {
              try {
                const parsed = JSON.parse(data);
                if (parsed?.items) {
                  flushPendingText();
                  const existingIdx = streamingPartsRef.current.findIndex(p => p.type === "todos");
                  const todosPart: MessagePart = { type: "todos", items: parsed.items };
                  if (existingIdx >= 0) {
                    streamingPartsRef.current = [
                      ...streamingPartsRef.current.slice(0, existingIdx),
                      todosPart,
                      ...streamingPartsRef.current.slice(existingIdx + 1),
                    ];
                  } else {
                    streamingPartsRef.current = [...streamingPartsRef.current, todosPart];
                  }
                  const targetId = realMessageIdRef.current ?? assistantMsgId;
                  setMessages((prev) =>
                    prev.map((m) =>
                      String(m.id) === String(targetId) || String(m.id) === String(assistantMsgId) || String(m.id) === "-1"
                        ? { ...m, parts: [...streamingPartsRef.current] }
                        : m
                    )
                  );
                }
              } catch { }
            }
            // ─── TEXT ANSWER (default) ─────────────────
            else {
              if (data === "[DONE]") continue;
              assistantRawRef.current += data;
              textAccumRef.current += data;
            }

            // ─── Update assistant message with partial answer ──
            try {
              const cleanAns = cleanAnswerText(assistantRawRef.current);
              const cleanCurrentText = cleanAnswerText(textAccumRef.current);
              // Build parts: finalized parts + current text segment (if any)
              const allParts: MessagePart[] = cleanCurrentText
                ? [...streamingPartsRef.current, { type: "text", text: cleanCurrentText }]
                : streamingPartsRef.current;
              const hasEffectiveContent = cleanAns || streamingPartsRef.current.length > 0;
              if (hasEffectiveContent) {
                hasReceivedFinalAnswer = true;
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                setMessages((prev) =>
                  prev.map((m) =>
                    String(m.id) === String(targetId) || String(m.id) === String(assistantMsgId) || String(m.id) === "-1"
                      ? {
                        ...m,
                        id: realMessageIdRef.current ?? m.id,
                        content: cleanAns,
                        sources: latestSources.length > 0 ? latestSources : m.sources,
                        followUps: latestFollowUpsRef.current,
                        generatedFiles: latestGeneratedFilesRef.current.length > 0
                          ? [...latestGeneratedFilesRef.current]
                          : m.generatedFiles,
                        parts: allParts,
                      }
                      : m
                  )
                );
              }
            } catch (innerErr) {
              console.error("Stream update error:", innerErr);
            }
          }
        }

        // ─── If the server sent an error event, surface it ──────────────────
        if (streamErrorRef.current) {
          throw new Error(streamErrorRef.current);
        }

        // ─── Final cleanup ──────────────────────────────
        const finalAnswer = cleanAnswerText(assistantRawRef.current);
        const hasGeneratedFiles = latestGeneratedFilesRef.current.length > 0;
        const hasImageFiles = latestGeneratedFilesRef.current.some(f => f.mime?.startsWith("image/"));

        // ✅ If we have generated files, don't show an error even if answer is empty
        if ((!finalAnswer || finalAnswer.startsWith("[Error")) && !hasGeneratedFiles) {
          setMessages((prev) => {
            const withoutLast = prev.slice(0, -1);
            return [
              ...withoutLast,
              {
                id: nextId++,
                role: "Assistant",
                content: "",
                createdAt: new Date().toISOString(),
                error: true,
                errorMessage: "Message failed. Please try again.",
              } as Message,
            ];
          });
        }

      } catch (error: any) {
        if (error.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) => (String(m.id) === String(assistantMsgId) || String(m.id) === "-1" ? { ...m, id: nextId++ } : m))
          );
        } else {
          console.error("Send failed:", error);
          const errMsg = error?.message && !error.message.includes("fetch")
            ? error.message
            : "Message failed. Please try again.";
          setMessages((prev) => [
            ...prev.filter((m) => String(m.id) !== String(assistantMsgId) && String(m.id) !== "-1" && String(m.id) !== String(realMessageIdRef.current)),
            {
              id: nextId++,
              role: "Assistant",
              content: "",
              createdAt: new Date().toISOString(),
              error: true,
              errorMessage: errMsg,
            } as Message,
          ]);
        }
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
        abortControllerRef.current = null;
        setActiveGenerationStatus(null);
        callbacks?.onComplete?.();
      }
    },
    [user]
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last || isLoading) return;

    setMessages((prev) => prev.filter((m) => !m.error));

    const originalCallbacks = lastCallbacksRef.current;
    const callbacksForRetry: UseChatCallbacks = {
      ...(originalCallbacks || {}),
      fileContent: last.fileContent,
    };

    handleSubmit(
      last.prompt,
      last.activeConversationId,
      last.selectedModel,
      last.attachedFiles,
      callbacksForRetry
    );
  }, [isLoading, handleSubmit]);

  return {
    messages,
    setMessages,
    isLoading,
    handleSubmit,
    resetMessages,
    retry,
    stop,
    activeGenerationStatus,
  };
}