import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get, setting } from "@/lib/db";
import { canSeeCompany, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import PrintButton from "@/components/print-button";
import { Progress } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { compliance, fmtNum } from "@/lib/indicators";

const H2 = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <h2 className="mb-2 mt-7 flex items-center gap-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-ink break-after-avoid">
    <span className="grid h-5 w-5 place-items-center rounded text-[11px] text-white" style={{ background: "var(--color-brand)" }}>{n}</span>{children}</h2>);
const Th = ({ children }: { children: React.ReactNode }) => <th className="border-b border-slate-300 px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-slate-500">{children}</th>;
const C = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => <td className={`border-b border-slate-100 px-2 py-1.5 align-top text-[13px] ${className}`}>{children}</td>;
const Empty = ({ cols, children }: { cols: number; children: React.ReactNode }) => <tr><td colSpan={cols} className="px-2 py-3 text-center text-sm text-slate-400">{children}</td></tr>;

/** Hoja de ruta imprimible con la marca (FUN-92 · RF-ALE-06): se descarga en PDF con «Exportar a PDF». */
export default async function HojaDeRuta({ params }: { params: Promise<{ companyId: string }> }) {
  const u = await requireUser();
  const id = Number((await params).companyId);
  if (!id || !canSeeCompany(u, id)) redirect("/sin-acceso");
  const c = get<any>("SELECT c.*, p.name program FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", id);
  if (!c) redirect("/sin-acceso");
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff"), tagline = setting("brand_tagline", "Fomento Empresarial");
  const mentors = all<any>(`SELECT us.name, us.email, us.phone, 'Mentor asignado' role, ma.from_at since FROM mentor_assignments ma JOIN users us ON us.id=ma.mentor_id WHERE ma.company_id=? AND ma.active=1
    UNION ALL SELECT us.name, us.email, us.phone, 'Mentor de ' || COALESCE(sv.name,'remisión'), r.accepted_at FROM referrals r JOIN users us ON us.id=r.mentor_id LEFT JOIN servicios sv ON sv.id=r.servicio_id
    WHERE r.company_id=? AND r.status NOT IN ('rechazada')`, id, id);
  const route = get<any>("SELECT cr.*, ru.name template FROM company_routes cr LEFT JOIN rutas ru ON ru.id=cr.ruta_id WHERE cr.company_id=? ORDER BY cr.status='activa' DESC, cr.id DESC LIMIT 1", id);
  const steps = route ? all<any>("SELECT st.*, sv.name service FROM company_route_steps st LEFT JOIN servicios sv ON sv.id=st.servicio_id WHERE st.company_route_id=? ORDER BY st.ord, st.id", route.id) : [];
  const items = all<any>("SELECT * FROM company_items WHERE company_id=? ORDER BY id", id);
  const refs = all<any>(`SELECT r.*, sv.name service, al.name aliado, us.name mentor FROM referrals r LEFT JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN aliados al ON al.id=r.aliado_id
    LEFT JOIN users us ON us.id=r.mentor_id WHERE r.company_id=? ORDER BY r.id`, id);
  const sessions = all<any>("SELECT s.*, us.name mentor FROM mentoring_sessions s LEFT JOIN users us ON us.id=s.mentor_id WHERE s.company_id=? ORDER BY s.scheduled_at", id);
  const commitments = sessions.filter((s) => s.commitments);
  const inds = all<any>(`SELECT i.*, COALESCE(i.unit, d.unit) unit, d.kind, (SELECT MAX(recorded_at) FROM indicator_values v WHERE v.indicator_id=i.id) last_at
    FROM indicators i LEFT JOIN indicator_defs d ON d.id=i.def_id WHERE i.company_id=? ORDER BY i.name`, id);
  const tasks = all<any>("SELECT t.*, us.name assignee FROM tasks t LEFT JOIN users us ON us.id=t.assignee_id WHERE t.company_id=? AND t.status!='hecha' ORDER BY t.due_at", id);
  const done = sessions.filter((s) => s.status === "realizada");
  const hours = done.reduce((a, s) => a + (s.hours || 0), 0);
  await audit(u, "generar_hoja_de_ruta", "company", id, null, { sesiones: sessions.length, indicadores: inds.length });
  return (
    <div className="mx-auto max-w-4xl" style={{ ["--color-brand" as any]: color }}>
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/seguimiento" className="btn-ghost btn-sm">← Seguimiento</Link>
        <div className="flex gap-2"><PrintButton label="Descargar PDF" /></div>
      </div>
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-4 pb-4" style={{ borderColor: color }}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl text-xl font-bold text-white" style={{ background: color }}>{brand[0]}</div>
            <div><div className="text-lg font-bold" style={{ color }}>{brand}</div><div className="text-xs text-slate-500">{tagline}</div></div>
          </div>
          <div className="text-right"><div className="text-xl font-bold text-ink">Hoja de ruta</div><div className="text-xs text-slate-500">Generada {fmtDate(new Date().toISOString())}<br />por {u.name}</div></div>
        </header>

        <section className="mt-5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><span className="text-slate-500">Empresa:</span> <b>{c.razon_social}</b></div>
          <div><span className="text-slate-500">NIT:</span> {c.nit}-{c.dv}</div>
          <div><span className="text-slate-500">Programa:</span> {c.program ?? "—"}</div>
          <div><span className="text-slate-500">Estado:</span> {c.status}</div>
          <div><span className="text-slate-500">Sector / tamaño:</span> {c.sector ?? "—"} · {c.size ?? "—"}</div>
          <div><span className="text-slate-500">Ciudad:</span> {c.city ?? "—"}</div>
        </section>
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Sesiones realizadas", done.length], ["Horas de acompañamiento", Math.round(hours * 10) / 10], ["Servicios / remisiones", items.length + refs.length], ["Indicadores", inds.length]].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] uppercase text-slate-500">{l}</div><div className="text-xl font-semibold text-ink">{v}</div></div>))}
        </section>

        <H2 n={1}>Equipo de acompañamiento</H2>
        <table className="w-full"><thead><tr><Th>Nombre</Th><Th>Rol</Th><Th>Contacto</Th><Th>Desde</Th></tr></thead>
          <tbody>{mentors.length ? mentors.map((m, i) => <tr key={i}><C className="font-medium">{m.name}</C><C>{m.role}</C><C>{m.email}{m.phone ? ` · ${m.phone}` : ""}</C><C>{fmtDate(m.since, false)}</C></tr>) : <Empty cols={4}>Sin mentor asignado</Empty>}</tbody></table>

        <H2 n={2}>Ruta de acompañamiento y etapas</H2>
        {route ? (
          <>
            <p className="mb-2 text-sm"><b>{route.name || route.template}</b> · estado {route.status}{route.approved_at ? ` · aprobada ${fmtDate(route.approved_at, false)}` : ""}</p>
            <table className="w-full"><thead><tr><Th>#</Th><Th>Etapa</Th><Th>Tipo / servicio</Th><Th>Indicador y meta</Th><Th>Vence</Th><Th>Estado</Th></tr></thead>
              <tbody>{steps.length ? steps.map((s) => (
                <tr key={s.id}><C>{s.ord}</C><C className="font-medium">{s.name}</C><C>{s.kind}{s.service ? ` · ${s.service}` : ""}</C>
                  <C>{s.indicator ? `${s.indicator}: ${fmtNum(s.baseline)} → ${fmtNum(s.current)} / meta ${fmtNum(s.goal)}` : "—"}</C><C>{fmtDate(s.due_at, false)}</C><C>{s.status}</C></tr>)) : <Empty cols={6}>La ruta no tiene etapas</Empty>}</tbody></table>
          </>) : <p className="text-sm text-slate-400">La empresa aún no tiene una ruta de acompañamiento asignada.</p>}

        <H2 n={3}>Servicios</H2>
        <table className="w-full"><thead><tr><Th>Servicio</Th><Th>Prestado por</Th><Th>Mentor</Th><Th>Estado</Th><Th>Fechas</Th></tr></thead>
          <tbody>
            {items.map((i) => <tr key={`i${i.id}`}><C className="font-medium">{i.label}</C><C>{i.kind}</C><C>—</C><C>{i.status}</C><C>{fmtDate(i.created_at, false)}</C></tr>)}
            {refs.map((r) => <tr key={`r${r.id}`}><C className="font-medium">{r.service}</C><C>{r.aliado ?? "—"}</C><C>{r.mentor ?? "—"}</C><C>{r.status}</C><C>{fmtDate(r.created_at, false)}{r.closed_at ? ` → ${fmtDate(r.closed_at, false)}` : ""}</C></tr>)}
            {!items.length && !refs.length && <Empty cols={5}>Sin servicios asignados</Empty>}
          </tbody></table>

        <H2 n={4}>Sesiones</H2>
        <table className="w-full"><thead><tr><Th>Fecha</Th><Th>Sesión</Th><Th>Mentor</Th><Th>Estado</Th><Th>Horas</Th><Th>Aceptación</Th></tr></thead>
          <tbody>{sessions.length ? sessions.map((s) => (
            <tr key={s.id}><C className="whitespace-nowrap">{fmtDate(s.scheduled_at)}</C><C className="font-medium">{s.title}{s.topics && <div className="text-xs font-normal text-slate-500">Temas: {s.topics}</div>}</C>
              <C>{s.mentor}</C><C>{s.status}</C><C>{s.hours || "—"}</C><C>{s.accepted_at ? `✓ ${fmtDate(s.accepted_at, false)}` : s.status === "realizada" ? "pendiente" : "—"}</C></tr>)) : <Empty cols={6}>Sin sesiones</Empty>}</tbody></table>

        <H2 n={5}>Compromisos</H2>
        {commitments.length ? (
          <ul className="space-y-1.5 text-sm">{commitments.map((s) => <li key={s.id} className="flex gap-2"><span className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-slate-400" aria-hidden /><span><b>{fmtDate(s.scheduled_at, false)}:</b> {s.commitments}</span></li>)}</ul>
        ) : <p className="text-sm text-slate-400">Sin compromisos registrados.</p>}
        {tasks.length > 0 && (<>
          <p className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">Tareas abiertas del equipo</p>
          <ul className="space-y-1 text-sm">{tasks.map((t) => <li key={t.id}>• {t.title} — {t.assignee}, vence {fmtDate(t.due_at, false)}</li>)}</ul></>)}

        <H2 n={6}>Indicadores</H2>
        <table className="w-full"><thead><tr><Th>Indicador</Th><Th>Línea base</Th><Th>Actual</Th><Th>Meta</Th><Th>Cumplimiento</Th><Th>Última medición</Th></tr></thead>
          <tbody>{inds.length ? inds.map((i) => { const p = compliance(i.baseline, i.goal, i.final); return (
            <tr key={i.id}><C className="font-medium">{i.name}<div className="text-[11px] font-normal text-slate-400">{i.kind === "gestion" ? "gestión" : "impacto"}</div></C><C>{fmtNum(i.baseline, i.unit)}</C><C>{fmtNum(i.final, i.unit)}</C><C>{fmtNum(i.goal, i.unit)}</C>
              <C className="w-36"><div className="mb-1 text-xs">{p == null ? "—" : `${p}%`}</div><Progress value={p ?? 0} /></C><C>{fmtDate(i.last_at, false)}</C></tr>); }) : <Empty cols={6}>Sin indicadores aplicados</Empty>}</tbody></table>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Mentor / consultor</div><div className="border-t border-slate-400 pt-1">Representante de {c.razon_social}</div>
        </footer>
        <p className="mt-6 text-center text-[10px] text-slate-400">{brand} · {tagline} · Documento generado desde la plataforma; la trazabilidad queda en la auditoría.</p>
      </article>
    </div>
  );
}
