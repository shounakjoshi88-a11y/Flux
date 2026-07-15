import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "../types";

interface PromptHistoryCardProps {
  messages: Message[];
  onJumpToPrompt: (messageId: string | number) => void;
}

const MINIMAP_H = 280; // px — fixed height of the minimap track
const DOT_MIN = 3;     // px — minimum dot height
const DOT_MAX = 8;     // px — maximum dot height
const GAP_MIN = 2;     // px — minimum gap
const GAP_MAX = 6;     // px — maximum gap

export function PromptHistoryCard({ messages, onJumpToPrompt }: PromptHistoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userPrompts = messages.filter((m) => m.role === "User");

  // ── Compute dot / gap sizes so all dots always fit ──────────
  const total = userPrompts.length;
  const itemSlot = total > 0 ? MINIMAP_H / total : MINIMAP_H;
  const dotH = Math.max(DOT_MIN, Math.min(DOT_MAX, itemSlot * 0.5));
  const gap  = Math.max(GAP_MIN, Math.min(GAP_MAX, itemSlot * 0.5));

  // ── Track which prompt is in viewport ───────────────────────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const ratioMap = new Map<Element, number>();
    let rafId = 0;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) ratioMap.set(e.target, e.intersectionRatio);
          else ratioMap.delete(e.target);
        }
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          let best: Element | null = null;
          let bestR = 0;
          for (const [el, r] of ratioMap) {
            if (r > bestR) { bestR = r; best = el; }
          }
          if (best) {
            const id = best.getAttribute("data-message-id");
            const idx = userPrompts.findIndex((m) => String(m.id) === id);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-80px 0px -80px 0px" }
    );

    for (const msg of userPrompts) {
      const el = document.querySelector(`[data-message-id="${msg.id}"]`);
      if (el) observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [userPrompts]);

  // ── Auto-scroll the popup list to keep active item visible ──
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    const btns = listRef.current.querySelectorAll<HTMLElement>("[data-item]");
    const btn = btns[activeIndex];
    if (!btn) return;
    const t = setTimeout(() =>
      btn.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50
    );
    return () => clearTimeout(t);
  }, [activeIndex, isOpen]);

  // ── Hover show / hide ────────────────────────────────────────
  const handleEnter = useCallback(() => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setIsOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 350);
  }, []);

  const handleClick = useCallback((msg: Message) => {
    onJumpToPrompt(msg.id);
    setIsOpen(false);
  }, [onJumpToPrompt]);

  if (total === 0) return null;

  return (
    <div
      className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center"
      style={{ pointerEvents: "none" }}
    >
      {/* ── Popup card ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 12, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ pointerEvents: "auto", marginRight: "6px" }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                width: 248,
                background: "rgba(18,17,15,0.92)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 24px 48px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.04)",
              }}
            >
              {/* Header */}
              <div
                className="px-4 pt-3 pb-2 flex items-center gap-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span style={{ color: "#cc785c", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Prompts
                </span>
                <span
                  style={{
                    background: "rgba(204,120,92,0.15)",
                    color: "#cc785c",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: 20,
                    marginLeft: "auto",
                  }}
                >
                  {total}
                </span>
              </div>

              {/* Top fade */}
              <div
                className="absolute left-0 right-0 pointer-events-none z-10"
                style={{
                  top: 44,
                  height: 20,
                  background: "linear-gradient(to bottom, rgba(18,17,15,0.95) 0%, transparent 100%)",
                }}
              />

              {/* Scrollable list */}
              <div
                ref={listRef}
                className="overflow-y-auto"
                style={{ maxHeight: 260, scrollbarWidth: "none" }}
              >
                <style>{`.phc-list::-webkit-scrollbar{display:none}`}</style>
                <div className="py-2">
                  {userPrompts.map((msg, i) => {
                    const isActive = i === activeIndex;
                    return (
                      <button
                        key={msg.id}
                        data-item
                        onClick={() => handleClick(msg)}
                        className="w-full text-left px-4 py-2 flex items-center gap-2.5 group transition-all duration-150"
                        style={{
                          background: isActive ? "rgba(204,120,92,0.08)" : "transparent",
                        }}
                      >
                        {/* Indicator dot */}
                        <span
                          className="shrink-0 rounded-full transition-all duration-200"
                          style={{
                            width: isActive ? 7 : 5,
                            height: isActive ? 7 : 5,
                            background: isActive ? "#cc785c" : "rgba(255,255,255,0.2)",
                            boxShadow: isActive ? "0 0 8px rgba(204,120,92,0.6)" : "none",
                            flexShrink: 0,
                          }}
                        />
                        {/* Text */}
                        <span
                          className="text-xs leading-snug truncate"
                          style={{
                            color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)",
                            fontWeight: isActive ? 500 : 400,
                            maxWidth: 180,
                            transition: "color 0.15s",
                          }}
                        >
                          {msg.content}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom fade */}
              <div
                className="absolute bottom-0 left-0 right-0 pointer-events-none"
                style={{
                  height: 20,
                  background: "linear-gradient(to top, rgba(18,17,15,0.95) 0%, transparent 100%)",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Minimap track ── */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{
          pointerEvents: "auto",
          width: 20,
          height: MINIMAP_H,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingRight: 4,
          cursor: "pointer",
        }}
      >
        {/* Track line */}
        <div
          className="absolute"
          style={{
            width: 2,
            height: MINIMAP_H,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 2,
          }}
        />
        {/* Dots */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            height: MINIMAP_H,
            width: "100%",
            overflow: "hidden",
            justifyContent: "center",
          }}
        >
          {userPrompts.map((msg, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={msg.id}
                onClick={() => handleClick(msg)}
                style={{
                  width: isActive ? 14 : 8,
                  height: dotH,
                  minHeight: dotH,
                  maxHeight: dotH,
                  borderRadius: 9999,
                  background: isActive
                    ? "#cc785c"
                    : "rgba(255,255,255,0.12)",
                  boxShadow: isActive
                    ? "0 0 8px rgba(204,120,92,0.7), 0 0 16px rgba(204,120,92,0.3)"
                    : "none",
                  margin: `${gap / 2}px auto`,
                  transition: "width 0.25s ease, background 0.25s ease, box-shadow 0.25s ease",
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
