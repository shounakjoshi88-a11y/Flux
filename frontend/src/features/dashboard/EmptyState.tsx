/**
 * EmptyState — the "new chat" screen.
 *
 * Extracted from `pages/Dashboard.tsx` so the dashboard file no longer owns the
 * hero layout. It is the claude.ai/new shape: a centred greeting with the Flux
 * mark, the hero composer (editor row on top, controls row underneath), and the
 * suggested-action chips.
 *
 * All composer state is owned by the dashboard and passed down; this module only
 * lays the screen out and forwards events.
 *
 * Public API:
 *   <EmptyState {...props} />
 */
import { motion } from "framer-motion";
import { ChatInput } from "@/features/chat/ChatInput";
import { SuggestedActions } from "@/features/chat/SuggestedActions";
import { getGreeting } from "@/utils/greeting";
import type { AttachedFile } from "@/types";
import type { User } from "@supabase/supabase-js";

/** Mirrors ChatInput's model list shape without importing its private type. */
export interface ModelOption {
  id: string;
  label: string;
}
export interface ModelCategoryGroup {
  category: string;
  models: ModelOption[];
}

export interface EmptyStateProps {
  isMobile: boolean;
  user: User | null;

  /** Logo dawn toggle. */
  logoRisen: boolean;
  onToggleLogo: () => void;

  /** Composer state, owned by the dashboard. */
  query: string;
  setQuery: (value: string) => void;
  onSend: (query?: string) => void;
  isLoading: boolean;
  placeholderText: string;
  attachedFiles: AttachedFile[];
  setAttachedFiles: (files: AttachedFile[]) => void;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  models: ModelCategoryGroup[];
  currentModelLabel: string;
  modelDropdownOpen: boolean;
  setModelDropdownOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  handleAttachFiles: (files: FileList | null) => Promise<void>;
  onStop: () => void;
  /** Composer web-search toggle — forwarded to ChatInput. */
  searchEnabled?: boolean;
  setSearchEnabled?: (value: boolean | ((prev: boolean) => boolean)) => void;
  /** Open Settings on a given tab, e.g. ("Customize", "Plugins"). */
  onRequestSettingsTab?: (tab: string, sub?: string) => void;
}

export function EmptyState({
  isMobile,
  user,
  logoRisen,
  onToggleLogo,
  query,
  setQuery,
  onSend,
  isLoading,
  placeholderText,
  attachedFiles,
  setAttachedFiles,
  selectedModel,
  setSelectedModel,
  models,
  currentModelLabel,
  modelDropdownOpen,
  setModelDropdownOpen,
  handleAttachFiles,
  onStop,
  searchEnabled,
  setSearchEnabled,
  onRequestSettingsTab,
}: EmptyStateProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6 flex flex-col justify-start items-center pt-[30vh] pb-12 custom-scrollbar" style={{ minHeight: 0 }}>
      <div className={`w-full ${isMobile ? "" : "max-w-[656px]"} mx-auto flex flex-col items-center`}>
        {/* Claude-style warm greeting */}
        <div className="flex items-center justify-center gap-4 mb-8 select-none">
          {/* Flux logo: mountain with rising sun/moon */}
          <button
            onClick={onToggleLogo}
            className="p-0 border-none bg-transparent cursor-pointer outline-none shrink-0"
            title="Toggle dawn"
          >
            <svg className="size-12 md:size-14" viewBox="0 0 24 24" style={{ overflow: "visible" }}>
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
            onSend={onSend}
            isLoading={isLoading}
            placeholderText={placeholderText}
            attachedFiles={attachedFiles}
            setAttachedFiles={setAttachedFiles}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            models={models}
            currentModelLabel={currentModelLabel}
            modelDropdownOpen={modelDropdownOpen}
            setModelDropdownOpen={setModelDropdownOpen}
            handleAttachFiles={handleAttachFiles}
            onStop={onStop}
            compact={isMobile}
            searchEnabled={searchEnabled}
            setSearchEnabled={setSearchEnabled}
            onRequestSettingsTab={onRequestSettingsTab}
            hero
          />
        </div>
        <div className="mt-6 w-full">
          <SuggestedActions onAction={onSend} />
        </div>
      </div>
    </div>
  );
}
