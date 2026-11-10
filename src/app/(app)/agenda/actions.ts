"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { can, canSeeCompany, clientIp, requirePerm, requireUser, sessionFilter, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fmtDate, localToIso } from "@/lib/util";
import { storeDocument } from "@/lib/onbase";
import { emit } from "@/lib/webhooks";
import { syncSessionCalendar } from "@/lib/integrations/m365";
import * as L from "./agenda-lib";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (id: number | string, kind: "ok" | "error", m: string) => { revalidatePath(`/agenda/${id}`); redirect(`/agenda/${id}?${kind}=${encodeURIComponent(m)}`); };
const list = (kind: "ok" | "error", m: string) => redirect(`/agenda?${kind}=${encodeURIComponent(m)}`);

function mySession(u: User, id: number) {
  const f = sessionFilter(u);
  const x = get<any>(`SELECT s.* FROM mentoring_sessions s WHERE s.id=? AND ${f.sql}`, id, ...f.params);
  if (!x) redirect("/sin-acceso");
  return x;
}
function closed(sess: any) {
  if (!sess.referral_id) return false;
  return !!get("SELECT 1 FROM closures WHERE referral_id=? AND status='aprobado'", sess.referral_id); // un cierre aprobado impide nuevas sesiones
}
const fmtConflict = (c: any[]) => c.map((x) => `«${x.title}» con ${x.razon_social} (${fmtDate(x.scheduled_at)})`).join("; ");
const MODS = ["virtual", "presencial"];

/** Programa la sesión (mentor, Gestor de Mentorías o Administrador). Choque con otra sesión del mentor = bloqueo; fuera de disponibilidad = advertencia. */
export async function scheduleSession(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "sessions.schedule");
  const cid = Number(fd.get("company_id"));
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  const c = get<any>("SELECT * FROM companies WHERE id=?", cid);
  if (c.status !== "activa") list("error", "La empresa no está activa");
  const referralId = Number(fd.get("referral_id")) || null;
  if (referralId && !get("SELECT 1 FROM referrals WHERE id=? AND company_id=?", referralId, cid)) list("error", "El servicio remitido no corresponde a la empresa elegida");
  let mentorId = Number(fd.get("mentor_id")) || u.id;
  if (!can(u, "mentors.assign") && !can(u, "config.manage")) mentorId = u.id; // el mentor agenda para sí mismo
  const at = localToIso(s(fd, "scheduled_at"));
  if (!at) list("error", "Define fecha y hora");
  const dur = Math.round(Number(fd.get("duration") || 60));
  if (!(dur >= 15 && dur <= 480)) list("error", "La duración debe estar entre 15 y 480 minutos");
  const modality = MODS.includes(s(fd, "modality")) ? s(fd, "modality") : "virtual";
  if (closed({ referral_id: referralId })) list("error", "El servicio tiene un cierre aprobado: no se pueden programar más sesiones");
  const clash = L.conflicts(mentorId, at!, dur);
  if (clash.length) list("error", `El mentor ya tiene una sesión en ese horario: ${fmtConflict(clash)}. Elige otra hora.`);
  const avail = L.withinAvailability(mentorId, at!, dur);
  const id = insert(`INSERT INTO mentoring_sessions(company_id,mentor_id,referral_id,program_id,title,scheduled_at,duration_min,modality,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    cid, mentorId, referralId, c.program_id, s(fd, "title").slice(0, 120) || "Sesión de mentoría", at, dur, modality, "programada", u.id, now());
  const sess = get<any>("SELECT * FROM mentoring_sessions WHERE id=?", id);
  await audit(u, "programar", "session", id, null, { ...sess, fuera_disponibilidad: !avail.ok });
  const cal = await syncSessionCalendar(u, id, "crear");
  L.notifyParties("sesion_programada", sess);
  if (!avail.ok && mentorId !== u.id) L.warnMentor(sess, avail.reason!);
  const warn = avail.ok ? "" : ` ⚠ Advertencia: ${avail.reason}.`;
  const calMsg = cal.mode === "graph" ? (cal.ok ? " Evento creado en el Outlook del mentor." : " Outlook no respondió: la sincronización quedó en cola.") : " Invitación .ics enviada a los participantes.";
  redirect(`/agenda/${id}?ok=${encodeURIComponent("Sesión programada." + calMsg + warn)}`);
}

/** La empresa programa con su mentor (asignado o de remisión aceptada) eligiendo una franja disponible (RF-ACO-05). */
export async function companySchedule(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "sessions.view");
  if (!u.company_id) redirect("/sin-acceso");
  const c = get<any>("SELECT * FROM companies WHERE id=?", u.company_id);
  if (c?.status !== "activa") list("error", "Tu empresa no está activa en el programa");
  // pick = "<mentor>:<remisión>|<inicio ISO>" (franja elegida en la lista o en el calendario)
  const [who, at] = s(fd, "pick").split("|");
  const [mentorId, referralId] = String(who || "").split(":").map((x) => Number(x) || null);
  const m = L.companyMentors(u.company_id!).find((x) => x.id === mentorId && (x.referral_id ?? null) === (referralId ?? null));
  if (!m) list("error", "Elige una franja de uno de tus mentores");
  if (!at || isNaN(+new Date(at))) list("error", "Elige una franja disponible");
  const dur = 60;
  if (+new Date(at) <= Date.now()) list("error", "La franja ya pasó; elige otra");
  const avail = L.withinAvailability(mentorId!, at, dur);
  if (!avail.ok) list("error", "Esa franja no está en la disponibilidad del mentor; elige otra");
  const clash = L.conflicts(mentorId!, at, dur);
  if (clash.length) list("error", "Otra sesión ocupó esa franja; elige otra");
  if (closed({ referral_id: referralId })) list("error", "El servicio tiene un cierre aprobado: no se pueden programar más sesiones");
  const slotMod = avail.slot!.modality;
  const modality = slotMod === "ambas" ? (MODS.includes(s(fd, "modality")) ? s(fd, "modality") : "virtual") : slotMod;
  const id = insert(`INSERT INTO mentoring_sessions(company_id,mentor_id,referral_id,program_id,title,scheduled_at,duration_min,modality,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    u.company_id, mentorId, referralId, c.program_id, s(fd, "title").slice(0, 120) || "Sesión de mentoría", new Date(at).toISOString(), dur, modality, "programada", u.id, now());
  const sess = get<any>("SELECT * FROM mentoring_sessions WHERE id=?", id);
  await audit(u, "programar", "session", id, null, { ...sess, por: "empresa" });
  await syncSessionCalendar(u, id, "crear");
  L.notifyParties("sesion_programada", sess);
  redirect(`/agenda/${id}?ok=${encodeURIComponent(`Sesión programada con ${m!.name}. Les enviamos la invitación de calendario (.ics).`)}`);
}

