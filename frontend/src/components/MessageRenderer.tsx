// src/components/MessageRenderer.tsx
import React, { useState, Fragment, useMemo, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";

// Assign KaTeX to window because mhchem and other extensions often expect it globally
if (typeof window !== "undefined") {
  const kt = (katex as any).default || katex;
  if (kt) { (window as any).katex = kt; }
}

// Side-effect import for mhchem
try {
  import("katex/dist/contrib/mhchem.min.js").catch(() => {});
} catch (e) {}

import type { Source } from "../types";
import { ChartRenderer, type ChartData } from "./ChartBlock";

// ─── Lazy load mermaid ─────────────────────────────────────
let mermaid: any = null;
const loadMermaid = async () => {
  if (!mermaid) {
    try {
      const mod = await import("mermaid");
      mermaid = mod.default || mod;
      if (mermaid && typeof mermaid.initialize === "function") {
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
      }
    } catch (e) { console.error("Mermaid load error:", e); }
  }
  return mermaid;
};

// ─── TikZ Renderer ─────────────────────────────────────────
function TikzRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    if (ref.current && !rendered && code) {
      const script = document.createElement("script");
      script.type = "text/tikz";
      script.textContent = code;
      ref.current.appendChild(script);
      const tz = (window as any).tikzjax;
      if (tz && typeof tz.render === "function") {
        try { tz.render(); } catch (e) { console.error("TikZJax render error:", e); }
      }
      setRendered(true);
    }
  }, [code, rendered]);
  return <div ref={ref} className="tikz-renderer my-4 flex justify-center overflow-x-auto" />;
}

// ─── LilyPond/Music Renderer (using abcjs for portability) ───
let abcjs: any = null;
const loadAbcjs = async () => {
  if (!abcjs) {
    try {
      const mod = await import("abcjs/dist/abcjs-basic");
      abcjs = mod.default || mod;
    } catch (e) { console.error("abcjs load error:", e); }
  }
  return abcjs;
};

function LilyPondRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (async () => {
      if (ref.current && code) {
        try {
          const lib = await loadAbcjs();
          if (lib && typeof lib.renderAbc === "function") {
            lib.renderAbc(ref.current, code, {
              responsive: "resize",
              theme: "dark",
              paddingtop: 0,
              paddingbottom: 0,
              paddingright: 0,
              paddingleft: 0,
            });
          }
        } catch (e) { console.error("abcjs render error:", e); }
      }
    })();
  }, [code]);
  return <div ref={ref} className="lilypond-renderer my-4 bg-white/5 rounded-lg p-4 overflow-x-auto" />;
}

