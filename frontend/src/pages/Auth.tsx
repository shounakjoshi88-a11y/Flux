import { createClient } from "../lib/client";
import { Button } from "../components/ui/button";
import { Loader2, Search, Network, Brain, Layers, ChevronDown, ArrowRight, CheckCircle2, Globe, BookOpen, ExternalLink, Copy, Check, Volume2, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { MessageRenderer } from "../components/MessageRenderer";
import "../../styles/dashboard.css";

const supabase = createClient();

// Elite smooth easing curves
const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_OUT_SOFT = [0.16, 1, 0.3, 1] as const;

// Flux Logo Component
function FluxLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16C5 6 8 18 11 10S17 6 22 12" />
    </svg>
  );
}

// Fixed node layout for the ambient graph backdrop
const GRAPH_NODES = [
  { x: 90, y: 110, r: 5, color: "primary", delay: 0 },
  { x: 230, y: 230, r: 4, color: "teal", delay: 0.4 },
  { x: 150, y: 360, r: 3.5, color: "amber", delay: 0.8 },
  { x: 360, y: 70, r: 3, color: "teal", delay: 1.1 },
  { x: 400, y: 290, r: 4.5, color: "primary", delay: 0.2 },
  { x: 560, y: 150, r: 4, color: "amber", delay: 0.6 },
  { x: 640, y: 330, r: 3.5, color: "primary", delay: 1.3 },
  { x: 730, y: 90, r: 3, color: "teal", delay: 0.5 },
  { x: 830, y: 250, r: 4, color: "amber", delay: 0.9 },
  { x: 900, y: 110, r: 3.5, color: "primary", delay: 0.3 },
  { x: 300, y: 440, r: 3, color: "teal", delay: 1.5 },
  { x: 560, y: 440, r: 3.5, color: "amber", delay: 0.7 },
  { x: 60, y: 290, r: 3, color: "amber", delay: 1.0 },
  { x: 960, y: 360, r: 3.5, color: "teal", delay: 0.1 },
] as const;

const GRAPH_EDGES: [number, number][] = [
  [0, 1], [1, 2], [1, 4], [3, 4], [4, 5],
  [5, 6], [5, 7], [6, 8], [7, 8], [8, 9],
  [2, 12], [4, 10], [6, 11], [8, 13],
];

const NODE_FILL: Record<string, string> = {
  primary: "fill-[#cc785c]",
  teal: "fill-teal-400",
  amber: "fill-amber-400",
};

