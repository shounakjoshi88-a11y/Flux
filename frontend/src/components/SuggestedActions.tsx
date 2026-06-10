// src/components/SuggestedActions.tsx
import { useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  BriefcaseBusiness,
  CalendarCheck,
  UserSearch,
  Palette,
  X,
} from "lucide-react";
import { suggestionsByCategory } from "@/data/suggestions";

const categories = [
  { id: "for-you", label: "For you", icon: Sparkles },
  { id: "build-business", label: "Business", icon: BriefcaseBusiness },
  { id: "organize-life", label: "Organize", icon: CalendarCheck },
  { id: "recruiting", label: "Recruiting", icon: UserSearch },
  { id: "create", label: "Create", icon: Palette },
] as const;

type CategoryId = (typeof categories)[number]["id"];

type SuggestedActionsProps = {
  onAction: (query: string) => void;
};

export const SuggestedActions = memo(function SuggestedActions({
  onAction,
}: SuggestedActionsProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);

  const activeCategoryInfo = categories.find((c) => c.id === activeCategory);
  const suggestions = activeCategory ? (suggestionsByCategory[activeCategory] ?? []).slice(0, 5) : [];

  return (
    <div className="w-full max-w-2xl mx-auto relative z-20">
      <AnimatePresence mode="wait">
        {activeCategory ? (
          <motion.div
            key="expanded-card"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl shadow-xl p-2"
          >
            {/* Expanded Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                {activeCategoryInfo && <activeCategoryInfo.icon className="size-4 text-[var(--accent)]" />}
                <span>{activeCategoryInfo?.label}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition p-1 rounded-full cursor-pointer"
                aria-label="Close suggestions"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Suggestions list */}
            <div className="divide-y divide-white/[0.03] mt-0.5">
              {suggestions.map((text, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onAction(text);
                    setActiveCategory(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition duration-150 cursor-pointer block truncate"
                >
                  {text}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed-pills"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-wrap items-center justify-center gap-2"
          >
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.06] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition duration-200 cursor-pointer shadow-sm"
                >
                  <cat.icon className="size-3 text-[var(--text-secondary)]/80" />
                  <span>{cat.label}</span>
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
