"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, insert, now, run, tx } from "@/lib/db";
import { canInProgram, can, requireUser, requirePerm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { localToIso, rand, slugify } from "@/lib/util";
import { storeDocument } from "@/lib/onbase";
import { emit } from "@/lib/webhooks";
import { normalizeReminders } from "@/lib/jobs/tecnico";
import { botGuard } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth";
import { headers } from "next/headers";
import { LANDING_TEMPLATES, attendanceOf, issueForEvent, markSession, minAttendance, recomputeEvent, sessionsCount, setEventHours, storedHours } from "@/lib/certificates";

/** Origen público para los enlaces de los correos: APP_URL o el host de la petición. */
async function requestOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  return host ? `${h.get("x-forwarded-proto") || "http"}://${host}` : "";
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const to = (id: number | string, kind: "ok" | "error", m: string, extra = ""): never => { revalidatePath(`/eventos/${id}`); redirect(`/eventos/${id}?${kind}=${encodeURIComponent(m)}${extra}`); };
const back = (kind: "ok" | "error", m: string): never => redirect(`/eventos?${kind}=${encodeURIComponent(m)}`);
/** Datos del formulario para la auditoría (sin archivos ni campos internos de Next). */
const fdLog = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$ACTION")));
const httpUrl = (v: string) => !v || /^https?:\/\/[^\s<>"']+$/i.test(v);
const int = (v: any, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.max(min, Math.min(max, n)) : def; };

/** Banner subido como archivo (RF-CON-06): solo JPG/PNG ≤ 5 MB, pasa por antivirus y queda en OnBase. */
async function storeBanner(u: any, fd: FormData, eventId: number): Promise<{ id?: number; error?: string }> {
  const f = fd.get("banner_file");
  if (!(f instanceof File) || !f.size) return {};
  if (!/\.(png|jpe?g)$/i.test(f.name)) return { error: "El banner debe ser una imagen JPG o PNG" };
  if (f.size > 5 * 1024 * 1024) return { error: "El banner supera el máximo de 5 MB" };
  const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47, isJpg = head[0] === 0xff && head[1] === 0xd8;
  if (!isPng && !isJpg) return { error: "El archivo no es una imagen JPG o PNG válida" };
  const r = await storeDocument(u, f, { event_id: eventId, kind: "banner" }); // valida formato, antivirus, cifra y envía a OnBase
  return r.ok ? { id: r.id } : { error: r.error || "No fue posible guardar el banner" };
}

export async function saveEvent(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "events.manage");
  const id = Number(fd.get("id") || 0);
  const programId = Number(fd.get("program_id"));
  if (!canInProgram(u, "events.manage", programId)) back("error", "No puedes crear contenidos en un programa que no tienes asignado");
  const before = id ? get<any>("SELECT * FROM events WHERE id=?", id) : null;
  if (id && (!before || !canInProgram(u, "events.manage", before.program_id))) redirect("/sin-acceso");
  const fail = (m: string) => (id ? to(id, "error", m) : back("error", m));
  const start = localToIso(s(fd, "start_at")), end = localToIso(s(fd, "end_at"));
  if (!s(fd, "title") || !start) fail("Nombre y fecha de inicio son obligatorios");
  if (end && end < start!) fail("La fecha de fin no puede ser anterior al inicio");
  if (!httpUrl(s(fd, "banner_url"))) fail("La URL del banner debe empezar por https://");
  if (!httpUrl(s(fd, "external_form_url"))) fail("El enlace del formulario externo debe empezar por https://");
  const template = LANDING_TEMPLATES.some(([k]) => k === s(fd, "landing_template")) ? s(fd, "landing_template") : (before?.landing_template || "clasica");
  const sessions = int(fd.get("sessions_count"), before?.sessions_count ?? 1, 1, 60);
  const minAtt = int(fd.get("min_attendance"), 80, 0, 100);
  const certsAuto = fd.has("certs_auto_present") ? (fd.get("certs_auto") === "on" ? 1 : 0) : (before?.certs_auto ?? 1);
  const v = [programId, s(fd, "title"), s(fd, "type") || "evento", s(fd, "description"), s(fd, "audience"), s(fd, "requirements"), s(fd, "owner"), s(fd, "modality"), s(fd, "place"),
    start, end || start, int(fd.get("capacity"), 30, 0, 100000), Math.max(0, Number(fd.get("internal_cost") || 0)), s(fd, "external_form_url"), s(fd, "banner_url"), s(fd, "summary"),
    minAtt, int(fd.get("min_minutes"), 30, 0, 1440), sessions, template, certsAuto];
  const cols = "program_id=?,title=?,type=?,description=?,audience=?,requirements=?,owner=?,modality=?,place=?,start_at=?,end_at=?,capacity=?,internal_cost=?,external_form_url=?,banner_url=?,summary=?,min_attendance=?,min_minutes=?,sessions_count=?,landing_template=?,certs_auto=?";
  const hours = Number(String(fd.get("hours") ?? "").replace(",", ".")) || null;
  if (id) {
    run(`UPDATE events SET ${cols} WHERE id=?`, ...v, id);
    if (fd.has("reminders")) run("UPDATE events SET reminders=? WHERE id=?", normalizeReminders(s(fd, "reminders")), id);
    if (fd.has("hours")) setEventHours(id, hours);
    if (fd.get("banner_remove") === "on") run("UPDATE events SET banner_doc_id=NULL WHERE id=?", id);
    const b = await storeBanner(u, fd, id);
    if (b.id) run("UPDATE events SET banner_doc_id=? WHERE id=?", b.id, id);
    const after = get<any>("SELECT * FROM events WHERE id=?", id);
    if (before.sessions_count !== after.sessions_count || before.min_attendance !== after.min_attendance) recomputeEvent(after);
    await audit(u, "editar", "event", id, before, { ...fdLog(fd), banner_doc_id: after.banner_doc_id });
    if (b.error) to(id, "error", `Datos guardados, pero el banner no se publicó: ${b.error}`);
    to(id, "ok", b.id ? "Evento actualizado. El banner pasó el antivirus y quedó en OnBase." : "Evento actualizado");
  }
  const slug = slugify(s(fd, "title")) + "-" + rand(5); // no se pueden adivinar otros eventos
  const publish = fd.get("publish_now") === "on";
  const nid = insert(
    `INSERT INTO events(program_id,title,type,description,audience,requirements,owner,modality,place,start_at,end_at,capacity,internal_cost,external_form_url,banner_url,summary,min_attendance,min_minutes,sessions_count,landing_template,certs_auto,slug,status,created_by,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...v, slug, publish ? "publicado" : "borrador", u.id, now());
  if (fd.has("reminders")) run("UPDATE events SET reminders=? WHERE id=?", normalizeReminders(s(fd, "reminders")), nid);
  if (hours) setEventHours(nid, hours);
  const b = await storeBanner(u, fd, nid);
  if (b.id) run("UPDATE events SET banner_doc_id=? WHERE id=?", b.id, nid);
  await audit(u, "crear", "event", nid, null, { ...fdLog(fd), status: publish ? "publicado" : "borrador", banner_doc_id: b.id ?? null });
  if (publish) await audit(u, "publicar", "event", nid, { status: "borrador" }, { status: "publicado" });
  if (b.error) to(nid, "error", `Evento creado, pero el banner no se publicó: ${b.error}`);
  to(nid, "ok", publish ? "Evento creado y publicado: ya recibe inscripciones" : "Evento creado como borrador");
}

export async function setEventStatus(fd: FormData) {
  const u = await requireUser();
  const id = Number(fd.get("id"));
  const ev = get<any>("SELECT * FROM events WHERE id=?", id);
  if (!ev || !canInProgram(u, "events.manage", ev.program_id)) redirect("/sin-acceso");
  const st = s(fd, "status");
  if (!["borrador", "publicado", "cerrado"].includes(st)) to(id, "error", "Estado no válido");
  run("UPDATE events SET status=? WHERE id=?", st, id);
  await audit(u, st === "publicado" ? "publicar" : "cambiar_estado", "event", id, { status: ev.status }, { status: st });
  to(id, "ok", `Estado: ${st}`);
}

export async function toggleEventActive(fd: FormData) {
  const u = await requireUser();
  const id = Number(fd.get("id"));
  const ev = get<any>("SELECT * FROM events WHERE id=?", id);
  if (!ev || !canInProgram(u, "events.manage", ev.program_id)) redirect("/sin-acceso");
  run("UPDATE events SET active=? WHERE id=?", ev.active ? 0 : 1, id); // no borra historial
  await audit(u, ev.active ? "inactivar" : "activar", "event", id, { active: ev.active }, { active: ev.active ? 0 : 1 });
  to(id, "ok", ev.active ? "Evento inactivado" : "Evento activado");
}

/** Duplicar como plantilla (RF-CON-12): copia todo menos fechas e inscritos. */
export async function duplicateEvent(fd: FormData) {
  const u = await requireUser();
  const ev = get<any>("SELECT * FROM events WHERE id=?", Number(fd.get("id")));
  if (!ev || !canInProgram(u, "events.manage", ev.program_id)) redirect("/sin-acceso");
  const nid = insert(
    `INSERT INTO events(program_id,title,type,description,audience,requirements,owner,modality,place,start_at,end_at,capacity,internal_cost,external_form_url,banner_url,summary,min_attendance,min_minutes,
       reminders,form_id,sessions_count,landing_template,banner_doc_id,certs_auto,slug,status,created_by,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'borrador',?,?)`,
    ev.program_id, ev.title + " (copia)", ev.type, ev.description, ev.audience, ev.requirements, ev.owner, ev.modality, ev.place, ev.capacity, ev.internal_cost,
    ev.external_form_url, ev.banner_url, ev.summary, ev.min_attendance, ev.min_minutes, ev.reminders, ev.form_id, ev.sessions_count, ev.landing_template, ev.banner_doc_id, ev.certs_auto,
    slugify(ev.title) + "-" + rand(5), u.id, now());
  const h = storedHours(ev.id); if (h) setEventHours(nid, h);
  await audit(u, "duplicar", "event", nid, { origen: ev.id }, null);
  to(nid, "ok", "Copia creada (sin fechas ni inscritos). Define la nueva fecha.");
}

/** Inscripción: valida sesión, rol, empresa activa, cupo y unicidad por empresa+evento (RF-CON-10/11). */
export async function register(fd: FormData) {
  const u = await requireUser();
  const slug = s(fd, "slug");
  const ev = get<any>("SELECT * FROM events WHERE slug=?", slug);
  const back = (k: "ok" | "error", m: string) => redirect(`/e/${slug}?${k}=${encodeURIComponent(m)}`);
  const bot = await botGuard(fd, "inscripcion", await clientIp(), u.email); if (bot) back("error", bot); // TEC-7
  if (!ev || ev.status !== "publicado" || !ev.active) back("error", "El evento no está disponible");
  if (!can(u, "events.register") || !u.company_id) back("error", "Solo las empresas vinculadas pueden inscribirse");
  const c = get<any>("SELECT * FROM companies WHERE id=?", u.company_id);
  if (c.status !== "activa") back("error", "Tu empresa aún no está activada por Compensar");
  if (fd.get("consent") !== "on") back("error", "Debes autorizar el tratamiento de datos personales");
  const res = tx(() => {
    if (get("SELECT 1 FROM registrations WHERE event_id=? AND company_id=?", ev.id, c.id)) return "Tu empresa ya está inscrita en este evento";
    const taken = get<any>("SELECT COUNT(*) n FROM registrations WHERE event_id=? AND waitlist=0", ev.id).n;
    const wait = taken >= ev.capacity ? 1 : 0;
    if (wait && fd.get("waitlist") !== "on") return "El cupo está lleno. Puedes unirte a la lista de espera.";
    const code = "R" + rand(7).toUpperCase();
    insert(`INSERT INTO registrations(event_id,company_id,user_id,name,email,phone,code,status,consent_version,consent_at,waitlist,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ev.id, c.id, u.id, u.name, u.email, u.phone, code, wait ? "lista_espera" : "inscrito", fd.get("consent_version"), now(), wait, now());
    return "";
  });
  if (res) back("error", res);
  const r = get<any>("SELECT * FROM registrations WHERE event_id=? AND company_id=?", ev.id, c.id);
  await audit(u, "inscribir", "registration", r.id, null, { event: ev.title, company: c.razon_social, consent: r.consent_version, waitlist: r.waitlist });
  emit("inscripcion.creada", { inscripcion_id: r.id, evento_id: ev.id, evento: ev.title, empresa_id: c.id, nit: c.nit, estado: r.status, lista_espera: r.waitlist, codigo: r.code });
  if (!r.waitlist) notify({ key: "inscripcion", vars: { name: u.name, event: ev.title, code: r.code }, email: u.email, phone: u.phone, userId: u.id });
  back("ok", r.waitlist ? "Quedaste en lista de espera. Te avisaremos si se libera un cupo." : `Inscripción confirmada. Tu código es ${r.code}`);
}

