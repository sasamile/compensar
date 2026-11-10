import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2, Clock, CheckCircle2, CalendarDays, AlertTriangle, ArrowRight, UserRound, Route, Stethoscope, CalendarClock, MessagesSquare, Ticket, ShieldCheck, Home as PageIcon } from "lucide-react";
import { all, get, setting } from "@/lib/db";
import { can, companyFilter, requireUser, sessionFilter, type User } from "@/lib/auth";
import { Badge, EmptyState, Notice, PageHeader, Section, Stat, Table, Td } from "@/components/ui";
import { Donut, LineChart, Progress } from "@/components/charts";
import { fmtDate } from "@/lib/util";

const n = (sql: string, ...p: any[]) => get<any>(sql, ...p)?.n ?? 0;
const greeting = () => { const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false })); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; };

export default async function Home() {
  const u = await requireUser();
  return u.company_id ? <CompanyHome u={u} /> : <StaffHome u={u} />;
}

/* ---------------- Empresa ---------------- */
async function CompanyHome({ u }: { u: User }) {
  const c = get<any>("SELECT c.*, p.name program FROM companies c JOIN programs p ON p.id=c.program_id WHERE c.id=?", u.company_id);
  if (c.status === "pendiente")
    return (<>
      <PageHeader eyebrow={c.program} title={c.razon_social} subtitle="Registro recibido" />
      <div className="card max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <h2 className="font-semibold text-ink">Tu empresa está pendiente de activación</h2>
            <p className="mt-1 text-sm text-slate-600">Compensar validará los requisitos del programa y te avisará por correo, SMS y WhatsApp. Mientras tanto no puedes inscribirte a servicios.</p>
            <ol className="mt-4 space-y-2 text-sm">
              {["Registro recibido", "Validación de requisitos por Compensar", "Activación y primer ingreso"].map((s, i) => (
                <li key={s} className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-emerald-500 text-white" : i === 1 ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1}</span>{s}</li>))}
            </ol>
            <Link href="/validacion/solicitudes" className="btn mt-5">Ver el estado de mi solicitud</Link>
          </div>
        </div>
      </div>
    </>);
  if (c.status === "suspendida")
    return (<><PageHeader icon={PageIcon} title={c.razon_social} /><Notice kind="error">Tu empresa está suspendida. Comunícate con tu asesor.</Notice></>);
  if (!c.onboarding_done) redirect("/onboarding");

  const items = all<any>("SELECT * FROM company_items WHERE company_id=? ORDER BY id DESC LIMIT 6", c.id);
  const s = sessionFilter(u);
  const upcoming = all<any>(`SELECT s.*, m.name mentor FROM mentoring_sessions s LEFT JOIN users m ON m.id=s.mentor_id WHERE ${s.sql} AND s.status='programada' AND s.scheduled_at>=? ORDER BY s.scheduled_at LIMIT 4`, ...s.params, new Date().toISOString());
  const toAccept = all<any>(`SELECT s.id, s.title, s.scheduled_at FROM mentoring_sessions s WHERE ${s.sql} AND s.status='realizada' AND s.accepted_at IS NULL AND s.topics IS NOT NULL`, ...s.params);
  const refsToAccept = n("SELECT COUNT(*) n FROM referrals WHERE company_id=? AND status='enviada'", c.id);
  const events = all<any>("SELECT * FROM events WHERE status='publicado' AND active=1 AND start_at>? ORDER BY start_at LIMIT 3", new Date().toISOString());
  const mentor = get<any>("SELECT u.name, u.email FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=? AND a.active=1", c.id);
  const route = get<any>("SELECT * FROM company_routes WHERE company_id=? AND status='activa' ORDER BY id DESC LIMIT 1", c.id);
  const steps = route ? all<any>("SELECT status FROM company_route_steps WHERE company_route_id=?", route.id) : [];
  const pct = steps.length ? Math.round((steps.filter((x) => x.status === "completado").length / steps.length) * 100) : 0;
  const diag = get<any>("SELECT * FROM diagnostics WHERE company_id=? AND status='completado' ORDER BY id DESC LIMIT 1", c.id);
  const unreadMsgs = n("SELECT COUNT(*) n FROM messages WHERE company_id=? AND from_user_id NOT IN (SELECT id FROM users WHERE company_id=?) AND read_at IS NULL", c.id, c.id);

  return (
    <>
      <PageHeader eyebrow={`${greeting()}, ${u.name.split(" ")[0]}`} title={c.razon_social} subtitle={setting("welcome_text")}
        actions={<>
          <Link href="/agenda" className="btn-ghost"><CalendarClock />Mis sesiones</Link>
          <Link href="/catalogo" className="btn"><Ticket />Ver oferta y eventos</Link>
        </>} />

      {(toAccept.length > 0 || refsToAccept > 0) && (
        <Notice kind="warn">
          {toAccept.length > 0 && <div>Tienes <b>{toAccept.length}</b> sesión(es) realizada(s) por aceptar: {toAccept.slice(0, 3).map((x) => <Link key={x.id} className="font-medium underline" href={`/agenda/${x.id}`}>{x.title}</Link>).reduce((a: any[], b, i) => (i ? [...a, ", ", b] : [b]), [])}.</div>}
          {refsToAccept > 0 && <div>Tienes <b>{refsToAccept}</b> remisión(es) a servicios por aceptar. <Link href="/remisiones" className="font-medium underline">Revisar</Link></div>}
        </Notice>)}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={UserRound} label="Mi mentor" value={<span className="text-base">{mentor?.name || "Por asignar"}</span>} hint={mentor?.email} />
        <Stat icon={Route} tone="violet" label="Avance de mi ruta" value={route ? `${pct}%` : "—"} hint={route ? <Progress value={pct} /> : "Aún sin ruta activa"} />
        <Stat icon={Stethoscope} tone="green" label="Diagnóstico" value={diag ? <span className="text-base">{diag.level}</span> : "—"} hint={diag ? `Puntaje ${Math.round(diag.score)} / 100` : <Link className="text-brand" href="/diagnosticos">Hacer autodiagnóstico</Link>} />
        <Stat icon={MessagesSquare} tone="amber" label="Mensajes sin leer" value={unreadMsgs} hint={<Link className="text-brand" href="/mensajes">Abrir mensajes</Link>} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section icon={CalendarClock} title="Próximas sesiones" actions={<Link href="/agenda" className="text-sm text-brand">Ver agenda →</Link>}>
            {upcoming.length ? (
              <div className="space-y-2">{upcoming.map((x) => (
                <Link key={x.id} href={`/agenda/${x.id}`} className="card card-link flex items-center gap-4 !p-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-center leading-none text-brand">
                    <div><div className="text-lg font-bold">{new Date(x.scheduled_at).toLocaleDateString("es-CO", { day: "2-digit", timeZone: "America/Bogota" })}</div><div className="text-[10px] uppercase">{new Date(x.scheduled_at).toLocaleDateString("es-CO", { month: "short", timeZone: "America/Bogota" })}</div></div>
                  </div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{x.title}</div><div className="text-xs text-slate-500">{fmtDate(x.scheduled_at)} · {x.modality} · {x.mentor}</div></div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>))}</div>
            ) : <EmptyState title="Sin sesiones próximas">Tu mentor programará las sesiones de acompañamiento.</EmptyState>}
          </Section>
          <Section icon={Route} title="Mis servicios, rutas y cursos">
            <Table head={["Tipo", "Asignado", "Estado"]} empty="Aún no tienes servicios asignados">
              {items.map((i) => <tr key={i.id}><Td className="capitalize">{i.kind}</Td><Td className="font-medium">{i.label}</Td><Td><Badge>{i.status}</Badge></Td></tr>)}
            </Table>
          </Section>
        </div>
        <div>
          <Section icon={CalendarDays} title="Próximos eventos" actions={<Link href="/catalogo" className="text-sm text-brand">Ver todos →</Link>}>
            <div className="space-y-2">
              {events.length ? events.map((e) => (
                <Link key={e.id} href={`/e/${e.slug}`} className="card card-link block !p-4">
                  <Badge tone="blue">{e.type}</Badge>
                  <div className="mt-2 font-medium text-ink">{e.title}</div>
                  <div className="text-xs text-slate-500">{fmtDate(e.start_at)} · {e.modality}</div>
                </Link>)) : <EmptyState title="Sin eventos próximos" />}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

/* ---------------- Equipo interno y aliados ---------------- */
async function StaffHome({ u }: { u: User }) {
  const f = companyFilter(u);
  const byStatus = all<any>(`SELECT c.status, COUNT(*) n FROM companies c WHERE ${f.sql} GROUP BY c.status`, ...f.params);
  const cnt = (st: string) => byStatus.find((x) => x.status === st)?.n ?? 0;
  const sf = sessionFilter(u);
  const sesTot = n(`SELECT COUNT(*) n FROM mentoring_sessions s WHERE ${sf.sql}`, ...sf.params);
  const sesAcc = n(`SELECT COUNT(*) n FROM mentoring_sessions s WHERE s.accepted_at IS NOT NULL AND ${sf.sql}`, ...sf.params);
  const sinSeg = n(`SELECT COUNT(*) n FROM mentoring_sessions s WHERE s.status='programada' AND s.scheduled_at < ? AND ${sf.sql}`, new Date().toISOString(), ...sf.params);
  const porAceptar = n(`SELECT COUNT(*) n FROM mentoring_sessions s WHERE s.status='realizada' AND s.accepted_at IS NULL AND ${sf.sql}`, ...sf.params);
  const alertas = can(u, "alerts.view") ? n("SELECT COUNT(*) n FROM alerts WHERE status='abierta'") : null;
  const validacion = can(u, "validation.manage") ? n("SELECT COUNT(*) n FROM validation_cases WHERE status IN ('pendiente','en_revision')") : null;
  const months: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), to = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
    months.push({ label: d.toLocaleDateString("es-CO", { month: "short" }), value: n(`SELECT COUNT(*) n FROM mentoring_sessions s WHERE s.status='realizada' AND s.scheduled_at>=? AND s.scheduled_at<? AND ${sf.sql}`, from, to, ...sf.params) });
  }
  const ses = all<any>(`SELECT s.*, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id WHERE ${sf.sql} AND s.status!='cancelada' ORDER BY ABS(julianday(s.scheduled_at)-julianday('now')) LIMIT 6`, ...sf.params);
  const showEvents = can(u, "events.manage") || can(u, "registrations.view") || can(u, "attendance.manage");
  const events = showEvents ? all<any>(`SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.waitlist=0) taken FROM events e WHERE e.status='publicado' AND e.active=1 AND e.start_at>? ORDER BY e.start_at LIMIT 4`, new Date().toISOString()) : [];
  const quick: [string, string, boolean][] = [
    ["/empresas/cargue", "Cargue masivo de empresas", can(u, "companies.activate")],
    ["/eventos", "Crear evento o curso", can(u, "events.manage")],
    ["/agenda", "Programar sesión", can(u, "sessions.schedule")],
    ["/remisiones", "Remitir a un aliado", can(u, "referrals.create") || can(u, "referrals.assign")],
    ["/validacion", "Bandeja de validación", can(u, "validation.manage")],
    ["/pagos", "Soporte de pagos", can(u, "payments.view")],
    ["/reportes", "Descargar reportes", u.grants.some((g) => g.perms.includes("*") || g.perms.some((p) => p.startsWith("report:")))],
    ["/auditoria", "Consultar auditoría", can(u, "audit.view")],
  ];
  return (
    <>
      <PageHeader eyebrow={u.grants.map((g) => g.role_name).filter((v, i, a) => a.indexOf(v) === i).join(" · ")} title={`${greeting()}, ${u.name.split(" ")[0]}`} subtitle="Este es el estado de la operación dentro de tu alcance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label="Empresas activas" value={cnt("activa")} hint={`${cnt("pendiente")} pendientes de activación`} />
        <Stat icon={CheckCircle2} label={`Sesiones realizadas en ${months[4].label}`} value={months[4].value}
          trend={months[3].value ? ((months[4].value - months[3].value) / months[3].value) * 100 : null}
          hint={`Frente a ${months[3].label} · este mes van ${months[5].value} · ${sesAcc} de ${sesTot} aceptadas`} />
        <Stat icon={Clock} tone="amber" label="Por aceptar de la empresa" value={porAceptar} hint={sinSeg ? `${sinSeg} vencidas sin seguimiento` : "Sin sesiones vencidas"} />
        {alertas !== null ? <Stat icon={AlertTriangle} tone="red" label="Alertas abiertas" value={alertas} hint={<Link href="/seguimiento" className="text-brand">Ver semáforo</Link>} />
          : validacion !== null ? <Stat icon={ShieldCheck} tone="violet" label="Validaciones pendientes" value={validacion} hint={<Link href="/validacion" className="text-brand">Abrir bandeja</Link>} />
          : <Stat icon={CalendarDays} tone="violet" label="Eventos publicados" value={n("SELECT COUNT(*) n FROM events WHERE status='publicado' AND active=1")} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-ink">Sesiones realizadas por mes</h2><span className="text-xs text-slate-400">Últimos 6 meses</span></div>
          <LineChart series={[{ label: "Sesiones realizadas", points: months.map((m) => ({ x: m.label, y: m.value })) }]} height={220} />
        </div>
        <div className="card">
          <h2 className="mb-4 font-semibold text-ink">Empresas por estado</h2>
          <Donut label="Empresas por estado" data={[{ label: "Activas", value: cnt("activa"), color: "#16a34a" }, { label: "Pendientes", value: cnt("pendiente"), color: "#f59e0b" }, { label: "Suspendidas", value: cnt("suspendida"), color: "#dc2626" }]} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section icon={CalendarClock} title="Sesiones cercanas" actions={<Link href="/agenda" className="text-sm text-brand">Abrir agenda →</Link>}>
            <Table head={["Fecha", "Empresa", "Sesión", "Estado", "Aceptación"]} empty="Sin sesiones en tu alcance">
              {ses.map((s) => <tr key={s.id}><Td className="whitespace-nowrap">{fmtDate(s.scheduled_at)}</Td><Td>{s.razon_social}</Td>
                <Td><Link className="font-medium text-brand" href={`/agenda/${s.id}`}>{s.title}</Link></Td><Td><Badge>{s.status}</Badge></Td>
                <Td>{s.accepted_at ? <Badge tone="green">aceptada</Badge> : <span className="text-slate-300">—</span>}</Td></tr>)}
            </Table>
          </Section>
          {events.length > 0 && (
            <Section icon={CalendarDays} title="Próximos eventos" actions={<Link href="/eventos" className="text-sm text-brand">Gestionar →</Link>}>
              <div className="grid gap-3 sm:grid-cols-2">{events.map((e) => (
                <Link key={e.id} href={`/eventos/${e.id}`} className="card card-link !p-4">
                  <div className="flex items-center justify-between"><Badge tone="blue">{e.type}</Badge><span className="text-xs text-slate-500">{e.taken}/{e.capacity} cupos</span></div>
                  <div className="mt-2 font-medium text-ink">{e.title}</div><div className="text-xs text-slate-500">{fmtDate(e.start_at)}</div>
                  <div className="mt-2"><Progress value={e.taken} max={e.capacity} /></div>
                </Link>))}</div>
            </Section>)}
        </div>
        <Section icon={ArrowRight} title="Accesos rápidos">
          <div className="card divide-y divide-slate-100 !p-0">
            {quick.filter((q) => q[2]).map(([href, label]) => (
              <Link key={href} href={href} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50">{label}<ArrowRight className="h-4 w-4 text-slate-400" /></Link>))}
          </div>
        </Section>
      </div>
    </>
  );
}
