import React from "react";

export type IProps = { cls?: string };
export const S = ({ cls = "", children }: { cls?: string; children: React.ReactNode }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round"
    className={`size-4 shrink-0 ${cls}`}>{children}</svg>
);

export const SearchIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="8.5" cy="8.5" r="5.2" />
    <line x1="12.8" y1="12.8" x2="17.5" y2="17.5" />
  </S>
);

export const GlobeIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <g transform="rotate(-20 10 10)">
      <circle cx="10" cy="10" r="7.5" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" />
      <line x1="4" y1="6.5" x2="16" y2="6.5" strokeWidth="1" opacity="0.5" />
      <line x1="4" y1="13.5" x2="16" y2="13.5" strokeWidth="1" opacity="0.5" />
      <path d="M10 2.5c-3 2.5-4 4.8-4 7.5s1 5 4 7.5" />
      <path d="M10 2.5c3 2.5 4 4.8 4 7.5s-1 5-4 7.5" />
    </g>
  </S>
);

export const BookIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <line x1="10" y1="17" x2="10" y2="4.5" />
    <path d="M10 5c-2-1.5-4-1.5-6.5-1v11.5c2.5-.5 4.5-.5 6.5 1" />
    <path d="M10 5c2-1.5 4-1.5 6.5-1v11.5c-2.5-.5-4.5-.5-6.5 1" />
    <line x1="4.5" y1="8" x2="8.5" y2="7.5" strokeWidth="1" opacity="0.6" />
    <line x1="4.5" y1="10.5" x2="8.5" y2="10" strokeWidth="1" opacity="0.6" />
    <line x1="4.5" y1="13" x2="8.5" y2="12.5" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="7.5" x2="15.5" y2="8" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="10" x2="15.5" y2="10.5" strokeWidth="1" opacity="0.6" />
    <line x1="11.5" y1="12.5" x2="15.5" y2="13" strokeWidth="1" opacity="0.6" />
  </S>
);

export const LinkIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5V11" />
    <path d="M12 3h5v5" />
    <line x1="17" y1="3" x2="10" y2="10" />
  </S>
);

export const WarnIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M10 3 1.5 17.5h17L10 3z" />
    <line x1="10" y1="8.5" x2="10" y2="13" />
    <circle cx="10" cy="15.5" r=".8" fill="currentColor" strokeWidth="0" />
  </S>
);

export const DoneIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="10" cy="10" r="7.5" />
    <polyline points="5.5,10 9,13.5 14.5,7" />
  </S>
);

export const ExtractIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <line x1="2.5" y1="4" x2="17.5" y2="4" />
    <line x1="2.5" y1="4" x2="8.5" y2="12" />
    <line x1="17.5" y1="4" x2="11.5" y2="12" />
    <line x1="5" y1="6.5" x2="15" y2="6.5" strokeWidth="1" opacity="0.4" />
    <line x1="6.5" y1="9.2" x2="13.5" y2="9.2" strokeWidth="1" opacity="0.4" />
    <line x1="8.5" y1="12" x2="9.2" y2="15.5" />
    <line x1="11.5" y1="12" x2="10.8" y2="15.5" />
    <circle cx="10" cy="17.5" r="1.3" fill="currentColor" strokeWidth="0" />
  </S>
);

// Terminal icon — rectangle with cursor prompt lines
export const TerminalIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2" y="3.5" width="16" height="13" rx="2" />
    <polyline points="5.5,8 8,10.5 5.5,13" strokeWidth="1.5" />
    <line x1="9.5" y1="13" x2="14.5" y2="13" strokeWidth="1.3" />
  </S>
);

// File icon — document with folded corner
export const FileIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M5 2.5h6.5l3 3V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
    <polyline points="11.5,2.5 11.5,5.5 14.5,5.5" />
    <line x1="7" y1="9" x2="13" y2="9" strokeWidth="1.1" />
    <line x1="7" y1="11.5" x2="11" y2="11.5" strokeWidth="1.1" />
  </S>
);

