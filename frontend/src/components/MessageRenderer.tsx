// src/components/MessageRenderer.tsx
//
// Hybrid math renderer: KaTeX-primary + MathJax-fallback.
//
// - KaTeX renders the 95% common case fast (matrices, aligned, cases, fractions,
//   accents, mhchem, substack, hypergeometric, integrals, etc.).
// - If the formula contains features KaTeX can't handle, OR if KaTeX throws a
//   parse error, we transparently fall back to MathJax v3 (loaded lazily).
//   MathJax handles: \begin{CD} commutative diagrams, \def / \newcommand /
//   \ifnum / \numexpr / \recurse macros, \Huge / \textsc / \textbf{...},
//   \DeclareMathOperator, exotic packages, and everything else.
// - If MathJax also fails, we show a clean error block with the raw source.
//
// Unicode math (∮∯∰⨌⨝ℵ₀ℝℂℱ… and the entire Mathematical Alphanumeric Symbols
// block U+1D400–U+1D7FF) is mapped to native LaTeX commands before rendering.

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ChevronDown } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";

import type { Source } from "../types";
import { ChartRenderer, type ChartData } from "./ChartBlock";

// ─── KaTeX global setup + mhchem ─────────────────────────
if (typeof window !== "undefined") {
  const kt = (katex as any).default || katex;
  if (kt) { (window as any).katex = kt; }
}

let mhchemLoaded = false;
let mhchemPromise: Promise<boolean> | null = null;

const ensureMhchem = (): Promise<boolean> => {
  if (mhchemLoaded) return Promise.resolve(true);
  if (mhchemPromise) return mhchemPromise;
  // Wrap in try/catch because dynamic import() may throw synchronously in
  // some bundler targets (e.g. Bun browser builds that inline the module).
  try {
    mhchemPromise = import("katex/dist/contrib/mhchem.min.js")
      .then(() => { mhchemLoaded = true; return true; })
      .catch((e) => { console.error("mhchem load error:", e); return false; });
  } catch (e) {
    console.error("mhchem sync import error:", e);
    mhchemPromise = Promise.resolve(false);
  }
  return mhchemPromise;
};

// ─── MathJax v3 lazy loader ──────────────────────────────
let mathjaxPromise: Promise<any> | null = null;
let mathjaxReady = false;

const loadMathJax = (): Promise<any> => {
  if (mathjaxReady && (window as any).MathJax?.startup?.promise) {
    return (window as any).MathJax.startup.promise.then(() => (window as any).MathJax);
  }
  if (mathjaxPromise) return mathjaxPromise;

  mathjaxPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(new Error("No window")); return; }

    // Configure MathJax BEFORE the script loads (MathJax reads window.MathJax on init)
    (window as any).MathJax = {
      tex: {
        inlineMath: [["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
        processEscapes: true,
        processRefs: true,
        processEnvironments: true,
        maxMaxLineSize: 10000,
        // Enable every TeX extension we might possibly need
        packages: {
          "[+]": [
            "base", "ams", "noundefined", "mhchem", "textcomp",
            "cases", "mathtools", "physics", "color", "verb",
            "bbox", "action", "enclose", "cancel", "mhchem",
            "configmacros", "tagformat", "textmacros",
          ],
        },
      },
      loader: {
        load: [
          "[tex]/ams", "[tex]/noundefined", "[tex]/mhchem", "[tex]/textcomp",
          "[tex]/cases", "[tex]/mathtools", "[tex]/physics", "[tex]/color",
          "[tex]/verb", "[tex]/bbox", "[tex]/action", "[tex]/enclose",
          "[tex]/cancel", "[tex]/configmacros", "[tex]/tagformat", "[tex]/textmacros",
        ],
      },
      options: {
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
        ignoreHtmlClass: "tex2jax_ignore",
        processHtmlClass: "tex2jax_process",
        enableMenu: true,
      },
      startup: {
        typeset: false,
        ready: () => {
          const MJ = (window as any).MathJax;
          MJ.startup.defaultReady();
          MJ.startup.promise
            .then(() => { mathjaxReady = true; resolve(MJ); })
            .catch(reject);
        },
      },
      chtml: {
        scale: 1.0,
        matchFontHeight: false,
        fontURL: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2",
      },
    };

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = (e) => {
      console.error("MathJax script load error:", e);
      reject(new Error("Failed to load MathJax from CDN"));
    };
    document.head.appendChild(script);
  });

  return mathjaxPromise;
};

