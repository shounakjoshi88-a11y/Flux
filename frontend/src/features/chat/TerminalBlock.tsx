import { IconChevronDown } from "../layout/anthropicIcons.tsx";
import React, { useState, useEffect, useRef } from "react";

import { LANG_COLORS } from "./icons";


// ── Icons — 20×20 viewport, size-4, 1.6px stroke ───────────────────────────
export const getLangStyle = (lang: string) =>
  LANG_COLORS[lang?.toLowerCase()] ?? { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' };

// ── Live elapsed-seconds hook ──────────────────────────────────────────────
export function useElapsedSeconds(isActive: boolean): number {
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

export function formatElapsed(secs: number): string {
  if (secs < 10) return `${secs.toFixed(1)}s`;
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

// ── String typewriter hook ──────────────────────────────────────────────────
export function useStringTypewriter(text: string | undefined, isRunning: boolean, speed = 15): string {
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
export function TerminalBlock({
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
export function TerminalOutputSection({
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
          <IconChevronDown className={`size-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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
export function FileCodeBlock({
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
            <IconChevronDown
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


