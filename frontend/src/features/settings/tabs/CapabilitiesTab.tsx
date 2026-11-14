/**
 * CapabilitiesTab — the Capabilities settings panel.
 *
 * Extracted from `features/settings/Settings.tsx`: the memory toggle and the
 * memory manager (which replaces the panel while `showMemoryManager` is
 * true), plus the tool-access and connector-discovery options.
 */
import { ArrowLeft, Brain, Loader2, Trash2 } from "lucide-react";
import type { MemoryItem } from "../settingsMemory";
import { ToggleRow } from "../ToggleRow";
/**
 * Props for CapabilitiesTab, threaded from the settings modal in
 * `features/settings/Settings.tsx`, which owns the state.
 */
export interface CapabilitiesTabProps {
  showMemoryManager: boolean;
  setShowMemoryManager: (v: boolean) => void;
  enableMemory: boolean;
  setEnableMemory: (v: boolean) => void;
  handleToggle: (key: string, setter: (v: boolean) => void, currentValue: boolean) => void;
  memories: MemoryItem[];
  memoriesLoading: boolean;
  debugInfo: any;
  loadMemories: () => void | Promise<void>;
  handleDeleteMemory: (memoryId: string) => void | Promise<void>;
  deletingMemoryId: string | null;
  toolAccessMode: string;
  setToolAccessMode: (v: string) => void;
  handleSelectChange: (key: string, setter: (v: string) => void, value: string) => void;
  connectorDiscovery: boolean;
  setConnectorDiscovery: (v: boolean) => void;
  selectClass: string;
}


export function CapabilitiesTab({
  showMemoryManager,
  setShowMemoryManager,
  enableMemory,
  setEnableMemory,
  handleToggle,
  memories,
  memoriesLoading,
  debugInfo,
  loadMemories,
  handleDeleteMemory,
  deletingMemoryId,
  toolAccessMode,
  setToolAccessMode,
  handleSelectChange,
  connectorDiscovery,
  setConnectorDiscovery,
  selectClass,
}: CapabilitiesTabProps) {
  if (!showMemoryManager) {
    return (
    <div className="space-y-10 max-w-2xl mx-auto">
      <div><h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-5">Memory</h3><div className="space-y-5"><ToggleRow label="Generate memory from chat history" description="Allow Flux to remember relevant context from your chats." enabled={enableMemory} onToggle={() => handleToggle("enable_memory", setEnableMemory, enableMemory)} /><button className="w-full text-left px-5 py-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--surface-border)]/50 transition-all duration-200 flex items-center justify-between text-sm" onClick={() => { setShowMemoryManager(true); loadMemories(); }}><span className="font-medium text-[var(--text-primary)]">View and manage memory</span><span className="text-xs text-[var(--text-primary)]/40">{memories.length > 0 ? `${memories.length} items` : 'Empty'}</span></button></div></div>
      <div><h3 className="text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--text-primary)]/40 mb-5">General</h3><div className="space-y-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-[var(--text-primary)]">Tool access mode</p><p className="text-xs text-[var(--text-primary)]/50 mt-0.5">Controls how connector tools are loaded in new conversations.</p></div><select value={toolAccessMode} onChange={(e) => handleSelectChange("tool_access_mode", setToolAccessMode, e.target.value)} className={selectClass}><option value="load_tools_when_needed">Load when needed</option><option value="always_allow">Always allow</option><option value="manual">Manual approval</option></select></div><ToggleRow label="Connector discovery" description="Let Flux surface connectors from the directory that may be relevant to your conversation." enabled={connectorDiscovery} onToggle={() => handleToggle("connector_discovery", setConnectorDiscovery, connectorDiscovery)} /></div></div>
    </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setShowMemoryManager(false)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition">
          <ArrowLeft className="size-4" />
        </button>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Memory Manager</h3>
      </div>
    
      {debugInfo && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--bg-secondary)] text-[10px] font-mono text-[var(--text-primary)]/50 overflow-hidden">
          <p>appUserId: {debugInfo.appUserId}</p>
          <p>supabaseId: {debugInfo.supabaseUserId}</p>
          <p>email: {debugInfo.email}</p>
        </div>
      )}

      {memoriesLoading ? (<div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-[var(--text-primary)]/40" /></div>) : memories.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-primary)]/50">
          <Brain className="size-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No memories stored yet.</p>
          <p className="text-xs mt-1 mb-4">Memories are automatically created when you chat with Flux.</p>
          <button onClick={loadMemories} className="px-4 py-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium hover:bg-[var(--accent)]/20 transition">
            Retry Fetch
          </button>
        </div>
      ) : (
        <div className="space-y-2">{memories.map((memory) => (<div key={memory.id} className="flex items-start justify-between gap-4 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--surface-border)] hover:border-[var(--surface-border)] transition-all duration-200 group"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">{memory.category}</span><span className="text-[10px] text-[var(--text-primary)]/40">{Math.round(memory.importance * 100)}% importance</span></div><p className="text-sm text-[var(--text-primary)] leading-relaxed">{memory.fact}</p><p className="text-[10px] text-[var(--text-primary)]/40 mt-1.5">{new Date((memory as any).createdAt || memory.created_at || new Date()).toLocaleString()}</p></div><button onClick={() => handleDeleteMemory(memory.id)} disabled={deletingMemoryId === memory.id} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-[var(--text-primary)]/40 hover:text-red-500 transition-all duration-200 opacity-0 group-hover:opacity-100 flex-shrink-0">{deletingMemoryId === memory.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button></div>))}</div>
      )}
    </div>
  );
}
