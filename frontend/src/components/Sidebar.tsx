// src/components/Sidebar.tsx
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Component,
  CircleX,
  Loader2,
  MessageSquare,
  History,
  X,
  Newspaper,
  Plus,
  ChevronsUpDown,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { SidebarThread } from "./SidebarThread";
import { useState, useRef, useEffect, memo, useCallback, useMemo } from "react";
import type { ConversationListItem } from "@/types";

type SidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  user: User | null;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onCreateThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onPrefetchThread?: (id: string) => void; // NEW – hover prefetch
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  searchConversations?: (query: string) => Promise<ConversationListItem[]>;
  isSearchModalOpen: boolean;
  onSearchModalOpen: () => void;
  onSearchModalClose: () => void;
  onSettingsOpen: () => void;
  onArtifactsOpen: () => void;
  onArtifactsPrefetch?: () => void;
  onNewsOpen: () => void;
};

// ─── Shared time grouping logic ──────────────────────────────
function getTimeGroup(date: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) return "Today";
  if (date >= yesterdayStart) return "Yesterday";

  const diffTime = todayStart.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 7) return "This Week";

  const weeks = Math.floor(diffDays / 7);
  if (weeks <= 4) return `${weeks} Week${weeks > 1 ? "s" : ""} Ago`;

  const months = Math.floor(diffDays / 30);
  if (months <= 11) return `${months} Month${months > 1 ? "s" : ""} Ago`;

  return "Older";
}

function formatSearchDate(dateString: string | null): string {
  if (!dateString) return "Older";
  return getTimeGroup(new Date(dateString));
}

type ListItem =
  | { type: "header"; label: string }
  | { type: "thread"; conversation: ConversationListItem };

