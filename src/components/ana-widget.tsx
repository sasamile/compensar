import { BarChart, Donut, HBarChart, LineChart } from "@/components/charts";
import { Table, Td } from "@/components/ui";
import type { Result } from "@/lib/datasets";
import type { WidgetType } from "@/lib/analytics";

const fmt = (v: number) => (Math.abs(v) >= 1000 ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v) : String(Math.round(v * 10) / 10));

/** Dibuja el resultado de una consulta como KPI, barras, dona, línea o tabla. */
export function WidgetView({ type, r, empty = "Sin datos para los filtros elegidos" }: { type: WidgetType; r: Result; empty?: string }) {
  if (!r.ok) return <p className="text-sm text-red-700">{r.error}</p>;
  if (type === "kpi") {
    const v = Number(r.rows[0]?.value ?? 0);
    return <div><div className="text-3xl font-semibold text-ink">{fmt(v)}</div><div className="text-xs text-slate-500">{r.cols[1]?.header}</div></div>;
  }
  if (!r.rows.length) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  if (type === "table")
    return (
      <Table head={r.cols.map((c) => c.header)}>
        {r.rows.map((row, i) => <tr key={i}>{r.cols.map((c) => <Td key={c.key} className="text-xs">{r.types[c.key] === "date" && row[c.key] ? new Date(row[c.key]).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" }) : String(row[c.key] ?? "")}</Td>)}</tr>)}
      </Table>);
  const data = r.rows.map((x) => ({ label: String(x.label), value: Number(x.value) || 0 }));
  if (type === "donut") return <Donut data={data} label={r.cols[0]?.header} />;
  if (type === "hbar") return <HBarChart data={data} format={fmt} />;
  if (type === "line") return <LineChart series={[{ label: r.cols[1]?.header || "", points: data.map((d) => ({ x: d.label, y: d.value })) }]} />;
  return <BarChart data={data} format={fmt} />;
}
