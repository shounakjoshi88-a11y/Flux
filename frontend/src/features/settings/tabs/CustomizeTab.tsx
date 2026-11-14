/**
 * CustomizeTab — Settings → Customize, Claude.ai's structure 1:1.
 *
 * Rows, not cards: a "Connector | Type | Status" table with hairline dividers,
 * bare logo + name, and a Connect pill. Top bar: search, Yours/Discover
 * segmented, a working type-filter funnel, and a white "+ Add" button with a
 * real dropdown menu.
 *
 * Tabs: Connectors | Skills | Plugins.
 *   Connectors → built-in Google connector (one OAuth) + custom MCP servers.
 *   Skills     → the existing SkillsSection.
 *   Plugins    → installable bundles of skills from the Flux Directory.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, FileText, Palette, FlaskConical, BookOpen, Funnel,
} from "lucide-react";
import { SkillsSection } from "./SkillsSection";
import { AddCustomConnectorDialog } from "../../connectors/AddCustomConnectorDialog";
import { IconCheck, IconChevronRight, IconFolder, IconLink, IconSearch, IconPlus, IconTrash, IconMore, IconChevronDown } from "../../layout/anthropicIcons";
import {
  fetchConnectors, fetchGoogleStatus, startGoogleConnect, disconnectGoogle,
  toggleCustomConnector, deleteCustomConnector, addCustomConnector,
  type ConnectorsResponse,
} from "../../../lib/connectors";
import { fetchPlugins, installPlugin, uninstallPlugin, togglePlugin, type FluxPlugin } from "../../../lib/plugins";

export type CustomizeSubTab = "Connectors" | "Skills" | "Plugins";
type ViewMode = "yours" | "discover";
type TypeFilter = "all" | "builtin" | "mcp";

function GoogleGLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.3h6.48c-.28 1.44-1.12 2.65-2.38 3.47v2.9h3.86c2.26-2.09 3.53-5.16 3.53-8.4z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.86-2.9c-1.08.72-2.45 1.15-4.09 1.15-3.15 0-5.8-2.13-6.73-5.04H1.3v2.99C3.3 21.31 7.27 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.3c-.24-.72-.38-1.49-.38-2.3s.14-1.57.38-2.3V6.71H1.3A11.96 11.96 0 0 0 0 12c0 1.93.46 3.75 1.3 5.29l3.97-2.99z" />
      <path fill="#EA4335" d="M12 4.68c1.75 0 3.34.6 4.59 1.79l3.43-3.43C17.95 1.19 15.23 0 12 0 7.27 0 3.3 2.69 1.3 6.71l3.97 2.99c.93-2.91 3.58-5.02 6.73-5.02z" />
    </svg>
  );
}

const PLUGIN_ICONS = {
  office: FileText,
  design: Palette,
  research: FlaskConical,
} as const;

export function CustomizeTab({ initialSub = "Connectors" }: { initialSub?: CustomizeSubTab }) {
  const [sub, setSub] = useState<CustomizeSubTab>(initialSub);
  const [view, setView] = useState<ViewMode>("yours");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [funnelOpen, setFunnelOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);

  useEffect(() => { setSub(initialSub); }, [initialSub]);

  // ── Connectors ────────────────────────────────────────────────────
  const [connectors, setConnectors] = useState<ConnectorsResponse | null>(null);
  const [google, setGoogle] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [googleBusy, setGoogleBusy] = useState(false);
  const [deepwikiAdding, setDeepwikiAdding] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const refreshConnectors = useCallback(async () => {
    const [c, g] = await Promise.all([fetchConnectors(), fetchGoogleStatus()]);
    setConnectors(c);
    setGoogle(g);
  }, []);
  useEffect(() => { refreshConnectors(); }, [refreshConnectors]);
  useEffect(() => {
    const onFocus = () => { fetchGoogleStatus().then(setGoogle); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ── Plugins ───────────────────────────────────────────────────────
  const [plugins, setPlugins] = useState<FluxPlugin[] | null>(null);
  const [pluginBusy, setPluginBusy] = useState<string | null>(null);
  const refreshPlugins = useCallback(() => { fetchPlugins().then(setPlugins); }, []);
  useEffect(() => { refreshPlugins(); }, [refreshPlugins]);

  // Close popovers on outside click
  const funnelRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (funnelRef.current && !funnelRef.current.contains(t)) setFunnelOpen(false);
      if (addRef.current && !addRef.current.contains(t)) setAddMenuOpen(false);
      if (rowMenuRef.current && !rowMenuRef.current.contains(t)) setRowMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const match = (...parts: (string | null | undefined)[]) =>
    !q || parts.some((p) => p?.toLowerCase().includes(q));
  const typeOk = (kind: "builtin" | "custom") =>
    typeFilter === "all" || (typeFilter === "builtin" && kind === "builtin") || (typeFilter === "mcp" && kind === "custom");

  const installedPlugins = (plugins ?? []).filter((p) => p.installed);
  const discoverPlugins = (plugins ?? []).filter((p) => !p.installed);

  const onInstallPlugin = async (id: string) => {
    setPluginBusy(id);
    await installPlugin(id);
    refreshPlugins();
    setPluginBusy(null);
  };
  const onUninstallPlugin = async (id: string) => {
    setPluginBusy(id);
    await uninstallPlugin(id);
    refreshPlugins();
    setPluginBusy(null);
  };
  const onTogglePlugin = async (p: FluxPlugin) => {
    setPluginBusy(p.id);
    await togglePlugin(p.id, !p.enabled);
    refreshPlugins();
    setPluginBusy(null);
  };

  const onAddDeepwiki = async () => {
    setDeepwikiAdding(true);
    setHint(null);
    const result = await addCustomConnector("DeepWiki", "https://mcp.deepwiki.com/mcp");
    if (result.ok) {
      await refreshConnectors();
      setView("yours");
    } else {
      setHint(result.message ?? "Couldn't add DeepWiki.");
    }
    setDeepwikiAdding(false);
  };

  const onToggleCustom = async (id: string, enabled: boolean) => {
    setConnectors((prev) => prev
      ? { ...prev, custom: prev.custom.map((c) => (c.id === id ? { ...c, enabled } : c)) }
      : prev);
    const ok = await toggleCustomConnector(id, enabled);
    if (!ok) refreshConnectors();
  };
  const onDeleteCustom = async (id: string) => {
    const ok = await deleteCustomConnector(id);
    if (ok) setConnectors((prev) => prev ? { ...prev, custom: prev.custom.filter((c) => c.id !== id) } : prev);
    setRowMenuFor(null);
  };

  // ── Shared bits ───────────────────────────────────────────────────
  const connectPill = (label: string, onClick: () => void, busy?: boolean, subtle?: boolean) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
        subtle
          ? "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
          : "bg-[#37372f] text-[#e9e7de] hover:bg-[#45453c]"
      }`}
    >
      {busy ? "…" : label}
    </button>
  );

  const rowMenuButton = (id: string, items: { label: string; danger?: boolean; onClick: () => void }[]) => (
    <div className="relative shrink-0" ref={rowMenuFor === id ? rowMenuRef : undefined}>
      <button
        onClick={() => setRowMenuFor((v) => (v === id ? null : id))}
        aria-label="More options"
        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] transition-colors"
      >
        <IconMore className="size-4" />
      </button>
      {rowMenuFor === id && (
        <div className="absolute right-0 top-full z-[70] mt-1 w-44 rounded-xl border border-white/[0.08] bg-[#1f1e1c] py-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`block w-full px-3 py-1.5 text-left text-[12px] transition-colors ${
                item.danger ? "text-red-400 hover:bg-red-500/10" : "text-[var(--text-primary)]/90 hover:bg-white/[0.05]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const typeHeader = (
    <div className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-4 border-b border-white/[0.07] px-3 pb-2 text-[11px] font-medium text-[var(--text-muted)]">
      <span>Connector</span>
      <span>Type</span>
      <span className="pr-2 text-right">Status</span>
    </div>
  );

  const tableRow = (
    key: string,
    icon: React.ReactNode,
    name: string,
    verified: boolean,
    sub: string,
    type: string,
    action: React.ReactNode,
  ) => (
    <div key={key} className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-4 border-b border-white/[0.05] px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{name}</p>
            {verified && (
              <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-sky-400/90" fill="currentColor" aria-hidden>
                <path d="M8 0l1.76 1.76 2.42-.34 1.14 2.2 2.3.75-.75 2.3 1.77 1.77-1.77 1.77.75 2.3-2.3.75-1.14 2.2-2.42-.34L8 16l-1.77-1.77-2.42.35-1.14-2.2-2.3-.76.75-2.3L.35 8.05l1.76-1.76-.75-2.3 2.3-.76 1.14-2.2 2.42.35L8 0zm3.35 5.65a.75.75 0 00-1.1-.1l-3.3 3.2-1.35-1.3a.75.75 0 00-1.1 1.03l2 1.94c.3.3.78.28 1.06-.02l3.86-3.75a.75.75 0 00-.07-1.1z"/>
              </svg>
            )}
          </div>
          <p className="truncate text-[10px] text-[var(--text-muted)]">{sub}</p>
        </div>
      </div>
      <span className="text-[12px] text-[var(--text-muted)]">{type}</span>
      <div className="flex items-center justify-end gap-1.5">{action}</div>
    </div>
  );

  const topBar = (
    <div className="mb-4 flex items-center gap-2.5">
      {/* Search */}
      <div className="relative w-44 min-w-0">
        <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-9 w-full rounded-lg border border-white/[0.06] bg-white/[0.04] pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--text-muted)] focus:border-white/[0.12]"
          spellCheck={false}
          autoCapitalize="off"
        />
      </div>
      {/* Yours / Discover segmented */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.04] p-0.5">
        {(["yours", "discover"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-[7px] px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
              view === v ? "bg-[#37372f] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {v === "yours" ? "Yours" : "Discover"}
          </button>
        ))}
      </div>
      {/* Funnel — working type filter */}
      <div className="relative" ref={funnelRef}>
        <button
          onClick={() => setFunnelOpen((v) => !v)}
          aria-label="Filter by type"
          className={`rounded-lg p-2 transition-colors ${typeFilter !== "all" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"}`}
        >
          <Funnel className="size-4" strokeWidth={1.75} />
        </button>
        {funnelOpen && (
          <div className="absolute left-0 top-full z-[70] mt-1 w-40 rounded-xl border border-white/[0.08] bg-[#1f1e1c] py-1 shadow-2xl">
            {([["all", "All types"], ["builtin", "Built-in"], ["mcp", "Custom MCP"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setTypeFilter(v); setFunnelOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)]/90 hover:bg-white/[0.05]"
              >
                <span className="w-4 text-center">{typeFilter === v ? <IconCheck className="size-4 text-[var(--accent)]" /> : null}</span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* White + Add (Claude's button) */}
      {sub === "Connectors" && (
        <div className="relative ml-auto" ref={addRef}>
          <button
            onClick={() => setAddMenuOpen((v) => !v)}
            className="flex h-9 items-center gap-1.5 rounded-[8px] bg-[#e8e6dc] px-3 text-[13px] font-semibold text-[#1f1e1c] shadow-sm transition-colors hover:bg-white"
          >
            <IconPlus className="size-4" /> Add
            <IconChevronDown className="size-4" />
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-full z-[70] mt-1 w-56 rounded-xl border border-white/[0.08] bg-[#1f1e1c] py-1 shadow-2xl">
              <button
                onClick={() => { setAddMenuOpen(false); setDialogOpen(true); }}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)]/90 hover:bg-white/[0.05]"
              >
                Add custom connector
              </button>
              <button
                onClick={() => { setAddMenuOpen(false); setView("discover"); }}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)]/90 hover:bg-white/[0.05]"
              >
                Browse directory
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const deepwikiAdded = connectors?.custom.some((c) => c.url === "https://mcp.deepwiki.com/mcp") ?? false;

  const connectorsRows = (
    <div>
      {typeHeader}
      {view === "yours" && (
        <>
          {typeOk("builtin") && match("Google Workspace", "Gmail Calendar Drive", "google gmail calendar drive") && tableRow(
            "google",
            <GoogleGLogo className="size-5" />,
            "Google Workspace",
            true,
            google.connected && google.email ? `Connected as ${google.email}` : "Gmail · Calendar · Drive",
            "Web",
            connectPill(
              google.connected ? "Connected" : "Connect",
              async () => {
                setGoogleBusy(true);
                if (google.connected) { await disconnectGoogle(); setGoogle({ connected: false, email: null }); }
                else { await startGoogleConnect(); setTimeout(() => fetchGoogleStatus().then(setGoogle), 2500); }
                setGoogleBusy(false);
              },
              googleBusy,
              google.connected,
            ),
          )}
          {connectors?.custom.filter((c) => typeOk("custom") && match(c.name, c.subtitle, c.url)).map((c) => tableRow(
            c.id,
            <IconLink className="size-5 text-[#b9b6ac]" />,
            c.name,
            false,
            c.url,
            "Web",
            <>
              <button
                role="switch"
                aria-checked={c.enabled}
                aria-label={c.enabled ? `Disable ${c.name}` : `Enable ${c.name}`}
                onClick={() => onToggleCustom(c.id, !c.enabled)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${c.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-border)]"}`}
              >
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${c.enabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
              {rowMenuButton(c.id, [
                { label: c.enabled ? "Disable" : "Enable", onClick: () => { onToggleCustom(c.id, !c.enabled); setRowMenuFor(null); } },
                { label: "Remove connector", danger: true, onClick: () => onDeleteCustom(c.id) },
              ])}
            </>,
          ))}
          {connectors && connectors.custom.length === 0 && typeOk("custom") && (
            <button
              onClick={() => setDialogOpen(true)}
              className="flex w-full items-center gap-3 border-b border-white/[0.05] px-3 py-3 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-white/[0.02] hover:text-[var(--text-secondary)]"
            >
              <IconPlus className="size-4" />
              Add a custom MCP connector — any HTTPS address that speaks MCP.
            </button>
          )}
        </>
      )}
      {view === "discover" && (
        <>
          {typeOk("builtin") && match("Google Workspace", "Gmail Calendar Drive", "google gmail calendar drive") && tableRow(
            "google-d",
            <GoogleGLogo className="size-5" />,
            "Google Workspace",
            true,
            "by Google",
            "Web",
            google.connected
              ? connectPill("Connected", () => {}, false, true)
              : connectPill("Connect", async () => { setGoogleBusy(true); await startGoogleConnect(); setTimeout(() => fetchGoogleStatus().then(setGoogle), 2500); setGoogleBusy(false); }, googleBusy),
          )}
          {typeOk("custom") && match("DeepWiki", "github repository documentation ask remote mcp", "remote mcp") && tableRow(
            "deepwiki-d",
            <BookOpen className="size-5 text-sky-400/90" strokeWidth={1.5} />,
            "DeepWiki",
            true,
            "by DeepWiki · remote · free, no auth",
            "Web",
            deepwikiAdded
              ? connectPill("Added", () => {}, false, true)
              : connectPill(deepwikiAdding ? "…" : "Add", onAddDeepwiki, deepwikiAdding),
          )}
          {typeOk("custom") && tableRow(
            "custom-hint",
            <IconLink className="size-5 text-[var(--text-muted)]" />,
            "Your own MCP server",
            false,
            "Any HTTPS endpoint speaking MCP",
            "Web",
            connectPill("Add", () => setDialogOpen(true)),
          )}
        </>
      )}
      {/* Empty state for filters */}
      {!connectors && <p className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">Loading connectors…</p>}
      {hint && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-400/90">{hint}</p>}
    </div>
  );

  const pluginsPanel = (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/[0.07] px-3 pb-2 text-[11px] font-medium text-[var(--text-muted)]">
        <span>Plugin</span>
        <span className="pr-2 text-right">{view === "yours" ? "Active" : "Install"}</span>
      </div>
      {plugins === null && <p className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">Loading plugins…</p>}
      {view === "yours" && plugins?.filter((p) => p.installed && match(p.name, p.description, p.skills.join(" "))).map((p) => {
        const Icon = PLUGIN_ICONS[p.iconKey];
        return (
          <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/[0.05] px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="size-6 shrink-0 text-[#b9b6ac]" strokeWidth={1.5} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{p.name}</p>
                  <span className="shrink-0 rounded border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">{p.badge}</span>
                </div>
                <p className="truncate text-[10px] text-[var(--text-muted)]">{p.skills.join(" · ")}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                role="switch"
                aria-checked={p.enabled}
                aria-label={p.enabled ? `Disable ${p.name}` : `Enable ${p.name}`}
                disabled={pluginBusy === p.id}
                onClick={() => onTogglePlugin(p)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${p.enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-border)]"}`}
              >
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${p.enabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
              {rowMenuButton(p.id, [
                { label: p.enabled ? "Disable" : "Enable", onClick: () => onTogglePlugin(p) },
                { label: "Uninstall", danger: true, onClick: () => onUninstallPlugin(p.id) },
              ])}
            </div>
          </div>
        );
      })}
      {view === "discover" && plugins?.filter((p) => !p.installed && match(p.name, p.description, p.skills.join(" "))).map((p) => {
        const Icon = PLUGIN_ICONS[p.iconKey];
        return (
          <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-white/[0.05] px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="size-6 shrink-0 text-[#b9b6ac]" strokeWidth={1.5} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{p.name}</p>
                  <span className="shrink-0 rounded border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">{p.badge}</span>
                </div>
                <p className="truncate text-[10px] text-[var(--text-muted)]">{p.skills.join(" · ")}</p>
              </div>
            </div>
            <button
              onClick={() => onInstallPlugin(p.id)}
              disabled={pluginBusy === p.id}
              aria-label={`Install ${p.name}`}
              title={`Install ${p.name} (enables its skills)`}
              className="shrink-0 rounded-[8px] bg-[#37372f] px-3.5 py-1.5 text-[12px] font-semibold text-[#e9e7de] transition-colors hover:bg-[#45453c] disabled:opacity-60"
            >
              {pluginBusy === p.id ? "…" : "Install"}
            </button>
          </div>
        );
      })}
      {view === "yours" && plugins && plugins.filter((p) => p.installed).length === 0 && (
        <button onClick={() => setView("discover")} className="flex w-full items-center gap-3 px-3 py-6 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-white/[0.02] hover:text-[var(--text-secondary)]">
          <IconPlus className="size-4" />
          No plugins installed yet — browse the directory.
        </button>
      )}
    </div>
  );

  return (
    <div>
      {/* Claude's tab strip */}
      <div className="mb-4 flex items-center gap-5 border-b border-white/[0.06]">
        {(["Connectors", "Skills", "Plugins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSub(t)}
            className={`relative pb-2.5 text-[14px] transition-colors ${
              sub === t ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t}
            {sub === t && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--text-primary)]/70" />}
          </button>
        ))}
      </div>

      {sub === "Skills" ? (
        <SkillsSection />
      ) : (
        <>
          {topBar}
          {sub === "Connectors" ? connectorsRows : pluginsPanel}
        </>
      )}

      <AddCustomConnectorDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdded={() => { refreshConnectors(); setView("yours"); }}
        onBrowsePrebuilt={() => setView("discover")}
      />
    </div>
  );
}