// ─── LaTeX Repair Helper ──────────────────────────────────
function repairLatex(formula: string): string {
  if (!formula) return "";
  let s = formula
    .replace(/(?<!\\)\\\[(-?\d+(?:pt|em|ex|cm|mm|in|pc|px|vh|vw|vmin|vmax))\]/g, "\\\\\[$1\]")
    .replace(/\\(big|Big|bigg|Bigg)(l|r)\{/g, "\\$1$2\\{")
    .replace(/\\(big|Big|bigg|Bigg)(l|r)\}/g, "\\$1$2\\}")
    .replace(/\\substack\{([\s\S]*?)\}/g, (_, content) => {
      const cleaned = content.replace(/\\\\(\[-?\d+(?:pt|em|ex|cm|mm|in|pc|px)\])/g, "\\\\");
      return `\\substack{${cleaned}}`;
    })
    .replace(/\\(int|oint|iint|iiint|sum|prod)\{/g, "\\$1_{")
    .replace(/\\text\{lim\}\s*;?/g, "\\lim")
    .replace(/\\lim\s*;/g, "\\lim")
    .replace(/([_^])\{,\s*/g, "$1{")
    .replace(/([a-zA-Z0-9}])\s*,\s*([a-zA-Z\\{])/g, "$1\\, $2")
    .replace(/(\\operatorname\{[^}]+\})\{,\s*([^}]+)\}/g, "$1_{$2}")
    .replace(/([A-Za-z])\{,\s*([^}]+)\}/g, "$1_{$2}")
    .replace(/\\(Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|det|deg|gcd|min|max|lim|sup|inf)!(?=\s*[\\({\[])/g, "\\$1")
    .replace(/!{2,}/g, (m) => m.split("").map(() => "\\!").join(" "))
    .replace(/(?<!\\)exp!/g, "exp\\!")
    .replace(/(?<!\\)\b(lim|sin|cos|tan|log|exp|det|deg|gcd|min|max|inf|sup)\b(?=\s*[_^{(])/g, "\\$1")
    .replace(/(\|)\{([A-Za-z0-9]+)\}/g, "$1_{$2}")
    .replace(/(?<!\\)\|\|/g, "\\|")
    .replace(/;\s*(d[a-zA-Z]\b)/g, "\\,$1")
    .replace(/([-+])\s*;/g, "$1")
    .replace(/;\s*(\\frac|\\sum|\\prod|\\int|\\lim|\\exp|\\bigg|\\Big|\\left|\\right)/g, "\\; $1")
    .replace(/;(\s*\\\\|\s*$)/g, "$1")
    .replace(/(?<!\\)\[(-?\d+(?:pt|em|ex|cm|mm|in|pc|px|vh|vw|vmin|vmax))\s*\]/g, "")
    // ── 15. Fix unsupported \textsc (KaTeX) ──
    // Supports 1 level of nesting: \textsc{...{...}...}
    .replace(/\\textsc\{((?:[^{}]|\{[^{}]*\})*)\}/g, "\\text{\\small $1}")
    // ── 16. Strip TeX programming hallucinations ──
    .replace(/\\(def|ifnum|fi|numexpr|relax|csname|endcsname|expandafter)/g, "")
    // ── 17. Map literal Unicode math symbols to KaTeX ──
    .replace(/∮/g, "\\oint").replace(/∬/g, "\\iint").replace(/∭/g, "\\iiint")
    .replace(/∯/g, "\\oiint").replace(/∰/g, "\\oiiint")
    .replace(/∏/g, "\\prod").replace(/∑/g, "\\sum").replace(/√/g, "\\sqrt")
    .replace(/∞/g, "\\infty").replace(/∇/g, "\\nabla").replace(/∂/g, "\\partial")
    // ── 18. Fix mathtools / mathrlap hallucinations ──
    .replace(/\\math(rlap|llap|clap)/g, "\\$1")
    // ── 19. Strip TeX programming blocks (KaTeX doesn't support) ──
    // Supports 2 levels of nesting for \def blocks
    .replace(/\\(def|newcommand|renewcommand)[\s\S]*?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g, "");
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  if (opens > closes) s += "}".repeat(opens - closes);
  else if (closes > opens) {
    for (let i = 0; i < (closes - opens); i++) s = s.replace(/\}$/, "");
  }
  return s.trim();
}

// ─── Math Components ──────────────────────────────────────
export function InlineMath({ formula }: { formula: string }) {
  const html = useMemo(() => {
    if (!formula) return "";
    const kt = (katex as any).default || katex;
    if (!kt || typeof kt.renderToString !== "function") return formula;
    try { return kt.renderToString(repairLatex(formula), { throwOnError: false, displayMode: false, strict: "ignore" }); }
    catch (e) { return formula; }
  }, [formula]);
  return <span dangerouslySetInnerHTML={{ __html: html }} className="inline-math-container inline-block align-middle max-w-full overflow-x-auto overflow-y-hidden" />;
}

function DisplayMath({ formula }: { formula: string }) {
  const html = useMemo(() => {
    if (!formula) return "";
    const kt = (katex as any).default || katex;
    if (!kt || typeof kt.renderToString !== "function") return formula;
    let clean = formula.trim().replace(/^(\\\[|\$\$)/, "").replace(/(\\\]|\$\$)$/, "");
    try { return kt.renderToString(repairLatex(clean), { throwOnError: false, displayMode: true, strict: "ignore", trust: true, macros: { "\\ce": "\\mhchem" } }); }
    catch (e) { return formula; }
  }, [formula]);
  return <div className="my-4 text-center overflow-x-auto max-w-full py-2" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Mermaid Renderer ──────────────────────────────────────
function MermaidRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const m = await loadMermaid();
        if (ref.current && m) {
          ref.current.innerHTML = "";
          const { svg } = await m.render("mermaid-" + Math.random().toString(36).substr(2, 9), code);
          ref.current.innerHTML = svg;
        }
      } catch (err) { setError("Failed to render Mermaid"); }
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
  return (
    <div className="code-block-wrapper group my-4">
      <div className="code-block-header">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-black/20 dark:bg-white/10 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{language || "text"}</span>
          {code.split("\n").length > 20 && (
            <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ChevronDown className={`size-3 transition-transform ${collapsed ? "" : "rotate-180"}`} />
              {collapsed ? "Expand" : "Collapse"}
            </button>
          )}
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-white">
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className={`overflow-auto transition-all duration-300 ${collapsed ? "max-h-0" : "max-h-[600px]"}`}>
        <SyntaxHighlighter language={language || "text"} style={vscDarkPlus} customStyle={{ margin: 0, borderRadius: "0", background: "transparent", padding: "0.75rem", overflowX: "auto" }} codeTagProps={{ style: { fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem" } }}>{code}</SyntaxHighlighter>
      </div>
    </div>
  );
}

// ─── Inline Formatting ────────────────────────────────────
function linkifyUrls(text: string, keyPrefix: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, idx) => {
    if (part.match(/^https?:\/\/[^\s]+$/)) {
      return <a key={`${keyPrefix}url-${idx}`} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline break-all">{part}</a>;
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
    if (match.index > lastIdx) parts.push({ type: "text", value: text.slice(lastIdx, match.index) });
    parts.push({ type: "delimiter", value: match[0] });
    lastIdx = match.index + match[0].length;
    if (!safeRegex.global) break;
  }
  if (lastIdx < text.length) parts.push({ type: "text", value: text.slice(lastIdx) });
  return parts;
}

function formatInlineText(text: string, onCitationClick: any, sources: Source[], parentKey: string): React.ReactNode[] {
  if (typeof text !== "string") return [];
  const inlineRegex = /(\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|(\\begin\{[a-z*]+\}[\s\S]*?\\end\{[a-z*]+\})|`[^`]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*(?!\*)[\s\S]+?\*|_(?!_)[\s\S]+?_|\\\(.+?\\\)|\\\[.+?\\\]|\$.+?\$|\[\d+\])/g;
  return splitWithDelimiters(text, inlineRegex).flatMap((part, partIdx) => {
    const key = `${parentKey}-p${partIdx}`;
    if (part.type === "text") return linkifyUrls(part.value, key);
    const val = part.value;
    if (val.startsWith("\\begin{") || val.startsWith("$$") || (val.startsWith("\\[") && val.length > 10)) return <DisplayMath key={key} formula={val} />;
    if (val.startsWith("`")) return <code key={key} className="inline-code">{val.slice(1, -1)}</code>;
    if (val.startsWith("**") || val.startsWith("__")) return <strong key={key} className="font-bold text-[var(--text-primary)]">{formatInlineText(val.slice(2, -2), onCitationClick, sources, key)}</strong>;
    if (val.startsWith("*") || val.startsWith("_")) return <em key={key} className="italic">{formatInlineText(val.slice(1, -1), onCitationClick, sources, key)}</em>;
    if (val.startsWith("$") || val.startsWith("\\(")) {
      const inner = val.replace(/^(\$|\\\()/, "").replace(/(\$|\\\))$/, "");
      return <InlineMath key={key} formula={inner} />;
    }
    const cMatch = val.match(/^\[(\d+)\]$/);
    if (cMatch) {
      const num = Number(cMatch[1]);
      const idx = num - 1;
      return <button key={key} onClick={() => { onCitationClick(idx); if (sources[idx]?.url) window.open(sources[idx].url, "_blank"); }} className="citation-btn text-[0.7em] align-super ml-0.5">{num}</button>;
    }
    return <span key={key}>{val}</span>;
  });
}

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function parseTable(lines: string[], startIndex: number) {
  const rows: string[][] = [];
  let i = startIndex;
  while (i < lines.length && lines[i]?.trim().startsWith("|") && lines[i]?.trim().endsWith("|")) {
    const row = lines[i]!.trim().slice(1, -1).split("|").map(c => c.trim());
    if (!row.every(c => c.match(/^[:\s-]+$/))) rows.push(row);
    i++;
  }
  return { rows, nextIndex: i };
}

function parseList(lines: string[], startIndex: number) {
  const items: { level: number; text: string; type: "ol" | "ul" }[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const match = lines[i]!.match(/^(\s*)([-*•]|\d+\.)\s+(.+)$/);
    if (!match) break;
    items.push({ level: match[1]!.length, text: match[3]!, type: match[2]!.match(/\d/) ? "ol" : "ul" });
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
    const nested: any[] = [];
    let j = i + 1;
    while (j < items.length && items[j].level > item.level) { nested.push(items[j]); j++; }
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

function renderPlainBlocks(text: string, onCitationClick: any, sources: Source[], parentIdx: number) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const Tag = `h${hMatch[1]!.length}` as any;
      elements.push(<Tag key={`h-${parentIdx}-${i}`} className="font-bold text-foreground mt-6 mb-2 tracking-tight">{formatInlineText(hMatch[2]!, onCitationClick, sources, `h-${parentIdx}-${i}`)}</Tag>);
      i++; continue;
    }
    if (trimmed.startsWith("|")) {
      const { rows, nextIndex } = parseTable(lines, i);
      if (rows.length > 1) {
        elements.push(
          <div key={`tab-${parentIdx}-${i}`} className="my-6 overflow-x-auto border border-white/10 rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5 text-left"><tr>{rows[0]!.map((cell, ci) => (<th key={ci} className="px-4 py-3 font-semibold">{formatInlineText(cell, onCitationClick, sources, `th-${parentIdx}-${i}-${ci}`)}</th>))}</tr></thead>
              <tbody className="divide-y divide-white/5">{rows.slice(1).map((row, ri) => (<tr key={ri} className="hover:bg-white/[0.02] transition-colors">{row.map((cell, ci) => (<td key={ci} className="px-4 py-3 text-muted-foreground">{formatInlineText(cell, onCitationClick, sources, `td-${parentIdx}-${i}-${ri}-${ci}`)}</td>))}</tr>))}</tbody>
            </table>
          </div>
        );
        i = nextIndex; continue;
      }
    }
    if (trimmed.match(/^([-*•]|\d+\.)\s+/)) {
      const { items, nextIndex } = parseList(lines, i);
      elements.push(<div key={`lst-${parentIdx}-${i}`}>{renderList(items, onCitationClick, sources, `lst-${parentIdx}-${i}`)}</div>);
      i = nextIndex; continue;
    }
    if (trimmed === "---") {
      elements.push(<hr key={`hr-${parentIdx}-${i}`} className="my-8 border-white/10" />);
      i++; continue;
    }
    elements.push(<p key={`p-${parentIdx}-${i}`} className="leading-relaxed mb-4 last:mb-0 text-[15px] text-foreground/90">{formatInlineText(line, onCitationClick, sources, `p-${parentIdx}-${i}`)}</p>);
    i++;
  }
  return elements;
}

function renderBlocks(text: string, onCitationClick: any, sources: Source[]) {
  if (typeof text !== "string") return [];
  const indestructibleRegex = /(<(CHART|MERMAID|svg|TIKZ|LILYPOND|CHEMICAL)(?:\s+[^>]*)?>[\s\S]*?<\/(?:CHART|MERMAID|svg|TIKZ|LILYPOND|CHEMICAL)>|```[a-z]*[\s\S]*?```|\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|\\begin\{([a-z*]+)\}[\s\S]*?\\end\{[a-z*]+\})/gi;
  return splitWithDelimiters(text, indestructibleRegex).flatMap((part, pi) => {
    if (part.type === "delimiter") {
      const val = part.value;
      const tagMatch = val.match(/<(CHART|MERMAID|svg|TIKZ|LILYPOND|CHEMICAL)/i);
      if (tagMatch) {
        const tag = tagMatch[1]!.toUpperCase();
        const content = val.replace(/<[^>]+>/i, "").replace(/<\/[^>]+>$/i, "").trim();
        if (tag === "CHART") {
          try {
            const data = JSON.parse(stripJsonComments(content));
            if (data && typeof data === "object") return <ChartRenderer key={pi} data={data} />;
            return <div key={pi} className="text-red-400 text-xs my-2">Invalid Chart Data</div>;
          } catch { return <div key={pi} className="text-red-400 text-xs my-2">Invalid Chart JSON</div>; }
        }
        if (tag === "MERMAID") return <MermaidRenderer key={pi} code={content} />;
        if (tag === "TIKZ") return <TikzRenderer key={pi} code={content} />;
        if (tag === "LILYPOND") return <LilyPondRenderer key={pi} code={content} />;
        if (tag === "CHEMICAL") return <DisplayMath key={pi} formula={`\\ce{${content}}`} />;
        return <div key={pi} className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: val }} />;
      }
      if (val.startsWith("```")) {
        const match = val.match(/^```([a-z]*)\n?([\s\S]*?)\n?```$/i);
        return <CodeBlock key={pi} language={match?.[1] || "text"} code={match?.[2] || ""} />;
      }
      if (val.startsWith("\\begin{") || val.startsWith("$$") || (val.startsWith("\\[") && val.length > 10)) {
        return <DisplayMath key={pi} formula={val} />;
      }
      return <span key={pi}>{val}</span>;
    }
    return renderPlainBlocks(part.value, onCitationClick, sources, pi);
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