function GraphBackdrop({ reduced }: { reduced: boolean }) {
  return (
    <svg
      viewBox="0 0 1000 520"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full opacity-[0.15] dark:opacity-[0.25]"
      aria-hidden="true"
    >
      {GRAPH_EDGES.map(([a, b], i) => {
        const from = GRAPH_NODES[a];
        const to = GRAPH_NODES[b];
        if (!from || !to) return null;
        return (
          <motion.line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="stroke-muted-foreground/30"
            strokeWidth={1}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2, delay: i * 0.1, ease: EASE }}
          />
        );
      })}
      {GRAPH_NODES.map((node, i) => (
        <motion.circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={node.r}
          className={NODE_FILL[node.color]}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            cy: reduced ? [node.y] : [node.y, node.y - 12, node.y]
          }}
          transition={{
            duration: reduced ? 0.5 : 6 + (i % 5),
            delay: node.delay,
            repeat: reduced ? 0 : Infinity,
            repeatType: "loop",
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}

// --- Typewriter Hook & Formatter ---
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

function LiveDemoChat() {
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
                      <Search className="size-3.5 text-primary animate-spin" style={{ animationDuration: '2s' }} />
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
                        <Globe className="size-3.5 text-primary" />
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
                          <ExternalLink className="size-3 opacity-50 group-hover:opacity-100" />
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
                          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
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


function DeepDiveGraphVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_60%)] opacity-[0.05]"></div>
      <svg viewBox="0 0 400 300" className="w-full h-auto relative z-10" aria-hidden="true">
        <motion.line x1="100" y1="80" x2="200" y2="150" className="stroke-muted-foreground/40" strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, ease: EASE }} />
        <motion.line x1="200" y1="150" x2="300" y2="80" className="stroke-muted-foreground/40" strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.2, ease: EASE }} />
        <motion.line x1="200" y1="150" x2="100" y2="220" className="stroke-red-500/40" strokeWidth="1.5" strokeDasharray="4 4" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.4, ease: EASE }} />
        <motion.line x1="200" y1="150" x2="300" y2="220" className="stroke-muted-foreground/40" strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.6, ease: EASE }} />

        <text x="115" y="120" className="fill-muted-foreground/70 text-[9px] font-sans">generates</text>
        <text x="230" y="120" className="fill-muted-foreground/70 text-[9px] font-sans">related_to</text>
        <text x="110" y="190" className="fill-red-500/80 text-[9px] font-sans font-bold">contradicts</text>
        <text x="230" y="190" className="fill-muted-foreground/70 text-[9px] font-sans">related_to</text>

        <motion.circle cx="100" cy="80" r="8" className="fill-teal-400" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, type: "spring", stiffness: 200 }} />
        <text x="115" y="84" className="fill-foreground text-[11px] font-medium">Elon Musk</text>

        <motion.circle cx="300" cy="80" r="8" className="fill-teal-400" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.7, type: "spring", stiffness: 200 }} />
        <text x="245" y="84" className="fill-foreground text-[11px] font-medium">Perplexity</text>

        <motion.circle cx="200" cy="150" r="10" className="fill-[#cc785c]" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9, type: "spring", stiffness: 200 }} />
        <text x="215" y="154" className="fill-foreground text-[11px] font-medium">Optimus</text>

        <motion.circle cx="100" cy="220" r="8" className="fill-amber-400" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.1, type: "spring", stiffness: 200 }} />
        <text x="115" y="224" className="fill-foreground text-[11px] font-medium">Misinformation</text>

        <motion.circle cx="300" cy="220" r="8" className="fill-[#cc785c]" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.3, type: "spring", stiffness: 200 }} />
        <text x="230" y="224" className="fill-foreground text-[11px] font-medium">Fake Claim</text>
      </svg>
    </div>
  );
}

