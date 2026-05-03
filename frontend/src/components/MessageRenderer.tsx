// src/components/MessageRenderer.tsx
import React, { useState, Fragment, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Source } from "@/types";

// ----- Math Components -----
export function InlineMath({ formula }: { formula: string }) {
  const html = katex.renderToString(formula, {
    throwOnError: false,
    displayMode: false,
    strict: "ignore",
  });
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="inline-block align-middle leading-none"
    />
  );
}

function DisplayMath({ formula }: { formula: string }) {
  const html = katex.renderToString(formula, {
    throwOnError: false,
    displayMode: true,
    strict: "ignore",
  });
  return (
    <div
      className="my-4 text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ----- Helpers -----
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const langLabel = language || "text";

  return (
    <div className="code-block-wrapper group">
      <div className="code-block-header">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-black/20 dark:bg-white/10 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {langLabel}
          </span>
          {code.split("\n").length > 20 && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
            >
              <ChevronDown
                className={`size-3 transition-transform ${collapsed ? "" : "rotate-180"}`}
              />
              {collapsed ? "Expand" : "Collapse"}
            </button>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-white transition-colors"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div
        className={`overflow-auto transition-all duration-300 ${
          collapsed ? "max-h-0" : "max-h-[600px]"
        }`}
      >
        <SyntaxHighlighter
          language={language || "text"}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: "0",
            background: "transparent",
            padding: "1rem",
            overflowX: "auto",
          }}
          codeTagProps={{
            style: {
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "0.875rem",
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return <code className="inline-code">{children}</code>;
}

// ----- Inline formatting (unchanged) -----
function splitWithDelimiters(
  text: string,
  regex: RegExp
): { type: "delimiter" | "text"; value: string }[] {
  const parts: { type: "delimiter" | "text"; value: string }[] = [];
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "text", value: text.slice(lastIdx, match.index) });
    }
    parts.push({ type: "delimiter", value: match[0] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "text", value: text.slice(lastIdx) });
  }
  return parts;
}

function formatInlineText(
  text: string,
  onCitationClick: (index: number) => void,
  sources: Source[],
  parentKey: string
): React.ReactNode[] {
  const codeSegments = text.split(/(`[^`]+`)/g);
  return codeSegments.map((seg, segIdx) => {
    const keyBase = `${parentKey}-s${segIdx}`;

    if (seg.startsWith("`") && seg.endsWith("`")) {
      return <InlineCode key={`${keyBase}-code`}>{seg.slice(1, -1)}</InlineCode>;
    }

    const mathParts = splitWithDelimiters(seg, /\\\((.+?)\\\)|\$(.+?)\$/gs);
    return mathParts.map((part, partIdx) => {
      if (part.type === "delimiter") {
        const inner = part.value
          .replace(/^\\\(/, "")
          .replace(/\\\)$/, "")
          .replace(/^\$/, "")
          .replace(/\$$/, "");
        return <InlineMath key={`${keyBase}-m${partIdx}`} formula={inner} />;
      }

      const boldSegments = part.value.split(/(\*\*.*?\*\*)/g);
      return boldSegments.map((boldSeg, boldIdx) => {
        if (boldSeg.startsWith("**") && boldSeg.endsWith("**")) {
          return (
            <strong key={`${keyBase}-b${boldIdx}`}>
              {boldSeg.slice(2, -2)}
            </strong>
          );
        }

        const citationParts = boldSeg.split(/(\[\d+\])/g);
        return citationParts.map((cPart, cIdx) => {
          const match = cPart.match(/^\[(\d+)\]$/);
          if (match) {
            const num = Number(match[1]);
            const index = num - 1;
            const valid = index >= 0 && index < sources.length;
            return (
              <button
                key={`${keyBase}-c${cIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCitationClick(index);
                  if (valid) window.open(sources[index].url, "_blank");
                }}
                className="citation-btn text-[0.7em] align-super ml-0.5"
              >
                {num}
              </button>
            );
          }
          return (
            <span key={`${keyBase}-t${cIdx}`}>{cPart}</span>
          );
        });
      });
    });
  });
}

// ----- Tokenizer (display math only) -----
type Token =
  | { type: "text"; value: string }
  | { type: "display_math"; value: string };

