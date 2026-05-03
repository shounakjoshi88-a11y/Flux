// Dashboard.tsx – reactive follow‑up rendering (instant, no glitch)
import { createClient } from "@/lib/client";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import {
  Globe,
  Image,
  LoaderCircle,
  X,
  FileText,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import "../../styles/dashboard.css";

import { Sidebar } from "../components/Sidebar";
import { PeekPanel } from "../components/PeekPanel";
import { ChatInput } from "../components/ChatInput";
import { MessageList } from "../components/MessageList";
import { SuggestedActions } from "../components/SuggestedActions";
import { InputSeparator } from "../components/InputSeparator";
import { useChat } from "../hooks/useChat";
import { useTheme } from "../hooks/useTheme";
import { useCanvas } from "../hooks/useCanvas";
import { CanvasView } from "../components/CanvasView";
import { ToolsDropdown } from "../components/ToolsDropdown";
import type {
  ConversationListItem,
  Message,
  ConversationDetail,
  Source,
  AttachedFile,
} from "@/types";
import { parseAssistantContent } from "@/lib/chat-utils";
import { BACKEND_URL, UNSPLASH_ACCESS_KEY } from "@/lib/config";

/* ─── Answer + Follow‑up parser (handles both old and new formats) ─── */
function extractLiveContent(rawContent: string): {
  answer: string;
  followUps: string[];
} {
  if (!rawContent) return { answer: "", followUps: [] };

  let answer = rawContent;
  let followUps: string[] = [];

  // New format: <ANSWER> … </ANSWER> possibly followed by <FOLLOW_UPS> … </FOLLOW_UPS>
  const answerMatch = rawContent.match(/<ANSWER>([\s\S]*?)<\/ANSWER>/i);
  if (answerMatch) {
    answer = answerMatch[1].trim();
    answer = answer.replace(/\[\/ANSWER\]$/i, "").trim();

    const followUpsBlock = rawContent.match(/<FOLLOW_UPS>([\s\S]*?)<\/FOLLOW_UPS>/i);
    if (followUpsBlock) {
      const questionRegex = /<question>(.*?)<\/question>/gs;
      let match;
      while ((match = questionRegex.exec(followUpsBlock[1])) !== null) {
        followUps.push(match[1].trim());
      }
    }
    return { answer, followUps };
  }

  // Old format: … [/ANSWER] then <question>…</question> in the remainder
  if (rawContent.includes("[/ANSWER]")) {
    const parts = rawContent.split("[/ANSWER]");
    answer = parts[0].trim();
    answer = answer.replace(/\[\/ANSWER\]$/i, "").trim();

    if (parts.length > 1) {
      const after = parts[1];
      const questionRegex = /<question>(.*?)<\/question>/gs;
      let match;
      while ((match = questionRegex.exec(after)) !== null) {
        followUps.push(match[1].trim());
      }
    }
    return { answer, followUps };
  }

  // No special tags – treat whole content as answer
  return { answer: rawContent.trim(), followUps: [] };
}

const supabase = createClient();

// ── MODEL CATEGORIES (unchanged) ────────────
const MODEL_CATEGORIES = [
  {
    category: "General Purpose",
    models: [
      { id: "gemini", label: "Gemini 2.5 Flash (Google)" },
      { id: "llama-3.1-8b", label: "Llama 3.1 8B (NIM)" },
      { id: "llama-4-maverick", label: "Llama 4 Maverick (NIM)" },
      { id: "mistral-large-675b", label: "Mistral Large 675B (NIM)" },
      { id: "magistral-small", label: "Magistral Small 2506 (NIM)" },
      { id: "gemma-3-12b", label: "Gemma 3 12B (NIM)" },
      { id: "phi-4-mini", label: "Phi‑4‑mini (NIM)" },
    ],
  },
  {
    category: "Reasoning & Agents",
    models: [
      { id: "llama-3.1-405b", label: "Llama 3.1 405B (NIM)" },
      { id: "llama-3.3-70b", label: "Llama 3.3 70B (NIM)" },
      { id: "nemotron-super-49b", label: "Nemotron Super 49B (NIM)" },
      { id: "nemotron-4-340b", label: "Nemotron‑4 340B (NIM)" },
      { id: "deepseek-r1", label: "DeepSeek R1 (NIM)" },
      { id: "nemotron-nano-30b", label: "Nemotron Nano 30B (NIM)" },
    ],
  },
  {
    category: "Coding",
    models: [
      { id: "glm-4.7", label: "GLM-4.7 (NIM)" },
      { id: "glm-5", label: "GLM-5 (NIM)" },
      { id: "qwen3-coder-480b", label: "Qwen3 Coder 480B (NIM)" },
      { id: "kimi-k2", label: "Kimi K2 (NIM)" },
      { id: "seed-oss-36b", label: "Seed OSS 36B (NIM)" },
    ],
  },
];

const ALL_MODELS = MODEL_CATEGORIES.flatMap((c) => c.models);

export default function Dashboard() {
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useTheme();

  const [user, setUser] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>("gemini");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const [peekFile, setPeekFile] = useState<{ name: string; content: string } | null>(null);
  const [toast, setToast] = useState<{ conversationId: string; title: string } | null>(null);
  const [activeImages, setActiveImages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"answer" | "links" | "images">("answer");
  const [safetyEnabled, setSafetyEnabled] = useState<boolean>(true);

  const {
    messages,
    setMessages,
    isLoading,
    handleSubmit: chatSubmit,
    resetMessages,
    retry,
    stop,
    statusMessages,
  } = useChat(user);

  // Canvas state
  const canvas = useCanvas(messages);
  const [toolsOpen, setToolsOpen] = useState(false);
  const previousSidebarOpen = useRef(isSidebarOpen);

  // ── Versioning for canvas ─────────
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [canvasVersionIndex, setCanvasVersionIndex] = useState(0);
  const [currentCanvasMsgId, setCurrentCanvasMsgId] = useState<string | null>(null);

  const pushVersion = useCallback((code: string) => {
    if (!code.trim()) return;
    setCanvasHistory(prev => {
      const currentIdx = canvasVersionIndex;
      if (prev[currentIdx] === code) return prev;
      const newHistory = prev.slice(0, currentIdx + 1);
      newHistory.push(code);
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setCanvasVersionIndex(prev => prev + 1);
  }, [canvasVersionIndex]);

  useEffect(() => {
    if (!canvas.isActive) {
      setCanvasHistory([]);
      setCanvasVersionIndex(0);
      setCurrentCanvasMsgId(null);
      return;
    }
    if (canvas.sourceMessageId && canvas.sourceMessageId !== currentCanvasMsgId) {
      const msg = messages.find(m => m.id === canvas.sourceMessageId);
      const metadata = (msg as any)?.metadata;
      const versions = metadata?.versions as string[] | undefined;
      let cleanVersions: string[] = [];
      if (Array.isArray(versions)) {
        cleanVersions = versions.filter(v => v.trim().length > 0);
      }
      if (cleanVersions.length > 0) {
        setCanvasHistory(cleanVersions);
        const latestIdx = cleanVersions.length - 1;
        setCanvasVersionIndex(latestIdx);
        canvas.setCanvasCode(cleanVersions[latestIdx]);
      } else {
        const fallback = metadata?.canvasCode?.trim() || canvas.canvasCode?.trim() || "";
        setCanvasHistory(fallback ? [fallback] : []);
        setCanvasVersionIndex(0);
        if (fallback) canvas.setCanvasCode(fallback);
      }
      setCurrentCanvasMsgId(canvas.sourceMessageId);
    } else if (!canvas.sourceMessageId && currentCanvasMsgId === null) {
      const initial = canvas.canvasCode?.trim() || "";
      setCanvasHistory(initial ? [initial] : []);
      setCanvasVersionIndex(0);
    }
  }, [canvas.isActive, canvas.sourceMessageId, canvas.canvasCode, messages, currentCanvasMsgId]);

  const handleCanvasCodeChange = (newCode: string) => {
    canvas.setCanvasCode(newCode);
    if (newCode.trim()) {
      pushVersion(newCode);
    }
  };

  const canUndo = canvasVersionIndex > 0;
  const canRedo = canvasVersionIndex < canvasHistory.length - 1;
  const undoCanvasVersion = () => {
    if (canUndo) {
      const newIndex = canvasVersionIndex - 1;
      setCanvasVersionIndex(newIndex);
      canvas.setCanvasCode(canvasHistory[newIndex]);
    }
  };
  const redoCanvasVersion = () => {
    if (canRedo) {
      const newIndex = canvasVersionIndex + 1;
      setCanvasVersionIndex(newIndex);
      canvas.setCanvasCode(canvasHistory[newIndex]);
    }
  };

  // ── Effects ──────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) setUser(data.user);
      else navigate("/auth");
      setIsBootstrapping(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  useEffect(() => {
    if (activeConversationId)
      localStorage.setItem("flux-active-conversation", activeConversationId);
    else
      localStorage.removeItem("flux-active-conversation");
  }, [activeConversationId]);

  useEffect(() => {
    const savedId = localStorage.getItem("flux-active-conversation");
    if (savedId && user) openConversation(savedId);
  }, [user]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const click = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".model-selector"))
        setModelDropdownOpen(false);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [modelDropdownOpen]);

  // ── Helpers ──────────────────
  async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadConversations() {
    if (!user) return;
    const token = await getAccessToken();
    const res = await fetch(`${BACKEND_URL}/conversations`, {
      headers: { Authorization: token },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { conversations: ConversationListItem[] };
    setConversations(data.conversations ?? []);
  }

  async function openConversation(id: string) {
    const token = await getAccessToken();
    const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
      method: "POST",
      headers: { Authorization: token },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { conversation: ConversationDetail };
    const enriched = data.conversation.messages.map((msg) => {
      if (msg.role === "Assistant") {
        const storedSources = (msg as any).sources as Source[] | undefined;
        const { answer, followUps } = extractLiveContent(msg.content);
        if (storedSources && storedSources.length > 0) {
          return { ...msg, content: answer, sources: storedSources, followUps } as Message;
        }
        const { sources: parsedSources } = parseAssistantContent(msg.content);
        return {
          ...msg,
          content: answer,
          sources: parsedSources.length > 0 ? parsedSources : (msg.sources ?? []),
          followUps,
        } as Message;
      }
      if (msg.role === "User") {
        const fileAttachment = (msg as any).fileAttachment as
          | { name: string; content?: string }[]
          | undefined;
        return { ...msg, fileAttachment: fileAttachment || [] };
      }
      if ((msg as any).type === "canvas") {
        const metadata = (msg as any).metadata as any;
        const canvasCode = metadata?.canvasCode ?? "";
        return { ...msg, canvasCode, type: "canvas", metadata } as Message;
      }
      return msg;
    }) as Message[];
    setMessages(enriched);
    setActiveConversationId(id);
    const last = [...enriched].reverse().find((m) => m.role === "Assistant");
    setActiveSources(last?.sources ?? []);
    setActiveCitationIndex(null);
    setActiveTab("answer");
    setActiveImages([]);
    if (canvas.isActive) {
      canvas.closeCanvas();
    }
  }

  function createNewThread() {
    resetMessages();
    setActiveConversationId(null);
    setActiveSources([]);
    setActiveCitationIndex(null);
    setQuery("");
    setAttachedFiles([]);
    setActiveTab("answer");
    setActiveImages([]);
    if (canvas.isActive) {
      canvas.closeCanvas();
    }
  }

  async function handleAttachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 2 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 2MB limit.`);
        return;
      }
      try {
        const rawText = await file.text();
        if (rawText.includes("\0")) {
          alert("Only text‑based files are supported.");
          return;
        }
        const cleanText = rawText.trim();
        if (!cleanText) {
          alert(`File "${file.name}" appears to be empty.`);
          return;
        }
        newFiles.push({ name: file.name, content: cleanText.slice(0, 12000) });
      } catch {
        alert(`Unable to read file "${file.name}".`);
        return;
      }
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }

  async function fetchImagesForQuery(q: string) {
    if (!q.trim()) return;
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=6&client_id=${UNSPLASH_ACCESS_KEY}`
      );
      const data = await res.json();
      setActiveImages((data.results ?? []).map((img: any) => img.urls.small));
    } catch {
      setActiveImages([]);
    }
  }

  // ═══ REACTIVE CLEANUP ═══
  // Whenever messages change, automatically strip answer tags & extract follow‑ups
  useEffect(() => {
    if (messages.length === 0) return;

    // Process only the last assistant message without unnecessary updates
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "Assistant") return;

    const rawContent = lastMsg.content;
    const hasAnswerTag = /<ANSWER>/i.test(rawContent) || /\[\/ANSWER\]/.test(rawContent);
    const hasFollowUpsTag = /<FOLLOW_UPS>/i.test(rawContent);

    // If no tags, nothing to do
    if (!hasAnswerTag && !hasFollowUpsTag) return;

    // Extract clean answer and follow‑ups
    const { answer, followUps } = extractLiveContent(rawContent);

    // Only update if something actually changed
    const needsUpdate =
      answer !== lastMsg.content ||
      (followUps.length > 0 && (!lastMsg.followUps || lastMsg.followUps.length === 0));

    if (needsUpdate) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...lastMsg,
          content: answer,
          followUps,
        };
        return updated;
      });
    }
  }, [messages]); // runs on every messages change – but only triggers state update when needed

  // ── Canvas‑aware send logic ──
  const handleSend = (nextQuery?: string) => {
    const prompt = (nextQuery ?? query).trim();
    if (!prompt || isLoading) return;
    setQuery("");

    if (canvas.isActive) {
      const accessTokenPromise = getAccessToken();
      accessTokenPromise.then((accessToken) => {
        fetch(`${BACKEND_URL}/flux_ask/canvas`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: accessToken,
          },
          body: JSON.stringify({
            query: prompt,
            model: selectedModel,
            existingCode: canvas.canvasCode,
          }),
        })
          .then((response) => {
            if (!response.ok) throw new Error("Canvas request failed");
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No reader");

            const decoder = new TextDecoder();
            let buffer = "";

            function processStream() {
              reader!.read().then(({ done, value }) => {
                if (done) {
                  // Delayed refresh to catch auto‑renamed title
                  setTimeout(() => loadConversations(), 3000);
                  return;
                }
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith("data: ")) {
                    const data = trimmed.slice(6).trim();
                    try {
                      const parsed = JSON.parse(data);
                      if (parsed.type === "stream" && parsed.code) {
                        canvas.setCanvasCode(parsed.code);
                      }
                    } catch (e) {}
                  } else if (trimmed.startsWith("event: canvasCode")) {
                    const nextIndex = lines.indexOf(trimmed) + 1;
                    if (nextIndex < lines.length) {
                      const dataLine = lines[nextIndex].trim();
                      if (dataLine.startsWith("data: ")) {
                        const json = dataLine.slice(6).trim();
                        try {
                          const parsed = JSON.parse(json);
                          if (parsed.code) {
                            handleCanvasCodeChange(parsed.code);
                          }
                        } catch (e) {
                          console.warn("Final canvasCode parse error", e);
                        }
                      }
                    }
                  }
                }
                processStream();
              }).catch((err) => {
                console.error("Canvas stream error:", err);
              });
            }
            processStream();
          })
          .catch((err) => {
            console.error("Canvas fetch error:", err);
            alert("Failed to generate code in canvas mode.");
          });
      });
      return;
    }

    // Normal chat mode
    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);
    fetchImagesForQuery(prompt);

    chatSubmit(prompt, activeConversationId, selectedModel, filesToSend, safetyEnabled, {
      onNewConversationId: (id) => setActiveConversationId(id),
      onStreamUpdate: (parsed) => setActiveSources(parsed.sources),
      onComplete: () => {
        loadConversations();
        // Delayed refresh to catch auto‑renamed title
        setTimeout(() => loadConversations(), 3000);
      },
      fileContent: filesToSend.map((f) => f.content).join("\n\n---\n\n"),
      attachedFiles: filesToSend,
    });
  };

  // ── Canvas open / close handlers ──
  const handleOpenCanvas = async () => {
    if (!activeConversationId) {
      try {
        const token = await getAccessToken();
        const res = await fetch(`${BACKEND_URL}/conversations/new`, {
          method: "POST",
          headers: { Authorization: token },
        });
        if (res.ok) {
          const data = await res.json();
          setActiveConversationId(data.conversation.id);
          loadConversations();
        } else {
          alert("Could not create canvas session. Please try again.");
          return;
        }
      } catch (err) {
        console.error("Failed to create conversation for canvas:", err);
        alert("Could not create canvas session.");
        return;
      }
    }

    canvas.openCanvas();
    setToolsOpen(false);
    previousSidebarOpen.current = isSidebarOpen;
    setIsSidebarOpen(false);
  };

  const handleCloseCanvas = async () => {
    const currentCode = canvas.canvasCode;
    if (activeConversationId && currentCode) {
      const metadata: any = { canvasCode: currentCode };
      if (canvasHistory.length > 0) {
        metadata.versions = canvasHistory.filter(v => v.trim().length > 0);
      }

      const existingCanvasMsg = messages.find(m => (m as any).type === "canvas");
      if (existingCanvasMsg) {
        setMessages(prev => prev.map(msg =>
          msg.id === existingCanvasMsg.id
            ? { ...msg, canvasCode: currentCode, metadata } as Message
            : msg
        ));
      } else {
        const canvasMsg: Message = {
          id: `canvas-${Date.now()}`,
          role: "Assistant",
          content: "",
          type: "canvas",
          canvasCode: currentCode,
          metadata,
          createdAt: new Date().toISOString(),
        } as any;
        setMessages((prev) => [...prev, canvasMsg]);
      }

      try {
        const token = await getAccessToken();
        await fetch(`${BACKEND_URL}/canvas/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token,
          },
          body: JSON.stringify({
            conversationId: activeConversationId,
            canvasCode: currentCode,
            versions: metadata.versions,
          }),
        });
        // Delayed refresh to catch auto‑rename after canvas save
        setTimeout(() => loadConversations(), 3000);
      } catch (err) {
        console.error("Failed to save canvas:", err);
      }
    }

    canvas.closeCanvas();
    setIsSidebarOpen(previousSidebarOpen.current);
  };

  const handleCanvasReopen = (message: Message) => {
    const code = (message as any).canvasCode ?? (message as any).metadata?.canvasCode ?? "";
    canvas.reopenFromMessage(message);
    previousSidebarOpen.current = isSidebarOpen;
    setIsSidebarOpen(false);
  };

  // ── Delete / Undo ────────────
  async function deleteConversation(id: string) {
    if (!user) return;
    const token = await getAccessToken();
    try {
      const res = await fetch(`${BACKEND_URL}/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error("Delete failed");
      const conv = conversations.find((c) => c.id === id);
      const title = conv?.title ?? "Untitled conversation";
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) createNewThread();
      setToast({ conversationId: id, title });
    } catch (err) {
      console.error("Deletion error:", err);
    }
  }

  function undoDelete() {
    if (!toast) return;
    setConversations((prev) => [
      {
        id: toast.conversationId,
        title: toast.title,
        slug: "",
        lastMessageAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setToast(null);
  }

  // ── Derived state ────────────────────────
  const hasStarted = messages.length > 0 || activeConversationId !== null;
  const placeholderText = hasStarted ? "Ask follow-up..." : "Ask anything ...";
  const showFixedInput = !canvas.isActive && (!hasStarted || (hasStarted && activeTab === "answer"));

  const tabClass = (tab: string) =>
    `relative pb-2 text-sm font-medium transition-all duration-200 ${
      activeTab === tab
        ? "text-foreground scale-105 after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:h-[2px] after:w-4/5 after:bg-[#40E0FF] after:rounded-full"
        : "text-muted-foreground hover:text-foreground hover:scale-105"
    }`;

  const currentModelLabel =
    ALL_MODELS.find((m) => m.id === selectedModel)?.label ?? "Gemini 2.5 Flash";

  // ── Tools button slot ────────────────────
  const toolsButtonSlot = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setToolsOpen(!toolsOpen)}
        className={`flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition ${
          canvas.isActive ? "p-1 rounded-full hover:bg-white/10" : ""
        }`}
        title="Tools"
      >
        {canvas.isActive ? (
          <Wrench className="size-4" />
        ) : (
          <>
            <Wrench className="size-3.5" />
            <span>Tools</span>
          </>
        )}
      </button>

      {canvas.isActive && (
        <div className="absolute left-0 top-full mt-1 flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 border border-blue-500/30 text-xs text-blue-400">
          <span>Canvas</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCloseCanvas();
            }}
            className="ml-1 hover:text-white transition"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <ToolsDropdown
        isOpen={toolsOpen}
        onClose={() => setToolsOpen(false)}
        onCanvasSelect={handleOpenCanvas}
      />
    </div>
  );

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full main-container text-foreground overflow-hidden font-sans">
      <AnimatePresence>
        {!canvas.isActive && isSidebarOpen && (
          <Sidebar
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen((p) => !p)}
            user={user}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onCreateThread={createNewThread}
            onSelectThread={openConversation}
            onDeleteThread={deleteConversation}
            isDarkMode={isDark}
            toggleTheme={toggleTheme}
            onLogout={async () => {
              await supabase.auth.signOut();
              setUser(null);
              navigate("/auth");
            }}
          />
        )}
      </AnimatePresence>

      <main
        className={`relative flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-in-out ${
          isSidebarOpen && !canvas.isActive ? "md:ml-[280px]" : "md:ml-0"
        }`}
      >
        <section className="h-full flex flex-col rounded-xl border theme-surface bg-white dark:bg-[#040404] border-black/10 dark:border-white/10">
          {hasStarted && !canvas.isActive && (
            <header className="flex items-center justify-center border-b border-black/10 dark:border-white/10 px-4 py-3">
              <div className="flex items-center gap-8">
                <button type="button" onClick={() => setActiveTab("answer")} className={tabClass("answer")}>Answer</button>
                <button type="button" onClick={() => setActiveTab("links")} className={tabClass("links")}>
                  <Globe className="size-3.5 inline mr-1.5" /> Links
                </button>
                <button type="button" onClick={() => setActiveTab("images")} className={tabClass("images")}>
                  <Image className="size-3.5 inline mr-1.5" /> Images
                </button>
              </div>
            </header>
          )}

          {/* ── Content area ── */}
          {canvas.isActive ? (
            <CanvasView
              initialCode={canvas.canvasCode}
              onCodeChange={handleCanvasCodeChange}
              onClose={handleCloseCanvas}
              chatProps={{
                query,
                setQuery,
                onSend: handleSend,
                isLoading,
                placeholderText: "Ask for changes...",
                attachedFiles,
                setAttachedFiles,
                selectedModel,
                setSelectedModel,
                models: MODEL_CATEGORIES,
                currentModelLabel,
                modelDropdownOpen,
                setModelDropdownOpen,
                handleAttachFiles,
                onStop: stop,
                safetyEnabled,
                setSafetyEnabled,
                compact: true,
                toolsSlot: null,
              }}
              versionIndex={canvasVersionIndex}
              versionCount={canvasHistory.length}
              onVersionBack={undoCanvasVersion}
              onVersionForward={redoCanvasVersion}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          ) : !hasStarted ? (
            /* New chat */
            <div className="flex-1 overflow-y-auto px-6">
              <div className="flex flex-col items-center justify-start pt-64">
                <motion.div
                  layoutId="search-input"
                  transition={{ type: "spring", stiffness: 350, damping: 35 }}
                  className="w-full max-w-2xl mx-auto"
                >
                  <div className="border border-white/[0.08] dark:border-white/[0.08] rounded-2xl shadow-[0_0_15px_rgba(64,224,255,0.03)] backdrop-blur-sm bg-background dark:bg-[#000000]">
                    <ChatInput
                      query={query}
                      setQuery={setQuery}
                      onSend={handleSend}
                      isLoading={isLoading}
                      placeholderText={placeholderText}
                      attachedFiles={attachedFiles}
                      setAttachedFiles={setAttachedFiles}
                      selectedModel={selectedModel}
                      setSelectedModel={setSelectedModel}
                      models={MODEL_CATEGORIES}
                      currentModelLabel={currentModelLabel}
                      modelDropdownOpen={modelDropdownOpen}
                      setModelDropdownOpen={setModelDropdownOpen}
                      handleAttachFiles={handleAttachFiles}
                      onStop={stop}
                      safetyEnabled={safetyEnabled}
                      setSafetyEnabled={setSafetyEnabled}
                      toolsSlot={toolsButtonSlot}
                    />
                  </div>
                </motion.div>

                <div className="mt-4 w-full max-w-2xl">
                  <SuggestedActions onSelect={setQuery} />
                </div>
              </div>
            </div>
          ) : (
            /* Chat messages */
            <MessageList
              messages={messages}
              activeTab={activeTab}
              activeSources={activeSources}
              activeImages={activeImages}
              isLoading={isLoading}
              activeCitationIndex={activeCitationIndex}
              setActiveCitationIndex={setActiveCitationIndex}
              onFollowUpClick={(q) => handleSend(q)}
              setPeekUrl={setPeekUrl}
              onRetry={retry}
              statusMessages={statusMessages}
              onFileClick={(file) => setPeekFile(file)}
              onCanvasReopen={handleCanvasReopen}
            />
          )}
        </section>

        {/* Fixed bottom input – during chat (hidden in canvas) */}
        {showFixedInput && hasStarted && (
          <motion.div
            layoutId="search-input"
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className={`fixed bottom-6 left-0 right-0 z-50 pointer-events-none px-6 ${
              isSidebarOpen ? "md:left-[280px]" : "md:left-0"
            } transition-[left] duration-300`}
            style={{ left: isSidebarOpen ? "280px" : "0px" }}
          >
            <div className="bg-background dark:bg-[#000000]">
              <div className="flex justify-center pt-2 pointer-events-auto">
                <div className="w-full max-w-[760px] mx-auto border border-white/[0.08] dark:border-white/[0.08] rounded-2xl shadow-[0_0_15px_rgba(64,224,255,0.03)] backdrop-blur-sm">
                  <ChatInput
                    query={query}
                    setQuery={setQuery}
                    onSend={handleSend}
                    isLoading={isLoading}
                    placeholderText={placeholderText}
                    attachedFiles={attachedFiles}
                    setAttachedFiles={setAttachedFiles}
                    selectedModel={selectedModel}
                    setSelectedModel={setSelectedModel}
                    models={MODEL_CATEGORIES}
                    currentModelLabel={currentModelLabel}
                    modelDropdownOpen={modelDropdownOpen}
                    setModelDropdownOpen={setModelDropdownOpen}
                    handleAttachFiles={handleAttachFiles}
                    onStop={stop}
                    safetyEnabled={safetyEnabled}
                    setSafetyEnabled={setSafetyEnabled}
                    toolsSlot={toolsButtonSlot}
                  />
                </div>
              </div>
              <InputSeparator />
              <div className="pb-2" />
            </div>
          </motion.div>
        )}

        {/* URL Peek Panel */}
        <PeekPanel url={peekUrl} onClose={() => setPeekUrl(null)} />

        {/* File Preview Panel */}
        <AnimatePresence>
          {peekFile && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/10 z-50 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-blue-500" />
                  <span className="text-sm font-medium truncate">{peekFile.name}</span>
                </div>
                <button onClick={() => setPeekFile(null)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition">
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80 leading-relaxed">
                  {peekFile.content || "No content available."}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-[#1a1a1a] border border-white/10 text-white rounded-full px-5 py-3 shadow-lg"
            >
              <span className="text-sm">Thread deleted.</span>
              <button onClick={undoDelete} className="text-sm font-medium text-[#40E0FF] hover:underline">Undo</button>
              <button onClick={() => setToast(null)} className="text-white/50 hover:text-white"><X className="size-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}