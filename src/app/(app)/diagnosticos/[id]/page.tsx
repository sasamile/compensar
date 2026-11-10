import { Stethoscope as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get, setting } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import FormRenderer from "@/components/form-renderer";
import FormAnswers from "@/components/form-answers";
import FormResult from "@/components/form-result";
import { fmtDate, jparse } from "@/lib/util";
import { DIAG_STAGES, DIAG_STATUS, parseScoring, type Result } from "@/lib/forms";
import { canFillDiagnostic, canManageDiagnostic, canSeeDiagnostic, getForm, versionOf } from "../../formularios/server";
import { saveDraft, submitResponse, uploadFormFile } from "../../../f/actions";
import { reassignDiagnostic, setDiagnosticStatus } from "../actions";

const stLabel = Object.fromEntries(DIAG_STATUS), stgLabel = Object.fromEntries(DIAG_STAGES);
const FLOW = ["asignado", "en_curso", "en_revision", "completado"];

export default async function Diagnostico({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const d = get<any>(`SELECT d.*, c.razon_social company, c.nit, c.dv, c.sector, c.size, c.city, a.name assignee, b.name assigner
    FROM diagnostics d JOIN companies c ON c.id=d.company_id LEFT JOIN users a ON a.id=d.assigned_to LEFT JOIN users b ON b.id=d.assigned_by WHERE d.id=?`, Number((await params).id));
  if (!d || !canSeeDiagnostic(u, d)) redirect("/sin-acceso");
  const f = getForm(d.form_id)!;
  const r = d.response_id ? get<any>("SELECT * FROM form_responses WHERE id=?", d.response_id) : null;
  const fillable = ["asignado", "en_curso"].includes(d.status) && canFillDiagnostic(u, d) && f.status === "publicado";
  const manage = canManageDiagnostic(u, d);
  const version = r && !fillable ? versionOf(f.id, r.form_version) : versionOf(f.id);
  const result: Result | null = r?.result ? jparse<Result | null>(r.result, null) : null;
  const scoring = parseScoring(f.scoring);
  const history = all<any>("SELECT * FROM audit_log WHERE entity='diagnostic' AND entity_id=? ORDER BY id", String(d.id));
  const others = all<any>(`SELECT d2.id, d2.stage, d2.score, d2.level, d2.completed_at, r.result FROM diagnostics d2 LEFT JOIN form_responses r ON r.id=d2.response_id
    WHERE d2.company_id=? AND d2.form_id=? AND d2.id<>? AND d2.score IS NOT NULL ORDER BY d2.id`, d.company_id, d.form_id, d.id);
  const prev = others.filter((o) => o.id < d.id).at(-1);
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff");
  const mentors = manage ? all<any>(`SELECT DISTINCT us.id, us.name FROM users us JOIN user_roles ur ON ur.user_id=us.id JOIN roles ro ON ro.id=ur.role_id
    WHERE us.status='activo' AND us.internal=1 AND (ro.perms LIKE '%diagnostics.manage%' OR ro.perms LIKE '%"*"%') ORDER BY us.name`) : [];
  const step = FLOW.indexOf(d.status);

  return (
    <>
      {/* encabezado de marca para el PDF (RF-DIA-07) */}
      <div className="mb-6 hidden items-center justify-between border-b-4 pb-3 print:flex" style={{ borderColor: color }}>
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg text-lg font-bold text-white" style={{ background: color }}>{brand[0]}</div>
          <div><b className="text-lg">{brand}</b><div className="text-xs">{setting("brand_tagline")}</div></div></div>
        <div className="text-right text-xs">Informe de diagnóstico empresarial<br />Generado {fmtDate(new Date().toISOString())}</div>
      </div>
      <PageHeader icon={PageIcon} title={`${d.company}`} subtitle={`${f.name} · etapa ${stgLabel[d.stage] || d.stage} · NIT ${d.nit}-${d.dv}`}
        actions={<>
          <Link href="/diagnosticos" className="btn-ghost print:hidden">Volver</Link>
          {others.length > 0 && <Link href={`/diagnosticos/comparacion?empresa=${d.company_id}&instrumento=${d.form_id}`} className="btn-ghost print:hidden">Comparar etapas</Link>}
          {result && <PrintButton label="Descargar PDF" />}
        </>} />
      <Flash sp={sp} />

      {/* estados (RF-DIA-03) */}
      <ol className="mb-5 grid grid-cols-4 gap-1 text-center text-[11px] sm:text-xs print:hidden" aria-label="Estado del diagnóstico">
        {FLOW.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-md border px-1 py-1.5 ${i < step ? "border-brand/30 bg-brand/10 text-brand" : i === step ? "border-brand bg-brand font-semibold text-white" : "border-slate-200 bg-white text-slate-400"}`}>{stLabel[s]}</li>))}
      </ol>

      {fillable && version ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="card">
            {!u.company_id && <Notice>Estás diligenciando el diagnóstico con la empresa (modo asistido). Queda registrado a tu nombre.</Notice>}
            {r?.status === "ajustes" && r.decision_reason && <Notice kind="error">Devuelto para ajustes: {r.decision_reason}</Notice>}
            <FormRenderer schema={version.schema} kind="diagnostico" formId={f.id} diagnosticId={d.id} responseId={r?.id ?? null}
              initialAnswers={r ? jparse(r.answers, {}) : {}} submitLabel="Enviar y ver resultado"
              saveAction={saveDraft} submitAction={submitResponse} uploadAction={uploadFormFile} />
          </div>
          <Side d={d} manage={manage} mentors={mentors} history={history} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px] print:block">
          <div className="min-w-0 space-y-6">
            {!result && <Notice>{d.status === "asignado" || d.status === "en_curso" ? (f.status !== "publicado" ? "El instrumento no está publicado." : "La empresa aún no ha enviado este diagnóstico.") : "Sin resultado."}</Notice>}
            {result && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{d.status}</Badge>
                  <span className="text-slate-500">Enviado {fmtDate(r?.submitted_at)} · versión {r?.form_version} del instrumento{result.computed_at ? ` · calculado ${fmtDate(result.computed_at)}` : ""}</span>
                </div>
                <FormResult result={result} levels={scoring.levels} />
                {prev && (
                  <div className="card break-inside-avoid">
                    <h3 className="mb-2 text-sm font-semibold text-ink">Frente al diagnóstico anterior ({stgLabel[prev.stage]}, {fmtDate(prev.completed_at, false)})</h3>
                    <Delta a={jparse<any>(prev.result, null)} b={result} />
                  </div>)}
              </>)}
            {r && version && (
              <div className="card break-before-page">
                <h2 className="mb-4 font-semibold text-ink">Respuestas</h2>
                <FormAnswers schema={version.schema} answers={jparse(r.answers, {})} fileBase={`/api/formularios/${f.id}/archivo?r=${r.id}`} />
              </div>)}
          </div>
          <div className="print:hidden"><Side d={d} manage={manage} mentors={mentors} history={history} /></div>
        </div>)}
    </>
  );
}

function Delta({ a, b }: { a: Result | null; b: Result }) {
  if (!a) return null;
  const rows = b.sections.map((s) => ({ name: s.name, before: a.sections.find((x) => x.id === s.id || x.name === s.name)?.score ?? null, after: s.score }));
  const d = Math.round((b.total - a.total) * 10) / 10;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Dimensión</th><th>Antes</th><th>Ahora</th><th className="text-right">Cambio</th></tr></thead>
      <tbody>
        {rows.map((x) => { const dd = x.before == null ? null : Math.round((x.after - x.before) * 10) / 10; return (
          <tr key={x.name} className="border-t border-slate-100"><td className="py-1">{x.name}</td><td>{x.before ?? "—"}</td><td>{x.after}</td>
            <td className={`text-right font-medium ${dd == null ? "" : dd > 0 ? "text-emerald-700" : dd < 0 ? "text-red-700" : "text-slate-500"}`}>{dd == null ? "—" : `${dd > 0 ? "+" : ""}${dd}`}</td></tr>); })}
        <tr className="border-t-2 border-slate-200 font-semibold"><td className="py-1">Total</td><td>{a.total} ({a.level})</td><td>{b.total} ({b.level})</td>
          <td className={`text-right ${d > 0 ? "text-emerald-700" : d < 0 ? "text-red-700" : ""}`}>{d > 0 ? "+" : ""}{d}</td></tr>
      </tbody>
    </table>
  );
}

function Side({ d, manage, mentors, history }: { d: any; manage: boolean; mentors: any[]; history: any[] }) {
  return (
    <aside className="space-y-4">
      <div className="card text-sm">
        <h2 className="mb-2 font-semibold text-ink">Detalle</h2>
        <dl className="space-y-1">
          <div className="flex justify-between gap-2"><dt className="text-slate-500">Estado</dt><dd><Badge>{d.status}</Badge></dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">Etapa</dt><dd>{stgLabel[d.stage]}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">Responsable</dt><dd className="text-right">{d.assignee || "Autodiagnóstico"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">Asignado por</dt><dd className="text-right">{d.assigner || "—"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">Creado</dt><dd>{fmtDate(d.created_at, false)}</dd></div>
          {d.completed_at && <div className="flex justify-between gap-2"><dt className="text-slate-500">Completado</dt><dd>{fmtDate(d.completed_at, false)}</dd></div>}
        </dl>
      </div>
      {manage && d.status === "en_revision" && (
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold text-ink">Revisión</h2>
          <form action={setDiagnosticStatus} className="space-y-2"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="completado" />
            <button className="btn w-full">Marcar como completado</button></form>
          <form action={setDiagnosticStatus} className="space-y-2"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="en_curso" />
            <textarea name="note" rows={2} className="input" placeholder="Qué debe ajustar la empresa" aria-label="Motivo de devolución" required minLength={5} />
            <button className="btn-ghost w-full">Devolver a la empresa</button></form>
        </div>)}
      {manage && d.status === "completado" && (
        <form action={setDiagnosticStatus} className="card text-sm"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="en_revision" />
          <button className="btn-ghost w-full">Reabrir revisión</button></form>)}
      {manage && (
        <form action={reassignDiagnostic} className="card space-y-2 text-sm">
          <input type="hidden" name="id" value={d.id} />
          <h2 className="font-semibold text-ink">Etapa y responsable</h2>
          <Field label="Etapa"><select name="stage" defaultValue={d.stage} className="input">{DIAG_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Responsable"><select name="assigned_to" defaultValue={d.assigned_to ?? ""} className="input"><option value="">Autodiagnóstico (sin responsable)</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <button className="btn-ghost w-full">Guardar</button>
        </form>)}
      <div className="card text-sm">
        <h2 className="mb-2 font-semibold text-ink">Historial (auditado)</h2>
        <ol className="space-y-1.5">
          {history.map((h) => { const a = jparse<any>(h.after, {}), b = jparse<any>(h.before, {}); return (
            <li key={h.id} className="text-xs"><span className="text-slate-400">{fmtDate(h.ts)}</span><br /><b>{h.action.replace(/_/g, " ")}</b>{b.status && a.status ? `: ${b.status} → ${a.status}` : a.status ? `: ${a.status}` : ""} · {h.user_email}{a.note ? ` — ${a.note}` : ""}</li>); })}
          {!history.length && <li className="text-slate-400">Sin eventos</li>}
        </ol>
      </div>
    </aside>
  );
}
