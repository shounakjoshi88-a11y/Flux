// src/components/StatusMessage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Inline status renderer — redesigned terminal / thought / file / tool_call UIs.
// Drop-in replacement: same props & exports as the previous version.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { MessageRenderer } from "./MessageRenderer";
import { calculateReputationScore } from "../utils/ReputationScore";

// ── Icons — 20×20 viewport, size-4, 1.6px stroke ───────────────────────────
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
    <circle cx="10" cy="10" r="7.5" />
    <polyline points="5.5,10 9,13.5 14.5,7" />
  </S>
);

const ExtractIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <line x1="2.5" y1="4" x2="17.5" y2="4" />
    <line x1="2.5" y1="4" x2="8.5" y2="12" />
    <line x1="17.5" y1="4" x2="11.5" y2="12" />
    <line x1="5" y1="6.5" x2="15" y2="6.5" strokeWidth="1" opacity="0.4" />
    <line x1="6.5" y1="9.2" x2="13.5" y2="9.2" strokeWidth="1" opacity="0.4" />
    <line x1="8.5" y1="12" x2="9.2" y2="15.5" />
    <line x1="11.5" y1="12" x2="10.8" y2="15.5" />
    <circle cx="10" cy="17.5" r="1.3" fill="currentColor" strokeWidth="0" />
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

// Clock icon for thinking
function ClockIcon({ className }: { className?: string }) {
  const cx = 8, cy = 8, r = 6;
  const toXY = (hour: number, len: number) => {
    const a = (hour / 12) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + len * Math.cos(a), y: cy + len * Math.sin(a) };
  };
  const arcStart = toXY(12, r);
  const arcEnd   = toXY(8, r);
  const dots = [9, 10, 11].map(h => toXY(h, r));
  const hourHand   = toXY(4, 3.1);  // pointing at 4 (lower-right)
  const minuteHand = toXY(12, 4.1); // pointing at 12 (straight up)
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={`M ${arcStart.x.toFixed(2)} ${arcStart.y.toFixed(2)} A ${r} ${r} 0 1 1 ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}`} stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
      {dots.map((d, i) => <circle key={i} cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r="0.55" fill="currentColor" />)}
      <line x1={cx} y1={cy} x2={hourHand.x.toFixed(2)} y2={hourHand.y.toFixed(2)} stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={minuteHand.x.toFixed(2)} y2={minuteHand.y.toFixed(2)} stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="0.65" fill="currentColor" />
    </svg>
  );
}

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

