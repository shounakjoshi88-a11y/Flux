// src/components/MessageItem.tsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import TodoList from "./TodoList";

// ─── Typewriter hook ────────────────────────────────────────
function useTypewriter(fullText: string, messageId: string | number): string {
  const [displayedLength, setDisplayedLength] = useState(fullText.length);
  const fullTextRef = useRef(fullText);
  const prevFullTextRef = useRef(fullText);
  fullTextRef.current = fullText;
  const stateRef = useRef({ msgId: messageId, streaming: String(messageId).startsWith("temp-") });

  // Handle message identity transitions
  if (stateRef.current.msgId !== messageId) {
    const prevStreaming = stateRef.current.streaming;
    const nowStreaming = String(messageId).startsWith("temp-");
    stateRef.current = { msgId: messageId, streaming: nowStreaming };

    if (nowStreaming) {
      // New streaming message — start typewriter from 0
      if (displayedLength !== 0) setDisplayedLength(0);
    } else if (!prevStreaming) {
      // Loaded a different finished message — show full text
      if (displayedLength !== fullText.length) setDisplayedLength(fullText.length);
    }
    // prevStreaming → !nowStreaming: stream just ended, typewriter keeps catching up
  }

  // Detect when text is NOT a continuation (new segment after tool/thought)
  if (fullText !== prevFullTextRef.current) {
    if (!prevFullTextRef.current || !fullText.startsWith(prevFullTextRef.current)) {
      setDisplayedLength(0);
    }
    prevFullTextRef.current = fullText;
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayedLength(prev => {
        if (prev < fullTextRef.current.length) {
          return Math.min(prev + 2, fullTextRef.current.length);
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(interval);
  }, []);

  return fullText.slice(0, displayedLength);
}
import {
  CornerDownRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Copy,
  Check,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { MessageRenderer, InlineMath } from "./MessageRenderer";
import { FileDownloadButton } from "./FileDownloadButton";
import { getDomain } from "@/lib/chat-utils";
import type { Message, MessagePart, Source } from "@/types";

type MessageItemProps = {
  message: Message & {
    error?: boolean;
    errorMessage?: string;
    followUps?: string[];
    answer?: string;
    type?: string;
    fileAttachment?: { name: string; content?: string; type?: string }[];
    generatedFiles?: {
      base64: string;
      filename: string;
      mime: string;
      slides?: { title: string; content: string }[];
      sections?: { heading: string; body: string }[];
      pages?: { text: string }[];
    }[];
  };
  sources?: Source[];
  onCitationClick: (index: number) => void;
  onFollowUpClick: (question: string) => void;
  onRetry?: () => void;
  onRegenerate?: () => void;
  onSourceClick: (url: string) => void;
  onFileClick?: (file: { name: string; content: string }) => void;
  onPreview?: (data: { 
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md'; 
    base64?: string; 
    html?: string; 
    filename: string 
  }) => void;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  activeGenerationStatus?: { subtype: string; message: string } | null;
};

import { StatusMessage } from "./StatusMessage";
import { BACKEND_URL } from "@/lib/config";
import { createClient } from "@/lib/client";

// ─── Inline image display for AI-generated images ────────────────────────
function InlineImageDisplay({
  file,
  onDelete,
  messageId,
  index
}: {
  file: { base64?: string; thumbnail?: string; filename: string; mime: string; width?: number; height?: number; placeholder?: boolean };
  onDelete?: () => void;
  messageId: string | number;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [fullBase64, setFullBase64] = useState<string | null>(file.base64 || null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Automatic Background Fetch ──
  // If we have NO high-res AND no thumbnail, we MUST fetch high-res immediately for the view
  useEffect(() => {
    if (!fullBase64 && !file.thumbnail && file.placeholder && messageId !== -1 && !isAutoLoading) {
      const fetchViewAsset = async () => {
        try {
          setIsAutoLoading(true);
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) return;

          const res = await fetch(`${BACKEND_URL}/api/assets/${messageId}/generated/${index}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.base64) setFullBase64(data.base64);
          }
        } catch (e) {
          console.error("View asset fetch error:", e);
        } finally {
          setIsAutoLoading(false);
        }
      };
      fetchViewAsset();
    }
  }, [file.placeholder, fullBase64, file.thumbnail, messageId, index, isAutoLoading]);

  // The source is either the full high-res image OR the lightweight thumbnail
  const displaySrc = fullBase64 
    ? `data:${file.mime};base64,${fullBase64}` 
    : file.thumbnail 
      ? `data:image/jpeg;base64,${file.thumbnail}` 
      : "";

  const handleDownload = async () => {
    let b64 = fullBase64;
    
    // If we don't have the high-res version yet, fetch it on-demand
    if (!b64 && messageId !== -1) {
      try {
        setIsDownloading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch(`${BACKEND_URL}/api/assets/${messageId}/generated/${index}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.base64) {
            b64 = data.base64;
            setFullBase64(b64); // Save it so subsequent downloads/views are instant
          }
        }
      } catch (e) {
        console.error("High-res fetch error:", e);
      } finally {
        setIsDownloading(false);
      }
    }

    if (!b64) return;
    const a = document.createElement("a");
    a.href = `data:${file.mime};base64,${b64}`;
    a.download = file.filename;
    a.click();
  };

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const resolution = file.width && file.height
    ? `${file.width}×${file.height}`
    : naturalSize
      ? `${naturalSize.w}×${naturalSize.h}`
      : null;

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black/20 group/img">
      {/* Image */}
      <div
        className="relative cursor-zoom-in min-h-[100px] flex items-center justify-center bg-stone-900/50"
        onClick={() => displaySrc && setExpanded(!expanded)}
      >
        {displaySrc ? (
          <>
            <img
              src={displaySrc}
              alt="AI generated image"
              onLoad={handleImgLoad}
              className={`w-full object-cover transition-all duration-500 ${expanded ? "max-h-none" : "max-h-[420px]"} ${!fullBase64 ? "blur-[2px] opacity-90" : ""}`}
              style={{ display: "block" }}
            />
            {!expanded && (
              <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            )}
          </>
        ) : (
          <div className="py-12 flex flex-col items-center gap-2">
            <div className="size-5 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Initialising...</span>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/8 bg-black/20">
        <div className="flex items-center gap-2">
          {resolution && (
            <span className="text-[10px] font-mono text-muted-foreground/60 select-none">
              {resolution}
            </span>
          )}
          {!fullBase64 && file.thumbnail && (
            <span className="text-[9px] bg-amber-500/10 text-amber-500/80 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">Preview</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
            disabled={!displaySrc}
          >
            {expanded ? "↑ Collapse" : "↓ Expand"}
          </button>
          <button
            onClick={handleDownload}
            className={`px-2 py-1 rounded-md text-[10px] flex items-center gap-1.5 transition-all ${isDownloading ? "text-amber-400 bg-amber-400/10" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <div className="size-2.5 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
                Fetching 4K...
              </>
            ) : (
              "↓ Download Full-Res"
            )}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Image generation skeleton (ChatGPT-style) ───────────────
const IMAGE_SKELETON_CSS = `
  @keyframes imgSkeletonIn {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  @keyframes labelFade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

const CARD_BG_VAL = 54; // #363636 - the flat grey

const IMAGE_GEN_LABELS = [
  "Creating image",
  "Making the first draft",
  "Painting the details",
  "Adding finishing touches",
  "Almost there",
  "Rendering your image",
  "Bringing it to life",
  "Sketching the composition",
  "Filling in the colors",
  "Sharpening the edges",
  "Applying texture",
  "Adjusting the lighting",
  "Polishing the details",
  "Just a moment more",
  "Fine-tuning the result",
  "Composing the scene",
  "Blending the elements",
  "Refining the image",
];

function ImageGenerationSkeleton({ stage }: { stage: "enhancing" | "generating" }) {
  const COLS = 22;
  const ROWS = 22;

  const [labelIdx, setLabelIdx] = useState(0);
  useEffect(() => {
    if (stage === "enhancing") return;
    const id = setInterval(() => setLabelIdx((i) => (i + 1) % IMAGE_GEN_LABELS.length), 4500);
    return () => clearInterval(id);
  }, [stage]);

  const label = stage === "enhancing" ? "Crafting your prompt…" : IMAGE_GEN_LABELS[labelIdx];

  const canvasRef = useRef<HTMLDivElement>(null);
  const frameRef  = useRef<number>(0);

  useEffect(() => {
    const dots = canvasRef.current
      ? Array.from(canvasRef.current.querySelectorAll<HTMLDivElement>(".sk-dot"))
      : [];
    if (!dots.length) return;

    // 4 corners in grid coords
    const CORNERS = [
      { x: 0,        y: 0 },
      { x: COLS - 1, y: 0 },
      { x: COLS - 1, y: ROWS - 1 },
      { x: 0,        y: ROWS - 1 },
    ];

    // Blob state
    let bx = 0, by = 0;          // current blob center (grid units)
    let targetIdx = 2;            // which corner we're heading to
    let tx = CORNERS[targetIdx]!.x;
    let ty = CORNERS[targetIdx]!.y;
    const SPEED = 0.018;          // lerp speed — slow, dreamy movement
    const BLOB_R = 3.8;           // circle radius in grid units
    const ARRIVE_DIST = 0.3;      // how close = "arrived"

    // pick a new random corner that isn't the current one
    function pickNext(current: number) {
      let next: number;
      do { next = Math.floor(Math.random() * 4); } while (next === current);
      return next;
    }

    function frame() {
      // Lerp blob towards target
      bx += (tx - bx) * SPEED;
      by += (ty - by) * SPEED;

      // If arrived, pick next random corner
      const d = Math.hypot(tx - bx, ty - by);
      if (d < ARRIVE_DIST) {
        targetIdx = pickNext(targetIdx);
        tx = CORNERS[targetIdx]!.x;
        ty = CORNERS[targetIdx]!.y;
      }

      // Update each dot colour based on 2D distance from blob center
      dots.forEach((dot) => {
        const cx = parseFloat(dot.dataset.cx!);
        const cy = parseFloat(dot.dataset.cy!);
        const dist2d = Math.hypot(cx - bx, cy - by);
        // Gaussian circle falloff
        const glow = Math.exp(-(dist2d * dist2d) / (2 * BLOB_R * BLOB_R));
        // Interpolate from card-bg to white
        const v = Math.round(CARD_BG_VAL + glow * (255 - CARD_BG_VAL));
        dot.style.backgroundColor = glow < 0.04
          ? `rgb(${CARD_BG_VAL},${CARD_BG_VAL},${CARD_BG_VAL})`
          : `rgb(${v},${v},${v})`;
      });

      frameRef.current = requestAnimationFrame(frame);
    }

    frameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const bgColor = `rgb(${CARD_BG_VAL},${CARD_BG_VAL},${CARD_BG_VAL})`;

  return (
    <div
      className="mt-3 rounded-2xl overflow-hidden"
      style={{
        background: bgColor,
        animation: "imgSkeletonIn 0.3s ease-out forwards",
        width: "82%",
        minWidth: 380,
      }}
    >
      <style>{IMAGE_SKELETON_CSS}</style>

      {/* Label directly on card */}
      <div className="px-6 pt-6 pb-4">
        <span
          key={label}
          className="text-[15px] font-semibold text-white/80 tracking-tight"
          style={{ animation: "labelFade 0.4s ease-out" }}
        >
          {label}
        </span>
      </div>

      {/* Dot grid — no inner container, dots blend into card when off */}
      <div
        ref={canvasRef}
        style={{
          padding: "4px 22px 24px",
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: "11px",
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return (
            <div
              key={i}
              className="sk-dot"
              data-cx={col}
              data-cy={row}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: bgColor,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline generation indicator ────────────────────────────
function InlineGenerationIndicator({
  status,
  reasoningText,
}: {
  status: { subtype: string; message: string };
  reasoningText?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Image states get the full skeleton treatment
  if (status.subtype === "image_enhancing" || status.subtype === "image_generating") {
    return (
      <ImageGenerationSkeleton
        stage={status.subtype === "image_enhancing" ? "enhancing" : "generating"}
      />
    );
  }

  return (
    <div className="mt-3 group/gen border-l-2 border-stone-700/50 ml-2 pl-4 py-1">
      <div
        className="flex items-center gap-2 cursor-pointer select-none py-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-1 rounded-full bg-stone-500"
              style={{
                animation: "generationDotBounce 1.4s infinite ease-in-out both",
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-stone-400 group-hover/gen:text-stone-300 transition-colors flex items-center gap-1.5 antialiased">
          {status.message}
          <ChevronDown className={`size-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </div>

      {isOpen && reasoningText && (
        <div className="mt-2 text-[13px] text-stone-500 leading-relaxed border-l border-stone-800 ml-1.5 pl-3 py-1 animate-in fade-in slide-in-from-left-1 duration-300">
          <p className="whitespace-pre-wrap italic opacity-80 antialiased">
            {reasoningText}
            <span className="inline-block w-1 h-3 bg-stone-600 ml-1 animate-pulse align-middle" />
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Search steps group (searching → found_sources → reading) ────── */
const SEARCH_SUBTYPES = new Set(['searching', 'found_sources', 'reading']);

function isSearchStep(part: MessagePart): boolean {
  return part.type === 'tool_call' && SEARCH_SUBTYPES.has(part.name);
}

function SearchStepsGroup({
  parts: groupParts,
  groupStartIndex,
  allParts,
  isStreaming,
  onSourceClick,
}: {
  parts: MessagePart[];
  groupStartIndex: number;
  allParts: MessagePart[];
  isStreaming: boolean;
  onSourceClick?: (url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const actualIsFirst = groupStartIndex === 0 || allParts[groupStartIndex - 1]?.type !== 'tool_call';
  const groupEndIndex = groupStartIndex + groupParts.length - 1;
  const actualIsLast = groupEndIndex === allParts.length - 1 || allParts[groupEndIndex + 1]?.type !== 'tool_call';

  return (
    <div className="mb-0.5">
      <div className="cursor-pointer" onClick={() => setOpen(v => !v)}>
        <StatusMessage
          status={{
            type: groupParts[0].name,
            subtype: groupParts[0].name,
            message: groupParts[0].output || '',
            data: groupParts[0].input,
          }}
          isFirst={actualIsFirst}
          isLast={!open ? actualIsLast : false}
          isActive={isStreaming && groupParts[0].status === 'running'}
          showRail={true}
          onSourceClick={onSourceClick}
          rightSlot={
            <ChevronDown className={`size-3 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          }
        />
      </div>

{open && groupParts.slice(1).map((part, idx) => (
        <StatusMessage
          key={idx}
          status={{
            type: part.name,
            subtype: part.name,
            message: part.output || '',
            data: part.input,
          }}
          isFirst={idx === 0}
          isLast={idx === groupParts.length - 2}
          isActive={isStreaming && part.status === 'running'}
          showRail={true}
          onSourceClick={onSourceClick}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PartsRenderer — renders MessagePart[] in arrival order             */
/* ------------------------------------------------------------------ */
function PartsRenderer({
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
}) {
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
        const text = i === lastTextPartIndex ? typewriterContent : part.text;
        if (text.trim()) {
          renderedParts.push(
            <div key={`text-${i}`} className="max-w-none text-foreground/90">
              <MessageRenderer content={text} onCitationClick={onCitationClick} sources={sources} />
            </div>
          );
        }
        break;
      }
      case "tool_call": {
        // Group consecutive search steps into collapsible section
        if (isSearchStep(part)) {
          const groupParts: MessagePart[] = [part];
          let j = i + 1;
          while (j < parts.length && isSearchStep(parts[j])) {
            groupParts.push(parts[j]);
            j++;
          }
          i = j - 1;

          renderedParts.push(
            <SearchStepsGroup
              key={`search-${i}`}
              parts={groupParts}
              groupStartIndex={i - (groupParts.length - 1)}
              allParts={parts}
              isStreaming={isStreaming}
              onSourceClick={onSourceClick}
            />
          );
          break;
        }

        renderedParts.push(
          <div key={`tool-${i}`} className="mb-0.5">
            <StatusMessage
              status={{
                type: part.name,
                subtype: part.name,
                message: part.output || "",
                data: part.input,
              }}
              isFirst={i === 0 || parts[i - 1]?.type !== "tool_call" || parts[i - 1]?.name === 'reading_skill'}
              isLast={i === parts.length - 1 || parts[i + 1]?.type !== "tool_call"}
              isActive={isStreaming && part.status === "running"}
              showRail={true}
            />
          </div>
        );
        break;
      }
      case "thought": {
        if (part.content?.trim()) {
          renderedParts.push(
            <div key={`thought-${i}`} className="mb-0.5">
              <StatusMessage
                status={{
                  type: "thought",
                  subtype: "thought",
                  message: "Thinking…",
                  content: part.content,
                }}
                isFirst={i === 0 || parts[i - 1]?.type !== "thought"}
                isLast={i === parts.length - 1 || parts[i + 1]?.type !== "thought"}
                isActive={isStreaming && i === parts.length - 1}
                showRail={true}
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
              file={{
                base64: part.base64 || "",
                filename: part.filename,
                mime: part.mime,
              }}
              onPreview={onPreview}
              onDelete={onFileDelete ? () => onFileDelete(messageId, part.filename, 'generatedFiles') : undefined}
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
    }
  }

  return <>{renderedParts}</>;
}

/* ------------------------------------------------------------------ */
/*  Scrollable source cascade (overlapping favicons)                   */
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
        <button
          key={source.url + idx}
          onClick={(e) => { e.stopPropagation(); onSourceClick(source.url); }}
          className="transition-all duration-150 hover:scale-125 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none shrink-0 rounded-full"
          title={getDomain(source.url)}
          style={{ zIndex: sources.length - idx }}
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.url)}&sz=64`}
            alt={getDomain(source.url)}
            className="size-6 rounded-full border-2 border-background bg-white dark:bg-[#000] object-contain hover:border-[var(--accent)]/70 transition-colors"
          />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Math helpers                                                      */
/* ------------------------------------------------------------------ */
function tokenizeInlineMath(text: string): { type: "text" | "math"; value: string }[] {
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

/* ─── Ultimate answer cleaner ─── */
function deepCleanAnswer(raw: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return "";
  let clean = raw
    // 1. Remove JSON structures completely if they leaked
    .replace(/\{"type"[\s\S]*?\}/g, "")
    // 2. Strip thoughts/thinking blocks
    .replace(/<(?:thought|think)>[\s\S]*?(?:<\/(?:thought|think)>|$)/gi, '')
    // 3. Strip structural tags
    .replace(/<\/?(?:thought|think|ANSWER|FOLLOW_UPS|question)>/gi, '')
    // 4. Clean up any trailing citations or artifact metadata lines
    .replace(/\n\d+ https?:\/\/[^\n]+(\n|$)/g, '');
  
  // Explicitly strip multiple trailing newlines before the final trim
  return clean.replace(/\n+$/, "").trim();
}

/* ------------------------------------------------------------------ */
/*  MessageItem                                                       */
/* ------------------------------------------------------------------ */
export function MessageItem({
  message,
  sources: externalSources,
  onCitationClick,
  onFollowUpClick,
  onRetry,
  onRegenerate,
  onSourceClick,
  onFileClick,
  onPreview,
  onFileDelete,
  activeGenerationStatus,
}: MessageItemProps) {
  const parsedContentBundle = useMemo(() => {
    const rawText = message.content || "";
    
    // Extract internal thinking text safely
    const thoughtRegexMatch = rawText.match(/<(?:thought|think)>([\s\S]*?)(?:<\/(?:thought|think)>|$)/i);
    const reasoningText = (thoughtRegexMatch && thoughtRegexMatch[1]) ? thoughtRegexMatch[1].trim() : null;
    
    // Clean display answer
    const cleanDisplayAnswer = deepCleanAnswer(rawText);
    
    return { reasoningText, cleanDisplayAnswer };
  }, [message.content]);

  // ── USER MESSAGE ──
  if (message.role === "User") {
    const content = message.content;
    const fileAttachments = message.fileAttachment;
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
      <div className="flex flex-col items-end gap-2 mt-8 max-w-[85%] ml-auto">
        {fileAttachments && fileAttachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 mb-2 w-full">
            {fileAttachments.map((file, idx) => {
              const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
              const lineCount = file.content ? file.content.split('\n').length : 0;
              const isImage = file.type?.startsWith('image/');

              return (
                <div
                  key={file.name + idx}
                  className="group/file relative flex flex-col bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-xl p-3 min-w-[140px] max-w-[200px] w-auto hover:border-[var(--accent)]/30 transition-all cursor-pointer"
                  onClick={() => onFileClick?.({ name: file.name, content: file.content ?? "" })}
                >
                  {isImage ? (
                    <img src={file.content} alt={file.name} className="w-full h-20 object-cover rounded-lg mb-2" />
                  ) : (
                    <>
                      <div className="font-medium text-sm text-[var(--text-primary)] truncate tracking-tight">{file.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-1">{lineCount > 0 ? `${lineCount} lines` : 'Text file'}</div>
                    </>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[9px] px-2 py-0.5 border border-[var(--surface-border)] rounded bg-[var(--bg-primary)] text-[var(--text-muted)] font-medium">{ext}</span>
                    {onFileDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFileDelete(message.id, file.name, 'fileAttachment');
                        }}
                        className="opacity-0 group-hover/file:opacity-100 p-1 rounded hover:bg-red-500/15 text-red-400 transition-all"
                        title="Delete attachment"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="group flex flex-col items-end w-full">
          <div className="user-message text-left w-fit max-w-[85%]">
            <MessageRenderer content={cleanContent} onCitationClick={() => {}} sources={[]} />
          </div>
          <button
            onClick={handleUserCopy}
            className="mt-1 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 dark:bg-white/5 hover:bg-black/40 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
            title="Copy message"
          >
            {userCopied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ──
  if (message.error) {
    return (
      <div className="assistant-section">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400">
          <span className="text-sm">{message.errorMessage || "An error occurred"}</span>
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

  // ── ASSISTANT MESSAGE ──
  const answer = message.answer ?? message.content;
  const followUps = message.followUps ?? [];
  const generatedFiles = message.generatedFiles ?? [];

  const sources =
    message.sources && message.sources.length > 0
      ? message.sources
      : externalSources ?? [];

  const [copied, setCopied] = useState(false);

  const handleCopyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(parsedContentBundle.cleanDisplayAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  // Detect live streaming: optimistic assistant messages use IDs like "temp-assistant-N"
  const isStreaming = String(message.id).startsWith("temp-");
  const cleanContent = parsedContentBundle.cleanDisplayAnswer;

  // ── For image-only responses, we still render the image even if content is empty ──
  const hasImages = generatedFiles.some(f => f.mime?.startsWith("image/"));
  const shouldShowMessageItem = cleanContent.trim() !== "" || hasImages || generatedFiles.length > 0;

  const hasParts = !!(message.parts && message.parts.length > 0);

  // When parts are present, typewriter animates the last text segment only
  const lastTextPart = hasParts
    ? [...message.parts!].reverse().find((p): p is MessagePart & { type: "text" } => p.type === "text")
    : null;
  const typewriterText = lastTextPart ? lastTextPart.text : cleanContent;
  const typewriterContent = useTypewriter(typewriterText, message.id);

  return (
    <div className="assistant-section">
      {/* ─── INLINE GENERATION INDICATOR ─── */}
      {activeGenerationStatus && (
        <InlineGenerationIndicator 
          status={activeGenerationStatus} 
          reasoningText={parsedContentBundle.reasoningText}
        />
      )}

      {hasParts ? (
        <>
          <PartsRenderer
            parts={message.parts!}
            isStreaming={isStreaming}
            typewriterContent={typewriterContent}
            messageId={message.id}
            onCitationClick={onCitationClick}
            sources={sources}
            onFileClick={onFileClick}
            onPreview={onPreview}
            onFileDelete={onFileDelete}
            onSourceClick={onSourceClick}
          />
          {/* ─── EMPTY STREAMING PLACEHOLDER (before any parts arrive) ─── */}
          {isStreaming && !activeGenerationStatus && typewriterContent.trim() === "" && (
            <div className="max-w-none text-foreground/90">
              <span className="inline-block w-2 h-4 bg-current/40 rounded-sm align-text-bottom" />
            </div>
          )}
        </>
      ) : (
        <>
          {/* ─── RENDER ANSWER TEXT (backward compat) ─── */}
          {typewriterContent.trim() !== "" && (
            <div className="max-w-none text-foreground/90">
              <MessageRenderer content={typewriterContent} onCitationClick={onCitationClick} sources={sources} />
            </div>
          )}

          {/* ─── EMPTY STREAMING PLACEHOLDER (before typewriter starts) ─── */}
          {isStreaming && !activeGenerationStatus && typewriterContent.trim() === "" && (
            <div className="max-w-none text-foreground/90">
              <span className="inline-block w-2 h-4 bg-current/40 rounded-sm align-text-bottom" />
            </div>
          )}

          {/* ─── GENERATED FILES & IMAGES (backward compat) ─── */}
          {generatedFiles.length > 0 && (
            <div className="mt-0 space-y-2">
              {generatedFiles.map((file, idx) =>
                file.mime?.startsWith("image/") ? (
                  <InlineImageDisplay
                    key={idx}
                    file={file}
                    messageId={message.id}
                    index={idx}
                    onDelete={onFileDelete ? () => onFileDelete(message.id, file.filename, 'generatedFiles') : undefined}
                  />
                ) : (
                  <FileDownloadButton
                    key={idx}
                    file={file}
                    onPreview={onPreview}
                    onDelete={onFileDelete ? () => onFileDelete(message.id, file.filename, 'generatedFiles') : undefined}
                  />
                )
              )}
            </div>
          )}
        </>
      )}

      {/* Footer: source cascade + actions — Claude-style minimal bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5">
          {/* Action buttons – hide while streaming */}
          {!isStreaming && (
            <>
              <button onClick={handleCopyAnswer} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Copy">
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              </button>
              <button className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Share">
                <Share2 className="size-3.5" />
              </button>
              <button onClick={() => onRegenerate?.()} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Rewrite">
                <RefreshCw className="size-3.5" />
              </button>
            </>
          )}

          {/* Source cascade – always visible when sources exist */}
          {sources.length > 0 && (
            <div className="flex items-center gap-1.5">
              <ScrollableSourceCascade sources={sources} onSourceClick={onSourceClick} />
              <span className="text-xs font-medium text-muted-foreground/60 whitespace-nowrap font-sans">
                {sources.length} {sources.length === 1 ? "source" : "sources"}
              </span>
            </div>
          )}
        </div>

        {/* Thumbs up/down – hide during streaming */}
        {!isStreaming && (
          <div className="flex items-center gap-0.5">
            <button className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Good response">
              <ThumbsUp className="size-3.5" />
            </button>
            <button className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Bad response">
              <ThumbsDown className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Follow‑ups – Claude-style clean pills */}
      {followUps.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2.5 font-sans follow-ups-heading">Follow‑ups</div>
          <div className="space-y-1.5">
            {followUps.map((question) => (
              <button
                key={question}
                onClick={() => onFollowUpClick(question)}
                className="flex items-center w-full gap-2.5 px-3 py-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)]/40 hover:bg-[var(--surface-bg)] transition-colors group text-sm font-normal text-left"
              >
                <CornerDownRight className="size-3.5 text-muted-foreground/40 group-hover:text-[var(--accent)] transition-colors shrink-0" />
                <span className="text-[var(--text-secondary)]/80 group-hover:text-[var(--text-primary)]">
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