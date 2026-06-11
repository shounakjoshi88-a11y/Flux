// Dashboard.tsx – fully integrated with normal chat pipeline, PDF preview in PeekPanel
import { createClient } from "@/lib/client";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import {
  Globe,
  Image,
  LoaderCircle,
  X,
  FileText,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import "../../styles/dashboard.css";

import { Sidebar } from "../components/Sidebar";
import { PeekPanel } from "../components/PeekPanel";
import { ChatInput } from "../components/ChatInput";
import { MessageList } from "../components/MessageList";
import { SuggestedActions } from "../components/SuggestedActions";
import { InputSeparator } from "../components/InputSeparator";
import { Settings } from "../components/Settings";
import { PromptHistoryCard } from "../components/PromptHistoryCard";
import { ArtifactsModal, prefetchArtifacts } from "../components/ArtifactsModal";
import { NewsModal } from "../components/NewsModal";
import { useChat } from "../hooks/useChat";
import { useTheme } from "../hooks/useTheme";
import { useSessionRevocationListener } from "../hooks/useSessionRevocationListener";
import type {
  ConversationListItem,
  Message,
  ConversationDetail,
  Source,
  AttachedFile,
  MessagePart,
} from "@/types";
import { parseAssistantContent, extractLiveContent } from "@/lib/chat-utils";
import { BACKEND_URL, UNSPLASH_ACCESS_KEY } from "@/lib/config";

const supabase = createClient();

// ── MODEL CATEGORIES ───────────────────────────────────────
const MODEL_CATEGORIES = [
  {
    category: "General Purpose",
    models: [
      { id: "mistral-large-675b", label: "Mistral Large 3 675B (Mistral AI)" },
      { id: "glm-5.1", label: "GLM 5.1 (Z‑AI)" },
      { id: "kimi-k2.6", label: "Kimi K2.6 (Moonshot AI)" },
      { id: "nemotron-3-ultra-550b", label: "Nemotron 3 Ultra 550B (NVIDIA)" },
      { id: "mistral-medium-3.5-128b", label: "Mistral Medium 3.5 128B (Mistral AI)" },
      { id: "nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B (NVIDIA)" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash (DeepSeek)" },
      { id: "qwen3.5-397b-a17b", label: "Qwen 3.5 397B (Qwen)" },
      { id: "minimax-m2.7", label: "MiniMax M2.7 (MiniMax)" },
      { id: "stockmark-2-100b-instruct", label: "Stockmark 2 100B (Stockmark)" },
      { id: "nemotron-nano-12b-v2-vl", label: "Nemotron Nano 12B v2 VL (NVIDIA)" },
      { id: "nemotron-mini-4b", label: "Nemotron Mini 4B (NVIDIA)" },
      { id:  "sarvamai", label: "Sarvamai (Sarvamai)" },
    ],
  },
  {
    category: "Reasoning & Agents",
    models: [
      { id: "step-3.7-flash", label: "Step 3.7 Flash (StepFun)" },
      { id: "step-3.5-flash", label: "Step 3.5 Flash (StepFun)" },
      { id: "nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B Reasoning (NVIDIA)" },
    ],
  },
];
// ── END MODEL CATEGORIES ──────────────────────────────────
const ALL_MODELS = MODEL_CATEGORIES.flatMap((c) => c.models);

type GeneratedFile = {
  filename: string;
  mime: string;
  base64: string;
  slides?: { title: string; content: string }[];
  sections?: { heading: string; body: string }[];
  pages?: { text: string }[];
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { isDark, toggle: toggleTheme } = useTheme();

  // ─── ALL HOOKS ──────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  // ─── Seed conversations from localStorage for instant sidebar render ────────
  const [conversations, setConversations] = useState<ConversationListItem[]>(() => {
    try {
      const saved = localStorage.getItem("flux-conversations");
      return saved ? (JSON.parse(saved) as ConversationListItem[]) : [];
    } catch {
      return [];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);
  const isInitialMountRef = useRef(true);

  // ─── Conversation cache (avoids re-fetching recently opened threads) ──────
  type ConvCacheEntry = { enriched: Message[]; ts: number };
  const conversationCacheRef = useRef<Map<string, ConvCacheEntry>>(new Map());
  const CONV_CACHE_TTL = 45_000; // 45 s – stale after this; background-refreshed on next open

  // ─── Token cache (avoids a Supabase round-trip on every action) ──────────
  const tokenCacheRef = useRef<{ token: string; expiresAt: number } | null>(null);

  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>("kimi-k2.6");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const [peekPdf, setPeekPdf] = useState<{ base64: string; filename: string } | null>(null);
  const [peekDocx, setPeekDocx] = useState<{ html: string; filename: string } | null>(null);
  const [peekPptx, setPeekPptx] = useState<{ base64: string; filename: string } | null>(null);
  const [peekXlsx, setPeekXlsx] = useState<{ base64: string; filename: string } | null>(null);
  const [peekMd, setPeekMd] = useState<{ base64: string; filename: string } | null>(null);
  const [peekFile, setPeekFile] = useState<{ name: string; content: string } | null>(null);
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [toast, setToast] = useState<{ conversationId: string; title: string } | null>(null);
  const [activeImages, setActiveImages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"answer" | "links" | "images">("answer");

  // ─── Search modal state ──────────────────────────────────
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const handleSearchModalOpen = useCallback(() => setIsSearchModalOpen(true), []);
  const handleSearchModalClose = useCallback(() => setIsSearchModalOpen(false), []);

  // ─── Settings state ─────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [logoRisen, setLogoRisen] = useState(false);
  const handleSettingsOpen = useCallback(() => setIsSettingsOpen(true), []);
  const handleSettingsClose = useCallback(() => setIsSettingsOpen(false), []);

  // ─── Force logout listener ────────────────────────────────
  useSessionRevocationListener();

  const {
    messages,
    setMessages,
    isLoading,
    handleSubmit: chatSubmit,
    resetMessages,
    retry,
    stop,
    activeGenerationStatus,
  } = useChat(user);

  const previousSidebarOpen = useRef(isSidebarOpen);

  const currentModelLabel = useMemo(
    () => ALL_MODELS.find((m) => m.id === selectedModel)?.label ?? "Kimi K2.6 (Moonshot AI)",
    [selectedModel]
  );

  // ── Auth & loading effects ──
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
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (activeConversationId)
      localStorage.setItem("flux-active-conversation", activeConversationId);
    else localStorage.removeItem("flux-active-conversation");
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

  // ── Cached access token helper ──
  const getAccessToken = useCallback(async () => {
    const now = Date.now();
    // Return cached token if it still has >15 s left
    if (tokenCacheRef.current && tokenCacheRef.current.expiresAt > now + 15_000) {
      return tokenCacheRef.current.token;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      tokenCacheRef.current = {
        token: session.access_token,
        expiresAt: session.expires_at ? session.expires_at * 1000 : now + 3_600_000,
      };
      return session.access_token;
    }
    await supabase.auth.refreshSession();
    const { data: { session: fresh } } = await supabase.auth.getSession();
    const t = fresh?.access_token ?? "";
    if (t) {
      tokenCacheRef.current = {
        token: t,
        expiresAt: fresh?.expires_at ? fresh.expires_at * 1000 : now + 3_600_000,
      };
    }
    return t;
  }, []);

  const createNewThread = useCallback(() => {
    resetMessages();
    setActiveConversationId(null);
    setActiveSources([]);
    setActiveCitationIndex(null);
    setQuery("");
    setAttachedFiles([]);
    setActiveTab("answer");
    setActiveImages([]);
    setPeekPdf(null);
    setPeekUrl(null);
  }, [resetMessages]);

  // ── Search conversations ──
  const searchConversations = useCallback(async (query: string) => {
    const token = await getAccessToken();
    if (!token) return [];
    const res = await fetch(`${BACKEND_URL}/conversations/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.conversations as ConversationListItem[];
  }, [getAccessToken]);

  // ── Load conversations ──
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`${BACKEND_URL}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { conversations: ConversationListItem[] };
    const list = data.conversations ?? [];
    setConversations(list);
    // Persist so the sidebar renders instantly on next page load
    try { localStorage.setItem("flux-conversations", JSON.stringify(list)); } catch {}
  }, [user, getAccessToken]);

  // ── Shared enrichment helper ──────────────────────────────────────────────
  const enrichConversationMessages = useCallback(
    (rawMessages: any[]): ConvCacheEntry => {
      const enriched = rawMessages.map((msg) => {
        if (msg.role === "Assistant") {
          const storedSources = (msg as any).sources as Source[] | undefined;
          const storedFollowUps = (msg as any).followUps as string[] | undefined;
          const storedThoughtProcess = (msg as any).thoughtProcess as any[] | undefined;
          if (typeof msg.content !== "string") msg.content = "";
          const { answer, followUps: parsedFollowUps } = extractLiveContent(msg.content);
          const finalFollowUps =
            storedFollowUps && storedFollowUps.length > 0 ? storedFollowUps : parsedFollowUps;

          // Reconstruct parts from thoughtProcess for backward compatibility
          if (!(msg as any).parts && storedThoughtProcess?.length) {
            const parts: MessagePart[] = [];
            if (answer.trim()) {
              parts.push({ type: "text", text: answer });
            }
            let lastTodosIdx = -1;
            for (let tpi = 0; tpi < storedThoughtProcess.length; tpi++) {
              const tp = storedThoughtProcess[tpi];
              if (tp.type === "status") {
                parts.push({
                  type: "tool_call",
                  name: tp.subtype,
                  input: tp.data,
                  output: tp.message,
                  status: "completed",
                });
              } else if (tp.type === "thought" && tp.content?.trim()) {
                parts.push({ type: "thought", content: tp.content });
              } else if (tp.type === "todos" && tp.items?.length) {
                lastTodosIdx = parts.length; // will be overwritten by later events
                parts.push({ type: "todos", items: tp.items });
              }
            }
            // Only keep the last todos entry (replaces in-place like SSE does)
            if (lastTodosIdx >= 0) {
              const lastEntry = parts.splice(lastTodosIdx, 1)[0] as any;
              // Remove any earlier todos entries
              for (let pi = parts.length - 1; pi >= 0; pi--) {
                if (parts[pi]?.type === "todos") parts.splice(pi, 1);
              }
              parts.push(lastEntry);
            }
            (msg as any).parts = parts;
          }

          if (storedSources && storedSources.length > 0) {
            return { ...msg, content: answer, sources: storedSources, followUps: finalFollowUps } as Message;
          }
          const { sources: parsedSources } = parseAssistantContent(msg.content);
          return { ...msg, content: answer, sources: parsedSources.length > 0 ? parsedSources : (msg.sources ?? []), followUps: finalFollowUps } as Message;
        }
        if (msg.role === "User") {
          const fileAttachment = (msg as any).fileAttachment as { name: string; content?: string }[] | undefined;
          return { ...msg, fileAttachment: fileAttachment || [] };
        }
        return msg;
      }) as Message[];
      return { enriched, ts: Date.now() };
    },
    []
  );

  // ── Open conversation (instant from cache, network on miss) ───────────────
  const openConversation = useCallback(
    async (id: string) => {
      // ── 0. Update active state immediately so the sidebar highlights at once ──
      setActiveConversationId(id);
      setActiveCitationIndex(null);
      setActiveTab("answer");
      setActiveImages([]);

      // ── 1. Serve instantly from cache if still fresh ───────────────────────
      const cached = conversationCacheRef.current.get(id);
      if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) {
        setMessages(cached.enriched);
        const last = [...cached.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
        return;
      }

      // ── 2. Cache miss – show empty state immediately, fetch in background ──
      setMessages([]);
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          console.warn("Conversation not found, removing from local state");
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (activeConversationIdRef.current === id) createNewThread();
          return;
        }
        return;
      }
      const data = (await res.json()) as { conversation: ConversationDetail };
      const entry = enrichConversationMessages(data.conversation.messages);

      // ── 3. Store in cache ─────────────────────────────────────────────────
      conversationCacheRef.current.set(id, entry);

      // Only apply if the user hasn't navigated away while we were fetching
      if (activeConversationIdRef.current === id) {
        setMessages(entry.enriched);
        const last = [...entry.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
      }
    },
    [getAccessToken, setMessages, enrichConversationMessages, createNewThread]
  );

  // ── Prefetch on hover (best-effort, fires before the user clicks) ─────────
  const prefetchConversation = useCallback(
    async (id: string) => {
      // Skip if already cached and fresh
      const cached = conversationCacheRef.current.get(id);
      if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) return;
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { conversation: ConversationDetail };
        const entry = enrichConversationMessages(data.conversation.messages);
        conversationCacheRef.current.set(id, entry);
      } catch {
        // silent – prefetch is best-effort
      }
    },
    [getAccessToken, enrichConversationMessages]
  );

  // ── File handling ──
  const handleAttachFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || !(file instanceof File)) continue;

      const fileName = file.name || 'unnamed-file';
      const fileSize = file.size || 0;
      const fileType = file.type || '';

      const isImage = fileType.startsWith('image/');
      const isVideo = fileType.startsWith('video/');
      const isMedia = isImage || isVideo;
      const limit = isMedia ? 10 * 1024 * 1024 : 2 * 1024 * 1024;

      if (fileSize > limit) {
        alert(`File "${fileName}" exceeds the ${isMedia ? '10MB' : '2MB'} limit.`);
        continue;
      }
      
      try {
        if (isMedia) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          newFiles.push({ name: fileName, content: base64, type: fileType });
        } else {
          const rawText = await file.text();
          if (typeof rawText !== 'string' || rawText.includes("\0")) {
             // Basic binary check
             alert(`File "${fileName}" is not a valid text-based file.`);
             continue;
          }
          newFiles.push({ name: fileName, content: rawText.slice(0, 50000), type: fileType || 'text/plain' });
        }
      } catch {
        alert(`Unable to read file "${fileName}".`);
      }
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const fetchImagesForQuery = useCallback(async (q: string) => {
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
  }, []);

  // ── Artifact preview handler ─────────────────────────────
  const handlePreview = useCallback((data: { 
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md'; 
    base64?: string; 
    html?: string; 
    filename: string 
  }) => {
    // Clear ALL peek states (including any open URL panel) before showing artifact
    setPeekUrl(null);
    setPeekPdf(null);
    setPeekDocx(null);
    setPeekPptx(null);
    setPeekXlsx(null);
    setPeekMd(null);

    if (data.type === 'pdf' && data.base64) {
      setPeekPdf({ base64: data.base64, filename: data.filename });
    } else if (data.type === 'docx' && data.html) {
      setPeekDocx({ html: data.html, filename: data.filename });
    } else if (data.type === 'pptx' && data.base64) {
      setPeekPptx({ base64: data.base64, filename: data.filename });
    } else if (data.type === 'xlsx' && data.base64) {
      setPeekXlsx({ base64: data.base64, filename: data.filename });
    } else if (data.type === 'md' && data.base64) {
      setPeekMd({ base64: data.base64, filename: data.filename });
    }
    // Close artifacts modal to show preview side-by-side with chat
    setIsArtifactsOpen(false);
  }, []);

  // ── Main send handler ──
  const handleSend = useCallback(
    (nextQuery?: string) => {
      const prompt = (nextQuery ?? query).trim();
      if (!prompt || isLoading) return;
      setQuery("");

      const filesToSend = [...attachedFiles];
      setAttachedFiles([]);
      fetchImagesForQuery(prompt);
      chatSubmit(
        prompt,
        activeConversationId,
        selectedModel,
        filesToSend,
        {
          onNewConversationId: (id) => {
            setActiveConversationId(id);
            activeConversationIdRef.current = id;
          },
          onStreamUpdate: (parsed) => setActiveSources(parsed.sources),
          onComplete: () => {
            // ── Invalidate cache so next open re-fetches the saved version ──
            const id = activeConversationIdRef.current;
            if (id) conversationCacheRef.current.delete(id);
            // Refresh sidebar thread list once
            loadConversations();
          },
          fileContent: filesToSend.filter((f) => !f.type?.startsWith('image/') && !f.type?.startsWith('video/')).map((f) => f.content).join("\n\n---\n\n"),
          attachedFiles: filesToSend,
        }
      );
    },
    [
      query,
      isLoading,
      selectedModel,
      getAccessToken,
      loadConversations,
      attachedFiles,
      fetchImagesForQuery,
      chatSubmit,
      activeConversationId,
    ]
  );

  // ── Jump to prompt ──
  const handleJumpToPrompt = useCallback((messageId: string | number) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // ── Delete conversation ──
  const deleteConversation = useCallback(
    async (id: string) => {
      if (!user) return;
      const token = await getAccessToken();
      if (!token) {
        console.warn('Cannot delete conversation: no access token');
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/conversations/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('Delete failed with status', res.status, body);
          throw new Error("Delete failed");
        }
        const conv = conversations.find((c) => c.id === id);
        const title = conv?.title ?? "Untitled conversation";
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) createNewThread();
        setToast({ conversationId: id, title });
        loadConversations();
      } catch (err) {
        console.error("Deletion error:", err);
      }
    },
    [user, getAccessToken, conversations, activeConversationId, createNewThread, loadConversations]
  );

  const handleDeleteFile = useCallback(async (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => {
    if (!activeConversationId) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`${BACKEND_URL}/conversations/${activeConversationId}/messages/${messageId}/files`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filename, type })
      });
      
      if (res.ok) {
        setMessages(prev => prev.map(m => {
          if (String(m.id) === String(messageId)) {
            return {
              ...m,
              [type]: ((m[type] as any[]) || []).filter(f => (f.name || f.filename) !== filename)
            };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  }, [activeConversationId, getAccessToken]);

  const undoDelete = useCallback(() => {
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
  }, [toast]);

  const TOAST_DURATION = 3500;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_DURATION);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Tab styling ──
  const tabClass = useCallback(
    (tab: string) =>
      `relative pb-2 text-sm font-medium transition-all duration-200 ${
        activeTab === tab
          ? "text-foreground scale-105 after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:h-[2px] after:w-4/5 after:bg-[var(--accent)] after:rounded-full"
          : "text-muted-foreground hover:text-foreground hover:scale-105"
      }`,
    [activeTab]
  );

  // ── Warm greeting for welcome screen ──
  const getGreeting = useCallback(() => {
    const hr = new Date().getHours();
    const firstName = user?.user_metadata?.first_name || user?.email?.split("@")[0] || "";
    const name = firstName
      ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
      : "";

    const greetings: Record<string, string[]> = {
      dawn: [
        "Up with the sun",
        "Early bird",
        "Cracking the dawn",
        "First light",
      ],
      morning: [
        "Bright morning",
        "Morning light",
        "Fresh start",
        "Clear headed",
      ],
      afternoon: [
        "Afternoon glow",
        "Midday stretch",
        "Golden hour approaches",
        "Second wind",
      ],
      evening: [
        "Evening calm",
        "Dusk settling in",
        "Twilight thinking",
        "Wind down",
      ],
      night: [
        "Late night",
        "Under the stars",
        "Quiet hours",
        "Night owl",
      ],
    };

    let pool: string[];
    if (hr >= 5 && hr < 8) pool = greetings.dawn;
    else if (hr >= 8 && hr < 12) pool = greetings.morning;
    else if (hr >= 12 && hr < 17) pool = greetings.afternoon;
    else if (hr >= 17 && hr < 21) pool = greetings.evening;
    else pool = greetings.night;

    // Deterministic "random" based on date so it changes daily
    const daySeed = new Date().toDateString();
    const idx = daySeed.length + daySeed.charCodeAt(daySeed.length - 1);
    const phrase = pool[idx % pool.length];

    return name ? `${phrase}, ${name}` : phrase;
  }, [user]);



  // ── Derived flags ──
  const hasStarted = messages.length > 0 || activeConversationId !== null;
  const placeholderText = hasStarted ? "Ask follow-up..." : "Ask anything ...";
  const showFixedInput = hasStarted && activeTab === "answer" && !isSearchModalOpen;

  // ── Loading state ──
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
        <Sidebar
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((p) => !p)}
          user={user}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onCreateThread={createNewThread}
          onSelectThread={openConversation}
          onDeleteThread={deleteConversation}
          onPrefetchThread={prefetchConversation}
          onArtifactsPrefetch={() => prefetchArtifacts(BACKEND_URL)}
          isDarkMode={isDark}
          toggleTheme={toggleTheme}
          onLogout={async () => {
            await supabase.auth.signOut();
            setUser(null);
            navigate("/auth");
          }}
          searchConversations={searchConversations}
          isSearchModalOpen={isSearchModalOpen}
          onSearchModalOpen={handleSearchModalOpen}
          onSearchModalClose={handleSearchModalClose}
          onSettingsOpen={handleSettingsOpen}
          onArtifactsOpen={() => setIsArtifactsOpen(true)}
          onNewsOpen={() => setIsNewsOpen(true)}
        />
      </AnimatePresence>

      <ArtifactsModal 
        isOpen={isArtifactsOpen}
        onClose={() => setIsArtifactsOpen(false)}
        onSelectConversation={openConversation}
        onPreview={handlePreview}
      />

      <NewsModal
        isOpen={isNewsOpen}
        onClose={() => setIsNewsOpen(false)}
        onReadArticle={(url) => {
          setPeekUrl(url);
          // Keep modal open or close? User said "side-by-side", so maybe keep it?
          // But usually, you close the modal to see the main page.
          // Let's close it so they can see the PeekPanel and the chat.
          setIsNewsOpen(false);
        }}
      />

      <main
        className={`relative flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-in-out ${
          isSidebarOpen ? "md:ml-[260px]" : "md:ml-0"
        } ${!isSidebarOpen ? 'px-[48px]' : ''}`}
      >
        {hasStarted && (
          <PromptHistoryCard
            messages={messages}
            onJumpToPrompt={handleJumpToPrompt}
          />
        )}
        <section className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--surface-border)] bg-[var(--bg-primary)]">
          {hasStarted && (
            <header className="flex items-center justify-center border-b border-[var(--surface-border)] px-4 py-2">
              <div className="flex items-center gap-6">
                <button type="button" onClick={() => setActiveTab("answer")} className={tabClass("answer")}>Answer</button>
                <button type="button" onClick={() => setActiveTab("links")} className={tabClass("links")}>
                  <Globe className="size-3 inline mr-1" /> Links
                </button>
                <button type="button" onClick={() => setActiveTab("images")} className={tabClass("images")}>
                  <Image className="size-3 inline mr-1" /> Images
                </button>
              </div>
            </header>
          )}

          {!hasStarted ? (
            <div className="flex-1 overflow-y-auto px-6 flex flex-col justify-start items-center pt-[26vh] pb-12 custom-scrollbar">
              <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
                {/* Claude-style warm greeting */}
                <div className="flex items-center justify-center gap-4 mb-8 select-none">
                  {/* Flux logo: mountain with rising sun/moon */}
                  <button
                    onClick={() => {
                      if (!logoRisen) {
                        setLogoRisen(true);
                        setTimeout(() => setLogoRisen(false), 1200);
                      }
                    }}
                    className="p-0 border-none bg-transparent cursor-pointer outline-none shrink-0"
                    title="Toggle dawn"
                  >
                    <svg className="size-9" viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
                      <path
                        d="M2 16C5 6 8 18 11 10S17 6 22 12 L22 24 L2 24 Z"
                        fill="var(--bg-primary)"
                      />
                      <motion.circle
                        cx="17"
                        r="2.8"
                        fill={new Date().getHours() >= 6 && new Date().getHours() < 18 ? "#cc785c" : "#faf9f5"}
                        initial={false}
                        animate={{
                          cy: logoRisen ? 1.5 : 11,
                          opacity: logoRisen ? 1 : 0,
                          scale: logoRisen ? 1 : 0.5,
                        }}
                        transition={{ type: "spring", stiffness: 180, damping: 16, mass: 0.8 }}
                      />
                      <motion.circle
                        cx="17"
                        r="5"
                        fill="none"
                        stroke="#cc785c"
                        strokeWidth="0.8"
                        initial={false}
                        animate={{
                          cy: logoRisen ? 1.5 : 11,
                          opacity: logoRisen ? 0.25 : 0,
                        }}
                        transition={{ type: "spring", stiffness: 180, damping: 16, mass: 0.8 }}
                      />
                      <path
                        d="M2 16C5 6 8 18 11 10S17 6 22 12"
                        fill="none"
                        stroke="#cc785c"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <h1 className="serif-display text-4xl md:text-[44px] text-[var(--text-primary)] leading-tight">
                    {getGreeting()}
                  </h1>
                </div>

                <div className="w-full">
                  <div className="border border-[var(--surface-border)] rounded-2xl shadow-xl backdrop-blur-sm">
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
                    />
                  </div>
                </div>
                <div className="mt-6 w-full">
                  <SuggestedActions onAction={handleSend} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
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
                  onFileClick={(file) => setPeekFile(file)}
                  onPreview={handlePreview}
                  showPromptHistory={hasStarted}
                  onJumpToPrompt={handleJumpToPrompt}
                  onFileDelete={handleDeleteFile}
                  activeGenerationStatus={activeGenerationStatus}
                />
              </div>
            </div>
          )}
        </section>

        {/* Fixed input bar */}
        {showFixedInput && hasStarted && (
          <motion.div
            layoutId="fixed-input"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`fixed bottom-0 z-50 pointer-events-none px-5
              bg-[var(--bg-primary)]
              transition-[left,right] duration-300`}
            style={{
              left: isSidebarOpen ? "290px" : "48px",
              right: isSidebarOpen ? "48px" : "48px",
            }}
          >
            <div className="w-full max-w-[700px] mx-auto pointer-events-auto">
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
              />
            </div>
            <InputSeparator />
          </motion.div>
        )}

        {/* PeekPanel supports URLs, PDF, DOCX, PPTX, XLSX, and MD data */}
        <PeekPanel
          url={peekUrl}
          onClose={() => {
            setPeekUrl(null);
            setPeekPdf(null);
            setPeekDocx(null);
            setPeekPptx(null);
            setPeekXlsx(null);
            setPeekMd(null);
          }}
          pdfData={peekPdf}
          docxData={peekDocx}
          pptxData={peekPptx}
          xlsxData={peekXlsx}
          mdData={peekMd}
        />

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
              initial={{ x: 100, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 100, opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-[#181715] border border-white/8 text-white rounded-lg px-4 py-2.5 shadow-xl"
            >
              <span className="text-sm text-stone-300">Thread deleted.</span>
              <button onClick={undoDelete} className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">Undo</button>
              <button onClick={() => setToast(null)} className="text-stone-500 hover:text-stone-300 transition-colors"><X className="size-3.5" /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Settings
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
        user={user}
        onUserUpdate={setUser}
        isDarkMode={isDark}
        toggleTheme={toggleTheme}
      />
    </div>
  );
}