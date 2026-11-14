/**
 * ImageStatus — the image generation and enhancement steps.
 *
 * Extracted from `features/chat/StatusMessage.tsx`. Shows the generated or
 * enhanced image plus the running / done / failed framing.
 *
 * Returns `null` for any other subtype.
 */
import { StepRow } from "../ThoughtBlock";
import { ImageIcon, WandIcon } from "../icons";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["image_enhancing", "image_enhancing_success", "image_generating", "image_generating_success", "image_generating_error"]);

/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function ImageStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  onSourceClick,
  rightSlot,
}: StatusBlockProps) {
  if (!SUBTYPES.has(status.subtype)) return null;

  // ─── image tools ──────────────────────────────────────────────────────────
  if (status.subtype === "image_enhancing" || status.subtype === "image_enhancing_success") {
    const isDone = status.subtype === "image_enhancing_success";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WandIcon cls={
          isDone ? "text-[var(--text-secondary)]/50"
            : isActive ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)]/40"
        } />}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={!isDone && !!isActive}
      />
    );
  }

  if (
    status.subtype === "image_generating" ||
    status.subtype === "image_generating_success" ||
    status.subtype === "image_generating_error"
  ) {
    const isDone = status.subtype === "image_generating_success";
    const isError = status.subtype === "image_generating_error";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<ImageIcon cls={
          isDone ? "text-emerald-400/70"
            : isError ? "text-red-400/70"
              : isActive ? "text-[var(--accent)]"
                : "text-[var(--text-secondary)]/40"
        } />}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={!isDone && !isError && !!isActive}
      />
    );
  }
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const ImageStatus = Object.assign(ImageStatusComponent, { handles });
