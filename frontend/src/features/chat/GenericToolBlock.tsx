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

  const terminalCmd = args?.command ?? args?.code ?? args?.script ?? "";
  const terminalLang = /python/i.test(toolName) ? 'python' : 'bash';

  // Extract file info for file rendering
  const filePath = args?.path ?? args?.filename ?? "";
  const filename = filePath ? (filePath.split(/[\\/]/).pop() ?? filePath) : (args?.filename ?? "");
  const fileContent = args?.content ?? args?.code ?? args?.new_str ?? "";
  const fileLang = args?.language ?? (filename ? (filename.split('.').pop() || 'text') : 'text');

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
          highlighted command / args / output. */}      <ToolRow label={rowLabel} open={open} onToggle={toggle} isActive={isRunning} rightSlot={errBadge} />
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
        ) : result ? (
          // Flat output box — Claude-style: one section, mono scrollable output,
          // no Input/Output expanders, no JSON pretty-printing.
          <ToolSection>
            <div className="overflow-hidden rounded-md border border-white/[0.04]" style={{ background: 'rgba(0,0,0,0.35)' }}>
              <div className="flex items-center justify-between border-b border-white/[0.04] px-3 h-6">
                <p className="font-mono text-[10px] leading-none text-[var(--text-muted)]">output</p>
              </div>
              <pre
                className="custom-scrollbar max-h-[260px] overflow-y-auto px-3 py-2 text-[11.5px] leading-[1.6] font-mono whitespace-pre-wrap break-words"
                style={{ color: '#9a978f' }}
              >
                {String(result)}
              </pre>
            </div>
          </ToolSection>
        ) : result ? (
          <ToolSection>
            <div className="overflow-hidden rounded-md border border-white/[0.04]" style={{ background: 'rgba(0,0,0,0.35)' }}>
              <div className="flex items-center justify-between border-b border-white/[0.04] px-3 h-6">
                <p className="font-mono text-[10px] leading-none text-[var(--text-muted)]">output</p>
              </div>
              <pre
                className="custom-scrollbar max-h-[200px] overflow-y-auto px-3 py-2.5 text-[11.5px] leading-[1.6] font-mono whitespace-pre-wrap break-words"
                style={{ color: '#9a978f' }}
              >
                {String(result)}
              </pre>
            </div>
          </ToolSection>
        ) : null}
      </ToolPanel>
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
  searchQuery?: string;
  expanded?: boolean;
}


