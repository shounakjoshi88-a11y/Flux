export const MACROS: Record<string, string> = {
  "\\ce": "\\mhchem",
  "\\pu": "\\mhchem",
  // Blackboard bold
  "\\R": "\\mathbb{R}",
  "\\C": "\\mathbb{C}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\F": "\\mathbb{F}",
  "\\E": "\\mathbb{E}",
  // Greek variants
  "\\eps": "\\varepsilon",
  "\\vphi": "\\varphi",
  "\\vpi": "\\varpi",
  "\\varrho": "\\varrho",
  "\\varkappa": "\\varkappa",
  // Common operators
  "\\tr": "\\operatorname{tr}",
  "\\Span": "\\operatorname{Span}",
  "\\rank": "\\operatorname{rank}",
  "\\diag": "\\operatorname{diag}",
  "\\range": "\\operatorname{range}",
  "\\nullspace": "\\operatorname{null}",
  "\\spans": "\\operatorname{span}",
  "\\im": "\\operatorname{Im}",
  "\\re": "\\operatorname{Re}",
  "\\argmin": "\\operatorname{argmin}",
  "\\argmax": "\\operatorname{argmax}",
  "\\sgn": "\\operatorname{sgn}",
  "\\supp": "\\operatorname{supp}",
  "\\vol": "\\operatorname{vol}",
  "\\dist": "\\operatorname{dist}",
  "\\diam": "\\operatorname{diam}",
  "\\conv": "\\operatorname{conv}",
  "\\Proj": "\\operatorname{Proj}",
  "\\Res": "\\operatorname{Res}",
  "\\Pr": "\\operatorname{Pr}",
  "\\Exp": "\\operatorname{E}",
  "\\Var": "\\operatorname{Var}",
  "\\Cov": "\\operatorname{Cov}",
  "\\Corr": "\\operatorname{Corr}",
  "\\lcm": "\\operatorname{lcm}",
  "\\grad": "\\nabla",
  "\\slashed": "\\not{#1}",
  "\\curl": "\\nabla\\times",
  "\\divg": "\\nabla\\cdot",
  // Paired delimiters
  "\\abs": "\\lvert#1\\rvert",
  "\\norm": "\\lVert#1\\rVert",
  "\\ceil": "\\lceil#1\\rceil",
  "\\floor": "\\lfloor#1\\rfloor",
  "\\set": "\\{\\,#1\\,\\}",
  "\\bkt": "\\left[#1\\right]",
  "\\paren": "\\left(#1\\right)",
};

// ─── KaTeX global setup + mhchem ─────────────────────────
if (typeof window !== "undefined") {
  const kt = (katex as any).default || katex;
  if (kt) { (window as any).katex = kt; }
}

let mhchemLoaded = false;
let mhchemPromise: Promise<boolean> | null = null;


import React, { useState, useEffect, useRef, useMemo } from "react";
import katex from "katex";

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

// ─── Raw LaTeX fallback (when KaTeX fails) ───────────────
function RawLatexFallback({ formula, display }: { formula: string; display: boolean }) {
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

  if (display) {
    return (
      <div className="my-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-left overflow-x-auto">
        <div className="text-[11px] font-medium text-amber-400 mb-1">LaTeX</div>
        <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap break-words font-mono">{cleanFormula}</pre>
      </div>
    );
  }
  return (
    <code className="inline-block align-middle rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400">
      {cleanFormula}
    </code>
  );
}

// ─── MathJax fallback for features KaTeX can't handle ────
// KaTeX doesn't support: \multicolumn, \intertext, \genfrac, \xymatrix, \halign.
// We lazily load MathJax v3 from CDN only when needed.

let mjPromise: Promise<any> | null = null;
let mjReady = false;

export function needsMathJax(formula: string): boolean {
  if (/\\xymatrix\b/.test(formula)) return true;
  return false;
}

