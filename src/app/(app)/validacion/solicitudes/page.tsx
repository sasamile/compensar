import { ShieldCheck as PageIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import { CASE_STATUS, KIND_LABEL, processDueRequests, statusTone, waitTime } from "@/lib/validation";
import { ALLOWED } from "@/lib/onbase";
import * as A from "../actions";

/** Vista del solicitante (empresa): estado de sus trámites y respuesta a solicitudes de información (FUN-75, FUN-76). */
export default async function MisSolicitudes({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!u.company_id && (can(u, "validation.view") || can(u, "validation.manage"))) redirect("/validacion");
  await processDueRequests();
  const sp = await searchParams;
  const cid = u.company_id ?? -1;
  const cases = all<any>(`SELECT vc.*, p.name program, COALESCE(c.razon_social, f.name) subject FROM validation_cases vc
    LEFT JOIN companies c ON c.id=vc.company_id LEFT JOIN form_responses fr ON fr.id=vc.response_id LEFT JOIN forms f ON f.id=fr.form_id
    LEFT JOIN programs p ON p.id=vc.program_id
    WHERE vc.company_id=? OR fr.company_id=? OR fr.user_id=? ORDER BY vc.id DESC`, cid, cid, u.id);
  const reqs = cases.length ? all<any>(`SELECT ir.*, d.name doc_name FROM info_requests ir LEFT JOIN documents d ON d.id=ir.doc_id
    WHERE ir.case_id IN (${cases.map(() => "?").join(",")}) ORDER BY CASE ir.status WHEN 'abierta' THEN 0 ELSE 1 END, ir.due_at`, ...cases.map((c) => c.id)) : [];
  const open = reqs.filter((r) => r.status === "abierta");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={PageIcon} title="Mis solicitudes de validación" subtitle="Estado de tu registro e inscripciones, y la información que Compensar te pide" />
      <Flash sp={sp} />
      {cases.length === 0 && <EmptyState title="No tienes solicitudes en validación">Cuando te registres o te inscribas a un programa verás aquí su estado.</EmptyState>}

      {open.length > 0 && <h2 className="mb-2 font-semibold text-ink">Pendiente por responder ({open.length})</h2>}
      <div className="space-y-4">
        {open.map((r) => {
          const left = waitTime(new Date().toISOString(), r.due_at);
          return (
            <section key={r.id} className="card border-violet-200" aria-labelledby={`req-${r.id}`}>
              <h3 id={`req-${r.id}`} className="font-semibold text-ink">{r.message}</h3>
              <p className="mt-1 text-sm text-slate-600">Plazo: <b>{fmtDate(r.due_at)}</b> <span className="text-xs text-slate-500">(quedan {left.label})</span></p>
              <form action={A.answerRequest} className="mt-3 space-y-3">
                <input type="hidden" name="request_id" value={r.id} />
                <Field label="Tu respuesta"><textarea name="response" rows={3} className="input" placeholder="Escribe la información solicitada o una aclaración" /></Field>
                <Field label="Adjuntar documento" hint={`Formatos: ${ALLOWED.join(", ")} · máximo 20 MB`}>
                  <input type="file" name="file" accept={ALLOWED.join(",")} className="block w-full text-sm" />
                </Field>
                <button className="btn w-full sm:w-auto">Enviar respuesta</button>
              </form>
            </section>);
        })}
      </div>

      {cases.length > 0 && <h2 className="mb-2 mt-6 font-semibold text-ink">Mis trámites</h2>}
      <ul className="space-y-3">
        {cases.map((c) => (
          <li key={c.id} className="card !p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b>{KIND_LABEL[c.kind]}</b> <span className="text-sm text-slate-500">· {c.subject} · {c.program}</span></div>
              <Badge tone={statusTone(c.status)}>{CASE_STATUS[c.status]}</Badge>
            </div>
            <div className="mt-1 text-xs text-slate-500">Radicada el {fmtDate(c.created_at)}{c.decided_at ? ` · última decisión ${fmtDate(c.decided_at)}` : ""}</div>
            {c.reason && ["aprobado", "rechazado", "ajustes"].includes(c.status) && <p className="mt-2 text-sm"><span className="text-slate-500">Motivo:</span> {c.reason}</p>}
            {reqs.filter((r) => r.case_id === c.id && r.status !== "abierta").map((r) => (
              <div key={r.id} className="mt-2 rounded bg-slate-50 p-2 text-xs">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge> {r.message}
                {r.status === "respondida" && <span className="text-slate-500"> — respondida el {fmtDate(r.answered_at)}{r.doc_id ? <> · <a className="text-brand underline" href={`/api/docs/${r.doc_id}`}>{r.doc_name}</a></> : null}</span>}
                {r.status === "vencida" && <span className="text-red-700"> — venció el {fmtDate(r.due_at)}</span>}
              </div>))}
          </li>))}
      </ul>
    </div>
  );
}
