import { ShieldCheck as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader, Table, Td } from "@/components/ui";
import { fmtDate, jparse, money } from "@/lib/util";
import { campoLabel, CAMPOS } from "@/lib/integrations/gestion-clientes";
import {
  answersWithLabels, autoSummary, autoTone, CASE_SELECT, CASE_STATUS, canCase, checklistFor, KIND_LABEL, OPEN, opLabel,
  processDueRequests, statusTone, validators, waitTime, type AutoResult,
} from "@/lib/validation";
import * as A from "../actions";

const ACTION_LABEL: Record<string, string> = {
  crear_caso_validacion: "Caso creado", validacion_automatica: "Validación automática", asignar_validacion: "Asignación",
  validacion_manual: "Validación manual", decidir_validacion: "Decisión", solicitar_informacion: "Solicitud de información",
  responder_solicitud_informacion: "Respuesta del solicitante", solicitud_informacion_vencida: "Plazo vencido",
  recordatorio_solicitud_informacion: "Recordatorio enviado", validacion_masiva: "Validación masiva",
};
const fmtData = (k: string, v: any) => v == null ? "sin dato" : k === "ventas_brutas" ? money(Number(v)) : CAMPOS.find((c) => c.key === k)?.tipo === "booleano" ? (Number(v) ? "Sí" : "No") : String(v);
const tomorrowPlus = (d: number) => new Date(Date.now() + d * 86400000 - 5 * 3600000).toISOString().slice(0, 10);

