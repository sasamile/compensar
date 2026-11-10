import Link from "next/link";
import { AlertTriangle, Building2, CalendarClock, FileSpreadsheet, ListChecks, Play, Share2 } from "lucide-react";
import { all, get } from "@/lib/db";
import { can, companyFilter, requirePerm, requireUser, type User } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader, Section, Stat, Table, Tabs, Td } from "@/components/ui";
import { Donut, Progress, Semaforo } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { ALERT_CHANNELS, companyLights, ENTITY_LABEL, OWNER_ROLES, RULES } from "@/lib/alerts";
import { compliance } from "@/lib/indicators";
import { alertFilter } from "./scope";
import * as A from "./actions";

const COLOR_LABEL: Record<string, string> = { roja: "Rojo", amarilla: "Amarillo", verde: "Verde" };

/** Estado consolidado por empresa (FUN-87): sesiones, remisiones, ruta, tareas, indicadores, última actividad y semáforo. */
function companyStatus(u: User, programId?: number) {
  const cf = companyFilter(u, "c");
  const ts = new Date().toISOString();
  const lights = companyLights();
  const cs = all<any>(`SELECT c.id, c.razon_social, c.program_id, p.name program,
      (SELECT us.name FROM mentor_assignments ma JOIN users us ON us.id=ma.mentor_id WHERE ma.company_id=c.id AND ma.active=1 ORDER BY ma.id DESC LIMIT 1) mentor,
      (SELECT ma.mentor_id FROM mentor_assignments ma WHERE ma.company_id=c.id AND ma.active=1 ORDER BY ma.id DESC LIMIT 1) mentor_id
    FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.status='activa' AND ${cf.sql} ${programId ? "AND c.program_id=?" : ""} ORDER BY c.razon_social`,
    ...cf.params, ...(programId ? [programId] : []));
  return cs.map((c) => {
    const s = get<any>(`SELECT SUM(status='realizada') done, SUM(status='programada' AND scheduled_at>=?) next, SUM(status='programada' AND scheduled_at<?) overdue,
        SUM(status='realizada' AND topics IS NOT NULL AND accepted_at IS NULL) to_accept, MAX(CASE WHEN status='realizada' THEN scheduled_at END) last_session,
        MIN(CASE WHEN status='programada' AND scheduled_at>=? THEN scheduled_at END) next_at FROM mentoring_sessions WHERE company_id=?`, ts, ts, ts, c.id) ?? {};
    const r = get<any>(`SELECT SUM(status IN ('enviada','aceptada','en curso')) open, SUM(status='cerrada') closed FROM referrals WHERE company_id=?`, c.id) ?? {};
    const route = get<any>("SELECT * FROM company_routes WHERE company_id=? AND status='activa' ORDER BY id DESC LIMIT 1", c.id);
    const steps = route ? get<any>("SELECT COUNT(*) n, SUM(status='completado') done, SUM(status!='completado' AND due_at<?) late FROM company_route_steps WHERE company_route_id=?", ts, route.id) : null;
    const t = get<any>("SELECT SUM(status!='hecha') open, SUM(status!='hecha' AND due_at<?) late FROM tasks WHERE company_id=?", ts, c.id) ?? {};
    const inds = all<any>("SELECT baseline, goal, final FROM indicators WHERE company_id=?", c.id).map((i) => compliance(i.baseline, i.goal, i.final)).filter((x) => x != null) as number[];
    const al = get<any>("SELECT SUM(severity='roja') red, SUM(severity='amarilla') yellow FROM alerts WHERE company_id=? AND status='abierta'", c.id) ?? {};
    return {
      ...c, ses: s, ref: r, route, steps, tasks: t, indPct: inds.length ? Math.round(inds.reduce((a, b) => a + b, 0) / inds.length) : null, nInd: inds.length,
      red: al.red ?? 0, yellow: al.yellow ?? 0, light: (lights.get(c.id) ?? "verde") as "roja" | "amarilla" | "verde",
    };
  });
}

