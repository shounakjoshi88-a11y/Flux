// src/components/MessageItem.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import {
  CornerDownRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Copy,
  Check,
  FileText,
  Pencil,
} from "lucide-react";
import { MessageRenderer, InlineMath } from "./MessageRenderer";
import { getDomain } from "@/lib/chat-utils";
import type { Message, Source } from "@/types";

type MessageItemProps = {
  message: Message & {
    error?: boolean;
    errorMessage?: string;
    followUps?: string[];
    answer?: string;
    type?: string;
    canvasCode?: string;
  };
  onCitationClick: (index: number) => void;
  onFollowUpClick: (question: string) => void;
  onRetry?: () => void;
  onRegenerate?: () => void;
  onSourceClick: (url: string) => void;
  onFileClick?: (file: { name: string; content: string }) => void;
  onCanvasReopen?: (message: Message) => void;
};

/* ------------------------------------------------------------------ */
/*  Scrollable cascade with variable speed + inertia fade              */
/* ------------------------------------------------------------------ */
function ScrollableSourceCascade({
  sources,
  onSourceClick,
}: {
  sources: Source[];
  onSourceClick: (url: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const decelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const currentSpeed = speedRef.current;
    const target = targetSpeedRef.current;
    const newSpeed = currentSpeed + (target - currentSpeed) * 0.15;
    speedRef.current = newSpeed;

    container.scrollLeft += newSpeed;

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [step]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
    },
    []
  );

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
        maskImage:
          "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        scrollbarWidth: "none",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {sources.map((source, idx) => (
        <button
          key={source.url + idx}
          onClick={(e) => {
            e.stopPropagation();
            onSourceClick(source.url);
          }}
          className="transition-all duration-150 hover:scale-125 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none shrink-0 rounded-full"
          title={getDomain(source.url)}
          style={{ zIndex: sources.length - idx }}
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.url)}&sz=64`}
            alt={getDomain(source.url)}
            className="size-6 rounded-full border-2 border-background bg-white dark:bg-[#000] object-contain hover:border-[#40E0FF]/70 transition-colors"
          />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Math helpers                                                      */
/* ------------------------------------------------------------------ */
function tokenizeInlineMath(
  text: string
): { type: "text" | "math"; value: string }[] {
  const parts: { type: "text" | "math"; value: string }[] = [];
  const regex = /\\\((.+?)\\\)|\$(.+?)\$/gs;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "text", value: text.slice(lastIdx, match.index) });
    }
    const inner = match[1] ?? match[2] ?? "";
    parts.push({ type: "math", value: inner });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "text", value: text.slice(lastIdx) });
  }
  return parts;
}

function RenderFollowUpText({ text }: { text: string }) {
  const tokens = tokenizeInlineMath(text);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === "math") {
          return <InlineMath key={`math-${i}`} formula={token.value} />;
        }
        return <span key={`text-${i}`}>{token.value}</span>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  MessageItem                                                       */
/* ------------------------------------------------------------------ */
export function MessageItem({
  message,
  onCitationClick,
  onFollowUpClick,
  onRetry,
  onRegenerate,
  onSourceClick,
  onFileClick,
  onCanvasReopen,
}: MessageItemProps) {
  // ── CANVAS SPECIAL MESSAGE ────────────────────
  if ((message as any).type === "canvas") {
    return (
      <div className="assistant-section">
        <button
          onClick={() => onCanvasReopen?.(message)}
          className="w-full p-4 rounded-xl border border-white/10 bg-[#1a1a1a]/80 hover:bg-[#222] transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Pencil className="size-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Canvas playground
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Click to continue editing your HTML live
              </p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // ── USER MESSAGE ────────────────────────────────
  if (message.role === "User") {
    const content = message.content;
    const fileAttachments = (message as any).fileAttachment as
      | { name: string; content?: string }[]
      | undefined;
    const cleanContent = content.replace(/\s*\[attached: [^\]]+\]\s*/g, "").trim();

    const [userCopied, setUserCopied] = useState(false);

    const handleUserCopy = async () => {
      try {
        await navigator.clipboard.writeText(cleanContent);
        setUserCopied(true);
        setTimeout(() => setUserCopied(false), 2000);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    };

    return (
      <div className="flex flex-col items-end gap-2 mt-8">
        {/* File chips – outside bubble, above, reduced bottom margin */}
        {fileAttachments && fileAttachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1 ">
            {fileAttachments.map((file, idx) => (
              <button
                key={file.name + idx}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileClick?.({ name: file.name, content: file.content ?? "" });
                }}
                className="file-chip-separate"
              >
                <FileText className="size-4 text-blue-500" />
                <span className="truncate max-w-[200px]">{file.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Message bubble + copy button below */}
        <div className="group flex flex-col items-end">
          <div className="user-message text-left">
            <p className="whitespace-pre-wrap">{cleanContent}</p>
          </div>

          {/* Copy button – visible on hover, below the bubble */}
          <button
            onClick={handleUserCopy}
            className="mt-1 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 dark:bg-white/5 hover:bg-black/40 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
            title="Copy message"
          >
            {userCopied ? (
              <Check className="size-3.5 text-emerald-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ─────────────────────────────────
  const isError = (message as any).error;

  if (isError) {
    return (
      <div className="assistant-section">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400">
          <span className="text-sm">
            {(message as any).errorMessage || "An error occurred"}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-auto flex items-center gap-1 text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-full transition"
            >
              <RefreshCw className="size-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── ASSISTANT MESSAGE ────────────────────────────
  const answer = (message as any).answer ?? message.content;
  const followUps: string[] = (message as any).followUps ?? [];
  const sources: Source[] = message.sources ?? [];

  const [copied, setCopied] = useState(false);

  const handleCopyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const isStreaming = (message as any).id === -1;

  return (
    <div className="assistant-section">
      <div className="prose prose-neutral dark:prose-invert max-w-none text-[16px] leading-7 text-foreground/90">
        <MessageRenderer
          content={answer}
          onCitationClick={onCitationClick}
          sources={sources}
        />
      </div>

      {/* Toolbar – only after message completed */}
      {!isStreaming && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          {/* Left: copy, share, rewrite, source cascade */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAnswer}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
              title="Copy answer"
            >
              {copied ? (
                <Check className="size-4 text-emerald-400" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
            <button
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
              title="Share (coming soon)"
            >
              <Share2 className="size-4" />
            </button>
            <button
              onClick={() => onRegenerate?.()}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
              title="Rewrite"
            >
              <RefreshCw className="size-4" />
            </button>

            {sources.length > 0 && (
              <div className="flex items-center gap-1.5">
                <ScrollableSourceCascade
                  sources={sources}
                  onSourceClick={onSourceClick}
                />
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {sources.length} {sources.length === 1 ? "source" : "sources"}
                </span>
              </div>
            )}
          </div>

          {/* Right: thumbs up / thumbs down */}
          <div className="flex items-center gap-1">
            <button
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
              title="Thumbs up"
            >
              <ThumbsUp className="size-4" />
            </button>
            <button
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
              title="Thumbs down"
            >
              <ThumbsDown className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Follow‑ups with inline math rendering */}
      {followUps.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">
            Follow‑ups
          </p>
          <div className="space-y-1.5">
            {followUps.map((question) => (
              <button
                key={question}
                onClick={() => onFollowUpClick(question)}
                className="flex items-center w-full gap-2.5 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group text-[15px] font-medium text-left"
              >
                <CornerDownRight className="size-4 text-muted-foreground group-hover:text-[#40E0FF] transition-colors shrink-0" />
                <span className="text-foreground/80 group-hover:text-foreground">
                  <RenderFollowUpText text={question} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}