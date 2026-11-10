import { ShieldCheck as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Flash, PageHeader, Stat, Table, Td } from "@/components/ui";
import { fmtDate, jparse } from "@/lib/util";
import {
  autoSummary, autoTone, CASE_SELECT, CASE_STATUS, caseFilter, ensureCompanyCases, failedReasons, KIND_LABEL, OPEN, processDueRequests,
  slaDays, statusTone, validators, waitTime,
} from "@/lib/validation";
import { ValNav } from "./nav";
import * as A from "./actions";

export default async function Bandeja({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "validation.view") && !can(u, "validation.manage")) {
    if (u.company_id) redirect("/validacion/solicitudes");
    redirect("/sin-acceso");
  }
  // FUN-72 (a): asegura el caso de cada empresa pendiente y aplica plazos vencidos antes de mostrar
  await ensureCompanyCases();
  await processDueRequests();

  const sp = await searchParams;
  const manage = can(u, "validation.manage");
  const f = caseFilter(u);
  const where = [f.sql]; const p: any[] = [...f.params];
  const estado = sp.estado ?? "abiertas";
  if (estado === "abiertas") where.push(`vc.status IN (${OPEN.map(() => "?").join(",")})`), p.push(...OPEN);
  else if (estado) where.push("vc.status=?"), p.push(estado);
  if (sp.programa) where.push("vc.program_id=?"), p.push(Number(sp.programa));
  if (sp.tipo) where.push("vc.kind=?"), p.push(sp.tipo);
  if (sp.responsable === "sin") where.push("vc.assigned_to IS NULL");
  else if (sp.responsable === "yo") where.push("vc.assigned_to=?"), p.push(u.id);
  else if (sp.responsable) where.push("vc.assigned_to=?"), p.push(Number(sp.responsable));
  if (sp.q) where.push("(COALESCE(c.razon_social, rc.razon_social, fr.email, '') LIKE ? OR COALESCE(c.nit, rc.nit, '') LIKE ?)"), p.push(`%${sp.q}%`, `%${sp.q}%`);
  let rows = all<any>(`${CASE_SELECT} WHERE ${where.join(" AND ")} ORDER BY CASE WHEN vc.status IN ('pendiente','en_revision','ajustes') THEN 0 ELSE 1 END, vc.created_at ASC LIMIT 500`, ...p);
  if (sp.auto === "cumple") rows = rows.filter((r) => jparse<any>(r.auto_result, null)?.ok === true);
  if (sp.auto === "no_cumple") rows = rows.filter((r) => jparse<any>(r.auto_result, null)?.ok === false);

  const scopeAll = all<any>(`SELECT vc.status, vc.assigned_to, vc.created_at FROM validation_cases vc WHERE ${f.sql}`, ...f.params);
  const open = scopeAll.filter((r) => OPEN.includes(r.status));
  const sla = slaDays();
  const late = open.filter((r) => waitTime(r.created_at).days > sla).length;
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  const vals = validators();
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["ok", "error"].includes(k)) as any).toString();
  const here = "/validacion" + (qs ? "?" + qs : "");

  return (
    <>
      <PageHeader icon={PageIcon} title="Validación de requisitos" subtitle="Solicitudes pendientes de validación: registros de empresas e inscripciones"
        actions={manage ? <form action={A.processNow}><input type="hidden" name="back" value={here} /><button className="btn-ghost">Procesar plazos ahora</button></form> : null} />
      <ValNav u={u} active="bandeja" />
      <Flash sp={sp} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Pendientes" value={open.filter((r) => r.status === "pendiente").length} />
        <Stat label="En revisión" value={open.filter((r) => r.status === "en_revision").length} />
        <Stat label="Ajustes / info" value={open.filter((r) => r.status === "ajustes").length} />
        <Stat label="Sin asignar" value={open.filter((r) => !r.assigned_to).length} />
        <Stat label={`Más de ${sla} días`} value={<span className={late ? "text-red-600" : ""}>{late}</span>} hint="Tiempo de espera" />
      </div>

      <form className="mb-3 flex flex-wrap gap-2" aria-label="Filtros de la bandeja">
        <input name="q" defaultValue={sp.q} placeholder="Solicitante o NIT" aria-label="Buscar solicitante o NIT" className="input !w-full sm:!w-56" />
        <select name="programa" defaultValue={sp.programa || ""} aria-label="Programa" className="input !w-auto"><option value="">Todos los programas</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select name="estado" defaultValue={estado} aria-label="Estado" className="input !w-auto">
          <option value="abiertas">Abiertas</option><option value="">Todos los estados</option>
          {Object.entries(CASE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select name="responsable" defaultValue={sp.responsable || ""} aria-label="Responsable" className="input !w-auto">
          <option value="">Todos los responsables</option><option value="yo">Asignadas a mí</option><option value="sin">Sin asignar</option>
          {vals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="tipo" defaultValue={sp.tipo || ""} aria-label="Tipo" className="input !w-auto"><option value="">Todos los tipos</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <div className="contents">
          <select name="auto" defaultValue={sp.auto || ""} aria-label="Resultado automático" className="input !w-auto"><option value="">Auto: todos</option><option value="cumple">Cumple</option><option value="no_cumple">No cumple</option></select>
          <button className="btn-ghost">Filtrar</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes con estos filtros">Las empresas que se registran quedan aquí automáticamente; las inscripciones llegan desde los formularios.</EmptyState>
      ) : (
        <form>
          <input type="hidden" name="back" value={here} />
          <Table head={[...(manage ? [""] : []), "Solicitante", "Tipo", "Programa", "Validación automática", "Estado", "Responsable", "Tiempo de espera", ""]}>
            {rows.map((r) => {
              const a = jparse<any>(r.auto_result, null);
              const isOpen = OPEN.includes(r.status);
              const w = waitTime(r.created_at, isOpen ? null : r.decided_at);
              return (
                <tr key={r.id}>
                  {manage && <Td>{isOpen && <input type="checkbox" name="ids" value={r.id} aria-label={`Seleccionar ${r.applicant}`} />}</Td>}
                  <Td><Link href={`/validacion/${r.id}`} className="font-medium text-ink hover:text-brand">{r.applicant}</Link>
                    <div className="text-xs text-slate-400">{r.nit ? `NIT ${r.nit}` : r.form_name || ""} · #{r.id}</div></Td>
                  <Td className="text-xs">{KIND_LABEL[r.kind] || r.kind}</Td>
                  <Td>{r.program || "—"}</Td>
                  <Td><Badge tone={autoTone(a)}>{autoSummary(a)}</Badge>
                    {a?.ok === false && <div className="mt-1 max-w-56 text-xs text-red-700">{failedReasons(a)}</div>}</Td>
                  <Td><Badge tone={statusTone(r.status)}>{CASE_STATUS[r.status] || r.status}</Badge>
                    {r.open_requests > 0 && <div className="mt-1 text-xs text-violet-700">{r.open_requests} solicitud(es) de información abierta(s)</div>}</Td>
                  <Td>{r.assignee || <span className="text-slate-400">Sin asignar</span>}</Td>
                  <Td><span className={isOpen && w.days > slaDays() ? "font-semibold text-red-600" : ""}>{isOpen ? w.label : `Resuelta en ${w.label}`}</span>
                    <div className="text-xs text-slate-400">desde {fmtDate(r.created_at, false)}</div></Td>
                  <Td><Link className="text-brand" href={`/validacion/${r.id}`}>Revisar</Link></Td>
                </tr>);
            })}
          </Table>
          {manage && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <span className="text-slate-500">Con las seleccionadas:</span>
              <select name="assignee" aria-label="Validador" className="input !w-auto !py-1 text-xs"><option value="">Validador…</option>{vals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              <button formAction={A.assignCases} className="btn btn-sm">Asignar / reasignar</button>
            </div>)}
        </form>
      )}
    </>
  );
}
