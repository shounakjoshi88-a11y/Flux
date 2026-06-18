import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import * as d3 from "d3";
import { X, Search, LoaderCircle, RefreshCw, AlertCircle, Network } from "lucide-react";
import { BACKEND_URL } from "../lib/config";
import { createClient } from "../lib/client";

const supabase = createClient();

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

async function apiFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface WikiNode {
  id: string;
  label: string;
  description?: string;
  type: string;
  sourceUrl?: string;
}

interface WikiEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
  weight: number;
  source: { label: string };
  target: { label: string };
}

interface WikiGraphProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLORS: Record<string, string> = {
  concept: "#cc785c",
  entity: "#5db8a6",
  topic: "#e8a55a",
  lesson: "#6aab73",
  source: "#8b7ec8",
};
const TYPE_LABELS: Record<string, string> = {
  concept: "Concepts",
  entity: "Entities",
  topic: "Topics",
  lesson: "Lessons",
  source: "Sources",
};
// Fallback color palette for unknown types
const FALLBACK_COLORS = ["#c97bdb", "#d4886c", "#5ca8cc", "#c4c45c", "#cc5c7b", "#5cccc0"];

function getNodeColor(type: string): string {
  if (COLORS[type]) return COLORS[type];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % FALLBACK_COLORS.length;
  COLORS[type] = FALLBACK_COLORS[idx];
  return COLORS[type];
}

function getTypeLabel(type: string): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  const label = type.charAt(0).toUpperCase() + type.slice(1) + "s";
  TYPE_LABELS[type] = label;
  return label;
}

const DARK = "#0f0f0e";
const PANEL = "#141413";
const BORDER = "#1f1e1b";
const TXT_SEC = "#6c6a64";
const TXT_MUTED = "#8e8b82";

