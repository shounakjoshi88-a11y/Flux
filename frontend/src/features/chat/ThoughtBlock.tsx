import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { MessageRenderer } from "./MessageRenderer";
import { useElapsedSeconds } from "./TerminalBlock";
import { ClockIcon } from "./icons";
type IProps = { cls?: string };

export function useWordByWord(fullText: string, isActive: boolean): string {
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
    const t = setTimeout(() => setVisibleCount(c => c + 2), 30);
    return () => clearTimeout(t);
  }, [fullText, clampedCount, isActive, tokens.length]);

  return tokens.slice(0, clampedCount).join("");
}

// ── Timeline column ──────────────────────────────────────────────────────────
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
        <div className="relative z-10 flex items-center justify-center">{icon}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-4 shrink-0 self-stretch">
      <div className={`${lineWidth} h-[12px] shrink-0 transition-opacity duration-300 ${!isFirst ? "opacity-100" : "opacity-0"} ${lineColor}`} />

      <div className="flex items-center justify-center h-4 w-4 shrink-0 relative">
        <div className={`absolute left-1/2 -translate-x-1/2 ${lineWidth} ${lineColor}
          ${isFirst ? "top-[12px]" : "top-0"}
          ${isLast ? "bottom-[12px]" : "bottom-0"}`}
        />
        <div className="relative z-10 flex items-center justify-center">{icon}</div>
      </div>

      {isLast ? (
        <>
          <div className={`${lineWidth} flex-1 ${lineColor}`} />
          <div className="flex items-center justify-center h-4 w-4 shrink-0 mb-2">
            <svg viewBox="0 0 16 16" className="size-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" strokeWidth="1" />
              <polyline points="5.5,8 7.5,10 10.5,6" />
            </svg>
          </div>
        </>
      ) : (
        <div className={`${lineWidth} flex-1 mt-px transition-opacity duration-300 opacity-100 ${lineColor}`} />
      )}
    </div>
  );
}

