import { IconChevronDown } from "../layout/anthropicIcons.tsx";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { StatusMessage } from "./StatusMessage";
import { CommandGroup } from "./CommandGroup";
import { TimelineNode } from "./ThoughtBlock";
import { ThoughtBlock } from "./ThoughtBlock";
import { ContentWithFileCards } from "./FileCards";
import { InlineImageDisplay } from "./ImageDisplay";
import { FileDownloadButton } from "../content/FileDownloadButton";
import TodoList from "./TodoList";
import PermissionDialog from "./PermissionDialog";
import { CodeOutputBlock } from "../content/CodeOutputBlock";
import { WebSearchSection } from "./status/WebSearchStatus";
import { FetchStatus } from "./status/FetchStatus";
import { ToolRow, ToolPanel } from "./ToolActivity";
import { getDomain } from "../../lib/chat-utils";
import type { MessagePart, Source } from "../../types";

const SEARCH_SUBTYPES = new Set(['searching', 'found_sources', 'no_results', 'error', 'web_search', 'done']);

function isSearchStep(part: MessagePart | undefined): boolean {
  return !!part && part.type === 'tool_call' && SEARCH_SUBTYPES.has(part.name);
}

/** reading statuses are emitted twice per fetch (phase:'fetching' at start,
 *  phase:'fetched' with the title at the end). Collapse each pair into the
 *  latest part per URL so exactly one row renders, showing the done state
 *  once it exists. Parts without a URL (e.g. "Parsing PDF") pass through. */
function dedupeReadingParts(parts: MessagePart[]): MessagePart[] {
  const lastIdxByUrl = new Map<string, number>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] as any;
    if (p?.type === 'tool_call' && p?.name === 'reading') {
      const url = typeof p?.input?.url === 'string' ? p.input.url : '';
      if (url) lastIdxByUrl.set(url, i);
    }
  }
  if (lastIdxByUrl.size === 0) return parts;
  return parts.filter((p: any, i: number) => {
    if (p?.type === 'tool_call' && p?.name === 'reading') {
      const url = typeof p?.input?.url === 'string' ? p.input.url : '';
      return !url || lastIdxByUrl.get(url) === i;
    }
    return true;
  });
}