export default async function Seguimiento({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "alerts.view");
  const sp = await searchParams;
  const manage = can(u, "alerts.manage");
  const tab = ["semaforo", "alertas", "reglas"].includes(sp.tab) && (sp.tab !== "reglas" || manage) ? sp.tab : "estado";
  const tabs: [string, string][] = [["estado", "Estado general"], ["semaforo", "Semáforo de empresas"], ["alertas", "Alertas"]];
  if (manage) tabs.push(["reglas", "Reglas de alerta"]);
  const lastRun = get<any>("SELECT ts, after FROM audit_log WHERE action='ejecutar_alertas' ORDER BY id DESC LIMIT 1");
  return (
    <>
      <PageHeader eyebrow="Coordinación" title="Seguimiento, alertas y operación"
        subtitle="Una sola vista del estado de procesos y planes de trabajo por programa, mentor y empresa, con alertas automáticas por reglas."
        actions={<>
          <a className="btn-ghost btn-sm" href="/api/operacion/alertas"><FileSpreadsheet className="h-4 w-4" />Alertas (Excel)</a>
          {manage && <form action={A.runAlertsNow}><input type="hidden" name="tab" value={tab} /><button className="btn btn-sm"><Play className="h-4 w-4" />Ejecutar alertas ahora</button></form>}
        </>} />
      <Flash sp={sp} />
      {lastRun && <p className="-mt-3 mb-4 text-xs text-slate-500">Última evaluación de reglas: {fmtDate(lastRun.ts)} · el proceso automático corre cada hora.</p>}
      <Tabs tabs={tabs} active={tab} base="/seguimiento" />
      {tab === "estado" && <Estado u={u} sp={sp} />}
      {tab === "semaforo" && <SemaforoTab u={u} sp={sp} />}
      {tab === "alertas" && <Alertas u={u} sp={sp} />}
      {tab === "reglas" && <Reglas />}
    </>
  );
}

function ProgramFilter({ sp, tab, extra }: { sp: any; tab: string; extra?: React.ReactNode }) {
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  return (
    <form method="get" className="card mb-5 flex flex-wrap items-end gap-3">
      <input type="hidden" name="tab" value={tab} />
      <Field label="Programa"><select name="program" defaultValue={sp.program ?? ""} className="input"><option value="">Todos</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      {extra}
      <button className="btn">Filtrar</button><Link className="btn-ghost" href={`/seguimiento?tab=${tab}`}>Limpiar</Link>
    </form>
  );
}

