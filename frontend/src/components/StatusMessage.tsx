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

// Globe — sphere with equator, tropic lines, and two meridian curves (tilted left)
const GlobeIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <g transform="rotate(-20 10 10)">
      <circle cx="10" cy="10" r="7.5" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" />
      <line x1="4" y1="6.5" x2="16" y2="6.5" strokeWidth="1" opacity="0.5" />
      <line x1="4" y1="13.5" x2="16" y2="13.5" strokeWidth="1" opacity="0.5" />
      <path d="M10 2.5c-3 2.5-4 4.8-4 7.5s1 5 4 7.5" />
      <path d="M10 2.5c3 2.5 4 4.8 4 7.5s-1 5-4 7.5" />
    </g>
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
  rightSlot?: React.ReactNode;
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
  const lineColor = "bg-[var(--text-muted)]/15";
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
        className={`${lineWidth} h-[12px] shrink-0 transition-opacity duration-300 ${!isFirst ? "opacity-100" : "opacity-0"} ${lineColor}`}
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

      {isLast ? (
        <>
          <div className={`${lineWidth} flex-1 ${lineColor}`} />
          <div className="flex items-center justify-center h-4 w-4 shrink-0 mb-2">
            <svg viewBox="0 0 14 14" className="size-3.5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="5.5" strokeWidth="1" />
              <polyline points="3,7 6,10 11,4" />
            </svg>
          </div>
        </>
      ) : (
        <div className={`${lineWidth} flex-1 mt-px transition-opacity duration-300 opacity-100 ${lineColor}`} />
      )}
    </div>
  );
}