function MathJaxRenderer({ formula, display }: { formula: string; display: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "rendered" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  const cleanFormula = useMemo(() => {
    return (formula || "")
      .trim()
      .replace(/^\$\$/, "").replace(/\$\$$/, "")
      .replace(/^\\\[/, "").replace(/\\\]$/, "")
      .replace(/^\\\(/, "").replace(/\\\)$/, "")
      .trim();
  }, [formula]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cleanFormula) { if (!cancelled) setState("rendered"); return; }
      try {
        if (!mjReady) {
          if (!mjPromise) {
            (window as any).MathJax = {
              tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]], processEscapes: true, processEnvironments: true, packages: { "[+]": ["xy"] } },
              loader: { load: ["[tex]/xy"] },
              options: { ignoreHtmlClass: "tex2jax_ignore", processHtmlClass: "tex2jax_process" },
              startup: { typeset: false, ready: () => { (window as any).MathJax.startup.defaultReady(); (window as any).MathJax.startup.promise.then(() => { mjReady = true; }).catch(() => {}); } },
              chtml: { scale: 1.0, fontURL: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2" },
            };
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
            s.async = true; s.crossOrigin = "anonymous";
            mjPromise = new Promise((resolve, reject) => { s.onload = resolve; s.onerror = reject; });
            document.head.appendChild(s);
          }
          await mjPromise;
        }
        if (cancelled) return;
        const node = containerRef.current;
        if (!node) return;
        node.innerHTML = "";
        const wrapper = document.createElement(display ? "div" : "span");
        wrapper.className = "mathjax-node";
        wrapper.textContent = `${display ? "\\[" : "\\("}${cleanFormula}${display ? "\\]" : "\\)"}`;
        node.appendChild(wrapper);
        await (window as any).MathJax.typesetPromise([wrapper]);
        if (!cancelled) setState("rendered");
      } catch (e: any) {
        if (!cancelled) { setErrMsg(e?.message || String(e)); setState("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [cleanFormula, display]);

  if (state === "error") {
    return <RawLatexFallback formula={formula} display={display} />;
  }

  const wrapperClass = display
    ? "my-4 text-center overflow-x-auto max-w-full py-2 block"
    : "inline-math-container inline-block align-middle max-w-full overflow-x-auto overflow-y-hidden";

  return (
    <span className={wrapperClass} style={{ position: "relative" }}>
      <div ref={containerRef} />
      {state === "loading" && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          {display ? "Rendering complex formula…" : "⋯"}
        </span>
      )}
    </span>
  );
}

// ─── Commutative diagram (\begin{CD}) → KaTeX matrix ─────
// KaTeX doesn't support the CD environment. We convert it to
// a \begin{matrix} with \xrightarrow / \xleftarrow / \downarrow / \uparrow.
//
// In amscd the first row defines a grid where columns alternate:
//   [entry(0), arrow(1), entry(2), arrow(3), entry(4), …]
// Horizontal arrows (@>>> @<<< @=) go in ODD columns (arrow positions).
// Vertical arrows (@VVV @AAA) and @. go in EVEN columns (entry positions).
export function convertCDtoMatrix(s: string): string {
  return s.replace(/\\begin\s*\{CD\}\s*([\s\S]*?)\s*\\end\s*\{CD\}/gi, (_match, body: string) => {
    const rawRows = body.split(/\\\\/).map((r: string) => r.trim()).filter((r: string) => r.length > 0);
    if (rawRows.length === 0) return s;

    // Number of entries = number of @-separated parts in the first row
    const numEntries = rawRows[0]!.split('@').length;
    const targetCols = 2 * numEntries - 1;

    function isArrowRow(parts: string[]): boolean {
      for (let i = 1; i < Math.min(parts.length, numEntries); i++) {
        if (/^[><=]/.test(parts[i] ?? '')) return true;
      }
      return false;
    }

    function extractArrowAndEntry(part: string): [string, string] {
      let arrowEnd = 0;
      while (arrowEnd < part.length && /[><VA.={]/.test(part[arrowEnd]!)) {
        if (part[arrowEnd] === '{') {
          const close = part.indexOf('}', arrowEnd);
          if (close < 0) break;
          arrowEnd = close + 1;
        } else {
          arrowEnd++;
        }
      }
      return [part.slice(0, arrowEnd), part.slice(arrowEnd).trim()];
    }

    const matrixRows: string[][] = [];

    for (const rawRow of rawRows) {
      const parts = rawRow.split('@').map((p: string) => p.trim());

      if (isArrowRow(parts)) {
        // ── Arrow row: each @-part is arrow + entry ──
        const cells: string[] = [];
        cells.push(parts[0] ?? '');
        const maxArrows = Math.min(parts.length - 1, numEntries - 1);
        for (let pi = 1; pi <= maxArrows; pi++) {
          const [arrowStr, entryStr] = extractArrowAndEntry(parts[pi] ?? '');
          cells.push(parseCDArrow(arrowStr));
          cells.push(entryStr);
        }
        while (cells.length < targetCols) cells.push('');
        if (cells.length > targetCols) cells.length = targetCols;
        matrixRows.push(cells);

      } else {
        // ── Entry row: @-parts fill entry cells; arrow cells are empty ──
        // `.` adds 1 cell (empty arrow column)
        // `VVV/AAA` adds 2 cells (entry column with vertical arrow + empty arrow column)
        const cells: string[] = [];
        cells.push(parts[0] ?? ''); // first entry

        const maxParts = Math.min(parts.length - 1, numEntries - 1);
        for (let pi = 1; pi <= maxParts; pi++) {
          const [arrowStr, _entryStr] = extractArrowAndEntry(parts[pi] ?? '');
          const firstChar = arrowStr[0] ?? '';
          if (firstChar === 'V' || firstChar === 'A') {
            cells.push(parseCDArrow(arrowStr)); // entry column: vertical arrow
            cells.push('');                     // arrow column: empty
          } else {
            // `.` or anything else → null arrow, 1 cell
            cells.push('');
          }
        }

        while (cells.length < targetCols) cells.push('');
        if (cells.length > targetCols) cells.length = targetCols;
        matrixRows.push(cells);
      }
    }

    return '\\begin{matrix}' + matrixRows.map((r: string[]) => r.join(' & ')).join('\\\\') + '\\end{matrix}';
  });
}

function parseCDArrow(arrow: string): string {
  if (!arrow || arrow === '.') return '';

  // Extract all {...} labels and determine arrow type
  const labels: string[] = [];
  let arrowType = '';
  for (let i = 0; i < arrow.length; i++) {
    const ch = arrow[i]!;
    if (ch === '{') {
      const close = arrow.indexOf('}', i);
      if (close < 0) { labels.push(arrow.slice(i + 1)); break; }
      labels.push(arrow.slice(i + 1, close));
      i = close;
    } else if (/[><VA=]/.test(ch)) {
      if (!arrowType) arrowType = ch;
    }
  }

  if (!arrowType) return '';

  switch (arrowType) {
    case '>':
      if (labels.length === 0) return '\\to';
      if (labels.length === 1) return `\\xrightarrow{${labels[0]}}`;
      return `\\xrightarrow[${labels[1]}]{${labels[0]}}`;
    case '<':
      if (labels.length === 0) return '\\leftarrow';
      if (labels.length === 1) return `\\xleftarrow{${labels[0]}}`;
      return `\\xleftarrow[${labels[1]}]{${labels[0]}}`;
    case 'V':
      return labels.length > 0 ? `\\downarrow_{${labels[labels.length - 1]}}` : '\\downarrow';
    case 'A':
      return labels.length > 0 ? `\\uparrow^{${labels[labels.length - 1]}}` : '\\uparrow';
    case '=':
      return '\\doteq';
    default:
      return '';
  }
}

// ─── Conservative LaTeX repair ───────────────────────────
//
// Surgical fixes for common model hallucination patterns.
// Each fix is narrow in scope to avoid breaking valid LaTeX.
export function repairLatex(formula: string): string {
  if (!formula) return "";
  let s = formula;

  // ── 0. Convert \begin{CD}...\end{CD} to KaTeX-compatible matrix ──
  s = convertCDtoMatrix(s);

  // ── 1. Convert \big{ \Big{ \bigg{ \Bigg{ (and }) to explicit \bigl \bigr ──
  s = s
    .replace(/\\(big|Big|bigg|Bigg)\{/g, "\\$1l\\{")
    .replace(/\\(big|Big|bigg|Bigg)\}/g, "\\$1r\\}");

  // ── 2. \int{x} → \int_{x}, \sum{x} → \sum_{x} (model hallucination) ──
  s = s.replace(/\\(int|oint|iint|iiint|iiiint|sum|prod|coprod|bigotimes|bigoplus|bigodot|bigcup|bigcap|bigsqcup|bigvee|bigwedge)\s*\{/g, "\\$1_{");

  // ── 3. \text{lim} → \lim, \text{min} → \min etc. (common model mistake) ──
  s = s
    .replace(/\\text\s*\{\s*(lim|min|max|sup|inf|arg|min|arg|max|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|det|deg|gcd|Pr|dim|hom|ker)\s*\}/g, "\\$1");

  // ── 3b. Protect \text{...} content from unicode mapping below
  // (unicode math chars like ° inside \text break KaTeX)
  const textBlocks: string[] = [];
  s = s.replace(/(\\text\{[^}]*\})/g, (m) => {
    const idx = textBlocks.length;
    textBlocks.push(m);
    return `\x00TEXT${idx}\x00`;
  });

  // ── 4. Map Unicode math symbols to LaTeX ──
  s = mapUnicodeMath(s);

  // ── 4b. Restore protected \text{...} blocks
  s = s.replace(/\x00TEXT(\d+)\x00/g, (_, idx) => textBlocks[+idx] ?? '');

  // ── 5. Escape # (macro parameter character breaks KaTeX) ──
  s = s.replace(/(?<!\\)#/g, '\\#');

  // ── 6. Balance \left / \right pairs ──
  const leftCnt = (s.match(/\\left\b/g) || []).length;
  const rightCnt = (s.match(/\\right\b/g) || []).length;
  if (leftCnt > rightCnt) s += ' \\right.'.repeat(leftCnt - rightCnt);
  else if (rightCnt > leftCnt) s = '\\left. '.repeat(rightCnt - leftCnt) + s;

  // ── 7. Strip \tag{...} and \label{...} inside align environments ──
  s = s.replace(/\\tag\s*\{[^}]*\}/g, '');
  s = s.replace(/\\label\s*\{[^}]*\}/g, '');

  // ── 8. Convert \\[<dimen>] to \\ (KaTeX doesn't support optional arg) ──
  s = s.replace(/\\\\\[\d+(?:\.\d+)?\s*(?:pt|ex|em|mm|cm|in|pc|mu)\]/g, '\\\\');

  // ── 9. Commands KaTeX doesn't support — convert to KaTeX-compatible forms ──
  // \intertext{...} → \text{...}\\  (inline text then newline)
  s = s.replace(/\\intertext\s*\{([^}]*)\}/g, "\\text{$1}\\\\");
  // \multicolumn{n}{align}{text} → {text}  (keep content, drop spanning)
  s = s.replace(/\\multicolumn\s*\{[^}]*\}\s*\{[^}]*\}\s*\{([^}]*)\}/g, "{$1}");
  // \genfrac{ldelim}{rdelim}{thick}{style}{num}{den} → \frac{num}{den}
  s = s.replace(/\\genfrac(\s*\{[^}]*\}){4}\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "\\frac{$2}{$3}");
  // \xymatrix{...} / \halign{...} — let KaTeX fail naturally to RawLatexFallback

  // ── 10. Strip \hfill etc. in math mode ──
  s = s.replace(/\\hfill\b/g, ' ');

  // ── 11. Balance unbalanced braces (last resort safety net) ──
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
  // Route directly to MathJax for features KaTeX doesn't support
  if (needsMathJax(formula)) {
    return <MathJaxRenderer formula={formula} display={false} />;
  }

  const html = useMemo(() => {
    if (!formula) return "";
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
        macros: MACROS,
      });
      if (/class=["'][^"']*\bkatex-error\b/.test(result) || result.includes("ParseError")) {
        return "";
      }
      return result;
    } catch (e) {
      return "";
    }
  }, [formula]);

  useEffect(() => {
    if (/\\(ce|pu)\b/.test(formula)) {
      ensureMhchem();
    }
  }, [formula]);

  if (!html) {
    return <RawLatexFallback formula={formula} display={false} />;
  }
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="inline-math-container inline-block align-middle max-w-full overflow-x-auto overflow-y-hidden"
    />
  );
}

export function DisplayMath({ formula }: { formula: string }) {
  // Route directly to MathJax for features KaTeX doesn't support
  if (needsMathJax(formula)) {
    return <MathJaxRenderer formula={formula} display={true} />;
  }

  const html = useMemo(() => {
    if (!formula) return "";
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
        macros: MACROS,
      });
      if (/class=["'][^"']*\bkatex-error\b/.test(result) || result.includes("ParseError")) {
        return "";
      }
      return result;
    } catch (e) {
      return "";
    }
  }, [formula]);

  useEffect(() => {
    if (/\\(ce|pu)\b/.test(formula)) {
      ensureMhchem();
    }
  }, [formula]);

  if (!html) {
    return <RawLatexFallback formula={formula} display={true} />;
  }
  return (
    <span
      className="my-4 text-center overflow-x-auto max-w-full py-2 block"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Lazy load mermaid ────────────────────────────────────
let mermaid: any = null;

