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
          return Math.min(prev + 6, currentText.length);
        }
        return prev;
      });
    }, 16);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  return safeText.slice(0, displayedLength);
}
import { CornerDownRight, RefreshCw, ThumbsUp, ThumbsDown, Headphones, Pencil, FileDown } from "lucide-react";
import { IconCheck, IconChevronDown, IconClose, IconCopy, IconMore, IconTrash } from "../layout/anthropicIcons.tsx";

import { FileDownloadButton } from "../content/FileDownloadButton";
import { InlineImageDisplay, ImageGenerationSkeleton, InlineGenerationIndicator } from "./ImageDisplay";
import { UserFileAttachment, ContentWithFileCards, deepCleanAnswer, RenderFollowUpText } from "./FileCards";
import { SearchStepsGroup, ScrollableSourceCascade, PartsRenderer } from "./SearchSteps";
import { OrbitalSVG, ThinkingIndicator } from "./ThinkingIndicator";

import { getDomain, rewriteSandboxUrls, fixMalformedTags } from "../../lib/chat-utils";
import type { Message, MessagePart, Source } from "../../types";

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

import { TimelineNode, ThoughtBlock } from "./ThoughtBlock";
import StatusMessage from "./StatusMessage";
import PermissionDialog from "./PermissionDialog";
import { MessageRenderer } from "./MessageRenderer";
import { InlineMath } from "./MathRenderer";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

import { BACKEND_URL } from "../../lib/config";
import { createClient } from "../../lib/client";
import { useIsMobile } from "../../hooks/useMediaQuery";

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
  // For completed messages the streamed parts can be a stale/partial suffix of
  // the final answer (backend may replace a partial stream with a synthesis).
  // The DB content is authoritative — prefer it when it is at least as long as
  // the joined text parts.
  const _joinedTextLen = _hasParts && Array.isArray(message.parts)
    ? (message.parts as MessagePart[]).reduce((acc, p) => acc + ((p as any).type === "text" ? String((p as any).text ?? "").length : 0), 0)
    : 0;
  const _contentLen = (parsedContentBundle.cleanDisplayAnswer ?? "").trim().length;
  const _preferContentText = !String(message.id).startsWith("temp-") && _contentLen > 0 && _contentLen >= _joinedTextLen;
  const _typewriterText = _preferContentText
    ? parsedContentBundle.cleanDisplayAnswer.trim()
    : (_lastTextPart ? (_lastTextPart.text ?? parsedContentBundle.cleanDisplayAnswer) : parsedContentBundle.cleanDisplayAnswer);
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
                onPreview={onPreview}
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
              {userCopied ? <IconCheck className="size-3.5 text-emerald-400" /> : <IconCopy className="size-3.5" />}
            </button>
            {onDelete && (
              <button
                onClick={() => { setShowUserActions(false); try { onDelete(message.id); } catch (e) { console.error("Delete error:", e); } }}
                className="p-1.5 rounded-lg bg-black/20 dark:bg-white/5 hover:bg-red-500/15 text-muted-foreground hover:text-red-400"
                title="Delete message"
              >
                <IconTrash className="size-3.5" />
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

  // When the content is authoritative (completed message), replace the text parts
  // with the final answer. Keep chronological order: if there are MULTIPLE text
  // parts (thought → tools → answer), only hydrate the LAST one to the full clean
  // text; earlier parts stay where they are. Collapse to a single part ONLY when
  // there's exactly one text part — this preserves interleaved tool-call order.
  const renderParts = useMemo(() => {
    if (!_preferContentText || !_hasParts || !Array.isArray(message.parts)) {
      return message.parts as MessagePart[] | undefined;
    }
    const textIndices = message.parts
      .map((p, i) => (p && (p as any).type === "text" ? i : -1))
      .filter((i) => i >= 0);
    if (textIndices.length === 0) return message.parts;
    const fullText = (parsedContentBundle.cleanDisplayAnswer ?? "").trim();
    if (textIndices.length === 1) {
      const idx = textIndices[0]!;
      return message.parts.map((p, i) =>
        i === idx ? { ...(p as any), text: fullText } as MessagePart : p,
      );
    }
    // Multiple text parts — keep every one in order; hydrate only the final one.
    const lastIdx = textIndices[textIndices.length - 1]!;
    return message.parts.map((p, i) =>
      i === lastIdx ? { ...(p as any), text: fullText } as MessagePart : p,
    );
  }, [_preferContentText, _hasParts, message.parts, parsedContentBundle.cleanDisplayAnswer]);

  // ── For image-only responses, we still render the image even if content is empty ──
  const hasImages = generatedFiles.some(f => f.mime?.startsWith("image/"));
  const shouldShowMessageItem = assistantContent.trim() !== "" || hasImages || generatedFiles.length > 0;

  return (
    <div className="assistant-section">
      {/* ─── THINKING INDICATOR — shown while no parts have arrived yet ─── */}
      {isStreaming && !_hasParts && (
        <ThinkingIndicator />
      )}

      {_hasParts ? (
        <>
          <PartsRenderer
            parts={renderParts!}
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
                {copied ? <IconCheck className="size-3.5 text-emerald-400" /> : <IconCopy className="size-3.5" />}
              </button>
              <button onClick={handleTTS} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title={isSpeaking ? "Stop" : "Read aloud"}>
                <Headphones className={`size-3.5 ${isSpeaking ? 'text-accent' : ''}`} />
              </button>
              <button onClick={() => onRetry?.()} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/8 transition text-muted-foreground/60 hover:text-foreground" title="Rewrite">
                <RefreshCw className="size-3.5" />
              </button>
              {onDelete && (
                <button onClick={() => onDelete(message.id)} className="p-1.5 rounded-md hover:bg-red-500/10 transition text-muted-foreground/60 hover:text-red-400" title="Delete message">
                  <IconTrash className="size-3.5" />
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

        {/* 3-dot menu with Helpful / Unhelpful – hide during streaming.
            The wrapper's z-index must stay below the app overlays (settings
            modal is z-50), otherwise the menu bleeds through them. */}
        {!isStreaming && (
          <div className="relative z-20">
            <button
              onClick={() => setShowFeedbackMenu(p => !p)}
              className={`p-1.5 rounded-md transition-all duration-200 text-muted-foreground/60 hover:text-foreground ${liked ? 'text-accent' : ''}`}
              title="Feedback"
            >
              <IconMore className="size-3.5" />
            </button>
            {showFeedbackMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFeedbackMenu(false)} />
                <div className="absolute right-0 bottom-full mb-1 z-20 min-w-[140px] glass-panel rounded-xl shadow-xl overflow-hidden">
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
