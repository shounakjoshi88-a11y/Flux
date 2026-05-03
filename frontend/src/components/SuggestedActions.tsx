// src/components/SuggestedActions.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  BriefcaseBusiness,
  CalendarCheck,
  UserSearch,
  Palette,
} from "lucide-react";
import { suggestionsByCategory } from "@/data/suggestions";

const categories = [
  { id: "for-you", label: "For you", icon: Sparkles },
  { id: "build-business", label: "Build a Business", icon: BriefcaseBusiness },
  { id: "organize-life", label: "Organize My Life", icon: CalendarCheck },
  { id: "recruiting", label: "Recruiting", icon: UserSearch },
  { id: "create", label: "Create", icon: Palette },
] as const;

type CategoryId = (typeof categories)[number]["id"];

type SuggestedActionsProps = {
  onSelect: (query: string) => void;
};

type SuggestionItem = {
  id: string;
  text: string;
};

const SLOT_KEYS = [0, 1, 2, 3] as const;
const SLOT_COUNT = SLOT_KEYS.length;
const INITIAL_DELAY_MS = 2500;
const ROTATE_EVERY_MS = 5000;
const FALLBACK_SUGGESTION = "Try asking anything";

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function getRandomSuggestion(
  categoryId: CategoryId,
  exclude: string[] = []
): string {
  const pool = suggestionsByCategory[categoryId] ?? [];

  if (pool.length === 0) {
    return FALLBACK_SUGGESTION;
  }

  const available = pool.filter((s) => !exclude.includes(s));
  const source = available.length > 0 ? available : pool;

  return source[Math.floor(Math.random() * source.length)] ?? FALLBACK_SUGGESTION;
}

function buildInitialDisplayed(categoryId: CategoryId): SuggestionItem[] {
  const chosen: string[] = [];

  for (let i = 0; i < SLOT_COUNT; i++) {
    chosen.push(getRandomSuggestion(categoryId, chosen));
  }

  return chosen.map((text) => ({
    id: generateId(),
    text: text || FALLBACK_SUGGESTION,
  }));
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

export function SuggestedActions({ onSelect }: SuggestedActionsProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("for-you");
  const [displayedItems, setDisplayedItems] = useState<SuggestionItem[]>(() =>
    buildInitialDisplayed("for-you")
  );
  const [isHovered, setIsHovered] = useState(false);

  const prefersReducedMotion = usePrefersReducedMotion();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleIndexRef = useRef(0);
  const resumeImmediatelyRef = useRef(false);
  const hasMountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const replaceOneItem = useCallback(() => {
    setDisplayedItems((prev) => {
      if (prev.length === 0) return prev;

      const currentIndex = cycleIndexRef.current % prev.length;
      const currentTexts = prev.map((item) => item.text);
      const nextText = getRandomSuggestion(activeCategory, currentTexts);

      const nextItems = [...prev];
      nextItems[currentIndex] = {
        id: generateId(),
        text: nextText || FALLBACK_SUGGESTION,
      };

      cycleIndexRef.current = (currentIndex + 1) % prev.length;
      return nextItems;
    });
  }, [activeCategory]);

  useEffect(() => {
    setDisplayedItems(buildInitialDisplayed(activeCategory));
    cycleIndexRef.current = 0;
    resumeImmediatelyRef.current = false;
  }, [activeCategory]);

  useEffect(() => {
    clearTimers();

    if (prefersReducedMotion || isHovered) {
      return;
    }

    const startInterval = () => {
      intervalRef.current = setInterval(replaceOneItem, ROTATE_EVERY_MS);
    };

    const runImmediately = hasMountedRef.current && resumeImmediatelyRef.current;

    if (runImmediately) {
      replaceOneItem();
      startInterval();
    } else {
      timeoutRef.current = setTimeout(() => {
        replaceOneItem();
        startInterval();
      }, INITIAL_DELAY_MS);
    }

    hasMountedRef.current = true;
    resumeImmediatelyRef.current = false;

    return clearTimers;
  }, [activeCategory, isHovered, prefersReducedMotion, replaceOneItem, clearTimers]);

  useEffect(() => {
    if (isHovered) {
      resumeImmediatelyRef.current = true;
    }
  }, [isHovered]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] dark:bg-white/[0.02] backdrop-blur-sm overflow-hidden p-4 space-y-3">
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
          aria-label="Suggestion categories"
        >
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                aria-pressed={isActive}
                className={`cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-white text-black dark:bg-white dark:text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90"
                }`}
              >
                <cat.icon className="size-3.5 shrink-0" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className="space-y-0.5"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {SLOT_KEYS.map((slotIndex) => {
            const item = displayedItems[slotIndex];

            return (
              <button
                key={slotIndex}
                type="button"
                onClick={() => onSelect(item?.text || FALLBACK_SUGGESTION)}
                className="cursor-pointer w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-white/5 focus-visible:bg-white/5 transition-colors relative overflow-hidden"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={item?.id ?? `slot-${slotIndex}`}
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, y: 6, scale: 0.985 }
                    }
                    animate={
                      prefersReducedMotion
                        ? { opacity: 1 }
                        : { opacity: 1, y: 0, scale: 1 }
                    }
                    exit={
                      prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -6, scale: 0.985 }
                    }
                    transition={{
                      duration: prefersReducedMotion ? 0.15 : 0.35,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="block truncate"
                  >
                    {item?.text || FALLBACK_SUGGESTION}
                  </motion.span>
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}