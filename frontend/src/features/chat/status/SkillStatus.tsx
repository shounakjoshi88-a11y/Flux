/**
 * SkillStatus — claude.ai's read-a-skill row.
 *
 * While the skill loads: a muted row with spinner + "Reading <name>…".
 * After completion: the same muted flat disclosure row; expanding it opens
 * the actual skill file inline (Claude renders the loaded skill as an
 * in-place document, no navigation, no separate viewer).
 * Error state: flat muted row with a warning icon and the reason.
 *
 * Merging on the parts pipeline folds `reading_skill_success` into the
 * `reading_skill` tool_call part, so this handles one subtype.
 */
import { useState } from "react";
import { IconChevronDown } from "../../layout/anthropicIcons.tsx";
import { SpinnerIcon } from "../ThoughtBlock";
import { WarnIcon } from "../icons";
import { ToolPanel, ToolSection } from "../ToolActivity";
import { FileIcon } from "../icons";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["reading_skill", "reading_skill_success", "reading_skill_error"]);
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function SkillStatusComponent({
  status,
  isActive,
  onSourceClick,
  rightSlot,
}: StatusBlockProps) {
  // Collapsed by default like claude.ai's "Read <skill>" row — the user
  // opens it in place when they want the file contents.
  const [open, setOpen] = useState(false);
  const data = (status.data as Record<string, unknown> | undefined) ?? {};
  const subtype = status.subtype;

  if (!SUBTYPES.has(subtype)) return null;

  if (subtype === "reading_skill_error") {
    return (
      <div className="flex items-center gap-2 py-[3px] pl-1 min-w-0">
        <WarnIcon cls="size-3.5 shrink-0 text-amber-400/70" />
        <span className="truncate text-[13px] leading-[18px] text-[var(--text-secondary)]">
          {status.message || "Skill not found"}
        </span>
        {rightSlot && <span className="shrink-0 ml-auto">{rightSlot}</span>}
      </div>
    );
  }

  const name = (typeof data.name === "string" && data.name) || (typeof data.docType === "string" && data.docType) || "";
  const source = typeof data.source === "string" ? data.source : "builtin";
  const description = typeof data.description === "string" ? data.description : "";
  const body = typeof data.body === "string" ? data.body : "";
  const files = Array.isArray(data.files) ? (data.files as string[]) : [];

  // Loading phase — flat, pulsing, no chevron.
  if (subtype === "reading_skill" && isActive && !body) {
    return (
      <div className="flex items-center gap-2 py-[3px] pl-1 min-w-0">
        <SpinnerIcon cls="text-[var(--accent)]" />
        <span className="truncate text-[13px] leading-[18px] text-[var(--text-secondary)]">
          {status.message || (name ? `reading ${name}…` : "reading skill…")}
        </span>
        {rightSlot && <span className="shrink-0 ml-auto">{rightSlot}</span>}
      </div>
    );
  }

  const label = name ? `read skill: ${name}` : status.message || "read skill";

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group/skillrow flex w-stretch items-center gap-2 rounded-[8px] py-[3px] pl-1 pr-1 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.05] select-none"
      >
        <FileIcon cls="size-4 shrink-0 text-[var(--text-secondary)]/70" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] leading-[18px] text-[var(--text-secondary)] group-hover/skillrow:text-[var(--text-primary)] transition-colors">
          {label}
        </span>
        {source === "custom" && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]/80">custom</span>
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
          {(description || files.length > 0) && (
            <div className="mb-1.5 flex flex-col gap-0.5">
              {description && (
                <p className="text-[12px] leading-[17px] text-[var(--text-secondary)]">
                  {description}
                </p>
              )}
              {files.length > 0 && (
                <p className="font-mono text-[10px] text-[var(--text-muted)]">
                  {files.length} bundled file{files.length === 1 ? "" : "s"}: {files.join(", ")}
                </p>
              )}
            </div>
          )}
          {body && (
            <pre className="custom-scrollbar max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-white/[0.04] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-[11px] leading-[1.65] font-mono text-[#cfccc4]">
              {body}
            </pre>
          )}
        </ToolSection>
      </ToolPanel>
    </div>
  );
}

export const SkillStatus = Object.assign(SkillStatusComponent, { handles });
