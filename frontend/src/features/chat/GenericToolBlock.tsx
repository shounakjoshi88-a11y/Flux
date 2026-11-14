import { IconChevronDown } from "../layout/anthropicIcons";
import React, { useState } from "react";

import { TerminalBlock, FileCodeBlock } from "./TerminalBlock";
import { ToolRow, ToolPanel, ToolSection, useToolDisclosure } from "./ToolActivity";

export function GenericToolBlock({
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
  const isInstall = /package|install|pip|npm/i.test(toolName);
  void isInstall; // reserved for install-specific rendering

  // Claude's disclosure rows are collapsed by default while streaming and
  // open after completion; keep them open so nothing is hidden while
  // output arrives, and the user collapses manually.
  const { open, toggle } = useToolDisclosure(true);

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

  // Claude's row label: execution tools read "Ran a command", file tools
  // "Read a file"/"Wrote a file"/"Edited a file", everything else falls
  // back to the tool's own message/name.
  const isRead = /read|get|cat|open/i.test(toolName);
  const isWrite = /write|create|edit|delete/i.test(toolName);
  const rowLabel = message
    || (isExecution ? (isRunning ? "Running a command" : "Ran a command")
      : isFileTool ? (isRead ? "Read a file" : isWrite ? "Wrote a file" : "Updated a file")
      : toolName);

  // Error-only trailing badge (Claude's rows stay clean otherwise)
  const errBadge = isErr
    ? <span className="font-mono text-[10px] uppercase tracking-wide text-red-400/80">error</span>
    : undefined;

  return (
    <div className="min-w-0">
      {/* claude.ai: 20px disclosure row that expands into a card with the
          highlighted command / args / output. */}
      <ToolRow label={rowLabel} open={open} onToggle={toggle} isActive={isRunning} rightSlot={errBadge} />
      <ToolPanel open={open}>
        {/* Terminal block for execution tools */}
        {isExecution && terminalCmd ? (
          <ToolSection>
            <TerminalBlock
              command={terminalCmd}
              language={terminalLang}
              isRunning={isRunning}
              exitCode={status === "done" ? 0 : status === "error" ? 1 : undefined}
              stdout={result || undefined}
            />
          </ToolSection>
        ) : isFileTool && filename ? (
          <ToolSection>
            <FileCodeBlock
              filename={filename}
              content={fileContent || undefined}
              language={fileLang}
              isRunning={isRunning}
              isSuccess={isDone}
              isError={isErr}
            />
          </ToolSection>
        ) : argEntries.length > 0 ? (
          <ToolSection>
            <PrettyArgsBlock entries={argEntries} result={result} isResultJson={isResultJson} />
          </ToolSection>
        ) : result ? (
          <ToolSection>
            <div className="overflow-hidden rounded-md border border-white/[0.05]" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex items-center justify-between border-b border-white/[0.04] px-3 h-7">
                <p className="font-mono text-[11px] text-[var(--text-secondary)]">output</p>
              </div>
              <pre className="custom-scrollbar max-h-[200px] overflow-y-auto px-3 py-2.5 text-[12px] leading-[1.6] font-mono whitespace-pre-wrap break-words"
                style={{ color: '#9a978f' }}>
                {result}
              </pre>
            </div>
          </ToolSection>
        ) : null}
      </ToolPanel>
    </div>
  );
}

// ── Pretty key-value args block with collapsible output ────────────────────
export function PrettyArgsBlock({
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
              <IconChevronDown className={`size-3 transition-transform duration-200 ${showOutput ? 'rotate-180' : ''}`} />
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
export function prettyJson(str: string): React.ReactNode {
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