/** Variante para el botón por fila dentro del formulario de asistencia (React no envía el name/value de un botón con acción propia). */
export async function cancelRegistrationFor(id: number) {
  const fd = new FormData();
  fd.set("id", String(id));
  return cancelRegistration(fd);
}

export async function cancelRegistration(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "attendance.manage");
  const r = get<any>("SELECT * FROM registrations WHERE id=?", Number(fd.get("id")));
  if (!r) redirect("/eventos?error=" + encodeURIComponent("La inscripción ya no existe"));
  const evc = get<any>("SELECT program_id FROM events WHERE id=?", r.event_id);
  if (evc && !canInProgram(u, "attendance.manage", evc.program_id)) redirect("/sin-acceso");
  run("DELETE FROM registrations WHERE id=?", r.id);
  run("DELETE FROM attendance_sessions WHERE registration_id=?", r.id);
  await audit(u, "cancelar_inscripcion", "registration", r.id, r, null);
  // lista de espera: promueve al primero
  const first = get<any>("SELECT * FROM registrations WHERE event_id=? AND waitlist=1 ORDER BY id LIMIT 1", r.event_id);
  if (first && !r.waitlist) {
    run("UPDATE registrations SET waitlist=0, status='inscrito' WHERE id=?", first.id);
    const ev = get<any>("SELECT title FROM events WHERE id=?", r.event_id);
    notify({ key: "inscripcion", vars: { name: first.name, event: ev.title, code: first.code }, email: first.email, phone: first.phone, userId: first.user_id });
  }
  to(r.event_id, "ok", "Inscripción cancelada");
}

