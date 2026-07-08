// src/components/MessageItem.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Volume2,
  VolumeX,
  Pencil,
  FileDown,
} from "lucide-react";

import { FileDownloadButton } from "./FileDownloadButton";
import { CodeOutputBlock } from "./CodeOutputBlock";
import { getDomain, deepCleanAnswer, rewriteSandboxUrls, fixMalformedTags } from "../lib/chat-utils";
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

/* ── UserFileAttachment — lazy-loads content for historical messages ── */
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
        <img src={content.startsWith('data:') ? content : `data:image/png;base64,${content}`} alt={file.name} loading="lazy" className="w-full h-20 object-cover rounded-lg mb-2" />
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

function MessageItem({
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

    // Extract internal thinking text safely
    const thoughtRegexMatch = rawText.match(/<(?:thought|think|THOUGHT|THINK)>([\s\S]*?)(?:<\/(?:thought|think|THOUGHT|THINK)>|$)/i);
    const reasoningText = (thoughtRegexMatch && thoughtRegexMatch[1]) ? thoughtRegexMatch[1].trim() : null;

    // Clean display answer
    const cleanDisplayAnswer = deepCleanAnswer(rawText);

    return { reasoningText, cleanDisplayAnswer };
  }, [message.content]);

  // ─── Unconditional hooks (moved up to avoid conditional hook count violations) ───
  const [showActions, setShowActions] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content || '');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isStreaming = String(message.id).startsWith("temp-");
  const hasError = message.error === true;
  const errorMessage = message.errorMessage;

  // Auto-approval ��� send approval responses automatically
  const [autoApproved, setAutoApproved] = useState(false);

  // ─── Destructure with defaults ─────────────────────────
  const {
    answer,
    followUps = [],
    fileAttachment = [],
    generatedFiles = [],
    type,
  } = message;

  // ─── Edit handlers ──────────────────────────────────────
  const handleEditSave = useCallback(() => {
    if (editText.trim() && editText !== message.content) {
      onEdit?.(message.id, editText);
    }
    setEditing(false);
  }, [editText, message.content, message.id, onEdit]);

  const handleEditCancel = useCallback(() => {
    setEditText(message.content || '');
    setEditing(false);
  }, [message.content]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
    }
  }, [editing]);

  // ─── Sources handling ─────────────────────────────────
  const sources = useMemo(() => {
    if (externalSources && externalSources.length > 0) return externalSources;

    // Extract from message if not provided externally
    const srcs: Source[] = [];
    if (message.sources && Array.isArray(message.sources)) {
      message.sources.forEach((s: any) => {
        if (typeof s === 'string') {
          srcs.push({ url: s, title: s });
        } else if (s && s.url) {
          srcs.push({ url: s.url, title: s.title || s.url });
        }
      });
    }
    return srcs;
  }, [externalSources, message.sources]);

  // ─── Active generation status ──────────────────────────
  const isStatusActive = activeGenerationStatus?.subtype === 'calling_tool' || activeGenerationStatus?.subtype === 'file_generation' || activeGenerationStatus?.subtype === 'thinking' || activeGenerationStatus?.subtype === 'reasoning';

  const activeMessage = activeGenerationStatus?.message || '';

  // ─── Typewriter ─────────────────────────────────────────
  const _typewriterText = useMemo(() => {
    return (answer || parsedContentBundle.cleanDisplayAnswer || message.content || '') ?? '';
  }, [answer, parsedContentBundle.cleanDisplayAnswer, message.content]);

  const typewriterContent = useTypewriter(_typewriterText, message.id);

  // ─── isAssistant ─────────────────────────────────────────
  const isAssistant = message.role === 'assistant';

  // ─── Helper: should we render the file section ──────────
  const hasFiles = fileAttachment.length > 0 || generatedFiles.length > 0;

  return (
    <div
      ref={scrollRef}
      id={`msg-${message.id}`}
      className={`group relative flex flex-col ${isAssistant ? 'items-start' : 'items-end'} w-full ${hasError ? 'opacity-80' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* ─── Bubble ──────────────────────────────────────── */}
      <div className={`relative w-full ${isAssistant ? 'pr-4 sm:pr-8' : 'pl-4 sm:pl-8'}`}>

        {/* ═══════════════════════════════════════════════════════════
           USER MESSAGE
        ════════════════════════════════════════════════════════════ */}
        {!isAssistant && (
          <>
            {/* Edited indicator */}
            {message.edited && (
              <div className="text-[10px] text-muted-foreground/40 font-mono mb-1 tracking-tight">
                edited
              </div>
            )}

            {/* File attachments — show as thumbnails above the bubble */}
            {!editing && fileAttachment.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2 mb-2 w-full">
                {fileAttachment.map((file, idx) => (
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

            {/* Editable or static content */}
            {editing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)] text-sm text-[var(--text-primary)] resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEditSave(); if (e.key === 'Escape') handleEditCancel(); }}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={handleEditCancel} className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  <button onClick={handleEditSave} className="px-3 py-1 rounded-md text-xs bg-[var(--accent)] text-white hover:opacity-90 transition-opacity">Save</button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2.5 rounded-2xl bg-[var(--user-bubble)] text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap break-words font-light shadow-sm">
                <MessageRenderer content={(message.content || '').replace(/\s*\[attached: [^\]]+\]\s*/g, '').trim()} />
                {hasError && errorMessage && (
                  <div className="mt-2 text-xs text-red-400/80 italic">{errorMessage}</div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
           ASSISTANT MESSAGE
        ════════════════════════════════════════════════════════════ */}
        {isAssistant && (
          <div className="flex flex-col gap-1.5">

            {/* ─── Active generation status row ─────────────── */}
            {activeGenerationStatus && isStatusActive && (
              <StatusMessage
                subtype={activeGenerationStatus.subtype as any}
                message={activeMessage}
              />
            )}

            {/* ─── Reasoning / thinking block ────────────────── */}
            {parsedContentBundle.reasoningText && !isStreaming && (
              <ThoughtBlock content={parsedContentBundle.reasoningText} />
            )}

            {/* ─── Main content ──────────────────────────────── */}
            {!activeGenerationStatus && (
              <div className="px-4 py-2.5 rounded-2xl bg-[var(--assistant-bubble)] text-[var(--text-primary)] text-[15px] leading-relaxed break-words font-light shadow-sm">
                {isStreaming ? (
                  <>
                    <MessageRenderer content={typewriterContent} />
                    {message.content && typewriterContent.length < message.content.length && (
                      <span className="inline-block w-[2px] h-[1em] bg-[var(--accent)] ml-0.5 animate-pulse align-middle" />
                    )}
                  </>
                ) : (
                  <MessageRenderer content={parsedContentBundle.cleanDisplayAnswer || message.content || ''} />
                )}
                {hasError && errorMessage && (
                  <div className="mt-2 text-xs text-red-400/80 italic">{errorMessage}</div>
                )}
              </div>
            )}

            {/* ─── Generated files ───────────────────────── */}
            {generatedFiles.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                {generatedFiles.map((file, idx) => {
                  if (file.mime.startsWith('image/')) {
                    return (
                      <InlineImageDisplay
                        key={`${message.id}-gen-${idx}`}
                        file={file}
                        messageId={message.id}
                        index={idx}
                        onDelete={onFileDelete ? () => onFileDelete(message.id, file.filename, 'generatedFiles') : undefined}
                      />
                    );
                  }
                  const b64url = file.base64 ? `data:${file.mime};base64,${file.base64}` : '';
                  return (
                    <a
                      key={`${message.id}-gen-${idx}`}
                      href={b64url}
                      download={file.filename}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-bg)]/50 hover:bg-[var(--surface-bg)] transition-colors text-xs text-muted-foreground hover:text-foreground"
                    >
                      <FileDown className="size-3.5 shrink-0" />
                      <span className="truncate">{file.filename}</span>
                    </a>
                  );
                })}
              </div>
            )}

            {/* ─── Code File Download ──────────────────────── */}
            {fileAttachment.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {fileAttachment.map((file, idx) => {
                  if (file.type === 'generated_file') return null;
                  const isCode = file.name ? isCodeFile(file.name) : false;
                  const content = file.content || '';
                  const snippet = content.slice(0, 200);

                  return (
                    <FileDownloadButton
                      key={`${message.id}-file-${idx}`}
                      filename={file.name || `file-${idx}`}
                      content={content}
                      language={isCode ? extToLang(file.name || '') : undefined}
                      snippet={snippet}
                      onHtmlPreview={onHtmlPreview}
                    />
                  );
                })}
              </div>
            )}

            {/* ─── Tool / function call result display ─────── */}
            {message.tool_calls && message.tool_calls.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.tool_calls.map((tc: any, idx: number) => (
                  <ToolSummary key={idx} toolCall={tc} messageId={message.id} />
                ))}
              </div>
            )}

            {/* ─── Timeline nodes ──────────────────────────── */}
            {message.timeline && message.timeline.length > 0 && (
              <div className="mt-2">
                {message.timeline.map((node: any, idx: number) => (
                  <TimelineNode
                    key={idx}
                    node={node}
                    isLast={idx === message.timeline!.length - 1}
                  />
                ))}
              </div>
            )}

            {/* ─── Sources ──────────────────────────────────── */}
            {sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sources.map((source, idx) => (
                  <button
                    key={idx}
                    onClick={() => onCitationClick(idx)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono text-muted-foreground/70 hover:text-foreground hover:bg-[var(--surface-bg)] border border-[var(--surface-border)]/50 transition-colors"
                  >
                    <span className="text-[10px] font-bold text-[var(--accent)] mr-0.5">{idx + 1}</span>
                    {source.title || getDomain(source.url)}
                  </button>
                ))}
              </div>
            )}

            {/* ─── Follow-up questions ───────────────────────── */}
            {followUps.length > 0 && (
              <div className="mt-3 space-y-1">
                {followUps.map((question: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => onFollowUpClick(question)}
                    className="group flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-[var(--accent)] transition-colors"
                  >
                    <CornerDownRight className="size-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                    <span className="border-b border-dotted border-current/20 group-hover:border-current/40">
                      {question}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* ─── Retry button (error state) ─────────────── */}
            {hasError && onRetry && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onRetry()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <RefreshCw className="size-3" />
                  Retry
                </button>
              </div>
            )}

            {/* ─── Speaking indicator ─────────────────────── */}
            {isSpeaking && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                <Volume2 className="size-3 animate-pulse" />
                Speaking...
              </div>
            )}
          </div>
        )}

        {/* ─── Action bar: timestamps + actions ─────────────── */}
        <div className={`flex items-center gap-3 mt-1.5 ${isAssistant ? 'justify-start' : 'justify-end'} ${showActions || isStreaming ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
          {/* Timestamp */}
          <span className="text-[10px] font-mono text-muted-foreground/30 select-none">
            {message.created_at
              ? (() => {
                const d = new Date(message.created_at);
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              })()
              : ''}
          </span>

          {/* Action buttons - assistant only */}
          {isAssistant && (
            <div className="flex items-center gap-0.5">
              {/* Speak */}
              <button
                onClick={async () => {
                  if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
                  const text = (answer || message.content || '').replace(/<[^>]*>/g, '');
                  if (!text) return;
                  const utterance = new SpeechSynthesisUtterance(text);
                  utterance.onend = () => setIsSpeaking(false);
                  setIsSpeaking(true);
                  window.speechSynthesis.speak(utterance);
                }}
                className="p-1 rounded-md transition-colors text-muted-foreground/40 hover:text-foreground"
                title={isSpeaking ? 'Stop' : 'Read aloud'}
              >
                {isSpeaking ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
              </button>

              {/* Copy */}
              <button
                onClick={() => {
                  const text = (answer || message.content || '').replace(/<[^>]*>/g, '');
                  navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }).catch(() => { });
                }}
                className="p-1 rounded-md transition-colors text-muted-foreground/40 hover:text-foreground"
                title="Copy"
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </button>

              {/* Edit */}
              {!editing && onEdit && (
                <button
                  onClick={() => { setEditing(true); setEditText(message.content || ''); }}
                  className="p-1 rounded-md transition-colors text-muted-foreground/40 hover:text-foreground"
                  title="Edit"
                >
                  <Pencil className="size-3" />
                </button>
              )}

              {/* Delete */}
              {onDelete && (
                <button
                  onClick={() => { if (confirm('Delete this message?')) onDelete(message.id); }}
                  className="p-1 rounded-md transition-colors text-muted-foreground/40 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="size-3" />
                </button>
              )}

              {/* Thumbs up/down */}
              {!isStreaming && (
                <>
                  <button
                    onClick={() => setLiked(liked === 'up' ? null : 'up')}
                    className={`p-1 rounded-md transition-colors ${liked === 'up' ? 'text-emerald-500' : 'text-muted-foreground/40 hover:text-foreground'}`}
                    title="Good response"
                  >
                    <ThumbsUp className={`size-3 ${liked === 'up' ? 'fill-emerald-500' : ''}`} />
                  </button>
                  <button
                    onClick={() => setLiked(liked === 'down' ? null : 'down')}
                    className={`p-1 rounded-md transition-colors ${liked === 'down' ? 'text-red-500' : 'text-muted-foreground/40 hover:text-foreground'}`}
                    title="Bad response"
                  >
                    <ThumbsDown className={`size-3 ${liked === 'down' ? 'fill-red-500' : ''}`} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ─── Source cascade ────────────────────────────────── */}
        {sources.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] font-mono text-muted-foreground/40">
              {sources.length} {sources.length === 1 ? 'source' : 'sources'}
            </span>
          </div>
        )}

      </div>
    </div>
  );
}

export default React.memo(MessageItem);