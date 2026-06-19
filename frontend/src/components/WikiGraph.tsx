import { useEffect, useRef, useState, useCallback } from "react";
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

const BASE_COLORS: Record<string, string> = {
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
const FALLBACK_COLORS = ["#c97bdb", "#d4886c", "#5ca8cc", "#c4c45c", "#cc5c7b", "#5cccc0"];
const colorCache: Record<string, string> = { ...BASE_COLORS };

function getNodeColor(type: string): string {
  if (colorCache[type]) return colorCache[type] as string;
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  const color = FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length] as string;
  colorCache[type] = color;
  return color;
}

function getTypeLabel(type: string): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type] as string;
  return type.charAt(0).toUpperCase() + type.slice(1) + "s";
}

const DARK = "#0f0f0e";
const PANEL = "#141413";
const BORDER = "#1f1e1b";
const TXT_SEC = "#6c6a64";
const TXT_MUTED = "#8e8b82";

export function WikiGraph({ isOpen, onClose }: WikiGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof d3.forceSimulation> | null>(null);
  const renderKeyRef = useRef(0);

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
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(BASE_COLORS)));
  const [connected, setConnected] = useState<Array<{ node: WikiNode; edge: WikiEdge }>>([]);

  const allTypes = Array.from(new Set(nodes.map(n => n.type)));

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/wiki`);
      if (data.nodes && Array.isArray(data.nodes)) {
        const loadedNodes: WikiNode[] = data.nodes;
        const loadedEdges: WikiEdge[] = data.edges || [];
        const types = new Set<string>(loadedNodes.map(n => n.type));
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setActiveFilters(types);
      }
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
          if (p.phase === "extracting") setRebuildProgress(`Extracting (${p.processed}/${p.total})…`);
          else if (p.phase === "relationships") setRebuildProgress("Finding relationships…");
          else if (p.phase === "saving") setRebuildProgress("Saving graph…");
          if (p.error) setRebuildError(p.error);
        } catch { }
      }, 700);
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

  const selectNode = useCallback((node: WikiNode | null) => setSelectedNode(node), []);

  // ── D3 graph rendering ────────────────────────────────────────────────────
  // Use a callback ref approach: render after a brief delay so the container
  // has had time to paint its dimensions via the browser layout engine.
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container) return;

    const filteredNodes = nodes.filter(n => activeFilters.has(n.type));
    if (filteredNodes.length === 0) {
      d3.select(svgEl).selectAll("*").remove();
      return;
    }

    // Get real dimensions from the container element (after paint)
    const rect = container.getBoundingClientRect();
    const W = rect.width > 0 ? rect.width : container.offsetWidth || 800;
    const H = rect.height > 0 ? rect.height : container.offsetHeight || 600;

    // Stop any running simulation
    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    // Set SVG to match container exactly — no viewBox that can cause coord mismatch
    svgEl.setAttribute("width", String(W));
    svgEl.setAttribute("height", String(H));

    // ── Defs ──────────────────────────────────────────────────────
    const defs = svg.append("defs");

    // Glow filter
    const glowFilter = defs.append("filter")
      .attr("id", "node-glow")
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    const glowMerge = glowFilter.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "blur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Subtle dot grid
    const dotPattern = defs.append("pattern")
      .attr("id", "dot-grid").attr("width", 28).attr("height", 28)
      .attr("patternUnits", "userSpaceOnUse");
    dotPattern.append("circle")
      .attr("cx", 1).attr("cy", 1).attr("r", 0.8)
      .attr("fill", "#222120");

    // Background
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", DARK);
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "url(#dot-grid)");

    const g = svg.append("g");

    // ── Zoom ──────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 6])
      .on("zoom", (event) => { g.attr("transform", event.transform); });
    svg.call(zoom);
    // No initial transform — nodes start centered via forceCenter

    // ── Prepare data ──────────────────────────────────────────────
    const nodeCopy = filteredNodes.map(n => ({ ...n, x: W / 2 + (Math.random() - 0.5) * 100, y: H / 2 + (Math.random() - 0.5) * 100 }));
    const nodeMap = new Map(nodeCopy.map(n => [n.id, n]));
    const linkData = edges
      .filter(e => nodeMap.has(e.sourceId) && nodeMap.has(e.targetId))
      .map(e => ({
        ...e,
        source: e.sourceId,
        target: e.targetId,
      }));

    // ── Links ──────────────────────────────────────────────────────
    const linkG = g.append("g").attr("class", "links");
    const link = linkG.selectAll<SVGLineElement, typeof linkData[0]>("line")
      .data(linkData).join("line")
      .attr("stroke", "#4a4843")
      .attr("stroke-width", d => Math.max(1.5, Math.sqrt((d as any).weight || 1) * 2.4))
      .attr("stroke-opacity", 0.85);

    // ── Nodes ──────────────────────────────────────────────────────
    const nodeG = g.append("g").attr("class", "nodes")
      .selectAll<SVGGElement, typeof nodeCopy[0]>("g")
      .data(nodeCopy).join("g")
      .style("cursor", "pointer")
      .on("click", (_event, d) => {
        const orig = nodes.find(n => n.id === d.id);
        if (orig) selectNode(orig);
      });

    // Drag
    nodeG.call(
      d3.drag<SVGGElement, typeof nodeCopy[0]>()
        .on("start", (e, d: any) => {
          if (!e.active && simRef.current) simRef.current.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (e, d: any) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d: any) => {
          if (!e.active && simRef.current) simRef.current.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

    // Outer pulse ring
    nodeG.append("circle")
      .attr("class", "ring")
      .attr("r", d => d.type === "source" ? 12 : 18)
      .attr("fill", "transparent")
      .attr("stroke", d => getNodeColor(d.type))
      .attr("stroke-width", 0)
      .attr("stroke-opacity", 0.3);

    // Main filled circle
    nodeG.append("circle")
      .attr("class", "dot")
      .attr("r", d => d.type === "source" ? 7 : 11)
      .attr("fill", d => getNodeColor(d.type))
      .attr("filter", "url(#node-glow)")
      .attr("stroke", "#0a0a09")
      .attr("stroke-width", 2);

    // Label
    nodeG.append("text")
      .attr("dy", "3em")
      .attr("text-anchor", "middle")
      .attr("fill", "#b4b2ac")
      .attr("font-size", "9px")
      .attr("font-family", "Inter, sans-serif")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .text(d => d.label.length > 20 ? d.label.slice(0, 18) + "…" : d.label);

    // Hover effects
    nodeG
      .on("mouseenter", function (_e, d) {
        d3.select(this).select<SVGCircleElement>(".ring")
          .attr("stroke-width", 6)
          .attr("r", d.type === "source" ? 14 : 22);
        d3.select(this).select<SVGCircleElement>(".dot")
          .attr("r", d.type === "source" ? 9 : 14);
      })
      .on("mouseleave", function (_e, d) {
        d3.select(this).select<SVGCircleElement>(".ring")
          .attr("stroke-width", 0)
          .attr("r", d.type === "source" ? 12 : 18);
        d3.select(this).select<SVGCircleElement>(".dot")
          .attr("r", d.type === "source" ? 7 : 11);
      });

    // ── Force simulation ───────────────────────────────────────────
    const simulation = d3.forceSimulation(nodeCopy as any)
      .force("link", d3.forceLink(linkData as any)
        .id((d: any) => d.id)
        .distance(110)
        .strength(0.5))
      .force("charge", d3.forceManyBody().strength(-300).distanceMax(400))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.08))
      .force("collision", d3.forceCollide().radius(50))
      .alphaDecay(0.02);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x ?? 0)
        .attr("y1", (d: any) => d.source.y ?? 0)
        .attr("x2", (d: any) => d.target.x ?? 0)
        .attr("y2", (d: any) => d.target.y ?? 0);
      nodeG.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    simRef.current = simulation;
    simulation.alpha(1).restart();
  }, [nodes, edges, activeFilters, selectNode]);

  // Trigger re-render when data/filters change, with a short delay so the
  // container's flex layout has been painted and clientWidth/Height are accurate.
  useEffect(() => {
    if (!isOpen || nodes.length === 0) return;
    const key = ++renderKeyRef.current;
    const t = setTimeout(() => {
      if (renderKeyRef.current === key) renderGraph();
    }, 80);
    return () => clearTimeout(t);
  }, [isOpen, renderGraph]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen && simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }
  }, [isOpen]);

  const visibleNodeCount = nodes.filter(n => activeFilters.has(n.type)).length;

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "92vw", height: "88vh", maxWidth: "1360px",
        background: PANEL, borderRadius: "14px",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px #222",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: `1px solid ${BORDER}`,
          background: "linear-gradient(180deg, #181714 0%, #141413 100%)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Network size={18} color="#cc785c" />
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#faf9f5", margin: 0, fontFamily: "Inter, sans-serif" }}>
                Knowledge Graph
              </h2>
              <p style={{ fontSize: "11px", color: TXT_SEC, margin: "1px 0 0 0", fontFamily: "Inter, sans-serif" }}>
                {nodes.length > 0
                  ? `${nodes.length} concepts · ${edges.length} relationships${stats ? ` · rebuilt ${stats.concepts} nodes` : ""}`
                  : "Automatically extracted from your conversations"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {rebuilding && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: TXT_SEC, fontFamily: "Inter, sans-serif" }}>
                <LoaderCircle size={13} className="animate-spin" />
                <span>{rebuildProgress || "Updating…"}</span>
              </div>
            )}
            <button onClick={handleRebuild} disabled={rebuilding} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 14px", borderRadius: "6px",
              background: "transparent", color: TXT_MUTED, border: `1px solid ${BORDER}`,
              cursor: rebuilding ? "not-allowed" : "pointer", fontSize: "12px",
              fontFamily: "Inter, sans-serif", opacity: rebuilding ? 0.5 : 1,
            }}><RefreshCw size={13} /> Rebuild</button>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: TXT_MUTED, padding: "4px", borderRadius: "4px", display: "flex",
            }}><X size={17} /></button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{
            width: "220px", borderRight: `1px solid ${BORDER}`,
            display: "flex", flexDirection: "column", background: "#111110",
            flexShrink: 0, overflowY: "auto",
          }}>
            {/* Search */}
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: TXT_MUTED }} />
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); searchNodes(e.target.value); }}
                  placeholder="Search concepts…"
                  style={{
                    width: "100%", padding: "7px 9px 7px 28px", borderRadius: "6px",
                    border: `1px solid ${BORDER}`, background: DARK, color: "#faf9f5",
                    fontSize: "12px", outline: "none", fontFamily: "Inter, sans-serif",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Filters */}
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "10px", color: TXT_SEC, marginBottom: "8px", fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Filters
              </div>
              {allTypes.length === 0 ? (
                <div style={{ fontSize: "11px", color: TXT_MUTED, fontFamily: "Inter, sans-serif" }}>No data yet</div>
              ) : allTypes.map(t => (
                <label key={t} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  cursor: "pointer", fontSize: "12px", color: "#c4c2bc",
                  fontFamily: "Inter, sans-serif", padding: "3px 0",
                }}>
                  <input
                    type="checkbox"
                    checked={activeFilters.has(t)}
                    onChange={() => {
                      setActiveFilters(prev => {
                        const next = new Set(prev);
                        next.has(t) ? next.delete(t) : next.add(t);
                        return next;
                      });
                    }}
                    style={{ accentColor: getNodeColor(t), width: 13, height: 13 }}
                  />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: getNodeColor(t), display: "inline-block", flexShrink: 0 }} />
                  {getTypeLabel(t)}
                  <span style={{ marginLeft: "auto", color: TXT_MUTED, fontSize: "11px" }}>
                    {nodes.filter(n => n.type === t).length}
                  </span>
                </label>
              ))}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                <div style={{ fontSize: "10px", color: TXT_SEC, padding: "4px 14px 6px", fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Results
                </div>
                {searchResults.map(n => (
                  <div key={n.id} onClick={() => { selectNode(n); setSearchResults([]); setSearchQuery(""); }}
                    style={{ padding: "6px 14px", cursor: "pointer", fontSize: "12px", color: "#c4c2bc", fontFamily: "Inter, sans-serif" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a1a18")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span style={{ color: getNodeColor(n.type), fontWeight: 500 }}>{n.label}</span>
                    <span style={{ color: TXT_MUTED, fontSize: "10px", display: "block" }}>{n.type}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Selected node detail */}
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
                  <p style={{ fontSize: "11px", color: "#9c9a94", marginTop: "10px", lineHeight: "1.6", fontFamily: "Inter, sans-serif" }}>
                    {selectedNode.description}
                  </p>
                )}
                <div style={{ fontSize: "10px", color: TXT_SEC, marginTop: "14px", marginBottom: "6px", fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Connections ({connected.length})
                </div>
                {connected.map(c => (
                  <div key={c.edge.id} onClick={() => selectNode(c.node)}
                    style={{ padding: "5px 8px", borderRadius: "5px", cursor: "pointer", fontSize: "11px", color: "#c4c2bc", fontFamily: "Inter, sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#1a1a18"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: getNodeColor(c.node.type) }}>{c.node.label}</span>
                    <span style={{ color: TXT_MUTED, marginLeft: "6px", fontSize: "10px" }}>— {c.edge.relationship}</span>
                  </div>
                ))}
                {connected.length === 0 && (
                  <div style={{ fontSize: "11px", color: TXT_MUTED, fontFamily: "Inter, sans-serif" }}>No direct connections</div>
                )}
              </div>
            )}

            {/* Default hint */}
            {!searchResults.length && !selectedNode && nodes.length > 0 && (
              <div style={{ padding: "14px" }}>
                <div style={{ fontSize: "11px", color: TXT_MUTED, fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>
                  Click any node to explore connections.<br />Drag to rearrange. Scroll to zoom.
                </div>
              </div>
            )}
          </div>

          {/* Graph canvas */}
          <div
            ref={containerRef}
            style={{ flex: 1, position: "relative", background: DARK, overflow: "hidden", minWidth: 0 }}
          >
            {/* Loading overlay */}
            {loading && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", background: "rgba(15,15,14,0.9)", zIndex: 2,
              }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                  <LoaderCircle size={28} className="animate-spin" style={{ color: "#cc785c" }} />
                  <span style={{ fontSize: "12px", color: TXT_SEC, fontFamily: "Inter, sans-serif" }}>Loading graph…</span>
                </div>
              </div>
            )}

            {/* SVG — fills container via position absolute */}
            <svg
              ref={svgRef}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                display: "block",
              }}
            />

            {/* Empty state */}
            {!loading && visibleNodeCount === 0 && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 1,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                color: TXT_SEC, padding: "40px", textAlign: "center",
                fontFamily: "Inter, sans-serif", gap: "16px",
              }}>
                <Network size={48} color={TXT_MUTED} strokeWidth={1.5} />
                <div>
                  <p style={{ fontSize: "14px", color: "#c4c2bc", fontWeight: 500, margin: 0 }}>
                    {nodes.length === 0 ? "No concepts yet" : "All nodes hidden by filters"}
                  </p>
                  <p style={{ fontSize: "12px", color: TXT_MUTED, margin: "4px 0 0 0", maxWidth: "320px" }}>
                    {nodes.length === 0
                      ? "Click \"Rebuild\" to extract concepts from your conversation history."
                      : "Enable some filters in the sidebar to show nodes."}
                  </p>
                </div>
                {nodes.length === 0 && (rebuilding ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <LoaderCircle size={20} className="animate-spin" style={{ color: "#cc785c" }} />
                    <span style={{ fontSize: "12px", color: TXT_SEC }}>{rebuildProgress || "Building…"}</span>
                  </div>
                ) : (
                  <button onClick={handleRebuild} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "10px 22px", borderRadius: "8px",
                    background: "#cc785c", color: "#fff", border: "none",
                    cursor: "pointer", fontSize: "13px", fontWeight: 500,
                    fontFamily: "Inter, sans-serif",
                  }}><RefreshCw size={15} /> Build from chat history</button>
                ))}
                {rebuildError && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#e55", maxWidth: "350px" }}>
                    <AlertCircle size={12} style={{ flexShrink: 0 }} /><span>{rebuildError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            {!loading && visibleNodeCount > 0 && allTypes.filter(t => activeFilters.has(t)).length > 0 && (
              <div style={{
                position: "absolute", bottom: 16, right: 16, zIndex: 1,
                background: "rgba(18,17,16,0.92)", borderRadius: "8px",
                border: `1px solid ${BORDER}`, padding: "8px 12px",
                display: "flex", flexDirection: "column", gap: "5px",
                backdropFilter: "blur(6px)",
              }}>
                {allTypes.filter(t => activeFilters.has(t)).map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "11px", color: "#c4c2bc", fontFamily: "Inter, sans-serif" }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: getNodeColor(t), flexShrink: 0,
                      boxShadow: `0 0 6px ${getNodeColor(t)}88`,
                    }} />
                    {getTypeLabel(t)}
                    <span style={{ color: TXT_MUTED, marginLeft: "auto", paddingLeft: 8 }}>
                      {nodes.filter(n => n.type === t).length}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}