/** Evento + permiso de asistencia (alcance por programa cuando el rol lo tiene por programa). */
async function attendanceCtx(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "attendance.manage");
  const eventId = Number(fd.get("event_id"));
  const ev = get<any>("SELECT * FROM events WHERE id=?", eventId);
  if (!ev || !canInProgram(u, "attendance.manage", ev.program_id)) redirect("/sin-acceso");
  const n = sessionsCount(ev);
  const session = n === 1 ? 1 : Number(fd.get("session") || 0);
  const keep = s(fd, "keep"); // filtros activos de la tabla de inscritos
  const go = (kind: "ok" | "error", m: string) => to(eventId, kind, m, `&sesion=${session || 1}${keep ? "&" + keep : ""}`);
  if (!Number.isInteger(session) || session < 1 || session > n) go("error", `Elige la sesión (1 a ${n})`);
  return { u, ev, eventId, n, session, go };
}

/** Asistencia por QR / código (RF-CON-14) o masiva, siempre POR SESIÓN (RF-PAR-04). */
export async function markAttendance(fd: FormData) {
  const { u, ev, eventId, n, session, go } = await attendanceCtx(fd);
  const ses = n > 1 ? ` (sesión ${session} de ${n})` : "";
  if (s(fd, "mode") === "code") {
    const raw = s(fd, "code").toUpperCase();
    const code = raw.match(/R[A-Z0-9]{7}/)?.[0] || raw; // el QR puede traer solo el código
    const r = get<any>("SELECT * FROM registrations WHERE event_id=? AND code=?", eventId, code);
    if (!r) go("error", "Código no encontrado en este evento");
    if (r.waitlist) go("error", `${r.name} está en lista de espera: no tiene cupo confirmado`);
    const before = attendanceOf(r, ev);
    if (before.sessions.includes(session)) go("ok", `${r.name} ya tenía registrada la asistencia${ses}. Lleva ${before.label}`);
    const a = markSession(r, ev, session, true, "qr", u.id);
    await audit(u, "asistencia_qr", "registration", r.id, { sesiones: before.sessions, attended: r.attended }, { sesion: session, sesiones: a.sessions, attended: a.meets ? 1 : 0 });
    emit("asistencia.registrada", { evento_id: eventId, inscripcion_id: r.id, empresa_id: r.company_id, fuente: "qr", sesion: session, sesiones: a.sessions, cumple: a.meets });
    go("ok", `Asistencia registrada${ses}: ${r.name} · ${a.label}${a.meets ? " · cumple" : ""}`);
  }
  // masiva: solo afecta a las filas que se mostraban (respeta los filtros activos de la tabla)
  const shown = new Set(s(fd, "shown").split(",").map(Number).filter(Boolean));
  const ids = new Set(fd.getAll("present").map(Number));
  let marked = 0, changed = 0;
  for (const r of all<any>("SELECT * FROM registrations WHERE event_id=? AND waitlist=0", eventId)) {
    if (!shown.has(r.id)) continue;
    const want = ids.has(r.id), had = attendanceOf(r, ev).sessions.includes(session);
    if (want) marked++;
    if (want !== had) { markSession(r, ev, session, want, "manual", u.id); changed++; }
  }
  await audit(u, "asistencia_masiva", "event", eventId, null, { sesion: session, presentes: marked, cambios: changed });
  emit("asistencia.registrada", { evento_id: eventId, fuente: "manual", sesion: session, presentes: marked, inscripciones: [...ids] });
  go("ok", `Asistencia guardada${ses}: ${marked} presente(s), ${changed} cambio(s)`);
}

