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
import { suggestionsByCategory } from "../data/suggestions";

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
    <div className="w-full relative z-10">
      {/* Pills row — always visible */}
      <motion.div
        layout
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border transition duration-200 cursor-pointer text-xs font-medium whitespace-nowrap ${
              activeCategory === cat.id
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--surface-border)] bg-[var(--card)]/30 backdrop-blur-md hover:bg-[var(--card)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <cat.icon className="size-3" />
            <span>{cat.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Panel opens upward from the pills */}
      <div className="relative">
        <AnimatePresence>
          {activeCategory && (
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--surface-border)] bg-[var(--bg-primary)]/95 backdrop-blur-xl shadow-xl p-1 max-h-[50vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--surface-border)]">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                  {activeCategoryInfo && <activeCategoryInfo.icon className="size-3.5 text-[var(--accent)]" />}
                  <span>{activeCategoryInfo?.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-bg)] transition p-0.5 rounded cursor-pointer"
                  aria-label="Close suggestions"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="py-0.5">
                {suggestions.map((text, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onAction(text);
                      setActiveCategory(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition duration-150 cursor-pointer truncate"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
