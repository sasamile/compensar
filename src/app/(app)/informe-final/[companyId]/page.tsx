import Link from "next/link";
import { redirect } from "next/navigation";
import { setting } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { companyVisible, finalReport } from "@/lib/analytics";
import { fmtDate } from "@/lib/util";
import { Badge, Flash, Notice } from "@/components/ui";
import PrintButton from "@/components/print-button";
import * as A from "../actions";

export const dynamic = "force-dynamic";
const n1 = (v: any) => (v == null || v === "" ? "—" : Math.round(Number(v) * 10) / 10);

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 flex items-center gap-2 border-b border-slate-200 pb-1 text-base font-semibold text-ink break-after-avoid"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs text-white">{n}</span>{children}</h2>;
}
function T({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
      <thead><tr>{head.map((h) => <th key={h} className="border-b-2 border-brand/30 px-2 py-1 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="break-inside-avoid">{r.map((c, j) => <td key={j} className="border-b border-slate-100 px-2 py-1 align-top">{c}</td>)}</tr>)}</tbody>
    </table></div>);
}

/** Informe final por empresa beneficiaria (FUN-93, RF-ANA-01) en PDF con la marca. */
export default async function InformeFinal({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const cid = Number((await params).companyId);
  const own = u.company_id === cid;
  if (u.company_id ? !own : !companyVisible(u, cid)) redirect("/sin-acceso");
  const sp = await searchParams;
  const r = finalReport(cid);
  if (!r) redirect("/sin-acceso");
  const { c, stats } = r;
  await audit(u, "ver_informe_final", "company", cid, null, null);
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff");
  const canEdit = !u.company_id && (can(u, "closure.manage") || can(u, "sessions.followup") || can(u, "config.manage"));
  const certs = r.events.filter((e) => e.cert).length, attended = r.events.filter((e) => e.attended).length;
  const sum = [
    ["Servicios recibidos", r.referrals.length + r.items.filter((i) => i.kind !== "servicio").length],
    ["Sesiones realizadas", stats?.realizadas || 0], ["Sesiones aceptadas", stats?.aceptadas || 0], ["Horas de acompañamiento", n1(stats?.horas || 0)],
    ["Capacitaciones asistidas", attended], ["Certificados", certs],
  ];
  const secNames = Array.from(new Set([...(r.ini?.sections || []), ...(r.fin?.sections || [])].map((s) => s.name)));
  const pctOf = (s?: { score: number; max: number }) => (s && s.max ? Math.round((s.score / s.max) * 100) : null);
  return (
    <article className="mx-auto max-w-4xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={u.company_id ? "/" : "/informe-final"} className="btn-ghost btn-sm">← Volver</Link>
        <div className="flex gap-2">{!u.company_id && <Link href={`/trazabilidad/${cid}`} className="btn-ghost btn-sm">Trazabilidad</Link>}<PrintButton label="Descargar PDF" /></div>
      </div>
      <Flash sp={sp} />
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-center justify-between gap-4 border-b-4 pb-4" style={{ borderColor: color }}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl text-xl font-bold text-white" style={{ background: color }}>{brand[0]}</div>
            <div><div className="text-lg font-semibold text-ink">{brand}</div><div className="text-xs text-slate-500">{setting("brand_tagline", "Plataforma de Fomento Empresarial")}</div></div>
          </div>
          <div className="text-right text-xs text-slate-500">Informe final de acompañamiento<br />Generado el {fmtDate(new Date().toISOString(), false)}</div>
        </header>
        <section className="mt-5">
          <h1 className="text-2xl font-semibold text-ink">{c.razon_social}</h1>
          <p className="text-sm text-slate-600">NIT {c.nit}-{c.dv} · {c.sector || "—"} · {c.size || "—"} · {c.city || "—"}</p>
          <p className="text-sm text-slate-600">Programa <b>{c.program}</b> · Acompañamiento {stats?.primera ? `del ${fmtDate(stats.primera, false)}` : ""}{stats?.ultima ? ` al ${fmtDate(stats.ultima, false)}` : ""}
            {r.mentors.length ? <> · Mentor(es): {r.mentors.map((m) => m.name).join(", ")}</> : null}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sum.map(([l, v]) => <div key={l as string} className="rounded-lg border border-slate-200 p-3 break-inside-avoid"><div className="text-[11px] uppercase tracking-wide text-slate-500">{l}</div><div className="text-xl font-semibold text-ink">{v}</div></div>)}
          </div>
          {r.survey?.n > 0 && <p className="mt-2 text-xs text-slate-500">Satisfacción reportada por la empresa: NPS promedio {n1(r.survey.nps)} · satisfacción {n1(r.survey.sat)} ({r.survey.n} encuesta(s)).</p>}
        </section>

        <H n={1}>Resultados del acompañamiento</H>
        {r.notes?.conclusions ? <p className="whitespace-pre-line text-sm text-slate-700">{r.notes.conclusions}</p> : null}
        <T head={["Servicio", "Resultado consolidado", "Estado", "Aprobado"]} empty="Aún no hay cierres registrados."
          rows={r.closures.map((x) => [x.service || "General", <span key="r" className="text-xs">{x.result}</span>, <Badge key="b">{x.status}</Badge>, x.approved_at ? `${fmtDate(x.approved_at, false)} · ${x.approver}` : "—"])} />
        {r.routes.length > 0 && <div className="mt-3"><T head={["Ruta", "Estado", "Avance", "Resultado de cierre"]} empty=""
          rows={r.routes.map((x) => [x.ruta, <Badge key="b">{x.estado}</Badge>, `${x.pasos_completados}/${x.pasos} pasos`, x.resultado_cierre || "—"])} /></div>}

        <H n={2}>Indicadores: antes y después</H>
        {r.indicators.length ? (
          <div className="space-y-3">
            {r.indicators.map((i) => {
              const res = i.resultado ?? i.ultimo_valor;
              const mx = Math.max(Number(i.linea_base) || 0, Number(res) || 0, Number(i.meta) || 0, 1);
              return (
                <div key={i.indicador_id} className="break-inside-avoid">
                  <div className="flex flex-wrap justify-between gap-2 text-sm"><b className="text-slate-700">{i.indicador}{i.unidad ? ` (${i.unidad})` : ""}</b>
                    <span className="text-xs text-slate-500">Base {n1(i.linea_base)} → resultado {n1(res)} · meta {n1(i.meta)}{i.variacion_pct != null ? ` · ${i.variacion_pct > 0 ? "+" : ""}${i.variacion_pct}%` : ""} {i.cumple_meta === 1 ? "✓ cumple" : i.cumple_meta === 0 ? "· no alcanza la meta" : ""}</span></div>
                  <div className="mt-1 space-y-0.5 text-[11px]">
                    <div className="flex items-center gap-2"><span className="w-16 text-slate-500">Antes</span><div className="h-2.5 flex-1 rounded bg-slate-100"><div className="h-2.5 rounded bg-slate-400" style={{ width: `${((Number(i.linea_base) || 0) / mx) * 100}%` }} /></div></div>
                    <div className="flex items-center gap-2"><span className="w-16 text-slate-500">Después</span><div className="h-2.5 flex-1 rounded bg-slate-100"><div className="h-2.5 rounded" style={{ width: `${((Number(res) || 0) / mx) * 100}%`, background: color }} /></div></div>
                  </div>
                </div>);
            })}
          </div>) : <p className="text-sm text-slate-400">No se registraron indicadores para esta empresa.</p>}

        <H n={3}>Diagnóstico inicial frente a final</H>
        {r.ini || r.fin ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {[["Inicial", r.ini], ["Final", r.fin]].map(([l, d]: any) => (
                <div key={l} className="rounded-lg border border-slate-200 p-3 break-inside-avoid"><div className="text-[11px] uppercase text-slate-500">Diagnóstico {l.toLowerCase()}</div>
                  {d ? <><div className="text-xl font-semibold text-ink">{n1(d.score)} <span className="text-sm font-normal text-slate-500">puntos</span></div><div className="text-sm">Nivel {d.level || "—"}{d.segment ? ` · ${d.segment}` : ""}</div><div className="text-xs text-slate-400">{fmtDate(d.completed_at, false)}</div></> : <div className="text-sm text-slate-400">No realizado</div>}
                </div>))}
            </div>
            {secNames.length > 0 && <T head={["Dimensión", "Inicial", "Final", "Cambio"]} empty="" rows={secNames.map((s) => {
              const a = pctOf(r.ini?.sections.find((x: any) => x.name === s)), b = pctOf(r.fin?.sections.find((x: any) => x.name === s));
              return [s, a != null ? `${a}%` : "—", b != null ? `${b}%` : "—", a != null && b != null ? `${b - a > 0 ? "+" : ""}${b - a} pts` : "—"];
            })} />}
          </div>) : <p className="text-sm text-slate-400">La empresa no tiene diagnósticos completados.</p>}

        <H n={4}>Servicios recibidos</H>
        <T head={["Servicio", "Aliado", "Mentor", "Estado", "Sesiones (aceptadas/previstas)", "Horas aceptadas"]} empty="Sin remisiones a servicios."
          rows={r.referrals.map((x) => [x.service, x.aliado, x.mentor || "—", <Badge key="b">{x.status}</Badge>, `${x.aceptadas}/${x.planned_sessions || "—"}`, n1(x.horas)])} />
        {r.items.length > 0 && <p className="mt-2 text-xs text-slate-500">Asignaciones: {r.items.map((i) => `${i.label} (${i.kind}, ${i.status})`).join(" · ")}</p>}

        <H n={5}>Sesiones de mentoría aceptadas</H>
        <T head={["Fecha", "Sesión", "Mentor", "Horas", "Aceptada por", "Fecha de aceptación"]} empty="No hay sesiones aceptadas."
          rows={r.accepted.map((s) => [fmtDate(s.scheduled_at, false), <span key="t">{s.title}{s.topics ? <span className="block text-[11px] text-slate-500">{s.topics}</span> : null}</span>, s.mentor || "—", n1(s.hours), s.accepter || "—", fmtDate(s.accepted_at)])} />

        <H n={6}>Capacitaciones y eventos</H>
        <T head={["Evento", "Tipo", "Fecha", "Asistencia", "Certificado"]} empty="Sin participación en eventos."
          rows={r.events.map((e) => [e.title, e.type, fmtDate(e.start_at, false), e.attended ? `Sí (${e.minutes || 0} min)` : "No", e.cert || "—"])} />

        <H n={7}>Recomendaciones</H>
        {r.recs.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{r.recs.map((x, i) => <li key={i}>{x.text} <span className="text-[11px] text-slate-400">({x.source})</span></li>)}</ul>
          : <p className="text-sm text-slate-400">Sin recomendaciones registradas.</p>}

        <footer className="mt-8 grid gap-8 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:grid-cols-2">
          <div><div className="mb-8 border-b border-slate-300" />Mentor / Gestor de Mentorías</div>
          <div><div className="mb-8 border-b border-slate-300" />Representante de {c.razon_social}</div>
          <p className="sm:col-span-2">Este informe se generó con la información registrada en la Plataforma de Fomento Empresarial de {brand}. Las sesiones aceptadas cuentan con trazabilidad de usuario, fecha e IP.
            {r.notes?.updated_at ? ` Conclusiones actualizadas por ${r.notes.author} el ${fmtDate(r.notes.updated_at)}.` : ""}</p>
        </footer>
      </div>

      {canEdit && (
        <form action={A.saveNotes} className="card mt-6 space-y-3 print:hidden" aria-label="Conclusiones y recomendaciones">
          <h2 className="font-semibold text-ink">Conclusiones y recomendaciones del equipo</h2>
          <input type="hidden" name="company_id" value={cid} />
          <label className="block"><span className="label">Conclusiones (aparecen en «Resultados»)</span><textarea name="conclusions" rows={4} maxLength={4000} defaultValue={r.notes?.conclusions || ""} className="input" /></label>
          <label className="block"><span className="label">Recomendaciones (una por línea)</span><textarea name="recommendations" rows={4} maxLength={4000} defaultValue={r.notes?.recommendations || ""} className="input" /></label>
          <button className="btn">Guardar</button>
        </form>)}
      {own && <div className="mt-4 print:hidden"><Notice>Puedes descargar este informe en PDF con el botón «Descargar PDF» (elige «Guardar como PDF» en el diálogo de impresión).</Notice></div>}
    </article>
  );
}