function Estado({ u, sp }: { u: User; sp: any }) {
  const rows = companyStatus(u, Number(sp.program) || undefined);
  if (!rows.length) return <><ProgramFilter sp={sp} tab="estado" /><EmptyState title="No hay empresas activas en tu alcance" /></>;
  const sum = (f: (r: any) => number) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);
  // por programa
  const byProg = new Map<string, any[]>();
  for (const r of rows) byProg.set(r.program ?? "Sin programa", [...(byProg.get(r.program ?? "Sin programa") ?? []), r]);
  // por mentor (sesiones del mentor en empresas del alcance)
  const cf = companyFilter(u, "c");
  const ts = new Date().toISOString();
  const mentors = all<any>(`SELECT us.id, us.name, COUNT(DISTINCT s.company_id) companies, SUM(s.status='realizada') done, SUM(s.status='programada' AND s.scheduled_at>=?) next,
      SUM(s.status='programada' AND s.scheduled_at<?) overdue, SUM(s.status='realizada' AND s.topics IS NOT NULL AND s.accepted_at IS NULL) to_accept, COALESCE(SUM(s.hours),0) hours,
      (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=us.id AND t.status!='hecha') tasks_open, (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=us.id AND t.status!='hecha' AND t.due_at<?) tasks_late,
      (SELECT COUNT(*) FROM alerts a WHERE a.owner_id=us.id AND a.status='abierta') alerts
    FROM mentoring_sessions s JOIN users us ON us.id=s.mentor_id JOIN companies c ON c.id=s.company_id WHERE ${cf.sql} ${Number(sp.program) ? "AND c.program_id=?" : ""}
    GROUP BY us.id ORDER BY us.name`, ts, ts, ts, ...cf.params, ...(Number(sp.program) ? [Number(sp.program)] : []));
  const assignedOnly = rows.filter((r) => r.mentor_id && !mentors.some((m) => m.id === r.mentor_id));
  for (const r of assignedOnly) if (!mentors.some((m) => m.id === r.mentor_id)) mentors.push({ id: r.mentor_id, name: r.mentor, companies: 1, done: 0, next: 0, overdue: 0, to_accept: 0, hours: 0, tasks_open: 0, tasks_late: 0, alerts: 0 });
  return (
    <>
      <ProgramFilter sp={sp} tab="estado" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Empresas activas" value={rows.length} icon={Building2} hint={`${rows.filter((r) => r.light === "roja").length} en rojo · ${rows.filter((r) => r.light === "amarilla").length} en amarillo`} />
        <Stat label="Sesiones realizadas" value={sum((r) => r.ses.done)} icon={CalendarClock} tone="green" hint={`${sum((r) => r.ses.next)} próximas`} />
        <Stat label="Sesiones vencidas" value={sum((r) => r.ses.overdue)} icon={AlertTriangle} tone="red" hint={`${sum((r) => r.ses.to_accept)} sin aceptación`} />
        <Stat label="Remisiones abiertas" value={sum((r) => r.ref.open)} icon={Share2} tone="violet" hint={`${sum((r) => r.ref.closed)} cerradas`} />
        <Stat label="Tareas abiertas" value={sum((r) => r.tasks.open)} icon={ListChecks} tone="amber" hint={`${sum((r) => r.tasks.late)} vencidas`} />
      </div>

      <Section title="Por programa">
        <Table head={["Programa", "Empresas", "Semáforo", "Sesiones realizadas / próximas / vencidas", "Remisiones abiertas", "Rutas activas", "Tareas abiertas (vencidas)", "Cumplimiento de indicadores"]}>
          {Array.from(byProg.entries()).map(([p, rs]) => {
            const s = (f: (r: any) => number) => rs.reduce((a, r) => a + (Number(f(r)) || 0), 0);
            const pcts = rs.filter((r) => r.indPct != null).map((r) => r.indPct);
            const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
            return (
              <tr key={p}><Td className="font-medium">{p}</Td><Td>{rs.length}</Td>
                <Td className="whitespace-nowrap text-xs"><span className="inline-flex items-center gap-1"><Semaforo color="roja" />{rs.filter((r) => r.light === "roja").length}</span> <span className="ml-2 inline-flex items-center gap-1"><Semaforo color="amarilla" />{rs.filter((r) => r.light === "amarilla").length}</span> <span className="ml-2 inline-flex items-center gap-1"><Semaforo color="verde" />{rs.filter((r) => r.light === "verde").length}</span></Td>
                <Td>{s((r) => r.ses.done)} / {s((r) => r.ses.next)} / <span className={s((r) => r.ses.overdue) ? "font-semibold text-red-600" : ""}>{s((r) => r.ses.overdue)}</span></Td>
                <Td>{s((r) => r.ref.open)}</Td><Td>{rs.filter((r) => r.route).length}</Td><Td>{s((r) => r.tasks.open)} ({s((r) => r.tasks.late)})</Td>
                <Td className="w-40">{avg == null ? "—" : <><div className="mb-1 text-xs">{avg}%</div><Progress value={avg} /></>}</Td></tr>);
          })}
        </Table>
      </Section>

      <Section title="Por mentor" subtitle="Plan de trabajo de cada mentor en las empresas de tu alcance">
        <Table head={["Mentor", "Empresas", "Realizadas", "Próximas", "Vencidas", "Sin aceptación", "Horas", "Tareas abiertas (vencidas)", "Alertas abiertas"]} empty="Sin mentores con sesiones">
          {mentors.map((m) => (
            <tr key={m.id}><Td className="font-medium">{m.name}</Td><Td>{m.companies}</Td><Td>{m.done ?? 0}</Td><Td>{m.next ?? 0}</Td>
              <Td className={m.overdue ? "font-semibold text-red-600" : ""}>{m.overdue ?? 0}</Td><Td>{m.to_accept ?? 0}</Td><Td>{Math.round((m.hours ?? 0) * 10) / 10}</Td>
              <Td>{m.tasks_open} ({m.tasks_late})</Td><Td>{m.alerts ? <Badge tone="amber">{String(m.alerts)}</Badge> : "0"}</Td></tr>))}
        </Table>
      </Section>

      <Section title="Por empresa" subtitle="Estado del proceso y plan de trabajo; la hoja de ruta se descarga en PDF">
        <CompanyTable rows={rows} />
      </Section>
    </>
  );
}

