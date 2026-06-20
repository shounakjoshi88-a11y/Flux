// src/components/StatusMessage.tsx
import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { MessageRenderer } from "./MessageRenderer";
import { calculateTrustScore } from "../utils/TrustScore";

// ── Icons — 20×20 viewport, size-5, 1.6px stroke ──────────
type IProps = { cls?: string };
const S = ({ cls = "", children }: { cls?: string; children: React.ReactNode }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round"
    className={`size-4 shrink-0 ${cls}`}>{children}</svg>
);

const SearchIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="8.5" cy="8.5" r="5.2" />
    <line x1="12.8" y1="12.8" x2="17.5" y2="17.5" />
  </S>
);

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

const BookIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <line x1="10" y1="17" x2="10" y2="4.5" />
    <path d="M10 5c-2-1.5-4-1.5-6.5-1v11.5c2.5-.5 4.5-.5 6.5 1" />
    <path d="M10 5c2-1.5 4-1.5 6.5-1v11.5c-2.5-.5-4.5-.5-6.5 1" />
    <line x1="4.5" y1="8" x2="8.5" y2="7.5" strokeWidth="1" opacity="0.6" />
    <line x1="4.5" y1="10.5" x2="8.5" y2="10" strokeWidth="1" opacity="0.6" />
    <line x1="4.5" y1="13" x2="8.5" y2="12.5" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="7.5" x2="15.5" y2="8" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="10" x2="15.5" y2="10.5" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="12.5" x2="15.5" y2="13" strokeWidth="1" opacity="0.6" />
  </S>
);

const LinkIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5V11" />
    <path d="M12 3h5v5" />
    <line x1="17" y1="3" x2="10" y2="10" />
  </S>
);

const WarnIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M10 3 1.5 17.5h17L10 3z" />
    <line x1="10" y1="8.5" x2="10" y2="13" />
    <circle cx="10" cy="15.5" r=".8" fill="currentColor" strokeWidth="0" />
  </S>
);

const DoneIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <polyline points="2.5,10 7.5,15.5 17.5,4.5" />
  </S>
);

// Terminal icon — rectangle with cursor prompt lines
const TerminalIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2" y="3.5" width="16" height="13" rx="2" />
    <polyline points="5.5,8 8,10.5 5.5,13" strokeWidth="1.5" />
    <line x1="9.5" y1="13" x2="14.5" y2="13" strokeWidth="1.3" />
  </S>
);

// File icon — document with folded corner
const FileIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M5 2.5h6.5l3 3V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
    <polyline points="11.5,2.5 11.5,5.5 14.5,5.5" />
    <line x1="7" y1="9" x2="13" y2="9" strokeWidth="1.1" />
    <line x1="7" y1="11.5" x2="11" y2="11.5" strokeWidth="1.1" />
  </S>
);

// Wiki/graph node icon
const WikiIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="10" cy="10" r="2.5" />
    <circle cx="3.5" cy="5" r="1.8" />
    <circle cx="16.5" cy="5" r="1.8" />
    <circle cx="3.5" cy="15" r="1.8" />
    <circle cx="16.5" cy="15" r="1.8" />
    <line x1="5.2" y1="5.8" x2="8" y2="8.5" strokeWidth="1.2" />
    <line x1="14.8" y1="5.8" x2="12" y2="8.5" strokeWidth="1.2" />
    <line x1="5.2" y1="14.2" x2="8" y2="11.5" strokeWidth="1.2" />
    <line x1="14.8" y1="14.2" x2="12" y2="11.5" strokeWidth="1.2" />
  </S>
);

// Package/install icon
const PackageIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M10 2L17.5 6v8L10 18 2.5 14V6L10 2z" />
    <polyline points="2.5,6 10,10 17.5,6" />
    <line x1="10" y1="10" x2="10" y2="18" />
    <line x1="6" y1="4" x2="14" y2="8" strokeWidth="1" opacity="0.5" />
  </S>
);

