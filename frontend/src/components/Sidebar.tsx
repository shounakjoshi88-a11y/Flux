// src/components/Sidebar.tsx
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  Moon,
  MessageCirclePlus,
  PanelLeftClose,
  Search,
  Sun,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { SidebarThread } from "./SidebarThread";
import { useState, useRef, useEffect } from "react";

type ConversationListItem = {
  id: string;
  title: string | null;
  slug: string;
  lastMessageAt: string | null;
};

type SidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  user: User | null;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onCreateThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
};

export function Sidebar({
  isOpen,
  onToggle,
  user,
  conversations,
  activeConversationId,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
  isDarkMode,
  toggleTheme,
  onLogout,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  useEffect(() => {
    setAvatarError(false);
  }, [user]);

  const filtered = search.trim()
    ? conversations.filter((c) =>
        (c.title ?? "Untitled conversation")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : conversations;

  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.identities?.[0]?.identity_data?.avatar_url ||
    user?.identities?.[0]?.identity_data?.picture;

  return (
    <>
      <aside
        className={`
          fixed top-0 left-0 h-full z-20 flex flex-col
          bg-[#f8f8f8] dark:bg-[#181818]        /* lighter sidebar */
          border-r border-black/5 dark:border-white/5
          transition-all duration-300 ease-in-out
          ${isOpen ? "w-[280px]" : "w-0 border-none opacity-0 pointer-events-none"}
        `}
      >
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full p-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <div className="size-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  F
                </div>
                <span className="font-semibold text-lg tracking-tight text-foreground">
                  Flux
                </span>
              </div>
              <button
                onClick={onToggle}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md text-muted-foreground transition"
              >
                <PanelLeftClose className="size-5" />
              </button>
            </div>

            {/* New chat button – WHITE background */}
            <button
              type="button"
              onClick={onCreateThread}
              className="w-full flex items-center justify-center gap-2 bg-white dark:bg-[#3a3f47] hover:bg-gray-50 dark:hover:bg-[#464c54] text-black dark:text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm mb-4 shadow-sm"
            >
              <MessageCirclePlus className="size-4" />
              New chat
            </button>

            {/* Search bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search threads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-black/5 dark:bg-white/5 border border-transparent focus:border-[#40E0FF]/40 focus:bg-background dark:focus:bg-[#0d0d0d] rounded-lg outline-none text-foreground placeholder:text-muted-foreground/60 transition sidebar-search-input"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground transition"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Threads */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 sidebar-scroll">
              {filtered.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-8">
                  No conversations yet.
                </p>
              ) : (
                filtered.map((conv) => (
                  <SidebarThread
                    key={conv.id}
                    id={conv.id}
                    title={conv.title ?? "Untitled conversation"}
                    isActive={activeConversationId === conv.id}
                    onClick={() => onSelectThread(conv.id)}
                    onDelete={() => onDeleteThread(conv.id)}
                  />
                ))
              )}
            </div>

            {/* Bottom user area */}
            <div className="border-t border-black/5 dark:border-white/5 pt-3 mt-3" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <div className="flex items-center gap-3 truncate">
                  {/* Google avatar or fallback initial */}
                  {avatarUrl && !avatarError ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      className="size-8 rounded-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="size-8 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-sm font-semibold uppercase text-foreground">
                      {user?.email?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="truncate text-left">
                    <p className="text-sm font-medium truncate text-foreground">
                      {user?.email?.split("@")[0]}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden ml-2"
                  >
                    <div className="mt-2 space-y-1">
                      <button
                        onClick={() => {
                          toggleTheme();
                          setUserMenuOpen(false);
                        }}
                        className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 transition"
                      >
                        <motion.div
                          initial={false}
                          animate={{ rotate: isDarkMode ? 0 : 360 }}
                          transition={{ duration: 0.4 }}
                        >
                          {isDarkMode ? (
                            <Sun className="size-4" />
                          ) : (
                            <Moon className="size-4" />
                          )}
                        </motion.div>
                        {isDarkMode ? "Light Mode" : "Dark Mode"}
                      </button>
                      <button
                        onClick={() => {
                          onLogout();
                          setUserMenuOpen(false);
                        }}
                        className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 transition text-red-500"
                      >
                        <LogOut className="size-4" /> Logout
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </aside>

      {/* Floating toggle when sidebar closed */}
      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          onClick={onToggle}
          className="fixed top-4 left-4 z-30 p-2 text-muted-foreground hover:text-foreground bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-full border border-white/10 shadow-lg transition"
        >
          <PanelLeftClose className="size-5" />
        </motion.button>
      )}
    </>
  );
}