export default async function Caso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const id = Number((await params).id);
  if (!id || !canCase(u, id)) redirect("/sin-acceso");
  await processDueRequests();
  const sp = await searchParams;
  const c = get<any>(`${CASE_SELECT} WHERE vc.id=?`, id);
  const manage = can(u, "validation.manage") && canCase(u, id, "validation.manage");
  const isOpen = OPEN.includes(c.status);
  const auto = jparse<AutoResult | null>(c.auto_result, null);
  const checklist = jparse<any>(c.checklist, null);
  const items = checklistFor(c.program_id);
  const company = c.cid ? get<any>("SELECT * FROM companies WHERE id=?", c.cid) : null;
  const resp = c.response_id ? get<any>("SELECT fr.*, f.name form_name, f.schema, fv.schema vschema FROM form_responses fr LEFT JOIN forms f ON f.id=fr.form_id LEFT JOIN form_versions fv ON fv.form_id=fr.form_id AND fv.version=fr.form_version WHERE fr.id=?", c.response_id) : null;
  const reqs = all<any>("SELECT ir.*, u.name creator, d.name doc_name FROM info_requests ir LEFT JOIN users u ON u.id=ir.created_by LEFT JOIN documents d ON d.id=ir.doc_id WHERE ir.case_id=? ORDER BY ir.id DESC", id);
  const reqIds = reqs.map((r) => String(r.id));
  const history = all<any>(`SELECT * FROM audit_log WHERE (entity='validation_case' AND entity_id=?) ${reqIds.length ? `OR (entity='info_request' AND entity_id IN (${reqIds.map(() => "?").join(",")}))` : ""} ORDER BY id DESC LIMIT 60`, String(id), ...reqIds);
  const w = waitTime(c.created_at, isOpen ? null : c.decided_at);
  const vals = validators();

  return (
    <>
      <PageHeader icon={PageIcon} title={c.applicant} subtitle={`${KIND_LABEL[c.kind] || c.kind} · ${c.program || "Sin programa"} · Solicitud #${c.id}`}
        actions={<Link href="/validacion" className="btn-ghost">← Bandeja</Link>} />
      <Flash sp={sp} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={statusTone(c.status)}>{CASE_STATUS[c.status]}</Badge>
        <span className="text-slate-500">{isOpen ? "Esperando hace" : "Resuelta en"} <b className="text-slate-800">{w.label}</b> (desde {fmtDate(c.created_at)})</span>
        <span className="text-slate-500">Responsable: <b className="text-slate-800">{c.assignee || "sin asignar"}</b></span>
        {c.decider && <span className="text-slate-500">Decidió: <b className="text-slate-800">{c.decider}</b> el {fmtDate(c.decided_at)}</span>}
      </div>
      {c.reason && !isOpen && <Notice kind={c.status === "aprobado" ? "ok" : "error"}>Motivo de la decisión: {c.reason}</Notice>}
      {c.status === "ajustes" && c.reason && <Notice>Ajustes solicitados: {c.reason}</Notice>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Solicitante */}
          <section className="card" aria-labelledby="sol">
            <h2 id="sol" className="mb-3 font-semibold text-ink">Datos de la solicitud</h2>
            {company && (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Razón social</dt><dd>{company.razon_social}</dd></div>
                <div><dt className="text-xs text-slate-500">NIT</dt><dd>{company.nit}-{company.dv}</dd></div>
                <div><dt className="text-xs text-slate-500">Sector / tamaño</dt><dd>{company.sector || "—"} · {company.size || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Ciudad</dt><dd>{company.city || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Estado de la empresa</dt><dd><Badge>{company.status}</Badge></dd></div>
                <div><dt className="text-xs text-slate-500">Origen</dt><dd>{company.source || "—"}</dd></div>
              </dl>)}
            {resp && (
              <div className={company ? "mt-4 border-t border-slate-100 pt-4" : ""}>
                <div className="mb-2 text-sm">Formulario <b>{resp.form_name}</b> {resp.form_version ? `(v${resp.form_version})` : ""} · enviado {fmtDate(resp.submitted_at || resp.created_at)} · estado de la respuesta <Badge>{resp.status}</Badge></div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {answersWithLabels(resp.vschema || resp.schema, resp.answers).map((a, i) => (
                    <div key={i}><dt className="text-xs text-slate-500">{a.label}</dt><dd className="break-words">{a.value || "—"}</dd></div>))}
                </dl>
              </div>)}
            {!company && !resp && <p className="text-sm text-slate-500">La solicitud no tiene empresa ni respuesta asociada.</p>}
          </section>

          {/* Automática */}
          <section className="card" aria-labelledby="auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="auto" className="font-semibold text-ink">Validación automática <Badge tone={autoTone(auto)}>{autoSummary(auto)}</Badge></h2>
              {manage && isOpen && <form action={A.runAuto}><input type="hidden" name="id" value={id} /><button className="btn-ghost btn-sm">Volver a consultar</button></form>}
            </div>
            {!auto ? <p className="text-sm text-slate-500">Aún no se ha ejecutado.</p> : (
              <>
                <p className="mb-2 text-xs text-slate-500">Fuente: {auto.source} · {fmtDate(auto.at)}</p>
                {auto.error && <Notice kind="error">{auto.error}</Notice>}
                {auto.results.length > 0 && (
                  <Table head={["Regla", "Condición", "Valor encontrado", "Resultado"]}>
                    {auto.results.map((r, i) => (
                      <tr key={i}>
                        <Td>{r.name}</Td>
                        <Td className="text-xs">{campoLabel(r.field)} {opLabel(r.operator)} {r.operator === "existe" ? "" : r.expected}</Td>
                        <Td>{fmtData(r.field, r.actual)}</Td>
                        <Td>{r.ok ? <Badge tone="green">Cumple</Badge> : <Badge tone="red">No cumple</Badge>}</Td>
                      </tr>))}
                  </Table>)}
                {auto.found && auto.results.length === 0 && <p className="text-sm text-amber-700">El programa no tiene reglas activas. <Link className="underline" href="/validacion/reglas">Configurar reglas</Link></p>}
              </>)}
          </section>

          {/* Manual */}
          <section className="card" aria-labelledby="manual">
            <h2 id="manual" className="mb-1 font-semibold text-ink">Validación manual complementaria</h2>
            {checklist && <p className="mb-3 text-xs text-slate-500">Última validación manual: <b>{checklist.by_name || get<any>("SELECT name FROM users WHERE id=?", checklist.by)?.name}</b> · {fmtDate(checklist.at)}</p>}
            {manage && isOpen ? (
              <form action={A.saveManual} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <fieldset className="space-y-2">
                  <legend className="label">Lista de chequeo</legend>
                  {items.map((label, i) => {
                    const prev = checklist?.items?.find((x: any) => x.label === label);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2">
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" name={`chk_${i}`} defaultChecked={!!prev?.ok} className="h-4 w-4" />{label}</label>
                        <input name={`note_${i}`} defaultValue={prev?.note || ""} placeholder="Nota (opcional)" aria-label={`Nota: ${label}`} className="input !w-full sm:!w-56 !py-1 text-xs" />
                      </div>);
                  })}
                </fieldset>
                <Field label="Observaciones (por qué) *"><textarea name="observations" required rows={3} defaultValue={c.observations || ""} className="input" /></Field>
                <button className="btn">Guardar validación manual</button>
              </form>
            ) : (
              <>
                {checklist ? <ul className="space-y-1 text-sm">{checklist.items.map((x: any, i: number) => <li key={i}>{x.ok ? "✅" : "⬜"} {x.label}{x.note ? <span className="text-slate-500"> — {x.note}</span> : null}</li>)}</ul>
                  : <p className="text-sm text-slate-500">Sin validación manual.</p>}
                {c.observations && <p className="mt-3 whitespace-pre-line text-sm"><span className="text-slate-500">Observaciones:</span> {c.observations}</p>}
              </>)}
          </section>

          {/* Solicitudes de información */}
          <section className="card" aria-labelledby="info">
            <h2 id="info" className="mb-3 font-semibold text-ink">Documentos e información adicional</h2>
            {reqs.length === 0 ? <p className="mb-3 text-sm text-slate-500">No se ha solicitado información adicional.</p> : (
              <ul className="mb-4 space-y-3">
                {reqs.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>#{r.id} · {r.message}</b><Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Solicitó {r.creator || "sistema"} el {fmtDate(r.created_at)} · plazo {fmtDate(r.due_at)}{r.reminded_at ? ` · recordatorio ${fmtDate(r.reminded_at)}` : ""}</div>
                    {r.status === "respondida" && (
                      <div className="mt-2 rounded bg-emerald-50 p-2">
                        <div className="text-xs text-emerald-800">Respuesta del {fmtDate(r.answered_at)}</div>
                        {r.response && <p className="whitespace-pre-line">{r.response}</p>}
                        {r.doc_id && <a className="text-brand underline" href={`/api/docs/${r.doc_id}`}>📎 {r.doc_name}</a>}
                      </div>)}
                  </li>))}
              </ul>)}
            {manage && isOpen && (
              <form action={A.requestInfo} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="id" value={id} />
                <div className="sm:col-span-3"><Field label="Qué se necesita *"><input name="message" required placeholder="Ej.: certificado de ventas brutas del último año" className="input" /></Field></div>
                <Field label="Plazo *"><input type="date" name="due" required min={tomorrowPlus(1)} defaultValue={tomorrowPlus(5)} className="input" /></Field>
                <div className="sm:col-span-4"><button className="btn-ghost">Solicitar al solicitante</button>
                  <span className="ml-2 text-xs text-slate-500">Se notifica por correo, SMS y WhatsApp; se envía recordatorio antes del vencimiento.</span></div>
              </form>)}
          </section>
        </div>

        <aside className="space-y-5">
          {manage && isOpen && (
            <section className="card" aria-labelledby="dec">
              <h2 id="dec" className="mb-3 font-semibold text-ink">Decisión</h2>
              <form action={A.decide} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <fieldset className="space-y-1 text-sm">
                  <legend className="label">Resultado</legend>
                  <label className="flex items-center gap-2"><input type="radio" name="decision" value="aprobado" required /> Aprobar{c.kind === "empresa" ? " y activar la empresa" : ""}</label>
                  <label className="flex items-center gap-2"><input type="radio" name="decision" value="ajustes" /> Pedir ajustes</label>
                  <label className="flex items-center gap-2"><input type="radio" name="decision" value="rechazado" /> Rechazar</label>
                </fieldset>
                <Field label="Motivo (lo recibe el solicitante)"><textarea name="reason" rows={3} className="input" placeholder="Obligatorio para rechazar o pedir ajustes" /></Field>
                <Field label="Plazo para ajustes" hint="Solo si pides ajustes"><input type="date" name="due" min={tomorrowPlus(1)} defaultValue={tomorrowPlus(5)} className="input" /></Field>
                <button className="btn w-full">Registrar decisión</button>
              </form>
            </section>)}
          {manage && isOpen && (
            <section className="card" aria-labelledby="asg">
              <h2 id="asg" className="mb-3 font-semibold text-ink">Responsable</h2>
              <form action={A.assignCases} className="flex gap-2">
                <input type="hidden" name="ids" value={id} /><input type="hidden" name="back" value={`/validacion/${id}`} />
                <select name="assignee" defaultValue={c.assigned_to || ""} aria-label="Validador" className="input"><option value="">Validador…</option>{vals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                <button className="btn-ghost">Asignar</button>
              </form>
            </section>)}
          <section className="card" aria-labelledby="his">
            <h2 id="his" className="mb-3 font-semibold text-ink">Trazabilidad</h2>
            <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
              {history.map((h) => {
                const after = jparse<any>(h.after, {});
                return (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
                    <div className="font-medium">{ACTION_LABEL[h.action] || h.action.replaceAll("_", " ")}</div>
                    <div className="text-xs text-slate-500">{fmtDate(h.ts)} · {h.user_email || "sistema"}</div>
                    {after.status && <div className="text-xs">Estado: {CASE_STATUS[after.status] || after.status}</div>}
                    {after.reason && <div className="text-xs">Motivo: {after.reason}</div>}
                    {after.resultado && <div className="text-xs">Resultado: {after.resultado}{after.motivo ? ` — ${after.motivo}` : ""}</div>}
                    {after.observations && <div className="text-xs">Observaciones: {after.observations}</div>}
                    {after.message && <div className="text-xs">Solicitud: {after.message}</div>}
                  </li>);
              })}
              {!history.length && <li className="text-slate-400">Sin movimientos</li>}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
