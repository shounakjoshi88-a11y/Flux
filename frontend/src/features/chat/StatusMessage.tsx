// src/components/StatusMessage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Inline status renderer — redesigned terminal / thought / file / tool_call UIs.
// Drop-in replacement: same props & exports as the previous version.
// ─────────────────────────────────────────────────────────────────────────────
import { IconChevronDown } from "../layout/anthropicIcons.tsx";
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

import { MessageRenderer } from "./MessageRenderer";
import { calculateReputationScore } from "../../utils/ReputationScore";
import { SearchIcon, GlobeIcon, BookIcon, LinkIcon, WarnIcon, DoneIcon, ExtractIcon, TerminalIcon, FileIcon, ClockIcon, WikiIcon, PackageIcon, WeatherIcon, WandIcon, ImageIcon, ChartIcon, LANG_COLORS } from "./icons";
import { TerminalBlock, TerminalOutputSection, FileCodeBlock, useElapsedSeconds } from "./TerminalBlock";
import { GenericToolBlock, PrettyArgsBlock, prettyJson } from "./GenericToolBlock";
import { weatherGradient, weatherGradientAnimate, weatherEmoji, conditionLabel } from "./weatherUtils";

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
import { useWordByWord, TimelineNode, StepRow, SpinnerIcon, cleanThoughtText, parseThoughtSteps, ThoughtBlock } from "./ThoughtBlock";
import { WeatherStatus } from "./status/WeatherStatus";
import { WebSearchStatus } from "./status/WebSearchStatus";
import { SkillStatus } from "./status/SkillStatus";
import { FileStatus } from "./status/FileStatus";
import { SandboxStatus } from "./status/SandboxStatus";
import { WikiStatus } from "./status/WikiStatus";
import { ImageStatus } from "./status/ImageStatus";

type IProps = { cls?: string };
// ── Word-by-word typewriter hook ──────────────────────────────────────────
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

  // ─── weather ──────────────────────────────────────────────────────────
  if (WeatherStatus.handles(status.subtype)) {
    return (
      <WeatherStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
      />
    );
  }

  // ─── websearch ──────────────────────────────────────────────────────────
  if (WebSearchStatus.handles(status.subtype)) {
    return (
      <WebSearchStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
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

  // ─── skill ──────────────────────────────────────────────────────────
  if (SkillStatus.handles(status.subtype)) {
    return (
      <SkillStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
      />
    );
  }

  // ─── file ──────────────────────────────────────────────────────────
  if (FileStatus.handles(status.subtype)) {
    return (
      <FileStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
      />
    );
  }

  // ─── sandbox ──────────────────────────────────────────────────────────
  if (SandboxStatus.handles(status.subtype)) {
    return (
      <SandboxStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
      />
    );
  }

  // ─── wiki ──────────────────────────────────────────────────────────
  if (WikiStatus.handles(status.subtype)) {
    return (
      <WikiStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
      />
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

  // ─── image ──────────────────────────────────────────────────────────
  if (ImageStatus.handles(status.subtype)) {
    return (
      <ImageStatus
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        isActive={isActive}
        onSourceClick={onSourceClick}
        rightSlot={rightSlot}
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
          <IconChevronDown className={`size-3 transition-transform duration-200 ${detailOpen ? 'rotate-180' : ''}`} />
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
