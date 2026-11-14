/**
 * DeleteToast — the "Thread deleted." toast with an Undo action.
 *
 * Extracted from `pages/Dashboard.tsx`, which carried two copies of the same
 * markup (plain for low-performance mode, animated otherwise). The variant is
 * now chosen inside this component.
 *
 * Public API:
 *   <DeleteToast {...props} />
 */
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export interface DeleteToastProps {
  /** Low-performance mode renders the toast without animation. */
  isPerfLow: boolean;
  /** Body text. */
  message?: string;
  /** Undo handler. */
  onUndo: () => void;
  /** Dismiss handler. */
  onDismiss: () => void;
}

export function DeleteToast({
  isPerfLow,
  message = "Thread deleted.",
  onUndo,
  onDismiss,
}: DeleteToastProps) {
  const className =
    "fixed top-4 right-4 z-50 flex items-center gap-3 bg-[#181715] border border-white/8 text-white rounded-lg px-4 py-2.5 shadow-xl";

  const content = (
    <>
      <span className="text-sm text-stone-300">{message}</span>
      <button
        onClick={onUndo}
        className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors"
      >
        Undo
      </button>
      <button
        onClick={onDismiss}
        className="text-stone-500 hover:text-stone-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </>
  );

  if (isPerfLow) {
    return <div className={className}>{content}</div>;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 100, opacity: 0, scale: 0.9 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 100, opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={className}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
