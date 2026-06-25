import { useState, useRef, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";
import { extractLiveContent } from "@/lib/chat-utils";
import type { Message, AttachedFile, Source, GeneratedFile, MessagePart, PermissionRequest } from "@/types";

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
  fileContent?: string;
  attachedFiles?: { name: string; content?: string }[];
  replaceLastAssistant?: boolean;
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
      .replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, "")
      .replace(/<\/?THOUGHT>/gi, "")
      .replace(/<\/?ANSWER>/gi, "")
      .replace(/<\/?FOLLOW_UPS>/gi, "")
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
    if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
      return stripTags(raw.slice(openIdx + 8, closeIdx));
    }
    if (openIdx !== -1) {
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

      setMessages((prev) => {
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
              const cleanAns = cleanAnswerText(assistantRawRef.current);
              const cleanCurrentText = cleanAnswerText(textAccumRef.current);
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

        const finalAnswer = cleanAnswerText(assistantRawRef.current);
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
