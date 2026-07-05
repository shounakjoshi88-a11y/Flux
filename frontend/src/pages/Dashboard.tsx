// Dashboard.tsx – fully integrated with normal chat pipeline, PDF preview in PeekPanel
import { createClient } from "../lib/client";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import {
  Globe,
  Image,
  Check,
  LoaderCircle,
  X,
  FileText,
  Users,
  Bot,
  MoreVertical,
  Trash2,
  Share2,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useIsMobile } from "../hooks/useMediaQuery";

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
import { WikiGraph } from "../components/WikiGraph";
import { useChat } from "../hooks/useChat";
import { useAgentSession } from "../hooks/useAgentSession";
import { useModels } from "../hooks/useModels";
import { useCustomAgents } from "../hooks/useCustomAgents";
import AgentStatusBar from "../components/AgentStatusBar";
import TeamPanel from "../components/TeamPanel";
import CustomAgentsPanel from "../components/CustomAgentsPanel";
import { useTheme } from "../hooks/useTheme";
import { useSessionRevocationListener } from "../hooks/useSessionRevocationListener";
import { useSync } from "../hooks/useSync";
import type {
  ConversationListItem,
  Message,
  ConversationDetail,
  Source,
  AttachedFile,
  MessagePart,
} from "../types";
import { parseAssistantContent, extractLiveContent } from "../lib/chat-utils";
import { BACKEND_URL, SITE_URL, UNSPLASH_ACCESS_KEY } from "../lib/config";
import { Share as CapacitorShare } from "@capacitor/share";
import { conversationCache } from "../lib/conversation-cache";
import { useAdaptiveQuality } from "../hooks/useAdaptiveQuality";


const supabase = createClient();

