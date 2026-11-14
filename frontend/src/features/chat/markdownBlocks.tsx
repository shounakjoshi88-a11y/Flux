import { IconChevronDown, IconDownload } from "../layout/anthropicIcons.tsx";
import React, { useState } from "react";

import { getDomain, fixMalformedTags } from "../../lib/chat-utils";
import DOMPurify from "dompurify";
import { CodeBlock } from "./CodeRenderers";
import { MermaidRenderer } from "./CodeRenderers";
import { SmilesRenderer } from "./CodeRenderers";
import { TikzRenderer } from "./CodeRenderers";
import { MusicRenderer } from "./CodeRenderers";
import { InlineMath, DisplayMath } from "./MathRenderer";
import { LiveWidget } from "./LiveWidget";
import { ChartRenderer } from "../content/ChartBlock";
import type { Source } from "../../types";

export function linkifyUrls(text: string, keyPrefix: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, idx) => {
    if (part.match(/^https?:\/\/[^\s]+$/)) {
      return <a key={`${keyPrefix}url-${idx}`} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline break-all">{part}</a>;
    }
    return <span key={`${keyPrefix}text-${idx}`}>{part}</span>;
  });
}

export function splitWithDelimiters(text: string, regex: RegExp): { type: "delimiter" | "text"; value: string }[] {
  const parts: { type: "delimiter" | "text"; value: string }[] = [];
  if (typeof text !== "string") return parts;
  let lastIdx = 0;
  let match;
  const safeRegex = new RegExp(regex.source, regex.flags);
  while ((match = safeRegex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push({ type: "text", value: text.slice(lastIdx, match.index) });
    parts.push({ type: "delimiter", value: match[0] });
    lastIdx = match.index + match[0].length;
    if (!safeRegex.global) break;
  }
  if (lastIdx < text.length) parts.push({ type: "text", value: text.slice(lastIdx) });
  return parts;
}

// ── Note: [a-zA-Z*]+ (was [a-z*]+) so that \begin{CD}, \begin{Bmatrix}, etc. match ──
const INLINE_DELIM_REGEX = /(\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})|`[^`]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*(?!\*)[\s\S]+?\*|_(?!_)[\s\S]+?_|\\\(.+?\\\)|\\\[.+?\\\]|\$(?!-?\d[\d.,%]*\$).+?\$|\[\d+\])/g;

