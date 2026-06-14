// src/components/MessageRenderer.tsx
import React, { useState, Fragment, useMemo, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Source } from "@/types";
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

// ─── LaTeX Repair Helper ──────────────────────────────────
/**
 * Advanced LaTeX Repair Engine
 * Transforms common LLM "noisy" or "dirty" LaTeX into production-grade KaTeX.
 *
 * Fixed issues:
 *  1.  \[-2pt] → \\[-2pt]           (dimension-adjusted newlines)
 *  2.  \Biggl{ → \Biggl\{           (unescaped big delimiters)
 *  3.  \substack{\\[-2pt]…} → matrix (KaTeX-safe, strips unsupported dim args)
 *  4.  \int{0} / \sum{n} / \prod{j} → \int_{0} / \sum_{n} / \prod_{j}
 *  5.  \text{lim}; → \lim
 *  6a. ^{,n} → ^{n}                 (leading comma in exponent/subscript)
 *  6b. i,n_j → i\,n_j              (comma → thin space in math)
 *  7.  \operatorname{Li}{,n} → \operatorname{Li}_{n}  (missing _ on operatorname)
 *      X{,n} → X_{n}               (general missing-_ subscript)
 *  8.  \sin! / \Gamma! / \exp! → \sin / \Gamma / \exp
 *      (function-application ! on operators, only when followed by delimiter)
 *  9.  !!!!! → \!\!\!\!\!           (noisy negative spacing)
 * 10.  bare lim/sin/… → \lim/\sin/… (missing leading backslash)
 * 11.  |{F}^2 → |_{F}^2            (Frobenius-norm subscript)
 *      ||T|| → \|T\|               (double-pipe norm)
 * 12.  ;dx → \,dx                  (semicolon before differential)
 *      -;\frac → -\frac            (semicolon as space after sign)
 *      ; before major cmds → \;
 *      ; before \\ or at end → strip
 */
