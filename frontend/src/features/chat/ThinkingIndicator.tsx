import React, { useState, useEffect } from "react";

const THINKING_PHRASES = [
  "Thinking through this",
  "Exploring all angles",
  "Connecting the dots",
  "Synthesizing ideas",
  "Reasoning step by step",
  "Pulling it together",
  "Weighing the options",
  "Crafting a response",
  "Building context",
  "Reading the room",
  "Forming a perspective",
  "Processing this carefully",
];

export function OrbitalSVG() {
  return (
    <>
      <style>{`
        @keyframes _flxOrb{to{transform:rotate(360deg)}}
        @keyframes _flxOrbR{to{transform:rotate(-360deg)}}
        @keyframes _flxGlow{0%,100%{opacity:0.09}50%{opacity:0.03}}
      `}</style>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style={{ overflow: 'visible' }}>
        {/* Static rings */}
        <circle cx="17" cy="17" r="13" stroke="var(--accent)" strokeWidth="0.4" opacity="0.14"/>
        <circle cx="17" cy="17" r="8.5" stroke="var(--accent)" strokeWidth="0.45" opacity="0.22"/>
        {/* Core glow pulse */}
        <circle cx="17" cy="17" r="6" fill="var(--accent)" opacity="0.09"
          style={{ animation: '_flxGlow 2s ease-in-out infinite' }}/>
        {/* Core nucleus */}
        <circle cx="17" cy="17" r="2.8" fill="var(--accent)" opacity="0.88">
          <animate attributeName="r" values="2.8;3.8;2.8" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.88;0.42;0.88" dur="2s" repeatCount="indefinite"/>
        </circle>
        {/* Orbit A — outer dot, clockwise, 3.2 s */}
        <g style={{ transformOrigin: '17px 17px', animation: '_flxOrb 3.2s linear infinite' }}>
          <circle cx="30" cy="17" r="2.2" fill="var(--accent)" opacity="0.8"/>
        </g>
        {/* Orbit B — outer dot, counter-clockwise, 5 s, offset start */}
        <g style={{ transformOrigin: '17px 17px', animation: '_flxOrbR 5s linear infinite', animationDelay: '-1.7s' }}>
          <circle cx="30" cy="17" r="1.5" fill="var(--accent)" opacity="0.52"/>
        </g>
        {/* Orbit C — inner dot, clockwise, 7 s, offset start */}
        <g style={{ transformOrigin: '17px 17px', animation: '_flxOrb 7s linear infinite', animationDelay: '-3s' }}>
          <circle cx="25.5" cy="17" r="1" fill="var(--accent)" opacity="0.36"/>
        </g>
      </svg>
    </>
  );
}

// ── ThinkingIndicator — shown while awaiting first streaming parts ───────────
export function ThinkingIndicator() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    let tid: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setFade(false);
      tid = setTimeout(() => {
        setIdx(i => (i + 1) % THINKING_PHRASES.length);
        setFade(true);
      }, 350);
    }, 2800);
    return () => { clearInterval(id); clearTimeout(tid); };
  }, []);

  return (
    <div className="flex items-center gap-3 py-1.5 select-none">
      <div className="shrink-0">
        <OrbitalSVG />
      </div>
      <span
        className="text-[13px] font-medium text-[var(--text-secondary)]/65"
        style={{
          opacity: fade ? 1 : 0,
          transition: 'opacity 0.35s ease',
          display: 'inline-block',
        }}
      >
        {THINKING_PHRASES[idx]}<span style={{ opacity: 0.5 }}>…</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MessageItem                                                       */
/* ------------------------------------------------------------------ */

