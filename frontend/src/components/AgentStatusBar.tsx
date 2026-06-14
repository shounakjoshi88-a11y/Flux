// Agent Status Bar — shows session state, capabilities, mode switcher
import { motion } from "framer-motion";
import {
  Radio,
  Wifi,
  WifiOff,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  Zap,
  ListChecks,
  Shield,
} from "lucide-react";
import type { AgentMode } from "@/hooks/useAgentSession";

type AgentStatusBarProps = {
  sessionState: string;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  capabilities: any;
};

const STATE_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  idle: { color: "text-zinc-500", bg: "bg-zinc-500/10", icon: WifiOff, label: "Disconnected" },
  connecting: { color: "text-yellow-400", bg: "bg-yellow-400/10", icon: LoaderCircle, label: "Connecting..." },
  warming_up: { color: "text-yellow-400", bg: "bg-yellow-400/10", icon: Radio, label: "Warming up..." },
  ready: { color: "text-emerald-400", bg: "bg-emerald-400/10", icon: Wifi, label: "Ready" },
  processing: { color: "text-blue-400", bg: "bg-blue-400/10", icon: LoaderCircle, label: "Processing..." },
  awaiting_permission: { color: "text-amber-400", bg: "bg-amber-400/10", icon: Shield, label: "Awaiting approval" },
  cooldown: { color: "text-zinc-400", bg: "bg-zinc-400/10", icon: LoaderCircle, label: "Ending session..." },
  error: { color: "text-red-400", bg: "bg-red-400/10", icon: AlertCircle, label: "Error" },
  finished: { color: "text-zinc-500", bg: "bg-zinc-500/10", icon: CheckCircle2, label: "Finished" },
};

export default function AgentStatusBar({
  sessionState,
  mode,
  onModeChange,
  capabilities,
}: AgentStatusBarProps) {
  const cfg = (STATE_CONFIG[sessionState] ?? STATE_CONFIG.idle)!;
  const Icon = cfg.icon;
  const isAnimated = sessionState === "connecting" || sessionState === "warming_up" || sessionState === "processing";
  const isConnected = sessionState === "ready" || sessionState === "processing" || sessionState === "awaiting_permission";

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/30">
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${cfg.bg}`}>
          <motion.div
            animate={isAnimated ? { rotate: 360 } : {}}
            transition={isAnimated ? { repeat: Infinity, duration: 2, ease: "linear" } : {}}
          >
            <Icon className={`size-3 ${cfg.color}`} />
          </motion.div>
          <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
        </div>

        {capabilities && (
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500">
            {capabilities.supportsThinking && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400/70">Thinking</span>
            )}
            {capabilities.supportsVision && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70">Vision</span>
            )}
            <span className="text-zinc-600">{capabilities.maxSteps} max steps</span>
            <span className="text-zinc-600">{capabilities.availableTools?.length || 0} tools</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(capabilities?.supportedModes || ["default"]).map((m: AgentMode) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
              mode === m
                ? "bg-zinc-700/50 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            {m === "plan" && <ListChecks className="size-2.5" />}
            {m === "yolo" && <Zap className="size-2.5" />}
            {m === "default" && <Radio className="size-2.5" />}
            {m === "default" ? "Default" : m === "plan" ? "Plan" : "YOLO"}
          </button>
        ))}
      </div>
    </div>
  );
}