function repairLatex(formula: string): string {
  if (!formula) return "";

  let s = formula

    // ── 1. Dimension-adjusted newlines: \[-2pt] → \\[-2pt] ─────────────────
    .replace(/(?<!\\)\\\[(-?\d+(?:pt|em|ex|cm|mm|in|pc|px|vh|vw|vmin|vmax))\]/g, "\\\\\[$1\]")

    // ── 2. Unescaped Big delimiters: \Biggl{ → \Biggl\{  ───────────────────
    .replace(/\\(big|Big|bigg|Bigg)(l|r)\{/g, "\\$1$2\\{")
    .replace(/\\(big|Big|bigg|Bigg)(l|r)\}/g, "\\$1$2\\}")

    // ── 3. Substack with spacing args → matrix (KaTeX-safe) ─────────────────
    //    Also strips unsupported \\[-2pt] dimension args from row breaks.
    .replace(/\\substack\{([\s\S]*?)\}/g, (_, content) => {
      if (content.includes("\\\\")) {
        const cleaned = content.replace(
          /\\\\(\[-?\d+(?:pt|em|ex|cm|mm|in|pc|px)\])/g,
          "\\\\"
        );
        return `\\begin{matrix} ${cleaned} \\end{matrix}`;
      }
      return `\\substack{${content}}`;
    })

    // ── 4. Naked subscript-less limits ──────────────────────────────────────
    //    \int{0} → \int_{0},  \sum{n} → \sum_{n},  \prod{j} → \prod_{j}
    .replace(/\\(int|oint|iint|iiint|sum|prod)\{/g, "\\$1_{")

    // ── 5. Operator text-form with stray semicolon: \text{lim}; → \lim ─────
    .replace(/\\text\{lim\}\s*;?/g, "\\lim")
    .replace(/\\lim\s*;/g, "\\lim")

    // ── 6a. Leading comma in exponent/subscript: ^{,n} → ^{n} ───────────────
    .replace(/([_^])\{,\s*/g, "$1{")

    // ── 6b. Comma used as thin space: i,n_j → i\,n_j ────────────────────────
    .replace(/([a-zA-Z0-9}])\s*,\s*([a-zA-Z\\{])/g, "$1\\, $2")

    // ── 7. Missing _ after operatorname / general X{,n} → X_{n} ─────────────
    .replace(/(\\operatorname\{[^}]+\})\{,\s*([^}]+)\}/g, "$1_{$2}")
    .replace(/([A-Za-z])\{,\s*([^}]+)\}/g, "$1_{$2}")

    // ── 8. Function-application ! on Greek letters & operators ───────────────
    //    \Gamma!\Bigl → \Gamma\Bigl  (only strip ! when followed by a delimiter)
    .replace(
      /\\(Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|det|deg|gcd|min|max|lim|sup|inf)!(?=\s*[\\({\[])/g,
      "\\$1"
    )

    // ── 9. Multiple ! → negative thin space: !!!!! → \!\!\!\!\! ─────────────
    .replace(/!{2,}/g, (m) => m.split("").map(() => "\\!").join(" "))
    // bare exp! (no backslash) → exp\!
    .replace(/(?<!\\)exp!/g, "exp\\!")

    // ── 10. Missing backslashes on bare operators ─────────────────────────────
    .replace(
      /(?<!\\)\b(lim|sin|cos|tan|log|exp|det|deg|gcd|min|max|inf|sup)\b(?=\s*[_^{(])/g,
      "\\$1"
    )

    // ── 11. Frobenius / subscript after pipe: |{F}^2 → |_{F}^2 ─────────────
    .replace(/\|\{([A-Za-z0-9]+)\}\^/g, "|_{$1}^")
    // Unescaped double-pipe norm: ||T|| → \|T\|
    .replace(/(?<!\\)\|\|/g, "\\|")

    // ── 12. Semicolons used as LaTeX spacing ──────────────────────────────────
    // ;dx → \,dx  (standard thin space before differential)
    .replace(/;\s*(d[a-zA-Z]\b)/g, "\\,$1")
    // -;expr or +;expr → just the operator  (spurious thick space after sign)
    .replace(/([-+])\s*;/g, "$1")
    // ; before major math commands → thick space \;
    .replace(
      /;\s*(\\frac|\\sum|\\prod|\\int|\\lim|\\exp|\\bigg|\\Big|\\left|\\right)/g,
      "\\; $1"
    )
    // ; immediately before LaTeX newline or at end of expression → strip
    .replace(/;(\s*\\\\|\s*$)/g, "$1");

  return s.trim();
}

// ─── Math Components ──────────────────────────────────────
export function InlineMath({ formula }: { formula: string }) {
  const html = useMemo(() => {
    const repaired = repairLatex(formula);
    try {
      return katex.renderToString(repaired, {
        throwOnError: false,
        displayMode: false,
        strict: "ignore",
      });
    } catch (e) {
      return formula;
    }
  }, [formula]);

  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="inline-math-container inline-block align-middle max-w-full overflow-x-auto overflow-y-hidden"
    />
  );
}

function DisplayMath({ formula }: { formula: string }) {
  const html = useMemo(() => {
    // 1. Remove delimiters
    let clean = formula.trim()
      .replace(/^(\\\[|\$\$)/, "").replace(/(\\\]|\$\$)$/, "");

    // 2. Repair hallucinations
    clean = repairLatex(clean);

    try {
      return katex.renderToString(clean, {
        throwOnError: false,
        displayMode: true,
        strict: "ignore",
        trust: true,
        macros: {
          "\\ce": "\\mhchem" // Fallback for chemistry if needed
        }
      });
    } catch (e) {
      console.warn("KaTeX Error:", e);
      return formula;
    }
  }, [formula]);

  return (
    <div
      className="my-4 text-center overflow-x-auto max-w-full py-2"
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
          const { svg } = await m.render("mermaid-" + Math.random().toString(36).substr(2, 9), code);
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        setError("Failed to render Mermaid diagram");
        console.error(err);
      }
    })();
  }, [code]);

  if (error) return <div className="text-red-400 text-sm">{error}</div>;
  return <div ref={ref} className="mermaid-renderer my-4 overflow-x-auto" />;
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
    <div className="code-block-wrapper group my-4">
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
        className={`overflow-auto transition-all duration-300 ${collapsed ? "max-h-0" : "max-h-[600px]"
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

// ─── Inline Formatting ────────────────────────────────────
function linkifyUrls(text: string, keyPrefix: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (part.match(/^https?:\/\/[^\s]+$/)) {
      return (
        <a
          key={`${keyPrefix}url-${idx}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={`${keyPrefix}text-${idx}`}>{part}</span>;
  });
}

