import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ListChecks, Lightbulb } from "lucide-react";
import type { PlanStep } from "@/types";

type PlanDisplayProps = {
  steps: PlanStep[];
  userIntent: string;
  reasoning: string;
};

export default function PlanDisplay({ steps, userIntent, reasoning }: PlanDisplayProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center">
            <ListChecks className="size-3 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">
            Execution Plan ({steps.length} step{steps.length > 1 ? "s" : ""})
          </span>
        </div>
        <ChevronDown className={`size-4 text-muted-foreground/60 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 pb-4 space-y-3"
        >
          {reasoning && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
              <Lightbulb className="size-3.5 mt-0.5 shrink-0 text-primary/60" />
              <span>{reasoning}</span>
            </div>
          )}

          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className="flex items-start gap-3 text-sm"
              >
                <div className="flex flex-col items-center gap-1">
                  <div className={`size-6 rounded-full flex items-center justify-center text-xs font-medium border ${step.required ? "border-primary/30 text-primary" : "border-border text-muted-foreground"}`}>
                    {idx + 1}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="w-px h-4 bg-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-xs text-foreground">{step.description}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {step.required ? (
                      <span className="text-[10px] text-primary font-medium">Required</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Optional</span>
                    )}
                    {step.maxRetries > 0 && (
                      <span className="text-[10px] text-muted-foreground">Retries: {step.maxRetries}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
