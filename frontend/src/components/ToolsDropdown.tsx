// src/components/ToolsDropdown.tsx
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, SearchCheck, Loader2 } from "lucide-react";

type ToolsDropdownProps = {
  isOpen: boolean;
  onClose: () => void;
  onCanvasSelect: () => void;
};

export function ToolsDropdown({ isOpen, onClose, onCanvasSelect }: ToolsDropdownProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop to close on click outside */}
          <div
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-white/10 bg-[#1a1a1a] shadow-lg z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Canvas option */}
            <button
              type="button"
              onClick={() => {
                onCanvasSelect();
                onClose();
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition text-left"
            >
              <div className="p-1.5 rounded-lg bg-blue-500/20">
                <Pencil className="size-4 text-blue-400" />
              </div>
              <div>
                <p className="font-medium">Canvas</p>
                <p className="text-xs text-muted-foreground">Live HTML playground</p>
              </div>
            </button>

            {/* Deep Research (disabled) */}
            <button
              type="button"
              disabled
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-muted-foreground cursor-not-allowed text-left"
            >
              <div className="p-1.5 rounded-lg bg-gray-500/20">
                <SearchCheck className="size-4 text-gray-500" />
              </div>
              <div>
                <p className="font-medium flex items-center gap-2">
                  Deep Research
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                    soon
                  </span>
                </p>
                <p className="text-xs opacity-70">Multi‑source analysis</p>
              </div>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}