// ── Language colour map for file extension badges ──────────────────────────
const LANG_COLORS: Record<string, { badge: string; dot: string; glow: string }> = {
  python:     { badge: 'text-blue-400/80 bg-blue-500/10 border-blue-500/20',     dot: 'bg-blue-400/70',    glow: 'shadow-[0_0_8px_-2px_rgba(96,165,250,0.5)]' },
  javascript: { badge: 'text-yellow-400/80 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-400/70', glow: 'shadow-[0_0_8px_-2px_rgba(250,204,21,0.5)]' },
  typescript: { badge: 'text-sky-400/80 bg-sky-500/10 border-sky-500/20',         dot: 'bg-sky-400/70',    glow: 'shadow-[0_0_8px_-2px_rgba(56,189,248,0.5)]' },
  html:       { badge: 'text-orange-400/80 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400/70', glow: 'shadow-[0_0_8px_-2px_rgba(251,146,60,0.5)]' },
  css:        { badge: 'text-purple-400/80 bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-400/70', glow: 'shadow-[0_0_8px_-2px_rgba(192,132,252,0.5)]' },
  bash:       { badge: 'text-green-400/80 bg-green-500/10 border-green-500/20',   dot: 'bg-green-400/70',  glow: 'shadow-[0_0_8px_-2px_rgba(74,222,128,0.5)]' },
  sh:         { badge: 'text-green-400/80 bg-green-500/10 border-green-500/20',   dot: 'bg-green-400/70',  glow: 'shadow-[0_0_8px_-2px_rgba(74,222,128,0.5)]' },
  c:          { badge: 'text-slate-300/80 bg-slate-500/10 border-slate-500/20',   dot: 'bg-slate-300/70',  glow: 'shadow-[0_0_8px_-2px_rgba(203,213,225,0.4)]' },
  cpp:        { badge: 'text-indigo-300/80 bg-indigo-500/10 border-indigo-500/20', dot: 'bg-indigo-300/70', glow: 'shadow-[0_0_8px_-2px_rgba(165,180,252,0.5)]' },
  rust:       { badge: 'text-orange-300/80 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-300/70', glow: 'shadow-[0_0_8px_-2px_rgba(253,186,116,0.5)]' },
  go:         { badge: 'text-cyan-400/80 bg-cyan-500/10 border-cyan-500/20',     dot: 'bg-cyan-400/70',   glow: 'shadow-[0_0_8px_-2px_rgba(34,211,238,0.5)]' },
  java:       { badge: 'text-red-400/80 bg-red-500/10 border-red-500/20',        dot: 'bg-red-400/70',    glow: 'shadow-[0_0_8px_-2px_rgba(248,113,113,0.5)]' },
  json:       { badge: 'text-yellow-300/80 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-300/70', glow: 'shadow-[0_0_8px_-2px_rgba(253,224,71,0.5)]' },
  markdown:   { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
  md:         { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
  sql:        { badge: 'text-teal-400/80 bg-teal-500/10 border-teal-500/20',     dot: 'bg-teal-400/70',   glow: 'shadow-[0_0_8px_-2px_rgba(45,212,191,0.5)]' },
  text:       { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
  txt:        { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
};

const getLangStyle = (lang: string) =>
  LANG_COLORS[lang?.toLowerCase()] ?? { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' };

// ── Live elapsed-seconds hook ──────────────────────────────────────────────
function useElapsedSeconds(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isActive) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startRef.current) {
        setElapsed((Date.now() - startRef.current) / 1000);
      }
    }, 100);
    return () => clearInterval(id);
  }, [isActive]);
  return elapsed;
}

function formatElapsed(secs: number): string {
  if (secs < 10) return `${secs.toFixed(1)}s`;
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

// ── String typewriter hook ──────────────────────────────────────────────────
function useStringTypewriter(text: string | undefined, isRunning: boolean, speed = 15): string {
  const safe = text ?? '';
  const [len, setLen] = useState(() => (isRunning ? 0 : safe.length));
  const textRef = useRef(safe);
  textRef.current = safe;

  useEffect(() => {
    if (!isRunning) {
      setLen(textRef.current.length);
    } else {
      setLen(0);
    }
  }, [isRunning, safe]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setLen(prev => {
        const full = textRef.current;
        if (prev >= full.length) return prev;
        return Math.min(prev + speed, full.length);
      });
    }, 16);
    return () => clearInterval(id);
  }, [isRunning, safe, speed]);

  if (!isRunning) return safe;
  return safe.slice(0, len);
}

