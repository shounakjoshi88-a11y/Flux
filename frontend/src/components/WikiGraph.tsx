import { useEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { X, Search, LoaderCircle, RefreshCw, AlertCircle, Network } from "lucide-react";
import { BACKEND_URL } from "../lib/config";
import { createClient } from "../lib/client";
import { useIsMobile } from "../hooks/useMediaQuery";
import { MobileWikiList } from "./MobileWikiList";

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

export interface WikiNode {
  id: string;
  label: string;
  description?: string;
  type: string;
  sourceUrl?: string;
}

export interface WikiEdge {
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

// ── Sphere layout ────────────────────────────────────────────────────────
const SPHERE_R = 300;

// ── 3D force simulation helpers ──────────────────────────────────────────

type Vec3 = { x: number; y: number; z: number };
type CentroidMap = Map<string, Vec3>;

interface Sim3DNode {
  id: string;
  type: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fx: number | null; fy: number | null; fz: number | null;
}

/**
 * Distribute N cluster centroids evenly on the sphere surface
 * using a Fibonacci/golden-angle lattice — gives the most even spacing
 * for any number of types without special-casing.
 */
function getClusterCentroids(types: string[]): CentroidMap {
  const map: CentroidMap = new Map();
  const n = types.length;
  if (n === 0) return map;
  if (n === 1) {
    map.set(types[0]!, { x: 0, y: SPHERE_R, z: 0 });
    return map;
  }
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;            // evenly spans -1 → 1
    const r = Math.sqrt(Math.max(0, 1 - y * y));  // radius at this latitude
    const theta = goldenAngle * i;
    map.set(types[i]!, {
      x: Math.cos(theta) * r * SPHERE_R,
      y: y * SPHERE_R,
      z: Math.sin(theta) * r * SPHERE_R,
    });
  }
  return map;
}

/**
 * Place every node on the sphere surface inside its type's cluster region.
 * Each node starts near its cluster centroid with random angular jitter,
 * then gets projected back onto the sphere.
 */
function initSimNodes(nodes: WikiNode[], centroids: CentroidMap): Sim3DNode[] {
  return nodes.map(n => {
    const c = centroids.get(n.type) ?? { x: 0, y: SPHERE_R, z: 0 };
    // Jitter ±40% of sphere radius around the cluster centroid direction
    const spread = SPHERE_R * 0.42;
    const px = c.x + (Math.random() - 0.5) * spread;
    const py = c.y + (Math.random() - 0.5) * spread;
    const pz = c.z + (Math.random() - 0.5) * spread;
    // Project onto the sphere surface
    const dist = Math.sqrt(px * px + py * py + pz * pz) || 1;
    const s = SPHERE_R / dist;
    return {
      id: n.id,
      type: n.type,
      x: px * s, y: py * s, z: pz * s,
      vx: 0, vy: 0, vz: 0,
      fx: null, fy: null, fz: null,
    };
  });
}

/**
 * Single simulation step. Forces applied (all in 3D):
 *  1. Cluster pull — each node attracted toward its type centroid on the sphere
 *  2. Node repulsion — nearby nodes push apart (spreads nodes within clusters)
 *  3. Link attraction — connected nodes pulled together
 *
 * After integration, every free node's velocity is projected onto the sphere's
 * tangent plane, then the position is snapped back onto the sphere surface.
 * This keeps the graph living on the sphere shell throughout the simulation.
 */
function stepSimulation(
  simNodes: Sim3DNode[],
  edges: WikiEdge[],
  centroids: CentroidMap,
  dt: number,
): void {
  const CLUSTER_STRENGTH   = 0.007;
  const REPULSION          = 9000;
  const REPULSION_MAX_DIST = SPHERE_R * 1.1; // only repel nodes within reach
  const MIN_REPULSION_DIST = 18;
  const LINK_STRENGTH      = 0.035;
  const LINK_DIST          = 75;             // target chord distance for links
  const DAMPING            = 0.86;

  const map = new Map<string, Sim3DNode>();
  for (const n of simNodes) map.set(n.id, n);

  // ── Cluster pull ────────────────────────────────────────────────────────
  for (const n of simNodes) {
    if (n.fx != null) continue;
    const c = centroids.get(n.type);
    if (!c) continue;
    n.vx += (c.x - n.x) * CLUSTER_STRENGTH;
    n.vy += (c.y - n.y) * CLUSTER_STRENGTH;
    n.vz += (c.z - n.z) * CLUSTER_STRENGTH;
  }

  // ── Node repulsion (inverse-square on the sphere surface) ───────────────
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const a = simNodes[i]!;
      const b = simNodes[j]!;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > REPULSION_MAX_DIST) continue;
      if (dist < MIN_REPULSION_DIST) dist = MIN_REPULSION_DIST;
      const f = -REPULSION / (dist * dist * dist);
      a.vx += dx * f; a.vy += dy * f; a.vz += dz * f;
      b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
  }

  // ── Link attraction ─────────────────────────────────────────────────────
  for (const e of edges) {
    const s = map.get(e.sourceId);
    const t = map.get(e.targetId);
    if (!s || !t) continue;
    const dx = t.x - s.x, dy = t.y - s.y, dz = t.z - s.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const f = (dist - LINK_DIST) * LINK_STRENGTH;
    const m = f / dist;
    s.vx += dx * m; s.vy += dy * m; s.vz += dz * m;
    t.vx -= dx * m; t.vy -= dy * m; t.vz -= dz * m;
  }

  // ── Integrate + sphere projection ───────────────────────────────────────
  for (const n of simNodes) {
    const isFixed = n.fx != null || n.fy != null || n.fz != null;
    if (isFixed) {
      if (n.fx != null) { n.x = n.fx; n.vx = 0; }
      if (n.fy != null) { n.y = n.fy; n.vy = 0; }
      if (n.fz != null) { n.z = n.fz; n.vz = 0; }
      continue;
    }

    // Project velocity onto the sphere's tangent plane at this node —
    // removes any component pointing toward/away from the sphere center.
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
    const nx = n.x / len, ny = n.y / len, nz = n.z / len;
    const dot = n.vx * nx + n.vy * ny + n.vz * nz;
    n.vx -= dot * nx;
    n.vy -= dot * ny;
    n.vz -= dot * nz;

    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.vz *= DAMPING;

    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.z += n.vz * dt;

    // Snap position back onto the sphere surface
    const d = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
    const scale = SPHERE_R / d;
    n.x *= scale;
    n.y *= scale;
    n.z *= scale;
  }
}

