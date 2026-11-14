/**
 * A single search result.
 *
 * Styled after claude.ai's result rows: a flat, borderless row with a small
 * globe glyph, the page title on the left and the domain right-aligned in
 * muted grey. Hovering raises the row on a faint fill.
 */
import React, { memo } from "react";
import { motion } from "framer-motion";

type SourceCardProps = {
  url: string;
  domain: string;
  trustScore: number;
  badgeColor: string;
  onClick: () => void;
  onOpenExternal: () => void;
};

function getReputationInfo(score: number): { label: string; description: string } {
  if (score >= 90)
    return {
      label: "Excellent",
      description: "Highly authoritative, verified source. Score 90-100.",
    };
  if (score >= 70)
    return {
      label: "Good",
      description: "Generally reputable with solid credibility. Score 70-89.",
    };
  if (score >= 50)
    return {
      label: "Fair",
      description: "Moderate reliability, may need cross-verification. Score 50-69.",
    };
  return {
    label: "Low",
    description: "Unverified or potentially unreliable. Score below 50.",
  };
}

function SourceCard({ url, domain, trustScore, badgeColor, onClick, onOpenExternal }: SourceCardProps) {
  const repInfo = getReputationInfo(trustScore);

  // Title reads better than the bare domain; fall back to the URL path.
  const title = url
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")
    .slice(0, 2)
    .join("/")
    .replace(/^www\./, "");

  return (
    <motion.button
      whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      whileTap={{ backgroundColor: "rgba(255,255,255,0.06)" }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={onClick}
      onDoubleClick={onOpenExternal}
      title={`${repInfo.label} — ${repInfo.description}`}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer"
    >
      {/* Globe glyph, same shape Claude uses for web results */}
      <svg
        className="size-4 shrink-0 text-[var(--text-secondary)]/70"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="10" cy="10" r="7.5" />
        <line x1="2.5" y1="10" x2="17.5" y2="10" />
        <path d="M10 2.5c-2.6 2.2-4 4.7-4 7.5s1.4 5.3 4 7.5" />
        <path d="M10 2.5c2.6 2.2 4 4.7 4 7.5s-1.4 5.3-4 7.5" />
      </svg>

      <span className="min-w-0 flex-1 truncate text-[16px] leading-6 text-[var(--text-primary)] group-hover:text-[var(--text-secondary)] transition-colors">
        {title}
      </span>

      {/* Trust dot, then the domain right-aligned like Claude */}
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: badgeColor }}
        title={`${repInfo.label} (${trustScore})`}
      />
      <span className="shrink-0 truncate text-[14px] leading-5 text-[var(--text-secondary)]/60 group-hover:text-[var(--text-secondary)] transition-colors max-w-[45%]">
        {domain}
      </span>
    </motion.button>
  );
}

const SourceCardMemo = memo(SourceCard);
export default SourceCardMemo;
export { SourceCardMemo as SourceCard };