function CompanyTable({ rows }: { rows: ReturnType<typeof companyStatus> }) {
  return (
    <Table head={["", "Empresa", "Mentor", "Sesiones", "Remisiones", "Ruta", "Tareas", "Indicadores", ""]} empty="Sin empresas">
      {rows.map((r) => (
        <tr key={r.id}>
          <Td><Semaforo color={r.light} /><span className="sr-only">{COLOR_LABEL[r.light]}</span></Td>
          <Td><Link className="font-medium text-ink hover:text-brand" href={`/empresas/${r.id}`}>{r.razon_social}</Link><div className="text-xs text-slate-400">{r.program}</div>
            {(r.red > 0 || r.yellow > 0) && <Link href={`/seguimiento?tab=alertas&company=${r.id}`} className="text-xs text-red-600">{r.red + r.yellow} alerta(s)</Link>}</Td>
          <Td className="text-sm">{r.mentor ?? <span className="text-slate-400">sin asignar</span>}</Td>
          <Td className="text-xs">{r.ses.done ?? 0} realizadas · {r.ses.next ?? 0} próximas{r.ses.overdue ? <div className="font-semibold text-red-600">{r.ses.overdue} vencida(s)</div> : null}
            <div className="text-slate-400">{r.ses.next_at ? `próxima ${fmtDate(r.ses.next_at, false)}` : r.ses.last_session ? `última ${fmtDate(r.ses.last_session, false)}` : "sin sesiones"}</div></Td>
          <Td className="text-xs">{r.ref.open ?? 0} abiertas · {r.ref.closed ?? 0} cerradas</Td>
          <Td className="w-36 text-xs">{r.route ? <><div className="truncate">{r.route.name}</div>{r.steps?.n ? <><Progress value={r.steps.done ?? 0} max={r.steps.n} /><div className="text-slate-400">{r.steps.done ?? 0}/{r.steps.n} etapas{r.steps.late ? ` · ${r.steps.late} vencida(s)` : ""}</div></> : null}</> : <span className="text-slate-400">sin ruta</span>}</Td>
          <Td className="text-xs">{r.tasks.open ?? 0} abiertas{r.tasks.late ? <div className="font-semibold text-red-600">{r.tasks.late} vencida(s)</div> : null}</Td>
          <Td className="w-32 text-xs">{r.indPct == null ? <span className="text-slate-400">—</span> : <><div className="mb-1">{r.indPct}% · {r.nInd}</div><Progress value={r.indPct} /></>}</Td>
          <Td><Link className="btn-ghost btn-sm" href={`/hoja-de-ruta/${r.id}`}>Hoja de ruta</Link></Td>
        </tr>))}
    </Table>
  );
}

