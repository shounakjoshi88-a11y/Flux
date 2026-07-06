// src/components/Sidebar.tsx
import { AnimatePresence, motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  Search,
  PlusCircle,
  MessageSquare,
  BrainCircuit,
  Layers,
  Newspaper,
  Trash2,
  Loader2,
  X,
  CircleX,
  History,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useState, useRef, useEffect, memo, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { ConversationListItem } from "../types";
import { useIsMobile } from "../hooks/useMediaQuery";
import { usePerformance } from "../lib/performance-context";

type SidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  user: User | null;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onCreateThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onPrefetchThread?: (id: string) => void;
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

function formatSearchDate(dateString: string | null): string {
  if (!dateString) return "Older";
  const now = new Date();
  const date = new Date(dateString);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  return "Older";
}

// ─── The main content that lives inside the sidebar panel ────────────────────
type SidebarContentProps = {
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  user: User | null;
  onCreateThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onPrefetchThread?: (id: string) => void;
  onArtifactsOpen: () => void;
  onArtifactsPrefetch?: () => void;
  onWikiOpen: () => void;
  onNewsOpen: () => void;
  onSettingsOpen: () => void;
  onLogout: () => void;
  onToggle: () => void;
  onSearchModalOpen: () => void;
  isMobile: boolean;
};

const SidebarContent = memo(function SidebarContent({
  conversations,
  activeConversationId,
  user,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
  onPrefetchThread,
  onArtifactsOpen,
  onArtifactsPrefetch,
  onWikiOpen,
  onNewsOpen,
  onSettingsOpen,
  onLogout,
  onToggle,
  onSearchModalOpen,
  isMobile,
}: SidebarContentProps) {
  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tB - tA;
      }),
    [conversations]
  );

  // Avatar
  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.identities?.[0]?.identity_data?.avatar_url ||
    null;
  const [avatarError, setAvatarError] = useState(false);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Guest";

  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{
        background: "#111111",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* ── App title ──────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-5 shrink-0">
        <h1
          className="text-[2rem] font-bold text-white tracking-tight leading-none"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          Flux
        </h1>
      </div>

      {/* ── Primary navigation ─────────────────────────────────────── */}
      <nav className="px-4 space-y-1 shrink-0">
        {/* New chat — accent coloured */}
        <button
          type="button"
          onClick={() => {
            onCreateThread();
            if (isMobile) onToggle();
          }}
          className="flex items-center gap-3.5 w-full px-2.5 py-3 rounded-xl transition-colors hover:bg-white/5 active:bg-white/10 text-left"
        >
          <PlusCircle
            className="size-5.5 shrink-0"
            style={{ color: "#cc785c" }}
            strokeWidth={1.5}
          />
          <span
            className="text-[15px] font-medium"
            style={{ color: "#cc785c" }}
          >
            New chat
          </span>
        </button>


        {/* Artifacts */}
        <button
          type="button"
          onClick={onArtifactsOpen}
          onMouseEnter={onArtifactsPrefetch}
          className="flex items-center gap-3.5 w-full px-2.5 py-3 rounded-xl transition-colors hover:bg-white/5 active:bg-white/10 text-left"
        >
          <Layers
            className="size-5.5 shrink-0 text-white/85"
            strokeWidth={1.5}
          />
          <span className="text-[15px] font-normal text-white/80">Artifacts</span>
        </button>

        {/* Knowledge Graph */}
        <button
          type="button"
          onClick={onWikiOpen}
          className="flex items-center gap-3.5 w-full px-2.5 py-3 rounded-xl transition-colors hover:bg-white/5 active:bg-white/10 text-left"
        >
          <BrainCircuit
            className="size-5.5 shrink-0 text-white/85"
            strokeWidth={1.5}
          />
          <span className="text-[15px] font-normal text-white/80">Knowledge Graph</span>
        </button>

        {/* Live News */}
        <button
          type="button"
          onClick={onNewsOpen}
          className="flex items-center gap-3.5 w-full px-2.5 py-3 rounded-xl transition-colors hover:bg-white/5 active:bg-white/10 text-left"
        >
          <Newspaper
            className="size-5.5 shrink-0 text-white/85"
            strokeWidth={1.5}
          />
          <span className="text-[15px] font-normal text-white/80">Live News</span>
        </button>
      </nav>

      {/* ── Thin divider ───────────────────────────────────────────── */}
      <div
        className="mx-5 my-5 shrink-0"
        style={{ height: 1, background: "rgba(255,255,255,0.08)" }}
      />

      {/* ── Recents label ──────────────────────────────────────────── */}
      <div className="px-5 mb-2 shrink-0 flex items-center justify-between">
        <span
          className="text-[13px] font-semibold"
          style={{ color: "rgba(250,249,245,0.45)" }}
        >
          Recents
        </span>
        <button
          type="button"
          onClick={onSearchModalOpen}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5 text-white/40 hover:text-white/70"
          title="Search"
        >
          <Search className="size-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* ── Scrollable thread list ──────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-2 pb-4"
        style={{ minHeight: 0, scrollbarWidth: "none" }}
      >
        <style>{`.sidebar-no-scrollbar::-webkit-scrollbar{display:none}`}</style>
        {sorted.length === 0 ? (
          <p className="text-xs px-3 text-white/25 mt-2">No conversations yet.</p>
        ) : (
          sorted.map((conv) => (
            <ThreadItem
              key={conv.id}
              id={conv.id}
              title={conv.title ?? "Untitled"}
              isActive={activeConversationId === conv.id}
              onClick={() => {
                onSelectThread(conv.id);
                if (isMobile) onToggle();
              }}
              onDelete={() => onDeleteThread(conv.id)}
              onHover={onPrefetchThread ? () => onPrefetchThread(conv.id) : undefined}
            />
          ))
        )}
      </div>

      {/* ── Footer: avatar + name + settings gear ──────────────────── */}
      <div
        className="shrink-0 border-t flex items-center justify-between px-4 py-4"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar circle */}
          <div
            className="size-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="size-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span className="text-sm font-bold text-white/80">{initials}</span>
            )}
          </div>

          <span
            className="text-[14.5px] font-medium text-white/85 truncate"
          >
            {displayName}
          </span>
        </div>

        {/* Settings gear */}
        <button
          type="button"
          onClick={onSettingsOpen}
          className="size-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/6 text-white/40 hover:text-white/75 shrink-0"
          title="Settings"
        >
          <SettingsIcon className="size-4.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
});

