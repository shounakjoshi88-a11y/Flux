// src/components/SidebarThread.tsx
import { Trash2 } from "lucide-react";

type SidebarThreadProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
};

export function SidebarThread({
  title,
  isActive,
  onClick,
  onDelete,
}: SidebarThreadProps) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`
          w-full text-left truncate rounded-lg px-3 py-2.5 text-sm transition-all duration-150
          ${
            isActive
              ? "bg-black/5 dark:bg-white/10 font-medium text-foreground"
              : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
          }
        `}
      >
        {/* Gradient fade on the right side */}
        <span
          className="block truncate pr-6"
          style={{
            maskImage:
              "linear-gradient(to right, black 80%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 80%, transparent 100%)",
          }}
        >
          {title}
        </span>
      </button>
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition"
        title="Delete thread"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}