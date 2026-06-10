// src/components/StatusMessage.tsx
import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { MessageRenderer } from "./MessageRenderer";

import { calculateTrustScore } from "@/utils/TrustScore";

// ── Icons — 20×20 viewport, size-5, 1.6px stroke ──────────
type IProps = { cls?: string };
const S = ({ cls = "", children }: { cls?: string; children: React.ReactNode }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round"
       className={`size-4 shrink-0 ${cls}`}>{children}</svg>
);

// Search — offset circle for visual weight, thick angled handle
const SearchIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="8.5" cy="8.5" r="5.2" />
    <line x1="12.8" y1="12.8" x2="17.5" y2="17.5" />
  </S>
);

// Globe — sphere with equator, tropic lines, and two meridian curves
const GlobeIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="10" cy="10" r="7.5" />
    <line x1="2.5" y1="10" x2="17.5" y2="10" />
    <line x1="4" y1="6.5" x2="16" y2="6.5" strokeWidth="1" opacity="0.5" />
    <line x1="4" y1="13.5" x2="16" y2="13.5" strokeWidth="1" opacity="0.5" />
    <path d="M10 2.5c-3 2.5-4 4.8-4 7.5s1 5 4 7.5" />
    <path d="M10 2.5c3 2.5 4 4.8 4 7.5s-1 5-4 7.5" />
  </S>
);

// Book — open book with spine, curved pages, and 3 text lines on each page
const BookIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    {/* spine */}
    <line x1="10" y1="17" x2="10" y2="4.5" />
    {/* page outlines */}
    <path d="M10 5c-2-1.5-4-1.5-6.5-1v11.5c2.5-.5 4.5-.5 6.5 1" />
    <path d="M10 5c2-1.5 4-1.5 6.5-1v11.5c-2.5-.5-4.5-.5-6.5 1" />
    {/* left page lines */}
    <line x1="4.5" y1="8" x2="8.5" y2="7.5" strokeWidth="1" opacity="0.6" />
    <line x1="4.5" y1="10.5" x2="8.5" y2="10" strokeWidth="1" opacity="0.6" />
    <line x1="4.5" y1="13" x2="8.5" y2="12.5" strokeWidth="1" opacity="0.6" />
    {/* right page lines */}
    <line x1="11.5" y1="7.5" x2="15.5" y2="8" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="10" x2="15.5" y2="10.5" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="12.5" x2="15.5" y2="13" strokeWidth="1" opacity="0.6" />
  </S>
);

// External link — compact box + diagonal arrow
const LinkIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5V11" />
    <path d="M12 3h5v5" />
    <line x1="17" y1="3" x2="10" y2="10" />
  </S>
);

// Warning triangle — wide base, tall, sharp
const WarnIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M10 3 1.5 17.5h17L10 3z" />
    <line x1="10" y1="8.5" x2="10" y2="13" />
    <circle cx="10" cy="15.5" r=".8" fill="currentColor" strokeWidth="0" />
  </S>
);

// Checkmark — bold confident tick
const DoneIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <polyline points="2.5,10 7.5,15.5 17.5,4.5" />
  </S>
);