function SemaforoTab({ u, sp }: { u: User; sp: any }) {
  const all_ = companyStatus(u, Number(sp.program) || undefined);
  const color = ["roja", "amarilla", "verde"].includes(sp.color) ? sp.color : "";
  const rows = (color ? all_.filter((r) => r.light === color) : all_).sort((a, b) => (b.red * 10 + b.yellow) - (a.red * 10 + a.yellow));
  const ids = rows.map((r) => r.id);
  const msgs = ids.length ? all<any>(`SELECT company_id, severity, message, rule_key FROM alerts WHERE status='abierta' AND company_id IN (${ids.map(() => "?").join(",")}) ORDER BY severity='roja' DESC, created_at DESC`, ...ids) : [];
  const counts = { roja: all_.filter((r) => r.light === "roja").length, amarilla: all_.filter((r) => r.light === "amarilla").length, verde: all_.filter((r) => r.light === "verde").length };
  return (
    <>
      <ProgramFilter sp={sp} tab="semaforo" extra={
        <Field label="Color"><select name="color" defaultValue={color} className="input"><option value="">Todos</option><option value="roja">Rojo</option><option value="amarilla">Amarillo</option><option value="verde">Verde</option></select></Field>} />
      <div className="mb-5 grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="card"><h2 className="mb-3 font-semibold text-ink">Empresas por color</h2>
          <Donut label="Semáforo" data={[{ label: "Rojo (alerta crítica)", value: counts.roja, color: "#dc2626" }, { label: "Amarillo (riesgo)", value: counts.amarilla, color: "#f59e0b" }, { label: "Verde (al día)", value: counts.verde, color: "#16a34a" }]} />
          <p className="mt-3 text-xs text-slate-500">Rojo: al menos una alerta crítica (retraso ≥ 2 veces el umbral). Amarillo: alertas de riesgo. Verde: sin alertas abiertas.</p>
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-3">
          {(["roja", "amarilla", "verde"] as const).map((k) => (
            <Link key={k} href={`/seguimiento?tab=semaforo&color=${k}${sp.program ? `&program=${sp.program}` : ""}`} className={`card flex items-center gap-3 no-underline ${color === k ? "ring-2 ring-brand" : ""}`}>
              <span className="h-8 w-8 rounded-full" style={{ background: k === "roja" ? "#dc2626" : k === "amarilla" ? "#f59e0b" : "#16a34a" }} aria-hidden />
              <div><div className="text-2xl font-semibold text-ink">{counts[k]}</div><div className="text-xs text-slate-500">{COLOR_LABEL[k]}</div></div>
            </Link>))}
        </div>
      </div>
      <Table head={["Semáforo", "Empresa", "Programa", "Mentor", "Alertas abiertas", "Desviaciones", ""]} empty="No hay empresas con ese color">
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><span className="inline-flex items-center gap-2"><Semaforo color={r.light} /><span className="text-xs">{COLOR_LABEL[r.light]}</span></span></Td>
            <Td className="font-medium">{r.razon_social}</Td><Td>{r.program}</Td><Td>{r.mentor ?? "—"}</Td>
            <Td>{r.red ? <Badge tone="red">{`${r.red} roja(s)`}</Badge> : null} {r.yellow ? <Badge tone="amber">{`${r.yellow} amarilla(s)`}</Badge> : null}{!r.red && !r.yellow && <span className="text-slate-400">—</span>}</Td>
            <Td className="max-w-md text-xs">{msgs.filter((m) => m.company_id === r.id).slice(0, 3).map((m, i) => <div key={i} className="mb-1"><b>{RULES[m.rule_key]?.name ?? m.rule_key}:</b> {m.message}</div>)}</Td>
            <Td><div className="flex flex-col gap-1"><Link className="btn-ghost btn-sm" href={`/seguimiento?tab=alertas&company=${r.id}`}>Alertas</Link><Link className="btn-ghost btn-sm" href={`/hoja-de-ruta/${r.id}`}>Hoja de ruta</Link></div></Td>
          </tr>))}
      </Table>
    </>
  );
}

