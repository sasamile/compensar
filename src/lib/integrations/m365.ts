/**
 * Adaptador Microsoft 365 / Outlook (RF-ACO-04, ERS §6 «Sincronizar agendas de sesiones»).
 *
 * Con credenciales de Microsoft Graph (aplicación registrada en el Entra ID de Compensar con el permiso
 * de aplicación `Calendars.ReadWrite` y, si se desea, una Application Access Policy que la limite al grupo de mentores):
 *   M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET
 * cada sesión creada, reprogramada o cancelada en la plataforma se refleja en el calendario del mentor:
 *   crear      → POST  /users/{correo del mentor}/events          (asistentes: usuarios de la empresa → Outlook les envía la invitación)
 *   actualizar → PATCH /users/{correo}/events/{id}
 *   cancelar   → POST  /users/{correo}/events/{id}/cancel          (Outlook notifica la cancelación a los asistentes)
 * Las llamadas pasan por el circuit breaker «m365» y, si fallan, quedan en la cola de reintentos (kind m365.sync).
 *
 * Sin credenciales funciona en MODO SIMULADO: registra el intercambio en integration_log y en auditoría
 * (acción sync_outlook) y deja la invitación .ics (con UID estable, SEQUENCE y METHOD REQUEST/CANCEL)
 * descargable en /agenda/{id}/ics, que también se envía en las notificaciones.
 *
 * Variables opcionales: M365_GRAPH_URL (por defecto https://graph.microsoft.com/v1.0) y M365_AUTH_URL
 * (por defecto https://login.microsoftonline.com), útiles para nubes soberanas o pruebas con un simulador.
 */