// Weather — same monochrome tone as all other icons, uses S wrapper
const WeatherIcon = ({ state, cls = "" }: { state: "fetching" | "success" | "error"; cls?: string }) => {
  if (state === "fetching") return (
    // Thermometer with tick marks
    <S cls={cls}>
      <path d="M10 3.5v8.2" />
      <path d="M8 3.5a2 2 0 0 1 4 0v8.2a4 4 0 1 1-4 0z" />
      <line x1="12.5" y1="6" x2="14.5" y2="6" />
      <line x1="12.5" y1="8.5" x2="14" y2="8.5" />
      <line x1="12.5" y1="11" x2="14.5" y2="11" />
    </S>
  );
  if (state === "success") return (
    // Cloud with sun peeking behind
    <S cls={cls}>
      <circle cx="13.5" cy="7" r="3" />
      <line x1="13.5" y1="2.5" x2="13.5" y2="1.5" />
      <line x1="17" y1="3.5" x2="17.7" y2="2.8" />
      <line x1="18" y1="7" x2="19" y2="7" />
      <path d="M4.5 15.5a3.5 3.5 0 0 1-.8-6.9A5.5 5.5 0 0 1 14.2 10a3 3 0 0 1-.7 5.5H4.5z" />
    </S>
  );
  return (
    // Cloud with lightning bolt
    <S cls={cls}>
      <path d="M4.5 15.5a3.5 3.5 0 0 1-.8-6.9A5.5 5.5 0 0 1 14.2 10a3 3 0 0 1-.7 5.5H4.5z" />
      <polyline points="10.5,13 8.5,16.5 11,16.5 9,20" />
    </S>
  );
};

// ── NEW: Skill/rules scroll icon ──────────────────────────
const SkillIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    {/* Scroll body */}
    <path d="M6 2.5h9a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 15 17.5H6A1.5 1.5 0 0 1 4.5 16V4a1.5 1.5 0 0 1 1.5-1.5z" />
    {/* Left curl tabs */}
    <path d="M4.5 4a1.5 1.5 0 0 1-1.5 1.5A1.5 1.5 0 0 1 1.5 4 1.5 1.5 0 0 1 3 2.5h3" />
    <path d="M4.5 16a1.5 1.5 0 0 0-1.5 1.5A1.5 1.5 0 0 0 4.5 19H6V17.5" />
    {/* Text lines */}
    <line x1="7.5" y1="7.5" x2="14" y2="7.5" strokeWidth="1.2" />
    <line x1="7.5" y1="10.5" x2="14" y2="10.5" strokeWidth="1.2" />
    <line x1="7.5" y1="13.5" x2="11" y2="13.5" strokeWidth="1.2" />
  </S>
);

// ── NEW: Wand/sparkle icon for image enhancing ────────────
const WandIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <line x1="3.5" y1="16.5" x2="11" y2="9" />
    <path d="M13.5 3 l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5 z" />
    <line x1="6.5" y1="5.5" x2="6.5" y2="4.5" strokeWidth="1.2" />
    <line x1="5.5" y1="6.5" x2="4.5" y2="6.5" strokeWidth="1.2" />
    <line x1="7.5" y1="6.5" x2="8.5" y2="6.5" strokeWidth="1.2" opacity="0.5" />
    <line x1="6.5" y1="7.5" x2="6.5" y2="8.5" strokeWidth="1.2" opacity="0.5" />
  </S>
);

// ── NEW: Image frame icon for image generating ────────────
const ImageIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <circle cx="6.5" cy="8.5" r="1.5" />
    <path d="M2.5 12.5 L6.5 9 L9.5 12.5 L12.5 9 L17.5 14" />
  </S>
);


interface StatusMessageProps {
  status: {
    type: string;
    subtype: string;
    message: string;
    content?: string;
    data?: any;
  };
  isFirst?: boolean;
  isLast?: boolean;
  isActive?: boolean;
  showRail?: boolean;
  onSourceClick?: (url: string | null) => void;
  elapsedSeconds?: number;
}

// ── Strip thought-only content; remove ANSWER/FOLLOW_UPS blocks entirely ──
function cleanThoughtText(text: string): string {
  return text
    .replace(/<ANSWER>[\s\S]*?<\/ANSWER>/gi, "")   // full ANSWER block
    .replace(/<ANSWER>[\s\S]*/gi, "")               // partial ANSWER (streaming)
    .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*/gi, "")
    .replace(/<\/?[A-Z_]+>/gi, "")                  // remaining tag wrappers
    .trim();
}

