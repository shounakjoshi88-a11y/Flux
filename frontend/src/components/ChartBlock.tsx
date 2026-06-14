// src/components/ChartBlock.tsx
//
// Renders <CHART>...</CHART> and <MERMAID>...</MERMAID> blocks
// that the model embeds inside its answers.

import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────
interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

interface ChartSpec {
  type: "bar" | "line" | "pie" | "doughnut";
  title?: string;
  labels: string[];
  datasets: ChartDataset[];
}

// Default palette when colors aren't specified
const DEFAULT_COLORS = [
  "#60a5fa", "#34d399", "#f472b6", "#fb923c",
  "#a78bfa", "#facc15", "#38bdf8", "#4ade80",
];

// ─── Bar/Line chart (recharts) ────────────────────────────────
function BarLineChart({ spec }: { spec: ChartSpec }) {
  if (!spec || !Array.isArray(spec.labels) || !Array.isArray(spec.datasets)) {
    return (
      <div className="my-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        ⚠️ Invalid chart specifications (missing labels or datasets)
      </div>
    );
  }

  const data = spec.labels.map((label, i) => {
    const point: Record<string, any> = { name: label };
    spec.datasets.forEach((ds) => {
      if (ds && Array.isArray(ds.data)) {
        point[ds.label] = ds.data[i] ?? 0;
      }
    });
    return point;
  });

  const ChartComponent = spec.type === "line" ? LineChart : BarChart;
  const DataComponent = spec.type === "line" ? Line : Bar;

  return (
    <div className="my-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111] p-4">
      {spec.title && (
        <p className="text-sm font-semibold text-center mb-3 text-foreground/80">{spec.title}</p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <ChartComponent data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "var(--background, #fff)",
              border: "1px solid rgba(128,128,128,0.2)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend />
          {spec.datasets.map((ds, i) => (
            <DataComponent
              key={ds.label}
              dataKey={ds.label}
              fill={ds.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              stroke={ds.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              strokeWidth={2}
              radius={spec.type === "bar" ? 4 : 0}
              dot={spec.type === "line" ? { r: 4 } : undefined}
            />
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Pie / Doughnut chart ─────────────────────────────────────
function PieDonutChart({ spec }: { spec: ChartSpec }) {
  if (!spec || !Array.isArray(spec.labels) || !Array.isArray(spec.datasets)) {
    return (
      <div className="my-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        ⚠️ Invalid chart specifications (missing labels or datasets)
      </div>
    );
  }

  const ds = spec.datasets[0];
  if (!ds || !Array.isArray(ds.data)) return null;

  const data = spec.labels.map((label, i) => ({
    name: label,
    value: ds.data[i] ?? 0,
  }));

  const innerRadius = spec.type === "doughnut" ? "55%" : "0%";

  return (
    <div className="my-4 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111] p-4">
      {spec.title && (
        <p className="text-sm font-semibold text-center mb-3 text-foreground/80">{spec.title}</p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="75%"
            innerRadius={innerRadius}
            label={({ name, percent }: any) => {
                const pct = (percent ?? 0) * 100;
                return `${name ?? ""} ${pct.toFixed(0)}%`;
            }}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--background, #fff)",
              border: "1px solid rgba(128,128,128,0.2)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── CHART block renderer ─────────────────────────────────────
function ChartBlock({ raw }: { raw: string }) {
  const spec = useMemo<ChartSpec | null>(() => {
    try {
      const parsed = JSON.parse(raw.trim());
      if (!Array.isArray(parsed.datasets) || !Array.isArray(parsed.labels)) return null;
      return parsed as ChartSpec;
    } catch {
      return null;
    }
  }, [raw]);

  if (!spec) {
    return (
      <div className="my-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-700 dark:text-yellow-300">
        ⚠️ Could not render chart — invalid spec
      </div>
    );
  }

  if (spec.type === "pie" || spec.type === "doughnut") {
    return <PieDonutChart spec={spec} />;
  }
  return <BarLineChart spec={spec} />;
}

// ─── MERMAID block renderer ───────────────────────────────────
function MermaidBlock({ raw }: { raw: string }) {
  return (
    <div className="my-4 rounded-xl border border-black/10 dark:border-white/10 bg-[#f8f8f8] dark:bg-[#0d0d0d] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10">
        <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest">diagram</span>
      </div>
      <pre className="p-4 text-xs font-mono text-foreground/70 overflow-x-auto whitespace-pre leading-relaxed">
        {raw.trim()}
      </pre>
    </div>
  );
}

export type TextOrVisual =
  | { kind: "text"; content: string }
  | { kind: "chart"; raw: string }
  | { kind: "mermaid"; raw: string };

export function parseVisuals(content: string): TextOrVisual[] {
  const segments: TextOrVisual[] = [];
  const re = /<(CHART|MERMAID)>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", content: content.slice(lastIndex, match.index) });
    }
    const tagMatch = match[1];
    if (tagMatch) {
        const tag = tagMatch.toUpperCase() as "CHART" | "MERMAID";
        segments.push({
            kind: tag === "CHART" ? "chart" : "mermaid",
            raw: match[2] ?? "",
        });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ kind: "text", content: content.slice(lastIndex) });
  }

  return segments;
}

export function ContentWithVisuals({ content, renderText }: {
  content: string;
  renderText: (text: string, key: string | number) => React.ReactNode;
}) {
  const segments = useMemo(() => parseVisuals(content), [content]);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "chart")   return <ChartBlock   key={i} raw={seg.raw} />;
        if (seg.kind === "mermaid") return <MermaidBlock key={i} raw={seg.raw} />;
        return renderText(seg.content, i);
      })}
    </>
  );
}

export type ChartData = ChartSpec;

export function ChartRenderer({ data }: { data: ChartData }) {
  if (!data || !Array.isArray(data.labels) || !Array.isArray(data.datasets)) {
    return (
      <div className="my-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        ⚠️ Invalid chart specifications (missing labels or datasets)
      </div>
    );
  }
  if (data.type === "pie" || data.type === "doughnut") {
    return <PieDonutChart spec={data} />;
  }
  return <BarLineChart spec={data} />;
}

export { ChartBlock, MermaidBlock };
