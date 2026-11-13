// src/components/MessageRenderer.tsx
//
// KaTeX-primary math renderer with raw LaTeX fallback.
//
// - KaTeX renders ~98% of common LaTeX (matrices, aligned, cases, fractions,
//   accents, mhchem, integrals, \begin{align*}, \begin{aligned}, etc.).
// - ~70 custom macros defined for operators models commonly use without
//   declaration (\R, \tr, \argmax, \Span, \rank, \diag, etc.).
// - repairLatex() surgically fixes common model hallucination patterns:
//   \big{ → \bigl\{ , \int{x} → \int_{x}, \text{lim} → \lim, etc.
// - If KaTeX still fails, the raw LaTeX is shown inline in a styled monospace
//   block — no CDN dependency, no network fallback.
//
// Unicode math (∮∯∰⨌⨝ℵ₀ℝℂℱ… and the entire Mathematical Alphanumeric Symbols
// block U+1D400–U+1D7FF) is mapped to native LaTeX commands before rendering.

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown, Download } from "lucide-react";
import katex from "katex";
import { InlineMath, DisplayMath } from "./MathRenderer";

let mermaid: any = null;
import "katex/dist/katex.min.css";

import type { Source } from "../../types";
import { getDomain, fixMalformedTags } from "../../lib/chat-utils";
import { ChartRenderer, type ChartData } from "../content/ChartBlock";
import { LiveWidget } from "./LiveWidget";
import SmilesDrawer from "smiles-drawer";
import DOMPurify from "dompurify";

// ─── Common KaTeX macros ─────────────────────────────────
const loadMermaid = async () => {
  if (!mermaid) {
    try {
      const mod = await import("mermaid");
      mermaid = mod.default || mod;
      if (mermaid && typeof mermaid.initialize === "function") {
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
        mermaid.parseError = () => {};
      }
      if ((mermaid as any).logger) {
        (mermaid as any).logger.warn = () => {};
        (mermaid as any).logger.error = () => {};
      }
    } catch (e) { console.error("Mermaid load error:", e); }
  }
  return mermaid;
};

// ─── SMILES / Molecular Structure Renderer ──────────────
function SmilesRenderer({ smiles }: { smiles: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "rendered" | "error">("loading");
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('light')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('light'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current || !smiles) return;
    setState("loading");

    try {
      const clean = SmilesDrawer.clean(smiles);
      if (!clean) { setState("error"); return; }

      const drawer = new SmilesDrawer.Drawer({
        width: 400,
        height: 300,
        padding: 20,
      });

      SmilesDrawer.parse(clean, (tree: any) => {
        if (!ref.current) return;
        const theme = isLight ? "light" : "dark";
        drawer.draw(tree, ref.current, theme, false);
        setState("rendered");
      }, (err: any) => {
        console.error("SMILES parse error:", err);
        setState("error");
      });
    } catch (e) {
      console.error("SMILES render error:", e);
      setState("error");
    }
  }, [smiles, isLight]);

  if (state === "error") {
    return (
      <div className="my-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-medium text-amber-400 mb-1">⚠ Could not render molecular structure</p>
        <p className="text-[11px] text-foreground/60 mb-1">Invalid or unsupported SMILES string.</p>
        <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap">{smiles}</pre>
      </div>
    );
  }

  return (
    <div className="my-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">SMILES</span>
      </div>
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <svg className="animate-spin size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
          <span className="text-xs">Rendering SMILES structure...</span>
        </div>
      )}
      <div ref={ref} className="flex justify-center" style={{ minHeight: 80 }} />
    </div>
  );
}

// ─── TikZ Renderer ───────────────────────────────────────
let tikzPromise: Promise<boolean> | null = null;

function loadTikzjax(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).__tikzjaxLoaded) return Promise.resolve(true);
  if (tikzPromise) return tikzPromise;

  tikzPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/tikzjax@latest/dist/fonts.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);

    const script = document.createElement("script");
    const isDark = document.documentElement.classList.contains("dark");
    const theme = isDark ? "dark" : "light";
    const styles = [
      "body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }",
      `svg text { fill: ${isDark ? "#d4d1cb" : "#1a1a1a"}; }`,
      `svg .TikZGraphic path:not([fill]), svg .TikZGraphic line { stroke: ${isDark ? "#d4d1cb" : "#1a1a1a"}; }`,
    ].join("");
    script.textContent = `document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(styles)};document.head.appendChild(s)});`;
    document.head.appendChild(script);

    const mainScript = document.createElement("script");
    mainScript.src = "https://cdn.jsdelivr.net/npm/tikzjax@latest/dist/tikzjax.js";
    mainScript.crossOrigin = "anonymous";
    mainScript.onload = () => {
      (window as any).__tikzjaxLoaded = true;
      resolve(true);
    };
    mainScript.onerror = () => {
      console.error("Failed to load TikZJax from CDN");
      resolve(false);
    };
    document.head.appendChild(mainScript);
  });

  return tikzPromise;
}

function TikzRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "rendered" | "error">("loading");
  const renderedRef = useRef(false);

  useEffect(() => {
    if (!ref.current || !code || renderedRef.current) return;
    renderedRef.current = true;
    setState("loading");

    (async () => {
      const loaded = await loadTikzjax();
      if (!ref.current) return;
      if (!loaded) { setState("error"); return; }

      const script = document.createElement("script");
      script.type = "text/tikz";
      script.textContent = code;
      ref.current.appendChild(script);

      // tikzjax auto-renders all <script type="text/tikz"> on load,
      // but if it loaded before us we need to trigger render
      const tz = (window as any).tikzjax;
      if (tz && typeof tz.render === "function") {
        try {
          tz.render();
          // tikzjax renders async — wait a frame then check
          requestAnimationFrame(() => {
            if (ref.current) setState("rendered");
          });
        } catch (e) {
          console.error("TikZJax render error:", e);
          setState("error");
        }
      } else {
        // Wait for tikzjax to auto-discover our script
        const check = setInterval(() => {
          if (ref.current && ref.current.querySelector("svg")) {
            clearInterval(check);
            setState("rendered");
          }
        }, 100);
        setTimeout(() => { clearInterval(check); if (ref.current && !ref.current.querySelector("svg")) setState("error"); }, 8000);
      }
    })();
  }, [code]);

  if (state === "error") {
    return (
      <div className="my-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
        <p className="text-xs font-medium text-amber-400 mb-1">⚠ TikZ render failed</p>
        <p className="text-[11px] text-foreground/60 mb-2">Could not render TikZ diagram. Make sure <code className="inline-code">tikzjax</code> loaded correctly.</p>
        <details className="text-left">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Show TeX source</summary>
          <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap mt-2 p-2 rounded bg-black/10 dark:bg-white/5">{code}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="tikz-renderer my-4">
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <svg className="animate-spin size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
          <span className="text-xs">Rendering TikZ diagram...</span>
        </div>
      )}
      <div ref={ref} className="flex justify-center overflow-x-auto" style={{ opacity: state === "rendered" ? 1 : 0 }} />
    </div>
  );
}

// ─── Music Notation Renderer (uses abcjs for ABC notation, NOT LilyPond) ──
// NOTE: This renders ABC notation (https://abcnotation.com), not LilyPond.
// LilyPond → web requires server-side compilation; abcjs is used as a portable
// client-side alternative that handles the common use case.
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

function MusicRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    (async () => {
      if (ref.current && code) {
        try {
          const lib = await loadAbcjs();
          if (lib && typeof lib.renderAbc === "function") {
            ref.current.innerHTML = "";
            lib.renderAbc(ref.current, code, {
              responsive: "resize",
              theme: "dark",
              paddingtop: 0, paddingbottom: 0, paddingright: 0, paddingleft: 0,
            });
          }
        } catch (e) {
          console.error("abcjs render error:", e);
          setError("Failed to render ABC notation");
        }
      }
    })();
  }, [code]);
  if (error) {
    return (
      <div className="my-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-medium text-amber-400 mb-1">⚠ Music render error</p>
        <p className="text-[11px] text-foreground/60">{error}</p>
        <pre className="text-[11px] font-mono text-foreground/50 mt-2 whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }
  return (
    <div className="my-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">ABC notation</span>
      </div>
      <div ref={ref} className="bg-white/5 rounded-lg p-4 overflow-x-auto" />
    </div>
  );
}

// ─── Mermaid Renderer ────────────────────────────────────
function MermaidRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);
  useEffect(() => {
    attemptedRef.current = false;
    let cancelled = false;
    (async () => {
      const m = await loadMermaid();
      if (!ref.current || !m || cancelled) return;
      attemptedRef.current = true;
      try {
        if (typeof (m as any).parse === "function") {
          try { (m as any).parse(code); } catch { return; }
        }
        const id = "mermaid-" + Math.random().toString(36).substr(2, 9);
        const { svg } = await m.render(id, code);
        if (!cancelled) { ref.current.innerHTML = svg; setError(null); }
      } catch {
        if (!cancelled) setError("Failed to render Mermaid");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  if (error) return <p className="text-red-400 text-sm my-2">{error}</p>;
  return <div ref={ref} className="mermaid-renderer my-4 overflow-x-auto" />;
}

// ─── Code Block ──────────────────────────────────────────
function CodeBlock({ language, code, onHtmlPreview }: { language: string; code: string; onHtmlPreview?: (html: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('light')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('light'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHtml = language === "html";
  const syntaxTheme = isLight ? oneLight : vscDarkPlus;
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
        <div className="flex items-center gap-1.5">
          {isHtml && onHtmlPreview && (
            <button
              onClick={() => onHtmlPreview(code)}
              className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Run HTML preview"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Preview
            </button>
          )}
          <button onClick={handleCopy} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div className={`overflow-auto transition-all duration-300 ${collapsed ? "max-h-0" : "max-h-[800px]"}`}>
        <SyntaxHighlighter
          language={language || "text"}
          style={syntaxTheme}
          customStyle={{ margin: 0, borderRadius: "0", background: "transparent", padding: "0.75rem", overflowX: "auto" }}
          codeTagProps={{ style: { fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem" } }}
        >{code}</SyntaxHighlighter>
      </div>
    </div>
  );
}

// ─── Inline Formatting ───────────────────────────────────
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

// ── Note: [a-zA-Z*]+ (was [a-z*]+) so that \begin{CD}, \begin{Bmatrix}, etc. match ──
const INLINE_DELIM_REGEX = /(\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})|`[^`]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*(?!\*)[\s\S]+?\*|_(?!_)[\s\S]+?_|\\\(.+?\\\)|\\\[.+?\\\]|\$(?!-?\d[\d.,%]*\$).+?\$|\[\d+\])/g;

function CitationHoverCard({ url, content, children }: { url: string; content?: string; children: React.ReactNode }) {
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

function formatInlineText(text: string, onCitationClick: any, sources: Source[], parentKey: string): React.ReactNode[] {
  if (typeof text !== "string") return [];
  return splitWithDelimiters(text, INLINE_DELIM_REGEX).flatMap((part, partIdx) => {
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
      const name = sources[idx]?.url ? getDomain(sources[idx].url) : `[${num}]`;
      const url = sources[idx]?.url;
      return <CitationHoverCard key={key} url={url || ''} content={sources[idx]?.content}><button onClick={() => { onCitationClick(idx); if (url) window.open(url, "_blank"); }} className="citation-btn text-[0.7em] align-super ml-0.5">{name}</button></CitationHoverCard>;
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

function downloadTableAsCsv(rows: string[][], tableIndex: number) {
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

function parseList(lines: string[], startIndex: number) {
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

function renderList(items: any[], onCitationClick: any, sources: Source[], parentKey: string) {
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const baseLevel = item.level;
    const listType = item.type;
    const ListTag = listType === "ol" ? "ol" : "ul";

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
        const tblIdx = elements.length;
        elements.push(
          <div key={`tab-${parentIdx}-${i}`} className="group my-4 overflow-x-auto relative">
            <table className="min-w-full text-sm">
              <thead className="text-left border-b border-white/25"><tr>{rows[0]!.map((cell, ci) => (<th key={ci} className="px-4 py-3 font-semibold text-foreground text-sm">{formatInlineText(cell, onCitationClick, sources, `th-${parentIdx}-${i}-${ci}`)}</th>))}</tr></thead>
              <tbody className="divide-y divide-white/30">{rows.slice(1).map((row, ri) => (<tr key={ri} className="hover:bg-white/[0.03] transition-colors">{row.map((cell, ci) => (<td key={ci} className="px-4 py-2.5 text-foreground/90 text-sm">{formatInlineText(cell, onCitationClick, sources, `td-${parentIdx}-${i}-${ri}-${ci}`)}</td>))}</tr>))}</tbody>
            </table>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1 right-1">
              <button
                title="Export as CSV"
                onClick={() => downloadTableAsCsv(rows, tblIdx)}
                className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
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

// ── XyMatrix standalone detection ─────────────────────────
// \xymatrix{...} doesn't use \begin/\end, so it won't be caught by BLOCK_DELIM_REGEX.
// We wrap it in \[...\] so it routes to DisplayMath / MathJax.
function extractXymatrixBlocks(text: string): string {
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

function maskCode(text: string, store: string[]): string {
  // Only match single-backtick spans, not triple-backtick fences
  return text.replace(/(?<!``)`[^`]+`(?!`)/g, (m) => {
    const idx = store.length;
    store.push(m);
    return `${CODE_MASK}${idx}${CODE_MASK_END}`;
  });
}
function restoreCode(text: string, store: string[]): string {
  return text.replace(new RegExp(`${CODE_MASK}(\\d+)${CODE_MASK_END}`, 'g'), (_, idx) => store[+idx] ?? '');
}

// ── Block regex: \3 backreference ensures \begin{CD} only matches \end{CD} ──
const BLOCK_DELIM_REGEX = /(<(?:CHART|MERMAID|LIVE|svg|TIKZ|LILYPOND|MUSIC|ABC|CHEMICAL|SMILES|MOL)(?:\s+[^>]*)?>[\s\S]*?<\/(?:CHART|MERMAID|LIVE|svg|TIKZ|LILYPOND|MUSIC|ABC|CHEMICAL|SMILES|MOL)>|```[a-z]*[\s\S]*?```|(?<=\n|^)\s*\$\$[\s\S]*?\s*\$\$(?=\s*$|\n)|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\2\})/gim;

function renderBlocks(text: string, onCitationClick: any, sources: Source[], onHtmlPreview?: (html: string) => void) {
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

export const MessageRenderer = React.memo(function MessageRenderer({
  content,
  onCitationClick,
  sources,
  onHtmlPreview,
}: {
  content: string;
  onCitationClick: (index: number) => void;
  sources: Source[];
  onHtmlPreview?: (html: string) => void;
}) {
  const safeContent = content ?? "";
  const blocks = useMemo(() => renderBlocks(safeContent, onCitationClick, sources, onHtmlPreview), [safeContent, onCitationClick, sources, onHtmlPreview]);
  return <div className="markdown-body space-y-1">{blocks}</div>;
});