// ── Split thought text into individual reasoning steps ────────────────────
function parseThoughtSteps(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const strip = (s: string) =>
    s.replace(/^[\s•·‣▸\-–—]+/, "").trim();

  const meaningful = (s: string) => strip(s).length > 8;

  const byDouble = clean.split(/\n{2,}/).map(strip).filter(meaningful);
  if (byDouble.length > 1) return byDouble;

  const bySingle = clean.split(/\n/).map(strip).filter(meaningful);
  if (bySingle.length > 1) return bySingle;

  const byBullet = clean
    .split(/\s*[•·‣▸]\s*/)
    .map(strip)
    .filter(meaningful);
  if (byBullet.length > 1) return byBullet;

  const byStep = clean
    .split(/(?=\bStep\s+\d+\b)/i)
    .map(strip)
    .filter(meaningful);
  if (byStep.length > 1) return byStep;

  return [strip(clean)];
}

// ── Word-by-word typewriter hook ──────────────────────────────────────────
function useWordByWord(fullText: string, isActive: boolean): string {
  const [visibleCount, setVisibleCount] = useState<number>(
    () => (isActive ? 0 : Number.MAX_SAFE_INTEGER)
  );
  const prevTextRef = useRef(fullText);
  const tokens = fullText.split(/(\s+)/);
  const clampedCount = Math.min(visibleCount, tokens.length);

  useEffect(() => {
    if (fullText.length < prevTextRef.current.length) {
      setVisibleCount(isActive ? 0 : Number.MAX_SAFE_INTEGER);
    }
    prevTextRef.current = fullText;
  }, [fullText, isActive]);

  useEffect(() => {
    if (!isActive) {
      setVisibleCount(Number.MAX_SAFE_INTEGER);
      return;
    }
    if (clampedCount >= tokens.length) return;
    const t = setTimeout(
      () => setVisibleCount(c => c + 2),
      30
    );
    return () => clearTimeout(t);
  }, [fullText, clampedCount, isActive, tokens.length]);

  return tokens.slice(0, clampedCount).join("");
}

