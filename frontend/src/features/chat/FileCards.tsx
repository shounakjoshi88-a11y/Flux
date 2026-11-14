import { IconClose, IconTrash } from "../layout/anthropicIcons.tsx";
import React, { useState, useEffect, useMemo } from "react";

import { FileDownloadButton } from "../content/FileDownloadButton";
import { MessageRenderer } from "./MessageRenderer";
import { InlineMath } from "./MathRenderer";
import { BACKEND_URL } from "../../lib/config";
import { createClient } from "../../lib/client";
import { getDomain, rewriteSandboxUrls } from "../../lib/chat-utils";
import type { Source } from "../../types";

export function UserFileAttachment({
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
  const [previewOpen, setPreviewOpen] = useState(false);

  const imgSrc = content?.startsWith('data:') ? content : content ? `data:image/png;base64,${content}` : '';

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
        className="group/file relative flex flex-col bg-[var(--surface-bg)] rounded-xl overflow-hidden hover:bg-[var(--surface-hover)] transition-all cursor-pointer w-[140px]"
        onClick={() => {
          if (isImage && imgSrc) {
            setPreviewOpen(true);
          } else {
            onFileClick?.({ name: file.name, content: content ?? "" });
          }
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center size-[140px]">
            <div className="size-4 border-2 border-[var(--border-border)] border-t-[var(--text-primary)] rounded-full animate-spin" />
          </div>
        ) : isImage && content ? (
            <div className="size-[140px] overflow-hidden">
              <img src={imgSrc} alt={file.name} loading="lazy" className="w-full h-full object-cover" />
            </div>
        ) : isImage && !content ? (
          <div className="flex items-center justify-center size-[140px] text-[var(--text-muted)] text-xs">Image unavailable</div>
        ) : (
          <div className="p-3">
            <div className="font-medium text-sm text-[var(--text-primary)] truncate tracking-tight">{file.name}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">{lineCount > 0 ? `${lineCount} lines` : 'Text file'}</div>
          </div>
        )}
        <div className="flex items-center justify-between">
          {!isImage && <span className="text-[9px] px-2 py-0.5 border border-[var(--surface-border)] rounded bg-[var(--bg-primary)] text-[var(--text-muted)] font-medium">{ext}</span>}
          {!isImage && onFileDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileDelete(file.name);
              }}
              className="opacity-0 group-hover/file:opacity-100 p-1 rounded hover:bg-red-500/15 text-red-400 transition-all"
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

