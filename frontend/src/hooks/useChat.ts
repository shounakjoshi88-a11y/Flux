// src/hooks/useChat.ts
import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/client";
import { BACKEND_URL } from "@/lib/config";
import { extractLiveContent } from "@/lib/chat-utils";
import type { Message, AttachedFile, Source } from "@/types";

const supabase = createClient();

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

type UseChatCallbacks = {
  onNewConversationId?: (id: string) => void;
  onStreamUpdate?: (parsed: { content: string; sources: Source[] }) => void;
  onComplete?: () => void;
  fileContent?: string;
  attachedFiles?: { name: string; content?: string }[];
};

export function useChat(user: any) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const isLoadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{
    prompt: string;
    activeConversationId: string | null;
    selectedModel: string;
    attachedFiles: AttachedFile[] | null;
    safetyEnabled: boolean;
  } | null>(null);

  const resetMessages = useCallback(() => {
    setMessages([]);
    setStatusMessages([]);
    setIsLoading(false);
    isLoadingRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    lastRequestRef.current = null;
  }, []);

  const handleSubmit = useCallback(
    async (
      prompt: string,
      activeConversationId: string | null,
      selectedModel: string,
      attachedFiles: AttachedFile[] | null,
      safetyEnabled: boolean,
      callbacks?: UseChatCallbacks
    ) => {
      if (!prompt.trim() || isLoadingRef.current || !user) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      isLoadingRef.current = true;
      setStatusMessages([]);

      lastRequestRef.current = { prompt, activeConversationId, selectedModel, attachedFiles, safetyEnabled };

      const token = await getAccessToken();

      // Build request body with multiple file attachments
      const body: any = {
        query: prompt,
        model: selectedModel,
        safetyEnabled,
        fileContent: callbacks?.fileContent ?? "",
        attachedFiles: attachedFiles && attachedFiles.length > 0
          ? attachedFiles.map((f) => ({ name: f.name, content: f.content }))
          : undefined,
      };

      if (activeConversationId) {
        body.conversationId = activeConversationId;
      }

      const endpoint = activeConversationId
        ? `${BACKEND_URL}/flux_ask/follow_up`
        : `${BACKEND_URL}/flux_ask`;

      // Optimistic user message
      const optimisticUser: Message = {
        id: Date.now(),
        role: "User",
        content: attachedFiles && attachedFiles.length > 0
          ? `${prompt}\n\n${attachedFiles.map((f) => `[attached: ${f.name}]`).join("\n")}`
          : prompt,
        createdAt: new Date().toISOString(),
        fileAttachment: attachedFiles
          ? attachedFiles.map((f) => ({ name: f.name, content: f.content }))
          : [],
      } as any;

      setMessages((prev) => [...prev, optimisticUser]);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token },
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
        let assistantRaw = "";
        let latestSources: Source[] = [];

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

            if (eventType === "sources") {
              try { latestSources = JSON.parse(data) as Source[]; } catch {}
            } else if (eventType === "status") {
              setStatusMessages((prev) => [...prev, data]);
            } else if (eventType === "error") {
              // skip
            } else {
              assistantRaw += data;
            }

            const { answer, followUps } = extractLiveContent(assistantRaw);

            setMessages((prev) => {
              const withoutTemp = prev.filter((m) => m.id !== -1);
              const assistantMsg: Message = {
                id: -1,
                role: "Assistant",
                content: answer,
                createdAt: new Date().toISOString(),
                sources: latestSources.length > 0 ? latestSources : [],
                followUps,
              } as Message;
              return [...withoutTemp, assistantMsg];
            });

            callbacks?.onStreamUpdate?.({ content: answer, sources: latestSources });
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === -1 ? { ...m, id: Date.now() + 1 } : m))
        );
        setStatusMessages([]);

        const finalAnswer = extractLiveContent(assistantRaw).answer;
        if (!finalAnswer || finalAnswer.startsWith("[Error")) {
          setMessages((prev) => {
            const withoutLast = prev.slice(0, -1);
            return [
              ...withoutLast,
              {
                id: Date.now() + 1,
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
            prev.map((m) => (m.id === -1 ? { ...m, id: Date.now() + 1 } : m))
          );
          setStatusMessages([]);
        } else {
          console.error("Send failed:", error);
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== -1),
            {
              id: Date.now() + 1,
              role: "Assistant",
              content: "",
              createdAt: new Date().toISOString(),
              error: true,
              errorMessage: "Message failed. Please try again.",
            } as Message,
          ]);
        }
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
        abortControllerRef.current = null;
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
    setMessages((prev) => prev.filter((m) => !(m as any).error));
    handleSubmit(last.prompt, last.activeConversationId, last.selectedModel, last.attachedFiles, last.safetyEnabled, {
      onNewConversationId: (id) => {},
      onStreamUpdate: () => {},
      onComplete: () => {},
    });
  }, [isLoading, handleSubmit]);

  return { messages, setMessages, isLoading, handleSubmit, resetMessages, retry, stop, statusMessages };
}