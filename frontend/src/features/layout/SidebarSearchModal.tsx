/**
 * SidebarSearchModal — the "search chats and projects" overlay.
 *
 * Extracted from `features/layout/Sidebar.tsx`, which carried the whole modal
 * twice: a plain version for the low-performance path and an animated version
 * wrapped in AnimatePresence. Both now share one component that picks the
 * variant internally and renders the body markup only once.
 *
 * Public API:
 *   <SidebarSearchModal {...props} />
 */
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquare } from "lucide-react";
import type { RefObject } from "react";
import { IconSearch, IconClose, IconHistory } from "./anthropicIcons";
import { formatSearchDate } from "./sidebar/timeGroups";
import type { ConversationListItem } from "@/types";

export interface SidebarSearchModalProps {
  /** Low-performance mode renders the overlay without animation. */
  isPerfLow: boolean;
  isOpen: boolean;
  onClose: () => void;

  /** Query state. */
  search: string;
  onSearchChange: (value: string) => void;
  searchLoading: boolean;

  /** Results and the keyboard-highlighted row. */
  results: ConversationListItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectThread: (id: string) => void;

  /** Refs wired by the parent. */
  inputRef: RefObject<HTMLInputElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onScrollMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onScrollMouseLeave: () => void;
}

export function SidebarSearchModal({
  isPerfLow,
  isOpen,
  onClose,
  search,
  onSearchChange,
  searchLoading,
  results,
  selectedIndex,
  onSelectIndex,
  onSelectThread,
  inputRef,
  scrollContainerRef,
  onScrollMouseMove,
  onScrollMouseLeave,
}: SidebarSearchModalProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onSelectIndex(Math.min(selectedIndex + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onSelectIndex(Math.max(selectedIndex - 1, -1));
    }
    if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      onSelectThread(results[selectedIndex].id);
      onClose();
    }
  };

  const body = (
    <>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--surface-border)]">
        <IconSearch className="size-4 text-[var(--text-muted)] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search chats and projects"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none text-base text-[var(--text-primary)]/90 placeholder:text-[var(--text-muted)]/40 min-w-0"
        />
        <div className="flex items-center gap-1 shrink-0">
          {searchLoading && <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />}
          {search && !searchLoading && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="p-1 rounded-md hover:bg-[var(--surface-bg)] transition-colors"
            >
              <IconClose className="size-4 text-[var(--text-muted)]/60" />
            </button>
          )}
          <div className="w-px h-4 bg-[var(--surface-border)] mx-1" />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-bg)] transition-colors"
            aria-label="Close search"
          >
            <IconClose className="size-4 text-[var(--text-muted)]/60" />
          </button>
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        onMouseMove={onScrollMouseMove}
        onMouseLeave={onScrollMouseLeave}
        className="overflow-y-auto max-h-[520px] py-1.5 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <IconHistory className="size-8 text-[var(--text-muted)]/20" />
            <p className="text-xs text-[var(--text-muted)]/40">
              {search.trim() ? "No results found" : "No conversations yet"}
            </p>
          </div>
        ) : (
          results.map((conv, index) => (
            <button
              key={conv.id}
              onClick={() => {
                onSelectThread(conv.id);
                if (conv.messageId) {
                  setTimeout(() => {
                    const el = document.getElementById(`message-${conv.messageId}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 400);
                }
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left group
                ${index === selectedIndex
                  ? "bg-[var(--surface-bg)]"
                  : "hover:bg-[var(--surface-bg)]/60"
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
    </>
  );

  if (isPerfLow) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50" />
        <div
          className="relative w-full max-w-[720px] bg-[var(--bg-primary)]/95 border border-[var(--surface-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {body}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-[720px] bg-[var(--bg-primary)]/95 backdrop-blur-2xl border border-[var(--surface-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
