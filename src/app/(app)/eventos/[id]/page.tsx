import { CalendarDays as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { can, canInProgram, requireUser } from "@/lib/auth";
import { Badge, Flash, PageHeader, Table, Td, Field } from "@/components/ui";
import { RichText } from "@/components/rich-text";
import { fmtDate } from "@/lib/util";
import { LANDING_TEMPLATES, eventHours, minAttendance, regFilterFrom, regFilterQuery, registrationsOf, sessionsCount, storedHours } from "@/lib/certificates";
import * as A from "../actions";
import { EventFields } from "../event-form";

export const dynamic = "force-dynamic";

export default async function EventoDetalle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const ev = get<any>("SELECT e.*, p.name program FROM events e JOIN programs p ON p.id=e.program_id WHERE e.id=?", Number((await params).id));
  if (!ev) return <p className="text-slate-500">Evento no encontrado.</p>;
  const manage = canInProgram(u, "events.manage", ev.program_id);
  const att = canInProgram(u, "attendance.manage", ev.program_id);
  const view = canInProgram(u, "registrations.view", ev.program_id);
  if (!manage && !att && !view) redirect("/sin-acceso");
  const pii = can(u, "registrations.export_pii");
  const n = sessionsCount(ev), minPct = minAttendance(ev);
  const session = Math.min(n, Math.max(1, Number(sp.sesion) || 1));

  const f = regFilterFrom(sp);
  const fq = regFilterQuery(f);
  const regs = registrationsOf(ev, f, pii);
  const totals = get<any>(`SELECT SUM(waitlist=0) inscritos, SUM(waitlist=1) espera, SUM(attended=1 AND waitlist=0) cumplen,
    (SELECT COUNT(*) FROM certificates c JOIN registrations r2 ON r2.id=c.registration_id WHERE r2.event_id=?) certs FROM registrations WHERE event_id=?`, ev.id, ev.id);
  const statuses = all<any>("SELECT DISTINCT status FROM registrations WHERE event_id=? ORDER BY status", ev.id).map((r) => r.status);
  const docs = all<any>("SELECT d.*, u.name uploader FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.event_id=? AND d.kind<>'banner' ORDER BY d.id DESC", ev.id);
  const landing = `/e/${ev.slug}`;
  const banner = ev.banner_doc_id ? `/api/eventos/${ev.id}/banner` : ev.banner_url;
  const tpl = LANDING_TEMPLATES.find(([k]) => k === (ev.landing_template || "clasica"));
  const hours = eventHours(ev);
  const ended = ev.end_at && new Date(ev.end_at).getTime() < Date.now();
  const sesQ = (k: number) => `/eventos/${ev.id}?sesion=${k}${fq ? "&" + fq : ""}#inscritos`;
  const SessionSelect = () => n > 1
    ? <Field label="Sesión"><select name="session" defaultValue={session} className="input">{Array.from({ length: n }, (_, i) => <option key={i} value={i + 1}>Sesión {i + 1} de {n}</option>)}</select></Field>
    : <input type="hidden" name="session" value="1" />;

  return (
    <>
      <PageHeader icon={PageIcon} title={ev.title} subtitle={`${ev.program} · ${ev.type}${n > 1 ? ` · ${n} sesiones` : ""} · ${fmtDate(ev.start_at)}${ev.end_at && ev.end_at !== ev.start_at ? ` → ${fmtDate(ev.end_at)}` : ""}`}
        actions={<>
          <Badge>{ev.active ? ev.status : "inactivo"}</Badge>
          {ev.status === "publicado" && <Link href={landing} className="btn-ghost btn-sm" target="_blank">Ver landing</Link>}
          <Link href="/eventos" className="btn-ghost btn-sm">← Volver</Link></>} />
      <Flash sp={sp} />

      {manage && (
        <div className="mb-5 flex flex-wrap gap-2">
          {ev.status !== "publicado" && <form action={A.setEventStatus}><input type="hidden" name="id" value={ev.id} /><input type="hidden" name="status" value="publicado" /><button className="btn">Publicar</button></form>}
          {ev.status === "publicado" && <form action={A.setEventStatus}><input type="hidden" name="id" value={ev.id} /><input type="hidden" name="status" value="cerrado" /><button className="btn-ghost">Cerrar</button></form>}
          {ev.status === "publicado" && <form action={A.setEventStatus}><input type="hidden" name="id" value={ev.id} /><input type="hidden" name="status" value="borrador" /><button className="btn-ghost">Volver a borrador</button></form>}
          <form action={A.duplicateEvent}><input type="hidden" name="id" value={ev.id} /><button className="btn-ghost">Duplicar como plantilla</button></form>
          <form action={A.toggleEventActive}><input type="hidden" name="id" value={ev.id} /><button className="btn-ghost">{ev.active ? "Inactivar" : "Activar"}</button></form>
          <form action={A.sendReminders}><input type="hidden" name="event_id" value={ev.id} /><button className="btn-ghost">Enviar recordatorios</button></form>
        </div>)}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          {banner && <img src={banner} alt={`Banner de ${ev.title}`} className="mb-4 max-h-56 w-full rounded-xl object-cover" />}
          {ev.summary && <p className="mb-3 font-medium text-slate-700">{ev.summary}</p>}
          <RichText text={ev.description} className="text-sm text-slate-700" />
          {!ev.description && !ev.summary && <p className="text-sm text-slate-400">Sin descripción.</p>}
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-4">
            <div><dt>Modalidad</dt><dd className="font-medium text-slate-700">{ev.modality}{ev.place ? ` · ${ev.place}` : ""}</dd></div>
            <div><dt>Sesiones</dt><dd className="font-medium text-slate-700">{n} · mínimo {minPct} %</dd></div>
            <div><dt>Intensidad</dt><dd className="font-medium text-slate-700">{hours ? `${hours} h` : "—"}</dd></div>
            <div><dt>Certificados</dt><dd className="font-medium text-slate-700">{ev.certs_auto ? "automáticos al terminar" : "solo manuales"}</dd></div>
          </dl>
        </div>
        <div className="card text-sm">
          <div className="label">Landing pública · plantilla {tpl?.[1] ?? "Clásica"}</div>
          {ev.status === "publicado" && ev.active ? (
            <div className="flex items-center gap-4">
              <img src={`/api/qr?t=${encodeURIComponent(landing)}`} alt="Código QR de la landing" width={104} height={104} />
              <div className="min-w-0"><code className="block break-all rounded bg-slate-100 px-2 py-1 text-xs">{landing}</code>
                <p className="mt-1 text-xs text-slate-400">Enlace corto: la dirección no permite adivinar otros eventos.</p></div>
            </div>
          ) : <p className="text-xs text-slate-500">La landing, el banner y el QR quedan visibles al publicar el evento.</p>}
        </div>
      </div>

      <section id="inscritos" className="scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-ink">Inscritos {totals?.inscritos ?? 0}/{ev.capacity}</h2>
            <p className="text-xs text-slate-500">{totals?.espera ?? 0} en lista de espera · {totals?.cumplen ?? 0} cumplen la asistencia mínima ({minPct} %) · {totals?.certs ?? 0} certificado(s)</p>
          </div>
          {(view || manage) && (
            <div className="flex flex-wrap gap-2 text-sm">
              <a className="btn-ghost btn-sm" href={`/api/export/inscritos/${ev.id}?fmt=xlsx${fq ? "&" + fq : ""}`}>Exportar Excel</a>
              <a className="btn-ghost btn-sm" href={`/api/export/inscritos/${ev.id}?fmt=csv${fq ? "&" + fq : ""}`}>Exportar CSV</a>
              {!pii && <span className="self-center text-xs text-slate-400">Tu rol exporta sin datos personales</span>}
            </div>)}
        </div>

        <form className="card mb-3 grid gap-2 !p-3 text-sm sm:grid-cols-2 xl:grid-cols-6" aria-label="Filtrar inscritos">
          <input type="hidden" name="sesion" value={session} />
          <label className="sm:col-span-2"><span className="sr-only">Buscar inscrito</span>
            <input type="search" name="q" defaultValue={f.q} placeholder={pii ? "Empresa, NIT, nombre, correo o código" : "Empresa, NIT o código"} className="input" /></label>
          <label><span className="sr-only">Estado</span><select name="estado" defaultValue={f.estado} className="input"><option value="">Todo estado</option>{statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></label>
          <label><span className="sr-only">Asistencia</span><select name="asistencia" defaultValue={f.asistencia} className="input">
            <option value="">Toda asistencia</option><option value="cumple">Cumple el mínimo</option><option value="parcial">Asistencia parcial</option><option value="sin">Sin asistencia</option><option value="no_cumple">No cumple</option></select></label>
          <label><span className="sr-only">Lista de espera</span><select name="espera" defaultValue={f.espera} className="input"><option value="">Con y sin lista de espera</option><option value="no">Con cupo</option><option value="si">En lista de espera</option></select></label>
          <label><span className="sr-only">Certificado</span><select name="cert" defaultValue={f.cert} className="input"><option value="">Con y sin certificado</option><option value="si">Con certificado</option><option value="no">Sin certificado</option></select></label>
          <div className="flex gap-2 sm:col-span-2 xl:col-span-6">
            <button className="btn btn-sm">Filtrar</button>
            {fq && <Link href={`/eventos/${ev.id}?sesion=${session}#inscritos`} className="btn-ghost btn-sm">Limpiar</Link>}
            <span className="self-center text-xs text-slate-500">{regs.length} resultado(s){fq ? " · la exportación aplica estos filtros" : ""}</span>
          </div>
        </form>

        {att && n > 1 && (
          <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Sesión para registrar asistencia">
            <span className="mr-1 text-xs text-slate-500">Asistencia de la</span>
            {Array.from({ length: n }, (_, i) => i + 1).map((k) => (
              <Link key={k} href={sesQ(k)} aria-current={k === session ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs ${k === session ? "bg-brand font-semibold text-white" : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"}`}>Sesión {k}</Link>))}
          </nav>)}
        <form action={A.markAttendance}>
          <input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="session" value={session} />
          <input type="hidden" name="shown" value={regs.filter((r) => !r.waitlist).map((r) => r.id).join(",")} /><input type="hidden" name="keep" value={fq} />
          <Table head={[...(att ? [n > 1 ? `Asistió S${session}` : "Asistió"] : []), "Empresa", "Participante", "Código", "Estado", "Asistencia", "Minutos", "Certificado", ""]}
            empty={fq ? "Ningún inscrito coincide con los filtros" : "Aún no hay inscritos"}>
            {regs.map((r) => (
              <tr key={r.id}>
                {att && <Td><input type="checkbox" name="present" value={r.id} defaultChecked={r.att.sessions.includes(session)} disabled={!!r.waitlist} aria-label={`Asistió ${r.razon_social}`} /></Td>}
                <Td>{r.razon_social}</Td>
                <Td>{pii ? <>{r.name}<div className="text-xs text-slate-400">{r.email}</div></> : <span className="text-slate-300">oculto</span>}</Td>
                <Td><code>{r.code}</code></Td>
                <Td><Badge>{r.status}</Badge></Td>
                <Td>{r.waitlist ? "—" : <><span className="whitespace-nowrap tabular-nums">{r.att.label}</span>{r.att.count > 0 && <div className="mt-0.5"><Badge tone={r.att.meets ? "green" : "amber"}>{r.att.meets ? "cumple" : "no cumple"}</Badge></div>}</>}</Td>
                <Td>{r.minutes || "—"}</Td>
                <Td>{r.cert ? <a className="text-brand" href={`/api/certificados/${r.cert}.pdf`} target="_blank" rel="noopener">{r.cert}</a> : "—"}</Td>
                <Td>{att && <button formAction={A.cancelRegistrationFor.bind(null, r.id)} className="text-xs text-red-500">Cancelar</button>}</Td>
              </tr>))}
          </Table>
          {att && regs.some((r) => !r.waitlist) && <button className="btn mt-2">Guardar asistencia{n > 1 ? ` de la sesión ${session}` : " masiva"}</button>}
        </form>
      </section>

      {att && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <form action={A.markAttendance} className="card space-y-2">
            <b className="text-sm">Asistencia por QR / código</b>
            <input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="mode" value="code" /><input type="hidden" name="keep" value={fq} />
            <SessionSelect />
            <Field label="Código del inscrito" hint="Escanéalo con el lector o escríbelo (p. ej. R7K2M9QX)"><input name="code" autoFocus={!!sp.ok && !!sp.sesion} autoComplete="off" className="input" required /></Field>
            <button className="btn btn-sm">Registrar</button>
          </form>
          <form action={A.uploadAttendance} className="card space-y-2">
            <b className="text-sm">Reporte de Teams / Zoom (CSV)</b>
            <input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="keep" value={fq} />
            <SessionSelect />
            <input type="file" name="file" accept=".csv,text/csv" className="block w-full text-xs" required aria-label="Archivo CSV" />
            <p className="text-xs text-slate-400">Columnas: correo y minutos (se reconocen los encabezados de Teams y Zoom). Mínimo de conexión: {ev.min_minutes} min.</p>
            <button className="btn btn-sm">Cargar</button>
          </form>
          <form action={A.issueCertificates} className="card space-y-2">
            <b className="text-sm">Certificados</b>
            <input type="hidden" name="event_id" value={ev.id} />
            <p className="text-xs text-slate-500">PDF con firma electrónica y código QR de verificación para quien cumpla {minPct} % de asistencia ({Math.ceil((minPct * n) / 100) || 1} de {n} {n === 1 ? "sesión" : "sesiones"}). Llega por correo con el enlace de descarga.</p>
            <p className="text-xs text-slate-500">{ev.certs_auto ? (ended ? "Emisión automática activa: el proceso revisa cada 10 minutos." : `Se emitirán solos al terminar el evento (${fmtDate(ev.end_at)}).`) : "Emisión automática desactivada para este evento."}</p>
            <button className="btn btn-sm">Emitir certificados ahora</button>
          </form>
        </div>)}

      <h2 className="mb-2 mt-8 font-semibold text-ink">Evidencias (se almacenan en OnBase)</h2>
      <Table head={["Archivo", "Tipo", "Referencia OnBase", "Estado", "Subido por", "Fecha"]} empty="Sin evidencias">
        {docs.map((d) => <tr key={d.id}><Td><a className="text-brand" href={`/api/docs/${d.id}`}>{d.name}</a></Td><Td>{d.kind}</Td><Td><code>{d.onbase_ref}</code></Td><Td><Badge>{d.onbase_status}</Badge></Td><Td>{d.uploader}</Td><Td>{fmtDate(d.created_at)}</Td></tr>)}
      </Table>
      {(manage || att) && (
        <form action={A.uploadEvidence} className="card mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="event_id" value={ev.id} />
          <Field label="Archivo (≤20 MB)"><input type="file" name="file" required className="text-xs" /></Field>
          <Field label="Tipo"><select name="kind" className="input"><option>foto</option><option>lista</option><option>acta</option><option>presentación</option></select></Field>
          <button className="btn">Subir evidencia</button>
        </form>)}

      {manage && (
        <details className="card mt-8" open={!!sp.editar}>
          <summary className="cursor-pointer font-semibold text-ink">Editar datos del evento</summary>
          <form action={A.saveEvent} className="mt-4 grid gap-3 md:grid-cols-4">
            <input type="hidden" name="id" value={ev.id} />
            <EventFields ev={ev} hours={storedHours(ev.id)} />
            <div className="md:col-span-4"><button className="btn">Guardar cambios</button></div>
          </form>
        </details>)}
    </>
  );
}