// ─── Detect features KaTeX can't handle ──────────────────
// Returns true if the formula should be routed straight to MathJax.
function requiresMathJax(formula: string): boolean {
  if (!formula) return false;

  // 1. Commutative diagrams — KaTeX has no CD env at all
  if (/\\begin\s*\{CD\}/i.test(formula)) return true;

  // 2. TeX programming primitives — KaTeX refuses these
  if (/\\(def|newcommand|renewcommand|providecommand|DeclareMathOperator|DeclarePairedDelimiter)\b/.test(formula)) return true;
  if (/\\(recurse|numexpr|dimexpr|expandafter|csname|endcsname|ifnum|ifx|ifcase|iftrue|iffalse|else|fi|loop|repeat|relax|the|count|toks|input|catcode|endinput)\b/.test(formula)) return true;

  // 3. Font sizing commands — KaTeX only supports \scriptstyle / \textstyle / \displaystyle / \scriptscriptstyle
  if (/\\(Huge|huge|LARGE|Large|large|normalsize|small|footnotesize|scriptsize|tiny)\b/.test(formula)) return true;

  // 4. \textbackslash, \textexclamdown etc. that sometimes trip KaTeX — keep KaTeX, route only on failure
  // (don't preemptively route)

  // 5. \centernot, \nth root via \xleftarrow/\xrightarrow with very long content — keep KaTeX
  // (don't preemptively route)

  // 6. \overline/\underline stacks deeper than 3 — keep KaTeX
  // (don't preemptively route)

  // 7. \mathchoice, \mathop*\limits, \operatornamewithlimits — MathJax-safe, keep KaTeX
  // (don't preemptively route)

  // 8. \boxed inside \boxed inside \boxed (3+ deep) — KaTeX may struggle
  if ((formula.match(/\\boxed/g) || []).length >= 3) return true;

  // 9. \href inside math — MathJax handles better
  if (/\\href\s*\{/.test(formula)) return true;

  // 10. Explicit \require{...} — MathJax-only feature
  if (/\\require\s*\{/.test(formula)) return true;

  return false;
}

// ─── MathJax Renderer ────────────────────────────────────
function MathJaxRenderer({ formula, display }: { formula: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"loading" | "rendered" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const cleanFormula = useMemo(() => {
    return (formula || "")
      .trim()
      .replace(/^\$\$/, "")
      .replace(/\$\$$/, "")
      .replace(/^\\\[/, "")
      .replace(/\\\]$/, "")
      .replace(/^\\\(/, "")
      .replace(/\\\)$/, "")
      .trim();
  }, [formula]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!ref.current || !cleanFormula) {
        if (!cancelled) setState("rendered");
        return;
      }

      try {
        const MJ = await loadMathJax();
        if (cancelled || !MJ) return;

        const node = ref.current;
        // Clear any previous render
        node.innerHTML = "";

        // Build a wrapper with the right delimiters so MathJax picks the right mode
        const wrapper = document.createElement(display ? "div" : "span");
        wrapper.className = "mathjax-process-node";
        const open = display ? "\\[" : "\\(";
        const close = display ? "\\]" : "\\)";
        wrapper.textContent = `${open}${cleanFormula}${close}`;
        node.appendChild(wrapper);

        // Let MathJax typeset this single node
        await MJ.typesetPromise([wrapper]);
        if (!cancelled) {
          setState("rendered");
          setErrorMsg("");
        }
      } catch (e: any) {
        console.error("MathJax render error:", e, "Formula:", cleanFormula);
        if (!cancelled) {
          setErrorMsg(e?.message || String(e) || "unknown error");
          setState("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [cleanFormula, display]);

  if (state === "error") {
    return (
      <div
        className={
          display
            ? "my-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left overflow-x-auto"
            : "inline-block align-middle rounded border border-red-500/30 bg-red-500/5 px-1.5 py-0.5 text-xs text-red-400"
        }
      >
        {display ? (
          <>
            <div className="text-[11px] font-medium text-red-400 mb-1">⚠ Math render error</div>
            <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap break-words">{cleanFormula}</pre>
            {errorMsg && <div className="text-[10px] text-red-400/70 mt-1">{errorMsg}</div>}
          </>
        ) : (
          <code className="text-[11px]">{cleanFormula}</code>
        )}
      </div>
    );
  }

  return (
    <span
      ref={ref}
      className={
        display
          ? "mathjax-renderer my-4 block overflow-x-auto text-center py-2"
          : "mathjax-renderer inline-block align-middle max-w-full overflow-x-auto overflow-y-hidden"
      }
      style={{ opacity: state === "rendered" ? 1 : 0.6, transition: "opacity 200ms" }}
    />
  );
}

// ─── Conservative LaTeX repair ───────────────────────────
//
// We only apply surgical fixes that we are confident won't break valid LaTeX.
// Anything risky is left alone — MathJax will catch it on fallback.
function repairLatex(formula: string): string {
  if (!formula) return "";
  let s = formula;

  // ── 1. Convert \big{ \Big{ \bigg{ \Bigg{ (and }) to explicit \bigl \bigr ──
  // KaTeX is strict about needing \bigl/\bigr for delimiters.
  s = s
    .replace(/\\(big|Big|bigg|Bigg)\{/g, "\\$1l\\{")
    .replace(/\\(big|Big|bigg|Bigg)\}/g, "\\$1r\\}");

  // ── 2. \int{x} → \int_{x}, \sum{x} → \sum_{x} (model hallucination) ──
  // KaTeX rejects \int{...} outright; the proper form is \int_...^...
  s = s.replace(/\\(int|oint|iint|iiint|iiiint|sum|prod|coprod|bigotimes|bigoplus|bigodot|bigcup|bigcap|bigsqcup|bigvee|bigwedge)\s*\{/g, "\\$1_{");

  // ── 3. \text{lim} → \lim, \text{min} → \min etc. (common model mistake) ──
  s = s
    .replace(/\\text\s*\{\s*(lim|min|max|sup|inf|arg|min|arg|max|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|det|deg|gcd|Pr|dim|hom|ker)\s*\}/g, "\\$1");

  // ── 4. Map Unicode math symbols to LaTeX ──
  s = mapUnicodeMath(s);

  // ── 5. Balance unbalanced braces (last resort safety net) ──
  s = balanceBraces(s);

  return s.trim();
}

function balanceBraces(s: string): string {
  let depth = 0;
  let lastOpenAt = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; } // skip next char (escaped)
    if (c === "{") { if (depth === 0) lastOpenAt = i; depth++; }
    else if (c === "}") {
      if (depth === 0) {
        // Stray close brace — drop it
        s = s.slice(0, i) + s.slice(i + 1);
        i--;
      } else { depth--; }
    }
  }
  // Unclosed opens — append matching closes
  if (depth > 0) s += "}".repeat(depth);
  return s;
}

// ─── Unicode → LaTeX mapping ─────────────────────────────
const UNICODE_TABLE: Array<[string, string]> = [
  // Integrals
  ["∮", "\\oint"], ["∬", "\\iint"], ["∭", "\\iiint"],
  ["∯", "\\oiint"], ["∰", "\\oiiint"],
  ["∱", "\\ointctrclockwise"], ["∲", "\\ointclockwise"], ["∳", "\\oint"],
  ["⨌", "\\iiiint"], ["⨍", "\\int"], ["⨎", "\\iint"],
  ["⨏", "\\int"], ["⨐", "\\int"], ["⨑", "\\int"],
  ["⨒", "\\iint"], ["⨓", "\\iiint"], ["⨔", "\\int"],
  ["⨕", "\\int"], ["⨖", "\\oiint"], ["⨗", "\\int"],
  ["⨘", "\\int"], ["⨙", "\\int"], ["⨚", "\\iint"],
  ["⨛", "\\iiint"], ["⨜", "\\int"],
  ["⨝", "\\Join"], ["⨞", "\\Join"], ["⨟", "\\diameter"],
  // Big operators
  ["∏", "\\prod"], ["∐", "\\coprod"], ["∑", "\\sum"],
  ["⊕", "\\oplus"], ["⊖", "\\ominus"], ["⊗", "\\otimes"],
  ["⊘", "\\oslash"], ["⊙", "\\odot"], ["⊚", "\\ocircle"], ["⊛", "\\ast"],
  ["⊎", "\\uplus"], ["⊓", "\\sqcap"], ["⊔", "\\sqcup"],
  ["∧", "\\land"], ["∨", "\\lor"], ["∩", "\\cap"], ["∪", "\\cup"],
  ["△", "\\triangle"], ["▽", "\\triangledown"],
  ["⨃", "\\cupdot"], ["⨄", "\\cupplus"], ["⨅", "\\sqcap"],
  // Roots & misc operators
  ["√", "\\sqrt"], ["∛", "\\sqrt[3]"], ["∜", "\\sqrt[4]"],
  ["∞", "\\infty"], ["∇", "\\nabla"], ["∂", "\\partial"],
  ["∆", "\\Delta"], ["∇", "\\nabla"],
  // Blackboard bold sets
  ["ℂ", "\\mathbb{C}"], ["ℕ", "\\mathbb{N}"], ["ℝ", "\\mathbb{R}"],
  ["ℚ", "\\mathbb{Q}"], ["ℤ", "\\mathbb{Z}"], ["ℍ", "\\mathbb{H}"],
  ["ℙ", "\\mathbb{P}"], ["𝔽", "\\mathbb{F}"], ["𝕂", "\\mathbb{K}"],
  ["𝔸", "\\mathbb{A}"], ["𝔹", "\\mathbb{B}"], ["𝔻", "\\mathbb{D}"],
  ["𝔼", "\\mathbb{E}"], ["𝔾", "\\mathbb{G}"], ["𝕀", "\\mathbb{I}"],
  ["𝕁", "\\mathbb{J}"], ["𝕃", "\\mathbb{L}"], ["𝕄", "\\mathbb{M}"],
  ["𝕆", "\\mathbb{O}"], ["𝕊", "\\mathbb{S}"], ["𝕋", "\\mathbb{T}"],
  ["𝕌", "\\mathbb{U}"], ["𝕍", "\\mathbb{V}"], ["𝕎", "\\mathbb{W}"],
  ["𝕏", "\\mathbb{X}"], ["𝕐", "\\mathbb{Y}"],
  // Caligraphic (script)
  ["ℬ", "\\mathcal{B}"], ["ℰ", "\\mathcal{E}"], ["ℱ", "\\mathcal{F}"],
  ["ℋ", "\\mathcal{H}"], ["ℐ", "\\mathcal{I}"], ["ℒ", "\\mathcal{L}"],
  ["ℳ", "\\mathcal{M}"], ["ℛ", "\\mathcal{R}"],
  ["𝒜", "\\mathcal{A}"], ["𝒞", "\\mathcal{C}"], ["𝒟", "\\mathcal{D}"],
  ["𝒢", "\\mathcal{G}"], ["𝒥", "\\mathcal{J}"], ["𝒦", "\\mathcal{K}"],
  ["𝒩", "\\mathcal{N}"], ["𝒪", "\\mathcal{O}"], ["𝒫", "\\mathcal{P}"],
  ["𝒬", "\\mathcal{Q}"], ["𝒮", "\\mathcal{S}"], ["𝒯", "\\mathcal{T}"],
  ["𝒰", "\\mathcal{U}"], ["𝒱", "\\mathcal{V}"], ["𝒲", "\\mathcal{W}"],
  ["𝒳", "\\mathcal{X}"], ["𝒴", "\\mathcal{Y}"], ["𝒵", "\\mathcal{Z}"],
  // Fraktur
  ["ℑ", "\\mathfrak{I}"], ["ℜ", "\\mathfrak{R}"], ["ℌ", "\\mathfrak{H}"],
  ["ℨ", "\\mathfrak{Z}"],
  ["𝔄", "\\mathfrak{A}"], ["𝔅", "\\mathfrak{B}"], ["𝔇", "\\mathfrak{D}"],
  ["𝔈", "\\mathfrak{E}"], ["𝔉", "\\mathfrak{F}"], ["𝔊", "\\mathfrak{G}"],
  ["𝔍", "\\mathfrak{J}"], ["𝔎", "\\mathfrak{K}"], ["𝔏", "\\mathfrak{L}"],
  ["𝔐", "\\mathfrak{M}"], ["𝔑", "\\mathfrak{N}"], ["𝔒", "\\mathfrak{O}"],
  ["𝔓", "\\mathfrak{P}"], ["𝔔", "\\mathfrak{Q}"], ["𝔖", "\\mathfrak{S}"],
  ["𝔗", "\\mathfrak{T}"], ["𝔘", "\\mathfrak{U}"], ["𝔙", "\\mathfrak{V}"],
  ["𝔚", "\\mathfrak{W}"], ["𝔛", "\\mathfrak{X}"], ["𝔜", "\\mathfrak{Y}"],
  // Hebrew
  ["ℵ", "\\aleph"], ["ℶ", "\\beth"], ["ℷ", "\\gimel"], ["ℸ", "\\daleth"],
  // Subscripts
  ["₀", "_{0}"], ["₁", "_{1}"], ["₂", "_{2}"], ["₃", "_{3}"], ["₄", "_{4}"],
  ["₅", "_{5}"], ["₆", "_{6}"], ["₇", "_{7}"], ["₈", "_{8}"], ["₉", "_{9}"],
  ["₊", "_{+}"], ["₋", "_{-}"], ["₌", "_{=}",], ["₍", "_{"], ["₎", "}"],
  ["ₐ", "_{a}"], ["ₑ", "_{e}"], ["ₒ", "_{o}"], ["ₓ", "_{x}"],
  ["ₕ", "_{h}"], ["ₖ", "_{k}"], ["ₗ", "_{l}"], ["ₘ", "_{m}"], ["ₙ", "_{n}"],
  ["ₚ", "_{p}"], ["ₛ", "_{s}"], ["ₜ", "_{t}"],
  // Superscripts
  ["⁰", "^{0}"], ["¹", "^{1}"], ["²", "^{2}"], ["³", "^{3}"], ["⁴", "^{4}"],
  ["⁵", "^{5}"], ["⁶", "^{6}"], ["⁷", "^{7}"], ["⁸", "^{8}"], ["⁹", "^{9}"],
  ["⁺", "^{+}"], ["⁻", "^{-}"], ["⁼", "^{=}"], ["⁽", "^{"], ["⁾", "}"],
  ["ⁿ", "^{n}"], ["ⁱ", "^{i}"],
  // Arrows
  ["→", "\\to"], ["←", "\\leftarrow"], ["↔", "\\leftrightarrow"],
  ["⇒", "\\Rightarrow"], ["⇐", "\\Leftarrow"], ["⇔", "\\Leftrightarrow"],
  ["↦", "\\mapsto"], ["↪", "\\hookrightarrow"], ["↩", "\\hookleftarrow"],
  ["⇀", "\\rightharpoonup"], ["↽", "\\leftharpoonup"],
  ["⇁", "\\rightharpoondown"], ["⇌", "\\rightleftharpoons"],
  ["⟶", "\\longrightarrow"], ["⟵", "\\longleftarrow"],
  ["⟷", "\\longleftrightarrow"], ["⟹", "\\Longrightarrow"],
  ["⟸", "\\Longleftarrow"], ["⟺", "\\Longleftrightarrow"],
  ["⟴", "\\rightarrowtail"], ["⟶", "\\longrightarrow"],
  ["↗", "\\nearrow"], ["↘", "\\searrow"], ["↙", "\\swarrow"], ["↖", "\\nwarrow"],
  ["⇉", "\\rightrightarrows"], ["⇈", "\\upuparrows"],
  ["⇊", "\\downdownarrows"], ["⇋", "\\leftarrowtail"],
  // Operators
  ["⋅", "\\cdot"], ["·", "\\cdot"], ["×", "\\times"], ["÷", "\\div"],
  ["±", "\\pm"], ["∓", "\\mp"],
  ["∧", "\\wedge"], ["∨", "\\vee"], ["¬", "\\neg"],
  ["∀", "\\forall"], ["∃", "\\exists"], ["∄", "\\nexists"],
  // Relations
  ["∈", "\\in"], ["∋", "\\ni"], ["∉", "\\notin"], ["∌", "\\not\\ni"],
  ["⊂", "\\subset"], ["⊃", "\\supset"], ["⊆", "\\subseteq"], ["⊇", "\\supseteq"],
  ["⊊", "\\subsetneq"], ["⊋", "\\supsetneq"], ["⊏", "\\sqsubset"], ["⊐", "\\sqsupset"],
  ["⊑", "\\sqsubseteq"], ["⊒", "\\sqsupseteq"],
  ["∪", "\\cup"], ["∩", "\\cap"], ["∖", "\\setminus"], ["△", "\\triangle"],
  ["△", "\\bigtriangleup"], ["▽", "\\bigtriangledown"],
  ["≤", "\\le"], ["≤", "\\leq"], ["≥", "\\ge"], ["≥", "\\geq"],
  ["≦", "\\leqq"], ["≧", "\\geqq"], ["≲", "\\lesssim"], ["≳", "\\gtrsim"],
  ["≪", "\\ll"], ["≫", "\\gg"],
  ["≠", "\\ne"], ["≠", "\\neq"], ["≡", "\\equiv"], ["≈", "\\approx"],
  ["≅", "\\cong"], ["∼", "\\sim"], ["∽", "\\backsim"], ["∾", "\\lazysim"],
  ["≃", "\\simeq"], ["⋍", "\\backsimeq"],
  ["≍", "\\asymp"], ["∥", "\\parallel"], ["∦", "\\nparallel"],
  ["∝", "\\propto"], ["⊥", "\\perp"], ["∠", "\\angle"], ["∡", "\\measuredangle"], ["∢", "\\sphericalangle"],
  ["⋄", "\\diamond"], ["⋆", "\\star"], ["∗", "\\ast"], ["∘", "\\circ"],
  ["∙", "\\bullet"], ["⌃", "\\wedge"],
  // Brackets
  ["⟨", "\\langle "], ["⟩", "\\rangle "],
  ["⟦", "\\llbracket"], ["⟧", "\\rrbracket"],
  ["⌈", "\\lceil"], ["⌉", "\\rceil"], ["⌊", "\\lfloor"], ["⌋", "\\rfloor"],
  ["⟪", "\\langle\\!\\langle "], ["⟫", "\\rangle\\!\\rangle "],
  // Misc
  ["ℏ", "\\hbar"], ["ℓ", "\\ell"], ["ℊ", "g"], ["℘", "\\wp"],
  ["ℜ", "\\Re"], ["ℑ", "\\Im"], ["Ⅼ", "\\mathcal{L}"],
  ["…", "\\ldots"], ["⋯", "\\cdots"], ["⋮", "\\vdots"], ["⋱", "\\ddots"],
  ["°", "^{\\circ}"], ["′", "^{\\prime}"], ["″", "^{\\prime\\prime}"], ["‴", "^{\\prime\\prime\\prime}"],
  ["‵", "\\backprime"], ["‶", "\\backprime\\backprime"],
  ["№", "\\text{No.}"], ["§", "\\S"], ["¶", "\\P"],
  ["©", "\\copyright"], ["®", "\\textcircled{\\textsf{R}}"], ["™", "\\texttrademark"],
  ["¥", "\\textyen"], ["£", "\\textsterling"], ["€", "\\euro"],
  // Greek (in case model uses Unicode Greek)
  ["α", "\\alpha"], ["β", "\\beta"], ["γ", "\\gamma"], ["δ", "\\delta"],
  ["ε", "\\epsilon"], ["ϵ", "\\varepsilon"], ["ζ", "\\zeta"], ["η", "\\eta"],
  ["θ", "\\theta"], ["ϑ", "\\vartheta"], ["ι", "\\iota"], ["κ", "\\kappa"],
  ["ϰ", "\\varkappa"], ["λ", "\\lambda"], ["μ", "\\mu"], ["ν", "\\nu"],
  ["ξ", "\\xi"], ["π", "\\pi"], ["ϖ", "\\varpi"], ["ρ", "\\rho"],
  ["ϱ", "\\varrho"], ["σ", "\\sigma"], ["ς", "\\varsigma"], ["τ", "\\tau"],
  ["υ", "\\upsilon"], ["φ", "\\phi"], ["ϕ", "\\varphi"], ["χ", "\\chi"],
  ["ψ", "\\psi"], ["ω", "\\omega"],
  ["Γ", "\\Gamma"], ["Δ", "\\Delta"], ["Θ", "\\Theta"], ["Λ", "\\Lambda"],
  ["Ξ", "\\Xi"], ["Π", "\\Pi"], ["Σ", "\\Sigma"], ["Υ", "\\Upsilon"],
  ["Φ", "\\Phi"], ["Ψ", "\\Psi"], ["Ω", "\\Omega"],
  // Punctuation
  ["—", "\\text{---}"], ["–", "\\text{--}"], ["•", "\\bullet"],
  // Tilde etc.
  ["˜", "\\~{}"], ["¯", "\\bar{}"], ["´", "\\'{}"], ["`", "\\`{}"],
  ["ˆ", "\\^{}"], ["˚", "\\mathring{}"],
  // Misc symbols
  ["♠", "\\spadesuit"], ["♥", "\\heartsuit"], ["♦", "\\diamondsuit"], ["♣", "\\clubsuit"],
  ["∅", "\\emptyset"], ["Ø", "\\emptyset"],
  ["✓", "\\checkmark"], ["✗", "\\text{✗}"],
  ["☐", "\\Box"], ["☑", "\\text{☑}"], ["☒", "\\text{☒}"],
];

function mapUnicodeMath(s: string): string {
  // Mathematical Alphanumeric Symbols block (U+1D400–U+1D7FF) — full mapping
  // Bold A–Z (1D400–1D419), a–z (1D41A–1D433)
  s = s.replace(/[\u{1D400}-\u{1D419}]/gu, (ch) => `\\mathbf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D400 + 0x41)}}`);
  s = s.replace(/[\u{1D41A}-\u{1D433}]/gu, (ch) => `\\mathbf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D41A + 0x61)}}`);
  // Italic A–Z (1D434–1D44D), a–z (1D44E–1D467)
  s = s.replace(/[\u{1D434}-\u{1D44D}]/gu, (ch) => `\\mathit{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D434 + 0x41)}}`);
  s = s.replace(/[\u{1D44E}-\u{1D467}]/gu, (ch) => `\\mathit{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D44E + 0x61)}}`);
  // Bold Italic A–Z (1D468–1D481), a–z (1D482–1D49B)
  s = s.replace(/[\u{1D468}-\u{1D481}]/gu, (ch) => `\\boldsymbol{\\mathit{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D468 + 0x41)}}}`);
  s = s.replace(/[\u{1D482}-\u{1D49B}]/gu, (ch) => `\\boldsymbol{\\mathit{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D482 + 0x61)}}}`);
  // Script (caligraphic) A–Z (1D49C–1D4B5), a–z (1D4B6–1D4CF)
  s = s.replace(/[\u{1D49C}-\u{1D4B5}]/gu, (ch) => `\\mathcal{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D49C + 0x41)}}`);
  s = s.replace(/[\u{1D4B6}-\u{1D4CF}]/gu, (ch) => `\\mathcal{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D4B6 + 0x61)}}`);
  // Fraktur A–Z (1D504–1D51D), a–z (1D51E–1D537)
  s = s.replace(/[\u{1D504}-\u{1D51D}]/gu, (ch) => `\\mathfrak{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D504 + 0x41)}}`);
  s = s.replace(/[\u{1D51E}-\u{1D537}]/gu, (ch) => `\\mathfrak{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D51E + 0x61)}}`);
  // Double-struck A–Z (1D538–1D551), a–z (1D552–1D56B), 0–9 (1D7D8–1D7E1)
  s = s.replace(/[\u{1D538}-\u{1D551}]/gu, (ch) => `\\mathbb{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D538 + 0x41)}}`);
  s = s.replace(/[\u{1D552}-\u{1D56B}]/gu, (ch) => `\\mathbb{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D552 + 0x61)}}`);
  s = s.replace(/[\u{1D7D8}-\u{1D7E1}]/gu, (ch) => `\\mathbb{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D7D8 + 0x30)}}`);
  // Bold Fraktur A–Z (1D56C–1D585), a–z (1D586–1D59F)
  s = s.replace(/[\u{1D56C}-\u{1D585}]/gu, (ch) => `\\mathfrak{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D56C + 0x41)}}`);
  s = s.replace(/[\u{1D586}-\u{1D59F}]/gu, (ch) => `\\mathfrak{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D586 + 0x61)}}`);
  // Sans-serif A–Z (1D5A0–1D5B9), a–z (1D5BA–1D5D3), 0–9 (1D7E2–1D7EB)
  s = s.replace(/[\u{1D5A0}-\u{1D5B9}]/gu, (ch) => `\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D5A0 + 0x41)}}`);
  s = s.replace(/[\u{1D5BA}-\u{1D5D3}]/gu, (ch) => `\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D5BA + 0x61)}}`);
  s = s.replace(/[\u{1D7E2}-\u{1D7EB}]/gu, (ch) => `\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D7E2 + 0x30)}}`);
  // Sans-serif Bold A–Z (1D5D4–1D5ED), a–z (1D5EE–1D607), 0–9 (1D7EC–1D7F5)
  s = s.replace(/[\u{1D5D4}-\u{1D5ED}]/gu, (ch) => `\\mathbf{\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D5D4 + 0x41)}}}`);
  s = s.replace(/[\u{1D5EE}-\u{1D607}]/gu, (ch) => `\\mathbf{\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D5EE + 0x61)}}}`);
  s = s.replace(/[\u{1D7EC}-\u{1D7F5}]/gu, (ch) => `\\mathbf{\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D7EC + 0x30)}}`);
  // Sans-serif Italic A–Z (1D608–1D621), a–z (1D622–1D63B)
  s = s.replace(/[\u{1D608}-\u{1D621}]/gu, (ch) => `\\mathit{\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D608 + 0x41)}}}`);
  s = s.replace(/[\u{1D622}-\u{1D63B}]/gu, (ch) => `\\mathit{\\mathsf{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D622 + 0x61)}}}`);
  // Monospace A–Z (1D670–1D689), a–z (1D68A–1D6A3), 0–9 (1D7F6–1D7FF)
  s = s.replace(/[\u{1D670}-\u{1D689}]/gu, (ch) => `\\mathtt{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D670 + 0x41)}}`);
  s = s.replace(/[\u{1D68A}-\u{1D6A3}]/gu, (ch) => `\\mathtt{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D68A + 0x61)}}`);
  s = s.replace(/[\u{1D7F6}-\u{1D7FF}]/gu, (ch) => `\\mathtt{${String.fromCodePoint(ch.codePointAt(0)! - 0x1D7F6 + 0x30)}}`);

  // Apply the per-character table
  for (const [uni, tex] of UNICODE_TABLE) {
    if (s.indexOf(uni) !== -1) s = s.split(uni).join(tex);
  }
  return s;
}

// ─── Math Components ─────────────────────────────────────
export function InlineMath({ formula }: { formula: string }) {
  const useMathJax = requiresMathJax(formula);

  const html = useMemo(() => {
    if (!formula || useMathJax) return "";
    const kt = (katex as any).default || katex;
    if (!kt || typeof kt.renderToString !== "function") return "";
    try {
      const repaired = repairLatex(formula);
      const result = kt.renderToString(repaired, {
        throwOnError: false,
        displayMode: false,
        strict: "ignore",
        trust: true,
        output: "html",
        macros: { "\\ce": "\\mhchem", "\\pu": "\\mhchem" },
      });
      // KaTeX with throwOnError:false still embeds error spans — detect & fall back
      if (/class=["'][^"']*\bkatex-error\b/.test(result) || result.includes("ParseError")) {
        return "";
      }
      return result;
    } catch (e) {
      return "";
    }
  }, [formula, useMathJax]);

  // Ensure mhchem is loaded for any \ce usage
  useEffect(() => {
    if (!useMathJax && /\\(ce|pu)\b/.test(formula)) {
      ensureMhchem();
    }
  }, [formula, useMathJax]);

  if (useMathJax || !html) {
    return <MathJaxRenderer formula={formula} display={false} />;
  }
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="inline-math-container inline-block align-middle max-w-full overflow-x-auto overflow-y-hidden"
    />
  );
}

function DisplayMath({ formula }: { formula: string }) {
  const useMathJax = requiresMathJax(formula);

  const html = useMemo(() => {
    if (!formula || useMathJax) return "";
    const kt = (katex as any).default || katex;
    if (!kt || typeof kt.renderToString !== "function") return "";
    let clean = formula.trim()
      .replace(/^(\\\[|\$\$)/, "")
      .replace(/(\\\]|\$\$)$/, "")
      .trim();
    try {
      const repaired = repairLatex(clean);
      const result = kt.renderToString(repaired, {
        throwOnError: false,
        displayMode: true,
        strict: "ignore",
        trust: true,
        output: "html",
        macros: { "\\ce": "\\mhchem", "\\pu": "\\mhchem" },
      });
      if (/class=["'][^"']*\bkatex-error\b/.test(result) || result.includes("ParseError")) {
        return "";
      }
      return result;
    } catch (e) {
      return "";
    }
  }, [formula, useMathJax]);

  useEffect(() => {
    if (!useMathJax && /\\(ce|pu)\b/.test(formula)) {
      ensureMhchem();
    }
  }, [formula, useMathJax]);

  if (useMathJax || !html) {
    return <MathJaxRenderer formula={formula} display={true} />;
  }
  return (
    <div
      className="my-4 text-center overflow-x-auto max-w-full py-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Lazy load mermaid ────────────────────────────────────
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

// ─── TikZ Renderer ───────────────────────────────────────
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

// ─── LilyPond/Music Renderer (using abcjs for portability) ──
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
              paddingtop: 0, paddingbottom: 0, paddingright: 0, paddingleft: 0,
            });
          }
        } catch (e) { console.error("abcjs render error:", e); }
      }
    })();
  }, [code]);
  return <div ref={ref} className="lilypond-renderer my-4 bg-white/5 rounded-lg p-4 overflow-x-auto" />;
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
function CodeBlock({ language, code }: { language: string; code: string }) {
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
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className={`overflow-auto transition-all duration-300 ${collapsed ? "max-h-0" : "max-h-[600px]"}`}>
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
const INLINE_DELIM_REGEX = /(\$\$[\s\S]+?\$\$|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})|`[^`]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*(?!\*)[\s\S]+?\*|_(?!_)[\s\S]+?_|\\\(.+?\\\)|\\\[.+?\\\]|\$.+?\$|\[\d+\])/g;

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

