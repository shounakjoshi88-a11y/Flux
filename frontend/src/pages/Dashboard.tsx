// Dashboard.tsx – fully integrated with normal chat pipeline, PDF preview in PeekPanel
import { createClient } from "../lib/client";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { LoaderCircle, FileText, Bot, Pencil } from "lucide-react";
import { IconCheck, IconChevronDown, IconClose, IconGlobe, IconImage, IconPeople, IconTrash } from "../features/layout/anthropicIcons";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import "../../styles/dashboard.css";

import { Sidebar } from "../features/layout/Sidebar";
import { PeekPanel } from "../features/layout/PeekPanel";
import { ChatInput } from "../features/chat/ChatInput";
import { ChatHeader } from "../features/dashboard/ChatHeader";
import { EmptyState } from "../features/dashboard/EmptyState";
import { SlideOverPanel } from "../features/dashboard/SlideOverPanel";
import { DeleteToast } from "../features/dashboard/DeleteToast";
import { MessageList, type MessageListHandle } from "../features/chat/MessageList";
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
import { useAccessToken } from "../hooks/useAccessToken";
import { useTransportAutoDetect } from "../hooks/useTransportAutoDetect";
import { useConversations } from "../hooks/useConversations";
import { useConversationActions } from "../hooks/useConversationActions";
import { usePeekPanelState, type PreviewPayload } from "../hooks/usePeekPanelState";
import { readAttachedFiles } from "../utils/fileHandling";
import { fetchImagesForQuery as fetchImagesForQueryUtil } from "../utils/imageSearch";
import { useSessionRevocationListener } from "../hooks/useSessionRevocationListener";
import { useSync } from "../hooks/useSync";
import type {
  Message,
  Source,
  AttachedFile,
} from "../types";
import { BACKEND_URL } from "../lib/config";
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
  // Cached-token accessor shared by every backend call on this page.
  const getAccessToken = useAccessToken(supabase);
  const [user, setUser] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>("nemotron-3-ultra-550b");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  // ─── Peek-panel state (URLs, documents, generated code, raw files) ───
  const {
    peekUrl, setPeekUrl,
    peekPdf, setPeekPdf,
    peekDocx, setPeekDocx,
    peekPptx, setPeekPptx,
    peekXlsx, setPeekXlsx,
    peekMd, setPeekMd,
    peekFile, setPeekFile,
    htmlPreviewContent, setHtmlPreviewContent,
    closeDocumentPeeks,
    handleHtmlPreview,
    handlePreview: previewArtifact,
  } = usePeekPanelState();
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false);
  const isMobile = useIsMobile();
  const [mobileScreen, setMobileScreen] = useState<"chat" | "history" | "search">("chat");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [isWikiOpen, setIsWikiOpen] = useState(false);
  const [activeImages, setActiveImages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"answer" | "links" | "images">("answer");
  const [shared, setShared] = useState(false);

  // ─── Thread title menu state/refs (handlers defined after getAccessToken) ───
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const threadMenuRef = useRef<HTMLDivElement>(null);

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
  // WS-vs-SSE auto-detection lives in its own hook (see hooks/useTransportAutoDetect).
  // Passing the streaming flag so the flip to WS never happens mid-stream.
  const { activeTransport, setActiveTransport, wsAvailableRef } = useTransportAutoDetect(ws, sseLoading || ws.isLoading);
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 0 });
  /** Imperative handle into MessageList for the prompt-history card's jump. */
  const messageListRef = useRef<MessageListHandle>(null);

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
    () => (Array.isArray(allModels) ? allModels.find((m) => m.id === selectedModel)?.label : null) ?? "Nemotron 3 Ultra 550B (NVIDIA)",
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
    const savedId = localStorage.getItem("flux-active-conversation");
    if (savedId && user) openConversationGuarded(savedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Conversation lifecycle: list, open, prefetch ──────────────────────────
  const {
    conversations, setConversations,
    activeConversationId, setActiveConversationId, activeConversationIdRef,
    conversationCacheRef,
    loadConversations, searchConversations,
    openConversation, prefetchConversation,
  } = useConversations({
    user, navigate, getAccessToken,
    setMessages, setActiveSources,
    setActiveCitationIndex, setActiveTab, setActiveImages,
    createNewThread,
    cachePreference: adaptive.cachePreference,
  });

  // Gate the DB-refresh behind isLoading: a fresh /flux_ask round advances the
  // optimistic messages while a fetch in openConversation would SET messages
  // from the DB to a partial record (the assistant message isn't persisted
  // yet) - wiping the streamed answer out of the UI the moment the answer is
  // about to land.
  const openConversationGuarded = useCallback(
    (id: string) => {
      if (isLoading) return; // streaming owns the UI until the stream ends
      openConversation(id);
    },
    [openConversation, isLoading],
  );

  // ── Conversation actions: rename, delete, undo toast ────────────────────
  const {
    isRenaming, renameValue, setRenameValue, renameInputRef,
    handleRenameOpen, handleRenameSubmit, cancelRename,
    deleteConversation, toast, undoDelete, dismissToast,
  } = useConversationActions({
    user, conversations, setConversations,
    activeConversationId, createNewThread,
    getAccessToken, loadConversations,
    closeThreadMenu: () => setThreadMenuOpen(false),
  });

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
        openConversationGuarded(conversationId);
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


  // ── Open conversation from URL param ──
  const { slug } = useParams<{ slug: string }>();
  const slugHandled = useRef(false);
  useEffect(() => {
    if (slug && conversations.length > 0 && !slugHandled.current) {
      slugHandled.current = true;
      const match = conversations.find(c => c.slug === slug);
      if (match) {
        openConversationGuarded(match.id);
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
        // URL has a raw UUID (from a previous bug) — try to find by ID
        const idMatch = conversations.find(c => c.id === slug);
        if (idMatch) {
          navigate(`/c/${idMatch.slug}`, { replace: true });
          openConversationGuarded(idMatch.id);
        } else {
          // Fetch from backend directly
          openConversationGuarded(slug);
        }
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [slug, conversations, openConversationGuarded, navigate]);

  // ── File handling ──
  const handleAttachFiles = useCallback(async (files: FileList | null) => {
    const newFiles = await readAttachedFiles(files);
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  }, []);


  const fetchImagesForQuery = useCallback(async (q: string) => {
    const urls = await fetchImagesForQueryUtil(q);
    setActiveImages(urls);
  }, []);

  // ── Artifact preview handler: show the document peek + close the modal ──
  const handlePreview = useCallback((data: PreviewPayload) => {
    previewArtifact(data);
    // Close artifacts modal to show preview side-by-side with chat
    setIsArtifactsOpen(false);
  }, [previewArtifact]);

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
  /** Synchronous guard against a double-click/double-submit within one frame
   *  (isLoading from state lags one render). Reset when the stream ends —
   *  and as a belt-and-braces, after 15s regardless, so a path that never
   *  flips isLoading can't wedge the composer permanently. */
  const sendInFlightRef = useRef(false);
  useEffect(() => {
    if (!isLoading) sendInFlightRef.current = false;
  }, [isLoading]);
  useEffect(() => {
    if (!sendInFlightRef.current) return;
    const t = setTimeout(() => { sendInFlightRef.current = false; }, 15_000);
    return () => clearTimeout(t);
  }, [isLoading]);

  const handleSend = useCallback(
    (nextQuery?: string) => {
      const prompt = (nextQuery ?? query).trim();
      if (!prompt || isLoading || sendInFlightRef.current) return;

      // Check for slash commands — always use WS
      const cmdMatch = prompt.match(/^\/(plan|yolo|team)\b\s*(.*)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1]!;
        const rest = (cmdMatch[2] || "").trim();
        setQuery("");
        dispatchSlashCommand(cmd, rest);
        return;
      }
      sendInFlightRef.current = true;

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
    messageListRef.current?.jumpToMessage(messageId);
  }, []);

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

  /* The desktop sidebar is rendered twice - once for the low-performance
     path and once inside an AnimatePresence - with identical props, so the
     props live in one object that both branches spread. */
  const sidebarProps = {
    isOpen: isSidebarOpen,
    onToggle: () => setIsSidebarOpen((p) => !p),
    user,
    conversations,
    activeConversationId,
    onCreateThread: createNewThread,
    onSelectThread: openConversationGuarded,
    onDeleteThread: deleteConversation,
    onRenameThread: (id?: string) => handleRenameOpen(id),
    onPrefetchThread: prefetchConversation,
    onArtifactsPrefetch: () => prefetchArtifacts(BACKEND_URL),
    isDarkMode: isDark,
    toggleTheme,
    onLogout: async () => {
      await supabase.auth.signOut();
      setUser(null);
      navigate("/auth");
    },
    searchConversations,
    isSearchModalOpen,
    onSearchModalOpen: handleSearchModalOpen,
    onSearchModalClose: handleSearchModalClose,
    onSettingsOpen: handleSettingsOpen,
    onArtifactsOpen: () => setIsArtifactsOpen(true),
    onWikiOpen: () => setIsWikiOpen(true),
    onNewsOpen: () => setIsNewsOpen(true),
    onCustomAgentsOpen: () => setIsCustomAgentsOpen((p) => !p),
    onTeamOpen: () => setIsTeamPanelOpen((p) => !p),
  };

  return (
    <div className="flex h-screen w-full main-container text-foreground overflow-hidden font-sans">
      {/* Desktop sidebar */}
      {!isMobile && (
        <>
          {isPerfLow ? (
            <Sidebar
              {...sidebarProps}
            />
          ) : (
            <AnimatePresence>
              <Sidebar
                {...sidebarProps}
              />
            </AnimatePresence>
          )}
        </>
      )}

      <ArtifactsModal 
        isOpen={isArtifactsOpen}
        onClose={() => setIsArtifactsOpen(false)}
        onSelectConversation={openConversationGuarded}
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
          !isMobile && isSidebarOpen ? "md:ml-[288px]" : "md:ml-0"
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
            <ChatHeader
              isMobile={isMobile}
              onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
              conversations={conversations}
              activeConversationId={activeConversationId}
              threadMenuRef={threadMenuRef}
              threadMenuOpen={threadMenuOpen}
              onToggleThreadMenu={() => setThreadMenuOpen((o) => !o)}
              onCloseThreadMenu={() => setThreadMenuOpen(false)}
              isRenaming={isRenaming}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameSubmit={handleRenameSubmit}
              onRenameOpen={handleRenameOpen}
              onCancelRename={cancelRename}
              renameInputRef={renameInputRef}
              onDeleteConversation={deleteConversation}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              tabClass={tabClass}
              onShare={handleShare}
              shared={shared}
            />
          )}

          {!hasStarted ? (
            <EmptyState
              isMobile={isMobile}
              user={user}
              logoRisen={logoRisen}
              onToggleLogo={() => {
                if (!logoRisen) {
                  setLogoRisen(true);
                  setTimeout(() => setLogoRisen(false), 1200);
                }
              }}
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
                  ref={messageListRef}
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
          onClose={closeDocumentPeeks}
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

        {peekFile && (
          <SlideOverPanel
            isPerfLow={isPerfLow}
            title={peekFile.name}
            icon={<FileText className="size-4 text-blue-500" />}
            widthClass="sm:w-[480px]"
            onClose={() => setPeekFile(null)}
          >
            <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80 leading-relaxed">
              {peekFile.content || "No content available."}
            </pre>
          </SlideOverPanel>
        )}


        {htmlPreviewContent && (
          <SlideOverPanel
            isPerfLow={isPerfLow}
            title="HTML Preview"
            icon={<IconGlobe className="size-4 text-orange-500" />}
            widthClass="sm:w-[600px]"
            headerClassName="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10 shrink-0"
            bodyClassName="flex-1 bg-white"
            onClose={() => setHtmlPreviewContent(null)}
            actions={
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
            }
          >
            <iframe
              srcDoc={htmlPreviewContent}
              className="w-full h-full border-none"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="HTML Preview"
            />
          </SlideOverPanel>
        )}


        {toast && (
          <DeleteToast
            isPerfLow={isPerfLow}
            onUndo={undoDelete}
            onDismiss={dismissToast}
          />
        )}

      </main>

      {/* Mobile history screen */}
      {isMobile && mobileScreen === "history" && (
        <MobileConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectThread={openConversationGuarded}
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