// ── Generic step row ─────────────────────────────────────────────────────────
export function StepRow({
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
      <div className={`min-w-0 flex-1 flex flex-col ${isLast ? 'pt-3 pb-0' : 'pt-3 pb-2'}`}>
        <div className="flex items-start gap-1">
          <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium break-words min-w-0">{message}</span>
          {rightSlot && <span className="inline-flex shrink-0 align-middle ml-auto">{rightSlot}</span>}
        </div>
        {children && <div className="mt-1.5 text-[13px]">{children}</div>}
        {isLast && (
          <div className="flex items-center h-4 mt-10 mb-2">
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Spinner icon ──────────────────────────────────────────────────────────────
export function SpinnerIcon({ cls = "" }: IProps) {
  return (
    <span className={`size-4 flex items-center justify-center ${cls}`}>
      <span className="relative size-3">
        <span className="absolute inset-0 rounded-full border border-[var(--accent)]/25 border-t-[var(--accent)] animate-spin" />
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThoughtBlock — header like "Searched the web", clock icon per step,
// single main rail, no clock in timeline icon.
// Exported so MessageItem.tsx can use it for `thought` parts.
// ─────────────────────────────────────────────────────────────────────────────
export function cleanThoughtText(text: string): string {
  return text
    .replace(/<ANSWER>[\s\S]*?<\/ANSWER>/gi, "")
    .replace(/<ANSWER>[\s\S]*/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*/gi, "")
    .replace(/<\/?(?:THOUGHT|think|[A-Z_]+)>/gi, "")
    .trim();
}

export function parseThoughtSteps(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const strip = (s: string) => s.replace(/^[\s•·‣▸\-–—]+/, "").trim();
  const meaningful = (s: string) => strip(s).length > 8;
  const byDouble = clean.split(/\n{2,}/).map(strip).filter(meaningful);
  if (byDouble.length > 1) return byDouble;
  const bySingle = clean.split(/\n/).map(strip).filter(meaningful);
  if (bySingle.length > 1) return bySingle;
  const byBullet = clean.split(/\s*[•·‣▸]\s*/).map(strip).filter(meaningful);
  if (byBullet.length > 1) return byBullet;
  const byStep = clean.split(/(?=\bStep\s+\d+\b)/i).map(strip).filter(meaningful);
  if (byStep.length > 1) return byStep;
  return [strip(clean)];
}

export function ThoughtBlock({
  content,
  message,
  isFirst = false,
  isLast = false,
  isActive,
  elapsedSeconds,
}: {
  content?: string;
  message?: string;
  isFirst?: boolean;
  isLast?: boolean;
  isActive?: boolean;
  elapsedSeconds?: number;
}) {
  const [open, setOpen] = useState(true);
  const isThinking = isActive !== undefined ? isActive : isLast;
  const rawText = cleanThoughtText(content || message || "");
  const allSteps = parseThoughtSteps(rawText);
  const liveElapsed = useElapsedSeconds(isThinking);
  const displayElapsed = elapsedSeconds != null ? elapsedSeconds : (isThinking ? Math.round(liveElapsed) : null);

  const [shownCount, setShownCount] = useState<number>(() => isThinking ? 0 : allSteps.length);

  useEffect(() => {
    if (!isThinking) setShownCount(allSteps.length);
  }, [isThinking, allSteps.length]);

  useEffect(() => {
    if (!isThinking) return;
    if (shownCount >= allSteps.length) return;
    const t = setTimeout(() => setShownCount(c => c + 1), shownCount === 0 ? 80 : 700);
    return () => clearTimeout(t);
  }, [isThinking, shownCount, allSteps.length]);

  const activeStepText = allSteps[shownCount - 1] ?? "";
  const animatedActive = useWordByWord(activeStepText, isThinking && shownCount > 0);

  if (!rawText) return null;
  const stepsToRender = allSteps.slice(0, shownCount);

  // Build flat list of visual rows
  type Row = 
    | { kind: 'header' }
    | { kind: 'blank' }
    | { kind: 'step-line';     isFirstInStep: boolean; text: string; isAnimating: boolean }
    | { kind: 'step-composite'; lines: { isFirstInStep: boolean; text: string }[] };

  const rows: Row[] = [];
  rows.push({ kind: 'header' });
  rows.push({ kind: 'blank' });

  stepsToRender.forEach((step, i) => {
    const isLastStep = i === stepsToRender.length - 1;
    const stepText = isThinking && isLastStep ? animatedActive : step;
    const lines = stepText.split('\n').filter(l => l.trim());

    if (isLastStep && isLast && !isThinking) {
      // Last step — render as composite with Done footer
      rows.push({
        kind: 'step-composite',
        lines: lines.map(text => ({ isFirstInStep: false, text })),
      });
    } else {
      lines.forEach((line, li) => {
        rows.push({
          kind: 'step-line',
          isFirstInStep: li === 0,
          text: line,
          isAnimating: isThinking && isLastStep && li === 0,
        });
      });
      if (i < stepsToRender.length - 1) rows.push({ kind: 'blank' });
    }
  });

  const lineCls = "w-px bg-[var(--text-muted)]/15";
  const visibleRows = rows.filter(r => r.kind === 'header' || open);

  const railIcon = (row: Row) => {
    if (row.kind === 'step-line' && row.isFirstInStep)
      return <ClockIcon className={`size-4 ${row.isAnimating ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/60"}`} />;
    return null;
  };

  return (
    <div className="flex flex-col py-2">
      {visibleRows.map((row, ri) => {
        const hasNext = ri < visibleRows.length - 1;

        if (row.kind === 'header') {
          return (
            <div key={ri} className="flex items-start">
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => setOpen(v => !v)}
                  aria-expanded={open}
                  className="flex items-center gap-1.5 w-full text-left select-none"
                >
                  <span className="text-[14px] leading-[20px] font-normal text-[var(--text-primary)]">
                    {isThinking ? 'Thinking' : `Thought${displayElapsed != null ? ` · ${displayElapsed}s` : ''}`}
                  </span>
                  <span className="shrink-0 flex items-center gap-1.5">
                    {isThinking && (
                      <span className="inline-flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <span key={i} className="size-1 rounded-full bg-[var(--accent)]/70"
                            style={{ animation: `thoughtDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </span>
                    )}
                    <ChevronDown className={`size-3.5 text-[var(--text-secondary)]/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                  </span>
                </button>
              </div>
            </div>
          );
        }

        if (row.kind === 'step-composite') {
          return (
            <div key={ri} className="flex gap-2.5 items-stretch">
              {/* Rail: ClockIcon → flex-1 line → checkmark */}
              <div className="w-4 shrink-0 flex flex-col items-center">
                <ClockIcon className="size-4 text-[var(--text-secondary)]/60" />
                <div className="w-px flex-1 bg-[var(--text-muted)]/15" />
                <div className="flex items-center justify-center h-4 w-4 mb-2">
                  <svg viewBox="0 0 16 16" className="size-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="6" strokeWidth="1" />
                    <polyline points="5.5,8 7.5,10 10.5,6" />
                  </svg>
                </div>
              </div>
              {/* Content: lines → mt-10 → Done */}
              <div className="min-w-0 flex-1 flex flex-col">
                {row.lines.map((line, li) => (
                  <div key={li} className={`text-[14px] leading-[21px] ${li === row.lines.length - 1 ? "" : "pb-2.5"} text-[var(--text-secondary)]/70`}>
                    <MessageRenderer content={line.text} onCitationClick={() => { }} sources={[]} />
                  </div>
                ))}
                <div className="flex items-center h-4 mt-10 mb-2">
                  <span className="text-[14px] leading-[20px] font-normal text-[var(--text-secondary)]">Done</span>
                </div>
              </div>
            </div>
          );
        }

        // blank or step-line
        const icon = railIcon(row);
        return (
          <div key={ri} className="flex gap-2.5 items-start">
            <div className="w-4 shrink-0 flex flex-col items-center self-stretch">
              <div className="flex flex-col items-center flex-1">
                {icon || <div className="w-px bg-[var(--text-muted)]/15" />}
                {hasNext && <div className={`${lineCls} flex-1 min-h-[4px]`} />}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {row.kind === 'step-line' && (
                <div className={`text-[14px] leading-[21px] ${row.isAnimating ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]/70"}`}>
                  <MessageRenderer content={row.text} onCitationClick={() => { }} sources={[]} />
                  {row.isAnimating && (
                    <span className="inline-block w-px h-[13px] bg-[var(--text-secondary)] ml-0.5 align-middle" style={{ animation: "blink 1s step-end infinite" }} />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GenericToolBlock — for `tool_call` parts with arbitrary toolName/args/result.
// Smart rendering: terminal for bash/python, file for write/read, JSON for others.
// ─────────────────────────────────────────────────────────────────────────────