import { all, get, now, run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { callExternal, enqueue, logError, logExchange, registerHandler } from "@/lib/resilience";

export type CalendarOp = "crear" | "actualizar" | "cancelar";
export const BREAKER = "m365";
export const QUEUE_KIND = "m365.sync";

export const m365Configured = () => !!(process.env.M365_TENANT_ID && process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET);
export const m365Mode = () => (m365Configured() ? "Microsoft Graph" : "simulado (.ics)");
const GRAPH = () => (process.env.M365_GRAPH_URL || "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
const AUTH = () => (process.env.M365_AUTH_URL || "https://login.microsoftonline.com").replace(/\/$/, "");

/* ---------------- datos de la sesión ---------------- */
function load(sessionId: number) {
  const s = get<any>("SELECT s.*, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id WHERE s.id=?", sessionId);
  if (!s) return null;
  const mentor = get<any>("SELECT id, name, email FROM users WHERE id=?", s.mentor_id);
  const attendees = all<{ name: string; email: string }>(
    "SELECT name, email FROM users WHERE company_id=? AND status IN ('activo','invitado') AND email IS NOT NULL", s.company_id);
  return { s, mentor, attendees };
}
const endOf = (s: any) => new Date(+new Date(s.scheduled_at) + (s.duration_min || 60) * 60000).toISOString();
const appUrl = (id: number) => `${process.env.APP_URL ?? ""}/agenda/${id}`;

/* ---------------- invitación .ics (RFC 5545) ---------------- */
const icsText = (v: any) => String(v ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const fold = (line: string) => { const out: string[] = []; let l = line; while (l.length > 74) { out.push(l.slice(0, 74)); l = " " + l.slice(74); } out.push(l); return out.join("\r\n"); };

export function buildIcs(sessionId: number, opts: { cancel?: boolean; sequence?: number; reason?: string } = {}) {
  const d = load(sessionId);
  if (!d) return null;
  const { s, mentor, attendees } = d;
  const cancel = opts.cancel ?? s.status === "cancelada";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Compensar//Fomento Empresarial//ES", "CALSCALE:GREGORIAN", `METHOD:${cancel ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT", `UID:sesion-${s.id}@fomento-empresarial`, `SEQUENCE:${opts.sequence ?? 0}`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(s.scheduled_at)}`, `DTEND:${icsDate(endOf(s))}`,
    `SUMMARY:${icsText(`${s.title} · ${s.razon_social}`)}`,
    `DESCRIPTION:${icsText(`Sesión de mentoría (${s.modality}) entre ${mentor?.name ?? "el mentor"} y ${String(s.razon_social).replace(/\.$/, "")}.${cancel && (opts.reason || s.cancel_reason) ? ` Cancelada: ${opts.reason || s.cancel_reason}.` : ""} Detalle: ${appUrl(s.id)}`)}`,
    `LOCATION:${icsText(s.modality === "virtual" ? "Virtual (Microsoft Teams)" : "Presencial")}`,
    mentor ? `ORGANIZER;CN=${icsText(mentor.name)}:mailto:${mentor.email}` : "",
    ...attendees.map((a) => `ATTENDEE;CN=${icsText(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    ...(cancel ? [] : ["BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Recordatorio de sesión", "END:VALARM"]),
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ---------------- Microsoft Graph ---------------- */
const g = globalThis as any;
async function token(): Promise<string> {
  const c = g.__m365Token as { v: string; exp: number } | undefined;
  if (c && c.exp > Date.now() + 60000) return c.v;
  const r = await fetch(`${AUTH()}/${process.env.M365_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store",
    body: new URLSearchParams({ client_id: process.env.M365_CLIENT_ID!, client_secret: process.env.M365_CLIENT_SECRET!, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Entra ID rechazó las credenciales (${r.status})`);
  const j = await r.json();
  g.__m365Token = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return j.access_token;
}

async function graph(method: string, path: string, body?: any) {
  const r = await fetch(`${GRAPH()}${path}`, {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="SA Pacific Standard Time"' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Microsoft Graph respondió ${r.status} en ${method} ${path.replace(/\/users\/[^/]+/, "/users/…")}`);
  return r.status === 204 || r.status === 202 ? null : r.json().catch(() => null);
}

/** Cuerpo del evento de Outlook. */
export function graphEvent(sessionId: number, create = false) {
  const d = load(sessionId)!;
  const { s, mentor, attendees } = d;
  return {
    subject: `${s.title} · ${s.razon_social}`,
    body: { contentType: "HTML", content: `<p>Sesión de mentoría (${s.modality}) entre ${mentor?.name ?? "el mentor"} y ${s.razon_social.replace(/\.$/, "")}.</p><p><a href="${appUrl(s.id)}">Ver la sesión en la Plataforma de Fomento Empresarial</a></p>` },
    start: { dateTime: s.scheduled_at.replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: endOf(s).replace(/Z$/, ""), timeZone: "UTC" },
    location: { displayName: s.modality === "virtual" ? "Virtual (Microsoft Teams)" : "Presencial" },
    attendees: attendees.map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: "required" })),
    isOnlineMeeting: s.modality === "virtual",
    ...(s.modality === "virtual" ? { onlineMeetingProvider: "teamsForBusiness" } : {}),
    categories: ["Fomento Empresarial"],
    ...(create ? { transactionId: `fomento-sesion-${s.id}` } : {}), // idempotencia: Graph no duplica si se reintenta
  };
}

async function pushGraph(sessionId: number, op: CalendarOp, reason?: string): Promise<string | null> {
  const d = load(sessionId);
  if (!d?.mentor?.email) throw new Error("La sesión no tiene mentor con correo");
  const user = `/users/${encodeURIComponent(d.mentor.email)}`;
  const cur = get<any>("SELECT * FROM session_calendar_sync WHERE session_id=?", sessionId);
  const eventId: string | null = cur?.mode === "graph" ? cur.event_id : null;
  return callExternal(BREAKER, op, sessionId, async () => {
    if (op === "cancelar") {
      if (!eventId) return null; // nunca llegó a Outlook: no hay nada que cancelar
      await graph("POST", `${user}/events/${encodeURIComponent(eventId)}/cancel`, { Comment: reason || "Sesión cancelada en la plataforma" });
      return eventId;
    }
    if (op === "actualizar" && eventId) {
      await graph("PATCH", `${user}/events/${encodeURIComponent(eventId)}`, graphEvent(sessionId));
      return eventId;
    }
    const ev = await graph("POST", `${user}/events`, graphEvent(sessionId, true));
    return ev?.id ?? null;
  }, 15000);
}

function saveSync(sessionId: number, f: { mentor_email?: string; event_id?: string | null; mode: string; status: string; op: CalendarOp; ics?: string | null; error?: string | null; bump?: boolean }) {
  const cur = get<any>("SELECT * FROM session_calendar_sync WHERE session_id=?", sessionId);
  const seq = (cur?.sequence ?? -1) + (f.bump === false ? 0 : 1);
  run(`INSERT INTO session_calendar_sync(session_id,mentor_email,event_id,mode,status,last_op,sequence,ics,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET mentor_email=excluded.mentor_email, event_id=COALESCE(excluded.event_id, session_calendar_sync.event_id), mode=excluded.mode,
      status=excluded.status, last_op=excluded.last_op, sequence=excluded.sequence, ics=COALESCE(excluded.ics, session_calendar_sync.ics), last_error=excluded.last_error, updated_at=excluded.updated_at`,
    sessionId, f.mentor_email ?? cur?.mentor_email ?? null, f.event_id ?? null, f.mode, f.status, f.op, Math.max(0, seq), f.ics ?? null, f.error ?? null, now());
  return Math.max(0, seq);
}

/**
 * Refleja la operación en el calendario del mentor. Nunca lanza: si Graph falla, la deja en cola y la sesión
 * sigue su curso (la plataforma es la fuente de verdad de la agenda).
 */
export async function syncSessionCalendar(user: { id?: number; email?: string } | null, sessionId: number, op: CalendarOp, reason?: string) {
  const d = load(sessionId);
  if (!d) return { ok: false, mode: "ninguno", error: "Sesión no encontrada" };
  const cancel = op === "cancelar";
  const seq = (get<any>("SELECT sequence FROM session_calendar_sync WHERE session_id=?", sessionId)?.sequence ?? -1) + 1;
  const ics = buildIcs(sessionId, { cancel, sequence: seq, reason });
  if (!m365Configured()) {
    saveSync(sessionId, { mentor_email: d.mentor?.email, event_id: `SIM-${sessionId}`, mode: "simulado", status: cancel ? "cancelado" : "sincronizado", op, ics });
    logExchange(BREAKER, op, sessionId, true, 0, `modo simulado: evento ${op} en el calendario de ${d.mentor?.email ?? "—"}; invitación .ics a ${d.attendees.length} participante(s)`);
    await audit(user, "sync_outlook", "session", sessionId, null, { modo: "simulado", operacion: op, calendario: d.mentor?.email, ics: `/agenda/${sessionId}/ics`, secuencia: seq, participantes: d.attendees.map((a) => a.email) });
    return { ok: true, mode: "simulado" as const };
  }
  try {
    const eventId = await pushGraph(sessionId, op, reason);
    saveSync(sessionId, { mentor_email: d.mentor?.email, event_id: eventId, mode: "graph", status: cancel ? "cancelado" : "sincronizado", op, ics });
    await audit(user, "sync_outlook", "session", sessionId, null, { modo: "graph", operacion: op, calendario: d.mentor?.email, evento: eventId, secuencia: seq });
    return { ok: true, mode: "graph" as const, eventId };
  } catch (e: any) {
    const trace = logError("m365", e, user?.id);
    saveSync(sessionId, { mentor_email: d.mentor?.email, mode: "graph", status: "en_cola", op, ics, error: `${e?.message ?? e} (traza ${trace})` });
    enqueue(QUEUE_KIND, sessionId, { op, reason });
    await audit(user, "sync_outlook", "session", sessionId, null, { modo: "graph", operacion: op, estado: "en cola de reintentos", error: String(e?.message ?? e).slice(0, 200) });
    return { ok: false, mode: "graph" as const, queued: true, error: String(e?.message ?? e) };
  }
}

// Reintentos desde la cola (job acompanamiento.m365_reintentos): reaplica la última operación pendiente.
registerHandler(QUEUE_KIND, async (job) => {
  if (!m365Configured()) return "sin credenciales: se omite";
  const op = (job.payload?.op || "actualizar") as CalendarOp;
  const eventId = await pushGraph(job.ref_id, op, job.payload?.reason);
  saveSync(job.ref_id, { event_id: eventId, mode: "graph", status: op === "cancelar" ? "cancelado" : "sincronizado", op, bump: false });
  return `sesión ${job.ref_id}: ${op}`;
});

export const calendarStatus = (sessionId: number) => get<any>("SELECT * FROM session_calendar_sync WHERE session_id=?", sessionId);
