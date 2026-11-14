/**
 * WikiStatus — the knowledge-graph search step.
 *
 * Extracted from `features/chat/StatusMessage.tsx`. Lists the wiki articles
 * the agent matched while searching the knowledge graph.
 *
 * Returns `null` for any other subtype.
 */
import { StepRow, TimelineNode } from "../ThoughtBlock";
import { WikiIcon } from "../icons";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["wiki_search", "wiki_search_success", "wiki_search_error"]);

/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function WikiStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  onSourceClick,
  rightSlot,
}: StatusBlockProps) {
  if (!SUBTYPES.has(status.subtype)) return null;

  // ─── wiki_search ──────────────────────────────────────────────────────────
  if (status.subtype === "wiki_search" || status.subtype === "wiki_search_success" || status.subtype === "wiki_search_error") {
    const query: string = status.data?.query ?? "";
    const resultCount: number = status.data?.count ?? 0;
    const isSuccess = status.subtype === "wiki_search_success";
    const isError = status.subtype === "wiki_search_error";
    const isLoading = status.subtype === "wiki_search";

    return (
      <div className="flex gap-2.5">
        <TimelineNode
          icon={<WikiIcon cls={
            isLoading && isActive ? "text-[var(--accent)]"
              : isSuccess ? "text-emerald-400/70"
                : isError ? "text-red-400/70"
                  : "text-[var(--text-secondary)]/40"
          } />}
          isFirst={isFirst} isLast={isLast}
        />
        <div className="py-2 min-w-0 flex-1">
          <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">{status.message}</span>
          {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1">{rightSlot}</span>}

          {query && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] font-mono">
                <WikiIcon cls="size-3 text-[var(--text-muted)]" />
                <span className="truncate max-w-[220px]">{query}</span>
              </span>
              {isSuccess && resultCount > 0 && (
                <span className="text-[11px] text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/20 rounded px-1.5 py-0.5">
                  {resultCount} node{resultCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const WikiStatus = Object.assign(WikiStatusComponent, { handles });