// Weather icons
const WeatherIcon = ({ state, cls = "" }: { state: "fetching" | "success" | "error"; cls?: string }) => {
  if (state === "fetching") return (
    <S cls={cls}>
      <path d="M10 3.5v8.2" />
      <path d="M8 3.5a2 2 0 0 1 4 0v8.2a4 4 0 1 1-4 0z" />
      <line x1="12.5" y1="6" x2="14.5" y2="6" />
      <line x1="12.5" y1="8.5" x2="14" y2="8.5" />
      <line x1="12.5" y1="11" x2="14.5" y2="11" />
    </S>
  );
  if (state === "success") return (
    <S cls={cls}>
      <circle cx="13.5" cy="7" r="3" />
      <line x1="13.5" y1="2.5" x2="13.5" y2="1.5" />
      <line x1="17" y1="3.5" x2="17.7" y2="2.8" />
      <line x1="18" y1="7" x2="19" y2="7" />
      <path d="M4.5 15.5a3.5 3.5 0 0 1-.8-6.9A5.5 5.5 0 0 1 14.2 10a3 3 0 0 1-.7 5.5H4.5z" />
    </S>
  );
  return (
    <S cls={cls}>
      <path d="M4.5 15.5a3.5 3.5 0 0 1-.8-6.9A5.5 5.5 0 0 1 14.2 10a3 3 0 0 1-.7 5.5H4.5z" />
      <polyline points="10.5,13 8.5,16.5 11,16.5 9,20" />
    </S>
  );
};

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

const ImageIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <circle cx="6.5" cy="8.5" r="1.5" />
    <path d="M2.5 12.5 L6.5 9 L9.5 12.5 L12.5 9 L17.5 14" />
  </S>
);

const ChartIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2.5" y="10" width="3" height="7.5" rx="0.5" />
    <rect x="8.5" y="6" width="3" height="11.5" rx="0.5" />
    <rect x="14.5" y="2.5" width="3" height="15" rx="0.5" />
    <line x1="1.5" y1="18" x2="18.5" y2="18" strokeWidth="1.2" />
  </S>
);

// ── Language colour map for file extension badges ──────────
const LANG_COLORS: Record<string, { badge: string; dot: string }> = {
  python: { badge: 'text-blue-400/80 bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400/70' },
  javascript: { badge: 'text-yellow-400/80 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-400/70' },
  typescript: { badge: 'text-sky-400/80 bg-sky-500/10 border-sky-500/20', dot: 'bg-sky-400/70' },
  html: { badge: 'text-orange-400/80 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400/70' },
  css: { badge: 'text-purple-400/80 bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-400/70' },
  bash: { badge: 'text-green-400/80 bg-green-500/10 border-green-500/20', dot: 'bg-green-400/70' },
  c: { badge: 'text-slate-300/80 bg-slate-500/10 border-slate-500/20', dot: 'bg-slate-300/70' },
  cpp: { badge: 'text-indigo-300/80 bg-indigo-500/10 border-indigo-500/20', dot: 'bg-indigo-300/70' },
  rust: { badge: 'text-orange-300/80 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-300/70' },
  go: { badge: 'text-cyan-400/80 bg-cyan-500/10 border-cyan-500/20', dot: 'bg-cyan-400/70' },
  java: { badge: 'text-red-400/80 bg-red-500/10 border-red-500/20', dot: 'bg-red-400/70' },
  json: { badge: 'text-yellow-300/80 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-300/70' },
  markdown: { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]' },
  sql: { badge: 'text-teal-400/80 bg-teal-500/10 border-teal-500/20', dot: 'bg-teal-400/70' },
};

const getLangStyle = (lang: string) =>
  LANG_COLORS[lang?.toLowerCase()] ?? { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]' };

