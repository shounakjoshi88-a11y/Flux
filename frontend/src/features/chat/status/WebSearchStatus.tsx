/**
 * WebSearchStatus — claude.ai's "Searched the web" disclosure.
 *
 * Matches the TurnStatus row on claude.ai: a 20px line reading "Searched the
 * web" with a caret at the trailing edge; expanding it opens a hairline-
 * divided card with one section per real step (the query line and the
 * favicon-ordered source list). Nothing cosmetic is rendered — every row
 * corresponds to an actual search/Tavily call made server-side.
 * the same data the Links tab and citation hover use — favicon via Google's
 * s2 endpoint, truncated title, mono domain on the right.
 *
 * Two consumers:
 *   - `SearchStepsGroup` (grouping consecutive search parts) renders ONE
 *     ToolRow + ToolPanel and `WebSearchSection` per part inside it.
 *   - `StatusMessage` dispatches here for a standalone `web_search`-family
 *     part, which renders its own ToolRow + ToolPanel via
 *     `WebSearchDisclosure`.
 *
 * Returns `null` for any other subtype.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ToolRow, ToolPanel, ToolSection, ToolSectionLine } from "../ToolActivity";
import { WarnIcon } from "../icons";
import { getDomain } from "./helpers";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["searching", "found_sources", "no_results"]);

/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

/** One section per search part (query / source list / transient line). */
export function WebSearchSection({
  status,
  searchQuery,
  isPartActive,
  onSourceClick,
}: {
  status: StatusBlockProps["status"];
  searchQuery?: string;
  /** True while this part is still streaming (drives "Searching…" text). */
  isPartActive?: boolean;
  onSourceClick?: (url: string | null) => void;
}) {
  const reduceMotion = useReducedMotion();

  if (status.subtype === "searching") {
    const query = (status.data?.query as string) || searchQuery || "";
    return (
      <ToolSectionLine>
        {isPartActive ? (
          <span className="inline-flex items-center gap-1.5">
            Searching “{query || "the web"}”
            <span className="inline-flex items-end gap-[3px] pb-[1px]" aria-hidden>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-[3px] rounded-full bg-[var(--text-secondary)]"
                  animate={reduceMotion ? undefined : { y: [0, -3.5, 0], opacity: [0.4, 1, 0.4] }}
                  transition={reduceMotion ? undefined : { duration: 0.9, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
                />
              ))}
            </span>
          </span>
        ) : query ? `Searched for “${query}”` : "Searched the web"}
      </ToolSectionLine>
    );
  }

  if (status.subtype === "found_sources") {
    const sources: string[] = status.data?.sources ?? [];
    const titles: string[] = status.data?.titles ?? [];
    const query: string = status.data?.query ?? searchQuery ?? "";
    const count = sources.length;
    if (count === 0) return null;
    // Rows stagger in when the results arrive — the "results just came in" beat.
    const rowDelay = (idx: number) => (reduceMotion ? 0 : Math.min(idx * 0.05, 0.45));
    return (
      <ToolSection>
        <motion.div
          className="mb-2 flex items-center justify-between gap-2"
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <div className="min-w-0 truncate text-[13px] leading-5 text-[var(--text-secondary)]">
            {query || status.message || "Results"}
          </div>
          <motion.span
            className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 22, delay: 0.12 }}
          >
            {count} result{count === 1 ? "" : "s"}
          </motion.span>
        </motion.div>
        <div
          className="overflow-hidden rounded-lg border border-white/[0.05]"
          style={{ transition: "border-color 0.3s ease" }}
        >
          <div className="custom-scrollbar max-h-[156px] overflow-y-auto">
            {sources.map((url, idx) => {
              const domain = getDomain(url);
              const title = titles[idx] || domain;
              return (
                <motion.button
                  key={`${url}-${idx}`}
                  initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1], delay: rowDelay(idx) }}
                  onClick={() => onSourceClick?.(url)}
                  className="group flex w-full items-center gap-2.5 border-b border-white/[0.04] px-3 py-[7px] text-left transition-colors last:border-b-0 hover:bg-white/[0.025]"
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                    alt=""
                    className="size-4 shrink-0 rounded-sm opacity-75"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]/85 transition-colors group-hover:text-[var(--text-secondary)]">
                    {title}
                  </span>
                  <span className="ml-2 shrink-0 font-mono text-[11px] text-[var(--text-muted)]/70">
                    {domain}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </ToolSection>
    );
  }

  if (status.subtype === "no_results") {
    return (
      <ToolSectionLine>
        <span className="flex items-center gap-1.5">
          <WarnIcon cls="size-3.5 text-amber-400/80" />
          {status.message || "No results found"}
        </span>
      </ToolSectionLine>
    );
  }

  return null;
}

/** Standalone (non-grouped) disclosure — same anatomy, one section. */
export function WebSearchDisclosure({
  status,
  isActive,
  onSourceClick,
  searchQuery,
}: StatusBlockProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-w-0">
      <ToolRow
        label="Searched the web"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        isActive={isActive}
      />
      <ToolPanel open={open}>
        <WebSearchSection status={status} searchQuery={searchQuery} isPartActive={isActive} onSourceClick={onSourceClick} />
      </ToolPanel>
    </div>
  );
}

/**
 * Back-compat export — a component carrying a static `.handles()` method,
 * which is what `StatusMessage` consumes (`WebSearchStatus.handles(subtype)`
 * + `<WebSearchStatus .../>`).
 */
function WebSearchStatusImpl(props: StatusBlockProps) {
  return <WebSearchDisclosure {...props} />;
}
export const WebSearchStatus = Object.assign(WebSearchStatusImpl, { handles });
