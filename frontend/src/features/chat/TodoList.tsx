import { motion, AnimatePresence } from "framer-motion";
import type { TodoItem } from "../types";

export default function TodoList({ items }: { items: TodoItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="my-2 space-y-1">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center gap-2.5 px-1"
          >
            <StatusIcon status={item.status} />
            <span
              className={`text-[13px] leading-snug transition-all duration-300 ${
                item.status === "completed"
                  ? "text-[var(--text-muted)] line-through"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {item.content}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function StatusIcon({ status }: { status: TodoItem["status"] }) {
  if (status === "completed") {
    return (
      <span className="size-4 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 12 12" className="size-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,6 5,9 10,3" />
        </svg>
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span className="size-4 shrink-0 flex items-center justify-center">
        <span className="size-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
      </span>
    );
  }

  return (
    <span className="size-4 shrink-0 flex items-center justify-center">
      <span className="size-2.5 rounded-full border border-[var(--text-muted)]/30" />
    </span>
  );
}