// Clock icon for thinking
export function ClockIcon({ className }: { className?: string }) {
  const cx = 8, cy = 8, r = 6;
  const toXY = (hour: number, len: number) => {
    const a = (hour / 12) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + len * Math.cos(a), y: cy + len * Math.sin(a) };
  };
  const arcStart = toXY(12, r);
  const arcEnd   = toXY(8, r);
  const dots = [9, 10, 11].map(h => toXY(h, r));
  const hourHand   = toXY(4, 3.1);  // pointing at 4 (lower-right)
  const minuteHand = toXY(12, 4.1); // pointing at 12 (straight up)
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={`M ${arcStart.x.toFixed(2)} ${arcStart.y.toFixed(2)} A ${r} ${r} 0 1 1 ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}`} stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
      {dots.map((d, i) => <circle key={i} cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r="0.55" fill="currentColor" />)}
      <line x1={cx} y1={cy} x2={hourHand.x.toFixed(2)} y2={hourHand.y.toFixed(2)} stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={minuteHand.x.toFixed(2)} y2={minuteHand.y.toFixed(2)} stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="0.65" fill="currentColor" />
    </svg>
  );
}

// Wiki/graph node icon
export const WikiIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <circle cx="10" cy="10" r="2.5" />
    <circle cx="3.5" cy="5" r="1.8" />
    <circle cx="16.5" cy="5" r="1.8" />
    <circle cx="3.5" cy="15" r="1.8" />
    <circle cx="16.5" cy="15" r="1.8" />
    <line x1="5.2" y1="5.8" x2="8" y2="8.5" strokeWidth="1.2" />
    <line x1="14.8" y1="5.8" x2="12" y2="8.5" strokeWidth="1.2" />
    <line x1="5.2" y1="14.2" x2="8" y2="11.5" strokeWidth="1.2" />
    <line x1="14.8" y1="14.2" x2="12" y2="11.5" strokeWidth="1.2" />
  </S>
);

// Package/install icon
export const PackageIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <path d="M10 2L17.5 6v8L10 18 2.5 14V6L10 2z" />
    <polyline points="2.5,6 10,10 17.5,6" />
    <line x1="10" y1="10" x2="10" y2="18" />
    <line x1="6" y1="4" x2="14" y2="8" strokeWidth="1" opacity="0.5" />
  </S>
);

// Weather icons
export const WeatherIcon = ({ state, cls = "" }: { state: "fetching" | "success" | "error"; cls?: string }) => {
  if (state === "fetching") return (
    <S cls={cls}>
      <path d="M10 3.5v8.2" />
      <path d="M8 3.5a2 2 0 0 1 4 0v8.2a4 4 0 1 1-4 0z" />
      <line x1="12.5" y1="6" x2="14.5" y2="6" />
      <line x1="12.5" y1="8.5" x2="14" y2="8.5" />
      <line x1="12.5" y1="11" x2="14.5" y2="11" />
    </S>
  );
  if (state === "success") return (
    <S cls={cls}>
      <circle cx="13.5" cy="7" r="3" />
      <line x1="13.5" y1="2.5" x2="13.5" y2="1.5" />
      <line x1="17" y1="3.5" x2="17.7" y2="2.8" />
      <line x1="18" y1="7" x2="19" y2="7" />
      <path d="M4.5 15.5a3.5 3.5 0 0 1-.8-6.9A5.5 5.5 0 0 1 14.2 10a3 3 0 0 1-.7 5.5H4.5z" />
    </S>
  );
  return (
    <S cls={cls}>
      <path d="M4.5 15.5a3.5 3.5 0 0 1-.8-6.9A5.5 5.5 0 0 1 14.2 10a3 3 0 0 1-.7 5.5H4.5z" />
      <polyline points="10.5,13 8.5,16.5 11,16.5 9,20" />
    </S>
  );
};

export const WandIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <line x1="3.5" y1="16.5" x2="11" y2="9" />
    <path d="M13.5 3 l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5 z" />
    <line x1="6.5" y1="5.5" x2="6.5" y2="4.5" strokeWidth="1.2" />
    <line x1="5.5" y1="6.5" x2="4.5" y2="6.5" strokeWidth="1.2" />
    <line x1="7.5" y1="6.5" x2="8.5" y2="6.5" strokeWidth="1.2" opacity="0.5" />
    <line x1="6.5" y1="7.5" x2="6.5" y2="8.5" strokeWidth="1.2" opacity="0.5" />
  </S>
);