function splitWithDelimiters(text: string, regex: RegExp): { type: "delimiter" | "text"; value: string }[] {
  const parts: { type: "delimiter" | "text"; value: string }[] = [];
  if (typeof text !== "string") return parts;
  let lastIdx = 0;
  let match;
  const safeRegex = new RegExp(regex.source, regex.flags);
  while ((match = safeRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "text", value: text.slice(lastIdx, match.index) });
    }
    parts.push({ type: "delimiter", value: match[0] });
    lastIdx = match.index + match[0].length;
    if (!safeRegex.global) break;
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
  if (typeof text !== "string") return [];

  // Prioritized regex for all inline tokens. 
  // Note: Negative lookahead (?!...) prevents misidentifying dimensions like [-2pt] as math blocks.
  const inlineRegex = /(\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\3\}|`[^`]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*(?!\*)[\s\S]+?\*|_(?!_)[\s\S]+?_|\\\(.+?\\\)|\\\[.+?\\\]|\$.+?\$|\[\d+\])/g;
  const parts = splitWithDelimiters(text, inlineRegex);

  return parts.flatMap((part, partIdx) => {
    const key = `${parentKey}-p${partIdx}`;
    if (part.type === "text") return linkifyUrls(part.value, key);

    const val = part.value;
    // 1. Display Math & Environments
    if (val.startsWith("\\begin{") || val.startsWith("$$") || (val.startsWith("\\[") && val.length > 10)) {
      return <DisplayMath key={key} formula={val} />;
    }

    // 2. Inline Code
    if (val.startsWith("`")) return <code key={key} className="inline-code">{val.slice(1, -1)}</code>;

    // 3. Bold
    if (val.startsWith("**") || val.startsWith("__")) {
      return <strong key={key} className="font-bold text-[var(--text-primary)]">{formatInlineText(val.slice(2, -2), onCitationClick, sources, key)}</strong>;
    }

    // 4. Italics
    if (val.startsWith("*") || val.startsWith("_")) {
      return <em key={key} className="italic">{formatInlineText(val.slice(1, -1), onCitationClick, sources, key)}</em>;
    }

    // 5. Inline Math
    if (val.startsWith("$") || val.startsWith("\\(")) {
      const inner = val.replace(/^(\$|\\\()/, "").replace(/(\$|\\\))$/, "");
      return <InlineMath key={key} formula={inner} />;
    }

    // 6. Citations
    const cMatch = val.match(/^\[(\d+)\]$/);
    if (cMatch) {
      const num = Number(cMatch[1]);
      const idx = num - 1;
      return (
        <button key={key} onClick={() => { onCitationClick(idx); if (sources[idx]?.url) window.open(sources[idx].url, "_blank"); }} className="citation-btn text-[0.7em] align-super ml-0.5">
          {num}
        </button>
      );
    }

    return <span key={key}>{val}</span>;
  });
}

// ─── Block Parsers ────────────────────────────────────────
function stripJsonComments(raw: string): string {
  return raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function parseTable(lines: string[], startIndex: number) {
  const rows: string[][] = [];
  let i = startIndex;
  const isTableLine = (l: string | undefined) => l?.trim().startsWith("|") && l?.trim().endsWith("|");

  while (i < lines.length && isTableLine(lines[i])) {
    const line = lines[i]!.trim();
    const row = line.slice(1, -1).split("|").map(c => c.trim());
    // Skip separator lines like |---|
    if (!row.every(c => c.match(/^[:\s-]+$/))) {
      rows.push(row);
    }
    i++;
  }
  return { rows, nextIndex: i };
}

function parseList(lines: string[], startIndex: number) {
  const items: { level: number; text: string; type: "ol" | "ul" }[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.match(/^(\s*)([-*•]|\d+\.)\s+(.+)$/);
    if (!match) break;

    items.push({
      level: match[1]!.length,
      text: match[3]!,
      type: match[2]!.match(/\d/) ? "ol" : "ul"
    });
    i++;
  }
  return { items, nextIndex: i };
}

function renderList(items: any[], onCitationClick: any, sources: Source[], parentKey: string) {
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    const ListTag = item.type === "ol" ? "ol" : "ul";
    const currentLevel = item.level;

    // Find nested children
    const nested: any[] = [];
    let j = i + 1;
    while (j < items.length && items[j].level > currentLevel) {
      nested.push(items[j]);
      j++;
    }

    result.push(
      <ListTag key={`${parentKey}-${i}`} className={`${item.type === "ol" ? "list-decimal" : "list-disc"} pl-6 my-2 space-y-1`}>
        <li className="pl-1">
          {formatInlineText(item.text, onCitationClick, sources, `${parentKey}-li-${i}`)}
          {nested.length > 0 && renderList(nested, onCitationClick, sources, `${parentKey}-nested-${i}`)}
        </li>
      </ListTag>
    );
    i = j;
  }
  return result;
}

