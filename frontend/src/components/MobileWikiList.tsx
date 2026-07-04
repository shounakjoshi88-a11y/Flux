import { useState, useMemo } from "react";
import { Search, X, Network, ChevronRight, LoaderCircle, RefreshCw, AlertCircle } from "lucide-react";
import type { WikiNode, WikiEdge } from "./WikiGraph";

const BASE_COLORS: Record<string, string> = {
  concept: "#cc785c",
  entity: "#5db8a6",
  topic: "#e8a55a",
  lesson: "#6aab73",
  source: "#8b7ec8",
};
const FALLBACK_COLORS = ["#c97bdb", "#d4886c", "#5ca8cc", "#c4c45c", "#cc5c7b", "#5cccc0"];
const colorCache: Record<string, string> = { ...BASE_COLORS };

function getNodeColor(type: string): string {
  if (colorCache[type]) return colorCache[type];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  const color = FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length] ?? '#888';
  colorCache[type] = color;
  return color;
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { concept: "Concepts", entity: "Entities", topic: "Topics", lesson: "Lessons", source: "Sources" };
  if (labels[type]) return labels[type];
  return type.charAt(0).toUpperCase() + type.slice(1) + "s";
}

type MobileWikiListProps = {
  nodes: WikiNode[];
  edges: WikiEdge[];
  loading: boolean;
  rebuilding: boolean;
  rebuildProgress: string;
  rebuildError: string | null;
  stats: { concepts: number; relationships: number } | null;
  onRebuild: () => void;
  onClose: () => void;
  isLight: boolean;
};

export function MobileWikiList({ nodes, edges, loading, rebuilding, rebuildProgress, rebuildError, stats, onRebuild, onClose, isLight }: MobileWikiListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<WikiNode | null>(null);
  const [expanded, setExpanded] = useState(false);

  const allTypes = useMemo(() => Array.from(new Set(nodes.map(n => n.type))), [nodes]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (selectedType) result = result.filter(n => n.type === selectedType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => n.label.toLowerCase().includes(q) || (n.description || "").toLowerCase().includes(q));
    }
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes, selectedType, searchQuery]);

  const connected = useMemo(() => {
    if (!selectedNode) return [];
    const conns: Array<{ node: WikiNode; edge: WikiEdge }> = [];
    for (const e of edges) {
      if (e.sourceId === selectedNode.id) {
        const o = nodes.find(n => n.id === e.targetId);
        if (o) conns.push({ node: o, edge: e });
      } else if (e.targetId === selectedNode.id) {
        const o = nodes.find(n => n.id === e.sourceId);
        if (o) conns.push({ node: o, edge: e });
      }
    }
    return conns;
  }, [selectedNode, nodes, edges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <LoaderCircle className="size-6 animate-spin text-[#cc785c]" />
      </div>
    );
  }

  if (selectedNode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <button onClick={() => setSelectedNode(null)} className="text-sm text-[#cc785c] font-medium">&larr; Back</button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="size-4 text-white/60" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: getNodeColor(selectedNode.type) }} />
              <h2 className="text-lg font-semibold text-white">{selectedNode.label}</h2>
            </div>
            <p className="text-xs text-white/40 mt-1 capitalize">{selectedNode.type}</p>
          </div>
          {selectedNode.description && (
            <p className="text-sm text-white/70 leading-relaxed">{selectedNode.description}</p>
          )}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Connections ({connected.length})</h3>
            <div className="space-y-1">
              {connected.map(c => (
                <button key={c.edge.id} onClick={() => setSelectedNode(c.node)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-left"
                >
                  <span className="size-2 rounded-full shrink-0" style={{ background: getNodeColor(c.node.type) }} />
                  <span className="text-sm text-white/80">{c.node.label}</span>
                  <span className="text-xs text-white/40 ml-auto">{c.edge.relationship}</span>
                </button>
              ))}
              {connected.length === 0 && <p className="text-xs text-white/30">No direct connections</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-[#cc785c]" />
          <span className="text-sm font-semibold text-white">Knowledge Graph</span>
          {nodes.length > 0 && (
            <span className="text-xs text-white/30">{nodes.length} nodes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rebuilding ? (
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <LoaderCircle className="size-3 animate-spin" />
              <span>{rebuildProgress || "Building..."}</span>
            </div>
          ) : (
            <button onClick={onRebuild} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70">
              <RefreshCw className="size-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/5 shrink-0">
        <div className="relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search concepts..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#cc785c]/40"
          />
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/5 shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-1.5">
          <button onClick={() => setSelectedType(null)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${!selectedType ? "bg-[#cc785c] text-white" : "bg-white/5 text-white/50 hover:text-white/70"}`}
          >All</button>
          {allTypes.map(t => (
            <button key={t} onClick={() => setSelectedType(t === selectedType ? null : t)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${selectedType === t ? "bg-white/10 text-white" : "bg-white/5 text-white/50 hover:text-white/70"}`}
            >
              <span className="size-2 rounded-full" style={{ background: getNodeColor(t) }} />
              {getTypeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-white/30">
            {rebuildError ? (
              <>
                <AlertCircle className="size-8 text-red-400/60" />
                <p className="text-xs">{rebuildError}</p>
              </>
            ) : nodes.length === 0 ? (
              <>
                <Network className="size-8" strokeWidth={1.5} />
                <p className="text-xs">No concepts yet</p>
                <button onClick={onRebuild} className="px-4 py-2 rounded-lg bg-[#cc785c] text-white text-xs font-medium mt-2">
                  Build from chat history
                </button>
              </>
            ) : (
              <p className="text-xs">No matching results</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredNodes.map(n => (
              <button key={n.id} onClick={() => setSelectedNode(n)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors"
              >
                <span className="size-2.5 rounded-full shrink-0" style={{ background: getNodeColor(n.type) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">{n.label}</p>
                  {n.description && (
                    <p className="text-xs text-white/30 truncate mt-0.5">{n.description}</p>
                  )}
                </div>
                <span className="text-[10px] text-white/20 capitalize shrink-0">{n.type}</span>
                <ChevronRight className="size-3.5 text-white/20 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
