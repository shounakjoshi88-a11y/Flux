import { MessageSquare, Component, Network, Newspaper, Bot, Sun, Moon } from "lucide-react";
import { IconClose, IconExternal, IconGear, IconHistory, IconPeople, IconPlus, IconSearch } from "./anthropicIcons";
import { motion, AnimatePresence } from "framer-motion";
import type { ComponentType } from "react";

interface MobileBottomNavProps {
  activeScreen: "chat" | "history" | "search";
  onScreenChange: (screen: "chat" | "history" | "search") => void;
  hasStarted: boolean;
  onCreateThread: () => void;
}

const navItems: { key: "chat" | "history" | "search"; icon: ComponentType<{ className?: string }>; label: string }[] = [
  { key: "chat", icon: MessageSquare, label: "Chat" },
  { key: "history", icon: IconHistory, label: "History" },
  { key: "search", icon: IconSearch, label: "Search" },
];

export function MobileBottomNav({
  activeScreen,
  onScreenChange,
  hasStarted,
  onCreateThread,
}: MobileBottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] pt-2 bg-sidebar border-t border-sidebar-border">
      {navItems.map(({ key, icon: Icon, label }) => {
        const isActive = activeScreen === key;
        return (
          <button
            key={key}
            onClick={() => onScreenChange(key as any)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors ${
              isActive ? "text-[var(--accent)]" : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
            }`}
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}

      <button
        onClick={onCreateThread}
        className="flex items-center justify-center size-10 rounded-full bg-[var(--accent)] text-white shadow-lg -mt-3"
      >
        <motion.div
          animate={hasStarted ? { rotate: 0 } : { rotate: 45 }}
          transition={{ duration: 0.2 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.div>
      </button>
    </div>
  );
}

export function MobileSidebarDrawer({
  isOpen,
  onClose,
  onArtifactsOpen,
  onWikiOpen,
  onNewsOpen,
  onCustomAgentsOpen,
  onTeamOpen,
  onSettingsOpen,
  onLogout,
  isDarkMode,
  toggleTheme,
  userEmail,
}: {
  isOpen: boolean;
  onClose: () => void;
  onArtifactsOpen: () => void;
  onWikiOpen: () => void;
  onNewsOpen: () => void;
  onCustomAgentsOpen: () => void;
  onTeamOpen: () => void;
  onSettingsOpen: () => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  userEmail?: string;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-0 left-0 bottom-0 w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
              <span className="text-sm font-semibold text-sidebar-foreground">Flux</span>
              <button onClick={onClose} className="p-1.5 hover:bg-sidebar-accent rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground">
                <IconClose className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {[
                { icon: Component, label: "Artifacts", onClick: onArtifactsOpen },
                { icon: Network, label: "Knowledge Graph", onClick: onWikiOpen },
                { icon: Newspaper, label: "Live News", onClick: onNewsOpen },
                { icon: IconPeople, label: "Team Mode", onClick: onTeamOpen },
                { icon: Bot, label: "Custom Agents", onClick: onCustomAgentsOpen },
              ].map(({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  onClick={() => { onClick(); onClose(); }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition"
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            <div className="border-t border-sidebar-border p-2 space-y-1">
              <button
                onClick={() => { toggleTheme(); onClose(); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition"
              >
                {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
                {isDarkMode ? "Light mode" : "Dark mode"}
              </button>
              <button
                onClick={() => { onSettingsOpen(); onClose(); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition"
              >
                <IconGear className="size-4" /> Settings
              </button>
              <button
                onClick={onLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition"
              >
                <IconExternal className="size-4" /> Logout
              </button>
              {userEmail && (
                <div className="px-3 py-2 text-xs text-sidebar-foreground/40 truncate">{userEmail}</div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}