// ── Block regex: also uses [a-zA-Z*]+ so \begin{CD} is captured ──
const BLOCK_DELIM_REGEX = /(<(CHART|MERMAID|svg|TIKZ|LILYPOND|CHEMICAL)(?:\s+[^>]*)?>[\s\S]*?<\/(?:CHART|MERMAID|svg|TIKZ|LILYPOND|CHEMICAL)>|```[a-z]*[\s\S]*?```|(?<=\n|^)\s*\$\$[\s\S]*?\n\s*\$\$(?=\s*$|\n)|(?<!\\)\\\[(?!-?\d+pt)[\s\S]+?\\\]|\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{[a-zA-Z*]+\})/gim;

function renderBlocks(text: string, onCitationClick: any, sources: Source[]) {
  if (typeof text !== "string") return [];
  return splitWithDelimiters(text, BLOCK_DELIM_REGEX).flatMap((part, pi) => {
    if (part.type === "delimiter") {
      const val = part.value;
      const tagMatch = val.match(/<(CHART|MERMAID|svg|TIKZ|LILYPOND|CHEMICAL)/i);
      if (tagMatch) {
        const tag = tagMatch[1]!.toUpperCase();
        const contentBase = val.replace(/<[^>]+>/gi, "").trim();
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
        if (tag === "LILYPOND") return <LilyPondRenderer key={pi} code={contentBase} />;
        if (tag === "CHEMICAL") return <DisplayMath key={pi} formula={`\\ce{${contentBase}}`} />;
        return <div key={pi} className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: val }} />;
      }
      if (val.startsWith("```")) {
        const match = val.match(/^```([a-z]*)\n?([\s\S]*?)\n?```$/i);
        return <CodeBlock key={pi} language={match?.[1] || "text"} code={match?.[2] || ""} />;
      }
      if (val.startsWith("\\begin{")) {
        const envMatch = val.match(/\\begin\{([a-zA-Z*]+)\}/i);
        const env = envMatch?.[1];
        if (env === "tikzpicture") {
          const content = val.replace(/^\\begin\{tikzpicture\}[\s\S]*?\n?/, "").replace(/\n?\\end\{tikzpicture\}$/, "").trim();
          return <TikzRenderer key={pi} code={content} />;
        }
        return <DisplayMath key={pi} formula={val} />;
      }
      if (val.trim().startsWith("$$") || (val.trim().startsWith("\\[") && val.length > 10)) {
        const inner = val.trim().replace(/^\$\$/, "").replace(/\$\$$/, "").replace(/^\\\[/, "").replace(/\\\]$/, "").trim();
        if (inner.startsWith("\\begin{tikzpicture}")) {
          const content = inner.replace(/^\\begin\{tikzpicture\}[\s\S]*?\n?/, "").replace(/\n?\\end\{tikzpicture\}$/, "").trim();
          return <TikzRenderer key={pi} code={content} />;
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
}: {
  content: string;
  onCitationClick: (index: number) => void;
  sources: Source[];
}) {
  const safeContent = content ?? "";
  const blocks = useMemo(() => renderBlocks(safeContent, onCitationClick, sources), [safeContent, onCitationClick, sources]);
  return <div className="markdown-body space-y-1">{blocks}</div>;
});
