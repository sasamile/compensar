"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type Datum = { label: string; value: number; color?: string };
export type Series = { label: string; points: { x: string; y: number }[]; color?: string };

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#a1a1aa"];
const color = (i: number, c?: string) => c || PALETTE[i % PALETTE.length];
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const tooltipStyle = { contentStyle: { borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, padding: "6px 10px" }, cursor: { fill: "var(--muted)" } };

/** Barras verticales redondeadas con cuadrícula horizontal tenue. */
export function Bars({ data, height }: { data: Datum[]; height: number }) {
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${nf.format(d.value)}`).join(", ")}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [nf.format(v), "Valor"]} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44} animationDuration={450}>
            {data.map((d, i) => <Cell key={i} fill={d.color || "var(--chart-1)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dona con el total al centro y leyenda a la derecha. */
export function DonutChart({ data, size, label }: { data: Datum[]; size: number; label?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const shown = total ? data : [{ label: "Sin datos", value: 1, color: "var(--muted)" }];
  return (
    <div className="flex flex-wrap items-center gap-5" role="img" aria-label={label}>
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <PieChart>
            {total > 0 && <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [nf.format(v), n]} />}
            <Pie data={shown} dataKey="value" nameKey="label" isAnimationActive={false} innerRadius="62%" outerRadius="100%" strokeWidth={2} stroke="var(--card)" paddingAngle={total ? 1 : 0}>
              {shown.map((d, i) => <Cell key={i} fill={color(i, d.color)} />)}
              <Label position="center" content={({ viewBox }: any) => (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} dy="-0.2em" style={{ fontSize: size > 120 ? 22 : 17, fontWeight: 600, fill: "var(--foreground)" }}>{nf.format(total)}</tspan>
                  <tspan x={viewBox.cx} dy="1.5em" style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>total</tspan>
                </text>)} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color(i, d.color) }} />
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">{nf.format(d.value)}</span>
          </li>))}
      </ul>
    </div>
  );
}

/** Serie(s) en el tiempo como áreas con degradado suave. */
export function Areas({ series, height }: { series: Series[]; height: number }) {
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x))));
  const rows = xs.map((x) => Object.fromEntries([["x", x], ...series.map((s, i) => [`s${i}`, s.points.find((p) => p.x === x)?.y ?? null])]));
  return (
    <div>
      <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={i} id={`fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color(i, s.color)} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={color(i, s.color)} stopOpacity={0.02} />
                </linearGradient>))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--border)" }} formatter={(v: number, n: string) => [nf.format(v), series[Number(String(n).slice(1))]?.label ?? n]} />
            {series.map((s, i) => (
              <Area key={i} dataKey={`s${i}`} type="monotone" stroke={color(i, s.color)} strokeWidth={2} fill={`url(#fill-${i})`} connectNulls dot={false} activeDot={{ r: 4 }} animationDuration={500} />))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
          {series.map((s, i) => <span key={i} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color(i, s.color) }} />{s.label}</span>)}
        </div>)}
    </div>
  );
}

/** Radar por dimensión (diagnóstico). */
export function RadarView({ data, max, size }: { data: Datum[]; max: number; size: number }) {
  return (
    <div style={{ width: "100%", maxWidth: size + 80, height: size }} role="img" aria-label={data.map((d) => `${d.label}: ${nf.format(d.value)}`).join(", ")}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${nf.format(v)} / ${max}`, "Puntaje"]} />
          <Radar dataKey="value" isAnimationActive={false} stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.18} dot={{ r: 3, fillOpacity: 1 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
