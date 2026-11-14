/**
 * Tool-activity primitives — claude.ai's disclosure rows, measured live (Nov 2026):
 *
 * Row: a 20px-tall (1lh) line with the label at 14px/20px weight 400 in the
 * primary text colour, an h20 caret at the trailing edge (12px anthropicon
 * glyph, -90° rotation — pointing right — while collapsed, 0° — down — when
 * open, translating 0.5px on y) and a stretched click target covering the
 * whole row (`after:absolute after:inset-0` in Claude's DOM, here `absolute
 * inset-0` on the button). Rows share full width with the chat column, have
 * an 8px radius and are muted until hovered.
 *
 * Panel: the expanded content is a rounded card with hairline dividers
 * between sections; each section pans a 16px horizontal inset. The panel
 * opens with an animated height (Claude uses a clip-path; an animated
 * height + overflow hidden produces the same reveal).
 *
 * These two
 * primitives power the three tool families that match claude.ai 1:1:
 *   - "Searched the web" (features/chat/SearchSteps.tsx + status/WebSearchStatus)
 *   - "Ran a command" / terminal (features/chat/GenericToolBlock.tsx + TerminalBlock)
 *   - "Thought for Ns" (features/chat/ThoughtBlock.tsx)
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconChevronDown } from "../layout/anthropicIcons";

/** 20px-tall caret button stretched across the row (Claude's row toggle). */
function RowCaret({ open, isActive }: { open: boolean; isActive?: boolean }) {
  if (isActive) {
    // While running, Claude shows an animated indicator instead of the caret
    return (
      <span className="inline-flex h-5 w-3 shrink-0 items-center justify-center" aria-hidden>
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)]/50" />
          <span className="relative size-2 rounded-full bg-[var(--accent)]/90" />
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-3 shrink-0 items-center justify-center" aria-hidden>
      <IconChevronDown
        className={`size-3 text-[var(--text-secondary)] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
      />
    </span>
  );
}

export interface ToolRowProps {
  /** Row label, e.g. "Searched the web" / "Ran a command" / "Thought for 31s". */
  label: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Renders the running indicator instead of the caret. */
  isActive?: boolean;
  /** Optional trailing badge rendered before the caret (e.g. "N results"). */
  rightSlot?: React.ReactNode;
  className?: string;
}

/**
 * One disclosure row — claude.ai's measured anatomy: 20px line, px-1.5, br8,
 * full-width stretched click overlay, 14px/20px label.
 */
export function ToolRow({ label, open, onToggle, isActive, rightSlot, className }: ToolRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`group/toolrow relative flex w-stretch items-center gap-1.5 rounded-[8px] py-0 pl-1.5 pr-1 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.05] select-none ${className ?? ""}`}
    >
      <span className="min-w-0 flex-1 truncate whitespace-nowrap py-[1px] text-[14px] leading-[20px] font-[400] text-[var(--text-primary)]">
        {label}
      </span>
      {rightSlot && <span className="shrink-0">{rightSlot}</span>}
      <span className="shrink-0 text-[var(--text-secondary)]">
        <RowCaret open={open} isActive={isActive} />
      </span>
    </button>
  );
}

/**
 * Expanded panel — claude.ai's card: rounded-xl, hairline dividers, animated
 * height reveal. Children should be `ToolSection`s.
 */
export function ToolPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="tool-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.8 }}
          className="overflow-hidden"
        >
          <div className="mt-1 overflow-hidden rounded-xl divide-y divide-white/[0.05] border border-white/[0.05] bg-[var(--bg-secondary)]/60">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One divided section inside the panel (claude.ai: px-4 py-2 / py-3). */
export function ToolSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 ${className ?? ""}`}>{children}</div>;
}

/** Muted one-liner used for transient steps ("Reading 3 sources…"). */
export function ToolSectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 text-[13px] leading-5 text-[var(--text-secondary)]">{children}</div>
  );
}

/** Hook: open state for a tool disclosure, defaulting to the given value. */
export function useToolDisclosure(defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  return { open, toggle: () => setOpen((v) => !v), setOpen };
}