// ── Timeline column — Claude-style: 1px rail, compact dot ──────────────
export function TimelineNode({
  icon,
  isFirst = false,
  isLast = false,
  showRail = true,
}: {
  icon: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  showRail?: boolean;
}) {
  const lineColor = "bg-stone-700/50";
  const lineWidth = "w-px";

  if (!showRail) {
    return (
      <div className="flex flex-col items-center w-4 shrink-0 pt-2">
        <div className="relative z-10 flex items-center justify-center">
          {icon}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-4 shrink-0 self-stretch">
      <div
        className={`${lineWidth} h-[8px] shrink-0 transition-opacity duration-300 ${!isFirst ? "opacity-100" : "opacity-0"} ${lineColor}`}
      />

      <div className="flex items-center justify-center h-4 w-4 shrink-0 relative">
        <div
          className={`absolute left-1/2 -translate-x-1/2 ${lineWidth} ${lineColor}
            ${isFirst ? "top-[12px]" : "top-0"}
            ${isLast ? "bottom-[12px]" : "bottom-0"}`}
        />

        <div className="relative z-10 flex items-center justify-center">
          {icon}
        </div>
      </div>

      <div
        className={`${lineWidth} flex-1 mt-px transition-opacity duration-300 ${!isLast ? "opacity-100" : "opacity-0"} ${lineColor}`}
      />
    </div>
  );
}

// ── Generic step row — Claude-style: compact, muted ─────────────────────
function StepRow({
  icon, message, children, isFirst = false, isLast = false, pulse = false, showRail = true,
}: {
  icon: React.ReactNode;
  message: string;
  children?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  pulse?: boolean;
  showRail?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <TimelineNode icon={icon} isFirst={isFirst} isLast={isLast} showRail={showRail} />
      <div className="py-2 min-w-0 flex-1">
        <span className="text-[13px] text-stone-400 leading-snug">{message}</span>
        {children && <div className="mt-1.5 text-[13px]">{children}</div>}
      </div>
    </div>
  );
}

// ── ThoughtBlock — Claude-style: minimal, clean, with MessageRenderer ────
function ThoughtBlock({
  status, isFirst = false, isLast = false, isActive, elapsedSeconds,
}: {
  status: StatusMessageProps["status"];
  isFirst?: boolean;
  isLast?: boolean;
  isActive?: boolean;
  elapsedSeconds?: number;
}) {
  const [open, setOpen] = useState(true);
  const isThinking = isActive !== undefined ? isActive : isLast;

  const rawText = cleanThoughtText(status.content || status.message);
  const allSteps = parseThoughtSteps(rawText);

  const [shownCount, setShownCount] = useState<number>(() =>
    isThinking ? 0 : allSteps.length
  );

  useEffect(() => {
    if (!isThinking) setShownCount(allSteps.length);
  }, [isThinking, allSteps.length]);

  useEffect(() => {
    if (!isThinking) return;
    if (shownCount >= allSteps.length) return;
    const t = setTimeout(
      () => setShownCount((c) => c + 1),
      shownCount === 0 ? 80 : 700,
    );
    return () => clearTimeout(t);
  }, [isThinking, shownCount, allSteps.length]);

  const activeStepText = allSteps[shownCount - 1] ?? "";
  const animatedActive = useWordByWord(activeStepText, isThinking && shownCount > 0);

  if (!rawText) return null;

  const stepsToRender = allSteps.slice(0, shownCount);

  const railIcon = isThinking ? (
    <span className="size-4 flex items-center justify-center">
      <span className="relative size-3">
        <span className="absolute inset-0 rounded-full border border-stone-500/40 border-t-stone-400 animate-spin" />
      </span>
    </span>
  ) : (
    <span className="size-4 flex items-center justify-center">
      <span className="size-1.5 rounded-full bg-stone-600/60" />
    </span>
  );

  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center w-4 shrink-0 pt-2">
        {railIcon}
      </div>
      <div className="py-2 min-w-0 flex-1">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-300 transition-colors select-none"
        >
          {isThinking ? (
            <span className="text-stone-400">Thinking…</span>
          ) : (
            <>
              <span className="text-stone-400">
                Thinking{elapsedSeconds != null ? ` · ${elapsedSeconds}s` : ""}
              </span>
              <ChevronDown
                className={`size-3.5 text-stone-600 transition-transform duration-200 ${
                  open ? "rotate-180" : "rotate-0"
                }`}
              />
            </>
          )}
        </button>

        {open && stepsToRender.length > 0 && (
          <div className="mt-2.5 ml-0.5 flex flex-col">
            {stepsToRender.map((step, i) => {
              const isLastShown = i === stepsToRender.length - 1;
              const isAnimating = isThinking && isLastShown;
              const text = isAnimating ? animatedActive : step;
              const hasLineBelow = i < stepsToRender.length - 1 || (isThinking && isLastShown);

              return (
                <div
                  key={i}
                  className="flex gap-2 items-start"
                  style={{
                    animation: !isThinking
                      ? "thoughtStepIn 0.3s ease both"
                      : undefined,
                    animationDelay: !isThinking ? `${i * 0.1}s` : undefined,
                  }}
                >
                  <div className="flex flex-col items-center shrink-0 w-2.5 self-stretch">
                    <span
                      className={`mt-[5px] size-[4px] rounded-full shrink-0 ${
                        isAnimating ? "bg-stone-500" : "bg-stone-600/50"
                      }`}
                    />
                    {hasLineBelow && (
                      <div className="w-px flex-1 mt-1 min-h-[10px] bg-stone-700/30" />
                    )}
                  </div>

                  <div
                    className={`text-[13px] leading-relaxed pb-2.5 min-w-0 flex-1 ${
                      isAnimating ? "text-stone-300" : "text-stone-400/80"
                    }`}
                  >
                    <MessageRenderer content={text || ""} onCitationClick={() => {}} sources={[]} />
                    {isAnimating && (
                      <span
                        className="inline-block w-px h-[13px] bg-stone-400 ml-0.5 align-middle"
                        style={{ animation: "blink 1s step-end infinite" }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <style>{`
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes thoughtStepIn {
            from { opacity:0; transform:translateY(4px); }
            to   { opacity:1; transform:translateY(0);   }
          }
        `}</style>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function StatusMessage({
  status, isFirst = false, isLast = false, isActive, onSourceClick, elapsedSeconds,
}: StatusMessageProps) {
  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return url || "unknown"; }
  };

  const trustColor = (url: string) => {
    const { score } = calculateTrustScore(url);
    if (score >= 90) return "border-stone-600/40 bg-stone-700/20 text-stone-400";
    if (score >= 70) return "border-stone-600/30 bg-stone-700/15 text-stone-400/80";
    if (score >= 50) return "border-stone-600/20 bg-stone-700/10 text-stone-400/60";
    return "border-stone-600/15 bg-stone-700/5 text-stone-400/50";
  };

  if (status.subtype === "complete") return null;

  if (status.subtype === "thought") {
    return <ThoughtBlock status={status} isFirst={isFirst} isLast={isLast} isActive={isActive} elapsedSeconds={elapsedSeconds} />;
  }

  if (status.subtype === "weather") {
    const apiLabel = status.data?.hasKey ? "OpenWeatherMap" : "Open-Meteo";
    return (
      <StepRow
        icon={<WeatherIcon state="fetching" cls={isActive ? "text-stone-400" : "text-stone-500/60"} />}
        message={`${status.message} (via ${apiLabel})`} isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

  if (status.subtype === "weather_success") {
    const source: string = status.data?.source ?? "";
    const isOWM = source === "OpenWeatherMap";
    return (
      <StepRow
        icon={<WeatherIcon state="success" cls="text-stone-400" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      >
        {source && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium mt-1 ${
              isOWM
                ? "border-orange-500/30 bg-orange-500/8 text-orange-400/80"
                : "border-sky-500/30 bg-sky-500/8 text-sky-400/80"
            }`}
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3 shrink-0">
              <circle cx="6" cy="4.5" r="2" />
              <path d="M1.5 8.5c0-1.1.8-2 2-2h5c1.2 0 2 .9 2 2a1.2 1.2 0 0 1-1.2 1.2H2.7A1.2 1.2 0 0 1 1.5 8.5z" />
            </svg>
            {source}
          </span>
        )}
      </StepRow>
    );
  }

  if (status.subtype === "weather_error") {
    return (
      <StepRow
        icon={<WeatherIcon state="error" cls="text-stone-500" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  if (status.subtype === "searching") {
    return (
      <StepRow
        icon={<SearchIcon cls={isActive ? "text-stone-400" : "text-stone-500/60"} />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

  if (status.subtype === "found_sources") {
    const sources: string[] = status.data?.sources ?? [];
    if (sources.length === 0) return null;
    return (
      <StepRow
        icon={<GlobeIcon cls="text-stone-500" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      >
        <div className="flex flex-wrap gap-1.5">
          {sources.map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              onClick={() => onSourceClick?.(url)}
              aria-label={`Open ${getDomain(url)}`}
              className={`group flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-all duration-150 hover:scale-[1.02] hover:text-stone-200 border-l-2 ${trustColor(url)}`}
            >
              <span className="truncate max-w-[130px]">{getDomain(url)}</span>
              <LinkIcon cls="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          ))}
        </div>
      </StepRow>
    );
  }

  if (status.subtype === "reading") {
    const titles: string[] = status.data?.titles ?? [];
    const urls: string[] = status.data?.urls ?? [];
    return (
      <StepRow
        icon={<BookIcon cls={isActive ? "text-stone-400" : "text-stone-500/60"} />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
      >
        {titles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {titles.map((title, idx) => (
              <button
                key={`${urls[idx] ?? idx}`}
                onClick={() => urls[idx] && onSourceClick?.(urls[idx])}
                aria-label={`View source: ${title}`}
                className="group flex items-center gap-1 rounded-md border border-stone-700/40 bg-stone-800/10 px-2 py-0.5 text-[11px] text-stone-500/80 transition-all duration-150 hover:border-stone-500/50 hover:bg-stone-700/20 hover:text-stone-300"
              >
                <span className="truncate max-w-[180px]">{title}</span>
                <LinkIcon cls="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </StepRow>
    );
  }

  if (status.subtype === 'generating_chart') {
    return (
      <StepRow
        icon={
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round"
               className={`size-5 shrink-0 ${isActive ? 'text-violet-400' : 'text-stone-500/60'}`}>
            <rect x="2.5" y="10" width="3" height="7.5" rx="0.5" />
            <rect x="8.5" y="6"  width="3" height="11.5" rx="0.5" />
            <rect x="14.5" y="2.5" width="3" height="15" rx="0.5" />
            <line x1="1.5" y1="18" x2="18.5" y2="18" strokeWidth="1.2" />
          </svg>
        }
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  if (status.subtype === 'generating_file') {
    return (
      <StepRow
        icon={
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round"
               className={`size-5 shrink-0 ${isActive ? 'text-sky-400' : 'text-stone-500/60'}`}>
            <path d="M5 2.5h7l3.5 3.5V17a1 1 0 0 1-1-1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
            <polyline points="12,2.5 12,6 15.5,6" />
            <line x1="7" y1="9.5"  x2="13" y2="9.5"  strokeWidth="1.2" />
            <line x1="7" y1="12.5" x2="11" y2="12.5" strokeWidth="1.2" />
            <line x1="15.5" y1="12"   x2="15.5" y2="14"   strokeWidth="1.3" />
            <line x1="14.5" y1="13"   x2="16.5" y2="13"   strokeWidth="1.3" />
          </svg>
        }
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  // ─── reading_skill — model is loading generation rules for a doc type ───
  if (status.subtype === 'reading_skill') {
    const docType: string = status.data?.docType ?? '';
    return (
      <StepRow
        icon={<SkillIcon cls={isActive ? 'text-violet-400' : 'text-stone-500/60'} />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      >
        {docType && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/5 text-violet-400/70 px-2 py-0.5 text-[11px] font-medium mt-1">
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"
                 strokeLinecap="round" className="size-2.5 shrink-0">
              <path d="M2 1h6v8H2z" /><line x1="3.5" y1="3.5" x2="6.5" y2="3.5" strokeWidth="1" />
              <line x1="3.5" y1="5.5" x2="5.5" y2="5.5" strokeWidth="1" />
            </svg>
            {docType.toUpperCase()} rules
          </span>
        )}
      </StepRow>
    );
  }

  // ─── image_enhancing — AI is rewriting the prompt for higher quality ────
  if (status.subtype === 'image_enhancing') {
    return (
      <StepRow
        icon={<WandIcon cls={isActive ? 'text-amber-400' : 'text-stone-500/60'} />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  // ─── image_generating — diffusion model is running ───────────────────────
  if (status.subtype === 'image_generating') {
    return (
      <StepRow
        icon={<ImageIcon cls={isActive ? 'text-rose-400' : 'text-stone-500/60'} />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  if (status.subtype === "error" || status.subtype === "no_results") {
    return (
      <StepRow
        icon={<WarnIcon cls="text-stone-400" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  if (status.subtype === "done") {
    return (
      <StepRow
        icon={<DoneIcon cls="text-stone-400" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  return (
    <StepRow
      icon={<span className="size-4 flex items-center justify-center"><span className="size-1.5 rounded-full bg-stone-600" /></span>}
      message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
    />
  );
}