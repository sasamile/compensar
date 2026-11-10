import { CalendarClock as PageIcon } from "lucide-react";
import Link from "next/link";
import { all, get } from "@/lib/db";
import { can, requireUser, sessionFilter } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import { fmtDate, isoToLocal } from "@/lib/util";
import * as A from "../actions";
import { SegIndicadoresSesion } from "@/components/seg-indicadores-sesion";
import { calendarStatus, m365Mode } from "@/lib/integrations/m365";
import * as L from "../agenda-lib";

export default async function SesionDetalle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const f = sessionFilter(u);
  const s = get<any>(`SELECT s.*, c.razon_social, m.name mentor, a.name accepter, rb.name registrar FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id
    LEFT JOIN users m ON m.id=s.mentor_id LEFT JOIN users a ON a.id=s.accepted_by LEFT JOIN users rb ON rb.id=s.registered_by WHERE s.id=? AND ${f.sql}`, Number((await params).id), ...f.params);
  if (!s) redirect("/sin-acceso");
  const docs = all<any>("SELECT d.*, u.name uploader, a.name accepter FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by LEFT JOIN users a ON a.id=d.accepted_by WHERE d.session_id=? ORDER BY d.id", s.id);
  const isMentor = s.mentor_id === u.id && can(u, "sessions.followup");
  const isCompany = u.company_id === s.company_id;
  const canManage = can(u, "sessions.schedule") || isCompany;
  const companyOnly = isCompany && !can(u, "sessions.schedule");
  const free = s.status === "programada" && companyOnly ? L.freeSlots(s.mentor_id, { days: 21, duration: s.duration_min || 60, excludeId: s.id }) : [];
  const avail = s.status === "programada" ? L.withinAvailability(s.mentor_id, s.scheduled_at, s.duration_min || 60) : null;
  const sync = calendarStatus(s.id);
  return (
    <>
      <PageHeader icon={PageIcon} title={s.title} subtitle={`${s.razon_social} · mentor ${s.mentor} · ${fmtDate(s.scheduled_at)} (${s.duration_min} min, ${s.modality})`}
        actions={<><Badge>{s.status}</Badge><a className="btn-ghost btn-sm" href={`/agenda/${s.id}/ics`}>📅 Agregar a calendario (.ics)</a><Link href="/agenda" className="btn-ghost btn-sm">← Agenda</Link></>} />
      <Flash sp={sp} />

      {s.status === "programada" && canManage && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <form action={A.rescheduleSession} className="card space-y-2"><b className="text-sm">Reprogramar</b><input type="hidden" name="id" value={s.id} />
            {companyOnly ? (
              free.length ? <select name="slot" required aria-label="Nueva franja" className="input" defaultValue="">
                <option value="" disabled>Elige una franja libre del mentor…</option>
                {free.map((x) => <option key={x.start} value={x.start}>{new Date(x.start).toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {x.modality}</option>)}
              </select> : <p className="text-xs text-slate-500">El mentor no tiene franjas libres en las próximas tres semanas.</p>
            ) : <input type="datetime-local" name="scheduled_at" aria-label="Nueva fecha y hora" defaultValue={isoToLocal(s.scheduled_at)} className="input" />}
            <input name="reason" placeholder="Motivo" aria-label="Motivo de la reprogramación" className="input" required /><button className="btn btn-sm">Reprogramar</button></form>
          <form action={A.cancelSession} className="card space-y-2"><b className="text-sm">Cancelar</b><input type="hidden" name="id" value={s.id} />
            <input name="reason" placeholder="Motivo de la cancelación" aria-label="Motivo de la cancelación" className="input" required /><button className="btn-danger btn-sm">Cancelar sesión</button></form>
        </div>)}
      {s.status === "cancelada" && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Cancelada. Motivo: {s.cancel_reason}</div>}
      {avail && !avail.ok && !isCompany && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠ {avail.reason}. La sesión se mantiene; verifica con el mentor.</div>}
      {!isCompany && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Calendario Outlook ({m365Mode()}):</span>
          {sync ? <><Badge tone={sync.status === "en_cola" ? "amber" : sync.status === "cancelado" ? "red" : "green"}>{sync.status === "en_cola" ? "en cola de reintentos" : sync.status}</Badge>
            <span>última operación «{sync.last_op}» · {fmtDate(sync.updated_at)} · versión {sync.sequence}{sync.mode === "graph" && sync.event_id ? ` · evento ${String(sync.event_id).slice(0, 12)}…` : ""}</span>
            {sync.last_error && <span className="text-red-600">{sync.last_error}</span>}</> : <span>sin sincronizar (sesión anterior al adaptador)</span>}
        </div>)}

      {s.status !== "cancelada" && (
        <div className="card mb-5">
          <h2 className="mb-2 font-semibold text-ink">Seguimiento</h2>
          {s.status === "realizada" && s.topics ? (
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div><dt className="label">Temas</dt><dd>{s.topics}</dd></div><div><dt className="label">Compromisos</dt><dd>{s.commitments || "—"}</dd></div>
              <div><dt className="label">Resultados</dt><dd>{s.results || "—"}</dd></div><div><dt className="label">Horas registradas</dt><dd>{s.hours} h por {s.registrar}</dd></div>
            </dl>
          ) : isMentor ? (
            <form action={A.registerFollowup} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={s.id} />
              <Field label="Temas tratados *"><textarea name="topics" rows={2} required className="input" /></Field>
              <Field label="Compromisos"><textarea name="commitments" rows={2} className="input" /></Field>
              <Field label="Resultados"><textarea name="results" rows={2} className="input" /></Field>
              <Field label="Horas ejecutadas"><input type="number" step="0.25" name="hours" defaultValue={s.duration_min / 60} className="input" /></Field>
              <div><button className="btn">Registrar sesión realizada</button></div>
            </form>
          ) : <p className="text-sm text-slate-400">Pendiente de seguimiento del mentor.</p>}
        </div>)}

      {s.status === "realizada" && s.topics && (
        <div className={`mb-5 rounded-xl border p-4 ${s.accepted_at ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          {s.accepted_at ? (<div className="text-sm text-emerald-800"><b>✓ Aceptada por la empresa</b> — {s.accepter} · {fmtDate(s.accepted_at)} · IP {s.accepted_ip}. Cuenta para el reporte de pagos.</div>)
            : isCompany && can(u, "sessions.accept") ? (
              <form action={A.acceptSession} className="flex flex-wrap items-center gap-3"><input type="hidden" name="id" value={s.id} />
                <span className="text-sm text-amber-900">Confirma que la sesión se realizó como se describe. Se registrará tu usuario, fecha, hora e IP.</span><button className="btn">Aceptar sesión</button></form>
            ) : <span className="text-sm text-amber-900">Pendiente de aceptación de la empresa. Sin aceptación no cuenta en el reporte de pagos.</span>}
        </div>)}

      <h2 className="mb-2 font-semibold text-ink">Documentos compartidos (OnBase)</h2>
      <Table head={["Documento", "Tipo", "Ref. OnBase", "Subido por", "Aceptación"]} empty="Sin documentos">
        {docs.map((d) => (
          <tr key={d.id}><Td><a className="text-brand" href={`/api/docs/${d.id}`}>{d.name}</a></Td><Td>{d.kind}</Td><Td><code>{d.onbase_ref}</code> <Badge>{d.onbase_status}</Badge></Td><Td>{d.uploader}</Td>
            <Td>{d.accepted_at ? <span className="text-xs text-emerald-700">✓ {d.accepter} · {fmtDate(d.accepted_at)} · {d.accepted_ip}</span>
              : isCompany && can(u, "sessions.accept") ? <form action={A.acceptDocument}><input type="hidden" name="doc_id" value={d.id} /><button className="btn btn-sm">Aceptar</button></form> : <span className="text-slate-300">pendiente</span>}</Td></tr>))}
      </Table>
      {can(u, "docs.upload") && s.status !== "cancelada" && (
        <form action={A.uploadSessionDoc} className="card mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={s.id} />
          <Field label="Archivo (xlsx, doc, pptx, pdf, jpg, png · ≤20 MB)"><input type="file" name="file" required className="text-xs" /></Field>
          <Field label="Tipo"><select name="kind" className="input"><option value="hoja_de_ruta">Hoja de ruta</option><option value="carta_compromiso">Carta de compromiso</option><option value="cierre">Cierre</option><option value="evidencia">Evidencia</option></select></Field>
          <button className="btn">Subir</button>
        </form>)}

      {/* Módulo seguimiento: indicadores de la empresa y registro de avance desde la sesión (FUN-84) */}
      <SegIndicadoresSesion session={s} />
    </>
  );
}
