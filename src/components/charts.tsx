/**
 * Gráficas de la plataforma. Las interactivas (barras, dona, áreas, radar) se dibujan con Recharts en
 * charts-client.tsx; aquí quedan las envolturas que pueden usarse desde componentes de servidor
 * (las funciones, como `format`, no cruzan al cliente) y las barras simples en CSS.
 */
import { Areas, Bars, DonutChart, RadarView } from "./charts-client";

const PALETTE = ["#2563eb", "#60a5fa", "#1e3a8a", "#93c5fd", "#0d9488", "#a1a1aa"];
export const chartColor = (i: number) => PALETTE[i % PALETTE.length];

type D = { label: string; value: number; color?: string };
const plain = (data: D[]) => data.map((d) => ({ label: String(d.label), value: Number(d.value) || 0, ...(d.color ? { color: d.color } : {}) }));

export function BarChart({ data, height = 200 }: { data: D[]; height?: number; color?: string; format?: (v: number) => string }) {
  return <Bars data={plain(data)} height={height} />;
}

export function Donut({ data, size = 140, label }: { data: D[]; size?: number; label?: string }) {
  return <DonutChart data={plain(data)} size={size} label={label} />;
}

export function LineChart({ series, height = 220 }: { series: { label: string; points: { x: string; y: number }[]; color?: string }[]; height?: number; width?: number }) {
  return <Areas series={series.map((s) => ({ label: s.label, color: s.color, points: s.points.map((p) => ({ x: String(p.x), y: Number(p.y) })) }))} height={height} />;
}

export function Radar({ data, max = 100, size = 280 }: { data: D[]; max?: number; size?: number }) {
  if (data.length < 3) return <HBarChart data={data} max={max} />;
  return <RadarView data={plain(data)} max={max} size={size} />;
}

/** Barras horizontales (ranking): se quedan en el servidor porque aceptan `format`. */
export function HBarChart({ data, max: mx, format = (v: number) => String(Math.round(v * 10) / 10) }:
  { data: D[]; max?: number; format?: (v: number) => string }) {
  const max = mx ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="font-medium tabular-nums text-foreground">{format(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (d.value / max) * 100)}%`, background: d.color || chartColor(i) }} />
          </div>
        </div>))}
    </div>
  );
}

export function Progress({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color || "var(--primary)" }} />
    </div>
  );
}

export function Semaforo({ color }: { color: "verde" | "amarilla" | "roja" | string }) {
  const c = color === "roja" ? "#dc2626" : color === "amarilla" ? "#f59e0b" : "#16a34a";
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 18%, transparent)` }} title={color} aria-label={`semáforo ${color}`} />;
}
