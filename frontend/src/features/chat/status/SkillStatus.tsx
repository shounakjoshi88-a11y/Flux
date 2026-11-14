/**
 * SkillStatus — the "reading a skill document" step.
 *
 * Extracted from `features/chat/StatusMessage.tsx`. Shows the document type
 * badge (for example JNCIA rules) under the step message, with the icon
 * switching between a spinner, a success tick and an error state.
 *
 * Returns `null` for any other subtype.
 */
import { StepRow } from "../ThoughtBlock";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["reading_skill", "reading_skill_success", "reading_skill_error"]);

/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function SkillStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  onSourceClick,
  rightSlot,
}: StatusBlockProps) {
  if (!SUBTYPES.has(status.subtype)) return null;

  // ─── reading_skill ────────────────────────────────────────────────────────
  if (status.subtype === "reading_skill" || status.subtype === "reading_skill_success" || status.subtype === "reading_skill_error") {
    const docType: string = status.data?.docType ?? "";
    const isSuccess = status.subtype === "reading_skill_success";
    const isError = status.subtype === "reading_skill_error";
    const isLoading = status.subtype === "reading_skill";

    const skillIcon = (
      <span className="size-4 flex items-center justify-center">
        {isLoading && isActive ? (
          <span className="relative size-3">
            <span className="absolute inset-0 rounded-full border border-[var(--accent)]/25 border-t-[var(--accent)] animate-spin" />
          </span>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={`size-3.5 ${isSuccess ? 'text-emerald-400/70' : isError ? 'text-red-400/70' : 'text-[var(--text-secondary)]/50'}`}>
            <path d="M2 2h12v12H2z" />
            <line x1="5" y1="5.5" x2="11" y2="5.5" strokeWidth="1" />
            <line x1="5" y1="8" x2="11" y2="8" strokeWidth="1" />
            <line x1="5" y1="10.5" x2="8.5" y2="10.5" strokeWidth="1" />
          </svg>
        )}
      </span>
    );

    return (
      <StepRow rightSlot={rightSlot}
        icon={skillIcon}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={isLoading && isActive}
      >
        {docType && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${isSuccess
              ? 'border-emerald-500/20 bg-emerald-500/6 text-emerald-400/80'
              : isError
                ? 'border-red-500/20 bg-red-500/6 text-red-400/80'
                : 'border-[var(--accent)]/20 bg-[var(--accent)]/5 text-[var(--accent)]/80'
              }`}>
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="size-2.5 shrink-0">
                <path d="M2 1h6v8H2z" />
                <line x1="3.5" y1="3.5" x2="6.5" y2="3.5" strokeWidth="1" />
                <line x1="3.5" y1="5.5" x2="5.5" y2="5.5" strokeWidth="1" />
              </svg>
              {docType.toUpperCase()} rules
            </span>
          </div>
        )}
      </StepRow>
    );
  }
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const SkillStatus = Object.assign(SkillStatusComponent, { handles });
