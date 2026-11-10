import { FileSpreadsheet as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { buildReport, canReport, parsePeriod } from "@/lib/reports";
import { REPORTS } from "@/lib/perms";
import { EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { ExportButtons } from "@/components/ana-export";

export default async function Reportes({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const mine = REPORTS.filter(([id]) => canReport(u, id));
  if (!mine.length) redirect("/sin-acceso");
  const qs = new URLSearchParams({ ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }).toString();
  const sel = sp.ver && canReport(u, sp.ver) ? sp.ver : null;
  const t0 = Date.now();
  const prev = sel ? buildReport(sel, u, parsePeriod(sp.desde, sp.hasta), sp) : null;
  const ms = Date.now() - t0;
  const selName = sel ? REPORTS.find((r) => r[0] === sel)?.[1] : "";
  return (
    <>
      <PageHeader icon={PageIcon} title="Reportes" subtitle="Catálogo de reportes por periodo en Excel, CSV, JSON y PDF, respetando el alcance de tu rol"
        actions={can(u, "analytics.view") ? <><Link className="btn-ghost btn-sm" href="/analitica/consultas">Constructor de consultas</Link><Link className="btn-ghost btn-sm" href="/analitica">Analítica</Link></> : null} />
      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={sp.desde} className="input" /></label>
        <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta} className="input" /></label>
        {sel && <input type="hidden" name="ver" value={sel} />}<button className="btn-ghost">Aplicar periodo</button>
        <p className="text-xs text-slate-500">Sin fechas se toma el último año y los próximos 12 meses. El PDF abre una vista imprimible con la marca.</p>
      </form>
      <Table head={["#", "Reporte", "Contenido", "Descargar"]}>
        {mine.map(([id, name, desc]) => (
          <tr key={id} className={sel === id ? "bg-brand/5" : ""}><Td><b>{id}</b></Td><Td className="font-medium">{name}</Td><Td className="text-xs text-slate-500">{desc}</Td>
            <Td><div className="flex flex-wrap items-center gap-1">
              <ExportButtons href={`/api/reportes/${id}?${qs}`} compact param="fmt" />
              <a className="btn-ghost btn-sm" href={`/reportes?ver=${id}${qs ? "&" + qs : ""}#vista`}>Vista previa</a></div></Td></tr>))}
      </Table>
      {sel && prev && (
        <section id="vista" className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">{sel} · {selName} <span className="text-sm font-normal text-slate-500">({prev.rows.length} filas · {ms} ms)</span></h2>
            <ExportButtons href={`/api/reportes/${sel}?${qs}`} param="fmt" />
          </div>
          {prev.rows.length ? (
            <Table head={prev.cols.map((c) => c.header)}>
              {prev.rows.slice(0, 50).map((r, i) => <tr key={i}>{prev.cols.map((c) => <Td key={c.key}>{String(r[c.key] ?? "")}</Td>)}</tr>)}
            </Table>) : <EmptyState title="Sin datos en el periodo">Amplía el rango de fechas o verifica que existan registros dentro de tu alcance.</EmptyState>}
          {prev.rows.length > 50 && <p className="mt-2 text-xs text-slate-500">Se muestran las primeras 50 filas; descarga el archivo para ver las {prev.rows.length}.</p>}
        </section>)}
    </>
  );
}
