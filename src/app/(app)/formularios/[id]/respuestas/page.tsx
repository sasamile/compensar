import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, FileText as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, EmptyState, Flash, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Donut } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { RESPONSE_STATUS, parseScoring, statusLabel } from "@/lib/forms";
import { canManageForm, canSeeResponses, folio, getForm, responseRows } from "../../server";

export default async function Respuestas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const f = getForm(Number((await params).id));
  if (!f || !canSeeResponses(u, f)) redirect("/sin-acceso");
  const sp = await searchParams;
  const rows = responseRows(f.id, sp);
  const versions = all<any>("SELECT version FROM form_versions WHERE form_id=? ORDER BY version DESC", f.id);
  const diag = f.kind === "diagnostico";
  const levels = parseScoring(f.scoring).levels;
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["ok", "error"].includes(k)) as any).toString();
  const byStatus = RESPONSE_STATUS.map(([k, l]) => ({ label: l, value: rows.filter((r) => r.status === k).length })).filter((x) => x.value);
  const avg = diag && rows.length ? Math.round((rows.reduce((a, r) => a + (r.score || 0), 0) / rows.length) * 10) / 10 : null;
  return (
    <>
      <PageHeader icon={PageIcon} title={`Respuestas · ${f.name}`} subtitle="Cada respuesta se muestra con la versión del formulario con la que fue diligenciada"
        actions={<>
          {canManageForm(u, f) && <Link href={`/formularios/${f.id}`} className="btn-ghost">Volver al formulario</Link>}
          <a className="btn-ghost" href={`/api/formularios/${f.id}/export?format=csv&${qs}`}><Download className="h-4 w-4" />CSV</a>
          <a className="btn" href={`/api/formularios/${f.id}/export?format=xlsx&${qs}`}><FileSpreadsheet className="h-4 w-4" />Excel</a>
        </>} />
      <Flash sp={sp} />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Stat label="Resultados" value={rows.length} hint={sp.estado ? statusLabel(sp.estado) : "Enviadas (sin borradores)"} />
        <Stat label="Versión vigente" value={f.version ? `v${f.version}` : "—"} hint={f.status} />
        {diag ? <Stat label="Puntaje promedio" value={avg ?? "—"} hint="0 a 100" /> : <Stat label="Borradores en curso" value={all<any>("SELECT COUNT(*) n FROM form_responses WHERE form_id=? AND status='borrador'", f.id)[0].n} />}
        <div className="card">{byStatus.length ? <Donut data={byStatus} size={110} label="Respuestas por estado" /> : <span className="text-sm text-slate-400">Sin datos</span>}</div>
      </div>
      <form className="mb-3 flex flex-wrap gap-2 text-sm" role="search">
        <input name="empresa" defaultValue={sp.empresa} placeholder="Empresa, NIT, correo o nombre" className="input !w-60" aria-label="Empresa, NIT, correo o nombre" />
        <input name="q" defaultValue={sp.q} placeholder="Buscar en respuestas" className="input !w-48" aria-label="Buscar en respuestas" />
        <select name="estado" defaultValue={sp.estado || ""} className="input !w-auto" aria-label="Estado"><option value="">Enviadas (todas)</option>{RESPONSE_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="version" defaultValue={sp.version || ""} className="input !w-auto" aria-label="Versión"><option value="">Todas las versiones</option>{versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}</select>
        {diag && <select name="nivel" defaultValue={sp.nivel || ""} className="input !w-auto" aria-label="Nivel"><option value="">Todos los niveles</option>{levels.map((l) => <option key={l.name}>{l.name}</option>)}</select>}
        <label className="flex items-center gap-1 text-xs text-slate-500">Desde<input type="date" name="desde" defaultValue={sp.desde} className="input !w-auto" /></label>
        <label className="flex items-center gap-1 text-xs text-slate-500">Hasta<input type="date" name="hasta" defaultValue={sp.hasta} className="input !w-auto" /></label>
        <button className="btn-ghost">Filtrar</button>
        {qs && <Link href={`/formularios/${f.id}/respuestas`} className="self-center text-xs text-slate-500 underline">Limpiar</Link>}
      </form>
      {rows.length === 0 ? <EmptyState title="Sin respuestas con estos filtros">Comparte el enlace del formulario o ajusta los filtros.</EmptyState> : (
        <Table head={["Folio", "Empresa / participante", "Versión", "Estado", ...(diag ? ["Puntaje", "Nivel", "Segmento"] : []), "Enviado", ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><code className="text-xs">{folio(r)}</code></Td>
              <Td>{r.company ? <><b>{r.company}</b><div className="text-xs text-slate-400">NIT {r.company_nit}-{r.company_dv}</div></> : null}
                <div className="text-xs text-slate-500">{r.user_name || r.email}</div></Td>
              <Td>v{r.form_version}{r.form_version !== f.version && <span className="ml-1 text-[10px] text-slate-400">(anterior)</span>}</Td>
              <Td><Badge>{statusLabel(r.status)}</Badge>{r.case_status && <div className="text-[11px] text-slate-400">Validación: {r.case_status}</div>}</Td>
              {diag && <><Td><b>{r.score ?? "—"}</b></Td><Td>{r.level || "—"}</Td><Td>{r.segment || "—"}</Td></>}
              <Td className="whitespace-nowrap text-xs">{fmtDate(r.submitted_at || r.updated_at)}</Td>
              <Td><Link className="text-brand" href={`/formularios/${f.id}/respuestas/${r.id}`}>Ver</Link></Td>
            </tr>))}
        </Table>)}
    </>
  );
}
