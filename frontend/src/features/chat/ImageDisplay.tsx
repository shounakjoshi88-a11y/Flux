import { IconChevronDown, IconTrash } from "../layout/anthropicIcons.tsx";
import React, { useState, useEffect, useRef } from "react";

import { createClient } from "../../lib/client";
import { BACKEND_URL } from "../../lib/config";

export function InlineImageDisplay({
  file,
  onDelete,
  messageId,
  index
}: {
  file: { base64?: string; thumbnail?: string; filename: string; mime: string; width?: number; height?: number; placeholder?: boolean };
  onDelete?: () => void;
  messageId: string | number;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [fullBase64, setFullBase64] = useState<string | null>(file.base64 || null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Automatic Background Fetch ──
  // If we have NO high-res AND no thumbnail, we MUST fetch high-res immediately for the view
  useEffect(() => {
    if (!fullBase64 && !file.thumbnail && file.placeholder && messageId !== -1 && !isAutoLoading) {
      const fetchViewAsset = async () => {
        try {
          setIsAutoLoading(true);
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) return;

          const res = await fetch(`${BACKEND_URL}/api/assets/${messageId}/generated/${index}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.base64) setFullBase64(data.base64);
          }
        } catch (e) {
          console.error("View asset fetch error:", e);
        } finally {
          setIsAutoLoading(false);
        }
      };
      fetchViewAsset();
    }
  }, [file.placeholder, fullBase64, file.thumbnail, messageId, index, isAutoLoading]);

  // The source is either the full high-res image OR the lightweight thumbnail
  const displaySrc = fullBase64
    ? `data:${file.mime};base64,${fullBase64}`
    : file.thumbnail
      ? `data:image/jpeg;base64,${file.thumbnail}`
      : "";

  const handleDownload = async () => {
    let b64 = fullBase64;

    // If we don't have the high-res version yet, fetch it on-demand
    if (!b64 && messageId !== -1) {
      try {
        setIsDownloading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch(`${BACKEND_URL}/api/assets/${messageId}/generated/${index}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.base64) {
            b64 = data.base64;
            setFullBase64(b64); // Save it so subsequent downloads/views are instant
          }
        }
      } catch (e) {
        console.error("High-res fetch error:", e);
      } finally {
        setIsDownloading(false);
      }
    }

    if (!b64) return;
    const a = document.createElement("a");
    a.href = `data:${file.mime};base64,${b64}`;
    a.download = file.filename;
    a.click();
  };

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const resolution = file.width && file.height
    ? `${file.width}×${file.height}`
    : naturalSize
      ? `${naturalSize.w}×${naturalSize.h}`
      : null;

  return (
    <div className="mt-3 rounded-xl overflow-hidden bg-black/20 group/img">
      {/* Image */}
      <div
        className="relative cursor-zoom-in flex items-center justify-center bg-stone-900/50 aspect-square"
        onClick={() => displaySrc && setExpanded(!expanded)}
      >
        {displaySrc ? (
          <>
            <img
              src={displaySrc}
              alt="AI generated image"
              onLoad={handleImgLoad}
              className={`w-full h-full object-contain transition-all duration-500 ${!fullBase64 ? "blur-[2px] opacity-90" : ""}`}
              style={{ display: "block" }}
            />
            {!expanded && (
              <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            )}
          </>
        ) : (
          <div className="py-12 flex flex-col items-center gap-2">
            <div className="size-5 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Initialising...</span>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/8 bg-black/20">
        <div className="flex items-center gap-2">
          {resolution && (
            <span className="text-[10px] font-mono text-muted-foreground/60 select-none">
              {resolution}
            </span>
          )}
          {!fullBase64 && file.thumbnail && (
            <span className="text-[9px] bg-amber-500/10 text-amber-500/80 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">Preview</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
            disabled={!displaySrc}
          >
            {expanded ? "↑ Collapse" : "↓ Expand"}
          </button>
          <button
            onClick={handleDownload}
            className={`px-2 py-1 rounded-md text-[10px] flex items-center gap-1.5 transition-all ${isDownloading ? "text-amber-400 bg-amber-400/10" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <div className="size-2.5 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
                Fetching 4K...
              </>
            ) : (
              "↓ Download Full-Res"
            )}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete"
            >
              <IconTrash className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Image generation skeleton (ChatGPT-style) ───────────────
const IMAGE_SKELETON_CSS = [
  "@keyframes imgSkeletonIn {",
  "  from { opacity: 0; transform: translateY(5px); }",
  "  to   { opacity: 1; transform: translateY(0);   }",
  "}",
  "@keyframes labelFade {",
  "  from { opacity: 0; }",
  "  to   { opacity: 1; }",
  "}",
].join("\n");

const CARD_BG_VAL = 54; // #363636 - the flat grey

const IMAGE_GEN_LABELS = [
  "Creating image",
  "Making the first draft",
  "Painting the details",
  "Adding finishing touches",
  "Almost there",
  "Rendering your image",
  "Bringing it to life",
  "Sketching the composition",
  "Filling in the colors",
  "Sharpening the edges",
  "Applying texture",
  "Adjusting the lighting",
  "Polishing the details",
  "Just a moment more",
  "Fine-tuning the result",
  "Composing the scene",
  "Blending the elements",
  "Refining the image",
];

export function ImageGenerationSkeleton({ stage }: { stage: "enhancing" | "generating" }) {
  const COLS = 22;
  const ROWS = 22;

  const [labelIdx, setLabelIdx] = useState(0);
  useEffect(() => {
    if (stage === "enhancing") return;
    const id = setInterval(() => setLabelIdx((i) => (i + 1) % IMAGE_GEN_LABELS.length), 4500);
    return () => clearInterval(id);
  }, [stage]);

  const label = stage === "enhancing" ? "Crafting your prompt…" : IMAGE_GEN_LABELS[labelIdx];

  const canvasRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const dots = canvasRef.current
      ? Array.from(canvasRef.current.querySelectorAll<HTMLDivElement>(".sk-dot"))
      : [];
    if (!dots.length) return;

    // 4 corners in grid coords
    const CORNERS = [
      { x: 0, y: 0 },
      { x: COLS - 1, y: 0 },
      { x: COLS - 1, y: ROWS - 1 },
      { x: 0, y: ROWS - 1 },
    ];

    // Blob state
    let bx = 0, by = 0;          // current blob center (grid units)
    let targetIdx = 2;            // which corner we're heading to
    let tx = CORNERS[targetIdx]!.x;
    let ty = CORNERS[targetIdx]!.y;
    const SPEED = 0.018;          // lerp speed — slow, dreamy movement
    const BLOB_R = 3.8;           // circle radius in grid units
    const ARRIVE_DIST = 0.3;      // how close = "arrived"

    // pick a new random corner that isn't the current one
    function pickNext(current: number) {
      let next: number;
      do { next = Math.floor(Math.random() * 4); } while (next === current);
      return next;
    }

    function frame() {
      // Lerp blob towards target
      bx += (tx - bx) * SPEED;
      by += (ty - by) * SPEED;

      // If arrived, pick next random corner
      const d = Math.hypot(tx - bx, ty - by);
      if (d < ARRIVE_DIST) {
        targetIdx = pickNext(targetIdx);
        tx = CORNERS[targetIdx]!.x;
        ty = CORNERS[targetIdx]!.y;
      }

      // Update each dot colour based on 2D distance from blob center
      dots.forEach((dot) => {
        const cx = parseFloat(dot.dataset.cx!);
        const cy = parseFloat(dot.dataset.cy!);
        const dist2d = Math.hypot(cx - bx, cy - by);
        // Gaussian circle falloff
        const glow = Math.exp(-(dist2d * dist2d) / (2 * BLOB_R * BLOB_R));
        // Interpolate from card-bg to white
        const v = Math.round(CARD_BG_VAL + glow * (255 - CARD_BG_VAL));
        dot.style.backgroundColor = glow < 0.04
          ? `rgb(${CARD_BG_VAL},${CARD_BG_VAL},${CARD_BG_VAL})`
          : `rgb(${v},${v},${v})`;
      });

      frameRef.current = requestAnimationFrame(frame);
    }

    frameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const bgColor = `rgb(${CARD_BG_VAL},${CARD_BG_VAL},${CARD_BG_VAL})`;

  return (
    <div
      className="mt-3 rounded-2xl overflow-hidden"
      style={{
        background: bgColor,
        animation: "imgSkeletonIn 0.3s ease-out forwards",
        width: "82%",
        minWidth: 380,
      }}
    >
      <style>{IMAGE_SKELETON_CSS}</style>

      {/* Label directly on card */}
      <div className="px-6 pt-6 pb-4">
        <span
          key={label}
          className="text-[15px] font-semibold text-white/80 tracking-tight"
          style={{ animation: "labelFade 0.4s ease-out" }}
        >
          {label}
        </span>
      </div>

      {/* Dot grid — no inner container, dots blend into card when off */}
      <div
        ref={canvasRef}
        style={{
          padding: "4px 22px 24px",
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: "11px",
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return (
            <div
              key={i}
              className="sk-dot"
              data-cx={col}
              data-cy={row}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                backgroundColor: bgColor,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline generation indicator ────────────────────────────
export function InlineGenerationIndicator({
  status,
  reasoningText,
}: {
  status: { subtype: string; message: string };
  reasoningText?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Image states get the full skeleton treatment
  if (status.subtype === "image_enhancing" || status.subtype === "image_generating") {
    return (
      <ImageGenerationSkeleton
        stage={status.subtype === "image_enhancing" ? "enhancing" : "generating"}
      />
    );
  }

  return (
    <div className="mt-3 group/gen ml-2 pl-4 py-1">
      <div
        className="flex items-center gap-2 cursor-pointer select-none py-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex gap-1 shrink-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-1 rounded-full bg-stone-500"
              style={{
                animation: "generationDotBounce 1.4s infinite ease-in-out both",
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-stone-400 group-hover/gen:text-stone-300 transition-colors flex items-center gap-1.5 antialiased">
          {status.message}
          <IconChevronDown className={`size-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </div>

      {isOpen && reasoningText && (
        <div className="mt-2 text-[13px] text-stone-500 leading-relaxed border-l border-stone-800 ml-1.5 pl-3 py-1 animate-in fade-in slide-in-from-left-1 duration-300">
          <p className="whitespace-pre-wrap italic opacity-80 antialiased">
            {reasoningText}
            <span className="inline-block w-1 h-3 bg-stone-600 ml-1 animate-pulse align-middle" />
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Search steps group (searching → found_sources → reading) ────── */

