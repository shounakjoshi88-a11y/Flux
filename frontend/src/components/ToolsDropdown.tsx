// src/components/ToolsDropdown.tsx
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, SearchCheck } from "lucide-react";
import { memo } from "react";

type ToolsDropdownProps = {
  activeTab: "answer" | "links" | "images";
  onTabChange: (tab: "answer" | "links" | "images") => void;
  showPromptHistory: boolean;
  onTogglePromptHistory: () => void;
};

export const ToolsDropdown = memo(function ToolsDropdown({
  activeTab,
  onTabChange,
  showPromptHistory,
  onTogglePromptHistory,
}: ToolsDropdownProps) {
  return (
    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
      <button
        onClick={() => onTabChange("answer")}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
          activeTab === "answer" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
        }`}
      >
        Answer
      </button>
      <button
        onClick={() => onTabChange("links")}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
          activeTab === "links" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
        }`}
      >
        Links
      </button>
      <button
        onClick={() => onTabChange("images")}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
          activeTab === "images" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
        }`}
      >
        Images
      </button>
      <div className="w-[1px] h-4 bg-white/10 mx-1" />
      <button
        onClick={onTogglePromptHistory}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
          showPromptHistory ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
        }`}
      >
        History
      </button>
    </div>
  );
});