/** Duración del reporte: «45», «45,5», «01:05:30» (h:m:s), «1h 5m 30s» o «45 min» → minutos enteros. */
function parseMinutes(v?: string): number {
  const t = String(v ?? "").trim().toLowerCase();
  if (/^\d+([.,]\d+)?$/.test(t)) return Math.round(Number(t.replace(",", ".")));
  const hms = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (hms) return Math.round(Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3] || 0) / 60);
  const h = /(\d+)\s*h/.exec(t), m = /(\d+)\s*m(?!s)/.exec(t), sec = /(\d+)\s*s/.exec(t);
  return Math.round(Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0) + Number(sec?.[1] || 0) / 60);
}

/** Cargue del reporte de Teams/Zoom por sesión: CSV con columnas correo,minutos. Se valida con el tiempo mínimo configurado. */
export async function uploadAttendance(fd: FormData) {
  const { u, ev, eventId, n, session, go } = await attendanceCtx(fd);
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) go("error", "Selecciona el reporte CSV de Teams o Zoom");
  if ((f as File).size > 5 * 1024 * 1024) go("error", "El reporte supera 5 MB");
  const text = (await (f as File).text()).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // columnas: busca «correo/email» y «minutos/duración» en el encabezado; si no hay, usa las dos primeras
  const head = (lines[0] || "").toLowerCase().split(/[;,\t]/).map((x) => x.trim().replace(/^"|"$/g, ""));
  let ce = head.findIndex((h) => /correo|e-?mail|mail/.test(h)), cm = head.findIndex((h) => /minut|duraci|duration|tiempo/.test(h));
  if (ce < 0) ce = 0; if (cm < 0) cm = 1;
  let ok = 0, below = 0, unknown = 0;
  const seen = new Map<number, number>(); // un participante puede salir varias veces (reconexiones): se suman los minutos
  const regs = new Map<number, any>();
  for (const line of lines.slice(1)) {
    const cells = line.split(/[;,\t]/).map((x) => x.trim().replace(/^"|"$/g, ""));
    const email = (cells[ce] || "").toLowerCase();
    if (!email || !email.includes("@")) continue;
    const r = get<any>("SELECT * FROM registrations WHERE event_id=? AND lower(email)=? AND waitlist=0", eventId, email);
    if (!r) { unknown++; continue; }
    regs.set(r.id, r);
    seen.set(r.id, (seen.get(r.id) || 0) + parseMinutes(cells[cm]));
  }
  for (const [rid, m] of seen) {
    const present = m >= ev.min_minutes;
    markSession(regs.get(rid), ev, session, present, "teams_zoom", u.id, m);
    if (!present) run("UPDATE registrations SET minutes=? WHERE id=?", m, rid); // deja constancia de los minutos aunque no alcance
    present ? ok++ : below++;
  }
  const ses = n > 1 ? ` · sesión ${session} de ${n}` : "";
  await audit(u, "cargue_asistencia_virtual", "event", eventId, null, { sesion: session, ok, below, unknown, archivo: (f as File).name });
  emit("asistencia.registrada", { evento_id: eventId, fuente: "teams_zoom", sesion: session, validados: ok, por_debajo: below, sin_inscripcion: unknown });
  go("ok", `Asistencia virtual${ses}: ${ok} validados, ${below} por debajo de ${ev.min_minutes} min, ${unknown} sin inscripción`);
}