// ─── Claude-style Terminal Block ───────────────────────────────────────────────
// Shows a dark code box with "bash/script" header + command + optional Output section
function TerminalBlock({
  command,
  language = 'bash',
  isRunning = false,
  exitCode,
  durationStr,
  output,
}: {
  command?: string;
  language?: string;
  isRunning?: boolean;
  exitCode?: number;
  durationStr?: string;
  output?: string;
}) {
  const [outputOpen, setOutputOpen] = useState(true);
  if (!command) return null;

  const isSuccess = exitCode === 0;
  const isFailure = exitCode !== undefined && exitCode !== 0;

  return (
    <div className={`mt-2 rounded-lg overflow-hidden border transition-all duration-200 ${isRunning
      ? 'border-[var(--accent)]/25 shadow-[0_0_0_1px_var(--accent)/6]'
      : isFailure
        ? 'border-red-500/25'
        : 'border-[var(--surface-border)]'
      }`} style={{ background: '#0f0f0e' }}>

      {/* ── Block header bar */}
      <div className="flex items-center gap-2 px-3 py-[7px] border-b border-white/[0.06]"
        style={{ background: 'rgba(0,0,0,0.25)' }}>
        {/* Traffic dots */}
        <div className="flex gap-1.5 shrink-0">
          <span className="size-[7px] rounded-full" style={{ background: '#ff5f57', opacity: 0.55 }} />
          <span className="size-[7px] rounded-full" style={{ background: '#febc2e', opacity: 0.55 }} />
          <span className="size-[7px] rounded-full" style={{ background: '#28c840', opacity: 0.55 }} />
        </div>

        <span className="text-[11px] text-[var(--text-muted)] font-mono tracking-wide ml-0.5">{language}</span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]/70">
              <span className="size-[5px] rounded-full bg-[var(--accent)]/70 animate-pulse" />
              running
            </span>
          )}
          {exitCode !== undefined && (
            <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 border ${isSuccess
              ? 'bg-emerald-500/8 text-emerald-400/80 border-emerald-500/20'
              : 'bg-red-500/8 text-red-400/80 border-red-500/20'
              }`}>
              exit {exitCode}{durationStr ? ` · ${durationStr}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Command area */}
      <pre className="text-[12.5px] leading-[1.65] font-mono px-4 py-3 overflow-x-auto whitespace-pre"
        style={{ color: '#d4d1cb' }}>
        {command}
        {isRunning && (
          <span
            className="inline-block w-[7px] h-[14px] ml-0.5 align-middle rounded-sm"
            style={{ background: 'var(--accent)', opacity: 0.7, animation: 'blink 1s step-end infinite' }}
          />
        )}
      </pre>

      {/* ── Output section (if data available) */}
      {output && (
        <>
          <div className="flex items-center gap-2 px-3 py-[7px] border-t border-white/[0.06]"
            style={{ background: 'rgba(0,0,0,0.2)' }}>
            <span className="text-[11px] text-[var(--text-muted)] font-mono tracking-wide">Output</span>
            <button
              onClick={() => setOutputOpen(v => !v)}
              className="ml-auto flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <ChevronDown className={`size-3 transition-transform duration-200 ${outputOpen ? 'rotate-180' : ''}`} />
              {outputOpen ? 'hide' : 'show'}
            </button>
          </div>
          {outputOpen && (
            <pre className="text-[11.5px] leading-[1.6] font-mono px-4 py-2.5 overflow-x-auto max-h-[360px] overflow-y-auto whitespace-pre border-t border-white/[0.04]"
              style={{ color: '#9a978f' }}>
              {output}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// ─── File Code Block ────────────────────────────────────────────────────────
function FileCodeBlock({
  filename,
  content,
  language = 'text',
  isRunning = false,
  isSuccess = false,
  isError = false,
}: {
  filename: string;
  content?: string;
  language?: string;
  isRunning?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lang = getLangStyle(language);
  const preview = content ? content.slice(0, 4000) : '';
  const truncated = content && content.length > 4000;
  const hasContent = !!preview;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  // Count lines for the line number hint
  const lineCount = content ? content.split('\n').length : 0;

  return (
    <div className={`mt-2 rounded-lg overflow-hidden border transition-all duration-200 ${isSuccess
      ? 'border-emerald-500/20'
      : isError
        ? 'border-red-500/20'
        : isRunning
          ? 'border-[var(--accent)]/25'
          : 'border-[var(--surface-border)]'
      }`} style={{ background: '#0f0f0e' }}>

      {/* File header */}
      <button
        onClick={() => hasContent && setOpen(v => !v)}
        disabled={!hasContent}
        className="w-full flex items-center gap-2 px-3 py-2 text-left border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors disabled:cursor-default"
        style={{ background: 'rgba(0,0,0,0.22)' }}
      >
        {/* Status dot */}
        <span className={`size-[7px] rounded-full shrink-0 ${isSuccess ? 'bg-emerald-400/70'
          : isError ? 'bg-red-400/70'
            : isRunning ? 'bg-[var(--accent)]/70 animate-pulse'
              : lang.dot
          }`} />

        {/* Filename */}
        <span className="font-mono text-[12.5px] text-[#d4d1cb] truncate">{filename}</span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Line count hint */}
          {lineCount > 1 && !isRunning && (
            <span className="text-[10px] text-[var(--text-muted)]">{lineCount} lines</span>
          )}
          {/* Language badge */}
          <span className={`text-[10px] font-mono rounded border px-1.5 py-[2px] ${lang.badge}`}>
            {language || ext || 'txt'}
          </span>
          {/* Expand chevron */}
          {hasContent && (
            <ChevronDown
              className={`size-3.5 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      {/* Content preview */}
      {open && preview && (
        <div className="relative">
          <pre
            className="text-[11.5px] leading-[1.65] font-mono px-4 py-3 overflow-x-auto max-h-[420px] overflow-y-auto whitespace-pre"
            style={{ color: '#b5b2aa', tabSize: 2 } as React.CSSProperties}
          >
            {preview}
            {truncated && (
              <span style={{ color: 'var(--text-muted)' }}>{'\n'}… (truncated)</span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Word-by-word typewriter hook ──────────────────────────────────────────
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

// ── ThoughtBlock ──────────────────────────────────────────────────────────────
function cleanThoughtText(text: string): string {
  return text
    .replace(/<ANSWER>[\s\S]*?<\/ANSWER>/gi, "")
    .replace(/<ANSWER>[\s\S]*/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*?<\/FOLLOW_UPS>/gi, "")
    .replace(/<FOLLOW_UPS>[\s\S]*/gi, "")
    .replace(/<\/?[A-Z_]+>/gi, "")
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

  const railIcon = isThinking
    ? <SpinnerIcon />
    : (
      <span className="size-4 flex items-center justify-center">
        <span className="size-1.5 rounded-full bg-[var(--text-secondary)]/40" />
      </span>
    );

  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center w-4 shrink-0 pt-2">{railIcon}</div>
      <div className="py-2 min-w-0 flex-1">
        <button
          onClick={() => setOpen(v => !v)}
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
              <ChevronDown className={`size-3.5 text-[var(--text-muted)] transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`} />
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
                <div key={i} className="flex gap-2 items-start"
                  style={{
                    animation: !isThinking ? "thoughtStepIn 0.3s ease both" : undefined,
                    animationDelay: !isThinking ? `${i * 0.1}s` : undefined,
                  }}>
                  <div className="flex flex-col items-center shrink-0 w-2.5 self-stretch">
                    <span className={`mt-[5px] size-[4px] rounded-full shrink-0 ${isAnimating ? "bg-[var(--accent)]" : "bg-[var(--text-secondary)]/40"}`} />
                    {hasLineBelow && <div className="w-px flex-1 mt-1 min-h-[10px] bg-[var(--text-muted)]/15" />}
                  </div>
                  <div className={`text-[13px] leading-relaxed pb-2.5 min-w-0 flex-1 ${isAnimating ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]/80"}`}>
                    <MessageRenderer content={text || ""} onCitationClick={() => { }} sources={[]} />
                    {isAnimating && (
                      <span className="inline-block w-px h-[13px] bg-[var(--text-secondary)] ml-0.5 align-middle" style={{ animation: "blink 1s step-end infinite" }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <style>{`
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes thoughtStepIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
          @keyframes flare-sweep { from{transform:translateX(-100%)} to{transform:translateX(200%)} }
        `}</style>
      </div>
    </div>
  );
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
}

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

  // ─── skip silently ────────────────────────────────────────────────────────
  if (status.subtype === "complete") return null;

  // ─── thought ──────────────────────────────────────────────────────────────
  if (status.subtype === "thought") {
    return <ThoughtBlock status={status} isFirst={isFirst} isLast={isLast} isActive={isActive} elapsedSeconds={elapsedSeconds} />;
  }

  // ─── weather ─────────────────────────────────────────────────────────────
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
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium mt-1 ${isOWM
            ? "border-[var(--accent)]/20 bg-[var(--accent)]/8 text-[var(--accent)]/80"
            : "border-teal-500/30 bg-teal-500/8 text-teal-400/80"
            }`}>
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

  // ─── web search ──────────────────────────────────────────────────────────
  if (status.subtype === "searching") {
    return (
      <div className="py-2 min-w-0">
        <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">{status.message}</span>
        {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1.5">{rightSlot}</span>}
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
        <div className="flex flex-wrap gap-1.5 mt-0.5">
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
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {titles.map((title, idx) => (
              <button
                key={`${urls[idx] ?? idx}`}
                onClick={() => urls[idx] && onSourceClick?.(urls[idx])}
                aria-label={`View source: ${title}`}
                className="group flex items-center gap-1 rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]/80 transition-all duration-150 hover:border-[var(--accent)]/20 hover:text-[var(--text-primary)]"
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

  if (status.subtype === "no_results") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WarnIcon cls="text-[var(--text-secondary)]/60" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
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

    const fileIconColor = isWriting && isActive
      ? "text-[var(--accent)]"
      : isSuccess
        ? "text-emerald-400/70"
        : isError
          ? "text-red-400/70"
          : "text-[var(--text-secondary)]/40";

    const fileIconEl = (
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
        {isWriting && isActive && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-md">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[flare-sweep_2s_linear_infinite]" />
          </div>
        )}
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

  // ─── sandbox: run_bash / run_python / install_package ────────────────────
  if (
    status.subtype === "sandbox_start" ||
    status.subtype === "sandbox_success" ||
    status.subtype === "sandbox_error"
  ) {
    const command: string = status.data?.command ?? "";
    const tool: string = status.data?.tool ?? "run_bash";
    const exitCode: number | undefined = status.data?.exitCode;
    const isRunning = status.subtype === "sandbox_start";
    const isSuccess = status.subtype === "sandbox_success";
    const isError = status.subtype === "sandbox_error";

    // Determine language label
    const langLabel =
      tool === "run_python" ? "python"
        : tool === "install_package" ? "bash"
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

          {/* Terminal block — only on start (has command) */}
          {command && (
            <TerminalBlock
              command={command}
              language={langLabel}
              isRunning={isRunning && !!isActive}
              exitCode={isSuccess ? exitCode : undefined}
              durationStr={durationStr}
            />
          )}

          {/* Success / error micro-badge when no command data */}
          {!command && (exitCode !== undefined || isError) && (
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

  // ─── tool_call — generic tool call from orchestrator ─────────────────────
  // Handles event: tool_call SSE events converted to status subtype
  if (status.subtype === "tool_call") {
    const toolName: string = status.data?.toolName ?? "";
    const args: any = status.data?.args ?? {};
    const result: string = status.data?.result ?? "";
    const toolStatus: string = status.data?.status ?? "running";
    const isDone = toolStatus === "done" || toolStatus === "success";
    const isRunning = toolStatus === "running" || toolStatus === "pending";
    const isErrTool = toolStatus === "error";

    // Decide icon based on tool name
    const toolIconEl = toolName.includes("bash") || toolName.includes("python")
      ? <TerminalIcon cls={isRunning ? "text-[var(--accent)]" : isDone ? "text-emerald-400/70" : "text-[var(--text-secondary)]/40"} />
      : toolName.includes("file") || toolName.includes("write") || toolName.includes("read")
        ? <FileIcon cls={isDone ? "text-emerald-400/70" : "text-[var(--text-secondary)]/40"} />
        : toolName.includes("wiki")
          ? <WikiIcon cls={isDone ? "text-emerald-400/70" : "text-[var(--text-secondary)]/40"} />
          : toolName.includes("search")
            ? <SearchIcon cls={isRunning ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />
            : toolName.includes("package") || toolName.includes("install")
              ? <PackageIcon cls={isRunning ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />
              : (
                <span className="size-4 flex items-center justify-center">
                  {isRunning
                    ? <SpinnerIcon />
                    : <span className={`size-1.5 rounded-full ${isDone ? 'bg-emerald-400/70' : isErrTool ? 'bg-red-400/70' : 'bg-[var(--text-muted)]'}`} />
                  }
                </span>
              );

    const isExecution = toolName.includes("bash") || toolName.includes("python") || toolName.includes("sandbox") || toolName.includes("terminal") || toolName.includes("package") || toolName.includes("run");
    const terminalCmd = isExecution ? (args?.command ?? args?.code ?? args?.path ?? "") : "";
    const terminalLang = toolName.includes("python") ? "python" : "bash";

    const isFileTool = toolName.includes("file") || toolName.includes("write") || toolName.includes("edit") || toolName.includes("read") || toolName.includes("generating");
    const filePath = args?.path ?? "";
    const filename = filePath.split(/[\\/]/).pop() ?? filePath;
    const fileContent = args?.content ?? args?.code ?? args?.new_str ?? result ?? "";
    const language = filename.split('.').pop() || 'text';

    return (
      <div className="flex gap-2.5">
        <TimelineNode icon={toolIconEl} isFirst={isFirst} isLast={isLast} />
        <div className="py-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">
              {status.message || toolName}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded px-1.5 py-0.5">
              {toolName}
            </span>
            {rightSlot && <span className="inline-flex shrink-0 align-middle">{rightSlot}</span>}
          </div>

          {isExecution && terminalCmd ? (
            <TerminalBlock
              command={terminalCmd}
              language={terminalLang}
              isRunning={isRunning}
              output={result || undefined}
            />
          ) : isFileTool && filePath ? (
            <FileCodeBlock
              filename={filename}
              content={fileContent || undefined}
              language={language}
              isRunning={isRunning}
              isSuccess={isDone}
              isError={isErrTool}
            />
          ) : Object.keys(args).length > 0 && (
            <div className="mt-2 rounded-lg border border-[var(--surface-border)] overflow-hidden" style={{ background: '#0f0f0e' }}>
              <div className="px-3 py-1.5 border-b border-white/[0.06] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.2)' }}>
                Input
              </div>
              <pre className="text-[11.5px] leading-relaxed font-mono px-4 py-2.5 overflow-x-auto max-h-[200px] overflow-y-auto" style={{ color: '#b5b2aa' }}>
                {JSON.stringify(args, null, 2)}
              </pre>
              {result && (
                <>
                  <div className="px-3 py-1.5 border-t border-white/[0.06] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    Output
                  </div>
                  <pre className="text-[11.5px] leading-relaxed font-mono px-4 py-2.5 overflow-x-auto max-h-[200px] overflow-y-auto" style={{ color: '#9a978f' }}>
                    {result}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      </div>
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
    return (
      <StepRow rightSlot={rightSlot}
        icon={<WarnIcon cls="text-red-400/60" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

  // ─── done ─────────────────────────────────────────────────────────────────
  if (status.subtype === "done") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<DoneIcon cls="text-[var(--text-secondary)]" />}
        message={status.message} isFirst={isFirst} isLast={isLast} pulse={false}
      />
    );
  }

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
        <div className="mt-2 rounded-lg overflow-hidden border border-[var(--surface-border)]" style={{ background: '#0f0f0e' }}>
          <div className="px-3 py-1.5 border-b border-white/[0.06] text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.2)' }}>
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