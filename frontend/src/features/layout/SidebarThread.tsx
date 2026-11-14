/**
 * One conversation in the sidebar list.
 *
 * Matched to claude.ai's measured thread row: 32px tall, 8px radius, a small
 * hollow bullet on the left, a 14px/21px title, and a kebab control that
 * appears on hover (always visible on the active row). The active row uses
 * Claude's `--sidebar-active` fill (white at 15%).
 *
 * The kebab opens a small menu with Rename and Delete; rename is delegated to
 * the dashboard's rename flow via `onRenameThread`.
 */
import React, { memo, useCallback, useRef, useState } from "react";
import { IconTrash, IconMore, IconCustomize } from "./anthropicIcons";

type SidebarThreadProps = {
  id: string;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  /** Opens the dashboard rename flow for this thread id. */
  onRename?: (id: string) => void;
  onHover?: () => void;
};

function SidebarThread({ id, title, isActive, onClick, onDelete, onRename, onHover }: SidebarThreadProps) {
  const didPrefetch = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (didPrefetch.current) return;
    didPrefetch.current = true;
    onHover?.();
  }, [onHover]);

  const handleMouseLeave = useCallback(() => {
    // Reset on leave so a return visit after cache TTL can prefetch again
    didPrefetch.current = false;
  }, []);

  // Close the kebab menu on any outside click.
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      ref={menuRef}
      className="group relative mx-2 w-[calc(100%-16px)]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={onClick}
        className={`
          flex h-8 w-full items-center gap-2 rounded-[8px] px-0.5 text-left transition-colors duration-150 cursor-pointer relative
          ${
            isActive
              ? "bg-sidebar-active text-sidebar-foreground"
              : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
        <span className="block truncate flex-1 text-[14px] leading-[21px] pr-6">
          {title}
        </span>
      </button>
      {/* Kebab menu - appears on hover, always on the active row (Claude behaviour) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((p) => !p);
        }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-[6px] text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-opacity cursor-pointer ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        } ${menuOpen ? "opacity-100" : ""}`}
        title="Thread options"
      >
        <IconMore className="size-4" />
      </button>
      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 w-40 bg-sidebar border border-sidebar-border rounded-[10px] shadow-xl z-50 p-1 overflow-hidden"
        >
          {onRename && (
            <button
              onClick={() => {
                setMenuOpen(false);
                onRename(id);
              }}
              className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-[435] text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
            >
              <IconCustomize className="size-4 opacity-70" />
              Rename
            </button>
          )}
          <button
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-[435] text-red-400/90 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
          >
            <IconTrash className="size-4 opacity-80" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

const SidebarThreadMemo = React.memo(SidebarThread);
export default SidebarThreadMemo;
export { SidebarThreadMemo as SidebarThread };
