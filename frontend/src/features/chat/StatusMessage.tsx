// src/components/StatusMessage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Inline status renderer — redesigned terminal / thought / file / tool_call UIs.
// Drop-in replacement: same props & exports as the previous version.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { MessageRenderer } from "./MessageRenderer";
import { calculateReputationScore } from "../../utils/ReputationScore";
import { SearchIcon, GlobeIcon, BookIcon, LinkIcon, WarnIcon, DoneIcon, ExtractIcon, TerminalIcon, FileIcon, ClockIcon, WikiIcon, PackageIcon, WeatherIcon, WandIcon, ImageIcon, ChartIcon, LANG_COLORS } from "./icons";
import { TerminalBlock, TerminalOutputSection, FileCodeBlock, useElapsedSeconds } from "./TerminalBlock";

type IProps = { cls?: string };
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
function SpinnerIcon({ cls = "" }: IProps) {
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
function cleanThoughtText(text: string): string {
  return text
    .replace(/<ANSWER>[\s\S]*?<\/ANSWER>/gi, "")
    .replace(/<ANSWER>[\s\S]*/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*/gi, "")
    .replace(/<\/?(?:THOUGHT|think|[A-Z_]+)>/gi, "")
    .trim();
}

function parseThoughtSteps(text: string): string[] {
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
                  <span className="text-[13px] font-medium text-[var(--text-secondary)]/80">
                    {isThinking ? 'Thinking' : `Thought${displayElapsed != null ? ` · ${displayElapsed}s` : ''}`}
                  </span>
                  <span className="ml-auto shrink-0 flex items-center gap-1.5">
                    {isThinking && (
                      <span className="inline-flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <span key={i} className="size-1 rounded-full bg-[var(--accent)]/70"
                            style={{ animation: `thoughtDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </span>
                    )}
                    <ChevronDown className={`size-3 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
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
                  <div key={li} className={`text-[13px] leading-relaxed ${li === row.lines.length - 1 ? "" : "pb-2.5"} text-[var(--text-secondary)]/40`}>
                    <MessageRenderer content={line.text} onCitationClick={() => { }} sources={[]} />
                  </div>
                ))}
                <div className="flex items-center h-4 mt-10 mb-2">
                  <span className="text-[13px] font-medium text-[var(--text-secondary)] leading-snug">Done</span>
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
                <div className={`text-[13px] leading-relaxed ${row.isAnimating ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]/40"}`}>
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
function GenericToolBlock({
  toolName,
  args,
  result,
  status,
  message,
  isFirst,
  isLast,
  rightSlot,
}: {
  toolName: string;
  args: any;
  result?: string;
  status: string;
  message?: string;
  isFirst: boolean;
  isLast: boolean;
  rightSlot?: React.ReactNode;
}) {
  const isDone = status === "done" || status === "success" || status === "completed";
  const isRunning = status === "running" || status === "pending";
  const isErr = status === "error";

  // Decide icon based on tool name
  const isExecution = /bash|python|sandbox|terminal|package|run|exec/i.test(toolName);
  const isFileTool = /file|write|edit|read|generat/i.test(toolName);
  const isWiki = /wiki/i.test(toolName);
  const isSearch = /search|query/i.test(toolName);
  const isInstall = /package|install|pip|npm/i.test(toolName);

  const iconColor = isRunning
    ? "text-[var(--accent)]"
    : isErr
      ? "text-red-400/70"
      : isDone
        ? "text-emerald-400/70"
        : "text-[var(--text-secondary)]/40";

  const toolIconEl = isExecution
    ? <TerminalIcon cls={iconColor} />
    : isFileTool
      ? <FileIcon cls={iconColor} />
      : isWiki
        ? <WikiIcon cls={iconColor} />
        : isSearch
          ? <SearchIcon cls={iconColor} />
          : isInstall
            ? <PackageIcon cls={iconColor} />
            : isRunning
              ? <SpinnerIcon />
              : <span className="size-4 flex items-center justify-center">
                <span className={`size-1.5 rounded-full ${isDone ? 'bg-emerald-400/70' : isErr ? 'bg-red-400/70' : 'bg-[var(--text-muted)]'}`} />
              </span>;

  // Extract command/code for terminal rendering
  const terminalCmd = args?.command ?? args?.code ?? args?.script ?? "";
  const terminalLang = /python/i.test(toolName) ? 'python' : 'bash';

  // Extract file info for file rendering
  const filePath = args?.path ?? args?.filename ?? "";
  const filename = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : (args?.filename ?? "");
  const fileContent = args?.content ?? args?.code ?? args?.new_str ?? "";
  const fileLang = args?.language ?? (filename ? (filename.split('.').pop() || 'text') : 'text');

  // Detect if result looks like JSON
  const isResultJson: boolean | undefined = result && result.length > 0 && (() => {
    const t = result.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
  })() || undefined;

  // Pretty-print args as key-value pairs (not raw JSON)
  const argEntries = args && typeof args === 'object' ? Object.entries(args).filter(([, v]) => v != null && v !== '') : [];

  return (
    <div className="flex gap-2.5">
      <TimelineNode icon={toolIconEl} isFirst={isFirst} isLast={isLast} />
      <div className="py-2 min-w-0 flex-1">
        {/* Header: message + tool name badge + status pill */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">
            {message || toolName}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]/80 font-mono bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded px-1.5 py-0.5">
            {toolName}
          </span>
          {/* Status pill */}
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]/80 font-mono">
              <span className="size-[5px] rounded-full bg-[var(--accent)]/80 animate-pulse" />
              running
            </span>
          )}
          {isDone && !isRunning && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400/70 font-mono">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1.5,5.5 4,8 8.5,2.5" />
              </svg>
              done
            </span>
          )}
          {isErr && (
            <span className="flex items-center gap-1 text-[10px] text-red-400/70 font-mono">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="2.5" y1="2.5" x2="7.5" y2="7.5" />
                <line x1="7.5" y1="2.5" x2="2.5" y2="7.5" />
              </svg>
              error
            </span>
          )}
          {rightSlot && <span className="inline-flex shrink-0 align-middle">{rightSlot}</span>}
        </div>

        {/* Terminal block for execution tools */}
        {isExecution && terminalCmd ? (
          <TerminalBlock
            command={terminalCmd}
            language={terminalLang}
            isRunning={isRunning}
            stdout={result || undefined}
          />
        ) : isFileTool && filename ? (
          <FileCodeBlock
            filename={filename}
            content={fileContent || undefined}
            language={fileLang}
            isRunning={isRunning}
            isSuccess={isDone}
            isError={isErr}
          />
        ) : argEntries.length > 0 ? (
          <PrettyArgsBlock entries={argEntries} result={result} isResultJson={isResultJson} />
        ) : result ? (
          <div className="mt-2 rounded-lg border border-[var(--surface-border)] overflow-hidden" style={{ background: '#0b0b0a' }}>
            <div className="px-3 py-1.5 border-b border-white/[0.05] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider"
              style={{ background: 'rgba(0,0,0,0.2)' }}>
              Output
            </div>
            <pre className="text-[11.5px] leading-relaxed font-mono px-4 py-2.5 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap"
              style={{ color: '#9a978f' }}>
              {result}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Pretty key-value args block with collapsible output ────────────────────
function PrettyArgsBlock({
  entries,
  result,
  isResultJson,
}: {
  entries: [string, any][];
  result?: string;
  isResultJson?: boolean;
}) {
  const [showOutput, setShowOutput] = useState(false);

  const renderValue = (val: any): string => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val, null, 2);
  };

  const isLongValue = (val: any): boolean => {
    if (typeof val === 'string') return val.length > 80 || val.includes('\n');
    return false;
  };

  return (
    <div className="mt-2 rounded-lg border border-[var(--surface-border)] overflow-hidden" style={{ background: '#0b0b0a' }}>
      {/* Input header */}
      <div className="px-3 py-1.5 border-b border-white/[0.05] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider flex items-center gap-1.5"
        style={{ background: 'rgba(0,0,0,0.2)' }}>
        <svg viewBox="0 0 10 10" className="size-2.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1.5,2.5 4,5 1.5,7.5" />
          <line x1="5" y1="7.5" x2="8.5" y2="7.5" />
        </svg>
        Input
        <span className="ml-auto text-[var(--text-muted)]/60 normal-case tracking-normal">{entries.length} {entries.length === 1 ? 'field' : 'fields'}</span>
      </div>
      {/* Key-value rows */}
      <div className="py-1.5">
        {entries.map(([key, val], i) => {
          const long = isLongValue(val);
          const valStr = renderValue(val);
          return (
            <div key={i} className="flex px-3 py-0.5 text-[11.5px] font-mono gap-2 hover:bg-white/[0.015]">
              <span className="text-[#7aa2f7] shrink-0 max-w-[120px] truncate" title={key}>{key}:</span>
              <span className={`text-[#9ece6a] flex-1 ${long ? 'whitespace-pre-wrap break-words' : 'truncate'}`} title={long ? undefined : valStr}>
                {long ? valStr.slice(0, 200) + (valStr.length > 200 ? '…' : '') : valStr}
              </span>
            </div>
          );
        })}
      </div>
      {/* Output section */}
      {result && (
        <>
          <button
            onClick={() => setShowOutput(v => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 border-t border-white/[0.05] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider hover:bg-white/[0.015] transition-colors"
            style={{ background: 'rgba(0,0,0,0.18)' }}
          >
            <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1.5,5 4,7.5 8.5,2.5" />
            </svg>
            Output
            {isResultJson && <span className="text-[var(--text-muted)]/60 normal-case tracking-normal">json</span>}
            <span className="ml-auto flex items-center gap-0.5 normal-case tracking-normal text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <ChevronDown className={`size-3 transition-transform duration-200 ${showOutput ? 'rotate-180' : ''}`} />
              {showOutput ? 'hide' : 'show'}
            </span>
          </button>
          {showOutput && (
            <pre className={`text-[11.5px] leading-relaxed font-mono px-4 py-2.5 overflow-x-auto max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words border-t border-white/[0.03] ${isResultJson ? 'json-highlight' : ''}`}
              style={{ color: '#9a978f' }}>
              {isResultJson ? prettyJson(result) : result}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// Pretty-print JSON with basic syntax coloring via spans
function prettyJson(str: string): React.ReactNode {
  try {
    const parsed = JSON.parse(str);
    const formatted = JSON.stringify(parsed, null, 2);
    // Tokenize for coloring
    const parts: React.ReactNode[] = [];
    const re = /("(?:[^"\\]|\\.)*"\s*:?)|(\b(?:true|false|null)\b)|(-?\d+\.?\d*(?:e[+-]?\d+)?)/gi;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(formatted)) !== null) {
      if (m.index > lastIdx) parts.push(<span key={key++} style={{ color: '#9a978f' }}>{formatted.slice(lastIdx, m.index)}</span>);
      if (m[1]) {
        // string or key
        const isKey = m[1].trim().endsWith(':');
        parts.push(<span key={key++} style={{ color: isKey ? '#7aa2f7' : '#9ece6a' }}>{m[1]}</span>);
      } else if (m[2]) {
        parts.push(<span key={key++} style={{ color: '#ff9e64' }}>{m[2]}</span>);
      } else if (m[3]) {
        parts.push(<span key={key++} style={{ color: '#ff9e64' }}>{m[3]}</span>);
      }
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < formatted.length) parts.push(<span key={key++} style={{ color: '#9a978f' }}>{formatted.slice(lastIdx)}</span>);
    return <>{parts}</>;
  } catch {
    return str;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

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
  searchQuery?: string;
  expanded?: boolean;
}

function StatusMessage({
  status, isFirst = false, isLast = false, isActive, onSourceClick, elapsedSeconds, rightSlot, searchQuery, expanded = true,
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

  const weatherTemp = status.subtype === "weather" && status.data?.status === "completed"
    ? (status.data?.temperature ?? 0) : 0;
  const [displayTemp, setDisplayTemp] = useState(0);
  const prevTempKey = useRef(0);
  useEffect(() => {
    const end = Math.round(weatherTemp);
    if (prevTempKey.current === end) return;
    prevTempKey.current = end;
    setDisplayTemp(0);
    let start = 0;
    if (start === end) { setDisplayTemp(end); return; }
    const duration = 600;
    const step = Math.max(1, Math.abs(end - start) / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if ((step > 0 && start >= end) || (step < 0 && start <= end)) {
        start = end;
        clearInterval(timer);
      }
      setDisplayTemp(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [weatherTemp]);

  // ─── skip silently ────────────────────────────────────────────────────────
  if (status.subtype === "complete") return null;
  if (status.message?.includes("Search skipped")) return null;

  // ─── thought ──────────────────────────────────────────────────────────────
  if (status.subtype === "thought") {
    const thoughtText = status.content || status.message || "";
    if (/^(Executing step:|Completed:)/.test(thoughtText.trim())) return null;
    return (
      <ThoughtBlock
        content={status.content}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        elapsedSeconds={elapsedSeconds}
      />
    );
  }

  // ─── weather ─────────────────────────────────────────────────────────────
  if (status.subtype === "weather" && status.data?.status !== "completed" && status.data?.status !== "error") {
    const apiLabel = status.data?.hasKey ? "OpenWeatherMap" : "Open-Meteo";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WeatherIcon state="fetching" cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={`${status.message} (via ${apiLabel})`} isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

  if (status.subtype === "weather" && status.data?.status === "completed") {
    const d = status.data;
    const isOWM = d?.source === "OpenWeatherMap";

    function weatherGradient(desc: string): string {
      const l = desc.toLowerCase();
      if (l.includes("clear") || l.includes("sunny")) return "from-amber-500/20 via-orange-500/10 to-transparent";
      if (l.includes("cloud") || l.includes("overcast")) return "from-slate-500/20 via-zinc-500/10 to-transparent";
      if (l.includes("rain") || l.includes("drizzle") || l.includes("shower")) return "from-blue-500/20 via-indigo-500/10 to-transparent";
      if (l.includes("thunder") || l.includes("storm")) return "from-violet-600/20 via-purple-600/10 to-transparent";
      if (l.includes("snow") || l.includes("blizzard") || l.includes("ice")) return "from-cyan-400/20 via-blue-400/10 to-transparent";
      if (l.includes("fog") || l.includes("mist") || l.includes("haze")) return "from-stone-500/20 via-neutral-500/10 to-transparent";
      return "from-[var(--accent)]/15 via-transparent to-transparent";
    }

    function weatherGradientAnimate(desc: string): string {
      const l = desc.toLowerCase();
      if (l.includes("clear") || l.includes("sunny")) return "animate-sunny-gradient";
      if (l.includes("cloud") || l.includes("overcast")) return "animate-cloud-gradient";
      if (l.includes("rain") || l.includes("drizzle") || l.includes("shower")) return "animate-rain-gradient";
      if (l.includes("thunder") || l.includes("storm")) return "animate-storm-gradient";
      if (l.includes("snow") || l.includes("blizzard") || l.includes("ice")) return "animate-snow-gradient";
      if (l.includes("fog") || l.includes("mist") || l.includes("haze")) return "animate-fog-gradient";
      return "";
    }

    function weatherEmoji(desc: string): string {
      const l = desc.toLowerCase();
      if (l.includes("clear")) return "☀️";
      if (l.includes("few clouds") || l.includes("scattered clouds")) return "⛅";
      if (l.includes("cloud") || l.includes("overcast")) return "☁️";
      if (l.includes("rain") || l.includes("drizzle") || l.includes("shower")) return "🌧️";
      if (l.includes("thunder")) return "⛈️";
      if (l.includes("snow") || l.includes("blizzard")) return "🌨️";
      if (l.includes("fog") || l.includes("mist") || l.includes("haze")) return "🌫️";
      return "🌤️";
    }

    function conditionLabel(desc: string): string {
      const l = desc.toLowerCase();
      if (l.includes("clear")) return "Clear Sky";
      if (l.includes("few clouds")) return "Few Clouds";
      if (l.includes("scattered clouds")) return "Scattered Clouds";
      if (l.includes("broken clouds") || l.includes("overcast")) return "Overcast";
      if (l.includes("light rain")) return "Light Rain";
      if (l.includes("moderate rain")) return "Rain";
      if (l.includes("heavy rain")) return "Heavy Rain";
      if (l.includes("drizzle")) return "Drizzle";
      if (l.includes("thunder")) return "Thunderstorm";
      if (l.includes("snow")) return "Snow";
      if (l.includes("blizzard")) return "Blizzard";
      if (l.includes("fog")) return "Fog";
      if (l.includes("mist")) return "Mist";
      if (l.includes("haze")) return "Haze";
      return desc.charAt(0).toUpperCase() + desc.slice(1);
    }

    const feels = d?.feelsLike ?? 0;
    const hum = d?.humidity ?? 0;
    const wind = d?.windSpeed ?? 0;
    const desc = d?.description ?? "";
    const city = d?.city ?? "";
    const source = d?.source ?? "";

    const containerVariants = {
      hidden: { opacity: 0, y: 12 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
    };

    const cardVariants = {
      hidden: { opacity: 0, y: 8, scale: 0.95 },
      visible: (i: number) => ({
        opacity: 1, y: 0, scale: 1,
        transition: { delay: 0.25 + i * 0.08, duration: 0.35, ease: "easeOut" as const },
      }),
    };

    return (
      <motion.div className="my-2" variants={containerVariants} initial="hidden" animate="visible">
        <div className={`relative overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-bg)] bg-gradient-to-br ${weatherGradient(desc)} ${weatherGradientAnimate(desc)}`}>
          {/* Decorative glow */}
          <motion.div
            className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-[var(--accent)]/5 blur-2xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative z-10 p-4">
            {/* City + source */}
            <motion.div
              className="flex items-center justify-between mb-3"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <span className="text-sm font-semibold text-[var(--text-primary)]">{city}</span>
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${isOWM
                ? "border-[var(--accent)]/20 bg-[var(--accent)]/8 text-[var(--accent)]/80"
                : "border-teal-500/30 bg-teal-500/8 text-teal-400/80"
                }`}>
                {source}
              </span>
            </motion.div>

            {/* Temperature + emoji row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-1">
                <motion.span
                  className="text-5xl font-light tracking-tight text-[var(--text-primary)]"
                  key={displayTemp}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {displayTemp}
                </motion.span>
                <span className="text-2xl font-light text-[var(--text-muted)]">°C</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <motion.span
                  className="text-3xl inline-block"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  {weatherEmoji(desc)}
                </motion.span>
                <motion.span
                  className="text-xs font-medium text-[var(--text-secondary)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                >
                  {conditionLabel(desc)}
                </motion.span>
              </div>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Feels Like", value: `${Math.round(feels)}°C` },
                { label: "Humidity", value: `${hum}%` },
                { label: "Wind", value: `${wind} km/h` },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  className="rounded-lg border border-[var(--surface-border)] bg-black/10 px-2.5 py-2"
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-0.5">{item.label}</div>
                  <motion.div
                    className="text-sm font-semibold text-[var(--text-primary)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 + i * 0.08, duration: 0.2 }}
                  >
                    {item.value}
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (status.subtype === "weather" && status.data?.status === "error") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WeatherIcon state="error" cls="text-[var(--text-muted)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  // ─── web search ──────────────────────────────────────────────────────────
  if (status.subtype === "searching") {
    return (
      <div className="py-2 min-w-0">
        <div className="flex items-center gap-1.5 w-full text-left select-none">
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">Searched the web</span>
          {rightSlot && <span className="ml-auto shrink-0">{rightSlot}</span>}
        </div>
      </div>
    );
  }

  if (status.subtype === "found_sources") {
    const sources: string[] = status.data?.sources ?? [];
    const titles: string[] = status.data?.titles ?? [];
    const query: string = status.data?.query ?? searchQuery ?? "";
    const count = sources.length;
    if (count === 0) return null;
    return (
      <StepRow rightSlot={
        <div className="flex items-center gap-2">
          {rightSlot}
          <span className="text-[11px] font-mono text-[var(--text-secondary)] font-semibold shrink-0 tabular-nums">{count} results</span>
        </div>
      }
        icon={<GlobeIcon cls="text-[var(--text-secondary)]" />}
        message={query || status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      >
        {expanded && <div className="rounded-lg border border-[var(--surface-border)] overflow-hidden" style={{ background: '#0f0f0e' }}>
          <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '156px' }}>
            {sources.map((url, idx) => {
              const domain = getDomain(url);
              const title = titles[idx] || domain;
              return (
                <button
                  key={`${url}-${idx}`}
                  onClick={() => onSourceClick?.(url)}
                  className="group w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-colors hover:bg-white/[0.025] border-b border-white/[0.05] last:border-b-0"
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                    alt=""
                    className="size-4 rounded-sm shrink-0 opacity-75"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)]/80 truncate min-w-0 group-hover:text-[var(--text-secondary)] transition-colors">
                    {title}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]/60 shrink-0 ml-2">{domain}</span>
                </button>
              );
            })}
          </div>
        </div>}
      </StepRow>
    );
  }

  if (status.subtype === "reading") {
    const titles: string[] = status.data?.titles ?? [];
    const urls: string[] = status.data?.urls ?? [];
    return (
      <StepRow rightSlot={rightSlot}
        icon={<ClockIcon className={`size-4 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`} />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
      >
        {titles.length > 0 && (
          <div className="rounded-lg border border-[var(--surface-border)] overflow-hidden" style={{ background: '#0f0f0e' }}>
            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '156px' }}>
              {titles.map((title, idx) => (
                <button
                  key={`${urls[idx] ?? idx}`}
                  onClick={() => urls[idx] && onSourceClick?.(urls[idx])}
                  aria-label={`View source: ${title}`}
                  className="group w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-colors hover:bg-white/[0.025] border-b border-white/[0.05] last:border-b-0"
                >
                  {urls[idx] && (
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(urls[idx]).hostname.replace(/^www\./, ""); } catch { return ""; } })()}&sz=16`}
                      alt=""
                      className="size-4 rounded-sm shrink-0 opacity-75"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)]/80 truncate min-w-0 group-hover:text-[var(--text-secondary)] transition-colors">
                    {title}
                  </span>
                  {urls[idx] && (
                    <span className="text-[11px] font-mono text-[var(--text-muted)]/60 shrink-0 ml-2">
                      {(() => { try { return new URL(urls[idx]).hostname.replace(/^www\./, ""); } catch { return ""; } })()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </StepRow>
    );
  }

  if (status.subtype === "extracting") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<ExtractIcon cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

  if (status.subtype === "no_results") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WarnIcon cls="text-[var(--text-secondary)]/60" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  // ─── parsing ────────────────────────────────────────────────────────────────
  if (status.subtype === "parsing" || status.subtype === "parsing_done" || status.subtype === "parsing_error") {
    const isError = status.subtype === "parsing_error";
    return (
      <StepRow rightSlot={rightSlot}
        icon={isError
          ? <WarnIcon cls="text-red-400" />
          : (!isActive
            ? <DoneIcon cls="text-green-500" />
            : <SpinnerIcon cls="text-[var(--accent)] animate-spin size-4" />
          )
        }
        message={status.message}
        isFirst={isFirst} isLast={isLast}
        pulse={!!isActive && !isError}
      />
    );
  }

  // ─── reading_skill ────────────────────────────────────────────────────────
  if (status.subtype === "reading_skill" || status.subtype === "reading_skill_success" || status.subtype === "reading_skill_error") {
    const docType: string = status.data?.docType ?? "";
    const isSuccess = status.subtype === "reading_skill_success";
    const isError = status.subtype === "reading_skill_error";
    const isLoading = status.subtype === "reading_skill";

    const skillIcon = (
      <span className="size-4 flex items-center justify-center">
        {isLoading && isActive ? (
          <span className="relative size-3">
            <span className="absolute inset-0 rounded-full border border-[var(--accent)]/25 border-t-[var(--accent)] animate-spin" />
          </span>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={`size-3.5 ${isSuccess ? 'text-emerald-400/70' : isError ? 'text-red-400/70' : 'text-[var(--text-secondary)]/50'}`}>
            <path d="M2 2h12v12H2z" />
            <line x1="5" y1="5.5" x2="11" y2="5.5" strokeWidth="1" />
            <line x1="5" y1="8" x2="11" y2="8" strokeWidth="1" />
            <line x1="5" y1="10.5" x2="8.5" y2="10.5" strokeWidth="1" />
          </svg>
        )}
      </span>
    );

    return (
      <StepRow rightSlot={rightSlot}
        icon={skillIcon}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={isLoading && isActive}
      >
        {docType && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${isSuccess
              ? 'border-emerald-500/20 bg-emerald-500/6 text-emerald-400/80'
              : isError
                ? 'border-red-500/20 bg-red-500/6 text-red-400/80'
                : 'border-[var(--accent)]/20 bg-[var(--accent)]/5 text-[var(--accent)]/80'
              }`}>
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="size-2.5 shrink-0">
                <path d="M2 1h6v8H2z" />
                <line x1="3.5" y1="3.5" x2="6.5" y2="3.5" strokeWidth="1" />
                <line x1="3.5" y1="5.5" x2="5.5" y2="5.5" strokeWidth="1" />
              </svg>
              {docType.toUpperCase()} rules
            </span>
          </div>
        )}
      </StepRow>
    );
  }

  // ─── chart ────────────────────────────────────────────────────────────────
  if (status.subtype === "generating_chart") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<ChartIcon cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

    // ─── file write / edit / create-project ──────────────────────────────────
  if (
    status.subtype === "generating_file" ||
    status.subtype === "generating_file_success" ||
    status.subtype === "generating_file_error"
  ) {
    const filePath: string = status.data?.path ?? "";
    const filename: string = status.data?.filename ?? filePath.split(/[\\/]/).pop() ?? filePath;
    const fileContent: string = status.data?.contentPreview ?? status.data?.content ?? "";
    const language: string = status.data?.language ?? "";
    const isSuccess = status.subtype === "generating_file_success";
    const isError = status.subtype === "generating_file_error";
    const isWriting = status.subtype === "generating_file";
    const isEdit = status.data?.diffAdded !== undefined;
    const diffAdded = status.data?.diffAdded ?? 0;
    const diffRemoved = status.data?.diffRemoved ?? 0;
    const oldStr = status.data?.old_str || "";
    const newStr = status.data?.new_str || "";
    const toolName = status.data?.toolName || (isEdit ? "edit_file" : fileContent ? "write_file" : "");

    const fileIconColor = isWriting && isActive
      ? "text-[var(--accent)]"
      : isSuccess
        ? "text-emerald-400/70"
        : isError
          ? "text-red-400/70"
          : "text-[var(--text-secondary)]/40";

    const fileIconEl = isEdit ? (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${fileIconColor}`}>
        <path d="M12.5 2.5l3 3L7 14H4v-3l8.5-8.5z" />
        <line x1="10.5" y1="4.5" x2="13.5" y2="7.5" strokeWidth="1.1" />
        <path d="M4 14v2h2l8.5-8.5" strokeWidth="1.1" />
      </svg>
    ) : (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${fileIconColor}`}>
        <path d="M5 2.5h6.5l3 3V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
        <polyline points="11.5,2.5 11.5,5.5 14.5,5.5" />
        <line x1="7" y1="9" x2="13" y2="9" strokeWidth="1.1" />
        <line x1="7" y1="11.5" x2="11" y2="11.5" strokeWidth="1.1" />
      </svg>
    );

    return (
      <div className="relative overflow-hidden">
        <div className="flex gap-2.5">
          <TimelineNode icon={fileIconEl} isFirst={isFirst} isLast={isLast} />
          <div className="py-2 min-w-0 flex-1">
            {/* Status label */}
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">{status.message}</span>
            {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1">{rightSlot}</span>}

            {/* File block with content preview */}
            {filename && (
              <FileCodeBlock
                filename={filename}
                content={fileContent || undefined}
                language={language || filename.split('.').pop() || 'text'}
                isRunning={isWriting && !!isActive}
                isSuccess={isSuccess}
                isError={isError}
                diffAdded={isEdit ? diffAdded : undefined}
                diffRemoved={isEdit ? diffRemoved : undefined}
                oldStr={oldStr || undefined}
                newStr={newStr || undefined}
                toolName={toolName || undefined}
              />
            )}

            {isLast && (
              <div className="flex items-center h-4 mt-1">
                <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── reading_file ─────────────────────────────────────────────────────────
  if (
    status.subtype === "reading_file" ||
    status.subtype === "reading_file_success" ||
    status.subtype === "reading_file_error"
  ) {
    const filePath: string = status.data?.path ?? "";
    const filename: string = status.data?.filename ?? filePath.split(/[\\/]/).pop() ?? filePath;
    const fileSize: number = status.data?.size ?? 0;
    const isSuccess = status.subtype === "reading_file_success";
    const isError = status.subtype === "reading_file_error";
    const isReading = status.subtype === "reading_file";

    const readIconColor = isReading && isActive
      ? "text-[var(--accent)]"
      : isSuccess
        ? "text-emerald-400/70"
        : isError
          ? "text-red-400/70"
          : "text-[var(--text-secondary)]/40";

    const readIconEl = (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${readIconColor}`}>
        <path d="M4 3h8l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <polyline points="12,3 12,6 15,6" />
        <line x1="6" y1="8.5" x2="10" y2="8.5" strokeWidth="1.1" />
        <line x1="6" y1="11" x2="8.5" y2="11" strokeWidth="1.1" />
        <circle cx="15.5" cy="14.5" r="2.5" strokeWidth="1.2" />
        <line x1="17.5" y1="16.5" x2="19" y2="18" strokeWidth="1.2" />
      </svg>
    );

    return (
      <StepRow rightSlot={rightSlot}
        icon={readIconEl}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={isReading && isActive}
      >
        {filename && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[12px] font-mono text-[var(--text-secondary)]/70">
              {filename}
              {fileSize > 0 && !isReading && (
                <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                  ({fileSize > 1024 ? `${(fileSize / 1024).toFixed(1)}KB` : `${fileSize}B`})
                </span>
              )}
            </span>
          </div>
        )}
      </StepRow>
    );
  }

  // ─── sandbox: run_bash / run_python / install_package ────────────────────
  if (
    status.subtype === "sandbox_start" ||
    status.subtype === "sandbox_success" ||
    status.subtype === "sandbox_error"
  ) {
    const command: string = status.data?.command ?? status.data?.code ?? "";
    const tool: string = status.data?.tool ?? "run_bash";
    const exitCode: number | undefined = status.data?.exitCode;
    const stdout: string | undefined = status.data?.stdout;
    const stderr: string | undefined = status.data?.stderr;
    const errorMsg: string | undefined = status.data?.error;
    const isRunning = status.subtype === "sandbox_start";
    const isSuccess = status.subtype === "sandbox_success";
    const isError = status.subtype === "sandbox_error";

    // Determine language label
    const langLabel =
      tool === "run_python" ? "python"
        : tool === "install_package" ? "bash"
          : tool === "bash_fallback" ? "bash"
            : "bash";

    // Icon — terminal for bash, python symbol for python, package for install
    const termIconEl = (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${isRunning && isActive ? "text-[var(--accent)]"
          : isSuccess ? "text-emerald-400/70"
            : isError ? "text-red-400/70"
              : "text-[var(--text-secondary)]/40"
          }`}>
        <rect x="2" y="3.5" width="16" height="13" rx="2" />
        <polyline points="5.5,8 8,10.5 5.5,13" strokeWidth="1.5" />
        <line x1="9.5" y1="13" x2="14.5" y2="13" strokeWidth="1.3" />
      </svg>
    );

    // Parse duration from the success message e.g. "Bash finished (exit 0, 1.5s)"
    const durationMatch = status.message.match(/(\d+\.?\d*s)\)/);
    const durationStr = durationMatch?.[1];

    // For install_package, there's no command — synthesize one for display
    const displayCommand = command || (tool === 'install_package' && status.data?.package ? `pip install ${status.data.package}` : '');

    return (
      <div className="flex gap-2.5">
        <TimelineNode icon={termIconEl} isFirst={isFirst} isLast={isLast} />
        <div className="py-2 min-w-0 flex-1">
          {/* Header label */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">
              {status.message}
            </span>
            {rightSlot && <span className="inline-flex shrink-0 align-middle">{rightSlot}</span>}
          </div>

          {/* Terminal block with command + output */}
          {displayCommand && (
            <TerminalBlock
              command={displayCommand}
              language={langLabel}
              isRunning={isRunning && !!isActive}
              exitCode={isSuccess ? (exitCode ?? 0) : isError ? (exitCode ?? 1) : undefined}
              durationStr={durationStr}
              stdout={stdout}
              stderr={stderr}
              error={errorMsg}
            />
          )}

          {/* Success / error micro-badge when no command data */}
          {!displayCommand && (exitCode !== undefined || isError) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {exitCode !== undefined && (
                <span className={`text-[11px] font-mono rounded border px-1.5 py-[2px] ${exitCode === 0
                  ? 'bg-emerald-500/8 text-emerald-400/80 border-emerald-500/20'
                  : 'bg-red-500/8 text-red-400/80 border-red-500/20'
                  }`}>
                  exit {exitCode}
                </span>
              )}
              {durationStr && (
                <span className="text-[11px] text-[var(--text-muted)]">{durationStr}</span>
              )}
            </div>
          )}

          {isLast && (
            <div className="flex items-center h-4 mt-1">
              <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── wiki_search ──────────────────────────────────────────────────────────
  if (status.subtype === "wiki_search" || status.subtype === "wiki_search_success" || status.subtype === "wiki_search_error") {
    const query: string = status.data?.query ?? "";
    const resultCount: number = status.data?.count ?? 0;
    const isSuccess = status.subtype === "wiki_search_success";
    const isError = status.subtype === "wiki_search_error";
    const isLoading = status.subtype === "wiki_search";

    return (
      <div className="flex gap-2.5">
        <TimelineNode
          icon={<WikiIcon cls={
            isLoading && isActive ? "text-[var(--accent)]"
              : isSuccess ? "text-emerald-400/70"
                : isError ? "text-red-400/70"
                  : "text-[var(--text-secondary)]/40"
          } />}
          isFirst={isFirst} isLast={isLast}
        />
        <div className="py-2 min-w-0 flex-1">
          <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">{status.message}</span>
          {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1">{rightSlot}</span>}

          {query && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] font-mono">
                <WikiIcon cls="size-3 text-[var(--text-muted)]" />
                <span className="truncate max-w-[220px]">{query}</span>
              </span>
              {isSuccess && resultCount > 0 && (
                <span className="text-[11px] text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/20 rounded px-1.5 py-0.5">
                  {resultCount} node{resultCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── tool_call — generic tool call with smart rendering ──────────────────
  if (status.subtype === "tool_call") {
    const toolName: string = status.data?.toolName ?? "";
    const args: any = status.data?.args ?? {};
    const result: string = status.data?.result ?? "";
    const toolStatus: string = status.data?.status ?? "running";

    return (
      <GenericToolBlock
        toolName={toolName}
        args={args}
        result={result}
        status={toolStatus}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        rightSlot={rightSlot}
      />
    );
  }

  // ─── image tools ──────────────────────────────────────────────────────────
  if (status.subtype === "image_enhancing" || status.subtype === "image_enhancing_success") {
    const isDone = status.subtype === "image_enhancing_success";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WandIcon cls={
          isDone ? "text-[var(--text-secondary)]/50"
            : isActive ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)]/40"
        } />}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={!isDone && !!isActive}
      />
    );
  }

  if (
    status.subtype === "image_generating" ||
    status.subtype === "image_generating_success" ||
    status.subtype === "image_generating_error"
  ) {
    const isDone = status.subtype === "image_generating_success";
    const isError = status.subtype === "image_generating_error";
    return (
      <StepRow rightSlot={rightSlot}
        icon={<ImageIcon cls={
          isDone ? "text-emerald-400/70"
            : isError ? "text-red-400/70"
              : isActive ? "text-[var(--accent)]"
                : "text-[var(--text-secondary)]/40"
        } />}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={!isDone && !isError && !!isActive}
      />
    );
  }

  // ─── error ────────────────────────────────────────────────────────────────
  if (status.subtype === "error") {
    if (status.message?.includes("Search skipped")) return null;
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WarnIcon cls="text-red-400/60" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  // ─── done ─────────────────────────────────────────────────────────────────
  if (status.subtype === "done") return null;

  // ─── fallback: any unhandled subtype ─────────────────────────────────────
  const toolInput = status.data as Record<string, unknown> | undefined;
  const hasDetail = toolInput && Object.keys(toolInput).length > 0 && !isActive;

  return (
    <StepRow rightSlot={rightSlot}
      icon={
        isActive
          ? <SpinnerIcon />
          : <span className="size-4 flex items-center justify-center">
            <span className="size-1.5 rounded-full bg-[var(--text-muted)]" />
          </span>
      }
      message={status.message} isFirst={isFirst} isLast={isLast} pulse={isActive}
    >
      {hasDetail && (
        <button
          onClick={() => setDetailOpen(v => !v)}
          className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1"
        >
          <ChevronDown className={`size-3 transition-transform duration-200 ${detailOpen ? 'rotate-180' : ''}`} />
          {detailOpen ? 'Hide details' : 'Show details'}
        </button>
      )}
      {detailOpen && hasDetail && (
        <div className="mt-2 rounded-lg overflow-hidden border border-[var(--surface-border)]" style={{ background: '#0b0b0a' }}>
          <div className="px-3 py-1.5 border-b border-white/[0.05] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.2)' }}>
            Details
          </div>
          <pre className="text-[11.5px] leading-relaxed font-mono px-4 py-2.5 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap" style={{ color: '#b5b2aa' }}>
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        </div>
      )}
    </StepRow>
  );
}

const StatusMessageMemo = React.memo(StatusMessage);
export default StatusMessageMemo;
export { StatusMessageMemo as StatusMessage };
