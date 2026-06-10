import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@/types";

interface PromptHistoryCardProps {
  messages: Message[];
  onJumpToPrompt: (messageId: string | number) => void;
}

const MAX_VISIBLE_DASHES = 80;

export function PromptHistoryCard({ messages, onJumpToPrompt }: PromptHistoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  const userPrompts = messages.filter((msg) => msg.role === "User");

  // ─── IntersectionObserver: track which prompt is in view ───
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const entriesMap = new Map<Element, number>();
    let rafPending = false;

    const updateActive = () => {
      rafPending = false;
      let best: Element | null = null;
      let bestRatio = 0;
      for (const [el, ratio] of entriesMap) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = el;
        }
      }
      if (best) {
        const id = best.getAttribute("data-message-id");
        const idx = userPrompts.findIndex((m) => String(m.id) === id);
        setActiveIndex(idx);
      }
    };

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entriesMap.set(entry.target, entry.intersectionRatio);
          } else {
            entriesMap.delete(entry.target);
          }
        }
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(updateActive);
        }
      },
      { rootMargin: "-60px 0px -60px 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const msg of userPrompts) {
      const el = document.querySelector(`[data-message-id="${msg.id}"]`);
      if (el) observerRef.current.observe(el);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [userPrompts]);

  // ─── Auto-scroll list to keep active prompt visible ───
  useEffect(() => {
    if (activeIndex < 0 || !isOpen) return;
    const id = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const buttons = container.querySelectorAll("button");
      const btn = buttons[activeIndex];
      if (!btn) return;
      const cTop = container.scrollTop;
      const cBot = cTop + container.clientHeight;
      const bTop = (btn as HTMLElement).offsetTop;
      const bBot = bTop + (btn as HTMLElement).offsetHeight;
      if (bTop < cTop || bBot > cBot) {
        btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 0);
    return () => clearTimeout(id);
  }, [activeIndex, isOpen]);

  // ─── Hover open / close ───
  const open = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 400);
  }, []);

  // ─── Hover-edge scroll ───
  const step = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      animFrameRef.current = requestAnimationFrame(step);
      return;
    }
    const cur = speedRef.current;
    const tgt = targetSpeedRef.current;
    speedRef.current = cur + (tgt - cur) * 0.12;
    if (Math.abs(speedRef.current) > 0.05) {
      container.scrollTop += speedRef.current;
    }
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [step]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    const edge = 0.3;
    const maxSpeed = 5;
    let tgt = 0;
    if (y < h * edge) {
      tgt = -maxSpeed * (1 - y / (h * edge));
    } else if (y > h * (1 - edge)) {
      tgt = maxSpeed * ((y - h * (1 - edge)) / (h * edge));
    }
    targetSpeedRef.current = tgt;
  }, []);

  const handleScrollLeave = useCallback(() => {
    const coast = () => {
      if (Math.abs(targetSpeedRef.current) < 0.05) {
        targetSpeedRef.current = 0;
        return;
      }
      targetSpeedRef.current *= 0.85;
      coastTimerRef.current = setTimeout(coast, 16);
    };
    coast();
  }, []);

  // ─── Click ───
  const handleClick = useCallback(
    (msg: Message) => {
      onJumpToPrompt(msg.id);
      setIsOpen(false);
    },
    [onJumpToPrompt]
  );

  if (userPrompts.length === 0) return null;

  const total = userPrompts.length;
  const density = Math.min(1, MAX_VISIBLE_DASHES / total);
  const dashSize = Math.max(2, 5 * density);
  const gap = Math.max(2, 6 * density);

  return (
    <div
      className="fixed right-3 top-1/2 -translate-y-1/2 z-40"
      style={{ pointerEvents: "none" }}
    >
      {/* Single hover zone wrapping both minimap and card */}
      <div
        className="flex items-center"
        style={{ pointerEvents: "auto" }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
      >
        {/* ─── Card — slides out when open ─── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 16, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="bg-[#1a1917] border border-white/[0.07] rounded-xl shadow-2xl overflow-hidden"
              style={{ width: "260px", maxWidth: "70vw" }}
            >
              <div className="relative">
                {/* top fade */}
                <div className="absolute top-0 left-0 right-0 h-10 z-10 pointer-events-none"
                  style={{
                    background: "linear-gradient(to bottom, #1a1917 0%, transparent 100%)"
                  }}
                />

                <div
                  ref={scrollRef}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleScrollLeave}
                  className="overflow-y-auto py-3 custom-scrollbar"
                  style={{ maxHeight: "340px" }}
                >
                  {userPrompts.map((msg, i) => {
                    const isActive = i === activeIndex;
                    return (
                      <button
                        key={msg.id}
                        onClick={() => handleClick(msg)}
                        className="w-full text-left px-4 py-0.5 hover:bg-white/[0.04] transition relative"
                      >
                        <div className="flex items-start gap-1.5">
                          <span
                            className="mt-[6px] shrink-0 rounded-full transition-all duration-200"
                            style={{
                              width: isActive ? "8px" : "4px",
                              height: isActive ? "8px" : "4px",
                              backgroundColor: isActive
                                ? "var(--color-sidebar-primary, #cc785c)"
                                : "rgba(255,255,255,0.15)",
                              boxShadow: isActive
                                ? "0 0 6px rgba(204,120,92,0.4)"
                                : "none",
                            }}
                          />
                          <span
                            className="text-xs leading-relaxed"
                            style={{
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              maskImage: "linear-gradient(to right, black 70%, transparent 98%)",
                              WebkitMaskImage: "linear-gradient(to right, black 70%, transparent 98%)",
                              color: isActive
                                ? "rgba(255,255,255,0.85)"
                                : "rgba(255,255,255,0.50)",
                            }}
                          >
                            {msg.content}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* bottom fade */}
                <div className="absolute bottom-0 left-0 right-0 h-10 z-10 pointer-events-none"
                  style={{
                    background: "linear-gradient(to top, #1a1917 0%, transparent 100%)"
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Dashes minimap — always visible ─── */}
        <div
          className="relative shrink-0 flex flex-col items-center justify-center"
          style={{
            width: "28px",
            height: "340px",
            maxHeight: "60vh",
          }}
        >
          <div className="relative flex flex-col items-center">
            {userPrompts.map((msg, i) => {
              const isActive = i === activeIndex;
              return (
                <div
                  key={msg.id}
                  onClick={() => handleClick(msg)}
                  className="cursor-pointer rounded-full shrink-0"
                  style={{
                    width: isActive ? "22px" : "16px",
                    height: `${dashSize}px`,
                    backgroundColor: isActive
                      ? "var(--color-sidebar-primary, #cc785c)"
                      : "rgba(255,255,255,0.10)",
                    boxShadow: isActive
                      ? "0 0 10px rgba(204,120,92,0.5), 0 0 20px rgba(204,120,92,0.15)"
                      : "none",
                    transition: "width 0.2s, background-color 0.2s, box-shadow 0.2s",
                    margin: `${gap / 2}px 0`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
