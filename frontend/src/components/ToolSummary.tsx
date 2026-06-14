import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, LoaderCircle, Clock } from "lucide-react";
import type { MessagePart } from "@/types";

type ToolSummaryProps = {
  tools: MessagePart[];
};

const STATUS_ICONS: Record<string, { icon: any; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500" },
  error: { icon: XCircle, color: "text-destructive" },
  running: { icon: LoaderCircle, color: "text-primary" },
  pending: { icon: Clock, color: "text-muted-foreground" },
};

function ToolCallRow({ part }: { part: MessagePart & { type: "tool_call" } }) {
  const cfg = STATUS_ICONS[part.status]!;
  const Icon = cfg.icon;
  const isRunning = part.status === "running";
  const isCompleted = part.status === "completed";

  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-accent transition-colors">
      <div className="mt-0.5 shrink-0">
        <motion.div animate={isRunning ? { rotate: 360 } : {}} transition={isRunning ? { repeat: Infinity, duration: 1.5, ease: "linear" } : {}}>
          <Icon className={`size-3.5 ${cfg.color}`} />
        </motion.div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{part.name}</span>
          {isCompleted && (
            <span className="text-[10px] text-emerald-500/70 font-medium">Done</span>
          )}
        </div>
        {part.input && (
          <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
            {typeof part.input === "string" ? part.input : JSON.stringify(part.input).slice(0, 120)}
          </div>
        )}
        {part.output && isCompleted && (
          <details className="mt-1">
            <summary className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-foreground">Output</summary>
            <pre className="text-[10px] text-muted-foreground font-mono mt-1 whitespace-pre-wrap max-h-32 overflow-y-auto bg-muted/30 rounded p-2">
              {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default function ToolSummary({ tools }: ToolSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const completed = tools.filter((t) => t.type === "tool_call" && t.status === "completed").length;
  const total = tools.filter((t) => t.type === "tool_call").length;
  const running = tools.some((t) => t.type === "tool_call" && t.status === "running");
  const errored = tools.some((t) => t.type === "tool_call" && t.status === "error");

  return (
    <div className="border border-border rounded-xl bg-card/80 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <div className="flex items-center gap-2 text-xs">
          {running ? (
            <LoaderCircle className="size-3.5 text-primary animate-spin" />
          ) : errored ? (
            <XCircle className="size-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          )}
          <span className="text-foreground font-medium">
            {running ? "Running tools..." : `${completed} of ${total} tools`}
          </span>
          {running && (
            <span className="text-primary/70 text-[10px]">In progress</span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <div className="py-1">
              {tools.map((part, i) =>
                part.type === "tool_call" ? (
                  <ToolCallRow key={`${part.name}-${i}`} part={part} />
                ) : null
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