export async function rescheduleSession(fd: FormData) {
  const u = await requireUser();
  const id = Number(fd.get("id"));
  const sess = mySession(u, id);
  const companyOnly = u.company_id === sess.company_id && !can(u, "sessions.schedule");
  if (!can(u, "sessions.schedule") && !companyOnly) redirect("/sin-acceso");
  if (sess.status !== "programada") go(id, "error", "Solo se reprograman sesiones programadas");
  const slot = s(fd, "slot");
  const at = companyOnly ? (slot && !isNaN(+new Date(slot)) ? new Date(slot).toISOString() : null) : localToIso(s(fd, "scheduled_at"));
  if (!s(fd, "reason") || !at) go(id, "error", "Indica la nueva fecha y el motivo");
  const dur = sess.duration_min || 60;
  const clash = L.conflicts(sess.mentor_id, at!, dur, id);
  if (clash.length) go(id, "error", `El mentor ya tiene una sesión en ese horario: ${fmtConflict(clash)}`);
  const avail = L.withinAvailability(sess.mentor_id, at!, dur);
  if (!avail.ok && companyOnly) go(id, "error", "Elige una franja disponible del mentor");
  run("UPDATE mentoring_sessions SET scheduled_at=? WHERE id=?", at, id);
  run("DELETE FROM session_reminder_log WHERE session_id=?", id); // los recordatorios se recalculan para la nueva hora
  await audit(u, "reprogramar", "session", id, { scheduled_at: sess.scheduled_at }, { scheduled_at: at, motivo: s(fd, "reason"), fuera_disponibilidad: !avail.ok });
  const n = get<any>("SELECT * FROM mentoring_sessions WHERE id=?", id);
  await syncSessionCalendar(u, id, "actualizar");
  L.notifyParties("sesion_reprogramada", n, { before: fmtDate(sess.scheduled_at), reason: s(fd, "reason") });
  if (!avail.ok && sess.mentor_id !== u.id) L.warnMentor(n, avail.reason!);
  go(id, "ok", "Sesión reprogramada; los participantes recibieron la invitación actualizada." + (avail.ok ? "" : ` ⚠ Advertencia: ${avail.reason}.`));
}

