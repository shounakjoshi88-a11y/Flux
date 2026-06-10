// src/components/SourceCard.tsx
import { useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

type SourceCardProps = {
  url: string;
  domain: string;
  trustScore: number;
  badgeColor: string;
  onClick: () => void;
  onOpenExternal: () => void;
};

function getTrustInfo(score: number): { label: string; description: string } {
  if (score >= 90)
    return {
      label: "Excellent",
      description: "Highly authoritative, verified source. Score 90‑100.",
    };
  if (score >= 70)
    return {
      label: "Good",
      description: "Generally trustworthy with solid credibility. Score 70‑89.",
    };
  if (score >= 50)
    return {
      label: "Fair",
      description: "Moderate reliability, may need cross‑verification. Score 50‑69.",
    };
  return {
    label: "Low",
    description: "Unverified or potentially unreliable. Score below 50.",
  };
}

export const SourceCard = memo(function SourceCard({
  url,
  domain,
  trustScore,
  badgeColor,
  onClick,
  onOpenExternal,
}: SourceCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const trustInfo = getTrustInfo(trustScore);

  return (
    <motion.button
      whileHover={{
        scale: 1.02,
        borderColor: "var(--accent)",
        boxShadow: "0 0 28px var(--accent-glow)",
      }}
      whileTap={{ scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 18,
        mass: 0.85,
        borderColor: { duration: 0.25, ease: "easeOut" },
        boxShadow: { duration: 0.25, ease: "easeOut" },
      }}
      onClick={onClick}
      className="source-card group border border-white/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-xl p-3.5 flex gap-3.5 items-start text-left transition-colors duration-200"
    >
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=64`}
        alt=""
        className="mt-0.5 size-5 rounded-sm shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-semibold leading-tight">{domain}</p>
        <p className="truncate text-xs text-muted-foreground leading-snug">{url}</p>

        {/* Trust badge with tooltip */}
        <div
          className="relative inline-block mt-1.5"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium cursor-default leading-none tracking-tight ${badgeColor}`}
          >
            Trust {trustScore}%
          </span>

          <AnimatePresence>
            {showTooltip && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                  opacity: { duration: 0.3 },
                }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-56"
              >
                <div className="bg-black/80 dark:bg-[#1e1e1e]/90 backdrop-blur-xl border border-white/10 text-foreground text-[10px] rounded-xl px-3.5 py-2.5 shadow-2xl text-center leading-normal">
                  <span className="font-semibold">{trustInfo.label}</span>
                  <br />
                  {trustInfo.description}
                  <br />
                  <span className="text-muted-foreground">
                    Based on domain authority, freshness, and factual accuracy.
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* External link icon */}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
        className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 rounded-md hover:bg-white/10 cursor-pointer focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        title="Open in new tab"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onOpenExternal();
          }
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </span>
    </motion.button>
  );
});