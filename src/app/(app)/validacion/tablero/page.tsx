import { ShieldCheck as PageIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { PageHeader, Stat, Table, Td } from "@/components/ui";
import { Donut, HBarChart, LineChart } from "@/components/charts";
import PrintButton from "@/components/print-button";
import { jparse } from "@/lib/util";
import { CASE_STATUS, caseFilter, OPEN } from "@/lib/validation";
import { ValNav } from "../nav";

const COLORS: Record<string, string> = { pendiente: "#f59e0b", en_revision: "#0a6cff", ajustes: "#7c3aed", aprobado: "#16a34a", rechazado: "#dc2626" };
const month = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 7);

export default async function Tablero({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "validation.view") && !can(u, "validation.manage")) redirect("/sin-acceso");
  const sp = await searchParams;
  const f = caseFilter(u);
  const where = [f.sql]; const p: any[] = [...f.params];
  if (sp.programa) where.push("vc.program_id=?"), p.push(Number(sp.programa));
  if (sp.desde) where.push("vc.created_at>=?"), p.push(new Date(sp.desde + "T00:00:00-05:00").toISOString());
  if (sp.hasta) where.push("vc.created_at<=?"), p.push(new Date(sp.hasta + "T23:59:59-05:00").toISOString());
  const rows = all<any>(`SELECT vc.*, COALESCE(a.name, 'Sin asignar') assignee FROM validation_cases vc LEFT JOIN users a ON a.id=vc.assigned_to WHERE ${where.join(" AND ")}`, ...p);
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");

  const byStatus = Object.keys(CASE_STATUS).map((k) => ({ label: CASE_STATUS[k], value: rows.filter((r) => r.status === k).length, color: COLORS[k] }));
  const decided = rows.filter((r) => !OPEN.includes(r.status) && r.decided_at);
  const avgDays = decided.length ? decided.reduce((a, r) => a + (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 86400000, 0) / decided.length : 0;
  const evaluated = rows.map((r) => jparse<any>(r.auto_result, null)).filter((a) => a && a.ok !== null);
  const pctOk = evaluated.length ? Math.round((evaluated.filter((a) => a.ok).length / evaluated.length) * 100) : 0;
  const people = Array.from(new Set(rows.map((r) => r.assignee))).sort();
  const matrix = people.map((name) => {
    const mine = rows.filter((r) => r.assignee === name);
    const dec = mine.filter((r) => !OPEN.includes(r.status) && r.decided_at);
    return {
      name, total: mine.length, counts: Object.keys(CASE_STATUS).map((k) => mine.filter((r) => r.status === k).length), open: mine.filter((r) => OPEN.includes(r.status)).length,
      avg: dec.length ? dec.reduce((a, r) => a + (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 86400000, 0) / dec.length : null,
    };
  });
  const months = Array.from(new Set([...rows.map((r) => month(r.created_at)), ...decided.map((r) => month(r.decided_at))])).sort();
  const series = [
    { label: "Recibidas", points: months.map((m) => ({ x: m, y: rows.filter((r) => month(r.created_at) === m).length })) },
    { label: "Decididas", points: months.map((m) => ({ x: m, y: decided.filter((r) => month(r.decided_at) === m).length })), color: "#16a34a" },
  ];

  return (
    <>
      <PageHeader icon={PageIcon} title="Validación de requisitos" subtitle="Tablero de avance por estado y responsable" actions={<PrintButton />} />
      <ValNav u={u} active="tablero" />
      <form className="mb-5 flex flex-wrap items-end gap-2 print:hidden" aria-label="Filtros del tablero">
        <label><span className="label">Programa</span><select name="programa" defaultValue={sp.programa || ""} className="input !w-56"><option value="">Todos</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={sp.desde} className="input" /></label>
        <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta} className="input" /></label>
        <button className="btn-ghost">Aplicar</button>
      </form>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Solicitudes" value={rows.length} />
        <Stat label="Abiertas" value={rows.filter((r) => OPEN.includes(r.status)).length} />
        <Stat label="Aprobadas" value={rows.filter((r) => r.status === "aprobado").length} />
        <Stat label="Rechazadas" value={rows.filter((r) => r.status === "rechazado").length} />
        <Stat label="Cumplen (automática)" value={`${pctOk}%`} hint={`${evaluated.length} evaluadas`} />
        <Stat label="Tiempo medio de decisión" value={`${avgDays.toFixed(1)} d`} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <section className="card"><h2 className="mb-3 font-semibold text-ink">Por estado</h2><Donut data={byStatus} label="Solicitudes por estado" /></section>
        <section className="card"><h2 className="mb-3 font-semibold text-ink">Abiertas por responsable</h2>
          {matrix.some((m) => m.open) ? <HBarChart data={matrix.filter((m) => m.open).map((m) => ({ label: m.name, value: m.open }))} /> : <p className="text-sm text-slate-500">No hay solicitudes abiertas.</p>}
        </section>
      </div>
      {months.length > 0 && <section className="card mb-5"><h2 className="mb-3 font-semibold text-ink">Recibidas vs. decididas por mes</h2><LineChart series={series} /></section>}
      <Table head={["Responsable", ...Object.values(CASE_STATUS), "Total", "Días promedio"]} empty="Sin solicitudes en el periodo">
        {matrix.map((m) => (
          <tr key={m.name}><Td><b>{m.name}</b></Td>{m.counts.map((n, i) => <Td key={i}>{n}</Td>)}<Td><b>{m.total}</b></Td><Td>{m.avg == null ? "—" : m.avg.toFixed(1)}</Td></tr>))}
      </Table>
    </>
  );
}