export const Sidebar = memo(function Sidebar({
  isOpen,
  onToggle,
  user,
  conversations,
  activeConversationId,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
  onPrefetchThread,
  isDarkMode,
  toggleTheme,
  onLogout,
  searchConversations,
  isSearchModalOpen,
  onSearchModalOpen,
  onSearchModalClose,
  onSettingsOpen,
  onArtifactsOpen,
  onArtifactsPrefetch,
  onNewsOpen,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [avatarError, setAvatarError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [logoRisen, setLogoRisen] = useState(false);
  const isDay = new Date().getHours() >= 6 && new Date().getHours() < 18;
  const [gearSpinning, setGearSpinning] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // ─── Auto‑scroll refs & logic (SIDEBAR) ─────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const scrollHoverTimerRef = useRef<number | null>(null);

  const step = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const currentSpeed = speedRef.current;
    const target = targetSpeedRef.current;
    const newSpeed = currentSpeed + (target - currentSpeed) * 0.15;

    if (Math.abs(newSpeed) < 0.05 && Math.abs(target) < 0.05) {
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      animFrameRef.current = 0;
      return;
    }

    speedRef.current = newSpeed;
    const maxScroll = container.scrollHeight - container.clientHeight;
    container.scrollTop = Math.min(Math.max(container.scrollTop + newSpeed, 0), maxScroll);

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (isOpen) {
      animFrameRef.current = requestAnimationFrame(step);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [step, isOpen]);

  const handleThreadsMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const edgeThreshold = 0.3;
    const maxSpeed = 4.5;
    let newTarget = 0;

    if (y < height * edgeThreshold) {
      const fraction = 1 - y / (height * edgeThreshold);
      newTarget = -maxSpeed * fraction;
    } else if (y > height * (1 - edgeThreshold)) {
      const fraction = (y - height * (1 - edgeThreshold)) / (height * edgeThreshold);
      newTarget = maxSpeed * fraction;
    }

    targetSpeedRef.current = newTarget;

    if (animFrameRef.current === 0) {
      animFrameRef.current = requestAnimationFrame(step);
    }

    if (scrollHoverTimerRef.current !== null) {
      clearTimeout(scrollHoverTimerRef.current);
      scrollHoverTimerRef.current = null;
    }
  }, [step]);

  const handleThreadsMouseLeave = useCallback(() => {
    const decelerate = () => {
      const current = targetSpeedRef.current;
      if (Math.abs(current) < 0.1) {
        targetSpeedRef.current = 0;
        return;
      }
      targetSpeedRef.current = current * 0.85;
      scrollHoverTimerRef.current = window.setTimeout(decelerate, 16);
    };
    decelerate();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollHoverTimerRef.current !== null) {
        clearTimeout(scrollHoverTimerRef.current);
      }
    };
  }, []);

  // ─── Auto‑scroll refs & logic (MODAL) ──────────────────
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);
  const modalSpeedRef = useRef(0);
  const modalTargetSpeedRef = useRef(0);
  const modalAnimFrameRef = useRef<number>(0);
  const modalScrollHoverTimerRef = useRef<number | null>(null);

  const modalStep = useCallback(() => {
    const container = modalScrollContainerRef.current;
    if (!container) return;

    const currentSpeed = modalSpeedRef.current;
    const target = modalTargetSpeedRef.current;
    const newSpeed = currentSpeed + (target - currentSpeed) * 0.15;

    if (Math.abs(newSpeed) < 0.05 && Math.abs(target) < 0.05) {
      modalSpeedRef.current = 0;
      modalTargetSpeedRef.current = 0;
      modalAnimFrameRef.current = 0;
      return;
    }

    modalSpeedRef.current = newSpeed;
    const maxScroll = container.scrollHeight - container.clientHeight;
    container.scrollTop = Math.min(Math.max(container.scrollTop + newSpeed, 0), maxScroll);

    modalAnimFrameRef.current = requestAnimationFrame(modalStep);
  }, []);

  useEffect(() => {
    if (isSearchModalOpen) {
      modalAnimFrameRef.current = requestAnimationFrame(modalStep);
    }
    return () => {
      if (modalAnimFrameRef.current) {
        cancelAnimationFrame(modalAnimFrameRef.current);
        modalAnimFrameRef.current = 0;
      }
    };
  }, [modalStep, isSearchModalOpen]);

  const handleModalMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = modalScrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const edgeThreshold = 0.3;
    const maxSpeed = 4.5; let newTarget = 0;

    if (y < height * edgeThreshold) {
      const fraction = 1 - y / (height * edgeThreshold);
      newTarget = -maxSpeed * fraction;
    } else if (y > height * (1 - edgeThreshold)) {
      const fraction = (y - height * (1 - edgeThreshold)) / (height * edgeThreshold);
      newTarget = maxSpeed * fraction;
    }

    modalTargetSpeedRef.current = newTarget;

    if (modalAnimFrameRef.current === 0) {
      modalAnimFrameRef.current = requestAnimationFrame(modalStep);
    }

    if (modalScrollHoverTimerRef.current !== null) {
      clearTimeout(modalScrollHoverTimerRef.current);
      modalScrollHoverTimerRef.current = null;
    }
  }, [modalStep]);

  const handleModalMouseLeave = useCallback(() => {
    const decelerate = () => {
      const current = modalTargetSpeedRef.current;
      if (Math.abs(current) < 0.1) {
        modalTargetSpeedRef.current = 0;
        return;
      }
      modalTargetSpeedRef.current = current * 0.85;
      modalScrollHoverTimerRef.current = window.setTimeout(decelerate, 16);
    };
    decelerate();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollHoverTimerRef.current !== null) {
        clearTimeout(scrollHoverTimerRef.current);
      }
    };
  }, []);

  // ─── Other state and effects ──────────────────────────
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  useEffect(() => {
    setAvatarError(false);
  }, [user]);

  // ─── Debounced search logic ──────────────────────────
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const token = await (window as any).getAccessToken?.();
        const res = await fetch(`${(window as any).BACKEND_URL || 'http://localhost:3001'}/search?q=${encodeURIComponent(search.trim())}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => { setSelectedIndex(-1); }, [search]);

  // ─── Local open/close ──────────────────────────────────
  const openSearchModal = useCallback(() => {
    onSearchModalOpen();
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [onSearchModalOpen]);

  const closeSearchModal = useCallback(() => {
    onSearchModalClose();
    setSearch("");
    setSearchResults([]);
  }, [onSearchModalClose]);

  // ─── Filtering, sorting, and grouping ──────────────────
  const groupedItems = useMemo(() => {
    const source = Array.isArray(conversations) ? conversations : [];

    const sorted = [...source].sort((a, b) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });

    const items: ListItem[] = [];
    let lastGroup = "";

    for (const conv of sorted) {
      const group = conv.lastMessageAt
        ? getTimeGroup(new Date(conv.lastMessageAt))
        : "Older";

      if (group !== lastGroup) {
        items.push({ type: "header", label: group });
        lastGroup = group;
      }
      items.push({ type: "thread", conversation: conv });
    }

    return items;
  }, [conversations]);

  // ─── Modal results ────────────────────────────────────────
  const modalResults = useMemo(() => {
    const q = search.trim().toLowerCase();

    // No query: show all conversations sorted by recency
    if (!q) {
      return [...conversations].sort((a, b) => {
        const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tB - tA;
      });
    }

    // While backend is loading: instantly filter by title client-side as a placeholder
    if (searchLoading || searchResults.length === 0) {
      const tokens = q.split(/\s+/).filter(Boolean);
      const clientFiltered = conversations
        .filter(c => {
          const title = (c.title ?? "").toLowerCase();
          return tokens.every(t => title.includes(t)) || tokens.some(t => title.includes(t));
        })
        .sort((a, b) => {
          const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return tB - tA;
        });
      // If backend results came back, prefer those; otherwise show client filtered
      return searchResults.length > 0 ? searchResults : clientFiltered;
    }

    return searchResults;
  }, [search, conversations, searchResults, searchLoading]);

  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.identities?.[0]?.identity_data?.avatar_url ||
    user?.identities?.[0]?.identity_data?.picture;

  const userAvatar = useMemo(() => {
    if (avatarUrl && !avatarError) {
      return (
        <img
          src={avatarUrl}
          alt="avatar"
          className="size-8 rounded-full object-cover"
          onError={() => setAvatarError(true)}
        />
      );
    }
    return (
      <div className="size-8 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-sm font-semibold uppercase text-foreground">
        {user?.email?.charAt(0) ?? "?"}
      </div>
    );
  }, [avatarUrl, avatarError, user]);

  const handleSelectThread = useCallback((id: string) => {
    onSelectThread(id);
  }, [onSelectThread]);

  const handleDeleteThread = useCallback((id: string) => {
    onDeleteThread(id);
  }, [onDeleteThread]);

  // ─── Settings click handler with spinning animation ──
  const handleSettingsClick = useCallback(() => {
    setGearSpinning(true);
    setTimeout(() => {
      setGearSpinning(false);
      onSettingsOpen();
      setUserMenuOpen(false);
    }, 600);
  }, [onSettingsOpen]);

  return (
    <>
      {/* ─── Injected style to hide WebKit scrollbar ─── */}
      <style>{`.scrollbar-none::-webkit-scrollbar{display:none}`}</style>

      {/* ─── SIDEBAR ──────────────────────────── */}
      <motion.aside
        className={`
          fixed top-0 left-0 h-screen z-40 flex flex-col
          bg-sidebar text-sidebar-foreground
          border-r border-sidebar-border
          overflow-hidden
        `}
        animate={{ width: isOpen ? 260 : 48 }}
        transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.8 }}
        style={{ willChange: "width" }}
      >
        <div className="flex flex-col h-full py-3 w-full">
          {/* Top Row: Logo left, Search and Toggle right */}
          <div className="relative flex items-center mb-4 h-8 shrink-0 px-4 justify-between">
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2.5 select-none"
                >
                  {/* Flux logo: mountain with rising sun/moon */}
                  <button
                    onClick={() => {
                      if (!logoRisen) {
                        setLogoRisen(true);
                        setTimeout(() => setLogoRisen(false), 1200);
                      }
                    }}
                    className="p-0 border-none bg-transparent cursor-pointer outline-none"
                    title="Toggle dawn"
                  >
                    <svg className="size-5" viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
                      {/* Landmass (hides the sun when below) */}
                      <path
                        d="M2 16C5 6 8 18 11 10S17 6 22 12 L22 24 L2 24 Z"
                        fill="var(--sidebar)"
                      />
                      {/* Sun / Moon */}
                      <motion.circle
                        cx="17"
                        r="2.8"
                        fill={isDay ? "#cc785c" : "#faf9f5"}
                        initial={false}
                        animate={{
                          cy: logoRisen ? 1.5 : 11,
                          opacity: logoRisen ? 1 : 0,
                          scale: logoRisen ? 1 : 0.5,
                        }}
                        transition={{ type: "spring", stiffness: 180, damping: 16, mass: 0.8 }}
                      />
                      {/* Sun glow */}
                      {isDay && (
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
                      )}
                      {/* Mountain outline */}
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
                  <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
                    Flux
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`flex items-center gap-1 ${!isOpen ? 'absolute right-0 w-[48px] justify-center' : ''}`}>
              {isOpen && (
                <button
                  type="button"
                  onClick={openSearchModal}
                  className="p-1.5 hover:bg-sidebar-accent rounded-lg transition-all text-sidebar-foreground/50 hover:text-sidebar-foreground/90 cursor-pointer"
                  title="Search chats"
                >
                  <Search className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onToggle}
                className="p-1.5 hover:bg-sidebar-accent rounded-lg transition-all text-sidebar-foreground/50 hover:text-sidebar-foreground/90 cursor-pointer"
                aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
              >
                {isOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Core Actions Rail */}
          <div className="flex flex-col gap-1 shrink-0">
            {/* New Chat */}
            <button
              type="button"
              onClick={onCreateThread}
              className={`flex items-center h-9 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-all gap-2.5 cursor-pointer ${
                isOpen ? "w-[calc(100%-16px)] mx-2 px-2.5 justify-start" : "w-9 mx-1.5 px-0 justify-center"
              }`}
              title="New chat"
            >
              <span className="flex items-center justify-center size-6 rounded-full bg-white/[0.07] shrink-0">
                <Plus className="size-4" />
              </span>
              {isOpen && (
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                  New chat
                </span>
              )}
            </button>

            {/* Artifacts */}
            <button
              type="button"
              onClick={onArtifactsOpen}
              onMouseEnter={onArtifactsPrefetch}
              className={`flex items-center h-9 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-all gap-2.5 cursor-pointer ${
                isOpen ? "w-[calc(100%-16px)] mx-2 px-2.5 justify-start" : "w-9 mx-1.5 px-0 justify-center"
              }`}
              title="Artifacts"
            >
              <Component className="size-4 shrink-0" />
              {isOpen && (
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                  Artifacts
                </span>
              )}
            </button>

            {/* Live News */}
            <button
              type="button"
              onClick={onNewsOpen}
              className={`flex items-center h-9 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-all gap-2.5 cursor-pointer ${
                isOpen ? "w-[calc(100%-16px)] mx-2 px-2.5 justify-start" : "w-9 mx-1.5 px-0 justify-center"
              }`}
              title="Live News"
            >
              <Newspaper className="size-4 shrink-0" />
              {isOpen && (
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                  Live News
                </span>
              )}
            </button>
          </div>

          {/* Conversations List */}
          <AnimatePresence>
            {isOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-h-0 relative mt-4 flex flex-col"
              >
                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-sidebar to-transparent pointer-events-none z-10" />
                <div
                  ref={scrollContainerRef}
                  onMouseMove={handleThreadsMouseMove}
                  onMouseLeave={handleThreadsMouseLeave}
                  className="flex-1 overflow-y-auto space-y-0.5 scrollbar-none pb-10"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {groupedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 opacity-35">
                       <MessageSquare className="size-7 mb-2" />
                       <p className="text-[10px] font-bold uppercase tracking-wider">No chats yet</p>
                    </div>
                  ) : (
                    groupedItems.map((item, index) =>
                      item.type === "header" ? (
                        <div
                          key={`header-${item.label}-${index}`}
                          className="text-[10px] font-bold text-sidebar-foreground/35 uppercase tracking-widest pl-4 pt-5 pb-1 select-none font-sans"
                        >
                          {item.label}
                        </div>
                      ) : (
                        <div
                          key={item.conversation.id}
                        >
                          <SidebarThread
                            id={item.conversation.id}
                            title={item.conversation.title ?? "Untitled conversation"}
                            isActive={activeConversationId === item.conversation.id}
                            onClick={() => handleSelectThread(item.conversation.id)}
                            onDelete={() => handleDeleteThread(item.conversation.id)}
                            onHover={onPrefetchThread ? () => onPrefetchThread(item.conversation.id) : undefined}
                          />
                        </div>
                      )
                    )
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-sidebar to-transparent pointer-events-none z-10" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer: User Account — Claude-style minimal */}
          <div className="relative mt-auto border-t border-sidebar-border pt-3" ref={userMenuRef}>
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.12 }}
                  className={`absolute bottom-14 bg-sidebar border border-sidebar-border rounded-xl shadow-xl z-50 p-1 ${
                    isOpen ? "left-2 right-2" : "left-12 w-44"
                  }`}
                >
                  <button
                    type="button"
                    onClick={handleSettingsClick}
                    className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium hover:bg-sidebar-accent transition-all text-sidebar-foreground/70 hover:text-sidebar-foreground cursor-pointer"
                  >
                    <motion.div
                      animate={{ rotate: gearSpinning ? 360 : 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                      <SettingsIcon className="size-4" />
                    </motion.div>
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogout();
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium hover:bg-red-500/10 transition-all text-red-400/80 hover:text-red-400 mt-0.5 cursor-pointer"
                  >
                    <LogOut className="size-4" /> Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-label="User menu"
              className={`flex items-center rounded-lg hover:bg-sidebar-accent transition-all cursor-pointer ${
                isOpen ? "w-[calc(100%-16px)] mx-2 px-2.5 justify-start gap-2.5 py-2" : "w-9 mx-1.5 px-0 justify-center py-1.5"
              }`}
            >
              <span className="flex justify-center shrink-0">
                {userAvatar}
              </span>
              <AnimatePresence mode="wait">
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="truncate text-left flex-1 flex items-center justify-between pr-1"
                  >
                    <div className="truncate">
                      <p className="text-sm font-medium truncate text-sidebar-foreground leading-tight">
                        {user?.email?.split("@")[0]}
                      </p>
                    </div>
                    <ChevronsUpDown
                      className={`size-3 text-sidebar-foreground/40 transition-transform duration-200 ${
                        userMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ─── SEARCH MODAL ─── */}
      <AnimatePresence>
        {isSearchModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
            onClick={closeSearchModal}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: -8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-[720px] bg-[var(--bg-primary)]/95 backdrop-blur-2xl border border-[var(--surface-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input row */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--surface-border)]">
                <Search className="size-4 text-[var(--text-muted)] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search chats and projects"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { closeSearchModal(); return; }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedIndex(i => Math.min(i + 1, modalResults.length - 1));
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedIndex(i => Math.max(i - 1, -1));
                    }
                    if (e.key === 'Enter' && selectedIndex >= 0 && modalResults[selectedIndex]) {
                      const conv = modalResults[selectedIndex];
                      onSelectThread(conv.id);
                      closeSearchModal();
                    }
                  }}
                  className="flex-1 bg-transparent outline-none text-base text-[var(--text-primary)]/90 placeholder:text-[var(--text-muted)]/40 min-w-0"
                />
                
                {/* Right side of search bar: loader or clear + persistent close */}
                <div className="flex items-center gap-1 shrink-0">
                  {searchLoading && (
                    <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
                  )}
                  {search && !searchLoading && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="p-1 rounded-md hover:bg-[var(--surface-bg)] transition-colors"
                    >
                      <CircleX className="size-4 text-[var(--text-muted)]/60" />
                    </button>
                  )}
                  <div className="w-px h-4 bg-[var(--surface-border)] mx-1" />
                  <button
                    type="button"
                    onClick={closeSearchModal}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-bg)] transition-colors"
                    aria-label="Close search"
                  >
                    <X className="size-4 text-[var(--text-muted)]/60" />
                  </button>
                </div>
              </div>

              {/* Results list */}
              <div
                ref={modalScrollContainerRef}
                onMouseMove={handleModalMouseMove}
                onMouseLeave={handleModalMouseLeave}
                className="overflow-y-auto max-h-[520px] py-1.5 scrollbar-none"
                style={{ scrollbarWidth: "none" }}
              >
                {modalResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <History className="size-8 text-[var(--text-muted)]/20" />
                    <p className="text-xs text-[var(--text-muted)]/40">
                      {search.trim() ? "No results found" : "No conversations yet"}
                    </p>
                  </div>
                ) : (
                  modalResults.map((conv, index) => (
                    <button
                      key={conv.id}
                      onClick={() => {
                        onSelectThread(conv.id);
                        if (conv.messageId) {
                          setTimeout(() => {
                            const el = document.getElementById(`message-${conv.messageId}`);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 400);
                        }
                        closeSearchModal();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left group
                        ${index === selectedIndex
                          ? 'bg-[var(--surface-bg)]'
                          : 'hover:bg-[var(--surface-bg)]/60'
                        }`}
                    >
                      <MessageSquare className="size-4 text-[var(--text-muted)]/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-secondary)]/80 group-hover:text-[var(--text-primary)] truncate transition-colors">
                          {conv.title ?? "Untitled"}
                        </p>
                        {conv.snippet && (
                          <p className="text-xs text-[var(--text-muted)]/50 truncate mt-0.5 group-hover:text-[var(--text-secondary)]/70 transition-colors">
                            {conv.snippet}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]/40 shrink-0 group-hover:text-[var(--text-secondary)]/60 transition-colors">
                        {formatSearchDate(conv.lastMessageAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});