/** Emisión manual (la automática la hace el job certificados_automaticos al terminar el evento). */
export async function issueCertificates(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "attendance.manage");
  const eventId = Number(fd.get("event_id"));
  const ev = get<any>("SELECT * FROM events WHERE id=?", eventId);
  if (!ev || !canInProgram(u, "attendance.manage", ev.program_id)) redirect("/sin-acceso");
  const r = await issueForEvent(eventId, u, await requestOrigin());
  if (!r.issued) await audit(u, "emitir_certificados", "event", eventId, null, { emitidos: 0, sin_asistencia_minima: r.pending });
  to(eventId, "ok", `${r.issued} certificado(s) emitido(s) y enviados por correo${r.pending ? ` · ${r.pending} inscrito(s) aún no cumplen la asistencia mínima (${minAttendance(ev)} %)` : ""}`);
}

export async function uploadEvidence(fd: FormData) {
  const u = await requireUser();
  const eventId = Number(fd.get("event_id"));
  const ev = get<any>("SELECT * FROM events WHERE id=?", eventId);
  if (!canInProgram(u, "events.manage", ev.program_id) && !can(u, "attendance.manage")) redirect("/sin-acceso");
  const f = fd.get("file") as File;
  if (!f || !f.size) to(eventId, "error", "Selecciona un archivo");
  const r = await storeDocument(u, f, { event_id: eventId, kind: s(fd, "kind") || "evidencia" });
  r.ok ? to(eventId, "ok", (r as any).queued ? "OnBase no responde: la evidencia quedó en cola y se reenviará automáticamente" : "Evidencia enviada a OnBase") : to(eventId, "error", r.error);
}

export async function sendReminders(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "events.manage");
  const eventId = Number(fd.get("event_id"));
  const ev = get<any>("SELECT * FROM events WHERE id=?", eventId);
  const regs = all<any>("SELECT * FROM registrations WHERE event_id=? AND waitlist=0", eventId);
  let n = 0;
  for (const r of regs) n += notify({ key: "recordatorio_evento", vars: { event: ev.title, when: new Date(ev.start_at).toLocaleString("es-CO", { timeZone: "America/Bogota" }) }, email: r.email, phone: r.phone, userId: r.user_id }).length;
  await audit(u, "enviar_recordatorios", "event", eventId, null, { mensajes: n });
  to(eventId, "ok", `${n} recordatorio(s) generados con estado de entrega (ver Notificaciones)`);
}