function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\$\$(.+?)\$\$|\\\[(.+?)\\\]/gs;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: "text", value: content.slice(lastIdx, match.index) });
    }
    if (match[1]) {
      tokens.push({ type: "display_math", value: match[1] });
    } else if (match[2]) {
      tokens.push({ type: "display_math", value: match[2] });
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    tokens.push({ type: "text", value: content.slice(lastIdx) });
  }
  return tokens;
}

// ----- Table helpers (unchanged) -----
function isTableLine(line: string) {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.indexOf("|", 1) > 0;
}

function isTableSeparator(line: string) {
  return /^\|[\s:-]+\|[\s|:-]+\|$/.test(line.trim());
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function Table({
  header,
  rows,
  onCitationClick,
  sources,
  parentKey,
}: {
  header: string[];
  rows: string[][];
  onCitationClick: (index: number) => void;
  sources: Source[];
  parentKey: string;
}) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-700 text-[15px]">
        <thead>
          <tr className="bg-gray-800/50">
            {header.map((h, hi) => (
              <th
                key={`${parentKey}-h-${hi}`}
                className="border border-gray-700 px-3 py-2 text-left font-semibold text-foreground"
              >
                {formatInlineText(h, onCitationClick, sources, `${parentKey}-h${hi}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={`${parentKey}-r${ri}`} className="odd:bg-gray-900/30 even:bg-transparent">
              {row.map((cell, ci) => (
                <td key={`${parentKey}-r${ri}-c${ci}`} className="border border-gray-700 px-3 py-2">
                  {formatInlineText(cell, onCitationClick, sources, `${parentKey}-r${ri}-c${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── GLOBAL CODE‑BLOCK EXTRACTION ────────────────────
type Segment =
  | { type: "code"; language: string; content: string }
  | { type: "text"; value: string };

/**
 * Splits rawText into an array of Segments, where fenced code blocks
 * are extracted as `code` segments and everything else becomes `text`.
 * Code fences are recognised by a line matching exactly ``` (optional
 * language tag) and a closing line that is exactly ``` (no language).
 */
function extractCodeBlocks(rawText: string): Segment[] {
  const segments: Segment[] = [];
  const lines = rawText.split("\n");
  let i = 0;
  let currentText: string[] = [];

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Opening fence: must start with ```, optionally followed by letters/digits
    if (/^```[a-zA-Z0-9]*$/.test(trimmed)) {
      // Flush any accumulated text
      if (currentText.length > 0) {
        segments.push({ type: "text", value: currentText.join("\n") });
        currentText = [];
      }
      const lang = trimmed.slice(3).trim();
      i++; // move past opening fence
      const codeLines: string[] = [];
      while (i < lines.length) {
        if (lines[i].trim() === "```") {
          i++; // skip closing fence
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      segments.push({ type: "code", language: lang, content: codeLines.join("\n") });
    } else {
      currentText.push(lines[i]);
      i++;
    }
  }

  // Flush remaining text
  if (currentText.length > 0) {
    segments.push({ type: "text", value: currentText.join("\n") });
  }

  return segments;
}

// ─── PARAGRAPH PROCESSOR (for text segments) ──────────
function processTextSegment(
  text: string,
  onCitationClick: (index: number) => void,
  sources: Source[],
  parentPrefix: string
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const paragraphs = text.split(/\n\n+/);
  paragraphs.forEach((block, i) => {
    const lines = block.split(/\n/);
    let j = 0;
    let loopGuard = 0;

    while (j < lines.length && loopGuard < 20000) {
      loopGuard++;
      const line = lines[j];
      const trimmed = line.trim();

      if (!trimmed) {
        j++;
        continue;
      }

      // Table detection
      const remainingLines = lines.slice(j);
      if (
        remainingLines.length >= 3 &&
        isTableLine(remainingLines[0]) &&
        isTableSeparator(remainingLines[1]) &&
        isTableLine(remainingLines[2])
      ) {
        const header = parseTableRow(remainingLines[0]);
        let consumed = 2;
        const rows: string[][] = [];
        while (
          consumed < remainingLines.length &&
          isTableLine(remainingLines[consumed])
        ) {
          rows.push(parseTableRow(remainingLines[consumed]));
          consumed++;
        }
        elements.push(
          <Table
            key={`table-${parentPrefix}-${i}-${j}`}
            header={header}
            rows={rows}
            onCitationClick={onCitationClick}
            sources={sources}
            parentKey={`table-${parentPrefix}-${i}-${j}`}
          />
        );
        j += consumed;
        continue;
      }

      // Heading
      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) {
        const Tag = `h${hMatch[1].length}` as keyof JSX.IntrinsicElements;
        const key = `h-${parentPrefix}-${i}-${j}`;
        elements.push(
          <Tag key={key} className="mt-3 mb-2 font-semibold tracking-tight text-foreground">
            {formatInlineText(hMatch[2], onCitationClick, sources, key)}
          </Tag>
        );
        j++;
        continue;
      }

      // Unordered list
      if (/^[-*]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (j < lines.length && /^[-*]\s+/.test(lines[j].trim())) {
          items.push(lines[j].trim().replace(/^[-*]\s+/, ""));
          j++;
        }
        const key = `ul-${parentPrefix}-${i}-${j}`;
        elements.push(
          <ul key={key} className="my-2 list-disc pl-5 space-y-0.5 text-[15px]">
            {items.map((item, itemIdx) => (
              <li key={`${key}-${itemIdx}`}>
                {formatInlineText(item, onCitationClick, sources, `${key}-${itemIdx}`)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Ordered list (1–2 digits)
      if (/^\d{1,2}\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (j < lines.length && /^\d{1,2}\.\s+/.test(lines[j].trim())) {
          items.push(lines[j].trim().replace(/^\d{1,2}\.\s+/, ""));
          j++;
        }
        const key = `ol-${parentPrefix}-${i}-${j}`;
        elements.push(
          <ol key={key} className="my-2 list-decimal pl-5 space-y-0.5 text-[15px]">
            {items.map((item, itemIdx) => (
              <li key={`${key}-${itemIdx}`}>
                {formatInlineText(item, onCitationClick, sources, `${key}-${itemIdx}`)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Regular paragraph
      let paraLines: string[] = [];
      while (
        j < lines.length &&
        lines[j].trim() &&
        !/^(#{1,3}\s+)/.test(lines[j].trim()) &&
        !/^[-*]\s+/.test(lines[j].trim()) &&
        !/^\d{1,2}\.\s+/.test(lines[j].trim()) &&
        !isTableLine(lines[j])
      ) {
        paraLines.push(lines[j]);
        j++;
      }

      if (paraLines.length > 0) {
        const key = `p-${parentPrefix}-${i}-${j}`;
        const inlineNodes = paraLines.map((l, lineIdx) => {
          const hasHardBreak = l.endsWith("  ");
          const content = hasHardBreak ? l.slice(0, -2) : l;
          return (
            <Fragment key={`${key}-l${lineIdx}`}>
              {formatInlineText(content, onCitationClick, sources, `${key}-l${lineIdx}`)}
              {hasHardBreak && lineIdx < paraLines.length - 1 && <br />}
            </Fragment>
          );
        });
        elements.push(
          <p key={key} className="text-[15px] leading-7 mt-1 mb-2">
            {inlineNodes}
          </p>
        );
      }

      // Safety advance
      if (j < lines.length && (!lines[j] || !lines[j].trim())) j++;
    }

    if (loopGuard >= 20000) {
      console.error("Infinite loop prevented in processTextSegment");
    }
  });

  return elements;
}

// ─── MAIN RENDERER ───────────────────────────────────
function renderContent(
  rawText: string,
  onCitationClick: (index: number) => void,
  sources: Source[]
) {
  const segments = extractCodeBlocks(rawText);
  const elements: React.ReactNode[] = [];

  segments.forEach((segment, segIdx) => {
    if (segment.type === "code") {
      elements.push(
        <CodeBlock
          key={`code-${segIdx}`}
          language={segment.language}
          code={segment.content}
        />
      );
      return;
    }

    // Text segment: handle display math and then paragraphs
    const tokens = tokenize(segment.value);
    tokens.forEach((token, tokIdx) => {
      const prefix = `seg${segIdx}-tok${tokIdx}`;
      if (token.type === "display_math") {
        elements.push(
          <DisplayMath key={`dm-${prefix}`} formula={token.value} />
        );
      } else {
        const processed = processTextSegment(token.value, onCitationClick, sources, prefix);
        elements.push(...processed);
      }
    });
  });

  return elements;
}

// ----- Public component (memoized) -----
export const MessageRenderer = React.memo(function MessageRenderer({
  content,
  onCitationClick,
  sources,
}: {
  content: string;
  onCitationClick: (index: number) => void;
  sources: Source[];
}) {
  const rendered = useMemo(
    () => renderContent(content, onCitationClick, sources),
    [content, onCitationClick, sources]
  );
  return <>{rendered}</>;
});