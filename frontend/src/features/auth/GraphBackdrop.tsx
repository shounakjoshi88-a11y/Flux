/**
 * GraphBackdrop — the animated knowledge-graph backdrop behind the hero.
 *
 * Extracted from `pages/Auth.tsx`. The node positions, edges and per-node
 * fills travel with the component so the backdrop is self-contained.
 */
import { motion } from "framer-motion";
import { EASE } from "./motion";

const GRAPH_NODES = [
  { x: 90, y: 110, r: 5, color: "primary", delay: 0 },
  { x: 230, y: 230, r: 4, color: "teal", delay: 0.4 },
  { x: 150, y: 360, r: 3.5, color: "amber", delay: 0.8 },
  { x: 360, y: 70, r: 3, color: "teal", delay: 1.1 },
  { x: 400, y: 290, r: 4.5, color: "primary", delay: 0.2 },
  { x: 560, y: 150, r: 4, color: "amber", delay: 0.6 },
  { x: 640, y: 330, r: 3.5, color: "primary", delay: 1.3 },
  { x: 730, y: 90, r: 3, color: "teal", delay: 0.5 },
  { x: 830, y: 250, r: 4, color: "amber", delay: 0.9 },
  { x: 900, y: 110, r: 3.5, color: "primary", delay: 0.3 },
  { x: 300, y: 440, r: 3, color: "teal", delay: 1.5 },
  { x: 560, y: 440, r: 3.5, color: "amber", delay: 0.7 },
  { x: 60, y: 290, r: 3, color: "amber", delay: 1.0 },
  { x: 960, y: 360, r: 3.5, color: "teal", delay: 0.1 },
] as const;

const GRAPH_EDGES: [number, number][] = [
  [0, 1], [1, 2], [1, 4], [3, 4], [4, 5],
  [5, 6], [5, 7], [6, 8], [7, 8], [8, 9],
  [2, 12], [4, 10], [6, 11], [8, 13],
];

const NODE_FILL: Record<string, string> = {
  primary: "fill-[#cc785c]",
  teal: "fill-teal-400",
  amber: "fill-amber-400",
};

export function GraphBackdrop({ reduced }: { reduced: boolean }) {
  return (
    <svg
      viewBox="0 0 1000 520"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full opacity-[0.15] dark:opacity-[0.25]"
      aria-hidden="true"
    >
      {GRAPH_EDGES.map(([a, b], i) => {
        const from = GRAPH_NODES[a];
        const to = GRAPH_NODES[b];
        if (!from || !to) return null;
        return (
          <motion.line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="stroke-muted-foreground/30"
            strokeWidth={1}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2, delay: i * 0.1, ease: EASE }}
          />
        );
      })}
      {GRAPH_NODES.map((node, i) => (
        <motion.circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={node.r}
          className={NODE_FILL[node.color]}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            cy: reduced ? [node.y] : [node.y, node.y - 12, node.y]
          }}
          transition={{
            duration: reduced ? 0.5 : 6 + (i % 5),
            delay: node.delay,
            repeat: reduced ? 0 : Infinity,
            repeatType: "loop",
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}

// --- Typewriter Hook & Formatter ---
