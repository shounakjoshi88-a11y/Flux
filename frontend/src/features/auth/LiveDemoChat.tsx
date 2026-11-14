/**
 * LiveDemoChat — the scripted "live" search demo on the landing page.
 *
 * Extracted from `pages/Auth.tsx`. It types out a prompt, streams a canned
 * answer and scrolls the source cascade, so it carries its own typewriter
 * hook, formatting helpers and mock sources.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Loader2, RefreshCw, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { IconCheck, IconCopy, IconExternal, IconGlobe, IconSearch } from "../layout/anthropicIcons.tsx";
import { MessageRenderer } from "@/features/chat/MessageRenderer";
import { EASE } from "./motion";
import { FluxLogo } from "./FluxLogo";

function useTypewriter(text: string, start: boolean, speed: number = 15, chunkSize: number = 2) {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    if (!start) return;
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + chunkSize));
        i += chunkSize;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, start, speed, chunkSize]);
  return displayedText;
}

function formatText(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
}

// --- Source Cascade Component ---
const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
};

function ScrollableSourceCascade({
  sources,
  onSourceClick,
}: {
  sources: any[];
  onSourceClick?: (url: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const decelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const currentSpeed = speedRef.current;
    const target = targetSpeedRef.current;
    const newSpeed = currentSpeed + (target - currentSpeed) * 0.15;
    speedRef.current = newSpeed;
    container.scrollLeft += newSpeed;
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (decelTimerRef.current) clearTimeout(decelTimerRef.current);
    };
  }, [step]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const edgeThreshold = 0.3;
    const maxSpeed = 4.5;
    let newTarget = 0;
    if (x < width * edgeThreshold) {
      const fraction = 1 - x / (width * edgeThreshold);
      newTarget = -maxSpeed * fraction;
    } else if (x > width * (1 - edgeThreshold)) {
      const fraction = (x - width * (1 - edgeThreshold)) / (width * edgeThreshold);
      newTarget = maxSpeed * fraction;
    }
    targetSpeedRef.current = newTarget;
    if (decelTimerRef.current) {
      clearTimeout(decelTimerRef.current);
      decelTimerRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const decelerate = () => {
      const current = targetSpeedRef.current;
      if (Math.abs(current) < 0.1) {
        targetSpeedRef.current = 0;
        return;
      }
      targetSpeedRef.current = current * 0.85;
      decelTimerRef.current = setTimeout(decelerate, 16);
    };
    decelerate();
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex items-center -space-x-2 overflow-x-auto scroll-smooth max-w-[120px] pr-2 py-1"
      style={{
        maskImage: "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        scrollbarWidth: "none",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {sources.map((source, idx) => (
        <button
          key={(source.url || source.domain) + idx}
          onClick={(e) => {
            e.stopPropagation();
            if (onSourceClick) {
              onSourceClick(source.url);
            } else if (source.url) {
              window.open(source.url, "_blank");
            }
          }}
          className="transition-all duration-150 hover:scale-125 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none shrink-0 rounded-full"
          title={source.title || getDomain(source.url || source.domain)}
          style={{ zIndex: sources.length - idx }}
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.url || source.domain)}&sz=64`}
            alt={getDomain(source.url || source.domain)}
            className="size-6 rounded-full border-2 border-background bg-white dark:bg-[#000] object-contain hover:border-[var(--accent)]/70 transition-colors"
          />
        </button>
      ))}
    </div>
  );
}

// --- High-Fidelity Live Demo Chat ---
const PROMPT_TEXT = "DeepMind announced yesterday that they’ve shut down all research on humanoid robots and are focusing only on language models. What do you think about this pivot?";

const ANSWER_TEXT = `Based on the search results provided, there is **no evidence** to support the claim that DeepMind has shut down all research on humanoid robots to focus solely on language models. In fact, the available information points in the opposite direction.

Here is a breakdown of what the search results actually show:

1. **Active Robotics Research:** Multiple sources indicate that DeepMind is actively advancing its robotics work. For example, a September 2025 report states that "Google DeepMind quietly released Gemini Robotics 1.5" [4], and another source notes that "DeepMind has been making progress in how its Gemini models" are used for robotics [6]. This directly contradicts the idea that they have abandoned the field.

2. **Integration of Language Models and Robotics:** Rather than pivoting *away* from robots, the research shows DeepMind is integrating the two. One source explicitly states that "vision-language models can be adapted for robot control with minimal fine-tuning" [1]. This suggests a strategy of using language models to *enhance* robotics, not replace it.

3. **Continued Industry Momentum:** The broader context shows a thriving humanoid robotics sector. A YouTube video titled "AI Robots Got Shockingly Human This Year (2026 Update)" [3] and a news article stating "The Humanoid Robots Are Coming, This Time for Real" [4] indicate that the industry is accelerating, not retreating.

**Conclusion:** The premise of your question—that DeepMind has shut down humanoid robot research—is not supported by these search results. Instead, the data shows DeepMind is actively developing robotics, integrating language models into robot control, and operating within a rapidly growing humanoid robotics industry. The pivot you described appears to be a hypothetical scenario not reflected in the provided information.`;

const MOCK_SOURCES = [
  { url: "https://arxiv.org", domain: "arxiv.org", title: "Vision-Language Models", trust: 99, content: "Vision-language models can be adapted for robot control with minimal fine-tuning." },
  { url: "https://theverge.com", domain: "theverge.com", title: "DeepMind AI Integration", trust: 95 },
  { url: "https://youtube.com", domain: "youtube.com", title: "2026 Humanoid Update", trust: 85, content: "AI Robots Got Shockingly Human This Year (2026 Update)" },
  { url: "https://techcrunch.com", domain: "techcrunch.com", title: "Gemini Robotics 1.5 released", trust: 98, content: "Google DeepMind quietly released Gemini Robotics 1.5." },
  { url: "https://techcrunch.com", domain: "techcrunch.com", title: "Humanoid Robotics Trends", trust: 98 },
  { url: "https://theverge.com", domain: "theverge.com", title: "Gemini Robotics Progress", trust: 95, content: "DeepMind has been making progress in how its Gemini models are used for robotics." },
];

export function LiveDemoChat() {
  const [stage, setStage] = useState(0);
  const [isStreaming, setIsStreaming] = useState(true);
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);
  const typedAnswer = useTypewriter(ANSWER_TEXT, stage >= 4, 12, 3);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  // Trigger animation when scrolled into view
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !hasStarted) {
        setHasStarted(true);
      }
    }, { threshold: 0.3 });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    const timers = [
      setTimeout(() => setStage(1), 800),  // Prompt
      setTimeout(() => setStage(2), 2000), // Thought
      setTimeout(() => setStage(3), 3000), // Searching
      setTimeout(() => setStage(4), 4500), // Found Sources
      setTimeout(() => setStage(5), 6000), // Reading
      setTimeout(() => setStage(6), 7500), // Typing Answer
      setTimeout(() => {
        setIsStreaming(false);
        setStage(7); // Show actions
      }, 7500 + (ANSWER_TEXT.length / 3 * 12) + 500)
    ];
    return () => timers.forEach(clearTimeout);
  }, [hasStarted]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedAnswer, stage]);

  const handleCopy = () => {
    navigator.clipboard.writeText(ANSWER_TEXT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl flex flex-col h-[650px]">
      {/* Mock Browser Top Bar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-3">
        <div className="size-2.5 rounded-full bg-red-500/50"></div>
        <div className="size-2.5 rounded-full bg-yellow-500/50"></div>
        <div className="size-2.5 rounded-full bg-green-500/50"></div>
        <div className="ml-4 flex-1 rounded-md bg-background/60 px-3 py-1 text-xs text-muted-foreground font-mono flex items-center gap-2">
          <FluxLogo className="size-3 text-primary" />
          flux.app/live_demo
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-primary tracking-widest">
          <span className="flex size-1.5 rounded-full bg-primary animate-pulse"></span>
          LIVE
        </div>
      </div>

      {/* Chat Body */}
      <div ref={scrollRef} className="flex-1 p-6 sm:p-8 overflow-y-auto custom-scrollbar bg-background/30 font-sans text-sm relative flex flex-col gap-6 scroll-smooth">

        {/* Prompt */}
        <AnimatePresence>
          {stage >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="flex justify-end"
            >
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md py-3 px-4 max-w-[80%] shadow-md">
                {PROMPT_TEXT}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Response Block */}
        <AnimatePresence>
          {stage >= 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] space-y-3 w-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex size-7 items-center justify-center rounded-lg border border-primary/40 text-primary bg-card/60">
                    <FluxLogo className="size-4" />
                  </div>
                  <span className="font-mono text-xs text-primary tracking-widest">FLUX_RESEARCHER</span>
                </div>

                {/* Status: Thought */}
                <AnimatePresence>
                  {stage === 2 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[13px] text-muted-foreground leading-snug font-medium py-2"
                    >
                      Analyzing the claim about DeepMind shutting down humanoid robot research...
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Status: Searching */}
                <AnimatePresence>
                  {stage === 3 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="py-2 min-w-0 flex items-center gap-2"
                    >
                      <IconSearch className="size-3.5 text-primary animate-spin" style={{ animationDuration: '2s' }} />
                      <span className="text-[13px] text-muted-foreground leading-snug font-medium">Searching live web for "DeepMind humanoid robots shut down"</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Status: Found Sources */}
                <AnimatePresence>
                  {stage >= 4 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 py-2 min-w-0"
                    >
                      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <IconGlobe className="size-3.5 text-primary" />
                        <span className="font-medium">Found 4 sources</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {MOCK_SOURCES.map((src, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card text-xs hover:border-primary/50 cursor-pointer"
                          >
                            <span className={`size-1.5 rounded-full ${src.trust > 95 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                            <span className="text-foreground">{src.domain}</span>
                            <span className="text-muted-foreground text-[10px]">{src.trust}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Status: Reading */}
                <AnimatePresence>
                  {stage >= 5 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 py-2 min-w-0"
                    >
                      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <BookOpen className="size-3.5 text-primary" />
                        <span className="font-medium">Reading articles...</span>
                      </div>
                      {MOCK_SOURCES.slice(0, 2).map((src, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-foreground/80 hover:text-primary cursor-pointer group">
                          <IconExternal className="size-3 opacity-50 group-hover:opacity-100" />
                          <span className="truncate">{src.title}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Status: Answer Typing */}
                <AnimatePresence>
                  {stage >= 6 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="pt-2"
                    >
                      <div className="bg-muted/40 text-foreground/90 rounded-2xl rounded-bl-md py-3 px-4 shadow-sm text-[13px] leading-relaxed">
                        <MessageRenderer
                          content={typedAnswer}
                          onCitationClick={() => {}}
                          sources={MOCK_SOURCES}
                        />
                      </div>
                      {isStreaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse align-middle ml-1"></span>}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action buttons + Source cascade */}
                <AnimatePresence>
                  {!isStreaming && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50"
                    >
                      <div className="flex items-center gap-0.5 pt-2">
                        <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          {copied ? <IconCheck className="size-3.5 text-emerald-500" /> : <IconCopy className="size-3.5" />}
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Volume2 className="size-3.5" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <RefreshCw className="size-3.5" />
                        </button>

                        <div className="flex items-center gap-1.5 ml-2">
                          <ScrollableSourceCascade sources={MOCK_SOURCES} />
                          <span className="text-xs font-medium text-muted-foreground/60 whitespace-nowrap font-sans">
                            {MOCK_SOURCES.length} sources
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 pt-2">
                        <button onClick={() => setLiked(liked === 'up' ? null : 'up')} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <ThumbsUp className={`size-3.5 ${liked === 'up' ? 'fill-emerald-500 text-emerald-500' : ''}`} />
                        </button>
                        <button onClick={() => setLiked(liked === 'down' ? null : 'down')} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <ThumbsDown className={`size-3.5 ${liked === 'down' ? 'fill-red-500 text-red-500' : ''}`} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