// ── Generic step row — Claude-style: compact, muted ─────────────────────
function StepRow({
  icon, message, children, isFirst = false, isLast = false, pulse = false, showRail = true, rightSlot,
}: {
  icon: React.ReactNode;
  message: string;
  children?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  pulse?: boolean;
  showRail?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <TimelineNode icon={icon} isFirst={isFirst} isLast={isLast} showRail={showRail} />
      <div className="py-2 min-w-0 flex-1">
        <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">{message}</span>
        {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1">{rightSlot}</span>}
        {children && <div className="mt-1.5 text-[13px]">{children}</div>}
        {isLast && (
          <div className="flex items-center h-4 mt-1">
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
          </div>
        )}
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
        <span className="absolute inset-0 rounded-full border border-[var(--accent)]/25 border-t-[var(--accent)] animate-spin" />
      </span>
    </span>
  ) : (
    <span className="size-4 flex items-center justify-center">
      <span className="size-1.5 rounded-full bg-[var(--text-secondary)]/40" />
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
          className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors select-none"
        >
          {isThinking ? (
            <span className="text-[var(--text-secondary)]">Thinking…</span>
          ) : (
            <>
              <span className="text-[var(--text-secondary)]">
                Thinking{elapsedSeconds != null ? ` · ${elapsedSeconds}s` : ""}
              </span>
              <ChevronDown
                className={`size-3.5 text-[var(--text-muted)] transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"
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
                      className={`mt-[5px] size-[4px] rounded-full shrink-0 ${isAnimating ? "bg-[var(--accent)]" : "bg-[var(--text-secondary)]/40"
                        }`}
                    />
                    {hasLineBelow && (
                      <div className="w-px flex-1 mt-1 min-h-[10px] bg-[var(--text-muted)]/15" />
                    )}
                  </div>

                  <div
                    className={`text-[13px] leading-relaxed pb-2.5 min-w-0 flex-1 ${isAnimating ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]/80"
                      }`}
                  >
                    <MessageRenderer content={text || ""} onCitationClick={() => { }} sources={[]} />
                    {isAnimating && (
                      <span
                        className="inline-block w-px h-[13px] bg-[var(--text-secondary)] ml-0.5 align-middle"
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
  status, isFirst = false, isLast = false, isActive, onSourceClick, elapsedSeconds, rightSlot,
}: StatusMessageProps) {
  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return url || "unknown"; }
  };

  const trustColor = (score: number) => {
    if (score >= 90) return "text-[var(--text-secondary)]";
    if (score >= 70) return "text-[var(--text-secondary)]/80";
    if (score >= 50) return "text-[var(--text-secondary)]/60";
    return "text-[var(--text-secondary)]/40";
  };

  const [detailOpen, setDetailOpen] = useState(false);

  if (status.subtype === "complete") return null;

  if (status.subtype === "thought") {
    return <ThoughtBlock status={status} isFirst={isFirst} isLast={isLast} isActive={isActive} elapsedSeconds={elapsedSeconds} />;
  }

  if (status.subtype === "weather") {
    const apiLabel = status.data?.hasKey ? "OpenWeatherMap" : "Open-Meteo";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WeatherIcon state="fetching" cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={`${status.message} (via ${apiLabel})`} isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

  if (status.subtype === "weather_success") {
    const source: string = status.data?.source ?? "";
    const isOWM = source === "OpenWeatherMap";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WeatherIcon state="success" cls="text-[var(--text-secondary)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      >
        {source && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium mt-1 ${isOWM
              ? "border-[var(--accent)]/20 bg-[var(--accent)]/8 text-[var(--accent)]/80"
              : "border-teal-500/30 bg-teal-500/8 text-teal-400/80"
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
      <StepRow rightSlot={rightSlot}
        icon={<WeatherIcon state="error" cls="text-[var(--text-muted)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  if (status.subtype === "searching") {
    return (
      <div className="py-2 flex items-start gap-1 w-full">
        <div className="min-w-0 flex-1 text-[13px] text-[var(--text-secondary)] leading-snug font-medium break-words">{status.message}</div>
        {rightSlot && <div className="shrink-0 mt-0.5">{rightSlot}</div>}
      </div>
    );
  }

  if (status.subtype === "found_sources") {
    const sources: string[] = status.data?.sources ?? [];
    if (sources.length === 0) return null;
    return (
      <StepRow rightSlot={rightSlot}
        icon={<GlobeIcon cls="text-[var(--text-muted)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      >
        <div className="flex flex-wrap gap-1.5">
          {sources.map((url, idx) => {
            const { score } = calculateTrustScore(url);
            return (
              <button
                key={`${url}-${idx}`}
                onClick={() => onSourceClick?.(url)}
                aria-label={`Open ${getDomain(url)}`}
                className={`group flex items-center gap-1 rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2 py-0.5 text-[11px] font-medium transition-all duration-150 hover:border-[var(--accent)]/20 hover:text-[var(--text-primary)] border-l-2 ${trustColor(score)}`}
              >
                <span className="truncate max-w-[130px]">{getDomain(url)}</span>
                <LinkIcon cls="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            );
          })}
        </div>
      </StepRow>
    );
  }

  if (status.subtype === "reading") {
    const titles: string[] = status.data?.titles ?? [];
    const urls: string[] = status.data?.urls ?? [];
    return (
      <StepRow rightSlot={rightSlot}
        icon={<BookIcon cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
      >
        {titles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {titles.map((title, idx) => (
              <button
                key={`${urls[idx] ?? idx}`}
                onClick={() => urls[idx] && onSourceClick?.(urls[idx])}
                aria-label={`View source: ${title}`}
                className="group flex items-center gap-1 rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]/80 transition-all duration-150 hover:border-[var(--accent)]/20 hover:bg-[var(--surface-bg)] hover:text-[var(--text-primary)]"
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
      <StepRow rightSlot={rightSlot}
        icon={
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"
            className={`size-5 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/40'}`}>
            <rect x="2.5" y="10" width="3" height="7.5" rx="0.5" />
            <rect x="8.5" y="6" width="3" height="11.5" rx="0.5" />
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

  // ─── Collapsible detail row (used by generating_file and reading_skill) ───

  if (status.subtype === 'generating_file') {
    const docType: string = status.data?.docType ?? '';
    const topic: string = status.data?.topic ?? '';
    return (
      <div className="relative overflow-hidden">
        {/* Flare sweep across this line during generation */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-md">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/6 to-transparent
                            animate-flare-sweep" />
          </div>
        )}
        <StepRow rightSlot={rightSlot}
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"
              className={`size-5 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/40'}`}>
              <path d="M5 2.5h7l3.5 3.5V17a1 1 0 0 1-1-1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
              <polyline points="12,2.5 12,6 15.5,6" />
              <line x1="7" y1="9.5" x2="13" y2="9.5" strokeWidth="1.2" />
              <line x1="7" y1="12.5" x2="11" y2="12.5" strokeWidth="1.2" />
              <line x1="15.5" y1="12" x2="15.5" y2="14" strokeWidth="1.3" />
              <line x1="14.5" y1="13" x2="16.5" y2="13" strokeWidth="1.3" />
            </svg>
          }
          message={status.message}
          isFirst={isFirst}
          isLast={isLast}
          pulse={isActive}
        >
          <button
            onClick={() => setDetailOpen(v => !v)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1"
          >
            <ChevronDown className={`size-3 transition-transform duration-200 ${detailOpen ? 'rotate-180' : ''}`} />
            {detailOpen ? 'Hide build details' : 'Build details'}
          </button>
          {detailOpen && (docType || topic) && (
            <div className="mt-1.5 space-y-1 text-[12px] text-[var(--text-muted)]">
              {docType && <div className="flex items-center gap-1.5"><span className="text-[var(--text-muted)]">Type:</span> <span className="text-[var(--text-secondary)] font-medium">{docType.toUpperCase()}</span></div>}
              {topic && <div className="flex items-center gap-1.5"><span className="text-[var(--text-muted)]">Topic:</span> <span className="text-[var(--text-secondary)]">{topic}</span></div>}
            </div>
          )}
        </StepRow>
      </div>
    );
  }

  // ─── reading_skill — model is loading generation rules for a doc type ───
  if (status.subtype === 'reading_skill') {
    const docType: string = status.data?.docType ?? '';
    return (
      <div className="py-2 w-full">
        <div className="flex items-start gap-1 w-full">
          <div className="min-w-0 flex-1 text-[13px] text-[var(--text-secondary)] leading-snug font-medium break-words">
            {status.message}
            {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1">{rightSlot}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {docType && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/20 bg-[var(--accent)]/5 text-[var(--accent)]/80 px-2 py-0.5 text-[11px] font-medium">
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" className="size-2.5 shrink-0">
                <path d="M2 1h6v8H2z" /><line x1="3.5" y1="3.5" x2="6.5" y2="3.5" strokeWidth="1" />
                <line x1="3.5" y1="5.5" x2="5.5" y2="5.5" strokeWidth="1" />
              </svg>
              {docType.toUpperCase()} rules
            </span>
          )}
          <button
            onClick={() => setDetailOpen(v => !v)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronDown className={`size-3 transition-transform duration-200 ${detailOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {detailOpen && docType && (
          <div className="mt-1.5 text-[12px] text-[var(--text-muted)] leading-relaxed">
            Loaded <span className="text-[var(--text-secondary)] font-medium">{docType.toUpperCase()}</span> generation rules — the model will follow these formatting guidelines when building the document.
          </div>
        )}
        {isLast && (
          <div className="flex items-center h-4 mt-1">
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
          </div>
        )}
      </div>
    );
  }

  // ─── image_enhancing — AI is rewriting the prompt for higher quality ────
  if (status.subtype === 'image_enhancing') {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WandIcon cls={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/40'} />}
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
      <StepRow rightSlot={rightSlot}
        icon={<ImageIcon cls={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/40'} />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  if (status.subtype === "error" || status.subtype === "no_results") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WarnIcon cls="text-[var(--text-secondary)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  if (status.subtype === "done") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<DoneIcon cls="text-[var(--text-secondary)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  return (
    <StepRow rightSlot={rightSlot}
      icon={<span className="size-4 flex items-center justify-center"><span className="size-1.5 rounded-full bg-[var(--text-muted)]" /></span>}
      message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
    />
  );
}