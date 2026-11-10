import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader, Stat } from "@/components/ui";
import { HBarChart, Progress } from "@/components/charts";
import { fmtDate, isoToLocal } from "@/lib/util";
import {
  canSeeRoute, isInternalRouteUser, ORIGIN, OUTCOME, progress, ROUTE_SELECT, ROUTE_STATUS, routeLog, routeSteps, routeTone, STEP_KIND, STEP_STATUS, templates,
} from "@/lib/routes";
import { ALLOWED } from "@/lib/onbase";
import { StepCard, Timeline } from "../view";
import * as A from "../actions";

function StepEditFields({ s, servicios, events }: { s?: any; servicios: any[]; events: any[] }) {
  return (
    <>
      <div className="sm:col-span-2"><Field label="Nombre de la etapa *"><input name="name" required defaultValue={s?.name} className="input" /></Field></div>
      <Field label="Tipo"><select name="kind" defaultValue={s?.kind || "servicio"} className="input">{Object.entries(STEP_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Servicio del catálogo" hint="Si el tipo es servicio"><select name="servicio_id" defaultValue={s?.servicio_id || ""} className="input"><option value="">—</option>{servicios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label="Curso / evento" hint="Si el tipo es curso"><select name="event_id" defaultValue={s?.event_id || ""} className="input"><option value="">—</option>{events.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Indicador"><input name="indicator" defaultValue={s?.indicator || ""} className="input" placeholder="Ej.: Ventas mensuales (millones COP)" /></Field></div>
      <Field label="Línea base"><input name="baseline" inputMode="decimal" defaultValue={s?.baseline ?? ""} className="input" /></Field>
      <Field label="Meta *"><input name="goal" required inputMode="decimal" defaultValue={s?.goal ?? ""} className="input" /></Field>
      <Field label="Fecha objetivo"><input type="date" name="due" defaultValue={s?.due_at ? isoToLocal(s.due_at).slice(0, 10) : ""} className="input" /></Field>
    </>
  );
}

export default async function Ruta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const id = Number((await params).id);
  if (!id || !canSeeRoute(u, id)) redirect("/sin-acceso");
  const sp = await searchParams;
  const r = get<any>(`${ROUTE_SELECT} WHERE cr.id=?`, id);
  const steps = routeSteps(id);
  const pg = progress(steps);
  const log = routeLog(id);
  const internal = !u.company_id && isInternalRouteUser(u);
  const manage = internal && can(u, "routes.manage");
  const approve = internal && can(u, "routes.approve");
  const open = ["propuesta", "activa"].includes(r.status);
  const children = all<any>("SELECT id, name, status FROM company_routes WHERE parent_id=?", id);
  const closures = all<any>("SELECT k.*, a.name requester, d.name decider, t.name next_name FROM route_closures k LEFT JOIN users a ON a.id=k.requested_by LEFT JOIN users d ON d.id=k.decided_by LEFT JOIN rutas t ON t.id=k.next_ruta_id WHERE k.company_route_id=? ORDER BY k.id DESC", id);
  const pending = closures.find((k) => k.status === "pendiente");
  const admin = u.grants.some((g) => g.perms.includes("*"));
  const reco = log.find((l) => l.action === "recomendacion");
  const diag = r.diagnostic_id ? get<any>("SELECT d.*, fr.result FROM diagnostics d LEFT JOIN form_responses fr ON fr.id=d.response_id WHERE d.id=?", r.diagnostic_id) : null;
  const diagSections = diag ? ((JSON.parse(diag.result || "{}").sections || []) as any[]).map((s) => ({ label: s.name, value: Math.round(Number(s.max) ? (Number(s.score) / Number(s.max)) * 100 : Number(s.score) || 0) })) : [];
  const servicios = manage ? all<any>("SELECT id, name FROM servicios WHERE active=1 ORDER BY name") : [];
  const events = manage ? all<any>("SELECT id, title FROM events WHERE active=1 ORDER BY start_at DESC") : [];
  const tpls = manage ? templates() : [];

  return (
    <div className={internal ? "" : "mx-auto max-w-2xl"}>
      <PageHeader icon={PageIcon} title={r.name} subtitle={`${r.company} · ${r.program || ""}`}
        actions={<Link href="/rutas" className="btn-ghost">← Rutas</Link>} />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={routeTone(r.status)}>{ROUTE_STATUS[r.status]}</Badge>
        {internal && <span className="text-slate-500">{ORIGIN[r.origin] || r.origin}{r.template ? ` · plantilla «${r.template}»` : ""}</span>}
        {r.approver && <span className="text-slate-500">· Aprobó {r.approver} el {fmtDate(r.approved_at, false)}</span>}
        {r.parent_id && <Link href={`/rutas/${r.parent_id}`} className="text-violet-700 underline">Escalada desde la ruta #{r.parent_id}</Link>}
        {children.map((c) => <Link key={c.id} href={`/rutas/${c.id}`} className="text-violet-700 underline">Continúa en «{c.name}» (#{c.id})</Link>)}
      </div>

      {r.status === "propuesta" && internal && (
        <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Propuesta pendiente de aprobación</h2>
          <p className="text-sm text-amber-900">La empresa no ve esta ruta hasta que un mentor la apruebe. Ajusta etapas, línea base y metas antes de aprobar.</p>
          {reco?.note && <p className="mt-2 text-sm"><b>Por qué se recomienda:</b> {reco.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {approve && (
              <form action={A.approveRoute} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="route_id" value={id} />
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="show_home" defaultChecked /> Mostrar en el inicio de la empresa</label>
                <button className="btn">Aprobar y activar</button>
              </form>)}
            {manage && <form action={A.discardRoute}><input type="hidden" name="route_id" value={id} /><button className="btn-ghost">Descartar propuesta</button></form>}
          </div>
        </section>)}

      {r.close_result && <Notice kind={r.status === "cerrada" ? "ok" : "info"}>Resultado del cierre ({fmtDate(r.closed_at, false)}): {r.close_result}</Notice>}

      <div className={internal ? "grid gap-5 lg:grid-cols-3" : ""}>
        <div className="space-y-5 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Avance" value={`${pg.pct}%`} />
            <Stat label="Completadas" value={`${pg.done}/${pg.total}`} />
            <Stat label="En curso" value={pg.inCourse} />
          </div>
          <Progress value={pg.pct} />

          <section aria-labelledby="etapas">
            <h2 id="etapas" className="mb-3 font-semibold text-ink">Etapas, servicios y metas</h2>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <StepCard key={s.id} s={s} n={i + 1}>
                  {manage && r.status === "activa" && (
                    <details className="mt-3 rounded-lg bg-slate-50 p-3" open={sp.etapa === String(s.id)}>
                      <summary className="cursor-pointer text-sm font-medium text-brand">Registrar avance</summary>
                      <form action={A.progressStep} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="route_id" value={id} /><input type="hidden" name="step_id" value={s.id} />
                        <Field label="Estado"><select name="status" defaultValue={s.status === "pendiente" ? "en_curso" : s.status} className="input">{Object.entries(STEP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                        <Field label={`Valor actual${s.indicator ? ` (${s.indicator})` : ""}`}><input name="current" inputMode="decimal" defaultValue={s.current ?? ""} className="input" /></Field>
                        <div className="sm:col-span-2"><Field label="Qué se hizo *"><textarea name="note" required rows={2} className="input" /></Field></div>
                        <div className="sm:col-span-2"><Field label="Evidencia" hint={`Obligatoria para completar · ${ALLOWED.join(", ")}`}><input type="file" name="file" accept={ALLOWED.join(",")} className="block w-full text-sm" /></Field></div>
                        <div><button className="btn btn-sm">Guardar avance</button></div>
                      </form>
                    </details>)}
                  {manage && open && (
                    <details className="mt-2 rounded-lg bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm text-slate-600">Editar etapa (servicio, indicador, línea base, meta)</summary>
                      <form action={A.saveStep} className="mt-3 grid gap-3 sm:grid-cols-4">
                        <input type="hidden" name="route_id" value={id} /><input type="hidden" name="step_id" value={s.id} />
                        <StepEditFields s={s} servicios={servicios} events={events} />
                        <div className="flex flex-wrap gap-2 sm:col-span-4"><button className="btn btn-sm">Guardar</button></div>
                      </form>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <form action={A.moveStep}><input type="hidden" name="route_id" value={id} /><input type="hidden" name="step_id" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="btn-ghost btn-sm" disabled={i === 0} aria-label="Subir etapa">↑ Subir</button></form>
                        <form action={A.moveStep}><input type="hidden" name="route_id" value={id} /><input type="hidden" name="step_id" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="btn-ghost btn-sm" disabled={i === steps.length - 1} aria-label="Bajar etapa">↓ Bajar</button></form>
                        {s.status === "pendiente" && <form action={A.removeStep}><input type="hidden" name="route_id" value={id} /><input type="hidden" name="step_id" value={s.id} /><button className="btn-ghost btn-sm text-red-700">Quitar</button></form>}
                      </div>
                    </details>)}
                </StepCard>))}
            </ol>
            {manage && open && (
              <details className="card mt-4">
                <summary className="cursor-pointer font-medium text-brand">+ Agregar etapa</summary>
                <form action={A.addStep} className="mt-3 grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="route_id" value={id} />
                  <StepEditFields servicios={servicios} events={events} />
                  <div className="sm:col-span-4"><button className="btn">Agregar</button></div>
                </form>
              </details>)}
          </section>
        </div>

        <aside className="mt-5 space-y-5 lg:mt-0">
          {internal && diag && (
            <section className="card" aria-labelledby="diag">
              <h2 id="diag" className="mb-2 font-semibold text-ink">Diagnóstico de origen</h2>
              <p className="mb-3 text-sm text-slate-600">Nivel <b>{diag.level || "—"}</b>{diag.score != null ? ` · puntaje ${diag.score}` : ""} · {fmtDate(diag.completed_at || diag.created_at, false)}</p>
              {diagSections.length > 0 && <HBarChart data={diagSections} max={100} format={(v) => v + "%"} />}
            </section>)}

          {internal && pending && (
            <section className="card border-violet-200" aria-labelledby="pend">
              <h2 id="pend" className="mb-1 font-semibold text-ink">{pending.kind === "cierre" ? "Cierre" : "Escalamiento"} por aprobar</h2>
              <p className="text-sm text-slate-600">Solicitó {pending.requester} el {fmtDate(pending.requested_at)}</p>
              <p className="mt-2 text-sm"><b>{OUTCOME[pending.outcome]}</b>: {pending.result}</p>
              {pending.next_name && <p className="text-sm">Nueva ruta: <b>{pending.next_name}</b></p>}
              {approve && (pending.requested_by !== u.id || admin) ? (
                <form action={A.decideClose} className="mt-3 space-y-2">
                  <input type="hidden" name="closure_id" value={pending.id} />
                  <Field label="Observación de la aprobación"><textarea name="note" rows={2} className="input" placeholder="Obligatoria si rechazas" /></Field>
                  <div className="flex gap-2"><button name="approve" value="1" className="btn">Aprobar</button><button name="approve" value="0" className="btn-ghost">Rechazar</button></div>
                </form>
              ) : <p className="mt-2 text-xs text-slate-500">Debe aprobarla otra persona con permiso de aprobar rutas (separación de funciones).</p>}
            </section>)}

          {manage && !pending && ["activa", "cerrada"].includes(r.status) && (
            <section className="card" aria-labelledby="cierre">
              <h2 id="cierre" className="mb-2 font-semibold text-ink">{r.status === "activa" ? "Cierre o escalamiento" : "Escalar a una nueva ruta"}</h2>
              {r.status === "activa" && pg.done < pg.total && <p className="mb-2 text-xs text-amber-700">Hay {pg.total - pg.done} etapa(s) sin completar.</p>}
              <form action={A.requestClose} className="space-y-3">
                <input type="hidden" name="route_id" value={id} />
                <Field label="Solicitud">
                  <select name="kind" className="input" defaultValue={r.status === "activa" ? "cierre" : "escalamiento"}>
                    {r.status === "activa" && <option value="cierre">Cerrar la ruta</option>}
                    <option value="escalamiento">Cerrar y escalar a una nueva ruta</option>
                  </select>
                </Field>
                <Field label="Resultado"><select name="outcome" className="input">{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Resultado obtenido *"><textarea name="result" required rows={3} className="input" defaultValue={r.status === "cerrada" ? r.close_result?.split(": ").slice(1).join(": ") : ""} /></Field>
                <Field label="Plantilla de la nueva ruta" hint="Solo para escalamiento"><select name="next_ruta_id" className="input"><option value="">—</option>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.linea})</option>)}</select></Field>
                <button className="btn-ghost w-full">Solicitar aprobación</button>
              </form>
            </section>)}

          {internal && closures.filter((k) => k.status !== "pendiente").length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold text-ink">Solicitudes de cierre</h2>
              <ul className="space-y-2 text-sm">{closures.filter((k) => k.status !== "pendiente").map((k) => (
                <li key={k.id}><Badge tone={routeTone(k.status)}>{k.status}</Badge> {k.kind} · {k.requester} → {k.decider} ({fmtDate(k.decided_at, false)}){k.decision_note ? ` — ${k.decision_note}` : ""}</li>))}</ul>
            </section>)}

          <section className="card" aria-labelledby="tl">
            <h2 id="tl" className="mb-3 font-semibold text-ink">Trazabilidad</h2>
            <Timeline log={log} />
          </section>
        </aside>
      </div>
    </div>
  );
}
