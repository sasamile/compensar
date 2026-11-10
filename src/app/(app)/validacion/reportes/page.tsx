import { ShieldCheck as PageIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { PageHeader, Table, Td } from "@/components/ui";
import { CASE_STATUS, reportData } from "@/lib/validation";
import { ValNav } from "../nav";

export default async function Reportes({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "validation.view") && !can(u, "validation.manage")) redirect("/sin-acceso");
  const sp = await searchParams;
  const tipo = sp.tipo === "seguimiento" ? "seguimiento" : "validacion";
  const filters = { tipo, programa: sp.programa || "", estado: sp.estado || "", desde: sp.desde || "", hasta: sp.hasta || "", resultado: sp.resultado || "" };
  const { cols, rows } = reportData(u, filters);
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as any).toString();
  const preview = rows.slice(0, 100);

  return (
    <>
      <PageHeader icon={PageIcon} title="Validación de requisitos" subtitle="Reportes de validación y de seguimiento de empresas" />
      <ValNav u={u} active="reportes" />
      <form className="card mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7" aria-label="Filtros del reporte">
        <label className="lg:col-span-2"><span className="label">Reporte</span>
          <select name="tipo" defaultValue={tipo} className="input"><option value="validacion">Validación de requisitos (casos y resultado)</option><option value="seguimiento">Seguimiento de empresas (validación + ruta)</option></select></label>
        <label><span className="label">Programa</span><select name="programa" defaultValue={filters.programa} className="input"><option value="">Todos</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span className="label">Estado</span>
          <select name="estado" defaultValue={filters.estado} className="input">
            <option value="">Todos</option>
            {tipo === "seguimiento" ? ["pendiente", "activa", "suspendida"].map((s) => <option key={s} value={s}>{s}</option>)
              : <><option value="abiertas">Abiertas</option>{Object.entries(CASE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</>}
          </select></label>
        {tipo === "validacion" ? (
          <label><span className="label">Resultado automático</span><select name="resultado" defaultValue={filters.resultado} className="input"><option value="">Todos</option><option value="cumple">Cumple</option><option value="no_cumple">No cumple</option></select></label>
        ) : <div className="hidden lg:block" />}
        <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={filters.desde} className="input" /></label>
        <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={filters.hasta} className="input" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-3 lg:col-span-7">
          <button className="btn-ghost">Filtrar</button>
          <a className="btn" href={`/api/validacion/reporte?${qs}&formato=xlsx`}>⬇ Excel</a>
          <a className="btn-ghost" href={`/api/validacion/reporte?${qs}&formato=csv`}>⬇ CSV</a>
          <span className="self-center text-sm text-slate-500">{rows.length} fila(s){rows.length > preview.length ? ` · vista previa de ${preview.length}` : ""}</span>
        </div>
      </form>
      <Table head={cols.map((c) => c.header)} empty="Sin datos con estos filtros">
        {preview.map((r, i) => <tr key={i}>{cols.map((c) => <Td key={c.key} className="max-w-72 text-xs">{String(r[c.key] ?? "")}</Td>)}</tr>)}
      </Table>
    </>
  );
}
