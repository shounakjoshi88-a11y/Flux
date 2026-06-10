// src/components/MessageRenderer.tsx
import React, { useState, Fragment, useMemo, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Source } from "@/types";

// ─── Import ChartRenderer (separate file) ─────────────────
import { ChartRenderer, type ChartData } from "./ChartBlock";

// ─── Lazy load mermaid ─────────────────────────────────────
let mermaid: any = null;
const loadMermaid = async () => {
  if (!mermaid) {
    const mod = await import("mermaid");
    mermaid = mod.default;
    mermaid.initialize({ startOnLoad: false, theme: "dark" });
  }
  return mermaid;
};

// ─── Math Components ──────────────────────────────────────
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

// ─── Mermaid Renderer ──────────────────────────────────────
function MermaidRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await loadMermaid();
        if (ref.current) {
          ref.current.innerHTML = "";
          const { svg } = await m.render("mermaid-" + Date.now(), code);
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        setError("Failed to render Mermaid diagram");
        console.error(err);
      }
    })();
  }, [code]);

  if (error) return <div className="text-red-400 text-sm">{error}</div>;
  return <div ref={ref} className="mermaid-renderer my-4" />;
}

// ─── Code Block ────────────────────────────────────────────
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
            padding: "0.75rem",
            overflowX: "auto",
          }}
          codeTagProps={{
            style: {
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "0.75rem",
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

// ─── Linkify URLs ──────────────────────────────────────────
function linkifyUrls(text: string, keyPrefix = ""): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  const urlTest = /^https?:\/\/[^\s]+$/;
  return parts.map((part, idx) => {
    if (urlTest.test(part)) {
      return (
        <a
          key={`${keyPrefix}url-${idx}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline"
        >
          {part}
        </a>
      );
    }
    return <span key={`${keyPrefix}text-${idx}`}>{part}</span>;
  });
}

// ─── Inline formatting ────────────────────────────────────
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
                  if (valid && sources[index]) window.open(sources[index].url, "_blank");
                }}
                className="citation-btn text-[0.7em] align-super ml-0.5"
              >
                {num}
              </button>
            );
          }
          const linkKey = `${keyBase}-c${cIdx}`;
          return linkifyUrls(cPart, linkKey);
        });
      });
    });
  });
}

// ─── Tokenizer (display math only) ──────────────────────
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

// ─── Table helpers ────────────────────────────────────────
function isTableLine(line: string | undefined): line is string {
  if (!line) return false;
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.indexOf("|", 1) > 0;
}

function isTableSeparator(line: string | undefined): line is string {
  if (!line) return false;
  return /^\|[\s:-]+\|(?:\s*[\s:-]+\s*\|)*$/.test(line.trim());
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

// ─── Enhanced segment extraction ──────────────────────────
type Segment =
  | { type: "code"; language: string; content: string }
  | { type: "svg"; content: string }
  | { type: "mermaid"; content: string }
  | { type: "chart"; content: string }
  | { type: "text"; value: string };

function extractSpecialBlocks(rawText: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = rawText;

  // Helper to extract the first occurrence of a block
  const extractBlock = (openTag: string, closeTag: string, type: Segment["type"]) => {
    const openIdx = remaining.indexOf(openTag);
    if (openIdx === -1) return null;
    const closeIdx = remaining.indexOf(closeTag, openIdx + openTag.length);
    if (closeIdx === -1) return null;
    const content = remaining.slice(openIdx + openTag.length, closeIdx).trim();
    const before = remaining.slice(0, openIdx);
    const after = remaining.slice(closeIdx + closeTag.length);
    return { before, content, after };
  };

  // Loop until no more special blocks
  let loopGuard = 0;
  while (loopGuard < 1000) {
    loopGuard++;
    const svgBlock = extractBlock("<svg", "</svg>", "svg");
    const mermaidBlock = extractBlock("<MERMAID>", "</MERMAID>", "mermaid");
    const chartBlock = extractBlock("<CHART>", "</CHART>", "chart");

    // Find the earliest block
    let earliest: { type: Segment["type"]; before: string; content: string; after: string } | null = null;
    let earliestIdx = Infinity;

    if (svgBlock) {
      const idx = remaining.indexOf("<svg");
      if (idx < earliestIdx) {
        earliestIdx = idx;
        earliest = { type: "svg", ...svgBlock };
      }
    }
    if (mermaidBlock) {
      const idx = remaining.indexOf("<MERMAID>");
      if (idx < earliestIdx) {
        earliestIdx = idx;
        earliest = { type: "mermaid", ...mermaidBlock };
      }
    }
    if (chartBlock) {
      const idx = remaining.indexOf("<CHART>");
      if (idx < earliestIdx) {
        earliestIdx = idx;
        earliest = { type: "chart", ...chartBlock };
      }
    }

    if (!earliest) break;

    // Add text before the block
    if (earliest.before.trim()) {
      segments.push({ type: "text", value: earliest.before });
    }
    // Add the special block
    if (earliest.type === "code") {
        // This should not happen based on logic but for completeness
    } else {
        segments.push({ type: earliest.type, content: earliest.content } as Segment);
    }
    // Continue with the remaining text
    remaining = earliest.after;
  }

  // After extracting all special blocks, process the remaining text for code blocks and plain text
  if (remaining.trim()) {
    // Now extract standard code blocks from remaining
    const codeSegments = extractCodeBlocks(remaining);
    segments.push(...codeSegments);
  }

  return segments;
}

// ─── Original code-block extractor ────────────────────────
function extractCodeBlocks(rawText: string): Segment[] {
  const segments: Segment[] = [];
  const lines = rawText.split("\n");
  let i = 0;
  let currentText: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) { i++; continue; }
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (currentText.length > 0) {
        segments.push({ type: "text", value: currentText.join("\n") });
        currentText = [];
      }
      const lang = trimmed.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length) {
        const cLine = lines[i];
        if (cLine === undefined || cLine.trim() === "```") {
          i++;
          break;
        }
        codeLines.push(cLine);
        i++;
      }
      segments.push({ type: "code", language: lang, content: codeLines.join("\n") });
    } else {
      currentText.push(line);
      i++;
    }
  }

  if (currentText.length > 0) {
    segments.push({ type: "text", value: currentText.join("\n") });
  }

  return segments;
}

// ─── Paragraph processor ──────────────────────────────────
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
      if (line === undefined) { j++; continue; }
      const trimmed = line.trim();

      if (!trimmed) {
        j++;
        continue;
      }

      if (trimmed === "---") {
        elements.push(
          <hr
            key={`divider-${parentPrefix}-${i}-${j}`}
            className="my-8 border-t border-stone-500/60"
            style={{ borderTopWidth: "1.5px" }}
          />
        );
        j++;
        continue;
      }

      const remainingLines = lines.slice(j);
      if (
        remainingLines.length >= 3 &&
        isTableLine(remainingLines[0]) &&
        isTableSeparator(remainingLines[1]) &&
        isTableLine(remainingLines[2])
      ) {
        const header = parseTableRow(remainingLines[0]);
        let consumed = 2;
        while (
          consumed < remainingLines.length &&
          isTableLine(remainingLines[consumed])
        ) {
          consumed++;
        }
        const rows = remainingLines.slice(2, consumed).map(l => parseTableRow(l!));
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

      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (hMatch) {
        const level = hMatch[1]?.length ?? 1;
        const Tag = `h${level}` as any;
        const key = `h-${parentPrefix}-${i}-${j}`;
        elements.push(
          <Tag key={key} className="mt-3 mb-2 font-semibold tracking-tight text-foreground">
            {formatInlineText(hMatch[2] ?? "", onCitationClick, sources, key)}
          </Tag>
        );
        j++;
        continue;
      }

      if (/^[-*•]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (j < lines.length) {
          const l = lines[j];
          if (l === undefined) break;
          const t = l.trim();
          if (!/^[-*•]\s+/.test(t)) break;
          items.push(t.replace(/^[-*•]\s+/, ""));
          j++;
        }
        const key = `ul-${parentPrefix}-${i}-${j}`;
        elements.push(
          <ul key={key} className="my-2 list-disc pl-5 space-y-0.5">
            {items.map((item, itemIdx) => (
              <li key={`${key}-${itemIdx}`}>
                {formatInlineText(item, onCitationClick, sources, `${key}-${itemIdx}`)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (/^\d{1,2}\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (j < lines.length) {
          const l = lines[j];
          if (l === undefined) break;
          const t = l.trim();
          if (!/^\d{1,2}\.\s+/.test(t)) break;
          items.push(t.replace(/^\d{1,2}\.\s+/, ""));
          j++;
        }
        const key = `ol-${parentPrefix}-${i}-${j}`;
        elements.push(
          <ol key={key} className="my-2 list-decimal pl-5 space-y-0.5">
            {items.map((item, itemIdx) => (
              <li key={`${key}-${itemIdx}`}>
                {formatInlineText(item, onCitationClick, sources, `${key}-${itemIdx}`)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      let paraLines: string[] = [];
      while (j < lines.length) {
        const l = lines[j];
        if (l === undefined) break;
        const t = l.trim();
        if (!t || /^(#{1,3}\s+)/.test(t) || /^[-*•]\s+/.test(t) || /^\d{1,2}\.\s+/.test(t) || isTableLine(l)) {
          break;
        }
        paraLines.push(l);
        j++;
      }

      if (paraLines.length > 0) {
        const key = `p-${parentPrefix}-${i}-${j}`;
        const inlineNodes = paraLines.flatMap((l, lineIdx) => {
          const hasHardBreak = l.endsWith("  ");
          const content = hasHardBreak ? l.slice(0, -2) : l;
          const frag = (
            <Fragment key={`${key}-l${lineIdx}`}>
              {formatInlineText(content, onCitationClick, sources, `${key}-l${lineIdx}`)}
            </Fragment>
          );
          const result: React.ReactNode[] = [frag];
          if (hasHardBreak && lineIdx < paraLines.length - 1) {
            result.push(<br key={`${key}-br${lineIdx}`} />);
          } else if (lineIdx < paraLines.length - 1) {
            result.push(<React.Fragment key={`${key}-sp${lineIdx}`}> </React.Fragment>);
          }
          return result;
        });
        elements.push(
          <p key={key} className="mt-1 mb-2 last:mb-0">
            {inlineNodes}
          </p>
        );
      }

      if (j < lines.length) {
          const l = lines[j];
          if (l === undefined || !l.trim()) j++;
      }
    }

    if (loopGuard >= 20000) {
      console.error("Infinite loop prevented in processTextSegment");
    }
  });

  return elements;
}

// ─── Main renderer ─────────────────────────────────────────
function renderContent(
  rawText: string,
  onCitationClick: (index: number) => void,
  sources: Source[]
) {
  if (!rawText) return [];
  const segments = extractSpecialBlocks(rawText);
  const elements: React.ReactNode[] = [];

  segments.forEach((segment, segIdx) => {
    switch (segment.type) {
      case "code":
        elements.push(
          <CodeBlock
            key={`code-${segIdx}`}
            language={segment.language}
            code={segment.content}
          />
        );
        return;

      case "svg":
        elements.push(
          <div
            key={`svg-${segIdx}`}
            className="svg-renderer my-4"
            dangerouslySetInnerHTML={{ __html: segment.content }}
          />
        );
        return;

      case "mermaid":
        elements.push(
          <MermaidRenderer key={`mermaid-${segIdx}`} code={segment.content} />
        );
        return;

      case "chart":
        try {
          const chartData = JSON.parse(segment.content) as ChartData;
          elements.push(
            <ChartRenderer key={`chart-${segIdx}`} data={chartData} />
          );
        } catch (e) {
          elements.push(
            <div key={`chart-${segIdx}`} className="text-red-400 text-sm">
              Invalid chart JSON: {(e as Error).message}
            </div>
          );
        }
        return;

      case "text": {
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
        return;
      }
    }
  });

  return elements;
}

// ─── Public component (memoized) ──────────────────────────
export const MessageRenderer = React.memo(function MessageRenderer({
  content,
  onCitationClick,
  sources,
}: {
  content: string;
  onCitationClick: (index: number) => void;
  sources: Source[];
}) {
  const safeContent = content ?? "";
  const rendered = useMemo(
    () => renderContent(safeContent, onCitationClick, sources),
    [safeContent, onCitationClick, sources]
  );
  return <>{rendered}</>;
});
