"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { canRunSurveyJob, runSurveys, SURVEY_JOINS, surveyFilter, surveyUrl } from "@/lib/surveys";

const go = (kind: "ok" | "error", m: string, tab = "envios"): never => {
  revalidatePath("/encuestas");
  redirect(`/encuestas?tab=${tab}&${kind}=${encodeURIComponent(m)}`);
};

/** «Ejecutar ahora» del envío automático de encuestas (mismo proceso que el job). */
export async function runSurveysNow() {
  const u = await requireUser();
  requirePerm(u, "surveys.view");
  if (!canRunSurveyJob(u)) redirect("/sin-acceso");
  const r = await runSurveys(u);
  const total = r.cierres + r.remisiones + r.eventos;
  go("ok", total ? `Se enviaron ${total} encuesta(s): ${r.cierres} por cierre aprobado, ${r.remisiones} por remisión cerrada y ${r.eventos} a asistentes de eventos` : "No hay cierres, remisiones ni eventos pendientes de encuesta");
}

/** Reenvía el aviso de una encuesta pendiente. */
export async function resendSurvey(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "surveys.view");
  const f = surveyFilter(u);
  const s = get<any>(`SELECT s.*, COALESCE(ev.title, sv.name, 'acompañamiento empresarial') subject FROM surveys s ${SURVEY_JOINS} WHERE s.id=? AND ${f.sql}`, Number(fd.get("id")), ...f.params);
  if (!s) redirect("/sin-acceso");
  if (s.status !== "enviada") go("error", "La encuesta ya fue respondida");
  const to = s.user_id ? get<any>("SELECT * FROM users WHERE id=?", s.user_id)
    : get<any>("SELECT * FROM users WHERE company_id=? AND status IN ('activo','invitado') ORDER BY is_principal DESC LIMIT 1", s.company_id)
      ?? (s.event_id ? get<any>("SELECT email, phone, user_id id FROM registrations WHERE event_id=? AND company_id=?", s.event_id, s.company_id) : null);
  if (!to) go("error", "La encuesta no tiene un destinatario con datos de contacto");
  notify({ key: "encuesta", vars: { name: s.subject, url: surveyUrl(s.token) }, email: to.email, phone: to.phone, userId: to.id ?? null });
  await audit(u, "reenviar_encuesta", "survey", s.id, null, { to: to.email });
  go("ok", `Aviso reenviado a ${to.email || to.phone}`);
}
