import { ExportButtons } from "@/components/ana-export";
import Link from "next/link";
import { CalendarDays, Clock, List, CalendarClock as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, companyFilter, programScope, requireUser, requirePerm, sessionFilter } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader, Table, Td } from "@/components/ui";
import { Calendar, calendarRange, readCalendarParams, type CalendarItem } from "@/components/calendar";
import { fmtDate } from "@/lib/util";
import { m365Mode } from "@/lib/integrations/m365";
import { companySchedule, scheduleSession } from "./actions";
import * as L from "./agenda-lib";

const STATUS_COLOR = (s: any) => s.status === "cancelada" ? "#dc2626" : s.status === "realizada" ? (s.topics && s.accepted_at ? "#059669" : "#d97706") : "#2563eb";
const SLOT_COLOR = "#14b8a6";
const slotLabel = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Agenda({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "sessions.view");
  const sp = await searchParams;
  const tab = sp.tab === "calendario" ? "calendario" : "lista";
  const f = sessionFilter(u);
  const where = [f.sql]; const p: any[] = [...f.params];
  if (sp.mentor) { where.push("s.mentor_id=?"); p.push(Number(sp.mentor)); }
  if (sp.empresa) { where.push("s.company_id=?"); p.push(Number(sp.empresa)); }
  if (sp.programa) { where.push("s.program_id=?"); p.push(Number(sp.programa)); }
  if (sp.estado) { where.push("s.status=?"); p.push(sp.estado); }
  const SELECT = `SELECT s.*, c.razon_social, m.name mentor, pr.name program FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id LEFT JOIN users m ON m.id=s.mentor_id LEFT JOIN programs pr ON pr.id=s.program_id`;

  // Filtros disponibles según el alcance
  const cf = companyFilter(u);
  const companies = all<any>(`SELECT c.id,c.razon_social FROM companies c WHERE c.status='activa' AND ${cf.sql} ORDER BY c.razon_social`, ...cf.params);
  const mentors = all<any>(`SELECT DISTINCT m.id,m.name FROM mentoring_sessions s JOIN users m ON m.id=s.mentor_id WHERE ${f.sql} ORDER BY m.name`, ...f.params);
  const scope = programScope(u, "sessions.view");
  const programs = scope === null ? all<any>("SELECT id,name FROM programs ORDER BY name")
    : all<any>(`SELECT DISTINCT pr.id, pr.name FROM programs pr WHERE pr.id IN (${scope.map(() => "?").join(",") || "NULL"}) OR pr.id IN (SELECT s.program_id FROM mentoring_sessions s WHERE ${f.sql}) ORDER BY pr.name`, ...scope, ...f.params);

  const canSchedule = can(u, "sessions.schedule");
  const isCompany = !!u.company_id;
  const managed = L.manageableMentors(u);
  const isMentor = managed.some((m) => m.id === u.id);

  // Lista
  let rows: any[] = [];
  if (tab === "lista") {
    const w = [...where], q = [...p];
    if (sp.desde) { w.push("s.scheduled_at>=?"); q.push(new Date(sp.desde + "T00:00:00-05:00").toISOString()); }
    if (sp.hasta) { w.push("s.scheduled_at<=?"); q.push(new Date(sp.hasta + "T23:59:59-05:00").toISOString()); }
    rows = all<any>(`${SELECT} WHERE ${w.join(" AND ")} ORDER BY s.scheduled_at DESC`, ...q);
  }

  // Calendario: sesiones del rango visible + franjas disponibles del/los mentor(es) pertinentes
  const cal = readCalendarParams(sp);
  let items: CalendarItem[] = [];
  let slotMentors: { id: number; name: string }[] = [];
  if (tab === "calendario") {
    const r = calendarRange(cal.view, cal.date);
    items = all<any>(`${SELECT} WHERE ${where.join(" AND ")} AND s.scheduled_at>=? AND s.scheduled_at<? ORDER BY s.scheduled_at`, ...p, r.from, r.to).map((s) => ({
      id: `s${s.id}`, title: `${s.status === "cancelada" ? "Cancelada · " : ""}${s.title}`, start: s.scheduled_at, end: L.endIso(s.scheduled_at, s.duration_min || 60),
      href: `/agenda/${s.id}`, color: STATUS_COLOR(s), subtitle: isCompany ? `${s.mentor} · ${s.modality}` : `${s.razon_social} · ${s.mentor} · ${s.status}`,
    }));
    if (sp.mentor) slotMentors = all<any>("SELECT id,name FROM users WHERE id=?", Number(sp.mentor)).filter((m) => isCompany ? L.companyMentors(u.company_id!).some((x) => x.id === m.id) : true);
    else if (isCompany) slotMentors = [...new Map(L.companyMentors(u.company_id!).map((m) => [m.id, m])).values()];
    else if (isMentor) slotMentors = [{ id: u.id, name: u.name }];
    const fromDate = L.bog(r.from).date, toDate = L.bog(r.to).date, today = L.todayBog();
    for (const m of slotMentors) {
      const av = L.availability(m.id);
      for (let d = fromDate < today ? today : fromDate; d < toDate; d = L.addDays(d, 1)) {
        const wd = L.bog(L.bogIso(d, "12:00")).wd;
        for (const sl of av.filter((x) => x.weekday === wd)) {
          const start = L.bogIso(d, sl.start_time);
          items.push({ id: `a${sl.id}-${d}`, title: slotMentors.length > 1 || !isMentor ? `Disponible · ${m.name}` : "Disponible", start, end: L.bogIso(d, sl.end_time),
            color: SLOT_COLOR, subtitle: `Franja ${sl.start_time}–${sl.end_time} · ${sl.modality}`, href: isCompany ? `/agenda?pick_mentor=${m.id}&dia=${d}#programar` : undefined });
        }
      }
    }
  }

  // Programación por la empresa: franjas libres de sus mentores
  const myMentors = isCompany ? L.companyMentors(u.company_id!) : [];
  const offer = myMentors.map((m) => ({ ...m, slots: L.freeSlots(m.id, { days: 21 }).filter((x) => !sp.dia || sp.pick_mentor != m.id || x.date === sp.dia) }));

  // Programación interna
  const allMentors = can(u, "mentors.assign") || can(u, "config.manage") ? all<any>("SELECT DISTINCT u.id,u.name FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.key='mentor' AND u.status='activo' ORDER BY u.name") : [];
  const refs = canSchedule ? all<any>(`SELECT r.id, c.razon_social, sv.name FROM referrals r JOIN companies c ON c.id=r.company_id JOIN servicios sv ON sv.id=r.servicio_id
    WHERE r.status IN ('aceptada','en curso') AND (r.mentor_id=? OR ?)`, u.id, can(u, "mentors.assign") ? 1 : 0) : [];
  const myFree = canSchedule && isMentor ? L.freeSlots(u.id, { days: 14 }).slice(0, 10) : [];

  const qs = (extra: Record<string, string>) => { const x = new URLSearchParams(); for (const k of ["mentor", "empresa", "programa", "estado", "desde", "hasta"]) if (sp[k]) x.set(k, sp[k]); for (const [k, v] of Object.entries(extra)) x.set(k, v); return "/agenda?" + x.toString(); };

  return (
    <>
      <PageHeader icon={PageIcon} title="Agenda y mentorías" subtitle={`Programación, calendario, seguimiento y aceptación de sesiones · Outlook: ${m365Mode()}`}
        actions={<>{managed.length > 0 && <Link href="/disponibilidad" className="btn-ghost btn-sm"><Clock size={14} className="mr-1 inline" />{isMentor && managed.length === 1 ? "Mi disponibilidad" : "Disponibilidad de mentores"}</Link>}
          {can(u, "analytics.view") && <ExportButtons compact href="/api/analitica/consulta?fuente=sesiones" />}</>} />
      <Flash sp={sp} />

      <div className="mb-3 flex gap-1 border-b border-slate-200" role="tablist">
        {([["lista", "Lista", List], ["calendario", "Calendario", CalendarDays]] as const).map(([k, l, I]) => (
          <Link key={k} href={qs({ tab: k })} role="tab" aria-selected={tab === k}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}><I size={15} />{l}</Link>))}
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" aria-label="Filtros de la agenda">
        <input type="hidden" name="tab" value={tab} />
        {tab === "calendario" && <><input type="hidden" name="cal" value={cal.view} /><input type="hidden" name="fecha" value={cal.date} /></>}
        {!isCompany && <label className="sr-only" htmlFor="f-mentor">Mentor</label>}
        {!isCompany && <select id="f-mentor" name="mentor" defaultValue={sp.mentor || ""} className="input !w-auto"><option value="">Todos los mentores</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
        {!isCompany && <select aria-label="Empresa" name="empresa" defaultValue={sp.empresa || ""} className="input !w-auto"><option value="">Todas las empresas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select>}
        {!isCompany && programs.length > 0 && <select aria-label="Programa" name="programa" defaultValue={sp.programa || ""} className="input !w-auto"><option value="">Todos los programas</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        {isCompany && myMentors.length > 1 && <select aria-label="Mentor" name="mentor" defaultValue={sp.mentor || ""} className="input !w-auto"><option value="">Todos mis mentores</option>{[...new Map(myMentors.map((m) => [m.id, m])).values()].map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
        <select aria-label="Estado" name="estado" defaultValue={sp.estado || ""} className="input !w-auto"><option value="">Todos los estados</option><option>programada</option><option>realizada</option><option>cancelada</option></select>
        {tab === "lista" && <><input aria-label="Desde" type="date" name="desde" defaultValue={sp.desde} className="input !w-auto" /><input aria-label="Hasta" type="date" name="hasta" defaultValue={sp.hasta} className="input !w-auto" /></>}
        <button className="btn-ghost">Consultar</button>
        {(sp.mentor || sp.empresa || sp.programa || sp.estado || sp.desde || sp.hasta) && <Link href={`/agenda?tab=${tab}`} className="text-xs text-slate-500 underline">Limpiar</Link>}
      </form>

      {tab === "lista" ? (
        <Table head={["Fecha", "Sesión", "Empresa", "Mentor", "Programa", "Estado", "Seguimiento", "Aceptación"]} empty="No hay sesiones con estos filtros">
          {rows.map((s) => (
            <tr key={s.id}>
              <Td>{fmtDate(s.scheduled_at)}</Td><Td><Link className="text-brand" href={`/agenda/${s.id}`}>{s.title}</Link><div className="text-xs text-slate-400">{s.modality} · {s.duration_min} min</div></Td>
              <Td>{s.razon_social}</Td><Td>{s.mentor}</Td><Td className="text-xs">{s.program}</Td><Td><Badge>{s.status}</Badge></Td>
              <Td>{s.status === "realizada" ? (s.topics ? <Badge tone="green">registrado</Badge> : <Badge tone="amber">pendiente</Badge>) : "—"}</Td>
              <Td>{s.accepted_at ? <Badge tone="green">aceptada</Badge> : s.status === "realizada" ? <Badge tone="amber">por aceptar</Badge> : "—"}</Td>
            </tr>))}
        </Table>
      ) : (
        <>
          {!slotMentors.length && !isCompany && <p className="mb-2 text-xs text-slate-500">Elige un mentor en los filtros para ver también sus franjas disponibles.</p>}
          <Calendar view={cal.view} date={cal.date} items={items} baseHref={qs({ tab: "calendario" })} emptyText="No hay sesiones ni franjas disponibles en este periodo." />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500" aria-label="Convenciones">
            {[["#2563eb", "Programada"], ["#059669", "Realizada y aceptada"], ["#d97706", "Realizada: falta seguimiento o aceptación"], ["#dc2626", "Cancelada"], [SLOT_COLOR, "Franja disponible del mentor"]].map(([c, l]) =>
              <span key={l} className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />{l}</span>)}
          </div>
        </>
      )}

      {isCompany && (
        <section id="programar" className="card mt-6">
          <h2 className="font-semibold text-ink">Programar una sesión con mi mentor</h2>
          {!myMentors.length ? <p className="mt-1 text-sm text-slate-500">Aún no tienes mentor asignado ni servicios remitidos aceptados. Cuando los tengas, aquí verás sus franjas disponibles.</p>
            : !offer.some((m) => m.slots.length) ? <p className="mt-1 text-sm text-slate-500">Tus mentores no tienen franjas libres en las próximas tres semanas. Escríbeles o vuelve a consultar más tarde.</p>
            : (
            <form action={companySchedule} className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2"><Field label="Franja disponible (hora Colombia, 60 min)" hint="Solo se muestran franjas libres de la disponibilidad de tu mentor">
                <select name="pick" required className="input" defaultValue="">
                  <option value="" disabled>Elige mentor y franja…</option>
                  {offer.filter((m) => m.slots.length).map((m) => (
                    <optgroup key={`${m.id}-${m.referral_id ?? 0}`} label={`${m.name} · ${m.via}`}>
                      {m.slots.map((x) => <option key={x.start} value={`${m.id}:${m.referral_id ?? ""}|${x.start}`}>{slotLabel(x.start)} · {x.modality}</option>)}
                    </optgroup>))}
                </select></Field></div>
              <Field label="Tema"><input name="title" placeholder="Sesión de mentoría" maxLength={120} className="input" /></Field>
              <Field label="Modalidad" hint="Aplica si la franja admite ambas"><select name="modality" className="input"><option>virtual</option><option>presencial</option></select></Field>
              <div className="md:col-span-4 flex items-center gap-3"><button className="btn">Programar sesión</button><span className="text-xs text-slate-500">Tú y tu mentor recibirán la invitación de calendario (.ics).</span></div>
            </form>)}
        </section>
      )}

      {canSchedule && (
        <form action={scheduleSession} className="card mt-6 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-4">
            <div className="font-semibold text-ink">Programar sesión</div>
            <p className="text-xs text-slate-500">Un cruce con otra sesión del mentor se bloquea. Fuera de la disponibilidad registrada se programa con advertencia. Los participantes reciben la invitación (.ics) y el evento se refleja en Outlook ({m365Mode()}).</p>
          </div>
          <Field label="Empresa"><select name="company_id" className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></Field>
          {allMentors.length > 0 && <Field label="Mentor"><select name="mentor_id" className="input" defaultValue={isMentor ? u.id : undefined}>{allMentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
          <Field label="Servicio remitido (opcional)"><select name="referral_id" className="input"><option value="">—</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.razon_social} · {r.name}</option>)}</select></Field>
          <Field label="Tema"><input name="title" placeholder="Sesión de mentoría" maxLength={120} className="input" /></Field>
          <Field label="Fecha y hora (Colombia)"><input type="datetime-local" name="scheduled_at" required className="input" /></Field>
          <Field label="Duración (min)"><input type="number" name="duration" defaultValue={60} min={15} max={480} step={15} className="input" /></Field>
          <Field label="Modalidad"><select name="modality" className="input"><option>virtual</option><option>presencial</option></select></Field>
          <div className="self-end"><button className="btn">Programar</button></div>
          {myFree.length > 0 && <div className="md:col-span-4 text-xs text-slate-500">Tus próximas franjas libres: {myFree.map((x) => <span key={x.start} className="mr-1 inline-block rounded border border-dashed border-teal-400 bg-teal-50 px-1.5 py-0.5 text-teal-800">{slotLabel(x.start)}</span>)}</div>}
          {isMentor && !L.availability(u.id).length && <div className="md:col-span-4"><Notice kind="warn">No has registrado tu disponibilidad semanal: las empresas no podrán agendar contigo. <Link href="/disponibilidad" className="underline">Regístrala aquí</Link>.</Notice></div>}
        </form>)}
    </>
  );
}
