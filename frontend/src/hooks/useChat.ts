import { useState, useRef, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";
import { extractLiveContent, deepCleanAnswer } from "@/lib/chat-utils";
import type { Message, AttachedFile, Source, GeneratedFile, MessagePart, PermissionRequest } from "@/types";
import { queueMessage, getQueuedMessages, removeQueuedMessage, getQueueLength } from "@/lib/offline-queue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

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
  onPermissionRequest?: (request: PermissionRequest) => void;
  onWikiUpdate?: (update: any) => void;
  onOfflineQueueFlushed?: () => void;
  fileContent?: string;
  attachedFiles?: { name: string; content?: string }[];
  replaceLastAssistant?: boolean;
  /** When set, truncate all messages after the message with this ID,
   *  replace its content with the incoming prompt, and append a new
   *  optimistic assistant.  Used for "edit + resend". */
  editMessageId?: string | number;
};

let nextId = 1;

export function useChat(user: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeGenerationStatus, setActiveGenerationStatus] = useState<{
    subtype: string;
    message: string;
  } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
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
  const onQueueFlushedRef = useRef<(() => void) | null>(null);
  const streamErrorRef = useRef<string | null>(null);
  const isOnline = useOnlineStatus();
  const prevOnlineRef = useRef(isOnline);
  const queueFlushInProgressRef = useRef(false);

  const latestFollowUpsRef = useRef<string[]>([]);
  const latestGeneratedFilesRef = useRef<GeneratedFile[]>([]);

  const assistantRawRef = useRef<string>("");
  const streamingPartsRef = useRef<MessagePart[]>([]);
  const textAccumRef = useRef<string>("");

  // AionUi pattern: cancelled flag for async hydration safety
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    getQueueLength().then(setPendingCount).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOnline && prevOnlineRef.current) {
      prevOnlineRef.current = false;
    } else if (isOnline && !prevOnlineRef.current) {
      prevOnlineRef.current = true;
      flushQueue().catch(() => {});
    } else if (isOnline) {
      prevOnlineRef.current = true;
    }
  }, [isOnline]);

  const flushQueue = useCallback(async () => {
    if (queueFlushInProgressRef.current) return;
    queueFlushInProgressRef.current = true;
    try {
      const queued = await getQueuedMessages();
      for (const entry of queued) {
        if (cancelledRef.current) break;
        try {
          const body: any = {
            query: entry.content,
            model: entry.model,
            conversationId: entry.conversationId ?? undefined,
            fileContent: entry.fileContent ?? undefined,
            attachedFiles: entry.files.length > 0 ? entry.files : undefined,
          };

          const token = await getAccessToken();
          const response = await fetch(`${BACKEND_URL}/flux_ask`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            const incomingConvId = response.headers.get("X-Conversation-Id");
            if (incomingConvId && !entry.conversationId) {
              setMessages((prev) => prev.map((m) =>
                m.id === `pending-${entry.id}` ? { ...m, content: "✅ Message sent!", pending: false } : m
              ));
            }
            if (!entry.conversationId && incomingConvId) {
              const lastReq = lastRequestRef.current;
              lastRequestRef.current = lastReq
                ? { ...lastReq, activeConversationId: incomingConvId }
                : { prompt: entry.content, activeConversationId: incomingConvId, selectedModel: entry.model, attachedFiles: entry.files.length > 0 ? entry.files.map(f => ({ name: f.name, content: f.content, type: f.type })) : null, fileContent: '' };
            }
            await removeQueuedMessage(entry.id);
            setPendingCount((p) => Math.max(0, p - 1));
          }
        } catch {
          setMessages((prev) => prev.map((m) =>
            m.id === `pending-${entry.id}` ? { ...m, content: "❌ Send failed — will retry.", pending: false } : m
          ));
        }
      }
    } finally {
      queueFlushInProgressRef.current = false;
      onQueueFlushedRef.current?.();
    }
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
    onQueueFlushedRef.current = null;
    latestFollowUpsRef.current = [];
    latestGeneratedFilesRef.current = [];
    setActiveGenerationStatus(null);
    assistantRawRef.current = "";
    streamingPartsRef.current = [];
    textAccumRef.current = "";
  }, []);

  function cleanThoughtText(raw: string): string {
    // Handle both <THOUGHT> and <think> tags
    const closeIdx = Math.max(raw.indexOf("</THOUGHT>"), raw.indexOf("</think>"));
    if (closeIdx === -1) return "";
    const openThought = raw.lastIndexOf("<THOUGHT>", closeIdx);
    const openThink = raw.lastIndexOf("<think>", closeIdx);
    const openIdx = Math.max(openThought, openThink);
    if (openIdx === -1) return "";
    const openTagLen = openIdx === openThought ? 9 : 7; // "<THOUGHT>".length=9, "<think>".length=7
    return raw.slice(openIdx + openTagLen, closeIdx).trim();
  }

  function stripTags(s: string): string {
    return s
      .replace(/<FOLLOW_UPS>[\s\S]*?(?:<\/FOLLOW_UPS>|$)/gi, "")
      .replace(/<FOLLOW_UPS[\s\S]*/gi, "")
      .replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, "")
      .replace(/<\/?THOUGHT>/gi, "")
      .replace(/<\/?ANSWER>/gi, "")
      .replace(/<\/?question>/gi, "")
      .replace(/<\/?SEARCH_QUERY>/gi, "")
      // Strip any truncated/incomplete tag left at the end (e.g. "<F", "<FOLLOW_UPS")
      .replace(/<\/?[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?$/g, "")
      .trim();
  }

  function cleanAnswerText(raw: string): string {
    if (!raw.trim()) return "";
    const openIdx = raw.indexOf("<ANSWER>");
    const closeIdx = raw.indexOf("</ANSWER>");
    const followIdx = raw.indexOf("<FOLLOW_UPS>");
    
    let endIdx = closeIdx;
    if (openIdx !== -1) {
      if (endIdx === -1 || (followIdx !== -1 && followIdx < endIdx)) {
        endIdx = followIdx;
      }
      if (endIdx !== -1 && endIdx > openIdx) {
        return stripTags(raw.slice(openIdx + 8, endIdx));
      }
      return stripTags(raw.slice(openIdx + 8));
    }
    return stripTags(raw);
  }

  function flushPendingText() {
    const clean = cleanAnswerText(textAccumRef.current);
    if (clean) {
      streamingPartsRef.current = [...streamingPartsRef.current, { type: "text", text: clean }];
    }
    textAccumRef.current = "";
  }

  const addPart = (part: MessagePart) => {
    streamingPartsRef.current = [...streamingPartsRef.current, part];
  };

  const updateMessages = (targetId: string, extra?: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) =>
        String(m.id) === String(targetId) || String(m.id) === String(realMessageIdRef.current ?? "")
          ? { ...m, parts: [...streamingPartsRef.current], ...extra }
          : m
      )
    );
  };

  const updateTaskPart = (taskId: string, updater: (part: any) => any) => {
    const idx = streamingPartsRef.current.findIndex(p => p.type === 'task_ref' && p.taskId === taskId);
    if (idx >= 0) {
      streamingPartsRef.current = [
        ...streamingPartsRef.current.slice(0, idx),
        updater(streamingPartsRef.current[idx]),
        ...streamingPartsRef.current.slice(idx + 1),
      ];
      const targetId = realMessageIdRef.current;
      if (targetId) updateMessages(targetId);
    }
  };

  const assistantMsgIdRef = useRef<string>("-1");

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
      assistantMsgIdRef.current = assistantMsgId;
      const optimisticAssistant: Message = {
        id: assistantMsgId,
        role: "Assistant",
        content: "",
        createdAt: new Date().toISOString(),
        sources: [],
        followUps: [],
        generatedFiles: [],
      };

      setMessages((prev) => {
        // ── Edit + resend: truncate at the edited message ──
        if (callbacks?.editMessageId != null) {
          const editId = String(callbacks.editMessageId);
          const idx = prev.findIndex((m) => String(m.id) === editId);
          if (idx >= 0) {
            const prefix = prev.slice(0, idx);
            return [
              ...prefix,
              { ...optimisticUser, id: prev[idx]!.id, content: prompt },
              optimisticAssistant,
            ];
          }
          // fallback: append normally
        }
        // ── Retry / rewrite: replace the last assistant ──
        if (callbacks?.replaceLastAssistant) {
          const replaced = [...prev];
          for (let i = replaced.length - 1; i >= 0; i--) {
            const m = replaced[i];
            if (m && m.role === "Assistant") {
              replaced[i] = optimisticAssistant;
              return replaced;
            }
          }
          return [...replaced, optimisticAssistant];
        }
        // ── Normal: append user + assistant ──
        return [...prev, optimisticUser, optimisticAssistant];
      });

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
          // Persist the real conversation ID into lastRequestRef so retry()
          // doesn't pass "" to the backend (which would create a new thread).
          lastRequestRef.current = {
            ...lastRequestRef.current,
            activeConversationId: incomingConversationId,
          };
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

            // ΓöÇΓöÇΓöÇ ERROR ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

            // ΓöÇΓöÇΓöÇ SOURCES ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            if (eventType === "sources") {
              try { latestSources = JSON.parse(data) as Source[]; } catch { }
            }
            // ΓöÇΓöÇΓöÇ FOLLOW_UPS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "follow_ups") {
              try { latestFollowUpsRef.current = JSON.parse(data) as string[]; } catch { }
            }
            // ΓöÇΓöÇΓöÇ STATUS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "status") {
              try {
                const parsed = JSON.parse(data);
                flushPendingText();
                const sub = parsed.subtype as string;
                const isTerminal = sub.endsWith('_success') || sub.endsWith('_error') || sub.endsWith('_complete') || sub.endsWith('_done');
                if (isTerminal) {
                  setActiveGenerationStatus(null);
                  const baseSub = sub.replace(/_(?:success|error|complete|done)$/, '');
                  let idx = streamingPartsRef.current.findIndex(
                    p => p.type === 'tool_call' && p.name === baseSub
                  );
                  // Handle _start naming pattern (sandbox_start → sandbox_success)
                  if (idx < 0) {
                    idx = streamingPartsRef.current.findIndex(
                      p => p.type === 'tool_call' && p.name === `${baseSub}_start`
                    );
                  }
                  if (idx >= 0) {
                    const updated = [...streamingPartsRef.current];
                    (updated[idx] as any).status = sub.endsWith('_error') ? 'error' : 'completed';
                    (updated[idx] as any).output = parsed.message;
                    (updated[idx] as any).input = parsed.data ?? (updated[idx] as any).input;
                    streamingPartsRef.current = updated;
                  } else {
                    if (baseSub !== 'sandbox') {
                      streamingPartsRef.current = [...streamingPartsRef.current, {
                        type: "tool_call",
                        name: baseSub,
                        input: parsed.data,
                        output: parsed.message,
                        status: sub.endsWith('_error') ? 'error' : 'completed',
                      }];
                    }
                  }
                } else {
                  if (sub !== 'sandbox_start') {
                    streamingPartsRef.current = [...streamingPartsRef.current, {
                      type: "tool_call",
                      name: sub,
                      input: parsed.data,
                      output: parsed.message,
                      status: "running",
                    }];
                  }
                }
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                updateMessages(targetId);
                if (
                  sub === 'generating_file' ||
                  sub === 'reading_file' ||
                  sub === 'generating_chart' ||
                  sub === 'image_enhancing' ||
                  sub === 'image_generating' ||
                  sub === 'reading_skill' ||
                  sub === 'sandbox_start' ||
                  sub === 'parsing'
                ) {
                  setActiveGenerationStatus({ subtype: sub, message: parsed.message });
                }
              } catch { }
            }
            // ΓöÇΓöÇΓöÇ THOUGHT ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "thought") {
              try {
                const parsed = JSON.parse(data);
                const cleanContent = cleanThoughtText(parsed.content || "");
                if (cleanContent) {
                  flushPendingText();
                  const thoughtPart: MessagePart = {
                    type: "thought",
                    content: cleanContent,
                  };
                  addPart(thoughtPart);
                  const targetId = realMessageIdRef.current ?? assistantMsgId;
                  updateMessages(targetId);
                }
              } catch { }
            }
            //             // ΓöÇΓöÇΓöÇ PERMISSION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "permission") {
              try {
                const parsed = JSON.parse(data);
                const permPart: MessagePart = {
                  type: "permission",
                  id: parsed.id,
                  toolName: parsed.toolName,
                  args: parsed.args,
                  description: parsed.description,
                  status: "pending",
                };
                addPart(permPart);
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                updateMessages(targetId);
                callbacks?.onPermissionRequest?.(parsed);
              } catch { }
            }
            // ΓöÇΓöÇΓöÇ TOOL_GROUP ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "tool_group") {
              try {
                const parsed = JSON.parse(data);
                flushPendingText();
                const toolGroupPart: MessagePart = {
                  type: "tool_group",
                  tools: parsed.tools || [],
                };
                addPart(toolGroupPart);
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                updateMessages(targetId);
              } catch { }
            }
            // ΓöÇΓöÇΓöÇ AGENT_STATUS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "agent_status") {
              try {
                const parsed = JSON.parse(data);
                flushPendingText();
                const statusPart: MessagePart = {
                  type: "agent_status",
                  status: parsed.status,
                  message: parsed.message,
                };
                addPart(statusPart);
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                updateMessages(targetId);
              } catch { }
            }
            // ΓöÇΓöÇΓöÇ TOOL_CALL ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "tool_call") {
              try {
                const parsed = JSON.parse(data);
                const toolCallPart: MessagePart = {
                  type: "tool_call",
                  name: parsed.toolName,
                  input: parsed.args,
                  output: parsed.result,
                  status: parsed.status || "running",
                };
                addPart(toolCallPart);
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                updateMessages(targetId);
              } catch { }
            }
            // ΓöÇΓöÇΓöÇ FILE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "file") {
              try {
                const parsed = JSON.parse(data) as GeneratedFile;
                const alreadyExists = latestGeneratedFilesRef.current.some(
                  (f) => f.filename === parsed.filename
                );
                if (!alreadyExists) {
                  latestGeneratedFilesRef.current.push(parsed);
                }
                flushPendingText();
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                const filePart: MessagePart = parsed.mime?.startsWith("image/")
                  ? { type: "image", url: parsed.base64 || "", filename: parsed.filename, mime: parsed.mime }
                  : { type: "file", filename: parsed.filename, mime: parsed.mime, base64: parsed.base64 };
                addPart(filePart);
                updateMessages(targetId, {
                  generatedFiles: [...latestGeneratedFilesRef.current],
                });
                setActiveGenerationStatus(null);
              } catch (e) {
                console.error("Failed to parse file event:", e);
              }
            }
            // ΓöÇΓöÇΓöÇ CODE_EXECUTION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "code_execution") {
              try {
                const parsed = JSON.parse(data);
                flushPendingText();
                const execPart: MessagePart = {
                  type: "code_execution",
                  block: {
                    code: parsed.code || "",
                    language: parsed.language || "python",
                    outputLines: [], isRunning: true, generatedFiles: [],
                  },
                };
                addPart(execPart);
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                updateMessages(targetId);
              } catch {}
            }
            // ΓöÇΓöÇΓöÇ CODE_OUTPUT ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "code_output") {
              try {
                const parsed = JSON.parse(data);
                const parts = streamingPartsRef.current;
                const lastIdx = parts.length - 1;
                const last = parts[lastIdx];
                if (last?.type === "code_execution") {
                  const updated = [...parts];
                  const block = { ...last.block };
                  block.outputLines = [...block.outputLines, { type: parsed.type || "stdout", content: parsed.content }];
                  updated[lastIdx] = { ...last, block };
                  streamingPartsRef.current = updated;
                  updateMessages(realMessageIdRef.current ?? assistantMsgId);
                }
              } catch {}
            }
            // ΓöÇΓöÇΓöÇ CODE_DONE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "code_done") {
              try {
                const parsed = JSON.parse(data);
                const parts = streamingPartsRef.current;
                const lastIdx = parts.length - 1;
                const last = parts[lastIdx];
                if (last?.type === "code_execution") {
                  const updated = [...parts];
                  const block = { ...last.block };
                  block.isRunning = false;
                  block.exitCode = parsed.exitCode;
                  block.duration = parsed.duration;
                  updated[lastIdx] = { ...last, block };
                  streamingPartsRef.current = updated;
                  updateMessages(realMessageIdRef.current ?? assistantMsgId);
                }
              } catch {}
            }
            // ΓöÇΓöÇΓöÇ FILE_GENERATED ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "file_generated") {
              try {
                const parsed = JSON.parse(data);
                const parts = streamingPartsRef.current;
                const lastIdx = parts.length - 1;
                const last = parts[lastIdx];
                if (last?.type === "code_execution") {
                  const updated = [...parts];
                  const block = { ...last.block };
                  block.generatedFiles = [...block.generatedFiles, { filename: parsed.filename, downloadUrl: parsed.downloadUrl }];
                  updated[lastIdx] = { ...last, block };
                  streamingPartsRef.current = updated;
                } else {
                  flushPendingText();
                  const filePart: MessagePart = parsed.mime?.startsWith("image/")
                    ? { type: "image", url: parsed.base64 || "", filename: parsed.filename, mime: parsed.mime }
                    : { type: "file", filename: parsed.filename, mime: parsed.mime, base64: parsed.base64 };
                  addPart(filePart);
                }
                updateMessages(realMessageIdRef.current ?? assistantMsgId)
              } catch {}
            }
            // ΓöÇΓöÇΓöÇ WIKI_UPDATE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "wiki_update") {
              try {
                const parsed = JSON.parse(data);
                callbacks?.onWikiUpdate?.(parsed);
              } catch {}
            }
            // ΓöÇΓöÇΓöÇ MESSAGE_ID ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            else if (eventType === "message_id") {
              try {
                const parsed = JSON.parse(data);
                realMessageIdRef.current = parsed.id;
                finalAssistantId = parsed.id;
                callbacks?.onMessageId?.(parsed.id);
              } catch { }
            }
            // ΓöÇΓöÇΓöÇ TODOS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
                    addPart(todosPart);
                  }
                  const targetId = realMessageIdRef.current ?? assistantMsgId;
                  updateMessages(targetId);
                }
              } catch { }
            }
            // ─── TASK EVENTS — long-running multi-turn task system ───
            else if (eventType === "task_created") {
              try {
                const parsed = JSON.parse(data);
                flushPendingText();
                const taskRef: MessagePart = { type: "task_ref", taskId: parsed.taskId, title: parsed.title, steps: parsed.existingSteps || [] };
                const existingIdx = streamingPartsRef.current.findIndex(p => p.type === "task_ref" && p.taskId === parsed.taskId);
                if (existingIdx >= 0) {
                  streamingPartsRef.current = [
                    ...streamingPartsRef.current.slice(0, existingIdx),
                    taskRef,
                    ...streamingPartsRef.current.slice(existingIdx + 1),
                  ];
                } else {
                  addPart(taskRef);
                }
                updateMessages(realMessageIdRef.current ?? assistantMsgId);
              } catch {}
            }
            else if (eventType === "task_step_started") {
              try {
                const parsed = JSON.parse(data);
                updateTaskPart(parsed.taskId, part => ({ ...part, currentStep: parsed.stepIndex, currentStepTitle: parsed.title }));
              } catch {}
            }
            else if (eventType === "task_step_completed") {
              try {
                const parsed = JSON.parse(data);
                updateTaskPart(parsed.taskId, part => {
                  const steps = [...part.steps];
                  const existing = steps.find(s => s.index === parsed.stepIndex);
                  if (existing) {
                    existing.status = "done";
                    existing.result = parsed.result;
                  } else {
                    steps.push({ index: parsed.stepIndex, title: parsed.title || '', status: "done" as const, result: parsed.result });
                  }
                  return { ...part, steps };
                });
              } catch {}
            }
            else if (eventType === "task_step_failed") {
              try {
                const parsed = JSON.parse(data);
                updateTaskPart(parsed.taskId, part => {
                  const steps = [...part.steps];
                  const existing = steps.find(s => s.index === parsed.stepIndex);
                  if (existing) existing.status = "failed";
                  else steps.push({ index: parsed.stepIndex, title: '', status: "failed" as const });
                  return { ...part, steps };
                });
              } catch {}
            }
            else if (eventType === "task_completed" || eventType === "task_failed" || eventType === "task_cancelled" || eventType === "task_timed_out") {
              try {
                const parsed = JSON.parse(data);
                updateTaskPart(parsed.taskId, part => ({ ...part, status: eventType.replace('task_', ''), summary: parsed.summary || parsed.reason }));
              } catch {}
            }
            else if (eventType === "task_step_progress") {
              // Progress events update existing tool call display inside the task card
            }
            // ─── REPLACE_TEXT — synthesis is replacing a partial stream ───
            else if (eventType === "replace_text") {
              // Backend fired synthesis after a partial answer was already streamed.
              // Discard the partial text so synthesis renders as a clean replacement.
              assistantRawRef.current = "";
              textAccumRef.current = "";
              streamingPartsRef.current = streamingPartsRef.current.filter(p => p.type !== "text");
            }
            // ─── TEXT ANSWER (default) ───────────────
            else {
              if (data === "[DONE]") continue;
              assistantRawRef.current += data;
              textAccumRef.current += data;
            }

            // ─── Update assistant message ───
            try {
              const cleanAns = deepCleanAnswer(cleanAnswerText(assistantRawRef.current));
              const cleanCurrentText = deepCleanAnswer(cleanAnswerText(textAccumRef.current));
              const allParts: MessagePart[] = cleanCurrentText
                ? [...streamingPartsRef.current, { type: "text", text: cleanCurrentText }]
                : streamingPartsRef.current;
              const hasEffectiveContent = cleanAns || streamingPartsRef.current.length > 0;
              if (hasEffectiveContent) {
                hasReceivedFinalAnswer = true;
                const targetId = realMessageIdRef.current ?? assistantMsgId;
                setMessages((prev) =>
                  prev.map((m) => {
                    const updated = String(m.id) === String(targetId) || String(m.id) === String(assistantMsgId) || String(m.id) === "-1"
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
                      : m;
                    // Persist parts to localStorage so they survive page refresh
                    if (updated.parts && updated.id && updated.id !== "-1" && updated.id !== -1) {
                      try {
                        localStorage.setItem(`flux-parts-${updated.id}`, JSON.stringify(updated.parts));
                      } catch {}
                    }
                    return updated;
                  })
                );
              }
            } catch (innerErr) {
              console.error("Stream update error:", innerErr);
            }
          }
        }

        if (streamErrorRef.current) {
          throw new Error(streamErrorRef.current);
        }

        const finalAnswer = deepCleanAnswer(cleanAnswerText(assistantRawRef.current));
        const hasGeneratedFiles = latestGeneratedFilesRef.current.length > 0;

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
        } else if (error instanceof TypeError || error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
          const last = lastRequestRef.current;
          if (last) {
            const queueId = `${nextId++}-${Date.now()}`;
            setMessages((prev) => prev.map((m) =>
              String(m.id) === String(assistantMsgId)
                ? { ...m, content: "⏳ Queued — will send when connection is restored.", pending: true, error: false, errorMessage: undefined }
                : m
            ));
            queueMessage({
              id: queueId,
              conversationId: last.activeConversationId,
              content: last.prompt,
              model: last.selectedModel,
              files: last.attachedFiles?.map((f: AttachedFile) => ({ name: f.name, content: f.content, type: f.type })) ?? [],
              fileContent: last.fileContent ?? "",
              timestamp: Date.now(),
            }).then(() => setPendingCount((p) => p + 1)).catch(() => {});
          }
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

  const retry = useCallback((promptOverride?: string) => {
    const last = lastRequestRef.current;
    const prompt = promptOverride ?? last?.prompt;
    if (!prompt || isLoading) return;
    setMessages((prev) => prev.filter((m) => !m.error));
    const originalCallbacks = lastCallbacksRef.current;
    const callbacksForRetry: UseChatCallbacks = {
      ...(originalCallbacks || {}),
      fileContent: last?.fileContent ?? "",
      replaceLastAssistant: true,
    };
    handleSubmit(
      prompt,
      last?.activeConversationId ?? "",
      last?.selectedModel ?? "",
      last?.attachedFiles ?? null,
      callbacksForRetry
    );
  }, [isLoading, handleSubmit]);

  const deleteMessage = useCallback(async (messageId: string | number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    if (typeof messageId === 'number' && messageId > 0) {
      try {
        const token = await getAccessToken();
        const convId = lastRequestRef.current?.activeConversationId;
        if (!convId) return;
        await fetch(`${BACKEND_URL}/conversations/${convId}/messages/${messageId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error("Delete message error:", e);
      }
    }
  }, []);

  const setQueueFlushCallback = useCallback((cb: (() => void) | null) => {
    onQueueFlushedRef.current = cb;
  }, []);

  return {
    messages,
    setMessages,
    isLoading,
    handleSubmit,
    resetMessages,
    retry,
    stop,
    activeGenerationStatus,
    deleteMessage,
    pendingCount,
    setQueueFlushCallback,
  };
}
