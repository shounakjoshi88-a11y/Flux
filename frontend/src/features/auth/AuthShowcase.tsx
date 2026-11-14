/**
 * Landing page showcase panels.
 *
 * Extracted from `pages/Auth.tsx`: the deep-dive graph visual, the memory
 * manager mock, and the feature / use-case copy blocks.
 */
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  Layers,
  Network,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import { EASE } from "./motion";

export function DeepDiveGraphVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_60%)] opacity-[0.05]"></div>
      <svg viewBox="0 0 400 300" className="w-full h-auto relative z-10" aria-hidden="true">
        <motion.line x1="100" y1="80" x2="200" y2="150" className="stroke-muted-foreground/40" strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, ease: EASE }} />
        <motion.line x1="200" y1="150" x2="300" y2="80" className="stroke-muted-foreground/40" strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.2, ease: EASE }} />
        <motion.line x1="200" y1="150" x2="100" y2="220" className="stroke-red-500/40" strokeWidth="1.5" strokeDasharray="4 4" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.4, ease: EASE }} />
        <motion.line x1="200" y1="150" x2="300" y2="220" className="stroke-muted-foreground/40" strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.6, ease: EASE }} />

        <text x="115" y="120" className="fill-muted-foreground/70 text-[9px] font-sans">generates</text>
        <text x="230" y="120" className="fill-muted-foreground/70 text-[9px] font-sans">related_to</text>
        <text x="110" y="190" className="fill-red-500/80 text-[9px] font-sans font-bold">contradicts</text>
        <text x="230" y="190" className="fill-muted-foreground/70 text-[9px] font-sans">related_to</text>

        <motion.circle cx="100" cy="80" r="8" className="fill-teal-400" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, type: "spring", stiffness: 200 }} />
        <text x="115" y="84" className="fill-foreground text-[11px] font-medium">Elon Musk</text>

        <motion.circle cx="300" cy="80" r="8" className="fill-teal-400" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.7, type: "spring", stiffness: 200 }} />
        <text x="245" y="84" className="fill-foreground text-[11px] font-medium">Perplexity</text>

        <motion.circle cx="200" cy="150" r="10" className="fill-[#cc785c]" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9, type: "spring", stiffness: 200 }} />
        <text x="215" y="154" className="fill-foreground text-[11px] font-medium">Optimus</text>

        <motion.circle cx="100" cy="220" r="8" className="fill-amber-400" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.1, type: "spring", stiffness: 200 }} />
        <text x="115" y="224" className="fill-foreground text-[11px] font-medium">Misinformation</text>

        <motion.circle cx="300" cy="220" r="8" className="fill-[#cc785c]" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.3, type: "spring", stiffness: 200 }} />
        <text x="230" y="224" className="fill-foreground text-[11px] font-medium">Fake Claim</text>
      </svg>
    </div>
  );
}

export function MemoryManagerMock() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: EASE }}
      className="relative w-full max-w-md mx-auto space-y-4"
    >
      <div className="absolute -inset-4 bg-teal-500/10 rounded-3xl blur-2xl opacity-50"></div>

      <motion.div
        className="relative rounded-xl border border-border bg-card/80 backdrop-blur-xl shadow-xl p-5 transform translate-x-4 translate-y-4 opacity-60"
        whileHover={{ x: -10, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Active Projects</span>
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted"></div>
          <div className="h-2 w-4/6 rounded-full bg-muted"></div>
        </div>
      </motion.div>

      <motion.div
        className="relative rounded-xl border border-border bg-card/80 backdrop-blur-xl shadow-xl p-5 transform translate-x-2 translate-y-2 opacity-80"
        whileHover={{ x: -5, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Brain className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Preferences</span>
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted"></div>
          <div className="h-2 w-5/6 rounded-full bg-muted"></div>
        </div>
      </motion.div>

      <div className="relative rounded-xl border border-primary/40 bg-card backdrop-blur-xl shadow-[0_0_30px_rgba(204,120,92,0.15)] p-5 overflow-hidden">
        <div className="absolute top-0 right-0 px-2 py-1 bg-primary/10 text-primary text-[9px] font-mono tracking-wider flex items-center gap-1">
          <CheckCircle2 className="size-2" /> VERIFIED
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Network className="size-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Fact Check: Perplexity</span>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono mb-4">
          Cross-referenced 3 live sources. No credible evidence of shutdown.
        </p>
        <div className="flex gap-2">
          <div className="size-8 rounded bg-blue-500/20 text-blue-500 text-[10px] flex items-center justify-center font-bold">V</div>
          <div className="size-8 rounded bg-orange-500/20 text-orange-500 text-[10px] flex items-center justify-center font-bold">T</div>
          <div className="size-8 rounded bg-green-500/20 text-green-500 text-[10px] flex items-center justify-center font-bold">B</div>
        </div>
      </div>
    </motion.div>
  );
}

export const FEATURES = [
  {
    icon: Search,
    title: "Agentic Search",
    description: "Plans, searches, and checks its own findings before answering. Not a single guess, a verified one.",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Every idea becomes a node. You can literally see how topics connect and relate to each other.",
  },
  {
    icon: Brain,
    title: "Memory That Sticks",
    description: "Keeps track of your preferences and projects across sessions, so you never start at zero.",
  },
  {
    icon: Layers,
    title: "Real Artifacts",
    description: "Tables, HTML, docs, and code you can open and reuse — not just descriptions of them.",
  },
];

export const USE_CASES = [
  { icon: Search, title: "Research Copilot", desc: "For news, tech, and geopolitics." },
  { icon: Layers, title: "System Design", desc: "For AI pipelines, caching, and routing." },
  { icon: Brain, title: "Learning Companion", desc: "For CS, math, and cybersecurity." },
  { icon: Network, title: "Misinformation Checker", desc: "Verify viral claims with citations." },
];
