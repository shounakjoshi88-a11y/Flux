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
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import "../../styles/dashboard.css";

import { Sidebar } from "../features/layout/Sidebar";
import { PeekPanel } from "../features/layout/PeekPanel";
import { ChatInput } from "../features/chat/ChatInput";
import { MessageList } from "../features/chat/MessageList";
import { SuggestedActions } from "../features/chat/SuggestedActions";
import { Settings } from "../features/settings/Settings";
import { PromptHistoryCard } from "../features/settings/PromptHistoryCard";
import { ArtifactsModal, prefetchArtifacts } from "../features/content/ArtifactsModal";
import { NewsModal } from "../features/content/NewsModal";
import { WikiGraph } from "../features/agent/WikiGraph";
import { useIsMobile } from "../hooks/useMediaQuery";
import { MobileBottomNav, MobileSidebarDrawer } from "../features/layout/MobileBottomNav";
import { MobileConversationList } from "../features/layout/MobileConversationList";
import { useChat } from "../hooks/useChat";
import { useAgentSession } from "../hooks/useAgentSession";
import { useModels } from "../hooks/useModels";
import { useCustomAgents } from "../hooks/useCustomAgents";
import AgentStatusBar from "../features/agent/AgentStatusBar";
import TeamPanel from "../features/agent/TeamPanel";
import CustomAgentsPanel from "../features/agent/CustomAgentsPanel";
import { useTheme } from "../hooks/useTheme";
import { slugifyFriendly } from "../utils/slugify";
import { getGreeting } from "../utils/greeting";
import { enrichConversationMessages, type ConvCacheEntry } from "../utils/enrichMessages";
import { readAttachedFiles } from "../utils/fileHandling";
import { fetchImagesForQuery as fetchImagesForQueryUtil } from "../utils/imageSearch";
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
import { BACKEND_URL, UNSPLASH_ACCESS_KEY } from "../lib/config";
import { conversationCache } from "../lib/conversation-cache";
import { useAdaptiveQuality } from "../hooks/useAdaptiveQuality";
import { usePerformance } from "../lib/performance-context";

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
  const supabase = useMemo(() => createClient(), []);
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
  const isMobile = useIsMobile();
  const [mobileScreen, setMobileScreen] = useState<"chat" | "history" | "search">("chat");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [isWikiOpen, setIsWikiOpen] = useState(false);
  const [toast, setToast] = useState<{ conversationId: string; title: string } | null>(null);
  const [activeImages, setActiveImages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"answer" | "links" | "images">("answer");
  const [shared, setShared] = useState(false);

  // ─── Thread title menu state/refs (handlers defined after getAccessToken) ───
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const threadMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close thread menu on outside click
  useEffect(() => {
    if (!threadMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (threadMenuRef.current && !threadMenuRef.current.contains(e.target as Node)) {
        setThreadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [threadMenuOpen]);

  // Focus rename input when it opens
  useEffect(() => {
    if (isRenaming) setTimeout(() => renameInputRef.current?.select(), 50);
  }, [isRenaming]);

  const handleShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Flux AI', url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch { /* user cancelled */ }
  }, []);

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
  const { isLow: isPerfLow } = usePerformance();

  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isCustomAgentsOpen, setIsCustomAgentsOpen] = useState(false);
  const [activeTransport, setActiveTransport] = useState<"sse" | "ws">("sse");
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 0 });

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

  // ─── Mobile: when "search" tab is tapped, open search modal ───
  useEffect(() => {
    if (isMobile && mobileScreen === "search") {
      setIsSearchModalOpen(true);
      setMobileScreen("chat");
    }
  }, [isMobile, mobileScreen]);

  const currentModelLabel = useMemo(
    () => (Array.isArray(allModels) ? allModels.find((m) => m.id === selectedModel)?.label : null) ?? "DeepSeek V4 Pro (DeepSeek)",
    [selectedModel, allModels]
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

  // ─── Rename handlers (after getAccessToken) ──────────────
  const handleRenameOpen = useCallback(() => {
    const conv = conversations.find(c => c.id === activeConversationId);
    setRenameValue(conv?.title || '');
    setThreadMenuOpen(false);
    setIsRenaming(true);
  }, [conversations, activeConversationId]);

  const handleRenameSubmit = useCallback(async () => {
    if (!activeConversationId || !renameValue.trim()) { setIsRenaming(false); return; }
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/conversations/${activeConversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (res.ok) {
        const { conversation: updated } = await res.json();
        setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, title: updated.title, slug: updated.slug } : c));
        document.title = `${updated.title} - Flux`;
      }
    } catch (err) { console.error('Rename failed:', err); }
    setIsRenaming(false);
  }, [activeConversationId, renameValue, getAccessToken]);

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

  // ── Debounced load conversations ──
  const loadConversationsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadConversations = useCallback(async (forceRefresh?: boolean) => {
    if (!user) return;

    // Debounce: cancel previous timer; schedule actual fetch 1s after last call
    if (loadConversationsTimerRef.current) {
      clearTimeout(loadConversationsTimerRef.current);
    }
    loadConversationsTimerRef.current = setTimeout(async () => {
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
    }, 1000);
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
        // Refresh active conversation to show new messages from other devices
        conversationCacheRef.current.delete(conversationId);
        openConversation(conversationId);
      }
      // Also refresh sidebar to update the conversation list order
      loadConversations(true);
    },
    onMessageDeleted: (conversationId, messageId) => {
      if (activeConversationId === conversationId) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    },
  });


  // ── Open conversation (instant from cache, network on miss) ───────────────
  const openConversation = useCallback(
    async (id: string) => {
      // ── 0. Update active state immediately so the sidebar highlights at once ──
      setActiveConversationId(id);
      setActiveCitationIndex(null);
      setActiveTab("answer");
      setActiveImages([]);
      const conv = conversations.find(c => c.id === id);
      if (conv?.slug) {
        navigate(`/c/${conv.slug}`, { replace: true });
      }

      // ── 1. Serve instantly from in-memory cache if still fresh ────────────
      const cached = conversationCacheRef.current.get(id);
      if (cached && Date.now() - cached.ts < CONV_CACHE_TTL) {
        setMessages(cached.enriched);
        const last = [...cached.enriched].reverse().find((m) => m.role === "Assistant");
        setActiveSources(last?.sources ?? []);
        return;
      }

      // ── 2. Try IndexedDB cache (instant for repeat visits on slow connections) ──
      const cachedMessages = await conversationCache.getMessages(id);
      if (cachedMessages && cachedMessages.length > 0) {
        const entry = enrichConversationMessages(cachedMessages);
        conversationCacheRef.current.set(id, entry);
        if (activeConversationIdRef.current === id) {
          setMessages(entry.enriched);
          const last = [...entry.enriched].reverse().find((m) => m.role === "Assistant");
          setActiveSources(last?.sources ?? []);
        }
      } else {
        setMessages([]);
      }

      // ── 3. Network fetch in background (always, to get freshest data) ─────
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
      if (!data?.conversation?.messages) {
        console.warn('Conversation data is empty or malformed', data);
        return;
      }

      // Update URL with the real slug from the server
      if (data.conversation.slug && activeConversationIdRef.current === id) {
        navigate(`/c/${data.conversation.slug}`, { replace: true });
      }

      const entry = enrichConversationMessages(data.conversation.messages);

      // ── 4. Store in both caches ──────────────────────────────────────────
      conversationCacheRef.current.set(id, entry);
      conversationCache.putMessages(id, data.conversation.messages).catch(() => {});

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
      if (match) {
        openConversation(match.id);
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
        // URL has a raw UUID (from a previous bug) — try to find by ID
        const idMatch = conversations.find(c => c.id === slug);
        if (idMatch) {
          navigate(`/c/${idMatch.slug}`, { replace: true });
          openConversation(idMatch.id);
        } else {
          // Fetch from backend directly
          openConversation(slug);
        }
      } else {
        navigate("/", { replace: true });
      }
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
        if (!data?.conversation?.messages) return;
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
    const newFiles = await readAttachedFiles(files);
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }, []);


  const fetchImagesForQuery = useCallback(async (q: string) => {
    const urls = await fetchImagesForQueryUtil(q);
    setActiveImages(urls);
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
          onNewConversationId: (id, slug) => {
            setActiveConversationId(id);
            activeConversationIdRef.current = id;
            if (slug) {
              navigate(`/c/${slug}`, { replace: true });
            }
          },
          onComplete: () => {
            const id = activeConversationIdRef.current;
            if (id) {
              conversationCacheRef.current.delete(id);
              if (ws.messages.length > 0) {
                conversationCache.putMessages(id, ws.messages).catch(() => {});
              }
            }
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
            onNewConversationId: (id, slug) => {
              setActiveConversationId(id);
              activeConversationIdRef.current = id;
              if (slug) {
                navigate(`/c/${slug}`, { replace: true });
              }
            },
            onStreamUpdate: (parsed) => setActiveSources(parsed.sources),
            onPermissionRequest: (request) => {
              console.log('[PERMISSION] Tool permission requested:', request);
            },
            onComplete: () => {
              const id = activeConversationIdRef.current;
              if (id) {
                conversationCacheRef.current.delete(id);
                const currentMsgs = activeTransport === "ws" ? ws.messages : sseMessages;
                if (currentMsgs.length > 0) {
                  conversationCache.putMessages(id, currentMsgs).catch(() => {});
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
    // Use the SSE transport for edit; if WS is active it'll automatically
    // be skipped (the edit goes through chatSubmit → SSE handleSubmit).
    const filesToSend = [...attachedFiles];
    chatSubmit(
      newContent,
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
        editMessageId: messageId,
        fileContent: "",
      }
    );
  }, [chatSubmit, activeConversationId, selectedModel, attachedFiles, loadConversations]);

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
        slug: toast.title ? slugifyFriendly(toast.title) : `restored-${Date.now()}`,
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
      `px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 cursor-pointer ${
        activeTab === tab
          ? "bg-[var(--user-msg-bg)] text-[var(--text-primary)] shadow-sm"
          : "text-[var(--text-secondary)]/70 hover:text-[var(--text-primary)]"
      }`,
    [activeTab]
  );




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
      {/* Desktop sidebar */}
      {!isMobile && (
        <>
          {isPerfLow ? (
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
          ) : (
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
          )}
        </>
      )}

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
        } ${!isMobile && !isSidebarOpen ? 'px-[48px]' : ''} ${isMobile ? 'pb-16' : ''}`}
        style={{ minHeight: 0, height: '100%' }}
      >
        {hasStarted && (
          <PromptHistoryCard
            messages={messages}
            onJumpToPrompt={handleJumpToPrompt}
            visibleRange={visibleRange}
          />
        )}
        <section className="flex-1 flex flex-col bg-[var(--bg-primary)]" style={{ minHeight: 0 }}>
          {hasStarted && (
            <header className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-2 bg-[var(--bg-primary)] shrink-0 min-h-[48px] w-full">
              {/* Left Column – Thread title + menu */}
              <div className="flex-1 flex items-center min-w-0">
                {isMobile && (
                  <button
                    onClick={() => setIsMobileDrawerOpen(true)}
                    className="p-1.5 hover:bg-[var(--surface-bg)] rounded-lg text-muted-foreground hover:text-foreground shrink-0 mr-1"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                  </button>
                )}
                {!isMobile && (
                  <div className="relative flex items-center min-w-0 max-w-[280px] lg:max-w-[380px]" ref={threadMenuRef}>
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setIsRenaming(false); }}
                        className="text-xs font-medium text-[var(--text-primary)] bg-[var(--surface-bg)] border border-[var(--accent)]/50 rounded px-2 py-0.5 outline-none w-full max-w-[260px]"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setThreadMenuOpen(o => !o)}
                        className="flex items-center gap-1 min-w-0 group rounded px-1.5 py-0.5 hover:bg-[var(--surface-bg)] transition-colors"
                      >
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {conversations.find(c => c.id === activeConversationId)?.title || 'Untitled Chat'}
                        </span>
                        <ChevronDown className="size-3 text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-secondary)] transition-colors" />
                      </button>
                    )}

                    {/* Dropdown menu */}
                    {threadMenuOpen && (
                      <div className="absolute top-full left-0 mt-1.5 w-44 bg-[var(--user-msg-bg)] border border-[var(--surface-border)] rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                        <button
                          type="button"
                          onClick={handleRenameOpen}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-primary)]/80 hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <Pencil className="size-3.5 opacity-60" />
                          Rename
                        </button>
                        <div className="h-px bg-[var(--surface-border)] mx-2 my-0.5" />
                        <button
                          type="button"
                          onClick={() => { setThreadMenuOpen(false); if (activeConversationId) deleteConversation(activeConversationId); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/8 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="size-3.5 opacity-70" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Center Column - Segmented Control Pill Tabs */}
              <div className="flex items-center justify-center shrink-0">
                <div className="flex items-center p-[3px] bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-full gap-0.5">
                  <button type="button" onClick={() => setActiveTab("answer")} className={tabClass("answer")}>Answer</button>
                  <button type="button" onClick={() => setActiveTab("links")} className={tabClass("links")}>Links</button>
                  <button type="button" onClick={() => setActiveTab("images")} className={tabClass("images")}>Images</button>
                </div>
              </div>

              {/* Right Column */}
              <div className="flex-1 flex items-center justify-end shrink-0">
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-[var(--surface-border)] hover:bg-[var(--surface-bg)] text-[var(--text-primary)]/80 hover:text-[var(--text-primary)] transition"
                  title="Share conversation"
                >
                  {shared && <Check className="size-3 text-emerald-400" />}
                  <span>Share</span>
                </button>
              </div>
            </header>
          )}

          {!hasStarted ? (
            <div className="flex-1 overflow-y-auto px-6 flex flex-col justify-start items-center pt-[30vh] pb-12 custom-scrollbar" style={{ minHeight: 0 }}>
              <div className={`w-full ${isMobile ? '' : 'max-w-[656px]'} mx-auto flex flex-col items-center`}>
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
                    <svg className="size-12 md:size-14" viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
                      <path
                        d="M2 16C5 6 8 18 11 10S17 6 22 12 L22 24 L2 24 Z"
                        fill="var(--bg-primary)"
                      />
                      <motion.circle
                        cx="17"
                        r="2.8"
                        fill={new Date().getHours() >= 6 && new Date().getHours() < 18 ? "var(--accent)" : "var(--text-primary)"}
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
                        stroke="var(--accent)"
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
                        stroke="var(--accent)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
<h1 className="serif-display text-[38px] leading-[47.5px] font-[300] text-[var(--text-primary)]">
                      {getGreeting(user)}
                  </h1>
                </div>

                <div className="w-full">
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
                    compact={isMobile}
                    hero
                  />
                </div>
                <div className="mt-6 w-full">
                  <SuggestedActions onAction={handleSend} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
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
                  onVisibleRangeChange={setVisibleRange}
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
              transition-[left,right] duration-300 ${
                isMobile ? 'pb-16' : ''
              }`}
            style={{
              left: !isMobile && isSidebarOpen ? "290px" : isMobile ? "0" : "48px",
              right: isMobile ? "0" : isSidebarOpen ? "48px" : "48px",
            }}
          >
            <div className={`mx-auto pointer-events-auto ${isMobile ? 'w-full' : 'w-full max-w-[768px]'}`}>
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
                compact={isMobile}
              />
            </div>
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

        {isPerfLow ? (
          peekFile && (
            <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/10 z-50 shadow-2xl flex flex-col">
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
            </div>
          )
        ) : (
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
        )}

        {isPerfLow ? (
          htmlPreviewContent && (
            <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/10 z-50 shadow-2xl flex flex-col">
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
            </div>
          )
        ) : (
          <AnimatePresence>
            {htmlPreviewContent && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/10 z-50 shadow-2xl flex flex-col"
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
        )}

        {isPerfLow ? (
          toast && (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-[#181715] border border-white/8 text-white rounded-lg px-4 py-2.5 shadow-xl">
              <span className="text-sm text-stone-300">Thread deleted.</span>
              <button onClick={undoDelete} className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors">Undo</button>
              <button onClick={() => setToast(null)} className="text-stone-500 hover:text-stone-300 transition-colors"><X className="size-3.5" /></button>
            </div>
          )
        ) : (
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
        )}
      </main>

      {/* Mobile history screen */}
      {isMobile && mobileScreen === "history" && (
        <MobileConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectThread={openConversation}
          onDeleteThread={deleteConversation}
          onNewChat={createNewThread}
          onClose={() => setMobileScreen("chat")}
        />
      )}

      {/* Mobile bottom nav */}
      {isMobile && (
        <>
          <MobileBottomNav
            activeScreen={mobileScreen}
            onScreenChange={setMobileScreen}
            hasStarted={hasStarted}
            onCreateThread={createNewThread}
          />
          <MobileSidebarDrawer
            isOpen={isMobileDrawerOpen}
            onClose={() => setIsMobileDrawerOpen(false)}
            onArtifactsOpen={() => setIsArtifactsOpen(true)}
            onWikiOpen={() => setIsWikiOpen(true)}
            onNewsOpen={() => setIsNewsOpen(true)}
            onCustomAgentsOpen={() => setIsCustomAgentsOpen((p) => !p)}
            onTeamOpen={() => setIsTeamPanelOpen((p) => !p)}
            onSettingsOpen={handleSettingsOpen}
            onLogout={async () => {
              await supabase.auth.signOut();
              setUser(null);
              navigate("/auth");
            }}
            isDarkMode={isDark}
            toggleTheme={toggleTheme}
            userEmail={user?.email}
          />
        </>
      )}

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