// ─── Individual thread row ─────────────────────────────────────────────────
type ThreadItemProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onHover?: () => void;
};

const ThreadItem = memo(function ThreadItem({
  title,
  isActive,
  onClick,
  onDelete,
  onHover,
}: ThreadItemProps) {
  const [showDelete, setShowDelete] = useState(false);
  const didPrefetch = useRef(false);

  const handleMouseEnter = useCallback(() => {
    setShowDelete(true);
    if (!isActive && !didPrefetch.current && onHover) {
      didPrefetch.current = true;
      onHover();
    }
  }, [isActive, onHover]);

  const handleMouseLeave = useCallback(() => {
    setShowDelete(false);
    didPrefetch.current = false;
  }, []);

  return (
    <div
      className="group relative w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left px-3 py-3 pr-10 rounded-xl transition-colors text-[14.5px] leading-snug truncate
          ${isActive
            ? "bg-white/6 text-white font-medium"
            : "text-white/75 hover:text-white hover:bg-white/[0.04]"
          }`}
      >
        {title}
      </button>

      {/* Delete — only shows on hover */}
      <AnimatePresence>
        {showDelete && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── Main exported Sidebar wrapper ────────────────────────────────────────
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
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { isLow: isPerfLow } = usePerformance();

  // ── Swipe gesture (mobile) ──────────────────────────────────
  useEffect(() => {
    if (!isMobile) return;
    const THRESHOLD = 80;
    let startX = 0, startY = 0;

    const onStart = (e: TouchEvent) => {
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (dx > THRESHOLD && startX < 30 && !isOpen) onToggle();
      if (dx < -THRESHOLD && isOpen) onToggle();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [isMobile, isOpen, onToggle]);

  // ── Debounced search ────────────────────────────────────────
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
        const res = await fetch(
          `${(window as any).BACKEND_URL || "https://localhost:3001"}/search?q=${encodeURIComponent(search.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => { setSelectedIndex(-1); }, [search]);

  const closeSearchModal = useCallback(() => {
    onSearchModalClose();
    setSearch("");
    setSearchResults([]);
  }, [onSearchModalClose]);

  const modalResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return [...conversations].sort((a, b) => {
        const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tB - tA;
      });
    }
    if (searchLoading || searchResults.length === 0) {
      const tokens = q.split(/\s+/).filter(Boolean);
      return conversations
        .filter((c) => {
          const t = (c.title ?? "").toLowerCase();
          return tokens.some((tok) => t.includes(tok));
        })
        .sort((a, b) => {
          const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return tB - tA;
        });
    }
    return searchResults;
  }, [search, conversations, searchResults, searchLoading]);

  // ── Shared inner content props ──────────────────────────────
  const innerProps: SidebarContentProps = {
    conversations,
    activeConversationId,
    user,
    onCreateThread,
    onSelectThread,
    onDeleteThread,
    onPrefetchThread,
    onArtifactsOpen,
    onArtifactsPrefetch,
    onWikiOpen,
    onNewsOpen,
    onSettingsOpen,
    onLogout,
    onToggle,
    onSearchModalOpen,
    isMobile,
  };

  return (
    <>
      {/* ── Mobile drawer ──────────────────────────────────────── */}
      {isMobile ? (
        isPerfLow ? (
          isOpen && (
            <aside
              className="fixed inset-0 z-50 overflow-hidden"
            >
              <SidebarContent {...innerProps} />
            </aside>
          )
        ) : (
          <AnimatePresence>
            {isOpen && (
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
                className="fixed inset-0 z-50 overflow-hidden"
              >
                <SidebarContent {...innerProps} />
              </motion.aside>
            )}
          </AnimatePresence>
        )
      ) : (
        /* ── Desktop sidebar ─────────────────────────────────── */
        <aside
          className="fixed top-0 left-0 h-screen z-40 overflow-hidden"
          style={{
            width: isOpen ? 260 : 0,
            transition: "width 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "width",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ width: 260, height: "100%" }}>
            <SidebarContent {...innerProps} />
          </div>
        </aside>
      )}

      {/* ── Search modal (full-screen overlay) ─────────────────── */}
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
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: -8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-[680px] overflow-hidden flex flex-col rounded-2xl shadow-2xl"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input */}
              <div
                className="flex items-center gap-3 px-4 py-4"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Search className="size-4 text-white/35 shrink-0" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  type="text"
                  placeholder="Search conversations…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { closeSearchModal(); return; }
                    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, modalResults.length - 1)); }
                    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, -1)); }
                    if (e.key === "Enter" && selectedIndex >= 0 && modalResults[selectedIndex]) {
                      onSelectThread(modalResults[selectedIndex]!.id);
                      closeSearchModal();
                    }
                  }}
                  className="flex-1 bg-transparent outline-none text-[15px] text-white/90 placeholder:text-white/25 min-w-0"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  {searchLoading && <Loader2 className="size-4 animate-spin text-white/40" />}
                  {search && !searchLoading && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="p-1 rounded-md hover:bg-white/6 transition"
                    >
                      <CircleX className="size-4 text-white/35" />
                    </button>
                  )}
                  <div className="w-px h-4 bg-white/10 mx-0.5" />
                  <button
                    type="button"
                    onClick={closeSearchModal}
                    className="p-1.5 rounded-lg hover:bg-white/6 transition"
                  >
                    <X className="size-4 text-white/35" />
                  </button>
                </div>
              </div>

              {/* Results */}
              <div
                ref={modalScrollContainerRef}
                className="overflow-y-auto max-h-[52vh] py-1.5"
                style={{ scrollbarWidth: "none" }}
              >
                {modalResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2">
                    <History className="size-7 text-white/15" />
                    <p className="text-xs text-white/30">
                      {search.trim() ? "No results found" : "No conversations yet"}
                    </p>
                  </div>
                ) : (
                  modalResults.map((conv, index) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => {
                        onSelectThread(conv.id);
                        if (conv.messageId) {
                          setTimeout(() => {
                            const el = document.getElementById(`message-${conv.messageId}`);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }, 400);
                        }
                        closeSearchModal();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
                        ${index === selectedIndex ? "bg-white/6" : "hover:bg-white/[0.035]"}`}
                    >
                      <MessageSquare className="size-4 text-white/30 shrink-0" strokeWidth={1.5} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] text-white/80 truncate">
                          {conv.title ?? "Untitled"}
                        </p>
                        {conv.snippet && (
                          <p className="text-xs text-white/35 truncate mt-0.5">
                            {conv.snippet}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-white/30 shrink-0">
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