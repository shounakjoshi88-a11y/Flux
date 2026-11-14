/**
 * ChatHeader — the bar shown above a running conversation.
 *
 * Extracted from `pages/Dashboard.tsx` (which had grown to ~1500 lines) so the
 * dashboard file owns state and orchestration while this module owns one
 * presentational concern: thread title + thread menu, the Answer/Links/Images
 * segmented tabs, and the Share button.
 *
 * Matched to claude.ai's measured header: 44px tall, no divider, the thread
 * title left-aligned right after the sidebar (14px/20px, weight 435, single
 * line with ellipsis) and a 28px Share button on the right.
 *
 * It is deliberately dumb: every piece of state and every handler is passed in,
 * so the dashboard keeps full control of behaviour and this file stays easy to
 * read and to test.
 *
 * Public API:
 *   <ChatHeader {...props} />
 */
import { IconChevronDown, IconCheck, IconCustomize, IconTrash, IconPanel } from "../layout/anthropicIcons";
import type { RefObject } from "react";
import type { ConversationListItem } from "@/types";

/** The three tabs the dashboard can show under a conversation. */
export type DashboardTab = "answer" | "links" | "images";

export interface ChatHeaderProps {
  /** Mobile renders a drawer button instead of the inline thread menu. */
  isMobile: boolean;
  onOpenMobileDrawer: () => void;

  /** Thread menu + rename state, owned by the dashboard. */
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  threadMenuRef: RefObject<HTMLDivElement | null>;
  threadMenuOpen: boolean;
  onToggleThreadMenu: () => void;
  onCloseThreadMenu: () => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameOpen: () => void;
  onCancelRename: () => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  onDeleteConversation: (id: string) => void;

  /** Segmented tabs. */
  activeTab: DashboardTab;
  onChangeTab: (tab: DashboardTab) => void;
  tabClass: (tab: DashboardTab) => string;

  /** Share. */
  onShare: () => void;
  shared: boolean;
}

export function ChatHeader({
  isMobile,
  onOpenMobileDrawer,
  conversations,
  activeConversationId,
  threadMenuRef,
  threadMenuOpen,
  onToggleThreadMenu,
  onCloseThreadMenu,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameOpen,
  onCancelRename,
  renameInputRef,
  onDeleteConversation,
  activeTab,
  onChangeTab,
  tabClass,
  onShare,
  shared,
}: ChatHeaderProps) {
  const title =
    conversations.find((c) => c.id === activeConversationId)?.title ||
    "Untitled Chat";

  return (
    <header className="flex h-11 items-center gap-3 px-5 bg-[var(--bg-primary)] shrink-0 w-full">
      {/* Left Column – Thread title + menu */}
      <div className="flex-1 flex items-center min-w-0">
        {isMobile && (
          <button
            onClick={onOpenMobileDrawer}
            className="flex size-7 items-center justify-center hover:bg-[var(--surface-bg)] rounded-[8px] text-muted-foreground hover:text-foreground shrink-0 mr-1"
          >
            <IconPanel className="size-[18px]" />
          </button>
        )}
        {!isMobile && (
          <div className="relative flex items-center min-w-0 max-w-full" ref={threadMenuRef}>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={onRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameSubmit();
                  if (e.key === "Escape") onCancelRename();
                }}
                className="text-[13px] font-[435] text-[var(--text-primary)] bg-[var(--surface-bg)] border border-[var(--accent)]/50 rounded-[6px] px-2 py-0.5 outline-none w-full max-w-[320px]"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={onToggleThreadMenu}
                className="flex items-center gap-1 min-w-0 max-w-full group rounded-[6px] px-1.5 py-1 -ml-1.5 hover:bg-[var(--surface-bg)] transition-colors"
              >
                <span className="text-[14px] leading-5 font-[435] text-[var(--text-primary)] truncate">
                  {title}
                </span>
                <IconChevronDown className="size-3 text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-secondary)] transition-colors" />
              </button>
            )}

            {/* Dropdown menu */}
            {threadMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-44 bg-[var(--user-msg-bg)] border border-[var(--surface-border)] rounded-[10px] shadow-xl z-50 py-1 overflow-hidden">
                <button
                  type="button"
                  onClick={onRenameOpen}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-[435] text-[var(--text-primary)]/80 hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <IconCustomize className="size-4 opacity-60" />
                  Rename
                </button>
                <div className="h-px bg-[var(--surface-border)] mx-2 my-0.5" />
                <button
                  type="button"
                  onClick={() => {
                    onCloseThreadMenu();
                    if (activeConversationId) onDeleteConversation(activeConversationId);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-[435] text-red-400 hover:bg-red-500/8 hover:text-red-300 transition-colors"
                >
                  <IconTrash className="size-4 opacity-70" />
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
          <button type="button" onClick={() => onChangeTab("answer")} className={tabClass("answer")}>Answer</button>
          <button type="button" onClick={() => onChangeTab("links")} className={tabClass("links")}>Links</button>
          <button type="button" onClick={() => onChangeTab("images")} className={tabClass("images")}>Images</button>
        </div>
      </div>

      {/* Right Column */}
      <div className="flex-1 flex items-center justify-end shrink-0">
        <button
          onClick={onShare}
          className="inline-flex h-7 items-center gap-1.5 px-3 rounded-[8px] border border-[var(--surface-border)] hover:bg-[var(--surface-bg)] text-[13px] leading-5 font-[435] text-[var(--text-primary)]/90 hover:text-[var(--text-primary)] transition"
          title="Share conversation"
        >
          {shared && <IconCheck className="size-3.5 text-emerald-400" />}
          <span>Share</span>
        </button>
      </div>
    </header>
  );
}
