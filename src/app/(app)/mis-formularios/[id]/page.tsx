import { ClipboardList as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Flash, PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import FormAnswers from "@/components/form-answers";
import { fmtDate, jparse } from "@/lib/util";
import { parseSchema, statusLabel } from "@/lib/forms";
import { canSeeResponse, folio, getForm, syncValidationStatuses, versionOf } from "../../formularios/server";

export default async function MiRespuesta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  syncValidationStatuses(u.id);
  const r = get<any>("SELECT * FROM form_responses WHERE id=?", Number((await params).id));
  const f = r && getForm(r.form_id);
  if (!r || !f || !(r.user_id === u.id || (u.company_id && r.company_id === u.company_id) || canSeeResponse(u, r, f))) redirect("/sin-acceso");
  if (f.kind === "diagnostico") {
    const d = get<any>("SELECT id FROM diagnostics WHERE response_id=?", r.id);
    if (d) redirect(`/diagnosticos/${d.id}`);
  }
  const schema = versionOf(f.id, r.form_version)?.schema ?? parseSchema(f.schema);
  const vc = get<any>("SELECT * FROM validation_cases WHERE response_id=?", r.id);
  const info = vc ? all<any>("SELECT * FROM info_requests WHERE case_id=? ORDER BY id DESC", vc.id) : [];
  const events = all<any>("SELECT ts, action, after FROM audit_log WHERE (entity='form_response' AND entity_id=?) ORDER BY id", String(r.id));
  const editable = ["borrador", "ajustes"].includes(r.status) && f.status === "publicado";
  return (
    <>
      <PageHeader icon={PageIcon} title={f.name} subtitle={`Radicado ${folio(r)} · versión ${r.form_version} del formulario`}
        actions={<>{editable && <Link className="btn" href={`/f/${f.slug}?r=${r.id}`}>{r.status === "ajustes" ? "Corregir y reenviar" : "Continuar"}</Link>}<Link href="/mis-formularios" className="btn-ghost print:hidden">Volver</Link><PrintButton label="Descargar PDF" /></>} />
      <Flash sp={sp} />
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="card"><div className="label">Estado</div><Badge tone={r.status === "ajustes" ? "amber" : undefined}>{statusLabel(r.status)}</Badge>
          {r.decision_reason && <p className="mt-2 text-sm text-slate-700"><b>Motivo:</b> {r.decision_reason}</p>}</div>
        <div className="card"><div className="label">Enviado</div>{fmtDate(r.submitted_at)}<div className="text-xs text-slate-400">Última actualización {fmtDate(r.updated_at)}</div></div>
        <div className="card"><div className="label">Línea de tiempo</div>
          <ol className="space-y-0.5 text-xs text-slate-600">{events.map((e, i) => <li key={i}>{fmtDate(e.ts)} · {e.action.replace(/_/g, " ")}{jparse<any>(e.after, {}).status ? ` → ${statusLabel(jparse<any>(e.after, {}).status)}` : ""}</li>)}</ol></div>
      </div>
      {info.filter((x) => x.status === "abierta").map((x) => (
        <div key={x.id} className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Solicitud de información:</b> {x.message}{x.due_at && <> · plazo {fmtDate(x.due_at, false)}</>}
        </div>))}
      <div className="card"><h2 className="mb-4 font-semibold text-ink">Tus respuestas</h2>
        <FormAnswers schema={schema} answers={jparse(r.answers, {})} showEmpty fileBase={`/api/formularios/${f.id}/archivo?r=${r.id}`} /></div>
    </>
  );
}