export function SearchStepsGroup({
  parts: groupParts,
  groupStartIndex,
  allParts,
  isStreaming,
  onSourceClick,
  hasActiveStatus,
}: {
  parts: MessagePart[];
  groupStartIndex: number;
  allParts: MessagePart[];
  isStreaming: boolean;
  onSourceClick?: (url: string | null) => void;
  hasActiveStatus?: boolean;
}) {
  const [open, setOpen] = useState(true);

  const typedParts = groupParts as (MessagePart & { type: 'tool_call' })[];
  const firstPart = typedParts[0];

  if (!firstPart) return null;

  const searchQuery = firstPart.input?.query ?? '';
  const streamingActive = isStreaming && typedParts.some((p) => p.status === 'running');

  // A group with zero renderable sections (e.g. a `found_sources` status with no
  // sources attached — emitted after URL reads) would be an empty disclosure
  // husk that lies about a search having happened. Render nothing instead.
  // `error` is excluded too: WebSearchSection has no renderer for it, so it
  // would produce the same husk. (Search-skip chatter is noise by design.)
  const hasRenderable = typedParts.some((p) => {
    if (p.name === 'searching' || p.name === 'no_results') return true;
    if (p.name === 'found_sources') return ((p.input as any)?.sources?.length ?? 0) > 0;
    return false;
  });
  if (!hasRenderable) return null;

  return (
    <div className="min-w-0">
      {/* claude.ai: one 20px disclosure row ("Searched the web") expanding into
          a hairline-divided card with the query, source list and read lines. */}
      <ToolRow
        label="Searched the web"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        isActive={streamingActive}
      />
      <ToolPanel open={open}>
        {typedParts.map((part, idx) => (
          <WebSearchSection
            key={idx}
            status={{
              type: part.name,
              subtype: part.name,
              message: part.output || '',
              data: part.input,
            }}
            searchQuery={part.name === 'found_sources' ? searchQuery : undefined}
            isPartActive={isStreaming && part.status === 'running'}
            onSourceClick={onSourceClick}
          />
        ))}
      </ToolPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PartsRenderer — renders MessagePart[] in arrival order             */
/* ------------------------------------------------------------------ */
export function PartsRenderer({
  parts,
  isStreaming,
  typewriterContent,
  messageId,
  onCitationClick,
  sources,
  onFileClick,
  onPreview,
  onFileDelete,
  onSourceClick,
  activeGenerationStatus,
  onHtmlPreview,
  conversationId,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
  typewriterContent: string;
  messageId: string | number;
  onCitationClick: (index: number) => void;
  sources: Source[];
  onFileClick?: (file: { name: string; content: string }) => void;
  onPreview?: (data: { type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md'; base64?: string; html?: string; filename: string }) => void;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  onSourceClick?: (url: string | null) => void;
  activeGenerationStatus?: { subtype: string; message: string; data?: any } | null;
  onHtmlPreview?: (html: string) => void;
  conversationId?: string | null;
}) {
  // Collapse duplicate reading-start parts superseded by a done part.
  parts = useMemo(() => dedupeReadingParts(parts), [parts]);

  // Find the last text part index for typewriter treatment
  const lastTextPartIndex = (() => {
    let lastIdx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i]?.type === "text") {
        lastIdx = i;
        break;
      }
    }
    return lastIdx;
  })();

  const renderedParts: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    switch (part.type) {
      case "text": {
        const rawText = i === lastTextPartIndex ? typewriterContent : part.text;
        if (rawText.trim()) {
          renderedParts.push(
            <div key={`text-${i}`} className="max-w-none text-foreground/90">
              <ContentWithFileCards text={rawText} conversationId={conversationId} onCitationClick={onCitationClick} sources={sources} onHtmlPreview={onHtmlPreview} />
            </div>
          );
        }
        break;
      }
      case "tool_call": {
        // URL fetch rows — claude.ai-style "Fetched: <title>" disclosure.
        if (part.name === 'reading') {
          renderedParts.push(
            <div key={`fetch-${i}`} className="mb-0.5 min-w-0">
              <FetchStatus
                status={{
                  type: "tool_call",
                  subtype: "reading",
                  message: part.output || "",
                  data: (part as any).input ?? {},
                }}
                isActive={isStreaming && part.status === "running" && !((part as any).input?.phase)}
              />
            </div>
          );
          break;
        }

        // Group consecutive search steps into collapsible section.
        // Split on each new 'searching' — each search cycle gets its own collapsible.
        if (isSearchStep(part)) {
          const groupParts: MessagePart[] = [part];
          let j = i + 1;
          while (j < parts.length && isSearchStep(parts[j])) {
            const nextP = parts[j];
            if (nextP) {
              if (nextP.type === 'tool_call' && nextP.name === 'searching') break;
              groupParts.push(nextP);
            }
            j++;
          }
          const groupStartIndex = i;
          i = j - 1;

          renderedParts.push(
            <SearchStepsGroup
              key={`search-${groupStartIndex}`}
              parts={groupParts}
              groupStartIndex={groupStartIndex}
              allParts={parts}
              isStreaming={isStreaming}
              onSourceClick={onSourceClick}
              hasActiveStatus={!!activeGenerationStatus}
            />
          );
          break;
        }

        // Render consecutive non-search tool calls as individual StatusMessage items
        const toolParts: MessagePart[] = [part];
        let j = i + 1;
        while (j < parts.length) {
          const nextPart = parts[j];
          if (nextPart?.type === "tool_call" && !isSearchStep(nextPart)) {
            toolParts.push(nextPart);
            j++;
          } else {
            break;
          }
        }
        i = j - 1;

        // Consecutive non-search tool calls aggregate into one Claude-style
        // disclosure ("Ran 2 commands, read a file") with a nested row per call.
        renderedParts.push(
          <CommandGroup
            key={`cmd-group-${i - (toolParts.length - 1)}`}
            parts={toolParts}
            isStreaming={isStreaming}
          />
        );
        break;
      }
      case "thought": {
        if (part.content?.trim()) {
          const thoughtIsLast = !activeGenerationStatus && (i === parts.length - 1 || parts[i + 1]?.type !== "thought");
          const thoughtIsFirst = i === 0 || parts[i - 1]?.type !== "thought";
          renderedParts.push(
            <div key={`thought-${i}`} className="mb-0.5">
              <ThoughtBlock
                content={part.content}
                isFirst={thoughtIsFirst}
                isLast={thoughtIsLast}
                isActive={isStreaming && thoughtIsLast}
              />
            </div>
          );
        }
        break;
      }
      case "image": {
        renderedParts.push(
          <div key={`img-${i}`} className="mt-2">
            <InlineImageDisplay
              file={{
                base64: part.url?.startsWith("data:") ? part.url.replace(/^data:[^;]+;base64,/, "") : part.url,
                filename: part.filename,
                mime: part.mime,
              }}
              messageId={messageId}
              index={i}
            />
          </div>
        );
        break;
      }
      case "file": {
        renderedParts.push(
          <div key={`file-${i}`} className="mt-2">
            <FileDownloadButton
              file={{ base64: part.base64 || '', filename: part.filename, mime: part.mime || '' }}
              onPreview={onPreview}
              onDelete={onFileDelete ? () => onFileDelete(messageId, part.filename, 'fileAttachment') : undefined}
            />
          </div>
        );
        break;
      }
      case "todos": {
        renderedParts.push(
          <div key={`todos-${i}`} className="mb-0.5 ml-1">
            <TodoList items={part.items} />
          </div>
        );
        break;
      }
      case "permission": {
        if (part.status === "pending") {
          renderedParts.push(
            <div key={`perm-${i}`} className="mb-0.5">
              <PermissionDialog
                request={{
                  id: part.id,
                  toolName: part.toolName,
                  args: part.args,
                  description: part.description,
                }}
                onRespond={(id, approved) => {
                  const targetId = typeof messageId === 'number' ? String(messageId) : messageId;
                }}
              />
            </div>
          );
        }
        break;
      }
      case "tool_group": {
        renderedParts.push(
          <div key={`toolgrp-${i}`} className="mb-0.5">
            <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/20 px-3 py-2">
              <div className="text-xs text-zinc-400 font-medium mb-1">Running {part.tools.length} tool(s)...</div>
              <div className="space-y-1">
                {part.tools.map((tool, ti) => (
                  <div key={ti} className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="size-1.5 rounded-full bg-amber-500/50 animate-pulse" />
                    <span className="font-mono">{tool.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
        break;
      }
      case "agent_status": {
        renderedParts.push(
          <div key={`astatus-${i}`} className="mb-0.5">
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500 border-l-2 border-zinc-700/30 pl-3 py-1">
              <span className={`size-1.5 rounded-full ${part.status === "connected" ? "bg-emerald-500" :
                part.status === "processing" ? "bg-amber-500 animate-pulse" :
                  part.status === "error" ? "bg-red-500" : "bg-zinc-500"
                }`} />
              {part.message}
            </div>
          </div>
        );
        break;
      }
      case "terminal": {
        renderedParts.push(
          <div key={`terminal-${i}`} className="mt-2 w-full">
            <pre className="bg-black text-green-400 text-xs p-3 rounded-lg overflow-x-auto">{part.content}</pre>
          </div>
        );
        break;
      }
      case "code_execution": {
        const termIconEl = (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"
            className="size-4 shrink-0 text-[var(--text-secondary)]/40">
            <rect x="2" y="3.5" width="16" height="13" rx="2" />
            <polyline points="5.5,8 8,10.5 5.5,13" strokeWidth="1.5" />
            <line x1="9.5" y1="13" x2="14.5" y2="13" strokeWidth="1.3" />
          </svg>
        );
        const actualIsFirst = i === 0 || parts[i - 1]?.type !== "tool_call";
        const actualIsLast = i === parts.length - 1 || parts[i + 1]?.type !== "tool_call";
        renderedParts.push(
          <div key={`code-${i}`} className="flex gap-2.5">
            <TimelineNode icon={termIconEl} isFirst={actualIsFirst} isLast={actualIsLast} />
            <div className="py-2 min-w-0 flex-1">
              <CodeOutputBlock {...part.block} />
            </div>
          </div>
        );
        break;
      }
    }
  }

  return <>{renderedParts}</>;
}

/* ------------------------------------------------------------------ */
/*  Scrollable source cascade (overlapping favicons)                   */
/* ------------------------------------------------------------------ */
export function ScrollableSourceCascade({
  sources,
  onSourceClick,
}: {
  sources: Source[];
  onSourceClick?: (url: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const decelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  const step = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const currentSpeed = speedRef.current;
    const target = targetSpeedRef.current;
    const newSpeed = currentSpeed + (target - currentSpeed) * 0.12;
    // Snap to a dead stop instead of coasting on sub-pixel velocities forever.
    if (Math.abs(newSpeed) < 0.02 && target === 0) {
      speedRef.current = 0;
    } else {
      speedRef.current = newSpeed;
      container.scrollLeft += newSpeed;
    }
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (decelTimerRef.current) clearTimeout(decelTimerRef.current);
    };
  }, [step]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const edgeThreshold = 0.3;
    const maxSpeed = 4.5;
    let newTarget = 0;
    if (x < width * edgeThreshold) {
      const fraction = 1 - x / (width * edgeThreshold);
      newTarget = -maxSpeed * fraction;
    } else if (x > width * (1 - edgeThreshold)) {
      const fraction = (x - width * (1 - edgeThreshold)) / (width * edgeThreshold);
      newTarget = maxSpeed * fraction;
    }
    targetSpeedRef.current = newTarget;
    if (decelTimerRef.current) {
      clearTimeout(decelTimerRef.current);
      decelTimerRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const decelerate = () => {
      const current = targetSpeedRef.current;
      if (Math.abs(current) < 0.1) {
        targetSpeedRef.current = 0;
        return;
      }
      targetSpeedRef.current = current * 0.85;
      decelTimerRef.current = setTimeout(decelerate, 16);
    };
    decelerate();
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex items-center -space-x-2 overflow-x-auto scroll-smooth max-w-[120px] pr-2 py-1"
      style={{
        maskImage: "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        scrollbarWidth: "none",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {sources.map((source, idx) => (
        <motion.button
          key={source.url + idx}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.2, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 480, damping: 24, delay: Math.min(idx * 0.055, 0.7) }
          }
          onClick={(e) => { e.stopPropagation(); onSourceClick?.(source.url); }}
          className="transition-colors duration-150 hover:shadow-lg focus:outline-none shrink-0 rounded-full"
          whileHover={reduceMotion ? undefined : { scale: 1.22, y: -2 }}
          whileTap={{ scale: 1.15 }}
          title={getDomain(source.url)}
          style={{ zIndex: sources.length - idx }}
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.url)}&sz=64`}
            alt={getDomain(source.url)}
            className="size-6 rounded-full border-2 border-background bg-white dark:bg-[#000] object-contain hover:border-[var(--accent)]/70 transition-colors"
          />
        </motion.button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UserFileAttachment — lazy-loads content for historical messages   */