// ─── Plain Block Processor (Headers, Tables, Lists, Paragraphs) ───
function renderPlainBlocks(text: string, onCitationClick: any, sources: Source[], parentIdx: number) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // 1. Headers
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1]!.length;
      const Tag = `h${level}` as any;
      elements.push(<Tag key={`h-${parentIdx}-${i}`} className="font-bold text-foreground mt-6 mb-2 tracking-tight">{formatInlineText(hMatch[2]!, onCitationClick, sources, `h-${parentIdx}-${i}`)}</Tag>);
      i++;
      continue;
    }

    // 2. Tables
    if (trimmed.startsWith("|")) {
      const { rows, nextIndex } = parseTable(lines, i);
      if (rows.length > 1) {
        elements.push(
          <div key={`tab-${parentIdx}-${i}`} className="my-6 overflow-x-auto border border-white/10 rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5 text-left">
                <tr>
                  {rows[0]!.map((cell, ci) => (
                    <th key={ci} className="px-4 py-3 font-semibold">{formatInlineText(cell, onCitationClick, sources, `th-${parentIdx}-${i}-${ci}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} className="hover:bg-white/[0.02] transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-3 text-muted-foreground">{formatInlineText(cell, onCitationClick, sources, `td-${parentIdx}-${i}-${ri}-${ci}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = nextIndex;
        continue;
      }
    }

    // 3. Lists
    if (trimmed.match(/^([-*•]|\d+\.)\s+/)) {
      const { items, nextIndex } = parseList(lines, i);
      elements.push(<div key={`lst-${parentIdx}-${i}`}>{renderList(items, onCitationClick, sources, `lst-${parentIdx}-${i}`)}</div>);
      i = nextIndex;
      continue;
    }

    // 4. Dividers
    if (trimmed === "---") {
      elements.push(<hr key={`hr-${parentIdx}-${i}`} className="my-8 border-white/10" />);
      i++;
      continue;
    }

    // 5. Paragraphs
    elements.push(
      <p key={`p-${parentIdx}-${i}`} className="leading-relaxed mb-4 last:mb-0 text-[15px] text-foreground/90">
        {formatInlineText(line, onCitationClick, sources, `p-${parentIdx}-${i}`)}
      </p>
    );
    i++;
  }
  return elements;
}

// ─── Main Block Orchestrator ──────────────────────────────
function renderBlocks(text: string, onCitationClick: any, sources: Source[]) {
  if (typeof text !== "string") return [];

  // Identify indestructible blocks globally first
  // Note: Negative lookahead (?!-?\d+pt) protects \[ dimensions from being treated as math blocks
  const indestructibleRegex = /(<(CHART|MERMAID|svg)(?:\s+[^>]*)?>[\s\S]*?<\/\2>|```[a-z]*[\s\S]*?```|\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\3\}|\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\])/gi;

  const parts = splitWithDelimiters(text, indestructibleRegex);

  return parts.flatMap((part, pi) => {
    if (part.type === "delimiter") {
      const val = part.value;

      // Handle Custom Tags
      const tagMatch = val.match(/<(CHART|MERMAID|svg)/i);
      if (tagMatch) {
        const tag = tagMatch[1]!.toUpperCase();
        const content = val.replace(/<[^>]+>/i, "").replace(/<\/[^>]+>$/i, "").trim();
        if (tag === "CHART") {
          try {
            return <ChartRenderer key={pi} data={JSON.parse(stripJsonComments(content))} />;
          } catch {
            return <div key={pi} className="text-red-400 text-xs my-2">Invalid Chart JSON</div>;
          }
        }
        if (tag === "MERMAID") return <MermaidRenderer key={pi} code={content} />;
        return <div key={pi} className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: val }} />;
      }

      // Handle Code Blocks
      if (val.startsWith("```")) {
        const match = val.match(/^```([a-z]*)\n?([\s\S]*?)\n?```$/i);
        return <CodeBlock key={pi} language={match?.[1] || "text"} code={match?.[2] || ""} />;
      }

      // Handle LaTeX Blocks
      if (val.startsWith("\\begin{") || val.startsWith("$$") || (val.startsWith("\\[") && val.length > 10)) {
        return <DisplayMath key={pi} formula={val} />;
      }

      return <span key={pi}>{val}</span>;
    } else {
      // Process everything else (headers, tables, lists, paragraphs)
      return renderPlainBlocks(part.value, onCitationClick, sources, pi);
    }
  });
}

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
  const blocks = useMemo(() => renderBlocks(safeContent, onCitationClick, sources), [safeContent, onCitationClick, sources]);
  return <div className="markdown-body space-y-1">{blocks}</div>;
});