function MemoryManagerMock() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: EASE }}
      className="relative w-full max-w-md mx-auto space-y-4"
    >
      <div className="absolute -inset-4 bg-teal-500/10 rounded-3xl blur-2xl opacity-50"></div>

      <motion.div
        className="relative rounded-xl border border-border bg-card/80 backdrop-blur-xl shadow-xl p-5 transform translate-x-4 translate-y-4 opacity-60"
        whileHover={{ x: -10, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Active Projects</span>
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted"></div>
          <div className="h-2 w-4/6 rounded-full bg-muted"></div>
        </div>
      </motion.div>

      <motion.div
        className="relative rounded-xl border border-border bg-card/80 backdrop-blur-xl shadow-xl p-5 transform translate-x-2 translate-y-2 opacity-80"
        whileHover={{ x: -5, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Brain className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Preferences</span>
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted"></div>
          <div className="h-2 w-5/6 rounded-full bg-muted"></div>
        </div>
      </motion.div>

      <div className="relative rounded-xl border border-primary/40 bg-card backdrop-blur-xl shadow-[0_0_30px_rgba(204,120,92,0.15)] p-5 overflow-hidden">
        <div className="absolute top-0 right-0 px-2 py-1 bg-primary/10 text-primary text-[9px] font-mono tracking-wider flex items-center gap-1">
          <CheckCircle2 className="size-2" /> VERIFIED
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Network className="size-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Fact Check: Perplexity</span>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono mb-4">
          Cross-referenced 3 live sources. No credible evidence of shutdown.
        </p>
        <div className="flex gap-2">
          <div className="size-8 rounded bg-blue-500/20 text-blue-500 text-[10px] flex items-center justify-center font-bold">V</div>
          <div className="size-8 rounded bg-orange-500/20 text-orange-500 text-[10px] flex items-center justify-center font-bold">T</div>
          <div className="size-8 rounded bg-green-500/20 text-green-500 text-[10px] flex items-center justify-center font-bold">B</div>
        </div>
      </div>
    </motion.div>
  );
}

const FEATURES = [
  {
    icon: Search,
    title: "Agentic Search",
    description: "Plans, searches, and checks its own findings before answering. Not a single guess, a verified one.",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Every idea becomes a node. You can literally see how topics connect and relate to each other.",
  },
  {
    icon: Brain,
    title: "Memory That Sticks",
    description: "Keeps track of your preferences and projects across sessions, so you never start at zero.",
  },
  {
    icon: Layers,
    title: "Real Artifacts",
    description: "Tables, HTML, docs, and code you can open and reuse — not just descriptions of them.",
  },
];

const USE_CASES = [
  { icon: Search, title: "Research Copilot", desc: "For news, tech, and geopolitics." },
  { icon: Layers, title: "System Design", desc: "For AI pipelines, caching, and routing." },
  { icon: Brain, title: "Learning Companion", desc: "For CS, math, and cybersecurity." },
  { icon: Network, title: "Misinformation Checker", desc: "Verify viral claims with citations." },
];

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => { document.title = "Sign In"; }, []);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate("/new");
      } else {
        setChecking(false);
      }
    };
    run();
  }, [navigate]);

  async function login(provider: "github" | "google") {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: "https://localhost:3000/new" },
    });
    if (error) {
      alert("Authentication failed. Please try again.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: EASE }
    }
  };

  const headlineVariants = {
    hidden: { y: "100%" },
    visible: {
      y: "0%",
      transition: { duration: 1.2, ease: EASE_OUT_SOFT }
    }
  };

  return (
    <div className="relative w-full h-screen bg-background text-foreground overflow-y-auto overflow-x-hidden custom-scrollbar">
      {/* Film Grain Overlay */}
      <div className="pointer-events-none fixed inset-0 z-[100] opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>

      {/* Ambient Background Effects */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-primary/5 blur-[120px]"></div>
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-teal-500/5 blur-[100px]"></div>
      </div>
      {/* Subtle Grid Texture */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"></div>

      {/* Minimal top wordmark */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 backdrop-blur-md sm:px-10"
      >
        <div className="flex items-center gap-2.5">
          <FluxLogo className="size-6 text-primary" />
          <span className="font-serif text-lg tracking-tight text-foreground">Flux</span>
        </div>
        <div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-muted-foreground tracking-widest border border-border/60 bg-card/40 px-3 py-1.5 rounded-full">
          <span className="flex size-1.5 rounded-full bg-primary animate-pulse"></span>
          LIVE_WEB_v2.4
        </div>
      </motion.header>

      {/* ---------- Hero Section ---------- */}
      <section className="relative z-10 min-h-screen flex items-center px-6 pt-24 pb-16 overflow-hidden">
        <GraphBackdrop reduced={!!reducedMotion} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,var(--background)_85%)] z-0"></div>

        <div className="relative z-10 mx-auto max-w-7xl w-full grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy & Auth */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="flex flex-col items-start text-left"
          >
            <motion.div
              variants={itemVariants}
              className="mb-6 flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md"
            >
              <span className="flex size-2 rounded-full bg-primary shadow-[0_0_10px_#cc785c]" />
              Now mapping the live web in real-time
            </motion.div>

            <h1 className="font-serif text-4xl font-normal leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl overflow-hidden">
              <motion.span variants={headlineVariants} className="block">
                The AI that shows its
              </motion.span>
              <motion.span variants={headlineVariants} className="block italic text-primary">
                work.
              </motion.span>
            </h1>

            <motion.p
              variants={itemVariants}
              className="mt-6 max-w-lg text-balance text-base text-muted-foreground sm:text-lg"
            >
              Flux searches the live web, cites what it finds, and quietly maps everything you discover along the way — so you're never just trusting a black box.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="mt-10 flex flex-wrap justify-start gap-3"
            >
              <Button
                disabled={loading}
                onClick={() => login("google")}
                className="group h-12 rounded-xl px-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] disabled:opacity-60"
              >
                <GoogleIcon className="mr-2 size-5 transition-transform group-hover:scale-110" />
                Continue with Google
              </Button>
              <Button
                disabled={loading}
                variant="outline"
                onClick={() => login("github")}
                className="group h-12 rounded-xl px-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] disabled:opacity-60"
              >
                <GithubIcon className="mr-2 size-5 transition-transform group-hover:scale-110" />
                Continue with GitHub
              </Button>
            </motion.div>

            <motion.p
              variants={itemVariants}
              className="mt-6 text-xs text-muted-foreground/60"
            >
              By continuing, you agree to our <Link to="/terms" className="underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">Terms of Service</Link> and <Link to="/privacy" className="underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">Privacy Policy</Link>.
            </motion.p>
          </motion.div>

          {/* Right: Live Demo Chat (Moved here for immediate impact) */}
          <div className="hidden lg:block w-full">
            <LiveDemoChat />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={reducedMotion ? undefined : { y: [0, 6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="size-5 text-muted-foreground/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ---------- Feature Highlights ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto mb-16 max-w-2xl text-center"
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">01 — FEATURES</span>
              <div className="h-px w-12 bg-primary/50"></div>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Built to think before it answers
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Four parts working together, not four separate tools bolted on.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
                className="group relative p-6 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:bg-card/60 overflow-hidden"
              >
                {/* Corner Notch */}
                <div className="absolute top-0 right-0 h-12 w-12 border-t border-r border-primary/0 group-hover:border-primary/40 transition-all duration-500"></div>
                <div className="absolute bottom-0 left-0 h-12 w-12 border-b border-l border-primary/0 group-hover:border-primary/40 transition-all duration-500"></div>

                <div className="relative">
                  <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-[0_0_20px_rgba(204,120,92,0.3)]">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Deep Dive: Knowledge Graph ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">02 — GRAPH</span>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              See the map, <br className="hidden sm:block" />not just the destination.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Flux tracks topics like <span className="text-foreground">"Misinformation"</span>, <span className="text-foreground">"Elon Musk"</span>, and <span className="text-foreground">"Optimus"</span>.
              By mapping relations like <span className="italic text-primary/90">contradicts</span>, <span className="italic text-primary/90">related_to</span>, and <span className="italic text-primary/90">generates</span>,
              Flux reveals hidden patterns and actively corrects false claims right before your eyes.
            </p>
            <ul className="mt-8 space-y-4">
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-2.5 rounded-full bg-[#cc785c] shadow-[0_0_8px_#cc785c]" /> Tracks concepts, entities, and topics.
              </li>
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-2.5 rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf]" /> Visualizes dynamic relationships.
              </li>
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" /> Actively flags contradictions.
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="relative aspect-square w-full rounded-2xl border border-border/60 bg-card/30 backdrop-blur-md overflow-hidden"
          >
            <div className="absolute top-0 left-0 h-12 w-12 border-t border-l border-primary/40"></div>
            <div className="absolute bottom-0 right-0 h-12 w-12 border-b border-r border-primary/40"></div>
            <DeepDiveGraphVisual />
          </motion.div>
        </div>
      </section>

      {/* ---------- Deep Dive: Memory & Reliability ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <MemoryManagerMock />
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="order-1 lg:order-2"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">03 — MEMORY</span>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Memory that doesn't forget, <br className="hidden sm:block" />and won't lie to you.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Flux remembers your preferences, certifications, and ongoing projects across sessions.
              When the web floods with rumors—like <span className="text-foreground">"Perplexity is shutting down"</span>—Flux uses deep search and citations to push back on misinformation, keeping your context grounded in reality.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="px-3 py-1.5 text-xs rounded-full bg-muted/50 border border-border text-foreground">Preferences</span>
              <span className="px-3 py-1.5 text-xs rounded-full bg-muted/50 border border-border text-foreground">Long-term Projects</span>
              <span className="px-3 py-1.5 text-xs rounded-full bg-muted/50 border border-border text-foreground">Fact-Checking</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Use Cases ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto mb-16 max-w-2xl text-center"
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">04 — USE CASES</span>
              <div className="h-px w-12 bg-primary/50"></div>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Built for any depth of inquiry
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {USE_CASES.map((use_case, i) => (
              <motion.div
                key={use_case.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
                className="group flex flex-col p-5 rounded-xl border border-border/40 bg-card/20 hover:bg-card/40 transition-all duration-300 hover:border-border"
              >
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <use_case.icon className="size-4" />
                </div>
                <h3 className="text-sm font-medium text-foreground">{use_case.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{use_case.desc}</p>
                <ArrowRight className="size-4 mt-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="relative z-10 border-t border-border/60 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2">
            <FluxLogo className="size-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              Flux — built for people who want to see how AI thinks.
            </span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} Flux. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Inline SVG Icons
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}