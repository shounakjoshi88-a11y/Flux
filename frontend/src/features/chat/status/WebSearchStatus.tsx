/**
 * WebSearchStatus — the web-search trail.
 *
 * Extracted from `features/chat/StatusMessage.tsx`. Renders the four steps the
 * agent walks through when it searches the live web:
 *
 *   searching      -> "Searched the web"
 *   found_sources  -> the query, the result count and the source list
 *   reading        -> a transient "Reading N sources..." line
 *   extracting     -> "Extracting full content from top sources..."
 *   no_results     -> a warning row
 *
 * The source list is rendered once, on the `found_sources` row - Claude does the
 * same, so the reading step stays a status line.
 *
 * Returns `null` for any other subtype.
 */
import { StepRow } from "../ThoughtBlock";
import { ClockIcon, ExtractIcon, GlobeIcon, WarnIcon } from "../icons";
import { getDomain } from "./helpers";
import type { StatusBlockProps } from "./types";

const WEB_SEARCH_SUBTYPES = new Set([
  "searching",
  "found_sources",
  "reading",
  "extracting",
  "no_results",
]);


const SUBTYPES = new Set(["searching", "found_sources", "reading", "extracting", "no_results"]);


/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function WebSearchStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  onSourceClick,
  rightSlot,
  searchQuery,
  expanded = true,
}: StatusBlockProps) {
  if (!WEB_SEARCH_SUBTYPES.has(status.subtype)) return null;

  if (status.subtype === "searching") {
    return (
      <div className="py-2 min-w-0">
        <div className="flex items-center gap-1.5 w-full text-left select-none">
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">Searched the web</span>
          {rightSlot && <span className="ml-auto shrink-0">{rightSlot}</span>}
        </div>
      </div>
    );
  }

  if (status.subtype === "found_sources") {
    const sources: string[] = status.data?.sources ?? [];
    const titles: string[] = status.data?.titles ?? [];
    const query: string = status.data?.query ?? searchQuery ?? "";
    const count = sources.length;
    if (count === 0) return null;
    return (
      <StepRow
        rightSlot={
          <div className="flex items-center gap-2">
            {rightSlot}
            <span className="text-[11px] font-mono text-[var(--text-secondary)] font-semibold shrink-0 tabular-nums">{count} results</span>
          </div>
        }
        icon={<GlobeIcon cls="text-[var(--text-secondary)]" />}
        message={query || status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={false}
      >
        {expanded && (
          <div className="rounded-lg border border-[var(--surface-border)] overflow-hidden" style={{ background: "#0f0f0e" }}>
            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: "156px" }}>
              {sources.map((url, idx) => {
                const domain = getDomain(url);
                const title = titles[idx] || domain;
                return (
                  <button
                    key={`${url}-${idx}`}
                    onClick={() => onSourceClick?.(url)}
                    className="group w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-colors hover:bg-white/[0.025] border-b border-white/[0.05] last:border-b-0"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                      alt=""
                      className="size-4 rounded-sm shrink-0 opacity-75"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="flex-1 text-[12px] text-[var(--text-secondary)]/80 truncate min-w-0 group-hover:text-[var(--text-secondary)] transition-colors">
                      {title}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]/60 shrink-0 ml-2">{domain}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </StepRow>
    );
  }

  if (status.subtype === "reading") {
    // Claude shows the source list once, on the "Searched the web" row.
    // This row is a transient status, so it carries the message only.
    return (
      <StepRow
        rightSlot={rightSlot}
        icon={<ClockIcon className={`size-4 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`} />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  if (status.subtype === "extracting") {
    return (
      <StepRow
        rightSlot={rightSlot}
        icon={<ExtractIcon cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  // no_results
  return (
    <StepRow
      rightSlot={rightSlot}
      icon={<WarnIcon cls="text-[var(--text-secondary)]/60" />}
      message={status.message}
      isFirst={isFirst}
      isLast={isLast}
      pulse={false}
    />
  );
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const WebSearchStatus = Object.assign(WebSearchStatusComponent, { handles });
