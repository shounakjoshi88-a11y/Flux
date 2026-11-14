/**
 * SlideOverPanel — the right-hand drawer used for file and HTML previews.
 *
 * Extracted from `pages/Dashboard.tsx`, where the same drawer was written out
 * twice: a plain version for the low-performance path and an animated version
 * wrapped in AnimatePresence. Both are now one component that picks the
 * variant internally, so the dashboard no longer carries the duplicate markup.
 *
 * The drawer is a plain shell: the caller supplies the title, an optional icon,
 * optional extra header actions and the body content.
 *
 * Public API:
 *   <SlideOverPanel {...props} />
 */
import { IconClose } from "../layout/anthropicIcons.tsx";
import { AnimatePresence, motion } from "framer-motion";

import type { ReactNode } from "react";

export interface SlideOverPanelProps {
  /** Low-performance mode renders the drawer without animation. */
  isPerfLow: boolean;
  /** Heading text. */
  title: ReactNode;
  /** Optional leading icon in the header. */
  icon?: ReactNode;
  /** Extra header buttons, rendered before the close button. */
  actions?: ReactNode;
  /** Tailwind width class for the drawer, e.g. "sm:w-[480px]". */
  widthClass?: string;
  /** Overrides for the header row classes. */
  headerClassName?: string;
  /** Overrides for the body wrapper classes. */
  bodyClassName?: string;
  /** Close handler for the header's X button. */
  onClose: () => void;
  /** Drawer body. */
  children: ReactNode;
}

export function SlideOverPanel({
  isPerfLow,
  title,
  icon,
  actions,
  widthClass = "sm:w-[480px]",
  headerClassName = "flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10",
  bodyClassName = "flex-1 overflow-y-auto p-4",
  onClose,
  children,
}: SlideOverPanelProps) {
  const shellClass = `fixed top-0 right-0 h-full w-full ${widthClass} bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/10 z-50 shadow-2xl flex flex-col`;

  const header = (
    <div className={headerClassName}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium truncate">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
          aria-label="Close"
        >
          <IconClose className="size-4" />
        </button>
      </div>
    </div>
  );

  if (isPerfLow) {
    return (
      <div className={shellClass}>
        {header}
        <div className={bodyClassName}>{children}</div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={shellClass}
      >
        {header}
        <div className={bodyClassName}>{children}</div>
      </motion.div>
    </AnimatePresence>
  );
}
