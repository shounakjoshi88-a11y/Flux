/**
 * Prompt history card — a 1:1 replica of chat.deepseek.com's right-side
 * conversation navigator, measured live (Nov 2026):
 *
 * A 34×292 pill (br16, rgba(21,21,23,.6) + 5px backdrop blur) is pinned
 * 16px from the right edge, vertically centred. The card itself — 242×152,
 * br16 — is ALWAYS mounted, right-aligned to the pill's right edge and
 * vertically centred on it, exactly like DeepSeek's DOM: collapsed, its
 * surface is transparent and the row labels are faded out, so only the
 * position ticks show over the pill. Hovering fades the surface to opaque
 * #232324 and the labels to full opacity; no positional animation.
 *
 * Rows are 210×30: a 13px #adb2b8 truncated label and, on the right, the
 * position tick (8×2 white/20; active 12×3 #679efe, both br4, centred in a
 * 16×20 box, 12px gap after the label). The prompt nearest the viewport
 * carries the active tick. Clicking a row (or its collapsed tick) jumps to
 * that prompt. The list scrolls when there are more prompts than fit; the
 * card height is fixed at 152px like DeepSeek's.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { Message } from "../../types";

interface PromptHistoryCardProps {
  messages: Message[];
  onJumpToPrompt: (messageId: string | number) => void;
  visibleRange: { startIndex: number; endIndex: number };
}

/** Geometry measured from chat.deepseek.com. */
const CARD_WIDTH = 242;
const CARD_HEIGHT = 152;
const ROW_WIDTH = 210;
const ROW_HEIGHT = 30;
const CARD_PAD_Y = 15; // 15px top/bottom inside the card
const CARD_PAD_X = 24; // 24px left inset before the rows
const PILL_WIDTH = 34;
const PILL_HEIGHT = 292;

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
      className="phc-root fixed z-40 hidden md:block"
      style={{ right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <style>{`.phc-list::-webkit-scrollbar{display:none}`}</style>

      {/* The collapsed pill: blurred scrim strip, 34×292, br16. Rendered
          first so the card (same right edge) covers it when open. */}
      <div
        style={{
          pointerEvents: "auto",
          width: PILL_WIDTH,
          height: PILL_HEIGHT,
          borderRadius: 16,
          background: "var(--prompt-history-scrim)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
          cursor: "pointer",
        }}
      />

      {/* The card — always mounted like DeepSeek's; surface + labels fade
          with hover. pointer-events stay off while collapsed except for the
          tick strips, so invisible rows never block chat clicks. */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 16,
          background: isOpen ? "var(--prompt-history-card)" : "transparent",
          transition: "background-color 160ms ease",
          pointerEvents: isOpen ? "auto" : "none",
          overflow: "hidden",
        }}
      >
        <div
          ref={listRef}
          className="phc-list overflow-y-auto"
          style={{
            height: "100%",
            padding: `${CARD_PAD_Y}px 0 ${CARD_PAD_Y}px ${CARD_PAD_X}px`,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {userPrompts.map((msg, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={msg.id}
                data-item
                onClick={() => handleClick(msg)}
                className="flex items-center text-left transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{
                  width: ROW_WIDTH,
                  height: ROW_HEIGHT,
                  gap: 12,
                  flexShrink: 0,
                  pointerEvents: isOpen ? "auto" : "none",
                }}
              >
                <span
                  className="min-w-0 flex-1 truncate transition-opacity duration-150"
                  style={{
                    fontSize: 13,
                    lineHeight: "20px",
                    opacity: isOpen ? 1 : 0,
                    color: isActive ? "var(--prompt-history-active)" : "var(--prompt-history-row)",
                  }}
                >
                  {msg.content}
                </span>
                {/* Position tick — 8×2 normally, 12×3 blue when active.
                    Always interactive so the collapsed pill is clickable. */}
                <span
                  className="flex h-5 w-4 shrink-0 items-center justify-center"
                  style={{ pointerEvents: "auto" }}
                >
                  <span
                    className="transition-all duration-200"
                    style={{
                      width: isActive ? 12 : 8,
                      height: isActive ? 3 : 2,
                      borderRadius: 4,
                      background: isActive ? "var(--prompt-history-active)" : "var(--prompt-history-tick)",
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
