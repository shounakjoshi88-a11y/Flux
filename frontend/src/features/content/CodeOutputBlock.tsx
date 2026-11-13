// src/components/CodeOutputBlock.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unified terminal-style code execution block.
// Renders the command with syntax highlighting, streams stdout/stderr in
// real-time, shows exit code + duration, and lists generated files.
// Matches the TerminalBlock aesthetic from StatusMessage.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { CodeOutputLine } from "../../types";
import { FileDownloadButton } from "./FileDownloadButton";

interface CodeOutputBlockProps {
  language?: string;
  code?: string;
  outputLines: CodeOutputLine[];
  exitCode?: number;
  duration?: number;
  isRunning: boolean;
  generatedFiles?: Array<{ filename: string; downloadUrl: string }>;
}

// ── Live elapsed-seconds hook ──────────────────────────────────────────────
function useElapsedSeconds(isActive: boolean, baseSeconds?: number): number {
  const [elapsed, setElapsed] = useState(baseSeconds ?? 0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isActive) {
      if (baseSeconds != null) setElapsed(baseSeconds);
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
  }, [isActive, baseSeconds]);
  return elapsed;
}

function formatElapsed(secs: number): string {
  if (secs < 10) return `${secs.toFixed(1)}s`;
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}

// ── Code typewriter — reveals the script text while isRunning ──────────────
function useCodeTypewriter(code: string | undefined, isRunning: boolean): string {
  const safe = code ?? '';
  const [len, setLen] = useState(() => (isRunning ? 0 : safe.length));
  const codeRef = useRef(safe);
  codeRef.current = safe;

  useEffect(() => {
    if (!isRunning) {
      setLen(codeRef.current.length);
    } else {
      setLen(0);
    }
  }, [isRunning, safe]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setLen(prev => {
        const full = codeRef.current;
        if (prev >= full.length) return prev;
        return Math.min(prev + 12, full.length);
      });
    }, 16);
    return () => clearInterval(id);
  }, [isRunning, safe]);

  if (!isRunning) return safe;
  return safe.slice(0, len);
}