export function CitationHoverCard({ url, content, children }: { url: string; content?: string; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const domain = (() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } })();
  return (
    <span className="relative inline" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {children}
      {hovered && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2.5 rounded-lg border border-[var(--surface-border)] bg-[var(--bg-primary)] shadow-xl z-50 w-80 pointer-events-none">
          <span className="flex items-center gap-2 mb-2">
            <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`} alt="" className="size-4 rounded shrink-0" />
            <span className="text-foreground font-medium text-xs truncate">{domain}</span>
          </span>
          {content && <span className="text-muted-foreground text-[11px] leading-relaxed block">{content}</span>}
          {!content && <span className="text-muted-foreground text-[11px] truncate block">{url}</span>}
        </span>
      )}
    </span>
  );
}

export function formatInlineText(text: string, onCitationClick: any, sources: Source[], parentKey: string): React.ReactNode[] {
  if (typeof text !== "string") return [];
  return splitWithDelimiters(text, INLINE_DELIM_REGEX).flatMap((part, partIdx) => {
    const key = `${parentKey}-p${partIdx}`;
    if (part.type === "text") return linkifyUrls(part.value, key);
    const val = part.value;
    if (val.startsWith("\\begin{") || val.startsWith("$$") || (val.startsWith("\\[") && val.length > 10)) return <DisplayMath key={key} formula={val} />;
    if (val.startsWith("`")) return <code key={key} className="inline-code">{val.slice(1, -1)}</code>;
    if (val.startsWith("**") || val.startsWith("__")) return <strong key={key} className="font-bold text-[15px] leading-[21px] text-[var(--text-primary)]">{formatInlineText(val.slice(2, -2), onCitationClick, sources, key)}</strong>;
    if (val.startsWith("*") || val.startsWith("_")) return <em key={key} className="italic">{formatInlineText(val.slice(1, -1), onCitationClick, sources, key)}</em>;
    if (val.startsWith("$") || val.startsWith("\\(")) {
      const inner = val.replace(/^(\$|\\\()/, "").replace(/(\$|\\\))$/, "");
      return <InlineMath key={key} formula={inner} />;
    }
    const cMatch = val.match(/^\[(\d+)\]$/);
    if (cMatch) {
      const num = Number(cMatch[1]);
      const idx = num - 1;
      const name = sources[idx]?.url ? getDomain(sources[idx].url) : `[${num}]`;
      const url = sources[idx]?.url;
      return <CitationHoverCard key={key} url={url || ''} content={sources[idx]?.content}><button onClick={() => { onCitationClick(idx); if (url) window.open(url, "_blank"); }} className="citation-btn text-[0.7em] align-super ml-0.5">{name}</button></CitationHoverCard>;
    }
    return <span key={key}>{val}</span>;
  });
}
export function stripJsonComments(raw: string): string {
  return raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

export function parseTable(lines: string[], startIndex: number) {
  const rows: string[][] = [];
  let i = startIndex;
  while (i < lines.length && lines[i]?.trim().startsWith("|") && lines[i]?.trim().endsWith("|")) {
    const row = lines[i]!.trim().slice(1, -1).split("|").map(c => c.trim());
    if (!row.every(c => c.match(/^[:\s-]+$/))) rows.push(row);
    i++;
  }
  return { rows, nextIndex: i };
}

export function downloadTableAsCsv(rows: string[][], tableIndex: number) {
  const header = rows[0] ?? [];
  const data = rows.slice(1);
  const csvContent = [
    header.map(c => `"${c.replace(/"/g, '""')}"`).join(","),
    ...data.map(row => header.map((_, ci) => `"${(row[ci] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `table-${tableIndex + 1}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function parseList(lines: string[], startIndex: number) {
  const items: { level: number; text: string; type: "ol" | "ul" }[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    const match = line.match(/^(\s*)([-*•]|\d+\.)\s+(.+)$/);
    if (!match) break;
    items.push({ level: match[1]!.length, text: match[3]!, type: match[2]!.match(/\d/) ? "ol" : "ul" });
    i++;
  }
  return { items, nextIndex: i };
}

export function renderList(items: any[], onCitationClick: any, sources: Source[], parentKey: string) {
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const baseLevel = item.level;
    const listType = item.type;
    const ListTag = (listType === "ol" ? "ol" : "ul") as any;

    // Collect all items at this level or nested under it (stop at next same-level item of different type)
    const group: any[] = [];
    let j = i;
    while (j < items.length) {
      const cur = items[j];
      if (cur.level === baseLevel && cur.type !== listType) break;
      if (cur.level < baseLevel) break;
      group.push(cur);
      j++;
    }

    // Separate top-level items from nested
    const topLevelItems = group.filter((x: any) => x.level === baseLevel && x.type === listType);
    if (topLevelItems.length === 0) { i = j; continue; }

    result.push(
      <ListTag key={`${parentKey}-${i}`} className={`${listType === "ol" ? "list-decimal" : "list-disc"} pl-6 my-2 space-y-1`}>
        {topLevelItems.map((li: any) => {
          // Find nested items that belong to this top-level item
          const liIdx = group.indexOf(li);
          const nested: any[] = [];
          for (let k = liIdx + 1; k < group.length; k++) {
            const sub = group[k];
            if (sub.level <= baseLevel) break;
            nested.push(sub);
          }
          return (
            <li key={`${parentKey}-li-${i}-${li.text.slice(0, 20)}`} className="pl-1">
              {formatInlineText(li.text, onCitationClick, sources, `${parentKey}-li-${i}-${li.text.slice(0, 10)}`)}
              {nested.length > 0 && renderList(nested, onCitationClick, sources, `${parentKey}-nested-${i}-${li.text.slice(0, 10)}`)}
            </li>
          );
        })}
      </ListTag>
    );
    i = j;
  }
  return result;
}

export function renderPlainBlocks(text: string, onCitationClick: any, sources: Source[], parentIdx: number) {
  text = stripRedundantHtmlTags(text);
  const detailsRegex = /<details([^>]*)>([\s\S]*?)<\/details>/gi;
  const pieces: { type: 'text' | 'details'; value: string }[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = detailsRegex.exec(text)) !== null) {
    if (m.index > lastIdx) pieces.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    const body = m[2];
    pieces.push({ type: 'details', value: (body ?? '').trim() });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) pieces.push({ type: 'text', value: text.slice(lastIdx) });

  const elements: React.ReactNode[] = [];
  pieces.forEach((piece, pi) => {
    if (piece.type === 'details') {
      const lines = piece.value.split('\n');
      // Find the <summary> line. The model sometimes emits it bare
      // ('<summary>' alone on a line) with the answer on the next line,
      // or drops the closing tag entirely.
      const summaryLineIdx = lines.findIndex(l => /^\s*<summary[^>]*>/i.test(l));
      let summaryText = 'Show answer';
      let bodyStartIdx = 0;
      if (summaryLineIdx >= 0) {
        const raw = lines[summaryLineIdx]!;
        const open = raw.match(/<summary[^>]*>/i)?.[0] ?? '<summary>';
        const rest = raw.slice(raw.indexOf(open) + open.length);
        const restWithoutClose = rest.replace(/<\/summary>/i, '');
        const sameLineHasText = restWithoutClose.replace(/<[^>]*>/g, '').trim().length > 0;
        if (sameLineHasText) {
          // <summary>ANSWER</summary> on one line
          summaryText = stripRedundantHtmlTags(restWithoutClose.trim());
          bodyStartIdx = summaryLineIdx + 1;
        } else {
          const nextLine = lines[summaryLineIdx + 1]?.trim() ?? '';
          if (/<\/summary>/i.test(nextLine)) {
            // <summary>\nANSWER</summary> — answer on the next line
            summaryText = stripRedundantHtmlTags(nextLine.replace(/<\/summary>/i, '').trim());
            bodyStartIdx = summaryLineIdx + 2;
          } else {
            // Bare <summary> with the answer inline on following lines — all body there
            summaryText = 'Show answer';
            bodyStartIdx = summaryLineIdx + 1;
          }
        }
      }
      const bodyLines = lines.slice(bodyStartIdx).join('\n').trim();
      elements.push(
        <details key={`det-${parentIdx}-${pi}`} className="my-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-[var(--text-secondary)] select-none">{summaryText || 'Show answer'}</summary>
          <div className="pt-2">{renderBlocks(bodyLines, onCitationClick, sources)}</div>
        </details>
      );
      return;
    }
    const lines = piece.value.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const trimmed = line.trim();
      if (!trimmed) { i++; continue; }
      const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        const Tag = `h${hMatch[1]!.length}` as any;
        elements.push(<Tag key={`h-${parentIdx}-${pi}-${i}`} className="font-bold text-foreground mt-6 mb-2 tracking-tight">{formatInlineText(hMatch[2]!, onCitationClick, sources, `h-${parentIdx}-${pi}-${i}`)}</Tag>);
        i++; continue;
      }
      if (trimmed.startsWith("|")) {
        const { rows, nextIndex } = parseTable(lines, i);
        if (rows.length > 1) {
          const tblIdx = elements.length;
          elements.push(
            <div key={`tab-${parentIdx}-${pi}-${i}`} className="group my-4 overflow-x-auto relative">
              <table className="min-w-full text-sm">
                <thead className="text-left border-b border-white/25"><tr>{rows[0]!.map((cell, ci) => (<th key={ci} className="px-4 py-3 font-semibold text-foreground text-sm">{formatInlineText(cell, onCitationClick, sources, `th-${parentIdx}-${pi}-${i}-${ci}`)}</th>))}</tr></thead>
                <tbody className="divide-y divide-white/30">{rows.slice(1).map((row, ri) => (<tr key={ri} className="hover:bg-white/[0.03] transition-colors">{row.map((cell, ci) => (<td key={ci} className="px-4 py-2.5 text-foreground/90 text-sm">{formatInlineText(cell, onCitationClick, sources, `td-${parentIdx}-${pi}-${i}-${ri}-${ci}`)}</td>))}</tr>))}</tbody>
              </table>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1 right-1">
                <button
                  title="Export as CSV"
                  onClick={() => downloadTableAsCsv(rows, tblIdx)}
                  className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
          i = nextIndex; continue;
        }
      }
      if (trimmed.match(/^([-*•]|\d+\.)\s+/)) {
        const { items, nextIndex } = parseList(lines, i);
        elements.push(<div key={`lst-${parentIdx}-${pi}-${i}`}>{renderList(items, onCitationClick, sources, `lst-${parentIdx}-${pi}-${i}`)}</div>);
        i = nextIndex; continue;
      }
      if (trimmed === "---") {
        elements.push(<hr key={`hr-${parentIdx}-${pi}-${i}`} className="my-8 border-white/10" />);
        i++; continue;
      }
      elements.push(<p key={`p-${parentIdx}-${pi}-${i}`} className="leading-[21px] mb-3 last:mb-0 text-[15px] text-[var(--text-primary)] break-words [overflow-wrap:anywhere]">{formatInlineText(line, onCitationClick, sources, `p-${parentIdx}-${pi}-${i}`)}</p>);
      i++;
    }
  });
  return elements;
}

// Drop HTML tags we don't render (keep markdown). Preserves nothing inside them.
function stripRedundantHtmlTags(text: string): string {
  return text
    .replace(/<\/?strong>/gi, '')
    .replace(/<\/?em>/gi, '')
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?i>/gi, '')
    .replace(/<\/?u>/gi, '')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?li>/gi, '')
    .replace(/<\/?ol>/gi, '\n')
    .replace(/<\/?ul>/gi, '\n');
}