export function WikiGraph({ isOpen, onClose }: WikiGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<any>(null);
  const initRef = useRef(false);

  const [nodes, setNodes] = useState<WikiNode[]>([]);
  const [edges, setEdges] = useState<WikiEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState("");
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ concepts: number; relationships: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<WikiNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WikiNode[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState<Array<{ node: WikiNode; edge: WikiEdge }>>([]);

  // Derive all unique types from actual node data and keep filters in sync
  const allTypes = Array.from(new Set(nodes.map(n => n.type)));

  useEffect(() => {
    if (allTypes.length > 0) {
      setActiveFilters(prev => {
        if (prev.size === 0) return new Set(allTypes);
        const next = new Set(prev);
        for (const t of allTypes) {
          if (!next.has(t)) next.add(t);
        }
        return next;
      });
    }
  }, [allTypes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/wiki`);
      if (data.nodes) { setNodes(data.nodes); setEdges(data.edges || []); }
    } catch (e) { console.warn("[WikiGraph] fetch failed", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isOpen) fetchGraph(); }, [isOpen, fetchGraph]);

  const searchNodes = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const data = await apiFetch(`/api/wiki/search?q=${encodeURIComponent(q)}`);
      setSearchResults(Array.isArray(data) ? data : []);
    } catch { setSearchResults([]); }
  }, []);

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildProgress("Extracting concepts...");
    setRebuildError(null);
    setStats(null);
    try {
      const pi = setInterval(async () => {
        try {
          const p = await apiFetch(`/api/wiki/rebuild/progress`);
          if (p.phase === "extracting") setRebuildProgress(`Extracting concepts (${p.processed}/${p.total})...`);
          else if (p.phase === "relationships") setRebuildProgress("Finding relationships...");
          else if (p.phase === "saving") setRebuildProgress("Saving graph...");
          if (p.error) setRebuildError(p.error);
        } catch { }
      }, 600);
      const data = await apiFetch(`/api/wiki/rebuild`, { method: "POST" });
      clearInterval(pi);
      if (data.error) setRebuildError(data.error);
      if (data.stats) setStats(data.stats);
    } catch { setRebuildError("Rebuild request failed."); }
    finally { setRebuilding(false); setRebuildProgress(""); await fetchGraph(); }
  };

  useEffect(() => {
    if (!selectedNode) { setConnected([]); return; }
    const conns: Array<{ node: WikiNode; edge: WikiEdge }> = [];
    for (const e of edges) {
      if (e.sourceId === selectedNode.id) { const o = nodes.find(n => n.id === e.targetId); if (o) conns.push({ node: o, edge: e }); }
      else if (e.targetId === selectedNode.id) { const o = nodes.find(n => n.id === e.sourceId); if (o) conns.push({ node: o, edge: e }); }
    }
    setConnected(conns);
  }, [selectedNode, nodes, edges]);

  const selectNode = useCallback((node: WikiNode | null) => {
    setSelectedNode(node);
  }, []);

  useLayoutEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svgEl = svgRef.current;
    const parent = svgEl.parentElement;
    if (!parent) return;

    const W = Math.max(parent.clientWidth, parent.getBoundingClientRect().width, 800);
    const H = Math.max(parent.clientHeight, parent.getBoundingClientRect().height, 600);

    svgEl.setAttribute("width", String(Math.floor(W)));
    svgEl.setAttribute("height", String(Math.floor(H)));
    svgEl.setAttribute("viewBox", `0 0 ${Math.floor(W)} ${Math.floor(H)}`);

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const nodeCopy = nodes.map(n => ({ ...n }));
    const nodeMap = new Map(nodeCopy.map(n => [n.id, n]));
    const linkData = edges
      .filter(e => nodeMap.has(e.sourceId) && nodeMap.has(e.targetId))
      .map(e => ({ source: e.sourceId, target: e.targetId, relationship: e.relationship, weight: e.weight, id: e.id }));

    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "glow");
    const blur = glow.append("feGaussianBlur");
    blur.attr("stdDeviation", "3").attr("result", "blur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => { g.attr("transform", event.transform); });
    svg.call(zoom);

    const simulation = d3.forceSimulation(nodeCopy as any)
      .force("link", d3.forceLink(linkData).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide().radius(50))
      .alphaDecay(0.02);

    const link = g.append("g")
      .selectAll("line").data(linkData).join("line")
      .attr("stroke", "#3a3936")
      .attr("stroke-width", (d: any) => Math.max(0.5, Math.sqrt(d.weight || 1)))
      .attr("stroke-opacity", 0.5);

    const nodeG = g.append("g")
      .selectAll("g").data(nodeCopy).join("g")
      .style("cursor", "pointer")
      .on("click", (_event: any, d: any) => {
        const orig = nodes.find(n => n.id === d.id);
        if (orig) selectNode(orig);
      })
      .call(d3.drag<any, any>()
        .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    nodeG.append("circle")
      .attr("r", (d: any) => d.type === "source" ? 7 : 12)
      .attr("fill", (d: any) => COLORS[d.type as string] || "#cc785c")
      .attr("filter", "url(#glow)")
      .attr("stroke", "#1f1e1b")
      .attr("stroke-width", 1.5);

    nodeG.append("text")
      .attr("dy", "2.5em").attr("text-anchor", "middle")
      .attr("fill", "#c4c2bc").attr("font-size", "9px")
      .attr("font-family", "Inter, sans-serif").attr("font-weight", "500")
      .attr("pointer-events", "none")
      .text((d: any) => (d.label as string).length > 18 ? (d.label as string).slice(0, 16) + ".." : d.label);

    link.lower();

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      nodeG.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    simRef.current = simulation;
    initRef.current = true;

    simulation.alpha(1).restart();

    return () => {
      simulation.stop();
      initRef.current = false;
    };
  }, [nodes, edges]);

  const visibleNodes = nodes.filter(n => activeFilters.has(n.type));
  const showGraph = !loading && nodes.length > 0 && visibleNodes.length > 0;

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "92vw", height: "88vh", maxWidth: "1360px",
        background: PANEL, borderRadius: "12px",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Network size={18} color="#cc785c" />
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 500, color: "#faf9f5", margin: 0, fontFamily: "Inter, sans-serif" }}>
                Knowledge Graph
              </h2>
              <p style={{ fontSize: "11px", color: TXT_SEC, margin: "1px 0 0 0", fontFamily: "Inter, sans-serif" }}>
                {nodes.length > 0
                  ? `${nodes.length} concepts · ${edges.length} relationships${stats ? ` · ${stats.concepts} extracted` : ""}`
                  : "Automatically extracted from your conversations"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {rebuilding && visibleNodes.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: TXT_SEC, fontFamily: "Inter, sans-serif" }}>
                <LoaderCircle size={13} className="animate-spin" />
                <span>{rebuildProgress || "Updating..."}</span>
              </div>
            )}
            <button onClick={handleRebuild} disabled={rebuilding} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 14px", borderRadius: "6px",
              background: "transparent", color: TXT_MUTED, border: `1px solid ${BORDER}`,
              cursor: "pointer", fontSize: "12px", fontFamily: "Inter, sans-serif",
            }}><RefreshCw size={13} /> Rebuild</button>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: TXT_MUTED, padding: "4px", borderRadius: "4px", display: "flex",
            }}><X size={17} /></button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div style={{
            width: "240px", borderRight: `1px solid ${BORDER}`,
            display: "flex", flexDirection: "column", background: PANEL,
          }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: TXT_MUTED }} />
                <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); searchNodes(e.target.value); }}
                  placeholder="Search concepts..."
                  style={{
                    width: "100%", padding: "7px 9px 7px 28px", borderRadius: "6px",
                    border: `1px solid ${BORDER}`, background: DARK, color: "#faf9f5",
                    fontSize: "12px", outline: "none", fontFamily: "Inter, sans-serif",
                  }} />
              </div>
            </div>

            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: "10px", color: TXT_SEC, marginBottom: "8px", fontWeight: 500, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Filters
              </div>
              {allTypes.map(t => (
                <label key={t} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  cursor: "pointer", fontSize: "12px", color: "#c4c2bc",
                  fontFamily: "Inter, sans-serif",
                }}>
                  <input type="checkbox" checked={activeFilters.has(t)}
                    onChange={() => {
                      const next = new Set(activeFilters);
                      next.has(t) ? next.delete(t) : next.add(t);
                      setActiveFilters(next);
                    }}
                    style={{ accentColor: getNodeColor(t) }}
                  />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: getNodeColor(t), display: "inline-block", flexShrink: 0 }} />
                  {getTypeLabel(t)}
                  <span style={{ marginLeft: "auto", color: TXT_MUTED, fontSize: "11px" }}>
                    {nodes.filter(n => n.type === t).length}
                  </span>
                </label>
              ))}
            </div>

            {searchResults.length > 0 && (
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                <div style={{ fontSize: "10px", color: TXT_SEC, padding: "4px 14px 6px", fontWeight: 500, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Search Results
                </div>
                {searchResults.map(n => (
                  <div key={n.id} onClick={() => { selectNode(n); setSearchResults([]); setSearchQuery(""); }}
                    style={{ padding: "6px 14px", cursor: "pointer", fontSize: "12px", color: "#c4c2bc", fontFamily: "Inter, sans-serif" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a1a18")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ color: getNodeColor(n.type), fontWeight: 500 }}>{n.label}</span>
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && !selectedNode && (
              <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
                <div style={{ fontSize: "10px", color: TXT_SEC, marginBottom: "8px", fontWeight: 500, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  All Concepts
                </div>
                <div style={{ fontSize: "11px", color: TXT_MUTED, fontFamily: "Inter, sans-serif" }}>
                  Click a node on the graph to see details.
                </div>
              </div>
            )}

            {!searchResults.length && selectedNode && (
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: getNodeColor(selectedNode.type), display: "inline-block", flexShrink: 0 }} />
                      <strong style={{ fontSize: "13px", color: "#faf9f5", fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
                        {selectedNode.label}
                      </strong>
                    </div>
                    <div style={{ fontSize: "10px", color: TXT_SEC, marginTop: "3px", textTransform: "capitalize", fontFamily: "Inter, sans-serif" }}>
                      {selectedNode.type}
                    </div>
                  </div>
                  <button onClick={() => selectNode(null)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: TXT_MUTED, padding: "2px", display: "flex", flexShrink: 0,
                  }}><X size={13} /></button>
                </div>
                {selectedNode.description && (
                  <p style={{ fontSize: "11px", color: "#9c9a94", marginTop: "10px", lineHeight: "1.5", fontFamily: "Inter, sans-serif" }}>
                    {selectedNode.description}
                  </p>
                )}
                <div style={{ fontSize: "10px", color: TXT_SEC, marginTop: "14px", marginBottom: "6px", fontWeight: 500, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Connections ({connected.length})
                </div>
                {connected.map(c => (
                  <div key={c.edge.id} onClick={() => selectNode(c.node)}
                    style={{ padding: "5px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", color: "#c4c2bc", fontFamily: "Inter, sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#1a1a18"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: getNodeColor(c.node.type) }}>{c.node.label}</span>
                    <span style={{ color: TXT_MUTED, marginLeft: "6px", fontSize: "10px" }}>— {c.edge.relationship}</span>
                  </div>
                ))}
                {connected.length === 0 && <div style={{ fontSize: "11px", color: TXT_MUTED, fontFamily: "Inter, sans-serif" }}>No direct connections</div>}
              </div>
            )}
          </div>

          <div ref={containerRef} style={{ flex: 1, position: "relative", background: DARK }}>
            {loading && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,15,14,0.8)" }}>
                <LoaderCircle size={26} className="animate-spin" style={{ color: "#cc785c" }} />
              </div>
            )}
            <svg ref={svgRef} style={{
              width: "100%", height: "100%", display: "block",
              visibility: showGraph ? "visible" : "hidden",
            }} />
            {!loading && visibleNodes.length === 0 && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                color: TXT_SEC, fontSize: "13px", padding: "40px", textAlign: "center",
                fontFamily: "Inter, sans-serif", gap: "16px",
              }}>
                <Network size={48} color={TXT_MUTED} strokeWidth={1.5} />
                <div>
                  <p style={{ fontSize: "14px", color: "#c4c2bc", fontWeight: 500, margin: 0 }}>
                    {nodes.length === 0 ? "No concepts yet" : "No visible nodes"}
                  </p>
                  <p style={{ fontSize: "12px", color: TXT_MUTED, margin: "4px 0 0 0", maxWidth: "300px" }}>
                    {nodes.length === 0 ? "Concepts are extracted from your conversations automatically." : "All nodes are hidden by the current filters."}
                  </p>
                </div>
                {nodes.length === 0 && (rebuilding ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <LoaderCircle size={18} className="animate-spin" style={{ color: "#cc785c" }} />
                    <span style={{ fontSize: "12px", color: TXT_SEC, fontFamily: "Inter, sans-serif" }}>{rebuildProgress || "Building..."}</span>
                  </div>
                ) : (
                  <button onClick={handleRebuild} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "10px 20px", borderRadius: "8px",
                    background: "#cc785c", color: "#fff", border: "none",
                    cursor: "pointer", fontSize: "13px", fontWeight: 500,
                    fontFamily: "Inter, sans-serif",
                  }}><RefreshCw size={15} /> Build from chat history</button>
                ))}
                {rebuildError && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#e55", fontFamily: "Inter, sans-serif", maxWidth: "350px", textAlign: "left" }}>
                    <AlertCircle size={12} style={{ flexShrink: 0 }} /><span>{rebuildError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}