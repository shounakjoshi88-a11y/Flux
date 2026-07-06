// src/components/MessageItem.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import TodoList from "./TodoList";
import ToolSummary from "./ToolSummary";

// ─── Typewriter hook — only for streaming messages ──────────
function useTypewriter(fullText: string, messageId: string | number): string {
  const isStreaming = String(messageId).startsWith("temp-");
  const [displayedLength, setDisplayedLength] = useState(() =>
    isStreaming ? 0 : fullText.length
  );

  // Non-streaming: show full text immediately
  const showFull = !isStreaming;
  const prevShowFull = useRef(showFull);
  if (showFull && !prevShowFull.current) {
    setDisplayedLength(fullText.length);
  }
  prevShowFull.current = showFull;

  const fullTextRef = useRef(fullText);
  fullTextRef.current = fullText;

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setDisplayedLength(prev => {
        if (prev < fullTextRef.current.length) {
          return Math.min(prev + 2, fullTextRef.current.length);
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  return fullText.slice(0, displayedLength);
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
  Volume2,
  VolumeX,
  Pencil,
  FileDown,
} from "lucide-react";

import { FileDownloadButton } from "./FileDownloadButton";
import { CodeOutputBlock } from "./CodeOutputBlock";
import { getDomain, deepCleanAnswer, rewriteSandboxUrls } from "../lib/chat-utils";
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
  onSourceClick: (url: string) => void;
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

export default React.memo(MessageItem);