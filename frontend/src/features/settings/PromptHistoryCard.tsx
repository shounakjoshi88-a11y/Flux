/**
 * Prompt history rail.
 *
 * A fixed 34px rail pinned to the right edge of the viewport, vertically
 * centred, with a blurred dark pill behind it. Hovering expands a 240px card
 * that lists every prompt sent in this conversation so you can jump back to
 * one. Each row carries a small dash on the right, which is the delete
 * affordance, and the prompt nearest the viewport is highlighted.
 *
 * Modelled on chat.deepseek.com: rail at right:16px, 300px tall, card 240px
 * wide with 16px corners, rows at 13px in #adb2b8, active row in #5686fe.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "../../types";

interface PromptHistoryCardProps {
  messages: Message[];
  onJumpToPrompt: (messageId: string | number) => void;
  visibleRange: { startIndex: number; endIndex: number };
}

const RAIL_WIDTH = 34;
const CARD_WIDTH = 240;
const CARD_HEIGHT = 150;
const ROW_HEIGHT = 30;

export function PromptHistoryCard({ messages, onJumpToPrompt, visibleRange }: PromptHistoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userPrompts = useMemo(() => messages.filter((m) => m.role === "User"), [messages]);
  const total = userPrompts.length;

  // The prompt nearest the viewport is the active one.
  useEffect(() => {
    if (total === 0) {
      setActiveIndex(-1);
      return;
    }
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

  // Keep the active row in view when the card is open.
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    const btn = listRef.current.querySelectorAll<HTMLElement>("[data-item]")[activeIndex];
    if (!btn) return;
    const t = setTimeout(() => btn.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    return () => clearTimeout(t);
  }, [activeIndex, isOpen]);

  const handleEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 350);
  }, []);

  const handleClick = useCallback(
    (msg: Message) => {
      onJumpToPrompt(msg.id);
      setIsOpen(false);
    },
    [onJumpToPrompt],
  );

  if (total === 0) return null;

  return (
    <div
      className="fixed z-50 flex items-center"
      style={{ right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Expanded card - slides out to the left of the rail */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 12, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
            style={{
              pointerEvents: "auto",
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 16,
              background: "var(--prompt-history-scrim)",
              backdropFilter: "blur(5px)",
              WebkitBackdropFilter: "blur(5px)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
              marginRight: -1,
            }}
          >
            <div
              ref={listRef}
              className="overflow-y-auto h-full"
              style={{ scrollbarWidth: "none" }}
            >
              <style>{`.phc-list::-webkit-scrollbar{display:none}`}</style>
              <div className="phc-list" style={{ padding: "12px 0 0 12px" }}>
                {userPrompts.map((msg, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={msg.id}
                      data-item
                      onClick={() => handleClick(msg)}
                      className="flex w-full items-center gap-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      style={{
                        height: ROW_HEIGHT,
                        padding: "0 10px 0 0",
                        color: isActive ? "var(--prompt-history-active)" : "var(--prompt-history-row)",
                      }}
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-[13px] leading-5"
                        style={{ color: isActive ? "var(--prompt-history-active)" : "var(--prompt-history-row)" }}
                      >
                        {msg.content}
                      </span>
                      {/* Dash affordance, same as DeepSeek's per-row delete control */}
                      <span
                        aria-hidden
                        className="shrink-0 text-[9px] font-medium leading-[14px]"
                        style={{ color: isActive ? "var(--prompt-history-active)" : "var(--prompt-history-row)" }}
                      >
                        -
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The rail itself: a blurred pill with one tick per prompt */}
      <div
        className="relative flex flex-col items-center justify-center gap-1"
        style={{
          pointerEvents: "auto",
          width: RAIL_WIDTH,
          height: 292,
          borderRadius: 16,
          background: "var(--prompt-history-scrim)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          cursor: "pointer",
          padding: "8px 0",
        }}
      >
        {userPrompts.map((msg, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={msg.id}
              onClick={() => handleClick(msg)}
              className="w-full mx-auto rounded-full transition-all duration-200"
              style={{
                width: isActive ? 18 : 10,
                height: 3,
                background: isActive ? "var(--prompt-history-active)" : "rgba(255,255,255,0.22)",
                boxShadow: isActive ? "0 0 6px rgba(86,134,254,0.45)" : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