export const ImageIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
    <circle cx="6.5" cy="8.5" r="1.5" />
    <path d="M2.5 12.5 L6.5 9 L9.5 12.5 L12.5 9 L17.5 14" />
  </S>
);

export const ChartIcon = ({ cls = "" }: IProps) => (
  <S cls={cls}>
    <rect x="2.5" y="10" width="3" height="7.5" rx="0.5" />
    <rect x="8.5" y="6" width="3" height="11.5" rx="0.5" />
    <rect x="14.5" y="2.5" width="3" height="15" rx="0.5" />
    <line x1="1.5" y1="18" x2="18.5" y2="18" strokeWidth="1.2" />
  </S>
);

// ── Language colour map for file extension badges ──────────────────────────
export const LANG_COLORS: Record<string, { badge: string; dot: string; glow: string }> = {
  python:     { badge: 'text-blue-400/80 bg-blue-500/10 border-blue-500/20',     dot: 'bg-blue-400/70',    glow: 'shadow-[0_0_8px_-2px_rgba(96,165,250,0.5)]' },
  javascript: { badge: 'text-yellow-400/80 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-400/70', glow: 'shadow-[0_0_8px_-2px_rgba(250,204,21,0.5)]' },
  typescript: { badge: 'text-sky-400/80 bg-sky-500/10 border-sky-500/20',         dot: 'bg-sky-400/70',    glow: 'shadow-[0_0_8px_-2px_rgba(56,189,248,0.5)]' },
  html:       { badge: 'text-orange-400/80 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400/70', glow: 'shadow-[0_0_8px_-2px_rgba(251,146,60,0.5)]' },
  css:        { badge: 'text-purple-400/80 bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-400/70', glow: 'shadow-[0_0_8px_-2px_rgba(192,132,252,0.5)]' },
  bash:       { badge: 'text-green-400/80 bg-green-500/10 border-green-500/20',   dot: 'bg-green-400/70',  glow: 'shadow-[0_0_8px_-2px_rgba(74,222,128,0.5)]' },
  sh:         { badge: 'text-green-400/80 bg-green-500/10 border-green-500/20',   dot: 'bg-green-400/70',  glow: 'shadow-[0_0_8px_-2px_rgba(74,222,128,0.5)]' },
  c:          { badge: 'text-slate-300/80 bg-slate-500/10 border-slate-500/20',   dot: 'bg-slate-300/70',  glow: 'shadow-[0_0_8px_-2px_rgba(203,213,225,0.4)]' },
  cpp:        { badge: 'text-indigo-300/80 bg-indigo-500/10 border-indigo-500/20', dot: 'bg-indigo-300/70', glow: 'shadow-[0_0_8px_-2px_rgba(165,180,252,0.5)]' },
  rust:       { badge: 'text-orange-300/80 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-300/70', glow: 'shadow-[0_0_8px_-2px_rgba(253,186,116,0.5)]' },
  go:         { badge: 'text-cyan-400/80 bg-cyan-500/10 border-cyan-500/20',     dot: 'bg-cyan-400/70',   glow: 'shadow-[0_0_8px_-2px_rgba(34,211,238,0.5)]' },
  java:       { badge: 'text-red-400/80 bg-red-500/10 border-red-500/20',        dot: 'bg-red-400/70',    glow: 'shadow-[0_0_8px_-2px_rgba(248,113,113,0.5)]' },
  json:       { badge: 'text-yellow-300/80 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-300/70', glow: 'shadow-[0_0_8px_-2px_rgba(253,224,71,0.5)]' },
  markdown:   { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
  md:         { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
  sql:        { badge: 'text-teal-400/80 bg-teal-500/10 border-teal-500/20',     dot: 'bg-teal-400/70',   glow: 'shadow-[0_0_8px_-2px_rgba(45,212,191,0.5)]' },
  text:       { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
  txt:        { badge: 'text-[var(--text-muted)] bg-[var(--surface-bg)] border-[var(--surface-border)]', dot: 'bg-[var(--text-muted)]', glow: '' },
};


