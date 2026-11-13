import React, { useState, useMemo, useEffect, useRef } from "react";
import { Copy, Check, ChevronDown, Download } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import SmilesDrawer from "smiles-drawer";
import DOMPurify from "dompurify";

let mermaid: any = null;

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
export function SmilesRenderer({ smiles }: { smiles: string }) {
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

export function TikzRenderer({ code }: { code: string }) {
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

export function MusicRenderer({ code }: { code: string }) {
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
export function MermaidRenderer({ code }: { code: string }) {
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
export function CodeBlock({ language, code, onHtmlPreview }: { language: string; code: string; onHtmlPreview?: (html: string) => void }) {
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