// ── XyMatrix standalone detection ─────────────────────────
// \xymatrix{...} doesn't use \begin/\end, so it won't be caught by BLOCK_DELIM_REGEX.
// We wrap it in \[...\] so it routes to DisplayMath / MathJax.
export function extractXymatrixBlocks(text: string): string {
  return text.replace(/\\(?:xymatrix\*?(?:@[^{]*)?)\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g,
    (_match) => {
      return `\\[${_match}\\]`;
    }
  );
}

// ── Inline code protection ────────────────────────────────
// Mask backtick-delimited inline code before the block regex runs, so that
// prose mentions of \begin{CD} inside `code` aren't captured as env starts.
const CODE_MASK = '\x00CD';
const CODE_MASK_END = '\x00';

export function maskCode(text: string, store: string[]): string {
  // Only match single-backtick spans, not triple-backtick fences
  return text.replace(/(?<!``)`[^`]+`(?!`)/g, (m) => {
    const idx = store.length;
    store.push(m);
    return `${CODE_MASK}${idx}${CODE_MASK_END}`;
  });
}
export function restoreCode(text: string, store: string[]): string {
  return text.replace(new RegExp(`${CODE_MASK}(\\d+)${CODE_MASK_END}`, 'g'), (_, idx) => store[+idx] ?? '');
}

