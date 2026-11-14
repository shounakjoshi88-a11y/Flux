// src/components/Sidebar.tsx
import { AnimatePresence, motion } from "framer-motion";
import { SidebarSearchModal } from "./SidebarSearchModal";
import { formatSearchDate, getTimeGroup } from "./sidebar/timeGroups";
import { useEdgeAutoScroll } from "./sidebar/useEdgeAutoScroll";
import { BACKEND_URL } from "../../lib/config";
import { usePerformance } from "../../lib/performance-context";
import {
  LogOut,
  Settings as SettingsIcon,
  CircleX,
  Loader2,
  MessageSquare,
  History,
  X,
  ChevronDown,
} from "lucide-react";
import {
  IconPlus,
  IconSearch,
  IconArtifacts,
  IconGraph,
  IconGlobe,
  IconTerminal,
  IconPeople,
  IconGear,
  IconPanel,
  IconPanelOpen,
  IconGroupSort,
} from "./anthropicIcons";
import type { User } from "@supabase/supabase-js";
import { SidebarThread } from "./SidebarThread";
import { useState, useRef, useEffect, memo, useCallback, useMemo } from "react";
import type { ConversationListItem } from "../../types";

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
  onWikiOpen: () => void;
  onNewsOpen: () => void;
  onCustomAgentsOpen: () => void;
  onTeamOpen: () => void;
};

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
  onWikiOpen,
  onNewsOpen,
  onCustomAgentsOpen,
  onTeamOpen,
}: SidebarProps) {
  const { isLow: isPerfLow } = usePerformance();
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

  // Auto-scroll (thread list and search modal share one hook) --------------
  const threadsScroll = useEdgeAutoScroll(isOpen);
  const modalScroll = useEdgeAutoScroll(isSearchModalOpen);

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
        const res = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(search.trim())}`, {
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
        animate={{ width: isOpen ? 288 : 64 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ willChange: "width" }}
      >
        <div className="flex flex-col h-full py-3 px-2">
          {/* Top Header Area */}
          <div className="flex items-center justify-between mb-5 px-1 h-9">
            {isOpen ? (
              <div className="flex items-center gap-2 select-none">
                <svg className="size-5" viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
                  <path d="M2 16C5 6 8 18 11 10S17 6 22 12 L22 24 L2 24 Z" fill="var(--sidebar)" />
                  <path d="M2 16C5 6 8 18 11 10S17 6 22 12" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">Flux</span>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <svg className="size-5" viewBox="0 0 24 24">
                  <path d="M2 16C5 6 8 18 11 10S17 6 22 12" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div className={`flex items-center gap-0.5 ${!isOpen ? 'hidden' : ''}`}>
              <button
                type="button"
                onClick={openSearchModal}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/45 hover:text-sidebar-foreground/80 transition-colors cursor-pointer"
                title="Search chats"
              >
                <IconSearch className="size-[18px]" />
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/45 hover:text-sidebar-foreground/80 transition-colors cursor-pointer"
                aria-label="Close sidebar"
              >
                <IconPanel className="size-5" />
              </button>
            </div>
            {!isOpen && (
              <button
                type="button"
                onClick={onToggle}
                className="absolute right-0 top-3 p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/45 hover:text-sidebar-foreground/80 transition-colors cursor-pointer w-[64px] flex justify-center"
                aria-label="Open sidebar"
              >
                <IconPanelOpen className="size-5" />
              </button>
            )}
          </div>

          {/* Nav Section */}
          <div className="flex flex-col gap-px mb-4">
            {/* New Chat */}
            <button
              type="button"
              onClick={onCreateThread}
              className={`flex items-center h-8 rounded-lg transition-colors cursor-pointer gap-1 px-0.5
                hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="New chat"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconPlus className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">New</span>}
            </button>

            {/* Search */}
            <button
              type="button"
              onClick={openSearchModal}
              className={`flex items-center h-8 rounded-lg transition-colors cursor-pointer gap-1 px-0.5
                hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="Search chats"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconSearch className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">Search</span>}
            </button>

            {/* Artifacts */}
            <button
              type="button"
              onClick={onArtifactsOpen}
              onMouseEnter={onArtifactsPrefetch}
              className={`flex items-center h-8 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/75 hover:text-sidebar-foreground transition-colors gap-1 px-0.5 cursor-pointer
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="Artifacts"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconArtifacts className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">Artifacts</span>}
            </button>

            {/* Knowledge Graph */}
            <button
              type="button"
              onClick={onWikiOpen}
              className={`flex items-center h-8 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/75 hover:text-sidebar-foreground transition-colors gap-1 px-0.5 cursor-pointer
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="Knowledge Graph"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconGraph className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">Knowledge Graph</span>}
            </button>

            {/* Live News */}
            <button
              type="button"
              onClick={onNewsOpen}
              className={`flex items-center h-8 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/75 hover:text-sidebar-foreground transition-colors gap-1 px-0.5 cursor-pointer
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="Live News"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconGlobe className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">Live News</span>}
            </button>

            {/* Agents */}
            <button
              type="button"
              onClick={onCustomAgentsOpen}
              className={`flex items-center h-8 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/75 hover:text-sidebar-foreground transition-colors gap-1 px-0.5 cursor-pointer
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="Custom Agents"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconTerminal className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">Agents</span>}
            </button>

            {/* Team */}
            <button
              type="button"
              onClick={onTeamOpen}
              className={`flex items-center h-8 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/75 hover:text-sidebar-foreground transition-colors gap-1 px-0.5 cursor-pointer
                ${isOpen ? "w-full justify-start" : "w-8 mx-auto justify-center"}`}
              title="Team Mode"
            >
              <span className="flex size-7 shrink-0 items-center justify-center"><IconPeople className="size-5 shrink-0" /></span>
              {isOpen && <span className="text-[14px] leading-[21px] font-[435] whitespace-nowrap">Team</span>}
            </button>
          </div>

          {/* Conversations List */}
        {isOpen && (
          <div className="flex h-11 items-center justify-between px-2">
            <span className="text-[14px] leading-[21px] font-[435] text-sidebar-foreground/75">Chats and tasks</span>
            <button
              type="button"
              onClick={openSearchModal}
              className="rounded-md p-1 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground/80 transition cursor-pointer"
              title="Search chats"
            >
              <IconGroupSort className="size-4" />
            </button>
          </div>
        )}
          {isPerfLow ? (
            isOpen && (
              <div className="flex-1 relative mt-4 flex flex-col" style={{ minHeight: 0 }}>
                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-sidebar to-transparent pointer-events-none z-10" />
                <div
                  ref={threadsScroll.scrollContainerRef}
                  onMouseMove={threadsScroll.handleMouseMove}
                  onMouseLeave={threadsScroll.handleMouseLeave}
                  className="flex-1 overflow-y-auto space-y-0.5 sidebar-scroll pb-10"
                  style={{ minHeight: 0, scrollbarWidth: "none", msOverflowStyle: "none" }}
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
                          className="text-[12px] font-medium text-sidebar-foreground/40 pl-3 pt-5 pb-1.5 select-none"
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
              </div>
            )
          ) : (
            <AnimatePresence>
              {isOpen && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 relative mt-4 flex flex-col" style={{ minHeight: 0 }}
                >
                  <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-sidebar to-transparent pointer-events-none z-10" />
                  <div
                    ref={threadsScroll.scrollContainerRef}
                    onMouseMove={threadsScroll.handleMouseMove}
                    onMouseLeave={threadsScroll.handleMouseLeave}
                    className="flex-1 overflow-y-auto space-y-0.5 sidebar-scroll pb-10"
                    style={{ minHeight: 0, scrollbarWidth: "none", msOverflowStyle: "none" }}
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
                            className="text-[12px] font-medium text-sidebar-foreground/40 pl-3 pt-5 pb-1.5 select-none"
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
          )}

          {/* Footer: User Account — Claude-style minimal */}
          <div className="relative mt-auto border-t border-sidebar-border pt-3" ref={userMenuRef}>
            {isPerfLow ? (
              userMenuOpen && (
                <div className={`absolute bottom-14 bg-sidebar border border-sidebar-border rounded-xl shadow-xl z-50 p-1 ${
                  isOpen ? "left-2 right-2" : "left-12 w-44"
                }`}>
                  <button
                    type="button"
                    onClick={handleSettingsClick}
                    className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium hover:bg-sidebar-accent transition-all text-sidebar-foreground/70 hover:text-sidebar-foreground cursor-pointer"
                  >
                    <SettingsIcon className="size-4" />
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
                </div>
              )
            ) : (
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
            )}

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
              {isPerfLow ? (
                isOpen && (
                  <div className="truncate text-left flex-1 flex items-center justify-between pr-1">
                    <div className="truncate">
                      <p className="text-sm font-medium truncate text-sidebar-foreground leading-tight">
                        {user?.email?.split("@")[0]}
                      </p>
                    </div>
                    <IconGroupSort
                      className={`size-3 text-sidebar-foreground/40 transition-transform duration-200 ${
                        userMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                )
              ) : (
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
                      <IconGroupSort
                        className={`size-3 text-sidebar-foreground/40 transition-transform duration-200 ${
                          userMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </button>
          </div>
        </div>
      </motion.aside>

            <SidebarSearchModal
        isPerfLow={isPerfLow}
        isOpen={isSearchModalOpen}
        onClose={closeSearchModal}
        search={search}
        onSearchChange={setSearch}
        searchLoading={searchLoading}
        results={modalResults}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
        onSelectThread={onSelectThread}
        inputRef={searchInputRef}
        scrollContainerRef={modalScroll.scrollContainerRef}
        onScrollMouseMove={modalScroll.handleMouseMove}
        onScrollMouseLeave={modalScroll.handleMouseLeave}
      />
    </>
  );
});