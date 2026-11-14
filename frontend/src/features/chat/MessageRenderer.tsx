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
import { IconCheck, IconChevronDown, IconCopy, IconDownload } from "../layout/anthropicIcons.tsx";
// block U+1D400–U+1D7FF) is mapped to native LaTeX commands before rendering.

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

import katex from "katex";
import { InlineMath, DisplayMath } from "./MathRenderer";
import { renderBlocks } from "./markdownBlocks";
import { SmilesRenderer, TikzRenderer, MusicRenderer, MermaidRenderer, CodeBlock } from "./CodeRenderers";

let mermaid: any = null;
import "katex/dist/katex.min.css";

import type { Source } from "../../types";
import { getDomain, fixMalformedTags } from "../../lib/chat-utils";
import { ChartRenderer, type ChartData } from "../content/ChartBlock";
import { LiveWidget } from "./LiveWidget";
import SmilesDrawer from "smiles-drawer";
import DOMPurify from "dompurify";

// ─── Common KaTeX macros ─────────────────────────────────

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
