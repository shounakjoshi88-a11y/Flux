// src/components/SidebarThread.tsx
import { memo, useRef, useCallback } from "react";
import { Trash2 } from "lucide-react";

type SidebarThreadProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onHover?: () => void; // fires once on first hover to prefetch conversation
};

export const SidebarThread = memo(function SidebarThread({
  title,
  isActive,
  onClick,
  onDelete,
  onHover,
}: SidebarThreadProps) {
  // Track whether we already fired the prefetch for this hover session
  const didPrefetch = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (!isActive && !didPrefetch.current && onHover) {
      didPrefetch.current = true;
      onHover();
    }
  }, [isActive, onHover]);

  // Reset on leave so a return visit after cache TTL can prefetch again
  const handleMouseLeave = useCallback(() => {
    didPrefetch.current = false;
  }, []);

  return (
    <div className="group relative w-[calc(100%-16px)] mx-2" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        onClick={onClick}
        className={`
          w-full text-left truncate rounded-lg px-2.5 h-9 flex items-center text-sm transition-all duration-150 cursor-pointer
          ${
            isActive
              ? "bg-sidebar-accent text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }
        `}
      >
        <span
          className="block truncate pr-6 flex-1 leading-snug"
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
      {/* Delete button – appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/15 text-sidebar-foreground/40 hover:text-red-400 transition cursor-pointer"
        title="Delete thread"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
});