// ─────────────────────────────────────────────────────────────────────────────
// TerminalBlock v2 — Claude/VS Code-style bash terminal with syntax coloring,
// live timer, stdout/stderr split, and exit badge.
// ─────────────────────────────────────────────────────────────────────────────
function TerminalBlock({
  command,
  language = 'bash',
  isRunning = false,
  exitCode,
  durationStr,
  stdout,
  stderr,
  error,
}: {
  command?: string;
  language?: string;
  isRunning?: boolean;
  exitCode?: number;
  durationStr?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}) {
  const [stdoutOpen, setStdoutOpen] = useState(true);
  const [stderrOpen, setStderrOpen] = useState(true);
  const elapsed = useElapsedSeconds(isRunning);

  const displayedCommand = useStringTypewriter(command, isRunning, 12);
  const displayedStdout = useStringTypewriter(stdout, isRunning, 15);
  const displayedStderr = useStringTypewriter(stderr, isRunning, 15);
  const displayedError = useStringTypewriter(error, isRunning, 15);

  if (!command) return null;

  const isSuccess = exitCode === 0;
  const isFailure = exitCode !== undefined && exitCode !== 0;
  const langLabel = language || 'bash';
  const langStyle = getLangStyle(langLabel);

  // Prompt symbol per language
  const prompt = langLabel === 'python' ? '>>>' : langLabel === 'sh' || langLabel === 'bash' ? '$' : '$';
  const promptColor = langLabel === 'python' ? '#7dcfff' : '#9ece6a';

  // Tokenize command for bash syntax coloring
  const renderCommand = (cmd: string) => {
    if (langLabel === 'python') {
      // Token-stream highlighter: strings → comments → keywords → numbers → default.
      // Walks the string left-to-right, classifying each non-overlapping slice.
      const tokenRe = /(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|with|lambda|None|True|False|print|self|async|await|yield|raise|pass|break|continue|global|nonlocal)\b)|(\b\d+\.?\d*(?:e[+-]?\d+)?\b)/g;
      const parts: React.ReactNode[] = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      let key = 0;
      while ((m = tokenRe.exec(cmd)) !== null) {
        if (m.index > lastIdx) {
          parts.push(<span key={key++} style={{ color: '#c0caf5' }}>{cmd.slice(lastIdx, m.index)}</span>);
        }
        if (m[1]) {
          // comment
          parts.push(<span key={key++} style={{ color: '#565f89', fontStyle: 'italic' }}>{m[1]}</span>);
        } else if (m[2]) {
          // string
          parts.push(<span key={key++} style={{ color: '#9ece6a' }}>{m[2]}</span>);
        } else if (m[3]) {
          // keyword
          parts.push(<span key={key++} style={{ color: '#bb9af7' }}>{m[3]}</span>);
        } else if (m[4]) {
          // number
          parts.push(<span key={key++} style={{ color: '#ff9e64' }}>{m[4]}</span>);
        }
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < cmd.length) {
        parts.push(<span key={key++} style={{ color: '#c0caf5' }}>{cmd.slice(lastIdx)}</span>);
      }
      return <>{parts}</>;
    }
    // Bash tokenization: command / flags / strings / paths / pipes
    const tokens = cmd.match(/(\|\||&&|\|)|("[^"]*"|'[^']*'|\S+)/g) || [];
    return tokens.map((tok, i) => {
      const isQuoted = /^["']/.test(tok);
      const isPipe = tok === '|' || tok === '||' || tok === '&&';
      const isFlag = /^-/.test(tok);
      const isPath = !isQuoted && !isFlag && !isPipe && /[\/\.]/.test(tok);
      const isFirst = i === 0;
      let color = '#c0caf5'; // default
      if (isPipe) color = '#bb9af7';
      else if (isQuoted) color = '#9ece6a';
      else if (isFlag) color = '#7dcfff';
      else if (isPath) color = '#7aa2f7';
      else if (isFirst) color = '#e0af68'; // command name
      return (
        <span key={i}>
          {i > 0 && ' '}
          <span style={{ color }}>{tok}</span>
        </span>
      );
    });
  };

  const stdoutTrimmed = (displayedStdout || '').replace(/\n+$/, '');
  const stderrTrimmed = (displayedStderr || '').replace(/\n+$/, '');
  const errorTrimmed = (displayedError || '').replace(/\n+$/, '');
  const hasStdout = stdoutTrimmed.length > 0;
  const hasStderr = stderrTrimmed.length > 0 || errorTrimmed.length > 0;
  const stdoutLines = hasStdout ? stdoutTrimmed.split('\n').length : 0;
  const stderrLines = hasStderr ? (stderrTrimmed + (errorTrimmed ? '\n' + errorTrimmed : '')).split('\n').length : 0;

  const borderClass = isRunning
    ? 'border-[var(--accent)]/30'
    : isFailure
      ? 'border-red-500/25'
      : isSuccess
        ? 'border-emerald-500/15'
        : 'border-[var(--surface-border)]';

  return (
    <div className={`mt-2 rounded-lg overflow-hidden border transition-all duration-200 ${borderClass}`}
      style={{ background: '#0b0b0a' }}>

      {/* ── Block header bar */}
      <div className="flex items-center gap-2 px-3 py-[7px] border-b border-white/[0.05]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0.18))' }}>
        {/* Traffic dots */}
        <div className="flex gap-1.5 shrink-0">
          <span className="size-[8px] rounded-full" style={{ background: '#ff5f57', opacity: 0.65 }} />
          <span className="size-[8px] rounded-full" style={{ background: '#febc2e', opacity: 0.65 }} />
          <span className="size-[8px] rounded-full" style={{ background: '#28c840', opacity: 0.65 }} />
        </div>

        {/* Language label with colored dot */}
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono tracking-wide ml-1">
          <span className={`size-[5px] rounded-full ${langStyle.dot}`} />
          {langLabel}
        </span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Running indicator with live timer */}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--accent)]/90 font-mono">
              <span className="relative flex size-[6px]">
                <span className="absolute inset-0 rounded-full bg-[var(--accent)]/60 animate-ping" />
                <span className="relative size-[6px] rounded-full bg-[var(--accent)]" />
              </span>
              running · {formatElapsed(elapsed)}
            </span>
          )}
          {/* Exit code badge */}
          {!isRunning && exitCode !== undefined && (
            <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 border flex items-center gap-1 ${isSuccess
              ? 'bg-emerald-500/8 text-emerald-400/85 border-emerald-500/20'
              : 'bg-red-500/8 text-red-400/85 border-red-500/20'
              }`}>
              {isSuccess ? (
                <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1.5,5.5 4,8 8.5,2.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="2.5" y1="2.5" x2="7.5" y2="7.5" />
                  <line x1="7.5" y1="2.5" x2="2.5" y2="7.5" />
                </svg>
              )}
              exit {exitCode}{durationStr ? ` · ${durationStr}` : ''}
            </span>
          )}
          {/* Error badge (no exit code) */}
          {!isRunning && exitCode === undefined && error && (
            <span className="text-[10px] font-mono rounded px-1.5 py-0.5 border bg-red-500/8 text-red-400/85 border-red-500/20">
              error
            </span>
          )}
        </div>
      </div>

      {/* ── Command area with prompt + syntax highlighting */}
      <div className="relative">
        {/* Top accent line glow when running */}
        {isRunning && (
          <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.5 }} />
        )}
        <pre className="text-[12.5px] leading-[1.65] font-mono px-4 py-3 overflow-x-auto whitespace-pre-wrap break-words"
          style={{ color: '#c0caf5' }}>
          <span style={{ color: promptColor, marginRight: '6px' }}>{prompt}</span>
          {renderCommand(displayedCommand)}
          {isRunning && (
            <span
              className="inline-block w-[7px] h-[14px] ml-0.5 align-middle rounded-sm"
              style={{ background: 'var(--accent)', opacity: 0.85, animation: 'smBlink 1s step-end infinite' }}
            />
          )}
        </pre>
      </div>

      {/* ── STDERR section (shown first, red-tinted) */}
      {hasStderr && (
        <TerminalOutputSection
          title="stderr"
          lineCount={stderrLines}
          isOpen={stderrOpen}
          onToggle={() => setStderrOpen(v => !v)}
          accentColor="#f7768e"
          content={errorTrimmed ? (stderrTrimmed ? stderrTrimmed + '\n' + errorTrimmed : errorTrimmed) : stderrTrimmed}
        />
      )}

      {/* ── STDOUT section */}
      {hasStdout && (
        <TerminalOutputSection
          title="stdout"
          lineCount={stdoutLines}
          isOpen={stdoutOpen}
          onToggle={() => setStdoutOpen(v => !v)}
          accentColor="#9ece6a"
          content={stdoutTrimmed}
        />
      )}

      <style>{`
        @keyframes smBlink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}

// ── Collapsible output sub-section inside TerminalBlock ────────────────────
function TerminalOutputSection({
  title,
  lineCount,
  isOpen,
  onToggle,
  accentColor,
  content,
}: {
  title: string;
  lineCount: number;
  isOpen: boolean;
  onToggle: () => void;
  accentColor: string;
  content: string;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-[6px] border-t border-white/[0.05] hover:bg-white/[0.015] transition-colors text-left"
        style={{ background: 'rgba(0,0,0,0.18)' }}
      >
        <span className="size-[5px] rounded-full shrink-0" style={{ background: accentColor, opacity: 0.7 }} />
        <span className="text-[11px] text-[var(--text-muted)] font-mono tracking-wide">{title}</span>
        <span className="text-[10px] text-[var(--text-muted)]/60 font-mono">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
        <span className="ml-auto flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
          <ChevronDown className={`size-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          {isOpen ? 'hide' : 'show'}
        </span>
      </button>
      {isOpen && (
        <pre className="text-[11.5px] leading-[1.6] font-mono px-4 py-2.5 overflow-x-auto max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words border-t border-white/[0.03]"
          style={{ color: accentColor, opacity: 0.85 }}>
          {content}
        </pre>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FileCodeBlock v2 — file preview with extension coloring, shimmer while
// writing, line numbers, and collapsible content.
// ─────────────────────────────────────────────────────────────────────────────
function FileCodeBlock({
  filename,
  content,
  language = 'text',
  isRunning = false,
  isSuccess = false,
  isError = false,
  diffAdded,
  diffRemoved,
  oldStr,
  newStr,
  toolName,
}: {
  filename: string;
  content?: string;
  language?: string;
  isRunning?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  diffAdded?: number;
  diffRemoved?: number;
  oldStr?: string;
  newStr?: string;
  toolName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [animAdded, setAnimAdded] = useState(0);
  const [animRemoved, setAnimRemoved] = useState(0);
  const lang = getLangStyle(language);
  const preview = content ? content.slice(0, 6000) : '';
  const truncated = content ? content.length > 6000 : false;
  const hasContent = !!preview;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const lineCount = content ? content.split('\n').length : 0;
  const byteCount = content ? content.length : 0;

  // Animate diff counters upward
  const prevTargetRef = useRef<{ a: number; r: number }>({ a: 0, r: 0 });
  useEffect(() => {
    if (diffAdded === undefined || diffRemoved === undefined) return;
    const prev = prevTargetRef.current;
    const targetA = diffAdded;
    const targetR = diffRemoved;
    if (targetA === 0 && targetR === 0) { setAnimAdded(0); setAnimRemoved(0); prevTargetRef.current = { a: 0, r: 0 }; return; }
    const frame = (targetA + targetR) > 20 ? 12 : 40;
    let progress = 0;
    const step = () => {
      progress += 1 / (targetA + targetR || 1) * (frame === 12 ? 0.15 : 0.08);
      if (progress >= 1) { setAnimAdded(targetA); setAnimRemoved(targetR); return; }
      setAnimAdded(Math.min(Math.round(targetA * progress), targetA));
      setAnimRemoved(Math.min(Math.round(targetR * progress), targetR));
      requestAnimationFrame(step);
    };
    const timer = setTimeout(() => requestAnimationFrame(step), 60);
    prevTargetRef.current = { a: targetA, r: targetR };
    return () => clearTimeout(timer);
  }, [diffAdded, diffRemoved]);
  const displayAdded = isRunning ? animAdded : (diffAdded ?? 0);
  const displayRemoved = isRunning ? animRemoved : (diffRemoved ?? 0);

  const headerBorder = isRunning
    ? 'border-[var(--accent)]/25'
    : isError
      ? 'border-red-500/20'
      : isSuccess
        ? 'border-emerald-500/15'
        : 'border-[var(--surface-border)]';

  return (
    <div className={`mt-2 rounded-lg overflow-hidden border transition-all duration-200 ${headerBorder}`}
      style={{ background: '#0b0b0a' }}>

      {/* File header */}
      <button
        onClick={() => hasContent && setOpen(v => !v)}
        disabled={!hasContent}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-white/[0.05] transition-colors disabled:cursor-default ${hasContent ? 'hover:bg-white/[0.02]' : ''}`}
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.15))' }}
      >
        {/* Status dot / language dot */}
        <span className={`size-[7px] rounded-full shrink-0 ${isSuccess ? 'bg-emerald-400/80'
          : isError ? 'bg-red-400/80'
            : isRunning ? 'bg-[var(--accent)]/80 animate-pulse'
              : lang.dot
          }`} />

        {/* File glyph — colored by extension */}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`size-3.5 shrink-0 ${isSuccess ? 'text-emerald-400/70'
            : isError ? 'text-red-400/70'
              : isRunning ? 'text-[var(--accent)]/80'
                : 'text-[var(--text-muted)]'}`}>
          <path d="M4 2h5l2.5 2.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
          <polyline points="9,2 9,4.5 11.5,4.5" />
        </svg>

        {/* Filename */}
        <span className="font-mono text-[12.5px] text-[#d4d1cb] truncate">{filename}</span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Tool name badge */}
          {toolName && (
            <span className="text-[10px] font-mono rounded border border-white/10 px-1.5 py-[2px] text-[var(--text-muted)]/70">
              {toolName}
            </span>
          )}
          {/* Diff stats (animated) */}
          {diffAdded !== undefined && diffRemoved !== undefined && (
            <span className="text-[10px] font-mono">
              <span className="text-emerald-400/80">+{displayAdded}</span>
              <span className="text-red-400/80 ml-1">-{displayRemoved}</span>
            </span>
          )}
          {/* Writing shimmer */}
          {isRunning && diffAdded === undefined && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]/80 font-mono">
              <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 6 L4 8 L10 3" />
              </svg>
              writing
            </span>
          )}
          {/* Line count hint */}
          {lineCount > 1 && !isRunning && (
            <span className="text-[10px] text-[var(--text-muted)]">{lineCount} ln</span>
          )}
          {/* Byte hint */}
          {byteCount > 0 && !isRunning && byteCount < 1024 && (
            <span className="text-[10px] text-[var(--text-muted)]/60">{byteCount}B</span>
          )}
          {byteCount >= 1024 && !isRunning && (
            <span className="text-[10px] text-[var(--text-muted)]/60">{(byteCount / 1024).toFixed(1)}KB</span>
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

      {/* Shimmer sweep overlay while writing */}
      {isRunning && (
        <div className="relative h-[2px] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent animate-[flare-sweep_1.8s_linear_infinite]" />
        </div>
      )}

      {/* Before/after diff snippet for edit_file */}
      {(oldStr || newStr) && (
        <div className="border-t border-white/5">
          {oldStr && (
            <div>
              <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-red-400/70 font-mono border-b border-red-500/10 bg-red-500/5">
                <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 6 L4 9 L10 3" />
                </svg>
                replaced
              </div>
              <pre className="text-[11px] leading-[1.6] font-mono px-3 py-2 overflow-x-auto whitespace-pre-wrap text-red-300/70 max-h-[120px] overflow-y-auto">{oldStr}</pre>
            </div>
          )}
          {newStr && (
            <div>
              <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-emerald-400/70 font-mono border-b border-emerald-500/10 bg-emerald-500/5">
                <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 6 L4 8 L10 3" />
                </svg>
                new
              </div>
              <pre className="text-[11px] leading-[1.6] font-mono px-3 py-2 overflow-x-auto whitespace-pre-wrap text-emerald-300/70 max-h-[120px] overflow-y-auto">{newStr}</pre>
            </div>
          )}
        </div>
      )}

      {/* Content preview with line numbers */}
      {open && preview && (
        <div className="relative max-h-[440px] overflow-y-auto">
          <pre
            className="text-[11.5px] leading-[1.65] font-mono px-1 py-3 overflow-x-auto whitespace-pre"
            style={{ color: '#b5b2aa', tabSize: 2 } as React.CSSProperties}
          >
            {preview.split('\n').map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none text-right pr-3 pl-2 text-[var(--text-muted)]/40 w-[3.2em] shrink-0">{i + 1}</span>
                <span className="flex-1 pr-3">{line || ' '}</span>
              </div>
            ))}
            {truncated && content && (
              <div className="flex">
                <span className="select-none text-right pr-3 pl-2 text-[var(--text-muted)]/40 w-[3.2em] shrink-0">···</span>
                <span className="flex-1 pr-3 text-[var(--text-muted)] italic">truncated ({content.length - 6000} more bytes)</span>
              </div>
            )}
          </pre>
        </div>
      )}
    </div>
  );
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
