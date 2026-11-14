/**
 * FetchStatus — claude.ai's "Fetched: <page title>" row for URL reads.
 *
 * One disclosure row per read_url call:
 *   while fetching  — spinner + "Fetching <clean url>" (no caret, not expandable)
 *   after done      — real site favicon + "Fetched: <title>" + caret; expands
 *                     into a dark card with the favicon, page title and a clean
 *                     protocol-less link + domain + external-link icon.
 *
 * The backend emits two `reading` status events per call (start with
 * { url, phase: 'fetching' }, then on completion { url, title, kb, phase:
 * 'fetched' | 'error' }); PartsRenderer/enrichMessages collapse the pair into
 * the latest event per URL, so exactly one row renders per fetch.
 */
import { useState } from "react";
import { IconChevronDown } from "../../layout/anthropicIcons.tsx";

import { SpinnerIcon } from "../ThoughtBlock";
import { LinkIcon, WarnIcon } from "../icons";
import { ToolPanel, ToolSection } from "../ToolActivity";
import { Favicon } from "../Favicon";
import { cleanUrl } from "../../../utils/linkify";
import { getDomain } from "../../../lib/chat-utils";
import type { StatusBlockProps } from "./types";

export function FetchStatus({
  status,
  isActive,
  rightSlot,
}: StatusBlockProps) {
  const [open, setOpen] = useState(true);

  const data = (status.data as Record<string, unknown> | undefined) ?? {};
  const url = typeof data.url === "string" ? data.url : "";
  const title = typeof data.title === "string" ? data.title : undefined;
  const phase = data.phase as "fetching" | "fetched" | "error" | undefined;
  const kb = typeof data.kb === "number" ? data.kb : undefined;

  // Legacy rows (persisted before phases existed) carry only { url } — the
  // fetch already happened, so render them as done with the clean URL.
  const isError = phase === "error";
  const isDone = !isError && (phase === "fetched" || (!phase && !!url) || (!isActive && !phase));
  const isFetching = !isDone && !isError;

  const clean = cleanUrl(url);
  const domain = url ? getDomain(url) : "";
  // Only a real page title (or PDF filename) makes a distinct heading —
  // without one, show "Fetched: <host>" and keep the card to a single line.
  const hasTitle = typeof title === "string" && title.trim().length > 0;
  const label = isFetching
    ? (typeof status.message === "string" && status.message.startsWith("Parsing")
        ? status.message
        : `Fetching ${clean || "content"}`)
    : isError
      ? `Couldn't fetch ${clean || "page"}`
      : `Fetched: ${hasTitle ? title : clean}`;

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-[3px] pl-1 min-w-0">
        <WarnIcon cls="size-3.5 shrink-0 text-amber-400/70" />
        <span className="truncate text-[13px] leading-[18px] text-[var(--text-secondary)]">{label}</span>
        {rightSlot && <span className="shrink-0 ml-auto">{rightSlot}</span>}
      </div>
    );
  }

  if (isFetching) {
    return (
      <div className="flex items-center gap-2 py-[3px] pl-1 min-w-0">
        <SpinnerIcon cls="text-[var(--accent)]" />
        <span className="truncate text-[13px] leading-[18px] text-[var(--text-secondary)]">{label}</span>
        {rightSlot && <span className="shrink-0 ml-auto">{rightSlot}</span>}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group/fetchrow flex w-stretch items-center gap-2 rounded-[8px] py-[3px] pl-1 pr-1 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.05] select-none"
      >
        <Favicon url={url} className="transition-opacity group-hover/fetchrow:opacity-90" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] leading-[18px] text-[var(--text-secondary)] transition-colors group-hover/fetchrow:text-[var(--text-primary)]">
          {label}
        </span>
        {kb != null && (
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]/80">
            {kb} KB
          </span>
        )}
        {rightSlot && <span className="shrink-0">{rightSlot}</span>}
        <span className="inline-flex h-4 w-3 shrink-0 items-center justify-center" aria-hidden>
          <IconChevronDown
            className={`size-2.5 text-[var(--text-secondary)] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          />
        </span>
      </button>
      <ToolPanel open={open}>
        <ToolSection className="py-1.5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="group/cardrow -mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.03]"
          >
            <Favicon url={url} size={20} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-[18px] text-[var(--text-primary)]">
                {hasTitle ? title : clean}
              </span>
              {hasTitle && (
                <span className="block truncate text-[12px] leading-[16px] text-[#eba188] underline-offset-2 group-hover/cardrow:underline">
                  {clean}
                </span>
              )}
            </span>
            {hasTitle ? (
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                <span className="hidden sm:inline">{domain}</span>
                <LinkIcon cls="size-3.5 opacity-70 transition-opacity group-hover/cardrow:opacity-100" />
              </span>
            ) : (
              <LinkIcon cls="size-3.5 shrink-0 text-[var(--text-secondary)] opacity-70 transition-opacity group-hover/cardrow:opacity-100" />
            )}
          </a>
        </ToolSection>
      </ToolPanel>
    </div>
  );
}
