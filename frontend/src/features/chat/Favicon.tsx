import { useState } from "react";

export function Favicon({ url, className = "", size = 16 }: { url: string; className?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!url || failed) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center ${className}`} style={box}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round" className="size-full text-[var(--text-muted)]" aria-hidden>
          <circle cx="8" cy="8" r="6.2" />
          <ellipse cx="8" cy="8" rx="2.8" ry="6.2" />
          <line x1="1.8" y1="8" x2="14.2" y2="8" />
        </svg>
      </span>
    );
  }
  let domain = url;
  try {
    domain = new URL(url).hostname;
  } catch {
    /* url may already be a bare domain — use as-is */
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-[3px] object-contain ${className}`}
      style={box}
      onError={() => setFailed(true)}
    />
  );
}