// ── Output lines typewriter — streams output lines character-by-character ──────
function useOutputLinesTypewriter(outputLines: CodeOutputLine[], isRunning: boolean): number {
  const totalLength = outputLines.reduce((acc, line) => acc + line.content.length, 0);
  const [displayedLength, setDisplayedLength] = useState(() => (isRunning ? 0 : totalLength));
  
  const lastTotalRef = useRef(totalLength);
  const isRunningRef = useRef(isRunning);

  if (isRunning && !isRunningRef.current) {
    setDisplayedLength(0);
  }
  isRunningRef.current = isRunning;

  useEffect(() => {
    if (totalLength < lastTotalRef.current) {
      setDisplayedLength(isRunning ? 0 : totalLength);
    }
    lastTotalRef.current = totalLength;
  }, [totalLength, isRunning]);

  useEffect(() => {
    if (!isRunning) {
      setDisplayedLength(totalLength);
      return;
    }
    const interval = setInterval(() => {
      setDisplayedLength(prev => {
        if (prev < totalLength) {
          return Math.min(prev + 18, totalLength);
        }
        return prev;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [isRunning, totalLength]);

  if (!isRunning) return totalLength;
  return displayedLength;
}

// ── Syntax highlighting (shared with StatusMessage TerminalBlock) ──────────
function highlightBash(cmd: string): React.ReactNode {
  const tokens = cmd.match(/(\|\||&&|\|)|("[^"]*"|'[^']*'|\S+)/g) || [];
  return tokens.map((tok, i) => {
    const isQuoted = /^["']/.test(tok);
    const isPipe = tok === '|' || tok === '||' || tok === '&&';
    const isFlag = /^-/.test(tok);
    const isPath = !isQuoted && !isFlag && !isPipe && /[\/\.]/.test(tok);
    const isFirst = i === 0;
    let color = '#c0caf5';
    if (isPipe) color = '#bb9af7';
    else if (isQuoted) color = '#9ece6a';
    else if (isFlag) color = '#7dcfff';
    else if (isPath) color = '#7aa2f7';
    else if (isFirst) color = '#e0af68';
    return (
      <span key={i}>
        {i > 0 && ' '}
        <span style={{ color }}>{tok}</span>
      </span>
    );
  });
}

function highlightPython(cmd: string): React.ReactNode {
  const tokenRe = /(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|with|lambda|None|True|False|print|self|async|await|yield|raise|pass|break|continue|global|nonlocal)\b)|(\b\d+\.?\d*(?:e[+-]?\d+)?\b)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = tokenRe.exec(cmd)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={key++} style={{ color: '#c0caf5' }}>{cmd.slice(lastIdx, m.index)}</span>);
    }
    if (m[1]) parts.push(<span key={key++} style={{ color: '#565f89', fontStyle: 'italic' }}>{m[1]}</span>);
    else if (m[2]) parts.push(<span key={key++} style={{ color: '#9ece6a' }}>{m[2]}</span>);
    else if (m[3]) parts.push(<span key={key++} style={{ color: '#bb9af7' }}>{m[3]}</span>);
    else if (m[4]) parts.push(<span key={key++} style={{ color: '#ff9e64' }}>{m[4]}</span>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < cmd.length) parts.push(<span key={key++} style={{ color: '#c0caf5' }}>{cmd.slice(lastIdx)}</span>);
  return <>{parts}</>;
}

export function CodeOutputBlock({
  language = "python",
  code,
  outputLines,
  exitCode,
  duration,
  isRunning,
  generatedFiles = [],
}: CodeOutputBlockProps) {
  const [showOutput, setShowOutput] = useState(true);
  const outputRef = useRef<HTMLPreElement>(null);
  const liveElapsed = useElapsedSeconds(isRunning, duration ? duration / 1000 : undefined);
  const displayedCode = useCodeTypewriter(code, isRunning);
  const displayedLength = useOutputLinesTypewriter(outputLines, isRunning);

  // Slice outputLines according to displayedLength
  let accumulated = 0;
  const visibleOutputLines = [];
  for (const line of outputLines) {
    const lineLen = line.content.length;
    if (accumulated >= displayedLength) {
      break;
    }
    if (accumulated + lineLen <= displayedLength) {
      visibleOutputLines.push(line);
    } else {
      visibleOutputLines.push({
        type: line.type,
        content: line.content.slice(0, displayedLength - accumulated)
      });
    }
    accumulated += lineLen;
  }

  // Auto-scroll output to bottom when visible output length changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [visibleOutputLines.length, displayedLength]);

  const langLabel = language || 'python';
  const prompt = langLabel === 'python' ? '>>>' : '$';
  const promptColor = langLabel === 'python' ? '#7dcfff' : '#9ece6a';

  const isSuccess = exitCode === 0;
  const isFailure = exitCode !== undefined && exitCode !== 0;

  // Split output into stdout and stderr
  const stdoutLines = outputLines.filter(l => l.type !== 'stderr');
  const stderrLines = outputLines.filter(l => l.type === 'stderr');
  const hasStdout = stdoutLines.length > 0;
  const hasStderr = stderrLines.length > 0;

  const borderClass = isRunning
    ? 'border-[var(--accent)]/30'
    : isFailure
      ? 'border-red-500/25'
      : isSuccess
        ? 'border-emerald-500/15'
        : 'border-[var(--surface-border)]';

  return (
    <div
      className={`mt-2 rounded-lg overflow-hidden border transition-all duration-300 ${borderClass}`}
      style={{ background: '#0b0b0a', animation: 'stepFadeIn 0.35s ease-out both' }}
    >
      {/* ── Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-[7px] border-b border-white/[0.05]"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0.18))' }}
      >
        {/* Traffic dots */}
        <div className="flex gap-1.5 shrink-0">
          <span className="size-[8px] rounded-full" style={{ background: '#ff5f57', opacity: 0.65 }} />
          <span className="size-[8px] rounded-full" style={{ background: '#febc2e', opacity: 0.65 }} />
          <span className="size-[8px] rounded-full" style={{ background: '#28c840', opacity: 0.65 }} />
        </div>

        {/* Language label */}
        <span className="text-[11px] text-[var(--text-muted)] font-mono tracking-wide ml-1">
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
              running · {formatElapsed(liveElapsed)}
            </span>
          )}
          {/* Exit code badge */}
          {!isRunning && exitCode !== undefined && (
            <span
              className={`text-[10px] font-mono rounded px-1.5 py-0.5 border flex items-center gap-1 ${
                isSuccess
                  ? 'bg-emerald-500/8 text-emerald-400/85 border-emerald-500/20'
                  : 'bg-red-500/8 text-red-400/85 border-red-500/20'
              }`}
            >
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
              exit {exitCode}
              {duration ? ` · ${(duration / 1000).toFixed(1)}s` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Command area with prompt + syntax highlighting */}
      {displayedCode && (
        <div className="relative">
          {isRunning && (
            <div
              className="absolute top-0 left-0 right-0 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.5 }}
            />
          )}
          <pre
            className="text-[12.5px] leading-[1.65] font-mono px-4 py-3 overflow-x-auto whitespace-pre-wrap break-words"
            style={{ color: '#c0caf5' }}
          >
            <span style={{ color: promptColor, marginRight: '6px' }}>{prompt}</span>
            {langLabel === 'python' ? highlightPython(displayedCode) : highlightBash(displayedCode)}
            {isRunning && (
              <span
                className="inline-block w-[7px] h-[14px] ml-0.5 align-middle rounded-sm"
                style={{ background: 'var(--accent)', opacity: 0.85, animation: 'smBlink 1s step-end infinite' }}
              />
            )}
          </pre>
        </div>
      )}

      {/* ── Streaming output (combined stdout + stderr with inline coloring) */}
      {(hasStdout || hasStderr || (isRunning && outputLines.length === 0)) && (
        <>
          <button
            onClick={() => setShowOutput(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-[6px] border-t border-white/[0.05] hover:bg-white/[0.015] transition-colors text-left"
            style={{ background: 'rgba(0,0,0,0.18)' }}
          >
            <span
              className={`size-[5px] rounded-full shrink-0 ${
                hasStderr && !hasStdout ? 'bg-[#f7768e]' : 'bg-[#9ece6a]'
              }`}
              style={{ opacity: 0.7 }}
            />
            <span className="text-[11px] text-[var(--text-muted)] font-mono tracking-wide">Output</span>
            <span className="text-[10px] text-[var(--text-muted)]/60 font-mono">
              {outputLines.length} {outputLines.length === 1 ? 'line' : 'lines'}
            </span>
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
              <ChevronDown className={`size-3 transition-transform duration-200 ${showOutput ? 'rotate-180' : ''}`} />
              {showOutput ? 'hide' : 'show'}
            </span>
          </button>
          {showOutput && (
            <pre
              ref={outputRef}
              className="text-[11.5px] leading-[1.6] font-mono px-4 py-2.5 overflow-x-auto max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words border-t border-white/[0.03]"
              style={{ color: '#b5b2aa' }}
            >
              {visibleOutputLines.length === 0 && isRunning && (
                <span style={{ color: '#565f89', fontStyle: 'italic' }}>▶ Executing…</span>
              )}
              {visibleOutputLines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.type === 'stderr' ? '#f7768e' : '#9ece6a',
                    opacity: line.type === 'stderr' ? 0.85 : 0.9,
                    animation: 'outputLineIn 0.2s ease-out both',
                  }}
                >
                  {line.content}
                </div>
              ))}
              {isRunning && visibleOutputLines.length > 0 && (
                <span
                  className="inline-block w-[6px] h-[12px] ml-0.5 align-middle rounded-sm"
                  style={{ background: 'var(--accent)', opacity: 0.7, animation: 'smBlink 1s step-end infinite' }}
                />
              )}
            </pre>
          )}
        </>
      )}

      {/* ── Generated files */}
      {generatedFiles.length > 0 && (
        <div className="space-y-2 px-3 py-3 border-t border-white/[0.05]">
          {generatedFiles.map((file, i) => (
            <FileDownloadButton
              key={i}
              file={{ base64: '', filename: file.filename, mime: '' }}
              onDownload={() => {
                const link = document.createElement('a');
                link.href = file.downloadUrl;
                link.download = file.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes smBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes stepFadeIn { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
        @keyframes outputLineIn { from{opacity:0;transform:translateX(-2px)} to{opacity:0.9;transform:translateX(0)} }
      `}</style>
    </div>
  );
}
