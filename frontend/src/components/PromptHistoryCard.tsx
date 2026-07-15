import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "../types";

interface PromptHistoryCardProps {
  messages: Message[];
  onJumpToPrompt: (messageId: string | number) => void;
  visibleRange: { startIndex: number; endIndex: number };
}

const MINIMAP_H = 280;
const DOT_MIN = 3;
const DOT_MAX = 8;
const GAP_MIN = 2;
const GAP_MAX = 6;

export function PromptHistoryCard({ messages, onJumpToPrompt, visibleRange }: PromptHistoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userPrompts = useMemo(() => messages.filter((m) => m.role === "User"), [messages]);

  const total = userPrompts.length;
  const itemSlot = total > 0 ? MINIMAP_H / total : MINIMAP_H;
  const dotH = Math.max(DOT_MIN, Math.min(DOT_MAX, itemSlot * 0.5));
  const gap = Math.max(GAP_MIN, Math.min(GAP_MAX, itemSlot * 0.5));

  // ── Active index from Virtuoso's visible range ─────────────
  useEffect(() => {
    if (total === 0) { setActiveIndex(-1); return; }
    let bestIdx = -1;
    let bestOverlap = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i]?.role !== "User") continue;
      const promptIdx = userPrompts.indexOf(messages[i] as Message);
      if (promptIdx === -1) continue;
      const overlapStart = Math.max(i, visibleRange.startIndex);
      const overlapEnd = Math.min(i, visibleRange.endIndex);
      const overlap = Math.max(0, overlapEnd - overlapStart + 1);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIdx = promptIdx;
      }
    }
    setActiveIndex(bestIdx);
  }, [visibleRange, messages, userPrompts, total]);

  // ── Track centering math ───────────────────────────────────
  const totalContentH = total * dotH + (total - 1) * gap;
  const centeringOffset = Math.max(0, (MINIMAP_H - totalContentH) / 2);
  const activeDotCenter = activeIndex >= 0
    ? centeringOffset + activeIndex * (dotH + gap) + dotH / 2
    : 0;

  // ── Auto-scroll popup list to active item ──────────────────
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

  // ── Hover show / hide ──────────────────────────────────────
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
      className="fixed right-20 top-1/2 -translate-y-1/2 z-50 flex items-center"
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
            style={{ pointerEvents: "auto", marginRight: "10px" }}
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
          width: 24,
          height: MINIMAP_H,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
        }}
      >
        {/* Track line bg */}
        <div
          style={{
            width: 2,
            height: MINIMAP_H,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 4,
            position: "absolute",
          }}
        />
        {/* Track line active highlight */}
        {activeIndex >= 0 && (
          <div
            style={{
              width: 2,
              height: dotH + 2,
              background: "#cc785c",
              borderRadius: 4,
              position: "absolute",
              top: centeringOffset + activeIndex * (dotH + gap) - 1,
              boxShadow: "0 0 6px rgba(204,120,92,0.5)",
              transition: "top 0.3s ease",
            }}
          />
        )}
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
                  width: isActive ? 12 : 6,
                  height: dotH,
                  minHeight: dotH,
                  maxHeight: dotH,
                  borderRadius: 9999,
                  background: isActive
                    ? "#cc785c"
                    : "rgba(255,255,255,0.15)",
                  boxShadow: isActive
                    ? "0 0 8px rgba(204,120,92,0.7), 0 0 16px rgba(204,120,92,0.3)"
                    : "none",
                  margin: `${gap / 2}px auto`,
                  transition: "width 0.25s ease, background 0.25s ease, box-shadow 0.25s ease",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