// ── Three.js scene components ────────────────────────────────────────────

interface SceneData {
  simNodes: Sim3DNode[];
  edges: WikiEdge[];
  nodeData: WikiNode[];
  selectedId: string | null;
  hoveredId: string | null;
  onNodeClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
  activeTypes: Set<string>;
  clusterCentroids: CentroidMap;
  degreeMap: Map<string, number>;
  isLight: boolean;
}

const SceneContext = createContext<SceneData | null>(null);

// ── Ghost sphere frame ───────────────────────────────────────────────────
function SphereFrame() {
  const ctx = useContext(SceneContext)!;
  const isLight = ctx.isLight;

  return (
    <group>
      <mesh>
        <sphereGeometry args={[SPHERE_R, 40, 22]} />
        <meshBasicMaterial
          color={isLight ? "#c8c4bc" : "#252118"}
          wireframe
          transparent
          opacity={isLight ? 0.3 : 0.16}
          depthWrite={false}
        />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[SPHERE_R, 0.7, 6, 90]} />
        <meshBasicMaterial color={isLight ? "#a09c94" : "#3a3530"} transparent opacity={isLight ? 0.5 : 0.45} depthWrite={false} />
      </mesh>

      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[SPHERE_R, 0.7, 6, 90]} />
        <meshBasicMaterial color={isLight ? "#a09c94" : "#3a3530"} transparent opacity={isLight ? 0.35 : 0.3} depthWrite={false} />
      </mesh>

      <mesh rotation={[Math.PI / 5, 0, Math.PI / 3]}>
        <torusGeometry args={[SPHERE_R, 0.7, 6, 90]} />
        <meshBasicMaterial color={isLight ? "#a09c94" : "#3a3530"} transparent opacity={isLight ? 0.25 : 0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Cluster halos ────────────────────────────────────────────────────────
// Soft glowing spheres at each cluster centroid — visually anchor each
// type region on the globe surface.
function ClusterHalos() {
  const ctx = useContext(SceneContext)!;
  const activeTypes = Array.from(ctx.clusterCentroids.keys()).filter(t => ctx.activeTypes.has(t));

  return (
    <group>
      {activeTypes.map(type => {
        const c = ctx.clusterCentroids.get(type)!;
        const color = new THREE.Color(getNodeColor(type));
        return (
          <group key={type} position={[c.x, c.y, c.z]}>
            {/* Wide soft halo */}
            <mesh>
              <sphereGeometry args={[62, 20, 14]} />
              <meshBasicMaterial color={color} transparent opacity={0.045} depthWrite={false} />
            </mesh>
            {/* Bright inner core */}
            <mesh>
              <sphereGeometry args={[28, 14, 10]} />
              <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Graph edges ──────────────────────────────────────────────────────────
function GraphEdges({ edgeRefs }: { edgeRefs: React.MutableRefObject<Map<string, THREE.Line>> }) {
  const ctx = useContext(SceneContext)!;

  // Build line objects once per edges/simNodes change; mutate geometry each frame
  const lines = useMemo(() => {
    edgeRefs.current.clear();
    return ctx.edges.map(e => {
      const s = ctx.simNodes.find(n => n.id === e.sourceId);
      const t = ctx.simNodes.find(n => n.id === e.targetId);
      if (!s || !t) return null;
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array([s.x, s.y, s.z, t.x, t.y, t.z]);
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.computeBoundingSphere();
      const mat = new THREE.LineBasicMaterial({
        color: ctx.isLight ? "#b0aca4" : "#8a8478",
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      edgeRefs.current.set(e.id, line);
      return { id: e.id, line };
    }).filter(Boolean) as { id: string; line: THREE.Line }[];
  }, [ctx.edges, ctx.simNodes]);

  useFrame(() => {
    for (const e of ctx.edges) {
      const s = ctx.simNodes.find(n => n.id === e.sourceId);
      const t = ctx.simNodes.find(n => n.id === e.targetId);
      const line = edgeRefs.current.get(e.id);
      if (!s || !t || !line) continue;
      const pos = line.geometry.attributes.position;
      if (!pos) continue;
      pos.setXYZ(0, s.x, s.y, s.z);
      pos.setXYZ(1, t.x, t.y, t.z);
      pos.needsUpdate = true;
    }
  });

  return (
    <group>
      {lines.map(l => <primitive key={l.id} object={l.line} />)}
    </group>
  );
}

// ── Graph nodes ──────────────────────────────────────────────────────────
function GraphNodes({
  meshRefs,
}: {
  meshRefs: React.MutableRefObject<Map<string, THREE.Mesh>>;
}) {
  const ctx = useContext(SceneContext)!;

  // Track positions each frame — the simulation mutates simNodes in place
  useFrame(() => {
    for (const n of ctx.simNodes) {
      meshRefs.current.get(n.id)?.position.set(n.x, n.y, n.z);
    }
  });

  return (
    <group>
      {ctx.simNodes.map(sn => {
        const nd = ctx.nodeData.find(n => n.id === sn.id);
        if (!nd || !ctx.activeTypes.has(nd.type)) return null;

        const degree     = ctx.degreeMap.get(nd.id) ?? 0;
        const color      = new THREE.Color(getNodeColor(nd.type));
        const isSelected = ctx.selectedId === nd.id;
        const isHovered  = ctx.hoveredId  === nd.id;

        const baseRadius = 5 + Math.min(Math.sqrt(degree) * 1.6, 9);
        const radius     = baseRadius * (isSelected ? 1.75 : isHovered ? 1.35 : 1);
        const showLabel  = isSelected || isHovered || degree >= 4;

        return (
          <group key={nd.id}>
            {/* Main sphere node */}
            <mesh
              ref={(el: THREE.Mesh | null) => { if (el) meshRefs.current.set(nd.id, el); }}
              onClick={e => { e.stopPropagation(); ctx.onNodeClick(nd.id); }}
              onPointerOver={e => { e.stopPropagation(); ctx.onNodeHover(nd.id); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { ctx.onNodeHover(null); document.body.style.cursor = "default"; }}
            >
              <sphereGeometry args={[radius, 18, 14]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.2}
                metalness={0.15}
                roughness={0.55}
              />
            </mesh>

            {/* Label — only for prominent nodes */}
            {showLabel && (
              <Text
                position={[0, -(radius + 11), 0]}
                fontSize={isSelected || isHovered ? 8.5 : 6.5}
                color={ctx.isLight ? "#444240" : (isSelected ? "#faf9f5" : "#8e8b82")}
                anchorX="center"
                anchorY="top"
                font={undefined}
                outlineWidth={0.5}
                outlineColor={ctx.isLight ? "#f0eeea" : "#0f0f0e"}
              >
                {nd.label.length > 18 ? nd.label.slice(0, 16) + "…" : nd.label}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ── Scene root ───────────────────────────────────────────────────────────
function GraphScene({ sceneData }: { sceneData: SceneData }) {
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgeRefs = useRef<Map<string, THREE.Line>>(new Map());
  const { camera, scene } = useThree();
  const bgColor = sceneData.isLight ? "#e8e6e0" : "#0f0f0e";
  const fogColor = sceneData.isLight ? "#d8d6d0" : "#0f0f0e";

  useEffect(() => {
    scene.background = new THREE.Color(bgColor);
    camera.position.set(0, 120, 680);
    camera.lookAt(0, 0, 0);
  }, [camera, scene, bgColor]);

  useFrame((_, delta) => {
    const dt = Math.min(delta * 60, 3);
    stepSimulation(sceneData.simNodes, sceneData.edges, sceneData.clusterCentroids, dt);
  });

  return (
    <SceneContext.Provider value={sceneData}>
      {/* Lighting — warm key + cool fill + subtle green bounce */}
      <ambientLight intensity={sceneData.isLight ? 0.6 : 0.4} />
      <pointLight position={[450, 550, 450]} intensity={2.2} color="#ffddaa" />
      <pointLight position={[-400, -200, -350]} intensity={0.9} color="#4488ff" />
      <pointLight position={[0, -450, 150]} intensity={0.4} color="#88ffcc" />

      {/* Depth fog */}
      <fog attach="fog" args={[fogColor, 480, 1150]} />

      {/* Globe shell */}
      <SphereFrame />

      {/* Cluster region halos */}
      <ClusterHalos />

      {/* Edges first so nodes render on top */}
      <GraphEdges edgeRefs={edgeRefs} />

      {/* Nodes */}
      <GraphNodes meshRefs={meshRefs} />

      {/* Orbit controls */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        rotateSpeed={0.55}
        zoomSpeed={0.9}
        minDistance={90}
        maxDistance={1800}
        autoRotate
        autoRotateSpeed={0.45}
      />
    </SceneContext.Provider>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function WikiGraph({ isOpen, onClose }: WikiGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes]               = useState<WikiNode[]>([]);
  const [edges, setEdges]               = useState<WikiEdge[]>([]);
  const [loading, setLoading]           = useState(false);
  const [rebuilding, setRebuilding]     = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState("");
  const [rebuildError, setRebuildError] = useState<string | null>(null);
  const [stats, setStats]               = useState<{ concepts: number; relationships: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<WikiNode | null>(null);
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<WikiNode[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(BASE_COLORS)));
  const [connected, setConnected]       = useState<Array<{ node: WikiNode; edge: WikiEdge }>>([]);
  const [isLight, setIsLight] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
  );
  const isMobile = useIsMobile();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => setIsLight(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const bgPanel = "var(--bg-primary)";
  const bgSidebar = "var(--bg-secondary)";
  const bgDark = "var(--bg-secondary)";
  const borderColor = "var(--surface-border)";
  const txtSec = "var(--text-primary)";
  const txtMuted = "var(--text-primary)";
  const txtBody = "var(--text-primary)";
  const txtBright = "var(--text-primary)";
  const headerBg = "var(--bg-primary)";
  const headerBorder = "var(--surface-border)";
  const inputBg = "var(--bg-secondary)";
  const inputBorder = "var(--surface-border)";
  const inputText = "var(--text-primary)";
  const searchIcon = "var(--text-primary)";

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
          if (p.phase === "extracting")   setRebuildProgress(`Extracting (${p.processed}/${p.total})…`);
          else if (p.phase === "relationships") setRebuildProgress("Finding relationships…");
          else if (p.phase === "saving")  setRebuildProgress("Saving graph…");
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
      if (e.sourceId === selectedNode.id) {
        const o = nodes.find(n => n.id === e.targetId);
        if (o) conns.push({ node: o, edge: e });
      } else if (e.targetId === selectedNode.id) {
        const o = nodes.find(n => n.id === e.sourceId);
        if (o) conns.push({ node: o, edge: e });
      }
    }
    setConnected(conns);
  }, [selectedNode, nodes, edges]);

  const selectNode = useCallback((node: WikiNode | null) => setSelectedNode(node), []);

  // Cluster centroids + initial sphere positions — recomputed only when the
  // node count changes to avoid jarring position resets on every interaction.
  const { simNodes, clusterCentroids } = useMemo(() => {
    const types     = Array.from(new Set(nodes.map(n => n.type)));
    const centroids = getClusterCentroids(types);
    return { simNodes: initSimNodes(nodes, centroids), clusterCentroids: centroids };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  // Edge degree counts — used for node sizing
  const degreeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of edges) {
      map.set(e.sourceId, (map.get(e.sourceId) ?? 0) + 1);
      map.set(e.targetId, (map.get(e.targetId) ?? 0) + 1);
    }
    return map;
  }, [edges]);

  const sceneData: SceneData | null = useMemo(() => {
    if (nodes.length === 0) return null;
    return {
      simNodes,
      edges,
      nodeData: nodes,
      selectedId: selectedNode?.id ?? null,
      hoveredId: null,
      onNodeClick: (id: string) => selectNode(nodes.find(n => n.id === id) ?? null),
      onNodeHover: () => {},
      activeTypes: activeFilters,
      clusterCentroids,
      degreeMap,
      isLight,
    };
  }, [nodes, edges, selectedNode, activeFilters, selectNode, simNodes, clusterCentroids, degreeMap, isLight]);

  // Hover tracked separately to avoid rebuilding the full sceneData on every mousemove
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const sceneDataWithHover: SceneData | null = useMemo(() => {
    if (!sceneData) return null;
    return { ...sceneData, hoveredId, onNodeHover: setHoveredId };
  }, [sceneData, hoveredId]);

  const visibleNodeCount = nodes.filter(n => activeFilters.has(n.type)).length;

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', flexDirection: 'column',
        background: isLight ? 'rgba(245,243,239,0.98)' : 'rgba(13,12,10,0.98)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}>
        <MobileWikiList
          nodes={nodes}
          edges={edges}
          loading={loading}
          rebuilding={rebuilding}
          rebuildProgress={rebuildProgress}
          rebuildError={rebuildError}
          stats={stats}
          onRebuild={handleRebuild}
          onClose={onClose}
          isLight={isLight}
        />
      </div>
    );
  }

  return (
    <div className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", background: bgPanel }}>
      <style>{`
        .wg-sidebar::-webkit-scrollbar { width: 6px; }
        .wg-sidebar::-webkit-scrollbar-track { background: transparent; }
        .wg-sidebar::-webkit-scrollbar-thumb { background: ${borderColor}; border-radius: 3px; }
        .wg-sidebar::-webkit-scrollbar-thumb:hover { background: ${txtMuted}; }
        .wg-detail::-webkit-scrollbar { width: 5px; }
        .wg-detail::-webkit-scrollbar-track { background: transparent; }
        .wg-detail::-webkit-scrollbar-thumb { background: ${borderColor}; border-radius: 3px; }
      `}</style>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: `1px solid ${headerBorder}`,
        background: isLight ? 'rgba(245,243,239,0.95)' : 'rgba(18,17,15,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(204,120,92,0.15)',
            border: '1px solid rgba(204,120,92,0.25)',
          }}>
            <Network size={16} color="#cc785c" />
          </div>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: txtBright, margin: 0, fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em' }}>
              Knowledge Graph
            </h2>
            <p style={{ fontSize: '11px', color: txtSec, margin: '1px 0 0 0', fontFamily: 'Inter, sans-serif' }}>
              {nodes.length > 0
                ? `${nodes.length} concepts · ${edges.length} relationships${stats ? ` · rebuilt ${stats.concepts} nodes` : ''}`
                : 'Automatically extracted from your conversations'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {rebuilding && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: txtSec, fontFamily: 'Inter, sans-serif' }}>
              <LoaderCircle size={13} className="animate-spin" />
              <span>{rebuildProgress || 'Updating…'}</span>
            </div>
          )}
          <button onClick={() => setIsLight(p => !p)} title="Toggle theme" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: '8px',
            background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
            color: txtMuted, border: `1px solid ${borderColor}`,
            cursor: 'pointer', fontSize: '14px',
          }}>{isLight ? '🌙' : '☀️'}</button>
          <button onClick={handleRebuild} disabled={rebuilding} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px',
            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
            color: txtMuted, border: `1px solid ${borderColor}`,
            cursor: rebuilding ? 'not-allowed' : 'pointer', fontSize: '12px',
            fontFamily: 'Inter, sans-serif', opacity: rebuilding ? 0.5 : 1,
          }}><RefreshCw size={13} /> Rebuild</button>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: '8px',
          }}><X size={17} /></button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Sidebar */}
        <div className="wg-sidebar" style={{
          width: "220px", borderRight: `1px solid ${borderColor}`,
          display: "flex", flexDirection: "column", background: bgSidebar,
          flexShrink: 0, overflowY: "auto",
        }}>
          {/* Search */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${borderColor}`, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: searchIcon }} />
              <input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); searchNodes(e.target.value); }}
                placeholder="Search concepts…"
                style={{
                  width: "100%", padding: "7px 9px 7px 28px", borderRadius: "6px",
                  border: `1px solid ${inputBorder}`, background: inputBg, color: inputText,
                  fontSize: "12px", outline: "none", fontFamily: "Inter, sans-serif",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Filters */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${borderColor}`, flexShrink: 0 }}>
            <div style={{ fontSize: "10px", color: txtSec, marginBottom: "8px", fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Filters
            </div>
            {allTypes.length === 0 ? (
              <div style={{ fontSize: "11px", color: txtMuted, fontFamily: "Inter, sans-serif" }}>No data yet</div>
            ) : allTypes.map(t => (
              <label key={t} style={{
                display: "flex", alignItems: "center", gap: "8px",
                cursor: "pointer", fontSize: "12px", color: txtBody,
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
                <span style={{ marginLeft: "auto", color: txtMuted, fontSize: "11px" }}>
                  {nodes.filter(n => n.type === t).length}
                </span>
              </label>
            ))}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="wg-detail" style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              <div style={{ fontSize: "10px", color: txtSec, padding: "4px 14px 6px", fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Results
              </div>
              {searchResults.map(n => (
                <div key={n.id} onClick={() => { selectNode(n); setSearchResults([]); setSearchQuery(""); }}
                  style={{ padding: "6px 14px", cursor: "pointer", fontSize: "12px", color: txtBody, fontFamily: "Inter, sans-serif" }}
                  onMouseEnter={e => (e.currentTarget.style.background = isLight ? "#e0ded8" : "#1a1a18")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <span style={{ color: getNodeColor(n.type), fontWeight: 500 }}>{n.label}</span>
                  <span style={{ color: txtMuted, fontSize: "10px", display: "block" }}>{n.type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected node detail */}
          {!searchResults.length && selectedNode && (
            <div className="wg-detail" style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: getNodeColor(selectedNode.type), display: "inline-block", flexShrink: 0 }} />
                    <strong style={{ fontSize: "13px", color: txtBright, fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
                      {selectedNode.label}
                    </strong>
                  </div>
                  <div style={{ fontSize: "10px", color: txtSec, marginTop: "3px", textTransform: "capitalize", fontFamily: "Inter, sans-serif" }}>
                    {selectedNode.type}
                  </div>
                </div>
                <button onClick={() => selectNode(null)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: txtMuted, padding: "2px", display: "flex", flexShrink: 0,
                }}><X size={13} /></button>
              </div>
              {selectedNode.description && (
                <p style={{ fontSize: "11px", color: txtSec, marginTop: "10px", lineHeight: "1.6", fontFamily: "Inter, sans-serif" }}>
                  {selectedNode.description}
                </p>
              )}
              <div style={{ fontSize: "10px", color: txtSec, marginTop: "14px", marginBottom: "6px", fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Connections ({connected.length})
              </div>
              {connected.map(c => (
                <div key={c.edge.id} onClick={() => selectNode(c.node)}
                  style={{ padding: "5px 8px", borderRadius: "5px", cursor: "pointer", fontSize: "11px", color: txtBody, fontFamily: "Inter, sans-serif" }}
                  onMouseEnter={e => { e.currentTarget.style.background = isLight ? "#e0ded8" : "#1a1a18"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ color: getNodeColor(c.node.type) }}>{c.node.label}</span>
                  <span style={{ color: txtMuted, marginLeft: "6px", fontSize: "10px" }}>— {c.edge.relationship}</span>
                </div>
              ))}
              {connected.length === 0 && (
                <div style={{ fontSize: "11px", color: txtMuted, fontFamily: "Inter, sans-serif" }}>No direct connections</div>
              )}
            </div>
          )}

          {/* Default hint */}
          {!searchResults.length && !selectedNode && nodes.length > 0 && (
            <div style={{ padding: "14px" }}>
              <div style={{ fontSize: "11px", color: txtMuted, fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>
                Click any node to explore connections.<br />Drag to rotate · Scroll to zoom · Auto-rotates.
              </div>
            </div>
          )}
        </div>

        {/* 3D Canvas */}
        <div
          ref={containerRef}
          style={{ flex: 1, position: "relative", background: bgDark, overflow: "hidden", minWidth: 0 }}
        >
          {/* Loading overlay */}
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: isLight ? "rgba(232,230,224,0.9)" : "rgba(15,15,14,0.9)", zIndex: 2,
            }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <LoaderCircle size={28} className="animate-spin" style={{ color: "#cc785c" }} />
                <span style={{ fontSize: "12px", color: txtSec, fontFamily: "Inter, sans-serif" }}>Loading graph…</span>
              </div>
            </div>
          )}

          {/* Three.js canvas */}
          {sceneDataWithHover && (
            <div style={{ position: "absolute", inset: 0 }}>
              <Canvas
                style={{ width: "100%", height: "100%" }}
                gl={{ antialias: true, alpha: false }}
                camera={{ position: [0, 120, 680], fov: 50, near: 1, far: 2200 }}
                dpr={[1, 2]}
              >
                <GraphScene sceneData={sceneDataWithHover} />
              </Canvas>
            </div>
          )}

          {/* Empty state */}
          {!loading && visibleNodeCount === 0 && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 1,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              color: txtSec, padding: "40px", textAlign: "center",
              fontFamily: "Inter, sans-serif", gap: "16px",
            }}>
              <Network size={48} color={txtMuted} strokeWidth={1.5} />
              <div>
                <p style={{ fontSize: "14px", color: txtBody, fontWeight: 500, margin: 0 }}>
                  {nodes.length === 0 ? "No concepts yet" : "All nodes hidden by filters"}
                </p>
                <p style={{ fontSize: "12px", color: txtMuted, margin: "4px 0 0 0", maxWidth: "320px" }}>
                  {nodes.length === 0
                    ? "Click \"Rebuild\" to extract concepts from your conversation history."
                    : "Enable some filters in the sidebar to show nodes."}
                </p>
              </div>
              {nodes.length === 0 && (rebuilding ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <LoaderCircle size={20} className="animate-spin" style={{ color: "#cc785c" }} />
                  <span style={{ fontSize: "12px", color: txtSec }}>{rebuildProgress || "Building…"}</span>
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
              background: isLight ? "rgba(245,243,239,0.92)" : "rgba(18,17,16,0.92)",
              borderRadius: "8px",
              border: `1px solid ${borderColor}`, padding: "8px 12px",
              display: "flex", flexDirection: "column", gap: "5px",
              backdropFilter: "blur(6px)",
            }}>
              {allTypes.filter(t => activeFilters.has(t)).map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "11px", color: txtBody, fontFamily: "Inter, sans-serif" }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: getNodeColor(t), flexShrink: 0,
                    boxShadow: `0 0 6px ${getNodeColor(t)}88`,
                  }} />
                  {getTypeLabel(t)}
                  <span style={{ color: txtMuted, marginLeft: "auto", paddingLeft: 8 }}>
                    {nodes.filter(n => n.type === t).length}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
