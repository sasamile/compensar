import { FileText as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get, setting } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import FormAnswers from "@/components/form-answers";
import FormResult from "@/components/form-result";
import { fmtDate, jparse } from "@/lib/util";
import { parseSchema, parseScoring, statusLabel } from "@/lib/forms";
import { canSeeResponses, folio, getForm, versionOf } from "../../../server";
import { setResponseStatus } from "../../../actions";

export default async function Respuesta({ params, searchParams }: { params: Promise<{ id: string; rid: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const { id, rid } = await params;
  const sp = await searchParams;
  const f = getForm(Number(id));
  const r = get<any>(`SELECT r.*, c.razon_social company, c.nit, c.dv, us.name user_name FROM form_responses r
    LEFT JOIN companies c ON c.id=r.company_id LEFT JOIN users us ON us.id=r.user_id WHERE r.id=? AND r.form_id=?`, Number(rid), Number(id));
  if (!f || !r || !canSeeResponses(u, f)) redirect("/sin-acceso");
  const v = versionOf(f.id, r.form_version);
  const schema = v?.schema ?? parseSchema(f.schema);
  const answers = jparse<any>(r.answers, {});
  const result = r.result ? jparse<any>(r.result, null) : null;
  const vc = get<any>("SELECT * FROM validation_cases WHERE response_id=?", r.id);
  const diag = get<any>("SELECT * FROM diagnostics WHERE response_id=?", r.id);
  const history = all<any>("SELECT * FROM audit_log WHERE entity='form_response' AND entity_id=? ORDER BY id", String(r.id));
  const decidable = !["inscripcion", "diagnostico"].includes(f.kind) && r.status !== "borrador";
  return (
    <>
      <div className="mb-4 hidden items-center justify-between border-b-4 pb-3 print:flex" style={{ borderColor: setting("brand_color", "#0a6cff") }}>
        <b className="text-xl">{setting("brand_name", "Compensar")}</b><span className="text-sm">{setting("brand_tagline")}</span>
      </div>
      <PageHeader icon={PageIcon} title={`Respuesta ${folio(r)}`} subtitle={`${f.name} · diligenciada con la versión ${r.form_version}${r.form_version !== f.version ? ` (vigente: v${f.version})` : ""}`}
        actions={<><Link href={`/formularios/${f.id}/respuestas`} className="btn-ghost print:hidden">Volver</Link><PrintButton /></>} />
      <Flash sp={sp} />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="card"><div className="label">Estado</div><Badge>{statusLabel(r.status)}</Badge>{r.decision_reason && <p className="mt-1 text-xs text-slate-600">Motivo: {r.decision_reason}</p>}</div>
        <div className="card"><div className="label">Empresa</div>{r.company ? <><b>{r.company}</b><div className="text-xs text-slate-500">NIT {r.nit}-{r.dv}</div></> : <span className="text-slate-400">—</span>}</div>
        <div className="card"><div className="label">Diligenciada por</div>{r.user_name || "Participante sin cuenta"}<div className="text-xs text-slate-500">{r.email}</div></div>
        <div className="card"><div className="label">Fechas</div><div className="text-xs">Creada {fmtDate(r.created_at)}<br />Enviada {fmtDate(r.submitted_at)}<br />Actualizada {fmtDate(r.updated_at)}</div></div>
      </div>
      {vc && <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 print:hidden">Caso de validación #{vc.id}: <b>{vc.status}</b>. La decisión se toma en la <Link className="underline" href="/validacion">bandeja de Validación de requisitos</Link>.</div>}
      {diag && <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 print:hidden">Diagnóstico {diag.stage} · {diag.status}. <Link className="underline" href={`/diagnosticos/${diag.id}`}>Ver en Diagnósticos</Link></div>}
      {result && <div className="mb-6"><h2 className="mb-3 font-semibold text-ink">Resultado</h2><FormResult result={result} levels={parseScoring(f.scoring).levels} /></div>}
      <div className="card mb-6"><h2 className="mb-4 font-semibold text-ink">Respuestas</h2><FormAnswers schema={schema} answers={answers} showEmpty fileBase={`/api/formularios/${f.id}/archivo?r=${r.id}`} /></div>
      <div className="grid gap-6 md:grid-cols-2 print:hidden">
        {decidable && (can(u, "forms.responses") || can(u, "forms.manage")) && (
          <form action={setResponseStatus} className="card space-y-3">
            <input type="hidden" name="id" value={r.id} />
            <h2 className="font-semibold text-ink">Cambiar estado</h2>
            <Field label="Nuevo estado"><select name="status" className="input" defaultValue={r.status === "enviado" ? "en_revision" : r.status}>
              <option value="en_revision">En revisión</option><option value="ajustes">Requiere ajustes (el participante podrá editar)</option><option value="aprobado">Aprobado</option><option value="rechazado">Rechazado</option></select></Field>
            <Field label="Motivo u observaciones" hint="Obligatorio para «ajustes» y «rechazado». El participante lo verá."><textarea name="reason" rows={2} className="input" defaultValue={r.decision_reason || ""} /></Field>
            <button className="btn">Guardar y notificar</button>
          </form>)}
        <div className="card">
          <h2 className="mb-2 font-semibold text-ink">Historial</h2>
          <ol className="space-y-1.5 text-sm">
            {history.map((h) => <li key={h.id} className="flex gap-2"><span className="w-36 shrink-0 text-xs text-slate-400">{fmtDate(h.ts)}</span><span><b>{h.action.replace(/_/g, " ")}</b> · {h.user_email || "participante"}{h.after && jparse<any>(h.after, {}).status ? ` → ${jparse<any>(h.after, {}).status}` : ""}</span></li>)}
            {!history.length && <li className="text-slate-400">Sin eventos</li>}
          </ol>
        </div>
      </div>
    </>
  );
}
