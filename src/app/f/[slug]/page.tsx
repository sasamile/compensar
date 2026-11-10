/** Enlace público de un formulario (RF-FRM-06). Pide inicio de sesión si el formulario lo exige. */
import Link from "next/link";
import { get } from "@/lib/db";
import { can, currentUser } from "@/lib/auth";
import { Badge, Flash } from "@/components/ui";
import FormRenderer from "@/components/form-renderer";
import FormPublicFrame from "@/components/form-public-frame";
import { fmtDate, jparse } from "@/lib/util";
import { DIAG_STAGES, statusLabel } from "@/lib/forms";
import { folio, getFormBySlug, nextStage, versionOf } from "../../(app)/formularios/server";
import { saveDraft, startSelfDiagnostic, submitResponse, uploadFormFile } from "../actions";

export const dynamic = "force-dynamic";

export default async function PublicForm({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<any> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const f = getFormBySlug(slug);
  const u = await currentUser();
  const Frame = ({ children }: { children: React.ReactNode }) => <FormPublicFrame userName={u?.name}>{children}</FormPublicFrame>;
  if (!f || f.status !== "publicado" || !f.version) return <Frame><div className="card text-center"><h1 className="text-lg font-semibold text-ink">Formulario no disponible</h1><p className="mt-1 text-sm text-slate-500">El enlace no existe o el formulario ya no recibe respuestas.</p></div></Frame>;
  const v = versionOf(f.id)!;
  const program = f.program_id ? get<any>("SELECT name FROM programs WHERE id=?", f.program_id)?.name : null;
  const event = f.event_id ? get<any>("SELECT title, slug FROM events WHERE id=?", f.event_id) : null;
  const head = (
    <div className="mb-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand">{[program, event?.title].filter(Boolean).join(" · ") || "Formulario"}</div>
      <h1 className="mt-1 text-2xl font-bold text-ink">{f.name}</h1>
      {f.description && <p className="mt-1 whitespace-pre-line text-slate-600">{f.description}</p>}
    </div>);

  // Diagnóstico: autodiagnóstico desde la cuenta de la empresa (RF-DIA-04)
  if (f.kind === "diagnostico") {
    const open = u?.company_id ? get<any>("SELECT * FROM diagnostics WHERE company_id=? AND form_id=? AND status IN ('asignado','en_curso')", u.company_id, f.id) : null;
    return (
      <Frame>{head}
        <div className="card">
          {!u ? <><p className="mb-3 text-sm text-slate-600">Ingresa con la cuenta de tu empresa para hacer el autodiagnóstico. Obtendrás tu puntaje, nivel y recomendaciones al terminar.</p>
            <Link href={`/login?mode=codigo&next=/f/${f.slug}`} className="btn">Ingresar</Link></>
            : open ? <><p className="mb-3 text-sm text-slate-600">Tienes un diagnóstico {open.stage} {open.status === "en_curso" ? "en curso" : "pendiente"}.</p><Link className="btn" href={`/diagnosticos/${open.id}`}>Continuar</Link></>
            : u.company_id && can(u, "diagnostics.self") ? (
              <form action={startSelfDiagnostic} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="form_id" value={f.id} />
                <label className="block"><span className="label">Etapa</span>
                  <select name="stage" className="input" defaultValue={nextStage(u.company_id, f.id)}>{DIAG_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <button className="btn">Iniciar autodiagnóstico</button>
              </form>)
            : <p className="text-sm text-slate-600">Los diagnósticos se asignan y consultan en <Link className="text-brand underline" href="/diagnosticos">Diagnósticos</Link>.</p>}
        </div>
      </Frame>);
  }

  if (f.requires_login && !u) return (
    <Frame>{head}
      <div className="card text-center">
        <p className="mb-3 text-sm text-slate-600">Para diligenciar este formulario ingresa con tu cuenta. Tu avance se guarda automáticamente y podrás continuar después.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/login?mode=codigo&next=/f/${f.slug}`} className="btn">Ingresar como empresa</Link>
          <Link href={`/login?next=/f/${f.slug}`} className="btn-ghost">Ingresar como funcionario</Link>
          <Link href="/registro" className="btn-ghost">Registrar mi empresa</Link>
        </div>
      </div>
    </Frame>);

  const settings = v.schema.settings || {};
  let resp: any = null, notice = "";
  if (u) {
    if (sp.r) {
      resp = get<any>("SELECT * FROM form_responses WHERE id=? AND form_id=?", Number(sp.r), f.id);
      if (resp && !(resp.user_id === u.id || (u.company_id && resp.company_id === u.company_id))) resp = null;
    } else if (!sp.nuevo) {
      resp = get<any>("SELECT * FROM form_responses WHERE form_id=? AND user_id=? AND status='borrador' ORDER BY id DESC LIMIT 1", f.id, u.id)
        ?? get<any>(`SELECT * FROM form_responses WHERE form_id=? AND status='ajustes' AND (user_id=? OR (company_id IS NOT NULL AND company_id=?)) ORDER BY id DESC LIMIT 1`, f.id, u.id, u.company_id ?? -1);
    }
    const sent = get<any>(`SELECT * FROM form_responses WHERE form_id=? AND status NOT IN ('borrador','ajustes') AND ${u.company_id ? "company_id=?" : "user_id=?"} ORDER BY id DESC LIMIT 1`, f.id, u.company_id ?? u.id);
    if (resp && !["borrador", "ajustes"].includes(resp.status)) {
      return <Frame>{head}<Sent r={resp} /></Frame>;
    }
    if (!resp && sent && !settings.allowMultiple) return <Frame>{head}<Sent r={sent} /></Frame>;
    if (!resp && sent && settings.allowMultiple) notice = `Ya enviaste este formulario el ${fmtDate(sent.submitted_at)}. Puedes enviar una nueva respuesta.`;
    if (resp?.status === "ajustes") notice = `Tu respuesta requiere ajustes: ${resp.decision_reason || "revisa la información"}. Corrige y vuelve a enviar.`;
    else if (resp?.status === "borrador") notice = `Continúas tu borrador (guardado ${fmtDate(resp.updated_at)}).${resp.form_version !== f.version ? " El formulario se actualizó: revisa las preguntas nuevas." : ""}`;
  }
  return (
    <Frame>{head}
      <Flash sp={sp} />
      <div className="card">
        <FormRenderer schema={v.schema} kind={f.kind} formId={f.id} responseId={resp?.id ?? null}
          initialAnswers={resp ? jparse(resp.answers, {}) : {}} anonymous={!u} notice={notice || undefined}
          submitLabel={resp?.status === "ajustes" ? "Reenviar" : "Enviar"}
          saveAction={saveDraft} submitAction={submitResponse} uploadAction={uploadFormFile} />
      </div>
      {!u && <p className="mt-3 text-center text-xs text-slate-400">Sin iniciar sesión, tu borrador se guarda solo en este navegador.</p>}
    </Frame>
  );
}

function Sent({ r }: { r: any }) {
  return (
    <div className="card text-center">
      <div className="text-sm text-slate-500">Respuesta {folio(r)}</div>
      <h2 className="mt-1 text-lg font-semibold text-ink">Ya enviaste este formulario</h2>
      <p className="mt-2"><Badge>{statusLabel(r.status)}</Badge></p>
      {r.decision_reason && <p className="mt-2 text-sm text-slate-600">Motivo: {r.decision_reason}</p>}
      <p className="mt-1 text-xs text-slate-400">Enviado el {fmtDate(r.submitted_at)}</p>
      <Link href={`/mis-formularios/${r.id}`} className="btn mt-4">Ver mi respuesta y su estado</Link>
    </div>
  );
}
