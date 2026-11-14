import { IconClose, IconTrash } from "../layout/anthropicIcons.tsx";
import React, { useState, useEffect, useMemo } from "react";
import { FileType, FileText, FileSpreadsheet, Presentation, FileCode } from "lucide-react";
import mammoth from "mammoth";

import { FileDownloadButton } from "../content/FileDownloadButton";
import { MessageRenderer } from "./MessageRenderer";
import { InlineMath } from "./MathRenderer";
import { BACKEND_URL } from "../../lib/config";
import { createClient } from "../../lib/client";
import { getDomain, rewriteSandboxUrls, isBase64DataUrl, splitDataUrl, byteLengthOfBase64, formatFileSize, toBase64Utf8, base64ToBytes } from "../../lib/chat-utils";
import type { Source } from "../../types";

export function UserFileAttachment({
  file,
  messageId,
  index,
  onFileClick,
  onFileDelete,
  onPreview,
}: {
  file: { name: string; content?: string; type?: string };
  messageId: string | number;
  index: number;
  onFileClick?: (file: { name: string; content: string }) => void;
  onFileDelete?: (name: string) => void;
  onPreview?: (data: { type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'md'; base64?: string; html?: string; filename: string }) => void;
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

  const ext = (file.name.split('.').pop() ?? 'FILE').toUpperCase();
  const extLower = ext.toLowerCase();
  const lowerType = (file.type ?? '').toLowerCase();
  const isImage = lowerType.startsWith('image/');
  const [previewOpen, setPreviewOpen] = useState(false);

  const imgSrc = content?.startsWith('data:') ? content : content ? `data:image/png;base64,${content}` : '';

  const bytes = useMemo(() => {
    if (!content) return null;
    if (isBase64DataUrl(content)) return byteLengthOfBase64(splitDataUrl(content).base64);
    try { return new TextEncoder().encode(content).length; } catch { return content.length; }
  }, [content]);
  const sizeLabel = bytes != null ? formatFileSize(bytes) : null;

  const icon = useMemo(() => {
    if (extLower === 'pdf' || lowerType.includes('pdf'))
      return { Icon: FileType, tint: 'text-red-400 bg-red-500/10 border-red-500/20' };
    if (['doc', 'docx'].includes(extLower) || lowerType.includes('wordprocessingml') || lowerType.includes('msword'))
      return { Icon: FileText, tint: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
    if (['ppt', 'pptx'].includes(extLower) || lowerType.includes('presentation'))
      return { Icon: Presentation, tint: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
    if (['xls', 'xlsx', 'csv', 'tsv'].includes(extLower) || lowerType.includes('spreadsheet') || lowerType.includes('excel'))
      return { Icon: FileSpreadsheet, tint: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    if (['md', 'markdown', 'txt', 'rtf'].includes(extLower))
      return { Icon: FileText, tint: 'text-slate-300 bg-slate-500/10 border-slate-500/20' };
    return { Icon: FileCode, tint: 'text-violet-300 bg-violet-500/10 border-violet-500/20' };
  }, [extLower, lowerType]);

  // Open the rendered peek for documents (like Claude); fall back to the raw
  // text panel only for code/plain-text files.
  const openPreview = async () => {
    if (!content) return; // still lazy-loading
    const filename = file.name;
    const isDataUrl = isBase64DataUrl(content);
    const { mime, base64 } = splitDataUrl(content);
    const pureBase64 = isDataUrl ? base64 : (mime ? '' : toBase64Utf8(content));

    try {
      if (extLower === 'pdf' || mime?.includes('pdf') || lowerType.includes('pdf')) {
        onPreview?.({ type: 'pdf', base64: pureBase64, filename });
        return;
      }
      if (extLower === 'docx' || mime?.includes('word') || lowerType.includes('wordprocessingml')) {
        const fileBytes = base64ToBytes(pureBase64);
        const result = await mammoth.convertToHtml({ arrayBuffer: fileBytes.buffer as ArrayBuffer });
        onPreview?.({ type: 'docx', html: result.value, filename });
        return;
      }
      if (extLower === 'pptx' || mime?.includes('presentation') || lowerType.includes('presentation')) {
        onPreview?.({ type: 'pptx', base64: pureBase64, filename });
        return;
      }
      if (['xlsx', 'xls', 'csv', 'tsv'].includes(extLower) || lowerType.includes('spreadsheet') || lowerType.includes('csv')) {
        onPreview?.({ type: 'xlsx', base64: pureBase64, filename });
        return;
      }
      if (['md', 'markdown'].includes(extLower)) {
        onPreview?.({ type: 'md', base64: pureBase64, filename });
        return;
      }
    } catch (e) {
      console.error('Attachment preview failed:', e);
    }
    onFileClick?.({ name: filename, content });
  };

  return (
    <>
      {previewOpen && isImage && imgSrc && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            <img src={imgSrc} alt={file.name} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute top-2 right-2 size-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <IconClose className="size-4" />
            </button>
          </div>
        </div>
      )}
      <div
        className="group/file relative flex flex-col bg-[var(--surface-bg)] rounded-xl overflow-hidden hover:bg-[var(--surface-hover)] transition-all cursor-pointer w-[150px]"
        onClick={() => {
          if (isImage && imgSrc) {
            setPreviewOpen(true);
          } else {
            openPreview();
          }
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center size-[150px]">
            <div className="size-4 border-2 border-[var(--border-border)] border-t-[var(--text-primary)] rounded-full animate-spin" />
          </div>
        ) : isImage && content ? (
            <div className="size-[150px] overflow-hidden">
              <img src={imgSrc} alt={file.name} loading="lazy" className="w-full h-full object-cover" />
            </div>
        ) : isImage && !content ? (
          <div className="flex items-center justify-center size-[150px] text-[var(--text-muted)] text-xs">Image unavailable</div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-3 pt-5 pb-3">
            <div className={`size-11 rounded-xl border flex items-center justify-center ${icon.tint}`}>
              <icon.Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="text-[11px] font-medium leading-tight text-center text-[var(--text-primary)] line-clamp-2 break-words max-w-full" title={file.name}>
              {file.name}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] leading-none">
              {sizeLabel ? `${ext} · ${sizeLabel}` : ext}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-1.5 pb-1.5 min-h-[24px]">
          <span className="w-5" />
          {!isImage && onFileDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileDelete(file.name);
              }}
              className="opacity-0 group-hover/file:opacity-100 p-1 rounded hover:bg-red-500/15 text-red-400 transition-opacity"
              title="Delete attachment"
            >
              <IconTrash className="size-3" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}


/* ------------------------------------------------------------------ */
/*  Math helpers                                                      */
/* ------------------------------------------------------------------ */
export function tokenizeInlineMath(text: string): { type: "text" | "math"; value: string }[] {
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

export function RenderFollowUpText({ text }: { text: string }) {
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
export function deepCleanAnswer(raw: string): string {
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
export function ContentWithFileCards({
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

