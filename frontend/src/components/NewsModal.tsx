// src/components/NewsModal.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Loader2, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { BACKEND_URL } from "@/lib/config";
import { createClient } from "@/lib/client";

const supabase = createClient();

type NewsItem = {
  title: string;
  url: string;
  content: string;
  publishedDate: string;
  source: string;
};

type NewsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** @deprecated kept for back-compat; article opening is now handled internally */
  onReadArticle?: (url: string) => void;
};

// ── Palette: Torii Vermillion × Washi × Sakura ────────────────────
const P = {
  bg:           "#0D0B09",
  bgDeep:       "#080706",
  bgPanel:      "#131109",
  bgCard:       "#19150E",
  bgCardHover:  "#211C13",
  // Torii-gate vermillion — bridges amber warmth and red tradition
  verm:         "#C4502A",
  vermDim:      "#7A3218",
  vermGlow:     "rgba(196,80,42,0.14)",
  vermBorder:   "rgba(196,80,42,0.22)",
  vermBorderHov:"rgba(196,80,42,0.58)",
  // Aged gold
  gold:         "#D49447",
  goldDim:      "rgba(212,148,71,0.4)",
  // Sakura — delicate counterweight
  sakura:       "#E8929A",
  sakuraDim:    "rgba(232,146,154,0.18)",
  sakuraBorder: "rgba(232,146,154,0.22)",
  // Washi paper
  paper:        "#EFD9BC",
  paperFaint:   "rgba(239,217,188,0.22)",
  ink:          "rgba(239,217,188,0.9)",
  inkMid:       "rgba(239,217,188,0.52)",
  inkFaint:     "rgba(239,217,188,0.24)",
  inkGhost:     "rgba(239,217,188,0.07)",
  border:       "rgba(110,72,36,0.28)",
  borderFaint:  "rgba(110,72,36,0.13)",
};

const CATEGORIES = [
  { label: "すべて", en: "All",      query: "latest breaking world news" },
  { label: "世界",   en: "World",    query: "world news international" },
  { label: "技術",   en: "Tech",     query: "technology AI news" },
  { label: "経済",   en: "Business", query: "business economy finance news" },
  { label: "科学",   en: "Science",  query: "science research discovery" },
  { label: "政治",   en: "Politics", query: "politics government news" },
];

const KANJI_STAMPS = ["速報", "最新", "注目", "特集", "解説", "独自"];
const KANA_RAIL    = ["桜", "炎", "月", "竹", "風", "星", "雨", "波"];

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "今すぐ";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

function readingTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins}分`;
}

// ─────────────────────────────────────────────────────────────────
//   CUSTOM SVG ICONS — all hand-crafted
// ─────────────────────────────────────────────────────────────────

/** Torii gate — header brand icon */
const ToriiIcon = ({ size = 22, color = P.verm }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Top cap */}
    <path d="M2 5.5 Q12 3 22 5.5" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
    {/* Upper crossbeam tabs */}
    <line x1="1.5" y1="5.5" x2="1.5" y2="7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="22.5" y1="5.5" x2="22.5" y2="7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    {/* Lower crossbeam */}
    <line x1="4" y1="9.5" x2="20" y2="9.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    {/* Left pillar */}
    <line x1="7" y1="7.5" x2="7" y2="23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    {/* Right pillar */}
    <line x1="17" y1="7.5" x2="17" y2="23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    {/* Inner glow hint */}
    <ellipse cx="12" cy="16" rx="2.5" ry="2.5" fill={`${color}18`}/>
  </svg>
);

/** Sakura blossom — category icon */
const SakuraIcon = ({ size = 14, color = P.sakura, opacity = 1 }: { size?: number; color?: string; opacity?: number }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
    {[0,72,144,216,288].map((deg, i) => (
      <ellipse key={i} cx="10" cy="5" rx="2.2" ry="3.8" fill={color}
        transform={`rotate(${deg} 10 10)`} opacity="0.85"/>
    ))}
    <circle cx="10" cy="10" r="2.2" fill={color}/>
    <circle cx="10" cy="10" r="1" fill={P.paper} opacity="0.5"/>
  </svg>
);

/** Temple bell — refresh icon */
const BellIcon = ({ size = 16, color = P.verm, spinning = false }: { size?: number; color?: string; spinning?: boolean }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ animation: spinning ? "bell-ring 0.6s ease-in-out infinite" : undefined }}>
    {/* Hanger */}
    <line x1="12" y1="1.5" x2="12" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="12" cy="3" r="1.2" stroke={color} strokeWidth="1" fill="none"/>
    {/* Bell body */}
    <path d="M6 14 C6 9 8.5 4.5 12 4.5 C15.5 4.5 18 9 18 14 L19.5 17 H4.5 Z" stroke={color} strokeWidth="1.4" fill={`${color}12`} strokeLinejoin="round"/>
    {/* Mouth */}
    <path d="M5 17 Q12 19.5 19 17" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
    {/* Clapper */}
    <line x1="12" y1="17" x2="12" y2="20" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="12" cy="20.5" r="1.2" fill={color} opacity="0.7"/>
  </svg>
);

/** Ink brush stroke scroll — article icon */
const ScrollIcon = ({ size = 14, color = P.verm }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="5" width="16" height="15" rx="1" stroke={color} strokeWidth="1.3" fill={`${color}10`}/>
    <line x1="4" y1="5" x2="20" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <line x1="4" y1="20" x2="20" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    {/* Rolled ends */}
    <path d="M4 5 Q2 5 2 7.5 Q2 10 4 10" stroke={color} strokeWidth="1.2" fill={`${color}08`}/>
    <path d="M20 5 Q22 5 22 7.5 Q22 10 20 10" stroke={color} strokeWidth="1.2" fill={`${color}08`}/>
    <path d="M4 20 Q2 20 2 17.5 Q2 15 4 15" stroke={color} strokeWidth="1.2" fill={`${color}08`}/>
    <path d="M20 20 Q22 20 22 17.5 Q22 15 20 15" stroke={color} strokeWidth="1.2" fill={`${color}08`}/>
    {/* Text lines */}
    <line x1="7" y1="9.5"  x2="17" y2="9.5"  stroke={color} strokeWidth="0.8" opacity="0.4"/>
    <line x1="7" y1="12.5" x2="17" y2="12.5" stroke={color} strokeWidth="0.8" opacity="0.4"/>
    <line x1="7" y1="15.5" x2="13" y2="15.5" stroke={color} strokeWidth="0.8" opacity="0.4"/>
  </svg>
);

/** Mon seal — decorative badge */
const MonSealIcon = ({ size = 40, char = "読", color = P.verm }: { size?: number; char?: string; color?: string }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" stroke={color} strokeWidth="1.2" fill={`${color}0d`}/>
    <circle cx="24" cy="24" r="18" stroke={color} strokeWidth="0.5" fill="none" opacity="0.5"/>
    {/* Petal ring */}
    {[0,45,90,135,180,225,270,315].map((deg, i) => (
      <ellipse key={i} cx="24" cy="10" rx="1.4" ry="2.2" fill={color}
        transform={`rotate(${deg} 24 24)`} opacity="0.28"/>
    ))}
    <text x="24" y="28.5" textAnchor="middle" fontSize="13"
      fontFamily="'Noto Serif JP', serif" fontWeight="900" fill={color}>
      {char}
    </text>
  </svg>
);

/** Compass/shuriken arrow for "read" CTA */
const ReadArrowIcon = ({ size = 12, color = P.verm }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 8 L13 8 M9 4 L13 8 L9 12" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** Search glass — custom */
const SearchIcon = ({ size = 14, color = P.vermDim }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8.5" cy="8.5" r="5.5" stroke={color} strokeWidth="1.6"/>
    <line x1="12.5" y1="12.5" x2="17" y2="17" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    {/* Small dot inside */}
    <circle cx="8.5" cy="8.5" r="1.5" fill={color} opacity="0.3"/>
  </svg>
);

/** Ink brush divider */
const BrushDivider = ({ color = P.verm, opacity = 0.35 }: { color?: string; opacity?: number }) => (
  <svg viewBox="0 0 240 6" width="100%" height="6" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0,3 C20,1.5 40,4.5 80,3 C120,1.5 140,4.5 180,3 C210,1.8 230,3.8 240,3"
      stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={opacity}/>
    <path d="M0,3.8 C30,2.8 60,4.2 100,3.2 C140,2.2 170,4.5 240,3.5"
      stroke={color} strokeWidth="0.5" fill="none" strokeLinecap="round" opacity={opacity * 0.5}/>
  </svg>
);

/** Floating sakura petal particle */
const SakuraPetal = ({ delay, x, size: s }: { delay: number; x: number; size: number }) => (
  <motion.div
    className="absolute pointer-events-none"
    style={{ left: `${x}%`, top: "-5%", width: s, height: s }}
    animate={{
      y: ["0vh", "110vh"],
      x: [0, (delay % 2 === 0 ? 1 : -1) * (30 + delay * 8)],
      rotate: [0, delay % 2 === 0 ? 360 : -360],
      opacity: [0, 0.55, 0.45, 0],
    }}
    transition={{
      duration: 12 + delay * 2.5,
      delay: delay * 1.8,
      repeat: Infinity,
      ease: "linear",
    }}
  >
    <SakuraIcon size={s} color={P.sakura} opacity={0.7} />
  </motion.div>
);

// ─────────────────────────────────────────────────────────────────
//   SUMMARY RENDERER — palette-aware markdown renderer
// ─────────────────────────────────────────────────────────────────

/** Parse inline markdown: **bold**, *italic*, `code`, and plain text */
function renderInline(text: string, key: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    const k = `${key}-i${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={k} style={{ color: P.paper, fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={k} style={{ color: P.sakura, fontStyle: "italic" }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={k} style={{
          fontFamily: "monospace",
          fontSize: "0.85em",
          background: P.inkGhost,
          color: P.gold,
          borderRadius: 3,
          padding: "0 4px",
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={k}>{part}</React.Fragment>;
  });
}

/** Render the AI summary text as structured markdown elements */
function SummaryRenderer({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    if (!trimmed) { i++; continue; }

    // --- Horizontal rule
    if (/^---+$/.test(trimmed)) {
      elements.push(
        <div key={`hr-${i}`} style={{ margin: "12px 0" }}>
          <BrushDivider color={P.verm} opacity={0.2} />
        </div>
      );
      i++; continue;
    }

    // ### Heading 3
    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      elements.push(
        <p key={`h3-${i}`} className="jp-sans" style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
          color: P.verm, textTransform: "uppercase" as const,
          marginTop: 16, marginBottom: 4,
        }}>
          {renderInline(h3[1]!, `h3-${i}`)}
        </p>
      );
      i++; continue;
    }

    // ## Heading 2
    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      elements.push(
        <p key={`h2-${i}`} className="jp-serif" style={{
          fontSize: 13, fontWeight: 700, color: P.paper,
          marginTop: 18, marginBottom: 5,
          borderLeft: `2px solid ${P.verm}`, paddingLeft: 8,
        }}>
          {renderInline(h2[1]!, `h2-${i}`)}
        </p>
      );
      i++; continue;
    }

    // # Heading 1
    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) {
      elements.push(
        <p key={`h1-${i}`} className="jp-serif" style={{
          fontSize: 15, fontWeight: 900, color: P.paper,
          marginTop: 20, marginBottom: 6,
        }}>
          {renderInline(h1[1]!, `h1-${i}`)}
        </p>
      );
      i++; continue;
    }

    // > Blockquote
    if (/^>\s*/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s*/.test((lines[i] ?? "").trim())) {
        quoteLines.push((lines[i] ?? "").replace(/^>\s*/, ""));
        i++;
      }
      elements.push(
        <div key={`bq-${i}`} style={{
          borderLeft: `2px solid ${P.sakuraBorder}`, paddingLeft: 10,
          marginTop: 10, marginBottom: 10, opacity: 0.82,
        }}>
          {quoteLines.map((ql, qi) => (
            <p key={`bq-${i}-${qi}`} className="jp-sans" style={{
              fontSize: 12, color: P.inkMid, lineHeight: 1.85, fontStyle: "italic", margin: 0,
            }}>
              {renderInline(ql, `bq-${i}-${qi}`)}
            </p>
          ))}
        </div>
      );
      continue;
    }

    // Unordered list: -, *, •
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: "8px 0", paddingLeft: 0, listStyle: "none" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 5 }}>
              <span style={{
                marginTop: 6, width: 5, height: 5, borderRadius: "50%",
                background: P.verm, flexShrink: 0, boxShadow: `0 0 4px ${P.verm}60`,
              }} />
              <span className="jp-sans" style={{ fontSize: 12.5, color: P.inkMid, lineHeight: 1.9 }}>
                {renderInline(item, `ul-${i}-${idx}`)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list: 1. 2. etc.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: "8px 0", paddingLeft: 0, listStyle: "none" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
              <span className="jp-sans" style={{
                fontSize: 10, fontWeight: 800, color: P.verm,
                minWidth: 16, marginTop: 4, flexShrink: 0, lineHeight: 1,
              }}>
                {idx + 1}.
              </span>
              <span className="jp-sans" style={{ fontSize: 12.5, color: P.inkMid, lineHeight: 1.9 }}>
                {renderInline(item, `ol-${i}-${idx}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = (lines[i] ?? "").trim();
      if (!l) break;
      if (/^(#{1,3}\s|[-*•]\s|\d+\.\s|>\s|---+)/.test(l)) break;
      paraLines.push(lines[i] ?? "");
      i++;
    }
    if (paraLines.length > 0) {
      const pKey = `p-${i}`;
      elements.push(
        <p key={pKey} className="jp-sans" style={{
          fontSize: 12.5, color: P.inkMid, lineHeight: 2.0, marginTop: 0, marginBottom: 10,
        }}>
          {paraLines.flatMap((l, li) => [
            ...renderInline(l, `${pKey}-l${li}`),
            li < paraLines.length - 1
              ? <React.Fragment key={`${pKey}-sp${li}`}>{" "}</React.Fragment>
              : null,
          ])}
        </p>
      );
    }
  }

  // Blinking cursor appended to last element when streaming
  if (streaming && elements.length > 0) {
    const last = elements[elements.length - 1] as React.ReactElement<any>;
    elements[elements.length - 1] = React.cloneElement(last, {},
      ...(Array.isArray(last.props.children) ? last.props.children : [last.props.children]),
      <span key="cursor" className="summary-cursor" style={{ color: P.verm, marginLeft: 1 }}>▋</span>
    );
  } else if (streaming) {
    elements.push(<span key="cursor" className="summary-cursor" style={{ color: P.verm }}>▋</span>);
  }

  return <div style={{ paddingBottom: 4 }}>{elements}</div>;
}

// ─────────────────────────────────────────────────────────────────
//   NEWS PEEK PANEL
//
//   WHY fetch() → blob URL instead of <iframe src="/proxy?url=...">
//   ────────────────────────────────────────────────────────────────
//   Setting an iframe's src to a backend URL causes two fatal bugs:
//
//   1. Auth headers — iframes make a plain browser GET with NO custom
//      headers, so `Authorization: Bearer <token>` is never sent and
//      the middleware rejects every request.
//
//   2. IPv4 / IPv6 mismatch — the backend binds to 127.0.0.1 (IPv4).
//      Chrome resolves "localhost" → ::1 (IPv6) first, gets ECONNREFUSED,
//      and shows "localhost refused to connect." even while regular
//      fetch() calls (which try both) succeed perfectly.
//
//   The fix: use fetch() (which sends auth headers and handles IPv4/IPv6
//   correctly) to pull the proxied HTML, turn it into a blob: URL in the
//   browser, then point the iframe at that. A blob: URL is served entirely
//   from browser memory — no server round-trip, no X-Frame-Options, no
//   auth challenge. Works for every site, every time.
// ─────────────────────────────────────────────────────────────────
function NewsPeekPanel({ url, onClose }: { url: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl]   = React.useState<string | null>(null);
  const [state,   setState]     = React.useState<"loading" | "ready" | "error">("loading");
  // Track the current blob URL so we can revoke it on unmount / URL change
  const blobUrlRef = React.useRef<string | null>(null);

  // ── Fetch proxy HTML → create blob URL whenever `url` changes ────
  React.useEffect(() => {
    let cancelled = false;

    // Reset UI
    setState("loading");
    setBlobUrl(null);

    // Free the previous blob to avoid memory leak
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        // fetch() correctly handles auth headers AND IPv4/IPv6 resolution
        const res = await fetch(
          `${BACKEND_URL}/proxy?url=${encodeURIComponent(url)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );

        if (!res.ok) throw new Error(`Proxy returned HTTP ${res.status}`);

        const html = await res.text();
        if (cancelled) return;

        // Turn the HTML string into a browser-side blob URL.
        // A blob: URL is served from browser memory — the iframe never
        // makes a network request, so X-Frame-Options is completely irrelevant.
        const blob   = new Blob([html], { type: "text/html; charset=utf-8" });
        const objUrl = URL.createObjectURL(blob);
        blobUrlRef.current = objUrl;
        setBlobUrl(objUrl);
      } catch (err: any) {
        console.error("[PeekPanel] load failed:", err?.message ?? err);
        if (!cancelled) setState("error");
      }
    };

    load();
    return () => { cancelled = true; };
  }, [url]);

  // Revoke blob URL when the panel unmounts (clean up browser memory)
  React.useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleIframeLoad = () => { if (blobUrl) setState("ready"); };

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col"
      initial={{ x: "100%", opacity: 0.9 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 36 }}
      style={{ background: P.bgDeep }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${P.border}`, background: `${P.bgPanel}f8`, backdropFilter: "blur(16px)" }}>

        <motion.button
          whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg jp-sans font-bold"
          style={{ fontSize: 10, color: P.inkMid, background: P.inkGhost, border: `1px solid ${P.borderFaint}`, padding: "5px 10px" }}>
          ← 戻る
        </motion.button>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="rounded-md flex-shrink-0"
            style={{ background: P.vermGlow, border: `1px solid ${P.vermBorder}`, padding: "3px 6px" }}>
            <ExternalLink style={{ width: 10, height: 10, color: P.verm }} />
          </div>
          <span className="jp-sans truncate" style={{ fontSize: 10, color: P.inkFaint }}>
            {(() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })()}
          </span>
        </div>

        <a href={url} target="_blank" rel="noopener noreferrer" title="Open in new tab"
          className="flex items-center gap-1.5 rounded-lg jp-sans font-bold"
          style={{ fontSize: 10, color: P.verm, background: P.vermGlow,
            border: `1px solid ${P.vermBorder}`, padding: "5px 10px", textDecoration: "none" }}>
          新しいタブ <ExternalLink style={{ width: 9, height: 9 }} />
        </a>
      </div>

      {/* Torii line */}
      <div style={{ height: 1, flexShrink: 0,
        background: `linear-gradient(90deg, transparent, ${P.verm}, ${P.gold}, ${P.verm}, transparent)`,
        opacity: 0.45 }}/>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">

        {/* Loading spinner */}
        {state === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
            style={{ background: P.bgDeep }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              style={{ width: 28, height: 28, borderRadius: "50%",
                border: `2px solid ${P.vermBorder}`, borderTopColor: P.verm }}
            />
            <span className="jp-sans" style={{ fontSize: 10, color: P.inkFaint }}>
              読み込み中… Fetching article
            </span>
          </div>
        )}

        {/* Error fallback */}
        {state === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
            style={{ background: P.bgDeep }}>
            <ToriiIcon size={40} color={P.vermDim} />
            <p className="jp-sans text-center"
              style={{ fontSize: 11, color: P.inkFaint, maxWidth: 220 }}>
              Preview unavailable for this article.
            </p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="jp-sans font-bold rounded-lg px-4 py-2"
              style={{ fontSize: 11, background: P.vermGlow,
                border: `1px solid ${P.vermBorder}`, color: P.verm, textDecoration: "none" }}>
              記事を新しいタブで開く · Open in new tab
            </a>
          </div>
        )}

        {/*
          blob: URL iframe — no network request from the iframe itself,
          so X-Frame-Options / CSP on the original site are completely bypassed.
          `allow-scripts` lets article JS run (lazy-load images, etc.).
          We intentionally omit `allow-same-origin` to keep the iframe sandboxed
          from the parent page.
        */}
        <iframe
          key={blobUrl ?? "empty"}
          src={blobUrl ?? "about:blank"}
          className="w-full h-full border-none"
          title="Article preview"
          onLoad={handleIframeLoad}
          style={{
            background: "#fff",
            opacity: state === "ready" ? 1 : 0,
            transition: "opacity 0.35s ease",
          }}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────
//   MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
// Auto-refresh interval: 90 seconds while modal is open
const AUTO_REFRESH_MS = 90_000;
// Debounce delay before firing a backend search
const SEARCH_DEBOUNCE_MS = 500;

export function NewsModal({ isOpen, onClose }: NewsModalProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false); // true while /news/search is in-flight
  const [activeCategory, setActiveCategory] = useState("All");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [featuredHovered, setFeaturedHovered] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancels any in-flight /news/search request when a new one starts
  const searchAbortRef = useRef<AbortController | null>(null);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Article AI-summary panel ──────────────────────────────────────────────
  const [selectedArticle,  setSelectedArticle]  = useState<NewsItem | null>(null);
  const [summary,          setSummary]           = useState("");
  const [summaryLoading,   setSummaryLoading]    = useState(false);
  const [summaryStreaming,  setSummaryStreaming]  = useState(false);
  const [summaryError,     setSummaryError]      = useState<string | null>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);

  const fetchNews = useCallback(async (categoryQuery?: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setFetchError("Not authenticated. Please sign in.");
        return;
      }
      const cat = categoryQuery ?? "";
      const url = `${BACKEND_URL}/news${cat ? `?category=${encodeURIComponent(cat)}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to fetch news (${res.status})`);
      const data = await res.json();
      // Handle various backend response shapes gracefully
      const articles: NewsItem[] = Array.isArray(data)
        ? data
        : (data.news ?? data.articles ?? data.results ?? data.data ?? []);
      setNews(articles);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Error fetching news:", err);
      setFetchError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, []); // no state deps – category is always passed explicitly

  // Stable ref so the debounce callback always reads the latest activeCategory
  const activeCategoryRef = useRef(activeCategory);
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);

  // ── Core search executor — fires immediately with the given query ─────────
  const executeSearch = useCallback(async (query: string) => {
    // Cancel any in-flight search
    searchAbortRef.current?.abort();
    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;

    setSearching(true);
    setSearchError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSearchError("Not authenticated. Please sign in.");
        return;
      }
      const res = await fetch(
        `${BACKEND_URL}/news/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctrl.signal },
      );
      if (!res.ok) {
        setSearchError(`Search failed (${res.status}). Please try again.`);
        return;
      }
      const data = await res.json();
      const articles: NewsItem[] = Array.isArray(data)
        ? data : (data.news ?? data.articles ?? data.results ?? []);
      setNews(articles);
      setSearchError(articles.length === 0 ? null : null); // clear on success
      setLastRefreshed(new Date());
    } catch (err: any) {
      if (err?.name === "AbortError") return; // cancelled — not an error
      console.error("[Search] error:", err);
      setSearchError("Search failed. Check your connection.");
    } finally {
      setSearching(false);
    }
  }, []);

  // Called by the search <input> onChange — debounces 500 ms then fires
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setSearchError(null);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!value.trim()) {
      // Cleared — cancel any in-flight search and restore the category feed
      searchAbortRef.current?.abort();
      setSearching(false);
      const cat = CATEGORIES.find(c => c.en === activeCategoryRef.current)?.query;
      fetchNews(cat);
      return;
    }

    if (value.trim().length < 2) {
      // Too short — don't fire, but don't reset results either; just wait
      return;
    }

    // Debounce: fire the real Tavily search 500 ms after the user stops typing
    searchDebounceRef.current = setTimeout(() => {
      executeSearch(value.trim());
    }, 500);
  }, [fetchNews, executeSearch]);

  // Called when user presses Enter in the search box — fires immediately
  const handleSearchSubmit = useCallback(() => {
    const query = search.trim();
    if (query.length < 2) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    executeSearch(query);
  }, [search, executeSearch]);

  // Opens the AI-summary panel and streams from /summarize via SSE
  const openArticleSummary = useCallback(async (article: NewsItem) => {
    summaryAbortRef.current?.abort();
    const ctrl = new AbortController();
    summaryAbortRef.current = ctrl;

    setSelectedArticle(article);
    setSummary("");
    setSummaryError(null);
    setSummaryLoading(true);
    setSummaryStreaming(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${BACKEND_URL}/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: article.url, title: article.title, content: article.content }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      if (!res.body) throw new Error("No response body");

      setSummaryLoading(false);
      setSummaryStreaming(true);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by \n\n — same pattern as useChat.ts
        while (true) {
          const idx = buffer.indexOf("\n\n");
          if (idx === -1) break;                       // wait for more data
          const event = buffer.slice(0, idx);
          buffer      = buffer.slice(idx + 2);
          if (!event.trim()) continue;

          // Collect all data: lines for this event
          const dataLines: string[] = [];
          for (const line of event.split("\n")) {
            if (line.startsWith("data: ")) dataLines.push(line.slice(6));
          }
          const payload = dataLines.join("\n");
          if (!payload) continue;
          if (payload === "[DONE]") break outer;       // stream finished
          setSummary(prev => prev + payload);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[Summary]", err);
      setSummaryError(err?.message ?? "Could not generate summary.");
    } finally {
      setSummaryLoading(false);
      setSummaryStreaming(false);
    }
  }, []);

  // Single effect: fires on modal open AND on category change (no double-fetch on mount)
  // Clears search when category changes so the query doesn't linger
  useEffect(() => {
    if (!isOpen) return;
    // If there's an active search, don't override with category fetch
    if (search.trim()) return;
    const cat = CATEGORIES.find(c => c.en === activeCategory)?.query;
    fetchNews(cat);
    // Only focus the search input when the modal first opens
    if (activeCategory === "All") {
      setTimeout(() => searchRef.current?.focus(), 420);
    }
  }, [isOpen, activeCategory, fetchNews]); // intentionally excludes `search`

  // Auto-refresh every 90 s while modal is open and no search is active
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => {
      if (search.trim()) return; // don't clobber search results
      const cat = CATEGORIES.find(c => c.en === activeCategory)?.query;
      fetchNews(cat);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [isOpen, activeCategory, search, fetchNews]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedArticle) { summaryAbortRef.current?.abort(); setSelectedArticle(null); }
        else onClose();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  // news IS the result set in all cases — no client-side re-filtering
  const filteredNews = news;

  const featured  = filteredNews[0] ?? null;
  const gridItems = filteredNews.slice(1);

  // CSS ticker text
  const tickerText = news.map(n => `　【速報】${n.title}　`).join("　　");

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          style={{ background: P.bg }}
        >
          {/* ── Fonts + global keyframes ─────────────────────── */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700;900&family=Noto+Sans+JP:wght@300;400;500;700&family=Shippori+Mincho:wght@400;500;600;700;800&display=swap');
            .jp-serif  { font-family: 'Shippori Mincho', 'Noto Serif JP', serif !important; }
            .jp-sans   { font-family: 'Noto Sans JP', sans-serif !important; }
            .jp-brand  { font-family: 'Shippori Mincho', serif !important; }
            .scrollbar-hide::-webkit-scrollbar { display: none; }
            .scrollbar-hide { scrollbar-width: none; }

            @keyframes ticker-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .ticker-inner { animation: ticker-scroll 55s linear infinite; }
            .ticker-inner:hover { animation-play-state: paused; }

            @keyframes torii-pulse {
              0%,100% { opacity: 1; filter: drop-shadow(0 0 4px ${P.verm}88); }
              50%      { opacity: 0.82; filter: drop-shadow(0 0 8px ${P.verm}cc); }
            }
            .torii-pulse { animation: torii-pulse 3.5s ease-in-out infinite; }

            @keyframes live-dot {
              0%,100% { opacity: 0.5; transform: scale(1); }
              50%      { opacity: 1;   transform: scale(1.35); }
            }
            .live-dot { animation: live-dot 1.8s ease-in-out infinite; }

            @keyframes ink-reveal {
              from { clip-path: inset(0 100% 0 0); opacity: 0; }
              to   { clip-path: inset(0 0% 0 0);   opacity: 1; }
            }
            .ink-reveal { animation: ink-reveal 0.55s cubic-bezier(0.16,1,0.3,1) forwards; }

            @keyframes bell-ring {
              0%,100% { transform: rotate(0deg); }
              25%      { transform: rotate(-14deg); }
              75%      { transform: rotate(14deg); }
            }

            @keyframes summary-blink {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0; }
            }
            .summary-cursor { animation: summary-blink 0.9s step-end infinite; }
            @keyframes petal-shimmer {
              0%,100% { opacity: 0.5; }
              50%      { opacity: 0.9; }
            }
          `}</style>

          {/* ── Ambient radial glow ──────────────────────────── */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div style={{
              position: "absolute", top: "-15%", left: "-10%",
              width: "65%", height: "65%", borderRadius: "50%",
              background: `radial-gradient(circle, ${P.vermGlow} 0%, transparent 70%)`,
            }}/>
            <div style={{
              position: "absolute", bottom: "-10%", right: "-5%",
              width: "50%", height: "50%", borderRadius: "50%",
              background: `radial-gradient(circle, ${P.sakuraDim} 0%, transparent 70%)`,
            }}/>
            {/* Washi paper texture overlay */}
            <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.018 }}>
              <filter id="washi">
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="8"/>
                <feColorMatrix type="saturate" values="0"/>
              </filter>
              <rect width="100%" height="100%" filter="url(#washi)" fill={P.paper}/>
            </svg>
            {/* Vertical edge pillars */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
              background: `linear-gradient(180deg, transparent, ${P.verm}80, ${P.gold}60, ${P.verm}80, transparent)`,
            }}/>
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: 2,
              background: `linear-gradient(180deg, transparent, ${P.verm}80, ${P.gold}60, ${P.verm}80, transparent)`,
            }}/>
          </div>

          {/* ── Floating sakura petals ───────────────────────── */}
          {[0,1,2,3,4,5,6,7].map(i => (
            <SakuraPetal key={i} delay={i} x={4 + i * 13} size={8 + (i % 3) * 3}/>
          ))}

          {/* ── HEADER ──────────────────────────────────────── */}
          <motion.header
            initial={{ y: -28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05, type: "spring", stiffness: 300, damping: 32 }}
            className="relative z-10 shrink-0 flex items-center gap-4 px-5 py-3"
            style={{
              background: `${P.bgPanel}f5`,
              borderBottom: `1px solid ${P.border}`,
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Brand */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="torii-pulse relative flex items-center justify-center"
                style={{
                  width: 42, height: 42,
                  background: P.vermGlow,
                  border: `1.5px solid ${P.vermBorder}`,
                  borderRadius: 11,
                }}>
                <ToriiIcon size={22} color={P.verm} />
                {/* Live indicator */}
                <span className="live-dot absolute -top-1 -right-1 rounded-full"
                  style={{ width: 8, height: 8, background: P.sakura, boxShadow: `0 0 6px ${P.sakura}` }}/>
              </div>
              <div>
                <div className="flex items-baseline gap-2.5">
                  <h1 className="jp-brand font-black tracking-tight" style={{ fontSize: 13, color: P.paper }}>
                    ニュース速報
                  </h1>
                  <span className="jp-sans font-bold uppercase tracking-[0.22em]"
                    style={{ fontSize: 9, color: P.vermDim }}>LIVE NEWS</span>
                </div>
                <p className="jp-sans tracking-[0.16em] uppercase mt-0.5"
                  style={{ fontSize: 9, color: P.inkFaint }}>
                  世界の今を届ける · Real-time Global Updates
                </p>
              </div>
            </div>

            {/* Decorative crossbeam rule */}
            <div className="hidden lg:flex flex-1 items-center gap-3 px-4">
              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${P.border}, transparent)` }}/>
              <SakuraIcon size={10} color={P.sakura} opacity={0.4}/>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${P.border})` }}/>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-xs">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200"
                style={{
                  background: P.inkGhost,
                  border: `1px solid ${P.borderFaint}`,
                }}>
                <SearchIcon size={14} color={searching ? P.verm : P.vermDim}/>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="検索 · Search headlines…"
                  value={search}
                  onChange={e => handleSearchChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSearchSubmit(); }}
                  className="jp-sans flex-1 bg-transparent outline-none min-w-0"
                  style={{ fontSize: 12, color: P.ink, caretColor: P.verm }}
                />
                {searching && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                    style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                      border: `1.5px solid ${P.vermBorder}`, borderTopColor: P.verm }}
                  />
                )}
                {search && !searching && (
                  <button onClick={() => handleSearchChange("")}
                    className="rounded transition-colors"
                    style={{ color: P.inkMid }}>
                    <X style={{ width: 12, height: 12 }}/>
                  </button>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {lastRefreshed && (
                <span className="hidden sm:flex items-center gap-1.5 jp-sans"
                  style={{ fontSize: 9, color: P.inkFaint }}>
                  <Clock style={{ width: 11, height: 11 }}/>
                  {timeAgo(lastRefreshed.toISOString())}
                </span>
              )}
              <button
                onClick={() => {
                  handleSearchChange(""); // clears search AND restores category feed
                }}
                disabled={loading || searching}
                className="flex items-center gap-1.5 rounded-lg transition-all disabled:opacity-40"
                style={{
                  background: P.inkGhost,
                  border: `1px solid ${P.borderFaint}`,
                  padding: "5px 10px",
                  color: P.inkMid,
                }}>
                <BellIcon size={13} color={P.inkMid} spinning={loading || searching}/>
                <span className="jp-sans hidden sm:inline" style={{ fontSize: 10 }}>更新</span>
              </button>

              <button
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg transition-all"
                style={{
                  background: `${P.verm}18`,
                  border: `1px solid ${P.vermBorder}`,
                  padding: "5px 10px",
                  color: P.verm,
                }}>
                <X style={{ width: 13, height: 13 }}/>
                <span className="jp-sans font-bold" style={{ fontSize: 10 }}>閉じる</span>
              </button>
            </div>
          </motion.header>

          {/* ── Torii crossbeam rule ─────────────────────────── */}
          <div className="relative z-10 shrink-0" style={{ height: 1 }}>
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(90deg, transparent 0%, ${P.verm} 20%, ${P.gold} 50%, ${P.verm} 80%, transparent 100%)`,
              opacity: 0.55,
            }}/>
          </div>

          {/* ── NEWS TICKER ─────────────────────────────────── */}
          {news.length > 0 && (
            <div className="relative z-10 shrink-0 overflow-hidden"
              style={{ height: 26, background: P.bgPanel, borderBottom: `1px solid ${P.borderFaint}` }}>
              <div className="flex items-center h-full">
                {/* Badge */}
                <div className="shrink-0 h-full flex items-center px-3 jp-sans font-black tracking-widest"
                  style={{
                    fontSize: 9, letterSpacing: "0.14em",
                    background: `linear-gradient(135deg, ${P.vermDim}, ${P.verm})`,
                    color: P.bg,
                    borderRight: `1px solid ${P.vermBorder}`,
                  }}>
                  速報
                </div>
                <div className="overflow-hidden flex-1 relative">
                  {/* Fade edges */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
                    background: `linear-gradient(90deg, ${P.bgPanel}, transparent)`,
                  }}/>
                  <div style={{
                    position: "absolute", right: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
                    background: `linear-gradient(270deg, ${P.bgPanel}, transparent)`,
                  }}/>
                  <div className="ticker-inner whitespace-nowrap jp-sans font-medium"
                    style={{ fontSize: 10, color: P.inkMid, letterSpacing: "0.03em", display: "inline-block" }}>
                    {tickerText}{tickerText}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CATEGORY TABS ───────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative z-10 shrink-0 flex items-center gap-1.5 px-5 py-2.5 overflow-x-auto scrollbar-hide"
            style={{ background: `${P.bg}e8`, borderBottom: `1px solid ${P.borderFaint}` }}
          >
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.en;
              return (
                <motion.button
                  key={cat.en}
                  onClick={() => setActiveCategory(cat.en)}
                  whileTap={{ scale: 0.95 }}
                  className="jp-sans shrink-0 flex items-center gap-1.5 rounded-lg font-bold transition-all duration-200"
                  style={{
                    padding: "5px 11px",
                    fontSize: 11,
                    background: isActive
                      ? `linear-gradient(135deg, ${P.vermDim}, ${P.verm})`
                      : P.inkGhost,
                    border: `1px solid ${isActive ? P.vermBorder : P.borderFaint}`,
                    color: isActive ? P.bg : P.inkMid,
                    boxShadow: isActive ? `0 0 12px ${P.verm}22` : "none",
                  }}
                >
                  {isActive && <SakuraIcon size={9} color={P.bg} opacity={0.7}/>}
                  {cat.label}
                  <span style={{ fontSize: 8, opacity: 0.6 }}>{cat.en}</span>
                </motion.button>
              );
            })}

            {/* Live badge */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <span className="live-dot rounded-full"
                style={{ width: 6, height: 6, display: "inline-block", background: P.sakura, boxShadow: `0 0 4px ${P.sakura}` }}/>
              <span className="jp-sans font-bold uppercase tracking-widest"
                style={{ fontSize: 8, color: P.vermDim }}>ライブ</span>
            </div>
          </motion.div>

          {/* ── MAIN CONTENT ────────────────────────────────── */}
          <div className="relative z-10 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">

              {/* Loading — full screen only for initial/category fetch, NOT for search */}
              {loading && (
                <motion.div key="loading"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-6">
                  <div className="relative" style={{ width: 80, height: 80 }}>
                    {/* Outer ring */}
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      style={{
                        position: "absolute", inset: 0, borderRadius: "50%",
                        border: `1.5px solid transparent`,
                        borderTopColor: P.verm,
                        borderRightColor: P.vermDim,
                      }}/>
                    {/* Inner ring */}
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                      style={{
                        position: "absolute", inset: 8, borderRadius: "50%",
                        border: `1px solid transparent`,
                        borderTopColor: P.sakura,
                        borderLeftColor: P.sakuraBorder,
                      }}/>
                    {/* Torii center */}
                    <div style={{
                      position: "absolute", inset: 16,
                      background: P.vermGlow,
                      borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <ToriiIcon size={24} color={P.verm}/>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="jp-brand font-bold" style={{ fontSize: 13, color: P.inkMid }}>
                      情報収集中…
                    </p>
                    <p className="jp-sans mt-1.5" style={{ fontSize: 10, color: P.inkFaint }}>
                      Gathering the world's stories via Tavily
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Error */}
              {!loading && fetchError && (
                <motion.div key="error"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-4">
                  <ToriiIcon size={48} color={P.vermDim}/>
                  <div className="text-center">
                    <p className="jp-brand font-black" style={{ fontSize: 13, color: P.verm }}>エラー</p>
                    <p className="jp-sans mt-1.5" style={{ fontSize: 11, color: P.inkFaint }}>{fetchError}</p>
                    <button
                      onClick={() => fetchNews(CATEGORIES.find(c => c.en === activeCategory)?.query)}
                      className="mt-3 jp-sans font-bold rounded-lg px-4 py-2"
                      style={{ fontSize: 11, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.verm }}>
                      再試行 · Retry
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Search error banner */}
              {searchError && !loading && (
                <motion.div key="search-error"
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-xl jp-sans"
                  style={{ fontSize: 11, color: P.verm, background: P.vermGlow,
                    border: `1px solid ${P.vermBorder}`, backdropFilter: "blur(8px)" }}>
                  <span>⚠</span> {searchError}
                </motion.div>
              )}

              {/* Empty */}
              {!loading && !searching && !fetchError && filteredNews.length === 0 && (
                <motion.div key="empty"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-4">
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                    <ToriiIcon size={48} color={P.vermDim}/>
                  </motion.div>
                  <div className="text-center" style={{ opacity: 0.45 }}>
                    <p className="jp-brand font-black" style={{ fontSize: 32, color: P.verm }}>無</p>
                    <p className="jp-sans font-bold uppercase tracking-widest mt-1"
                      style={{ fontSize: 10, color: P.ink }}>No results · 結果なし</p>
                  </div>
                </motion.div>
              )}

              {/* Content — shown whenever there are results, even while a new search is loading */}
              {!loading && filteredNews.length > 0 && (
                <motion.div key={search.trim() && !searching ? `search-${search}` : `cat-${activeCategory}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="h-full flex overflow-hidden">

                  {/* ── LEFT PANEL: Kana rail + Featured ──── */}
                  <div className="hidden lg:flex shrink-0 flex-col overflow-hidden"
                    style={{ width: "36%", borderRight: `1px solid ${P.border}` }}>

                    {/* Section label */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
                      style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                      <ScrollIcon size={13} color={P.verm}/>
                      <span className="jp-sans font-black tracking-widest uppercase"
                        style={{ fontSize: 8, color: P.verm }}>特集記事</span>
                      <span className="jp-sans tracking-widest"
                        style={{ fontSize: 8, color: P.inkFaint }}>TOP STORY</span>
                      <div className="flex-1 h-px ml-1" style={{ background: `linear-gradient(90deg, ${P.vermBorder}, transparent)` }}/>
                    </div>

                    <div className="flex flex-1 overflow-hidden min-h-0">
                      {/* Kana side rail */}
                      <div className="flex flex-col justify-around items-center py-6 shrink-0"
                        style={{ width: 26, borderRight: `1px solid ${P.borderFaint}` }}>
                        {KANA_RAIL.map((k, i) => (
                          <span key={i} className="jp-serif font-black"
                            style={{
                              writingMode: "vertical-rl",
                              fontSize: 9,
                              color: i % 3 === 0 ? P.verm : P.inkFaint,
                              opacity: 0.65,
                              letterSpacing: "0.3em",
                            }}>
                            {k}
                          </span>
                        ))}
                      </div>

                      {/* Featured article body */}
                      {featured && (
                        <motion.div
                          initial={{ x: -16, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.12, type: "spring", stiffness: 220, damping: 28 }}
                          className="flex-1 overflow-y-auto p-5 scrollbar-hide cursor-pointer group"
                          style={{ scrollbarWidth: "none" }}
                          onMouseEnter={() => setFeaturedHovered(true)}
                          onMouseLeave={() => setFeaturedHovered(false)}
                          onClick={() => openArticleSummary(featured)}
                        >
                          {/* Source + reading time */}
                          <div className="flex items-center justify-between mb-3">
                            <span className="jp-sans font-black px-2 py-0.5 rounded"
                              style={{
                                fontSize: 9, letterSpacing: "0.1em",
                                background: P.vermGlow,
                                border: `1px solid ${P.vermBorder}`,
                                color: P.gold,
                              }}>
                              {featured.source}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="jp-sans" style={{ fontSize: 9, color: P.inkFaint }}>
                                {readingTime(featured.content)} 読み
                              </span>
                              <span className="jp-sans" style={{ fontSize: 9, color: P.inkFaint }}>
                                {timeAgo(featured.publishedDate)}
                              </span>
                            </div>
                          </div>

                          {/* Kanji stamp badge */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className="jp-serif font-black px-2 py-0.5 rounded"
                              style={{
                                fontSize: 10,
                                background: `${P.verm}20`,
                                border: `1px solid ${P.vermBorder}`,
                                color: P.verm,
                                letterSpacing: "0.05em",
                              }}>
                              {KANJI_STAMPS[0]}
                            </span>
                            <BrushDivider color={P.verm} opacity={0.3}/>
                          </div>

                          {/* Title */}
                          <h2 className="jp-brand font-black leading-snug mb-4 transition-colors duration-300"
                            style={{
                              fontSize: 17,
                              color: featuredHovered ? P.verm : P.paper,
                              lineHeight: 1.52,
                            }}>
                            {featured.title}
                          </h2>

                          {/* Ink-line divider */}
                          <div className="mb-4">
                            <BrushDivider color={P.verm} opacity={0.35}/>
                          </div>

                          {/* Excerpt */}
                          <p className="jp-sans leading-relaxed mb-5"
                            style={{ fontSize: 11, color: P.inkMid, lineHeight: 1.9 }}>
                            {featured.content.slice(0, 280)}{featured.content.length > 280 ? "…" : ""}
                          </p>

                          {/* CTA */}
                          <motion.div
                            className="flex items-center gap-2 jp-sans font-bold"
                            animate={{ gap: featuredHovered ? "10px" : "6px" }}
                            transition={{ duration: 0.2 }}
                            style={{ fontSize: 11, color: P.verm }}>
                            <ReadArrowIcon size={13} color={P.verm}/>
                            記事を読む · Read article
                          </motion.div>

                          {/* Mon seal */}
                          <div className="mt-8 flex justify-end">
                            <motion.div
                              animate={{ rotate: featuredHovered ? -8 : -14 }}
                              transition={{ type: "spring", stiffness: 200 }}>
                              <MonSealIcon size={44} char="読" color={P.verm}/>
                            </motion.div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {/* ── RIGHT PANEL: Article grid ──────────── */}
                  <div className="flex-1 overflow-y-auto p-4 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(featured ? gridItems : filteredNews).map((item, i) => {
                        const isHov = hoveredIndex === i;
                        return (
                          <motion.article
                            key={item.url}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: i * 0.04 + 0.06,
                              type: "spring",
                              stiffness: 260,
                              damping: 26,
                            }}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            onClick={() => openArticleSummary(item)}
                            className="flex flex-col rounded-xl overflow-hidden cursor-pointer"
                            style={{
                              background: isHov ? P.bgCardHover : P.bgCard,
                              border: `1px solid ${isHov ? P.vermBorderHov : P.borderFaint}`,
                              transform: isHov ? "translateY(-3px)" : "translateY(0)",
                              transition: "transform 0.22s ease, border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease",
                              boxShadow: isHov
                                ? `0 8px 32px rgba(196,80,42,0.12), inset 0 1px 0 ${P.vermBorder}`
                                : "none",
                            }}
                          >
                            {/* Accent rule top */}
                            <div style={{
                              height: 2,
                              background: isHov
                                ? `linear-gradient(90deg, ${P.verm}, ${P.sakura}, transparent)`
                                : "transparent",
                              transition: "background 0.3s ease",
                            }}/>

                            <div className="p-4 flex flex-col flex-1">
                              {/* Header row */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="jp-sans font-black px-1.5 py-0.5 rounded"
                                    style={{
                                      fontSize: 8, letterSpacing: "0.08em",
                                      background: P.vermGlow,
                                      border: `1px solid ${P.vermBorder}`,
                                      color: P.gold,
                                    }}>
                                    {item.source}
                                  </span>
                                  <span className="jp-serif font-black"
                                    style={{ fontSize: 8, color: P.verm, opacity: 0.7 }}>
                                    {KANJI_STAMPS[i % KANJI_STAMPS.length]}
                                  </span>
                                </div>
                                <span className="jp-sans shrink-0"
                                  style={{ fontSize: 8, color: P.inkFaint }}>
                                  {timeAgo(item.publishedDate)}
                                </span>
                              </div>

                              {/* Title */}
                              <h3 className="jp-brand font-bold line-clamp-2 mb-2.5 transition-colors duration-200"
                                style={{
                                  fontSize: 12,
                                  color: isHov ? P.verm : P.ink,
                                  lineHeight: 1.55,
                                }}>
                                {item.title}
                              </h3>

                              {/* Excerpt */}
                              <p className="jp-sans line-clamp-3 leading-relaxed flex-1"
                                style={{ fontSize: 10, color: P.inkFaint, lineHeight: 1.8 }}>
                                {item.content}
                              </p>

                              {/* Footer */}
                              <div className="flex items-center justify-between pt-3 mt-3"
                                style={{ borderTop: `1px solid ${P.borderFaint}` }}>
                                <div className="flex items-center gap-1.5 jp-sans font-bold transition-colors"
                                  style={{ fontSize: 9, color: isHov ? P.verm : P.inkFaint }}>
                                  <ReadArrowIcon size={10} color={isHov ? P.verm : P.inkFaint}/>
                                  読む
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="jp-sans" style={{ fontSize: 8, color: P.inkFaint }}>
                                    {readingTime(item.content)}
                                  </span>
                                  <div className="flex items-center justify-center rounded-lg transition-all"
                                    style={{
                                      width: 24, height: 24,
                                      background: isHov ? P.verm : P.inkGhost,
                                    }}>
                                    <ExternalLink style={{ width: 10, height: 10, color: isHov ? P.bg : P.inkFaint }}/>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.article>
                        );
                      })}
                    </div>
                    {/* Bottom spacer */}
                    <div style={{ height: 32 }}/>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>

            {/* ══ AI ARTICLE SUMMARY PANEL — slides in from right ════════════ */}
            <AnimatePresence>
              {selectedArticle && (
                <motion.div
                  className="absolute inset-0 z-30 flex flex-col"
                  initial={{ x: "100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "100%", opacity: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 36 }}
                  style={{ background: P.bg }}
                >
                  {/* Nami texture */}
                  <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.016 }}>
                    <svg className="absolute inset-0 w-full h-full">
                      <defs>
                        <pattern id="nami-s" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
                          <path d="M0 10 Q5 4 10 10 Q15 16 20 10 Q25 4 30 10 Q35 16 40 10"
                            stroke={P.verm} strokeWidth="0.8" fill="none"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#nami-s)"/>
                    </svg>
                  </div>
                  <div className="pointer-events-none absolute" style={{
                    top: "-10%", right: "-5%", width: "55%", height: "65%", borderRadius: "50%",
                    background: `radial-gradient(circle, ${P.sakuraDim} 0%, transparent 70%)`,
                  }}/>

                  {/* ── Panel header ───────────────────────────────────── */}
                  <div className="flex items-center gap-3 px-5 py-3 shrink-0"
                    style={{ borderBottom: `1px solid ${P.border}`, background: `${P.bgPanel}f5`, backdropFilter: "blur(16px)" }}>

                    <motion.button
                      whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }}
                      onClick={() => { summaryAbortRef.current?.abort(); setSelectedArticle(null); }}
                      className="flex items-center gap-1.5 rounded-lg jp-sans font-bold"
                      style={{ fontSize: 10, color: P.inkMid, background: P.inkGhost, border: `1px solid ${P.borderFaint}`, padding: "5px 10px" }}>
                      ← 戻る
                    </motion.button>

                    <div className="flex-1 flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ scale: [1, 1.35, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{ width: 6, height: 6, borderRadius: "50%", background: P.sakura, boxShadow: `0 0 6px ${P.sakura}` }}
                      />
                      <span className="jp-brand font-black tracking-wide" style={{ fontSize: 11, color: P.sakura }}>AI 要約</span>
                      <span className="jp-sans" style={{ fontSize: 9, color: P.inkFaint }}>· AI Summary</span>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
                      onClick={() => setPeekUrl(selectedArticle.url)}
                      className="flex items-center gap-1.5 rounded-lg jp-sans font-bold"
                      style={{ fontSize: 10, color: P.verm, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, padding: "5px 10px" }}>
                      記事を開く <ExternalLink style={{ width: 10, height: 10 }}/>
                    </motion.button>
                  </div>

                  {/* Torii crossbeam */}
                  <div style={{ height: 1, flexShrink: 0,
                    background: `linear-gradient(90deg, transparent, ${P.verm}, ${P.gold}, ${P.verm}, transparent)`,
                    opacity: 0.5 }}/>

                  {/* ── Article meta ────────────────────────────────────── */}
                  <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: `1px solid ${P.borderFaint}` }}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="jp-sans font-black px-2 py-0.5 rounded"
                        style={{ fontSize: 8, letterSpacing: "0.1em", background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.gold }}>
                        {selectedArticle.source}
                      </span>
                      <span className="jp-sans" style={{ fontSize: 9, color: P.inkFaint }}>
                        {timeAgo(selectedArticle.publishedDate)} · {readingTime(selectedArticle.content)} 読み
                      </span>
                      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${P.vermBorder}, transparent)` }}/>
                    </div>
                    <h2 className="jp-brand font-black leading-snug"
                      style={{ fontSize: 16, color: P.paper, lineHeight: 1.5 }}>
                      {selectedArticle.title}
                    </h2>
                  </div>

                  {/* ── Summary body ─────────────────────────────────────── */}
                  <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide" style={{ scrollbarWidth: "none" }}>

                    <div className="flex items-center gap-2.5 mb-5">
                      <div style={{ width: 3, height: 16, borderRadius: 2, flexShrink: 0,
                        background: `linear-gradient(180deg, ${P.verm}, ${P.sakura})` }}/>
                      <span className="jp-serif font-black tracking-widest"
                        style={{ fontSize: 9, color: P.verm, letterSpacing: "0.18em" }}>AI 要約 · SUMMARY</span>
                      <SakuraIcon size={9} color={P.sakura} opacity={0.5}/>
                    </div>

                    {/* Loading skeleton */}
                    {summaryLoading && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                        {[100, 88, 94, 76, 96, 68, 85, 55].map((w, i) => (
                          <motion.div key={i}
                            style={{
                              height: 9, borderRadius: 5, width: `${w}%`,
                              background: `linear-gradient(90deg, ${P.inkGhost} 25%, ${P.paperFaint} 50%, ${P.inkGhost} 75%)`,
                              backgroundSize: "200% 100%",
                            }}
                            animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: i * 0.07 }}
                          />
                        ))}
                        <div className="flex items-center gap-2 mt-3">
                          <motion.div animate={{ rotate: 360 }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                            style={{ width: 12, height: 12, borderRadius: "50%",
                              border: `1.5px solid ${P.vermBorder}`, borderTopColor: P.verm, flexShrink: 0 }}/>
                          <span className="jp-sans" style={{ fontSize: 9, color: P.vermDim }}>
                            要約生成中… Generating summary via NIM
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {/* Error */}
                    {summaryError && !summaryLoading && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-16 gap-4">
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                          <ToriiIcon size={44} color={P.vermDim}/>
                        </motion.div>
                        <p className="jp-sans text-center max-w-xs leading-relaxed"
                          style={{ fontSize: 11, color: P.inkFaint }}>{summaryError}</p>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={() => openArticleSummary(selectedArticle)}
                          className="jp-sans font-bold rounded-lg px-4 py-2"
                          style={{ fontSize: 10, background: P.vermGlow, border: `1px solid ${P.vermBorder}`, color: P.verm }}>
                          再試行 · Retry
                        </motion.button>
                      </motion.div>
                    )}

                    {/* Streaming text — rendered as structured markdown */}
                    {!summaryLoading && !summaryError && (summary || summaryStreaming) && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="mb-5"><BrushDivider color={P.verm} opacity={0.25}/></div>
                        <SummaryRenderer text={summary} streaming={summaryStreaming} />
                      </motion.div>
                    )}
                  </div>

                  {/* ── Peek Panel — overlays the summary panel ───────── */}
                  <AnimatePresence>
                    {peekUrl && (
                      <NewsPeekPanel url={peekUrl} onClose={() => setPeekUrl(null)} />
                    )}
                  </AnimatePresence>

                  {/* ── Footer CTA ──────────────────────────────────────── */}
                  <div className="px-5 py-4 shrink-0"
                    style={{ borderTop: `1px solid ${P.borderFaint}`, background: `${P.bgPanel}f2` }}>
                    <motion.button
                      whileHover={{ scale: 1.01, boxShadow: `0 6px 24px ${P.verm}30` }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setPeekUrl(selectedArticle.url)}
                      className="w-full flex items-center justify-center gap-3 jp-sans font-bold rounded-xl py-3"
                      style={{
                        fontSize: 12,
                        background: `linear-gradient(135deg, ${P.vermDim}, ${P.verm})`,
                        color: P.bg,
                        border: `1px solid ${P.vermBorderHov}`,
                      }}>
                      <ReadArrowIcon size={13} color={P.bg}/>
                      記事全文を読む · Read Full Article
                      <ExternalLink style={{ width: 11, height: 11 }}/>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* ── FOOTER ──────────────────────────────────────── */}
          <motion.footer
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="relative z-10 flex items-center justify-between px-6 py-2.5 shrink-0"
            style={{
              background: `${P.bgPanel}f2`,
              borderTop: `1px solid ${P.border}`,
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Left: Live status */}
            <div className="flex items-center gap-3">
              <span className="live-dot rounded-full"
                style={{ width: 6, height: 6, display: "inline-block", background: P.verm, boxShadow: `0 0 5px ${P.verm}` }}/>
              <span className="jp-sans font-bold uppercase tracking-widest"
                style={{ fontSize: 8, color: P.vermDim }}>ライブ配信中 · LIVE</span>
              <span className="jp-sans hidden sm:inline" style={{ fontSize: 8, color: P.inkFaint }}>
                  {search.trim() ? "Tavily Search" : "Tavily AI"}
                </span>
            </div>

            {/* Center: haiku */}
            <div className="hidden sm:flex items-center gap-3">
              <SakuraIcon size={9} color={P.sakura} opacity={0.35}/>
              <span className="jp-serif font-black" style={{ fontSize: 9, color: P.borderFaint }}>
                速報ニュース
              </span>
              <SakuraIcon size={9} color={P.sakura} opacity={0.35}/>
            </div>

            {/* Right: counts */}
            <div className="flex items-center gap-3">
              <span className="jp-sans" style={{ fontSize: 9, color: P.inkFaint }}>
                {filteredNews.length} 記事
              </span>
              {lastRefreshed && (
                <span className="hidden sm:block jp-sans" style={{ fontSize: 9, color: P.inkFaint }}>
                  更新: {timeAgo(lastRefreshed.toISOString())}
                </span>
              )}
            </div>
          </motion.footer>

          {/* Ambient right kana column */}
          <div className="pointer-events-none absolute right-4 top-24 bottom-12 flex flex-col justify-around items-center"
            style={{ opacity: 0.04 }}>
            {["報","速","新","世","界","今","時","事"].map((k, i) => (
              <span key={i} className="jp-serif font-black"
                style={{ writingMode: "vertical-rl", fontSize: 10, color: P.paper }}>
                {k}
              </span>
            ))}
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}