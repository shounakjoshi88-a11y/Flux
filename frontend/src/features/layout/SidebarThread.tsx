/**
 * One conversation in the sidebar list.
 *
 * Styled after claude.ai: a 32px row with a small hollow bullet on the left,
 * the title in 14px, and a kebab menu that appears on hover. The active
 * conversation gets a faint filled pill and always shows the menu.
 */
import React, { memo, useCallback, useRef, useState } from "react";
import { IconTrash, IconMore } from "./anthropicIcons";

type SidebarThreadProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onHover?: () => void;
};

function SidebarThread({ id, title, isActive, onClick, onDelete, onHover }: SidebarThreadProps) {
  const didPrefetch = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (didPrefetch.current) return;
    didPrefetch.current = true;
    onHover?.();
  }, [onHover]);

  const handleMouseLeave = useCallback(() => {
    // Reset on leave so a return visit after cache TTL can prefetch again
    didPrefetch.current = false;
  }, []);

  return (
    <div
      className="group relative w-[calc(100%-16px)] mx-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={onClick}
        className={`
          flex w-full items-center gap-2 truncate rounded-lg px-2 h-8 text-left transition-colors duration-150 cursor-pointer relative
          ${
            isActive
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          }
        `}
      >
        {/* Bullet marker, like Claude's list items */}
        <span
          className="size-1.5 shrink-0 rounded-full border"
          style={{
            borderColor: isActive ? "var(--sidebar-foreground)" : "var(--sidebar-foreground)",
            opacity: isActive ? 0.9 : 0.45,
          }}
        />
        <span className="block truncate pr-6 flex-1 text-[14px] leading-[21px]">
          {title}
        </span>
      </button>
      {/* Delete button - appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/15 text-sidebar-foreground/40 hover:text-red-400 transition cursor-pointer"
        title="Delete thread"
      >
        <IconTrash className="size-[18px]" />
      </button>
    </div>
  );
}

const SidebarThreadMemo = React.memo(SidebarThread);
export default SidebarThreadMemo;
export { SidebarThreadMemo as SidebarThread };