function Alertas({ u, sp }: { u: User; sp: any }) {
  const f = alertFilter(u);
  const where = [f.sql];
  const params: any[] = [...f.params];
  const status = ["abierta", "atendida", "cerrada", "todas"].includes(sp.status) ? sp.status : "abierta";
  if (status !== "todas") { where.push("a.status=?"); params.push(status); }
  if (["roja", "amarilla"].includes(sp.severity)) { where.push("a.severity=?"); params.push(sp.severity); }
  if (RULES[sp.rule]) { where.push("a.rule_key=?"); params.push(sp.rule); }
  if (Number(sp.program)) { where.push("a.program_id=?"); params.push(Number(sp.program)); }
  if (Number(sp.company)) { where.push("a.company_id=?"); params.push(Number(sp.company)); }
  if (sp.mine === "1") { where.push("a.owner_id=?"); params.push(u.id); }
  const rows = all<any>(`SELECT a.*, c.razon_social, o.name owner, rb.name resolver, r.channel, r.name rule_name FROM alerts a LEFT JOIN companies c ON c.id=a.company_id
    LEFT JOIN users o ON o.id=a.owner_id LEFT JOIN users rb ON rb.id=a.resolved_by LEFT JOIN alert_rules r ON r.key=a.rule_key
    WHERE ${where.join(" AND ")} ORDER BY a.status='abierta' DESC, a.severity='roja' DESC, a.created_at DESC LIMIT 300`, ...params);
  const lastNote = (id: number) => { const x = get<any>("SELECT after FROM audit_log WHERE action='atender_alerta' AND entity='alert' AND entity_id=? ORDER BY id DESC LIMIT 1", String(id)); try { return JSON.parse(x?.after ?? "{}").accion; } catch { return null; } };
  return (
    <>
      <form method="get" className="card mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="tab" value="alertas" />{sp.company && <input type="hidden" name="company" value={sp.company} />}
        <Field label="Estado"><select name="status" defaultValue={status} className="input"><option value="abierta">Abiertas</option><option value="atendida">Atendidas</option><option value="cerrada">Cerradas</option><option value="todas">Todas</option></select></Field>
        <Field label="Severidad"><select name="severity" defaultValue={sp.severity ?? ""} className="input"><option value="">Todas</option><option value="roja">Roja</option><option value="amarilla">Amarilla</option></select></Field>
        <Field label="Regla"><select name="rule" defaultValue={sp.rule ?? ""} className="input"><option value="">Todas</option>{Object.entries(RULES).map(([k, r]) => <option key={k} value={k}>{r.name}</option>)}</select></Field>
        <Field label="Programa"><select name="program" defaultValue={sp.program ?? ""} className="input"><option value="">Todos</option>{all<any>("SELECT id,name FROM programs").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} />Solo las mías</label>
        <div className="flex items-end gap-2"><button className="btn">Filtrar</button><Link className="btn-ghost" href="/seguimiento?tab=alertas">Limpiar</Link></div>
      </form>
      {sp.company && <p className="mb-3 text-sm text-slate-500">Filtrando por empresa · <Link className="text-brand" href="/seguimiento?tab=alertas">ver todas</Link></p>}
      <Table head={["", "Alerta", "Empresa", "Responsable · canal", "Generada", "Estado", "Acción"]} empty="No hay alertas con estos filtros">
        {rows.map((a) => (
          <tr key={a.id}>
            <Td><Semaforo color={a.severity} /></Td>
            <Td><div className="font-medium">{a.rule_name ?? RULES[a.rule_key]?.name}</div><div className="max-w-md text-xs text-slate-600">{a.message}</div><div className="text-[11px] text-slate-400">{ENTITY_LABEL[a.entity] ?? a.entity} #{a.entity_id}</div></Td>
            <Td>{a.razon_social ?? "—"}</Td>
            <Td className="text-xs">{a.owner ?? "—"}<div className="text-slate-400">{ALERT_CHANNELS.find((c) => c[0] === a.channel)?.[1] ?? a.channel}</div></Td>
            <Td className="whitespace-nowrap text-xs">{fmtDate(a.created_at)}</Td>
            <Td><Badge>{a.status}</Badge>{a.resolved_at && <div className="mt-1 text-[11px] text-slate-500">{a.resolver ? `${a.resolver} · ` : "automática · "}{fmtDate(a.resolved_at, false)}</div>}
              {a.status !== "abierta" && a.resolved_by && <div className="max-w-[12rem] text-[11px] text-slate-500">{lastNote(a.id)}</div>}</Td>
            <Td>{a.status === "abierta" && (
              <form action={A.attendAlert} className="flex min-w-[220px] flex-col gap-1"><input type="hidden" name="id" value={a.id} />
                <label className="sr-only" htmlFor={`n${a.id}`}>Acción tomada</label>
                <input id={`n${a.id}`} name="note" required minLength={3} className="input !py-1 text-xs" placeholder="Acción tomada" />
                <button className="btn-ghost btn-sm">Marcar atendida</button></form>)}</Td>
          </tr>))}
      </Table>
    </>
  );
}

function Reglas() {
  const rules = all<any>("SELECT r.*, (SELECT COUNT(*) FROM alerts a WHERE a.rule_key=r.key AND a.status='abierta') open FROM alert_rules r ORDER BY r.id");
  return (
    <>
      <p className="mb-4 text-sm text-slate-500">Cada regla tiene un umbral en días, un responsable que recibe el aviso y un canal. Las alertas se generan sin duplicarse y se cierran solas cuando la condición desaparece. Severidad roja cuando el retraso es al menos el doble del umbral (mínimo 7 días adicionales).</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map((r) => (
          <form key={r.id} action={A.saveRule} className="card space-y-3">
            <input type="hidden" name="id" value={r.id} />
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{r.name}</h3><p className="text-xs text-slate-500">{r.description}</p></div>
              <Badge tone={r.open ? "amber" : "slate"}>{`${r.open} abierta(s)`}</Badge></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Umbral (días)"><input name="threshold" type="number" min={0} max={365} required defaultValue={r.threshold ?? 0} className="input" /></Field>
              <Field label="Responsable"><select name="owner_role" defaultValue={r.owner_role} className="input">{OWNER_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Canal"><select name="channel" defaultValue={r.channel} className="input">{ALERT_CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            </div>
            <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" value="1" defaultChecked={!!r.active} />Regla activa</label><button className="btn-ghost btn-sm">Guardar regla</button></div>
          </form>))}
      </div>
    </>
  );
}

