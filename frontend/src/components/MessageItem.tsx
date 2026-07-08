// src/components/MessageItem.tsx
import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import TodoList from "./TodoList";
import ToolSummary from "./ToolSummary";

// ─── Typewriter hook — only for streaming messages ──────────
function useTypewriter(fullText: string, messageId: string | number): string {
  const safeText = fullText ?? "";
  const isStreaming = String(messageId).startsWith("temp-");
  const [displayedLength, setDisplayedLength] = useState(() =>
    isStreaming ? 0 : safeText.length
  );

  // Non-streaming: show full text immediately
  const showFull = !isStreaming;
  const prevShowFull = useRef(showFull);
  if (showFull && !prevShowFull.current) {
    setDisplayedLength(safeText.length);
  }
  prevShowFull.current = showFull;

  const fullTextRef = useRef(safeText);
  fullTextRef.current = safeText;

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setDisplayedLength(prev => {
        const currentText = fullTextRef.current ?? "";
        if (prev < currentText.length) {
          return Math.min(prev + 2, currentText.length);
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  return safeText.slice(0, displayedLength);
}
import {
  CornerDownRight,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  ChevronDown,
  Trash2,
  Headphones,
  MoreVertical,
  Pencil,
  FileDown,
} from "lucide-react";

import { FileDownloadButton } from "./FileDownloadButton";
import { CodeOutputBlock } from "./CodeOutputBlock";
import { getDomain, rewriteSandboxUrls, fixMalformedTags } from "../lib/chat-utils";
import type { Message, MessagePart, Source } from "../types";

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
  onRetry?: (prompt?: string) => void;
  onRegenerate?: () => void;
  onSourceClick?: (url: string | null) => void;
  onFileClick?: (file: { name: string; content: string }) => void;
  onPreview?: (data: {
    type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md';
    base64?: string;
    html?: string;
    filename: string
  }) => void;
  onFileDelete?: (messageId: string | number, filename: string, type: 'fileAttachment' | 'generatedFiles') => void;
  onEdit?: (messageId: string | number, newContent: string) => void;
  onDelete?: (messageId: string | number) => void;
  activeGenerationStatus?: { subtype: string; message: string; data?: any } | null;
  onHtmlPreview?: (html: string) => void;
  conversationId?: string | null;
};

import { StatusMessage, TimelineNode, ThoughtBlock } from "./StatusMessage";
import PermissionDialog from "./PermissionDialog";
import { MessageRenderer, InlineMath } from "./MessageRenderer";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

import { BACKEND_URL } from "../lib/config";
import { createClient } from "../lib/client";
import { useIsMobile } from "../hooks/useMediaQuery";

// ─── Code file detection ──────────────────────────────────────────────────
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'rs', 'go', 'java', 'kt', 'scala',
  'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx', 'cs',
  'css', 'scss', 'sass', 'less', 'stylus',
  'html', 'htm', 'svg', 'xml',
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  'md', 'mdx', 'tex', 'rst',
  'sql', 'graphql', 'prisma',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'rb', 'php', 'pl', 'lua', 'r', 'dart', 'swift', 'zig', 'nim',
  'vue', 'svelte', 'astro', 'sass', 'tf', 'dockerfile',
  'env', 'gitignore', 'editorconfig',
]);

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
  css: 'css', scss: 'scss', html: 'html', svg: 'xml', xml: 'xml',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', sql: 'sql', prisma: 'prisma',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
  rb: 'ruby', php: 'php', lua: 'lua', r: 'r', dart: 'dart',
  swift: 'swift', zig: 'zig',
  vue: 'vue', svelte: 'svelte', astro: 'astro',
  dockerfile: 'dockerfile',
};

function isCodeFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return CODE_EXTENSIONS.has(ext) || filename.toLowerCase() === 'dockerfile';
}

function extToLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || ext || 'text';
}

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
const IMAGE_SKELETON_CSS = [
  "@keyframes imgSkeletonIn {",
  "  from { opacity: 0; transform: translateY(5px); }",
  "  to   { opacity: 1; transform: translateY(0);   }",
  "}",
  "@keyframes labelFade {",
  "  from { opacity: 0; }",
  "  to   { opacity: 1; }",
  "}",
].join("\n");

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
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const dots = canvasRef.current
      ? Array.from(canvasRef.current.querySelectorAll<HTMLDivElement>(".sk-dot"))
      : [];
    if (!dots.length) return;

    // 4 corners in grid coords
    const CORNERS = [
      { x: 0, y: 0 },
      { x: COLS - 1, y: 0 },
      { x: COLS - 1, y: ROWS - 1 },
      { x: 0, y: ROWS - 1 },
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
    <div className="mt-3 group/gen ml-2 pl-4 py-1">
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
const SEARCH_SUBTYPES = new Set(['searching', 'found_sources', 'reading', 'extracting', 'no_results', 'error', 'web_search', 'done']);

function isSearchStep(part: MessagePart | undefined): boolean {
  return !!part && part.type === 'tool_call' && SEARCH_SUBTYPES.has(part.name);
}

function SearchStepsGroup({
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

  const actualIsFirst = groupStartIndex === 0 || allParts[groupStartIndex - 1]?.type !== 'tool_call';

  if (!firstPart) return null;

  const searchQuery = firstPart.input?.query ?? '';

  const innerParts = typedParts.slice(1);

  const lastVisibleIdx = useMemo(() => {
    for (let k = innerParts.length - 1; k >= 0; k--) {
      const p = innerParts[k];
      if (p && p.name !== 'done') return k;
    }
    return -1;
  }, [innerParts]);

  const chevron = (
    <ChevronDown className={`size-3 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
  );

  return (
    <div className="mb-0.5">
      <div className="cursor-pointer" onClick={() => setOpen(v => !v)}>
        <StatusMessage
          status={{
            type: firstPart.name,
            subtype: firstPart.name,
            message: firstPart.output || '',
            data: firstPart.input,
          }}
          isFirst={actualIsFirst}
          isLast={false}
          isActive={isStreaming && firstPart.status === 'running'}
          showRail={true}
          onSourceClick={onSourceClick}
          rightSlot={chevron}
        />
      </div>

      {open && innerParts.map((part, idx) => (
        <StatusMessage
          key={idx}
          status={{
            type: part.name,
            subtype: part.name,
            message: part.output || '',
            data: part.input,
          }}
          searchQuery={part.name === 'found_sources' ? searchQuery : undefined}
          isFirst={idx === 0}
          isLast={lastVisibleIdx >= 0 && idx === lastVisibleIdx}
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

        toolParts.forEach((tpPart, idx) => {
          const tp = tpPart as MessagePart & { type: 'tool_call' };
          const partIndex = i - (toolParts.length - 1) + idx;
          const actualIsFirst = partIndex === 0 || parts[partIndex - 1]?.type !== "tool_call";
          const actualIsLast = !activeGenerationStatus && (partIndex === parts.length - 1 || parts[partIndex + 1]?.type !== "tool_call");

          renderedParts.push(
            <div key={`tool-${partIndex}`} className="mb-0.5">
              <StatusMessage
                status={{
                  type: "tool_call",
                  subtype: tp.name,
                  message: tp.output || "",
                  data: {
                    args: tp.input,
                    result: tp.output,
                    status: tp.status,
                    path: tp.input?.path,
                    filename: tp.input?.filename,
                    content: tp.input?.content,
                    language: tp.input?.language,
                    ...(tp.input || {}),
                  },
                }}
                isFirst={actualIsFirst}
                isLast={actualIsLast}
                isActive={isStreaming && tp.status === "running"}
                showRail={true}
              />
            </div>
          );
        });
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
function ScrollableSourceCascade({
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
          onClick={(e) => { e.stopPropagation(); onSourceClick?.(source.url); }}
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
/*  UserFileAttachment — lazy-loads content for historical messages   */
/* ------------------------------------------------------------------ */
function UserFileAttachment({
  file,
  messageId,
  index,
  onFileClick,
  onFileDelete,
}: {
  file: { name: string; content?: string; type?: string };
  messageId: string | number;
  index: number;
  onFileClick?: (file: { name: string; content: string }) => void;
  onFileDelete?: (name: string) => void;
}) {
  const [content, setContent] = useState<string | null>(file.content ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (content) return;
    const isOptimistic = typeof messageId !== 'number' || messageId < 0;
    if (isOptimistic) return;

    const fetchContent = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch(`${BACKEND_URL}/api/assets/${messageId}/upload/${index}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.base64) setContent(data.base64);
        }
      } catch (e) {
        console.error("Failed to load attachment:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [content, messageId, index]);

  const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
  const lineCount = content ? content.split('\n').length : 0;
  const isImage = file.type?.startsWith('image/');

  return (
    <div
      className="group/file relative flex flex-col bg-[var(--surface-bg)] border border-[var(--surface-border)] rounded-xl p-3 min-w-[140px] max-w-[200px] w-auto hover:border-[var(--accent)]/30 transition-all cursor-pointer"
      onClick={() => onFileClick?.({ name: file.name, content: content ?? "" })}
    >
      {loading ? (
        <div className="flex items-center justify-center h-20 mb-2">
          <div className="size-4 border-2 border-[var(--border-border)] border-t-[var(--text-primary)] rounded-full animate-spin" />
        </div>
      ) : isImage && content ? (
        <img src={content.startsWith('data:') ? content : `data:image/png;base64,${content}`} alt={file.name} className="w-full h-20 object-cover rounded-lg mb-2" />
      ) : isImage && !content ? (
        <div className="flex items-center justify-center h-20 mb-2 text-[var(--text-muted)] text-xs">Image unavailable</div>
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
              onFileDelete(file.name);
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
    // First, completely remove follow-up questions block and anything after it (including unclosed <FOLLOW_UPS)
    .replace(/<FOLLOW_UPS>[\s\S]*?(?:<\/FOLLOW_UPS>|$)/gi, "")
    .replace(/<FOLLOW_UPS[\s\S]*/gi, "")
    // 1. Remove JSON structures completely if they leaked
    .replace(/\{"type"[\s\S]*?\}/g, "")
    // 2. Strip thoughts/thinking blocks
    .replace(/<(?:thought|think)>[\s\S]*?(?:<\/(?:thought|think)>|$)/gi, '')
    // 3. Strip remaining structural tags
    .replace(/<\/?(?:thought|think|ANSWER|question)>/gi, '')
    // 4. Clean up any trailing citations or artifact metadata lines
    .replace(/\n\d+ https?:\/\/[^\n]+(\n|$)/g, '')
    // 5. Strip truncated/incomplete tags at end (e.g. "<F", "<FOLLOW_UPS")
    .replace(/<\/?[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?$/g, '');

  // Explicitly strip multiple trailing newlines before the final trim
  return clean.replace(/\n+$/, "").trim();
}

/* ------------------------------------------------------------------ */
/*  Sandbox URL → FileDownloadButton                                  */
/* ------------------------------------------------------------------ */
function ContentWithFileCards({
  text,
  conversationId,
  onCitationClick,
  sources,
  onHtmlPreview,
}: {
  text: string;
  conversationId?: string | null;
  onCitationClick: (index: number) => void;
  sources: Source[];
  onHtmlPreview?: (html: string) => void;
}) {
  const rewritten = useMemo(() => rewriteSandboxUrls(text, conversationId), [text, conversationId]);
  const parts = useMemo(() => {
    const sandboxRe = /(\/api\/sandbox\/download\/[^\s)\]]+)/g;
    const split: Array<{ type: 'text' | 'file'; value: string; filename?: string }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = sandboxRe.exec(rewritten)) !== null) {
      if (m.index > last) split.push({ type: 'text', value: rewritten.slice(last, m.index) });
      const filename = m[0].split('/').pop() || 'file';
      split.push({ type: 'file', value: m[0], filename });
      last = m.index + m[0].length;
    }
    if (last < rewritten.length) split.push({ type: 'text', value: rewritten.slice(last) });
    return split;
  }, [rewritten]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'file') {
          return (
            <div key={`file-${i}`} className="my-2">
              <FileDownloadButton
                file={{ base64: '', filename: part.filename || 'file', mime: '' }}
                onDownload={() => {
                  const link = document.createElement('a');
                  link.href = part.value;
                  link.download = part.filename || 'file';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              />
            </div>
          );
        }
        if (part.value.trim()) {
          return (
            <div key={`text-${i}`} className="inline">
              <MessageRenderer content={part.value} onCitationClick={onCitationClick} sources={sources} onHtmlPreview={onHtmlPreview} />
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  MessageItem                                                       */
/* ------------------------------------------------------------------ */
export const MessageItem = memo(function MessageItem({
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
  onEdit,
  onDelete,
  activeGenerationStatus,
  onHtmlPreview,
  conversationId,
}: MessageItemProps) {
  const parsedContentBundle = useMemo(() => {
    const rawText = fixMalformedTags(message.content || "");

    // Extract internal thinking text safely (handle malformed tags too)
    const thoughtRegexMatch = rawText.match(/<(?:thought|think|THOUGHT|THINK)>([\s\S]*?)(?:<\/(?:thought|think|THOUGHT|THINK)>|$)/i);
    const reasoningText = (thoughtRegexMatch && thoughtRegexMatch[1]) ? thoughtRegexMatch[1].trim() : null;

    // Clean display answer
    const cleanDisplayAnswer = deepCleanAnswer(rawText);

    return { reasoningText, cleanDisplayAnswer };
  }, [message.content]);

  // ── Unconditional hooks (moved up to avoid conditional hook count violations) ──
  const isMobile = useIsMobile();
  const [userCopied, setUserCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const voicesLoadedRef = useRef(false);

  useEffect(() => {
    const load = () => {
      try {
        const v = speechSynthesis.getVoices();
        if (v && v.length > 0) {
          voicesRef.current = v;
          voicesLoadedRef.current = true;
        }
      } catch {}
    };
    load();
    // On Chrome/Android, voices load async; this event fires when ready
    try {
      speechSynthesis.addEventListener('voiceschanged', load);
    } catch {}
    // Poll for voices on Android WebView where voiceschanged may not fire
    if (!voicesLoadedRef.current) {
      const interval = setInterval(() => {
        if (voicesLoadedRef.current) { clearInterval(interval); return; }
        load();
        if (voicesLoadedRef.current) clearInterval(interval);
      }, 300);
      setTimeout(() => clearInterval(interval), 5000);
    }
    return () => {
      try { speechSynthesis.removeEventListener('voiceschanged', load); } catch {}
    };
  }, []);
  const _hasParts = !!(message.parts && Array.isArray(message.parts) && message.parts.length > 0);
  const _lastTextPart = _hasParts
    ? (message.parts as MessagePart[]).slice().reverse().find((p): p is MessagePart & { type: "text" } => p.type === "text")
    : null;
  const _typewriterText = _lastTextPart ? (_lastTextPart.text ?? parsedContentBundle.cleanDisplayAnswer) : parsedContentBundle.cleanDisplayAnswer;
  const typewriterContent = useTypewriter(_typewriterText, message.id);

  // ── User-message state (unconditional to avoid hook count violations) ──
  const userContent = message.content;
  const cleanContent = userContent.replace(/\s*\[attached: [^\]]+\]\s*/g, "").trim();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(cleanContent);
  const [showUserActions, setShowUserActions] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const userActionsRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!showUserActions) return;
    const handler = (e: MouseEvent) => {
      if (userActionsRef.current && !userActionsRef.current.contains(e.target as Node)) {
        setShowUserActions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserActions]);

  // ── USER MESSAGE ──
  if (message.role === "User") {
    const fileAttachments = message.fileAttachment;

    const handleUserCopy = async () => {
      try {
        await navigator.clipboard.writeText(cleanContent);
        setUserCopied(true);
        setTimeout(() => setUserCopied(false), 2000);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    };

    const handleSaveEdit = () => {
      const trimmed = editText.trim();
      if (trimmed && trimmed !== cleanContent) {
        onEdit?.(message.id, trimmed);
      }
      setIsEditing(false);
    };

    const handleCancelEdit = () => {
      setEditText(cleanContent);
      setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSaveEdit();
      }
      if (e.key === 'Escape') {
        handleCancelEdit();
      }
    };

    const handleTouchStart = () => {
      longPressTimer.current = setTimeout(() => setShowUserActions(true), 500);
    };
    const handleTouchEnd = () => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    };

    return (
      <div className="flex flex-col items-end gap-2 mt-8 max-w-[85%] ml-auto">
        {fileAttachments && fileAttachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 mb-2 w-full">
            {fileAttachments.map((file, idx) => (
              <UserFileAttachment
                key={file.name + idx}
                file={file}
                messageId={message.id}
                index={idx}
                onFileClick={onFileClick}
                onFileDelete={onFileDelete ? (name) => onFileDelete(message.id, name, 'fileAttachment') : undefined}
              />
            ))}
          </div>
        )}

        <div
          className="group flex flex-col items-end w-full"
          onContextMenu={(e) => { e.preventDefault(); setShowUserActions(true); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
        >
          {isEditing ? (
            <div className="w-full max-w-[85%]">
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[80px] p-3 rounded-xl border border-border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <div className="flex items-center gap-2 mt-2 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
                >
                  Save & Resend
                </button>
              </div>
            </div>
          ) : (
            <div className="user-message text-left w-fit max-w-[85%]">
              <ContentWithFileCards text={cleanContent} conversationId={conversationId} onCitationClick={() => {}} sources={[]} />
            </div>
          )}
          <div
            ref={userActionsRef}
            className={`flex items-center gap-1 mt-1 transition-opacity ${showUserActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          >
            {onEdit && !isEditing && (
              <button
                onClick={() => { setEditText(cleanContent); setIsEditing(true); setShowUserActions(false); }}
                className="p-1.5 rounded-lg bg-black/20 dark:bg-white/5 hover:bg-black/40 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
                title="Edit message"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            <button
              onClick={() => { handleUserCopy(); setShowUserActions(false); }}
              className="p-1.5 rounded-lg bg-black/20 dark:bg-white/5 hover:bg-black/40 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
              title="Copy message"
            >
              {userCopied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            </button>
            {onDelete && (
              <button
                onClick={() => { setShowUserActions(false); try { onDelete(message.id); } catch (e) { console.error("Delete error:", e); } }}
                className="p-1.5 rounded-lg bg-black/20 dark:bg-white/5 hover:bg-red-500/15 text-muted-foreground hover:text-red-400"
                title="Delete message"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
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
              onClick={() => onRetry!()}
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

  const handleCopyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(parsedContentBundle.cleanDisplayAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleTTS = async () => {
    if (isSpeaking) {
      try { speechSynthesis.cancel(); } catch {}
      setIsSpeaking(false);
      speechRef.current = null;
      return;
    }
    const text = parsedContentBundle.cleanDisplayAnswer;
    if (!text) return;

    // Check if local TTS is configured
    const ttsProvider = (() => { try { return localStorage.getItem('tts_provider'); } catch { return null; } })();
    if (ttsProvider === 'local') {
      setIsSpeaking(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/tts/local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.onended = () => { setIsSpeaking(false); speechRef.current = null; };
          audio.onerror = () => { setIsSpeaking(false); speechRef.current = null; };
          audio.play();
          return;
        }
      } catch {}
      setIsSpeaking(false);
      speakBrowserTTS(text);
      return;
    }

    speakBrowserTTS(text);
  };

  function ensureVoices(): SpeechSynthesisVoice[] {
    // Try ref first, then live query, then wait for event
    if (voicesRef.current.length > 0) return voicesRef.current;
    try {
      const live = speechSynthesis.getVoices();
      if (live && live.length > 0) {
        voicesRef.current = live;
        voicesLoadedRef.current = true;
        return live;
      }
    } catch {}
    return [];
  }

  function speakBrowserTTS(text: string) {
    // Cancel any existing speech first
    try { speechSynthesis.cancel(); } catch {}
    speechRef.current = null;

    const utterance = new SpeechSynthesisUtterance(text);
    let allVoices = ensureVoices();

    // Voice preference priority: natural/Google > premium female > en any
    const preferred = allVoices.find((v: SpeechSynthesisVoice) => /google/i.test(v.name) && v.lang.startsWith('en'))
      ?? allVoices.find((v: SpeechSynthesisVoice) => /(zira|jenny|hazel|microsoft.*female|samantha|karen|moira|tessa|alice|fiona)/i.test(v.name))
      ?? allVoices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('en') && !/david|default/i.test(v.name))
      ?? allVoices.find((v: SpeechSynthesisVoice) => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    utterance.rate = 0.9;
    utterance.pitch = 1.05;

    utterance.onstart = () => { setIsSpeaking(true); };
    utterance.onend = () => { setIsSpeaking(false); speechRef.current = null; };
    utterance.onerror = (e) => {
      // On Android, "interrupted" is not a real error - it happens when we cancel
      if (e.error !== 'interrupted') {
        console.error('TTS error:', e.error);
      }
      setIsSpeaking(false);
      speechRef.current = null;
    };

    speechRef.current = utterance;
    try {
      speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('TTS speak failed:', e);
      setIsSpeaking(false);
      speechRef.current = null;
    }
  }

  // Detect live streaming: optimistic assistant messages use IDs like "temp-assistant-N"
  const isStreaming = String(message.id).startsWith("temp-");
  const assistantContent = parsedContentBundle.cleanDisplayAnswer;

  // ── For image-only responses, we still render the image even if content is empty ──
  const hasImages = generatedFiles.some(f => f.mime?.startsWith("image/"));
  const shouldShowMessageItem = assistantContent.trim() !== "" || hasImages || generatedFiles.length > 0;

  return (
    <div className="assistant-section">
      {/* ─── INLINE GENERATION INDICATOR ─── */}
      {activeGenerationStatus && !_hasParts && (
        <div className="mb-0.5">
          <StatusMessage
            status={{
              type: activeGenerationStatus.subtype,
              subtype: activeGenerationStatus.subtype,
              message: activeGenerationStatus.message,
              data: activeGenerationStatus.data || undefined,
            }}
            isFirst={true}
            isLast={true}
            isActive={true}
            showRail={true}
          />
        </div>
      )}

      {_hasParts ? (
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
            onSourceClick={(url) => url && onSourceClick?.(url)}
            activeGenerationStatus={activeGenerationStatus}
            onHtmlPreview={onHtmlPreview}
            conversationId={conversationId}
          />
        </>
      ) : (
        <>
          {/* ─── RENDER ANSWER TEXT (backward compat) ─── */}
          {typewriterContent.trim() !== "" && (
            <div className="max-w-none text-foreground/90">
              <ContentWithFileCards text={typewriterContent} conversationId={conversationId} onCitationClick={onCitationClick} sources={sources} onHtmlPreview={onHtmlPreview} />
            </div>
          )}

          {/* ─── GENERATED FILES & IMAGES (backward compat) ─── */}
          {generatedFiles.length > 0 && (
            <div className="mt-3 space-y-2">
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
                    file={{ base64: file.base64 || '', filename: file.filename, mime: file.mime || '' }}
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
              <button onClick={handleTTS} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title={isSpeaking ? "Stop" : "Read aloud"}>
                <Headphones className={`size-3.5 ${isSpeaking ? 'text-accent' : ''}`} />
              </button>
              <button onClick={() => onRetry?.()} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Rewrite">
                <RefreshCw className="size-3.5" />
              </button>
              {onDelete && (
                <button onClick={() => onDelete(message.id)} className="p-1.5 rounded-md hover:bg-red-500/10 transition text-muted-foreground/60 hover:text-red-400" title="Delete message">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </>
          )}

          {/* Source cascade – only on desktop (too wide for phones) */}
          {!isMobile && sources.length > 0 && (
            <div className="flex items-center gap-1.5">
              <ScrollableSourceCascade sources={sources} onSourceClick={onSourceClick} />
              <span className="text-xs font-medium text-muted-foreground/60 whitespace-nowrap font-sans">
                {sources.length} {sources.length === 1 ? "source" : "sources"}
              </span>
            </div>
          )}
        </div>

        {/* 3-dot menu with Helpful / Unhelpful – hide during streaming */}
        {!isStreaming && (
          <div className="relative z-[100]">
            <button
              onClick={() => setShowFeedbackMenu(p => !p)}
              className={`p-1.5 rounded-md transition-all duration-200 text-muted-foreground/60 hover:text-foreground ${liked ? 'text-accent' : ''}`}
              title="Feedback"
            >
              <MoreVertical className="size-3.5" />
            </button>
            {showFeedbackMenu && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowFeedbackMenu(false)} />
                <div className="absolute right-0 bottom-full mb-1 z-[70] min-w-[140px] glass-panel rounded-xl shadow-xl overflow-hidden">
                  <button
                    onClick={() => { setLiked(liked === 'up' ? null : 'up'); setShowFeedbackMenu(false); }}
                    className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/8 ${liked === 'up' ? 'text-emerald-500 font-medium' : 'text-muted-foreground/70 hover:text-foreground'}`}
                  >
                    <ThumbsUp className={`size-4 ${liked === 'up' ? 'fill-emerald-500' : ''}`} />
                    Helpful
                  </button>
                  <button
                    onClick={() => { setLiked(liked === 'down' ? null : 'down'); setShowFeedbackMenu(false); }}
                    className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/8 ${liked === 'down' ? 'text-red-500 font-medium' : 'text-muted-foreground/70 hover:text-foreground'}`}
                  >
                    <ThumbsDown className={`size-4 ${liked === 'down' ? 'fill-red-500' : ''}`} />
                    Unhelpful
                  </button>
                </div>
              </>
            )}
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
});