export async function cancelSession(fd: FormData) {
  const u = await requireUser();
  const id = Number(fd.get("id"));
  const sess = mySession(u, id);
  if (!can(u, "sessions.schedule") && u.company_id !== sess.company_id) redirect("/sin-acceso");
  if (sess.status !== "programada") go(id, "error", "Solo se cancelan sesiones programadas");
  if (!s(fd, "reason")) go(id, "error", "El motivo es obligatorio");
  run("UPDATE mentoring_sessions SET status='cancelada', cancel_reason=? WHERE id=?", s(fd, "reason"), id);
  await audit(u, "cancelar", "session", id, { status: sess.status }, { status: "cancelada", motivo: s(fd, "reason") });
  await syncSessionCalendar(u, id, "cancelar", s(fd, "reason"));
  L.notifyParties("sesion_cancelada", sess, { reason: s(fd, "reason") });
  go(id, "ok", "Sesión cancelada; se notificó a los participantes");
}

export async function registerFollowup(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "sessions.followup");
  const id = Number(fd.get("id"));
  const sess = mySession(u, id);
  if (sess.mentor_id !== u.id) redirect("/sin-acceso");
  if (sess.status === "cancelada") go(id, "error", "La sesión está cancelada");
  if (!s(fd, "topics")) go(id, "error", "Registra los temas tratados");
  run("UPDATE mentoring_sessions SET status='realizada', topics=?, commitments=?, results=?, hours=?, registered_by=? WHERE id=?",
    s(fd, "topics"), s(fd, "commitments"), s(fd, "results"), Number(fd.get("hours") || sess.duration_min / 60), u.id, id);
  await audit(u, "seguimiento", "session", id, { status: sess.status }, { topics: s(fd, "topics"), hours: Number(fd.get("hours")) });
  if (sess.referral_id) run("UPDATE referrals SET status='en curso' WHERE id=? AND status='aceptada'", sess.referral_id);
  go(id, "ok", "Seguimiento registrado. Queda pendiente la aceptación de la empresa.");
}

/** Aceptación por clic: usuario, fecha, hora e IP (RF-ACO-07 / RF-DOC-04). */
export async function acceptSession(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "sessions.accept");
  const id = Number(fd.get("id"));
  const sess = mySession(u, id);
  if (u.company_id !== sess.company_id) redirect("/sin-acceso");
  if (sess.status !== "realizada") go(id, "error", "Solo se aceptan sesiones realizadas con seguimiento");
  if (sess.accepted_at) go(id, "error", "La sesión ya fue aceptada");
  const ip = await clientIp();
  run("UPDATE mentoring_sessions SET accepted_by=?, accepted_at=?, accepted_ip=? WHERE id=?", u.id, now(), ip, id);
  await audit(u, "aceptar_sesion", "session", id, null, { usuario: u.email, ip });
  emit("sesion.aceptada", { sesion_id: id, empresa_id: sess.company_id, mentor_id: sess.mentor_id, remision_id: sess.referral_id, horas: sess.hours, aceptada_at: new Date().toISOString() });
  go(id, "ok", "Sesión aceptada. Quedó registrada con tu usuario, fecha, hora e IP.");
}

export async function uploadSessionDoc(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "docs.upload");
  const id = Number(fd.get("id"));
  const sess = mySession(u, id);
  const f = fd.get("file") as File;
  if (!f || !f.size) go(id, "error", "Selecciona un archivo");
  const r = await storeDocument(u, f, { company_id: sess.company_id, session_id: id, kind: s(fd, "kind") || "documento" });
  r.ok ? go(id, "ok", (r as any).queued ? "OnBase no responde: el documento quedó en cola y se reenviará automáticamente" : "Documento enviado a OnBase") : go(id, "error", r.error);
}

export async function acceptDocument(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "sessions.accept");
  const d = get<any>("SELECT * FROM documents WHERE id=?", Number(fd.get("doc_id")));
  if (!d || u.company_id !== d.company_id) redirect("/sin-acceso");
  const ip = await clientIp();
  run("UPDATE documents SET accepted_by=?, accepted_at=?, accepted_ip=? WHERE id=?", u.id, now(), ip, d.id);
  await audit(u, "aceptar_documento", "document", d.id, null, { usuario: u.email, ip, onbase_ref: d.onbase_ref });
  go(d.session_id, "ok", "Documento aceptado");
}