function ThreadMenu({ isShared, onShare, onDelete }: { isShared: boolean; onShare: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-[var(--bg-primary)]/90 backdrop-blur-sm border border-[var(--surface-border)] text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] transition-all"
        style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, outline: 'none', boxSizing: 'border-box' }}
        title="More"
      >
        <MoreVertical className="size-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl glass-panel shadow-xl z-[60] overflow-hidden py-1">
          <button
            onClick={() => { onShare(); setOpen(false); }}
            className="flex items-center gap-3 w-full px-3.5 py-2.5 text-sm text-[var(--text-primary)]/80 hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition-all"
          >
            <Share2 className="size-4" />
            {isShared ? "Copied!" : "Share"}
          </button>
          <div className="mx-3 h-px bg-[var(--surface-border)]" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="flex items-center gap-3 w-full px-3.5 py-2.5 text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [avatarError, setAvatarError] = useState(false);
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
  useEffect(() => {
    if (activeConversationId) {
      const conv = conversations.find(c => c.id === activeConversationId);
      document.title = conv?.title ? `${conv.title} - Flux` : "Flux";
    } else {
      document.title = "New Chat - Flux";
    }
  }, [activeConversationId, conversations]);
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
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // Close sidebar by default on mobile after mount
  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false);
  }, [isMobile]);
  const [selectedModel, setSelectedModel] = useState<string>("deepseek-v4-pro");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const [peekPdf, setPeekPdf] = useState<{ base64: string; filename: string } | null>(null);
  const [peekDocx, setPeekDocx] = useState<{ html: string; filename: string } | null>(null);
  const [peekPptx, setPeekPptx] = useState<{ base64: string; filename: string } | null>(null);
  const [peekXlsx, setPeekXlsx] = useState<{ base64: string; filename: string } | null>(null);
  const [peekMd, setPeekMd] = useState<{ base64: string; filename: string } | null>(null);
  const [peekFile, setPeekFile] = useState<{ name: string; content: string } | null>(null);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState<string | null>(null);
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [isWikiOpen, setIsWikiOpen] = useState(false);
  const [toast, setToast] = useState<{ conversationId: string; title: string } | null>(null);
  const [activeImages, setActiveImages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"answer" | "links" | "images">("answer");
  const [shared, setShared] = useState(false);

  const handleShare = useCallback(async () => {
    const shareUrl = `${SITE_URL}${window.location.pathname}`;
    try {
      if (typeof CapacitorShare !== 'undefined' && CapacitorShare.share) {
        await CapacitorShare.share({ title: 'Flux AI', url: shareUrl });
      } else if (navigator.share) {
        await navigator.share({ title: 'Flux AI', url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch { /* user cancelled or not available */ }
  }, []);

  // ─── Search modal state ──────────────────────────────────
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const handleSearchModalOpen = useCallback(() => setIsSearchModalOpen(true), []);
  const handleSearchModalClose = useCallback(() => setIsSearchModalOpen(false), []);

  // ─── Settings state ─────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const handleSettingsOpen = useCallback(() => setIsSettingsOpen(true), []);
  const handleSettingsClose = useCallback(() => setIsSettingsOpen(false), []);

  // ─── Sync theme-color meta tag with dark/light mode ──────
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#181715" : "#faf9f5");
  }, [isDark]);

  // ─── Force logout listener ────────────────────────────────
  useSessionRevocationListener();

  const {
    messages: sseMessages,
    setMessages: setSseMessages,
    isLoading: sseLoading,
    handleSubmit: chatSubmit,
    resetMessages,
    retry,
    stop,
    activeGenerationStatus,
    deleteMessage: sseDeleteMessage,
    pendingCount,
    setQueueFlushCallback,
  } = useChat(user);
  const ws = useAgentSession(user);
  const { categories: modelCategories, all: allModels, isLoading: modelsLoading } = useModels();
  const { agents: customAgents, createAgent: createCustomAgent, deleteAgent: deleteCustomAgent } = useCustomAgents();
  const adaptive = useAdaptiveQuality();

  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isCustomAgentsOpen, setIsCustomAgentsOpen] = useState(false);
  const [activeTransport, setActiveTransport] = useState<"sse" | "ws">("sse");

// ── Auto-detect transport: try WS, fall back to SSE ──
  const wsAvailableRef = useRef(false);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  useEffect(() => {
    let cancelled = false;
    const tryWs = async () => {
      const instance = wsRef.current;
      try {
        instance.connect();
        // Wait up to 5s for WS to reach "ready"
        await new Promise<void>((resolve, reject) => {
          const check = setInterval(() => {
            if (cancelled) { clearInterval(check); reject(new Error("cancelled")); return; }
            if (instance.sessionState === "ready" || instance.sessionState === "processing") {
              clearInterval(check);
              wsAvailableRef.current = true;
              if (!cancelled) setActiveTransport("ws");
              resolve();
            }
          }, 200);
          setTimeout(() => { clearInterval(check); reject(new Error("timeout")); }, 5000);
        });
      } catch {
        wsAvailableRef.current = false;
        setActiveTransport("sse");
      }
    };
    tryWs();
    return () => { cancelled = true; };
  }, []);

  const messages = activeTransport === "ws" ? ws.messages : sseMessages;
  const setMessages = activeTransport === "ws" ? ws.setMessages : setSseMessages;
  const isLoading = activeTransport === "ws" ? ws.isLoading : sseLoading;
  const sessionState = ws.sessionState;

  const previousSidebarOpen = useRef(isSidebarOpen);

  const currentModelLabel = useMemo(
    () => (Array.isArray(allModels) ? allModels.find((m) => m.id === selectedModel)?.label : null) ?? "DeepSeek V4 Pro (DeepSeek)",
    [selectedModel, allModels]
  );

  // ── Auth & loading effects ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      (window as any).fluxLog?.("🔍 Dashboard bootstrapping: getUser()...");
      const timeout = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("getUser timed out")), 8000)
      );
      try {
        const { data, error } = await Promise.race([supabase.auth.getUser(), timeout]) as Awaited<ReturnType<typeof supabase.auth.getUser>>;
        if (cancelled) return;
        if (data?.user) {
          (window as any).fluxLog?.("✅ Dashboard: user found, userId=" + data.user.id.substring(0, 8));
          setUser(data.user);
        } else {
          (window as any).fluxLog?.("❌ Dashboard: no user, error=" + JSON.stringify(error));
          navigate("/auth");
        }
      } catch (e) {
        (window as any).fluxLog?.("💥 Dashboard: getUser error=" + String(e));
        if (!cancelled) navigate("/auth");
      } finally {
        if (!cancelled) { (window as any).fluxLog?.("📌 Dashboard: bootstrapping done"); setIsBootstrapping(false); }
      }
    })();
    return () => { cancelled = true; };
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

  const renderAvatar = (size: string = "size-7") => {
    const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || user?.identities?.[0]?.identity_data?.avatar_url || user?.identities?.[0]?.identity_data?.picture;
    if (avatarUrl && !avatarError) {
      return <img src={avatarUrl} alt="" className={`${size} rounded-full object-cover`} onError={() => setAvatarError(true)} />;
    }
    return <div className={`${size} rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-xs font-semibold uppercase text-foreground`}>{user?.email?.charAt(0) ?? "?"}</div>;
  };

  const createNewThread = useCallback(() => {
    resetMessages();
    if (ws && ws.clearMessages) ws.clearMessages();
    setActiveConversationId(null);
    setActiveSources([]);
    setActiveCitationIndex(null);
    setQuery("");
    setAttachedFiles([]);
    setActiveTab("answer");
    setActiveImages([]);
    setPeekPdf(null);
    setPeekUrl(null);
    navigate("/new", { replace: true });
  }, [resetMessages, ws, navigate]);

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
  const loadConversations = useCallback(async (forceRefresh?: boolean) => {
    if (!user) return;

    if (!forceRefresh && adaptive.cachePreference === 'cache-first') {
      const cached = await conversationCache.getConversations();
      if (cached && cached.length > 0) {
        setConversations(cached);
        try { localStorage.setItem("flux-conversations", JSON.stringify(cached)); } catch {}
        return;
      }
    }

    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`${BACKEND_URL}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { conversations: ConversationListItem[] };
    const list = data.conversations ?? [];
    setConversations(list);
    try { localStorage.setItem("flux-conversations", JSON.stringify(list)); } catch {}
    conversationCache.putConversations(list).catch(() => {});
  }, [user, getAccessToken, adaptive.cachePreference]);

  // ── Wire offline queue flush to refresh conversation list ────────────────
  useEffect(() => {
    setQueueFlushCallback(loadConversations);
    return () => setQueueFlushCallback(null);
  }, [loadConversations, setQueueFlushCallback]);

  // ── Cross-device sync ────────────────────────────────────────────────────
  useSync({
    onConversationCreated: () => loadConversations(true),
    onConversationDeleted: (id) => {
      if (activeConversationId === id) createNewThread();
      loadConversations(true);
    },
    onMessageCreated: (conversationId, messageId) => {
      if (activeConversationId === conversationId) {
        conversationCacheRef.current.delete(conversationId);
        openConversation(conversationId);
      }
      loadConversations(true);
    },
    onMessageDeleted: (conversationId, messageId) => {
      if (activeConversationId === conversationId) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    },
  });

  // ── Shared enrichment helper ──────────────────────────────────────────────
  const enrichConversationMessages = useCallback(
    (rawMessages: any[]): ConvCacheEntry => {
      const enriched = (rawMessages || []).map((msg) => {
        if (!msg) return msg;
        if (msg.role === "Assistant") {
          const storedSources = (msg as any).sources as Source[] | undefined;
          const storedFollowUps = (msg as any).followUps as string[] | undefined;
          const storedThoughtProcess = (msg as any).thoughtProcess as any[] | undefined;
          if (typeof msg.content !== "string") msg.content = "";
          const { answer, followUps: parsedFollowUps } = extractLiveContent(msg.content);
          const finalFollowUps =
            storedFollowUps && storedFollowUps.length > 0 ? storedFollowUps : parsedFollowUps;

          // Check localStorage for persisted parts first
          const storedParts = msg.id ? (() => { try { const p = localStorage.getItem(`flux-parts-${msg.id}`); return p ? JSON.parse(p) : null; } catch { return null; } })() : null;
          if (storedParts && Array.isArray(storedParts) && storedParts.length > 0) {
            (msg as any).parts = storedParts;
          } else if (!(msg as any).parts && Array.isArray(storedThoughtProcess) && storedThoughtProcess.length) {
            const parts: MessagePart[] = [];
            let lastTodosIdx = -1;
            for (let tpi = 0; tpi < storedThoughtProcess.length; tpi++) {
              const tp = storedThoughtProcess[tpi];
              if (!tp) continue;
              if (tp.type === "status") {
                const sub = tp.subtype as string;
                const isTerminal = sub.endsWith('_success') || sub.endsWith('_error') || sub.endsWith('_complete');
                
                // Map/merge sandbox status events into code_execution blocks
                if (sub.startsWith('sandbox_')) {
                  const isStart = sub === 'sandbox_start';
                  const lastCodeExec = [...parts].reverse().find(p => p.type === 'code_execution') as any;
                  
                  if (isStart) {
                    parts.push({
                      type: "code_execution",
                      block: {
                        code: tp.data?.command ?? tp.data?.code ?? "",
                        language: tp.data?.tool === "run_python" ? "python" : "bash",
                        outputLines: [],
                        isRunning: true,
                        generatedFiles: []
                      }
                    } as any);
                  } else {
                    if (lastCodeExec && lastCodeExec.block) {
                      lastCodeExec.block.isRunning = false;
                      lastCodeExec.block.exitCode = tp.data?.exitCode ?? (sub === 'sandbox_error' ? 1 : 0);
                      lastCodeExec.block.duration = tp.data?.duration;
                      if (tp.data?.stdout || tp.data?.stderr) {
                        lastCodeExec.block.outputLines = [
                          ...(tp.data.stdout ? tp.data.stdout.split('\n').map((line: string) => ({ type: 'stdout', content: line })) : []),
                          ...(tp.data.stderr ? tp.data.stderr.split('\n').map((line: string) => ({ type: 'stderr', content: line })) : [])
                        ];
                      }
                    } else {
                      parts.push({
                        type: "code_execution",
                        block: {
                          code: tp.data?.command ?? tp.data?.code ?? "",
                          language: tp.data?.tool === "run_python" ? "python" : "bash",
                          outputLines: [
                            ...(tp.data?.stdout ? tp.data.stdout.split('\n').map((line: string) => ({ type: 'stdout', content: line })) : []),
                            ...(tp.data?.stderr ? tp.data.stderr.split('\n').map((line: string) => ({ type: 'stderr', content: line })) : [])
                          ],
                          isRunning: false,
                          exitCode: tp.data?.exitCode,
                          duration: tp.data?.duration,
                          generatedFiles: []
                        }
                      } as any);
                    }
                  }
                  continue;
                }

                if (isTerminal) {
                  const baseSub = sub.replace(/_(?:success|error|complete)$/, '');
                  let idx = parts.findIndex(
                    p => p.type === 'tool_call' && p.name === baseSub
                  );
                  if (idx < 0) {
                    idx = parts.findIndex(
                      p => p.type === 'tool_call' && p.name === `${baseSub}_start`
                    );
                  }
                  if (idx >= 0) {
                    const existing = parts[idx] as any;
                    existing.status = sub.endsWith('_error') ? 'error' : 'completed';
                    existing.output = tp.message;
                    if (tp.data) {
                      existing.input = { ...existing.input, ...tp.data };
                    }
                  } else {
                    parts.push({
                      type: "tool_call",
                      name: baseSub,
                      input: tp.data || {},
                      output: tp.message || "",
                      status: sub.endsWith('_error') ? 'error' : 'completed',
                    });
                  }
                } else {
                  parts.push({
                    type: "tool_call",
                    name: sub,
                    input: tp.data || {},
                    output: tp.message || "",
                    status: "running",
                  });
                }
              } else if (tp.type === "thought" && tp.content?.trim()) {
                parts.push({ type: "thought", content: tp.content });
              } else if (tp.type === "todos" && tp.items?.length) {
                lastTodosIdx = parts.length;
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
            if (answer.trim()) {
              parts.push({ type: "text", text: answer });
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
      const conv = conversations.find(c => c.id === id);
      navigate(`/c/${conv?.slug || id}`, { replace: true });

      // ── 1. Serve instantly from conversationCache if available ────────────
      const cachedFromDb = await conversationCache.getMessages(id);
      if (cachedFromDb) {
        setMessages(cachedFromDb);
        const last = [...cachedFromDb].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
      }

      // ── 2. Serve instantly from in-memory cache if still fresh ────────────
      const cached = conversationCacheRef.current.get(id);
      if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) {
        setMessages(cached.enriched);
        const last = [...cached.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
        return;
      }

      // ── 3. Cache miss – show empty state immediately, fetch in background ──
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

      // ── 4. Store in both caches ───────────────────────────────────────────
      conversationCacheRef.current.set(id, entry);
      conversationCache.putMessages(id, entry.enriched).catch(() => {});

      // Only apply if the user hasn't navigated away while we were fetching
      if (activeConversationIdRef.current === id) {
        setMessages(entry.enriched);
        const last = [...entry.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
      }
    },
    [getAccessToken, setMessages, enrichConversationMessages, createNewThread]
  );

  // ── Open conversation from URL param ──
  const { slug } = useParams<{ slug: string }>();
  const slugHandled = useRef(false);
  useEffect(() => {
    if (slug && conversations.length > 0 && !slugHandled.current) {
      slugHandled.current = true;
      const match = conversations.find(c => c.slug === slug);
      if (match) openConversation(match.id);
      else navigate("/", { replace: true });
    }
  }, [slug, conversations, openConversation, navigate]);

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
      const isPdf = fileName.toLowerCase().endsWith('.pdf') || fileType.includes('pdf');
      const isDocx = fileName.toLowerCase().endsWith('.docx') || fileType.includes('wordprocessingml');
      const isBinaryFormatted = isPdf || isDocx;
      const isMedia = isImage || isVideo;
      const limit = (isMedia || isBinaryFormatted) ? 10 * 1024 * 1024 : 2 * 1024 * 1024;

      if (fileSize > limit) {
        alert(`File "${fileName}" exceeds the ${(isMedia || isBinaryFormatted) ? '10MB' : '2MB'} limit.`);
        continue;
      }
      
      try {
        if (isMedia || isBinaryFormatted) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          newFiles.push({ name: fileName, content: base64, type: isPdf ? 'application/pdf' : isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : fileType });
        } else {
          const rawText = await file.text();
          if (typeof rawText !== 'string' || rawText.includes("\0")) {
             alert(`File "${fileName}" is not a valid text-based file.`);
             continue;
          }
          newFiles.push({ name: fileName, content: rawText.slice(0, 200000), type: fileType || 'text/plain' });
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

  // ── HTML preview handler ────────────────────────────────
  const handleHtmlPreview = useCallback((html: string) => {
    setHtmlPreviewContent(html);
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

  // ── Slash command dispatch ──
  const dispatchSlashCommand = useCallback(
    (cmd: string, rest: string) => {
      switch (cmd) {
        case "/plan":
          ws.setMode("plan");
          ws.connect();
          setActiveTransport("ws");
          setTimeout(() => ws.sendMessage(rest || "(plan mode)", activeConversationId, selectedModel, []), 600);
          return true;
        case "/yolo":
          ws.setMode("yolo");
          ws.connect();
          setActiveTransport("ws");
          setTimeout(() => ws.sendMessage(rest || "(yolo mode)", activeConversationId, selectedModel, []), 600);
          return true;
        case "/team":
          setIsTeamPanelOpen(true);
          setActiveTransport("ws");
          if (rest) {
            ws.connect();
            setTimeout(() => ws.sendMessage(rest, activeConversationId, selectedModel, []), 600);
          }
          return true;
        default:
          return false;
      }
    },
    [ws, activeConversationId, selectedModel]
  );

  // ── Main send handler ──
  const handleSend = useCallback(
    (nextQuery?: string) => {
      const prompt = (nextQuery ?? query).trim();
      if (!prompt || isLoading) return;

      // Check for slash commands — always use WS
      const cmdMatch = prompt.match(/^\/(plan|yolo|team)\b\s*(.*)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1]!;
        const rest = (cmdMatch[2] || "").trim();
        setQuery("");
        dispatchSlashCommand(cmd, rest);
        return;
      }

      setQuery("");

      const filesToSend = [...attachedFiles];
      setAttachedFiles([]);
      fetchImagesForQuery(prompt);

      // Auto-detect transport: use WS if available, fall back to SSE
      if (wsAvailableRef.current) {
        ws.sendMessage(prompt, activeConversationId, selectedModel, filesToSend, {
          onNewConversationId: (id) => {
            setActiveConversationId(id);
            activeConversationIdRef.current = id;
          },
          onComplete: () => {
            const id = activeConversationIdRef.current;
            if (id) conversationCacheRef.current.delete(id);
            loadConversations(true);
          },
        });
      } else {
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
            onPermissionRequest: (request) => {
              console.log('[PERMISSION] Tool permission requested:', request);
            },
            onComplete: () => {
              const id = activeConversationIdRef.current;
              if (id) {
                conversationCacheRef.current.delete(id);
                if (sseMessages.length > 0) {
                  conversationCache.putMessages(id, sseMessages).catch(() => {});
                }
              }
              loadConversations(true);
            },
            fileContent: filesToSend.filter((f) => !f.type?.startsWith('image/') && !f.type?.startsWith('video/')).map((f) => f.content).join("\n\n---\n\n"),
            attachedFiles: filesToSend,
          }
        );
      }
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
      ws,
      dispatchSlashCommand,
    ]
  );

  // ── Stop / Retry (transport-aware) ──
  const handleStop = useCallback(() => {
    if (activeTransport === "ws") {
      ws.disconnect();
    } else {
      stop();
    }
  }, [activeTransport, ws, stop]);

  const handleRetry = useCallback((prompt?: string) => {
    retry(prompt);
  }, [retry]);

  const handleEdit = useCallback((messageId: string | number, newContent: string) => {
    setMessages((prev) => prev.map((m) =>
      String(m.id) === String(messageId) ? { ...m, content: newContent } : m
    ));
    retry(newContent);
  }, [retry, setMessages]);

  const handleDeleteMessage = useCallback((messageId: string | number) => {
    if (activeTransport === "ws") {
      ws.deleteMessage?.(messageId);
    } else {
      sseDeleteMessage(messageId);
    }
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx >= 0) {
      const msg = messages[idx]!;
      let pairedId: string | number | null = null;
      if (msg.role === 'User' && idx + 1 < messages.length && messages[idx + 1]?.role === 'Assistant') {
        pairedId = messages[idx + 1]!.id;
      } else if (msg.role === 'Assistant' && idx > 0 && messages[idx - 1]?.role === 'User') {
        pairedId = messages[idx - 1]!.id;
      }
      const remaining = messages.filter(m => m.id !== messageId && m.id !== pairedId);
      if (remaining.length === 0) {
        createNewThread();
      }
    }
  }, [activeTransport, ws, sseDeleteMessage, messages, createNewThread]);

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
        conversationCache.removeConversation(id).catch(() => {});
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

  // ── Warm greeting for welcome screen ──
  const getGreeting = useCallback(() => {
    const hr = new Date().getHours();
    const firstName = user?.user_metadata?.first_name || user?.email?.split("@")[0] || "";
    const name = firstName
      ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
      : "";

    const greetings = {
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

    let pool: string[] = greetings.afternoon;
    if (hr >= 5 && hr < 8) pool = greetings.dawn;
    else if (hr >= 8 && hr < 12) pool = greetings.morning;
    else if (hr >= 12 && hr < 17) pool = greetings.afternoon;
    else if (hr >= 17 && hr < 21) pool = greetings.evening;
    else pool = greetings.night;

    // Deterministic "random" based on date so it changes daily
    const daySeed = new Date().toDateString();
    const idx = daySeed.length + daySeed.charCodeAt(daySeed.length - 1);
    const phrase = pool[idx % pool.length];

    return name ? `${phrase} ${name}` : phrase;
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
  
    <div className="flex h-screen w-full main-container text-foreground overflow-hidden font-sans app-content" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}>
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
          onWikiOpen={() => setIsWikiOpen(true)}
          onNewsOpen={() => setIsNewsOpen(true)}
          onCustomAgentsOpen={() => setIsCustomAgentsOpen((p) => !p)}
          onTeamOpen={() => setIsTeamPanelOpen((p) => !p)}
        />
      </AnimatePresence>

      <ArtifactsModal 
        isOpen={isArtifactsOpen}
        onClose={() => setIsArtifactsOpen(false)}
        onSelectConversation={openConversation}
        onPreview={handlePreview}
      />

      <WikiGraph
        isOpen={isWikiOpen}
        onClose={() => setIsWikiOpen(false)}
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
          !isMobile && isSidebarOpen ? "md:ml-[260px]" : "md:ml-0"
        } ${!isMobile && !isSidebarOpen ? 'px-[48px]' : ''}`}
        style={{ minHeight: 0, height: '100%', paddingTop: isMobile ? 'var(--sat, 0px)' : undefined }}
      >
        <div className="fixed top-0 left-0 right-0 h-16 z-[1] pointer-events-none bg-gradient-to-b from-[var(--bg-primary)] to-transparent" />

        {hasStarted && (
          <header className="flex items-center justify-center px-2 md:px-4 py-2 md:py-2.5 relative z-10">
            {/* Floating glass bar — completely outside the chat card */}
            <div className="flex items-center justify-center w-full max-w-lg mx-auto bg-[var(--bg-primary)]/70 backdrop-blur-xl shadow-lg px-3 py-1.5 md:py-2 gap-2">
              {/* Account avatar inside header on mobile */}
              {isMobile && (
                <button type="button" onClick={() => setIsSidebarOpen(p => !p)} className="w-8 h-8 shrink-0" style={{ WebkitTapHighlightColor: "transparent" }} aria-label="Toggle sidebar">
                  {renderAvatar("size-8")}
                </button>
              )}

              {/* Pill with layoutId animation */}
              <div className="flex items-center gap-2 bg-[var(--surface-bg)]/60 border border-[var(--surface-border)] rounded-full p-0.5 w-auto mx-auto">
                {(["answer", "links", "images"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                    className="relative flex items-center justify-center gap-1.5 px-2 py-1.5 h-8 rounded-full text-[11px] md:text-xs font-medium z-10 transition-colors duration-200"
                  >
                    {activeTab === tab && (
                      <motion.div layoutId="tab-bg"
                        className="absolute inset-0 rounded-full bg-[var(--accent)]/70 backdrop-blur-sm ring-1 ring-[var(--accent)]/60"
                        transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {tab === "answer" ? (
                        <svg className="size-[17px] md:size-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 16C5 6 8 18 11 10S17 6 22 12" />
                        </svg>
                      ) : tab === "links" ? (
                        <Globe className="size-[17px] md:size-[20px]" />
                      ) : (
                        <Image className="size-[17px] md:size-[20px]" />
                      )}
                      <span className={`hidden sm:inline ${activeTab === tab ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/80"}`}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {/* 3-dot menu */}
              <ThreadMenu
                isShared={shared}
                onShare={handleShare}
                onDelete={() => {
                  if (activeConversationId) deleteConversation(activeConversationId);
                }}
              />
            </div>
          </header>
        )}

        {!isMobile && hasStarted && (
          <PromptHistoryCard
            messages={messages}
            onJumpToPrompt={handleJumpToPrompt}
          />
        )}
        <section className={`flex-1 flex flex-col transition-all duration-300 relative ${
          !hasStarted ? '' : 'bg-[var(--bg-primary)]'
        }`} style={{ minHeight: 0 }}>

          {!hasStarted ? (
            <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar relative" style={{ minHeight: 0 }}>
              {/* Account avatar on new chat screen - opens sidebar */}
              {isMobile && (
                <button type="button" onClick={() => setIsSidebarOpen(p => !p)}
                  className="absolute top-4 left-4 z-10"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  aria-label="Toggle sidebar"
                >
                  {renderAvatar("size-10")}
                </button>
              )}
              {/* Center greeting */}
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="flex flex-col items-center gap-1 select-none">
                  <svg className="size-16 md:size-20" viewBox="0 0 24 24" fill="none" stroke="#cc785c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 16C5 6 8 18 11 10S17 6 22 12" />
                  </svg>
                  <h1 className="serif-display text-3xl md:text-5xl text-white leading-tight mt-1 text-center">
                    {getGreeting()}
                  </h1>
                </div>
              </div>
              {/* Bottom: suggestions + chat input */}
              <div className="px-4 md:px-6 pb-[calc(1rem+var(--sab,0px))] md:pb-[calc(1.5rem+var(--sab,0px))] space-y-2 max-w-[740px] mx-auto w-full">
                <div className="border border-[var(--surface-border)] rounded-2xl shadow-xl relative z-10">
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
                    models={modelCategories}
                    currentModelLabel={currentModelLabel}
                    modelDropdownOpen={modelDropdownOpen}
                    setModelDropdownOpen={setModelDropdownOpen}
                    handleAttachFiles={handleAttachFiles}
                    onStop={handleStop}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col -mt-[60px] md:-mt-[72px] pt-[60px] md:pt-[72px]" style={{ minHeight: 0 }}>
              <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>

                {activeTransport === "ws" && (
                  <AgentStatusBar
                    sessionState={sessionState}
                    mode={ws.mode}
                    onModeChange={ws.setMode}
                    capabilities={ws.capabilities}
                  />
                )}
                <MessageList
                  messages={messages}
                  activeTab={activeTab}
                  activeSources={activeSources}
                  activeImages={activeImages}
                  isLoading={isLoading}
                  activeCitationIndex={activeCitationIndex}
                  setActiveCitationIndex={setActiveCitationIndex}
                  onFollowUpClick={(q) => setQuery(q)}
                  setPeekUrl={setPeekUrl}
                  onRetry={handleRetry}
                  onEdit={handleEdit}
                  onDelete={handleDeleteMessage}
                  onFileClick={(file) => setPeekFile(file)}
                  onPreview={handlePreview}
                  onHtmlPreview={handleHtmlPreview}
                  showPromptHistory={hasStarted}
                  onJumpToPrompt={handleJumpToPrompt}
                  onFileDelete={handleDeleteFile}
                  activeGenerationStatus={activeGenerationStatus}
                  conversationId={activeConversationId ?? undefined}
                />
              </div>
            </div>
          )}
        </section>

        {/* Fixed input bar */}
        {showFixedInput && hasStarted && (
          <motion.div
            layoutId="fixed-input"
            transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
            className={`fixed-input-wrapper fixed bottom-0 ${isMobile ? 'z-20' : 'z-50'} pointer-events-none px-5
              bg-[var(--bg-primary)]
              transition-[left,right] duration-300`}
            style={{
              left: isMobile ? "0px" : isSidebarOpen ? "290px" : "48px",
              right: isMobile ? "0px" : "48px",
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
                models={modelCategories}
                currentModelLabel={currentModelLabel}
                modelDropdownOpen={modelDropdownOpen}
                setModelDropdownOpen={setModelDropdownOpen}
                handleAttachFiles={handleAttachFiles}
                onStop={handleStop}
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

        <TeamPanel
          isOpen={isTeamPanelOpen}
          onClose={() => setIsTeamPanelOpen(false)}
          onStartTeam={(query) => {
            setActiveTransport("ws");
            ws.connect();
            // Use a small delay to let the session initialize
            setTimeout(() => ws.sendMessage(query, null, selectedModel, []), 600);
          }}
          isRunning={sessionState === "processing"}
        />

        <CustomAgentsPanel
          isOpen={isCustomAgentsOpen}
          onClose={() => setIsCustomAgentsOpen(false)}
          agents={customAgents}
          onCreateAgent={createCustomAgent}
          onDeleteAgent={deleteCustomAgent}
        />

        <AnimatePresence>
          {peekFile && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.7 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[480px] glass-panel z-50 shadow-2xl flex flex-col will-change-transform"
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
          {htmlPreviewContent && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.7 }}
              className="fixed top-0 right-0 h-full w-full sm:w-[600px] glass-panel z-50 shadow-2xl flex flex-col will-change-transform"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-orange-500" />
                  <span className="text-sm font-medium">HTML Preview</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const win = window.open("", "_blank");
                      if (win) { win.document.write(htmlPreviewContent); win.document.close(); }
                    }}
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
                    title="Open in new tab"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </button>
                  <button onClick={() => setHtmlPreviewContent(null)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-white">
                <iframe
                  srcDoc={htmlPreviewContent}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title="HTML Preview"
                />
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
              transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.6 }}
              className="fixed top-4 right-4 z-50 flex items-center gap-3 glass-panel-strong text-white rounded-lg px-4 py-2.5 shadow-xl will-change-transform"
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