// ── Block regex: \3 backreference ensures \begin{CD} only matches \end{CD} ──
const BLOCK_DELIM_REGEX = /(<(?:CHART|MERMAID|LIVE|svg|TIKZ|LILYPOND|MUSIC|ABC|CHEMICAL|SMILES|MOL)(?:\s+[^>]*)?>[\s\S]*?<\/(?:CHART|MERMAID|LIVE|svg|TIKZ|LILYPOND|MUSIC|ABC|CHEMICAL|SMILES|MOL)>|```[a-z]*[\s\S]*?```|(?<=\n|^)\s*\$\$[\s\S]*?\s*\$\$(?=\s*$|\n)|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\2\})/gim;

export function renderBlocks(text: string, onCitationClick: any, sources: Source[], onHtmlPreview?: (html: string) => void) {
  if (typeof text !== "string") return [];
  text = fixMalformedTags(text);
  const codeStore: string[] = [];
  const masked = maskCode(text, codeStore);
  const withXy = extractXymatrixBlocks(masked);
  return splitWithDelimiters(withXy, BLOCK_DELIM_REGEX).flatMap((part, pi) => {
    // Restore inline code spans — text parts need it, and code-block delimiter
    // parts may have placeholders if the code contained inline backtick spans.
    part.value = restoreCode(part.value, codeStore);
    if (part.type === "delimiter") {
      const val = part.value;
      const tagMatch = val.match(/<(CHART|MERMAID|LIVE|svg|TIKZ|LILYPOND|MUSIC|ABC|CHEMICAL|SMILES|MOL)/i);
      if (tagMatch) {
        const tag = tagMatch[1]!.toUpperCase();
        const contentBase = val.replace(/<[^>]+>/gi, "").trim();
        if (tag === "LIVE") {
          return <LiveWidget key={pi} html={contentBase} />;
        }
        if (tag === "CHART") {
          try {
            const data = JSON.parse(stripJsonComments(contentBase));
            if (data && typeof data === "object") return <ChartRenderer key={pi} data={data} />;
            return <div key={pi} className="text-red-400 text-xs my-2">Invalid Chart Data</div>;
          } catch { return <div key={pi} className="text-red-400 text-xs my-2">Invalid Chart JSON</div>; }
        }
        if (tag === "MERMAID") {
          const mermaidCode = contentBase.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
          return <MermaidRenderer key={pi} code={mermaidCode} />;
        }
        if (tag === "TIKZ") return <TikzRenderer key={pi} code={contentBase} />;
        if (tag === "LILYPOND" || tag === "MUSIC" || tag === "ABC") return <MusicRenderer key={pi} code={contentBase} />;
        if (tag === "CHEMICAL") {
          // \ce{} only handles chemical equations (e.g. \ce{H2O}, \ce{NaOH + HCl -> NaCl + H2O}).
          // For structural formulas use <SMILES>...</SMILES> with a SMILES string.
          return (
            <div key={pi}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-muted-foreground bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">Chemical equation</span>
              </div>
              <DisplayMath formula={`\\ce{${contentBase}}`} />
            </div>
          );
        }
        if (tag === "SMILES" || tag === "MOL") return <SmilesRenderer key={pi} smiles={contentBase} />;
        return <div key={pi} className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(val) }} />;
      }
      if (val.startsWith("```")) {
        const match = val.match(/^```([a-z]*)\n?([\s\S]*?)\n?```$/i);
        return <CodeBlock key={pi} language={match?.[1] || "text"} code={match?.[2] || ""} onHtmlPreview={onHtmlPreview} />;
      }
      if (val.startsWith("\\begin{")) {
        const envMatch = val.match(/\\begin\{([a-zA-Z*]+)\}/i);
        const env = envMatch?.[1];
        if (env === "tikzpicture") {
          const content = val.replace(/^\\begin\{tikzpicture\}[\s\S]*?\n?/, "").replace(/\n?\\end\{tikzpicture\}$/, "").trim();
          return <TikzRenderer key={pi} code={content} />;
        }
        if (env === "tikzcd") {
          const content = val.replace(/^\\begin\{tikzcd\}[\s\S]*?\n?/, "").replace(/\n?\\end\{tikzcd\}$/, "").trim();
          return <TikzRenderer key={pi} code={`\\begin{tikzcd}\n${content}\n\\end{tikzcd}`} />;
        }
        return <DisplayMath key={pi} formula={val} />;
      }
      if (val.trim().startsWith("$$") || (val.trim().startsWith("\\[") && val.length > 10)) {
        const inner = val.trim().replace(/^\$\$/, "").replace(/\$\$$/, "").replace(/^\\\[/, "").replace(/\\\]$/, "").trim();
        if (inner.startsWith("\\begin{tikzpicture}")) {
          const content = inner.replace(/^\\begin\{tikzpicture\}[\s\S]*?\n?/, "").replace(/\n?\\end\{tikzpicture\}$/, "").trim();
          return <TikzRenderer key={pi} code={content} />;
        }
        if (/^\\begin\{tikzcd\}/i.test(inner)) {
          const content = inner.replace(/^\\begin\{tikzcd\}[\s\S]*?\n?/, "").replace(/\n?\\end\{tikzcd\}$/, "").trim();
          return <TikzRenderer key={pi} code={`\\begin{tikzcd}\n${content}\n\\end{tikzcd}`} />;
        }
        return <DisplayMath key={pi} formula={val.trim()} />;
      }
      return <span key={pi}>{val}</span>;
    }
    return renderPlainBlocks(part.value, onCitationClick, sources, pi);
  });
}


