import type { Job } from "./types";
import { all, get, insert, now, run, setting } from "../db";
import { audit } from "../audit";
import { notify } from "../notify";
import { processQueue } from "../resilience";
import { securityEvent } from "../ratelimit";
import { deliverDue } from "../webhooks";
import "../onbase"; // registra el manejador de la cola onbase.store

/* ---------------- recordatorios configurables por evento (FUN-12, RF-CON-05) ---------------- */
const UNIT: Record<string, number> = { m: 60000, h: 3600000, d: 86400000 };
export function parseReminders(s?: string | null): { kind: string; ms: number }[] {
  const out: { kind: string; ms: number }[] = [];
  for (const tok of String(s ?? "").toLowerCase().split(/[\s,;]+/)) {
    const m = /^(\d{1,3})(m|h|d)$/.exec(tok);
    if (!m || Number(m[1]) === 0) continue;
    const kind = `${Number(m[1])}${m[2]}`;
    if (!out.some((x) => x.kind === kind)) out.push({ kind, ms: Number(m[1]) * UNIT[m[2]] });
  }
  return out.filter((x) => x.ms <= 60 * 86400000).sort((a, b) => b.ms - a.ms);
}
/** Normaliza el campo «Recordatorios» del formulario de evento: "7d, 1d, 1h" → "7d,1d,1h" (vacío = sin recordatorios). */
export const normalizeReminders = (s?: string | null) => parseReminders(s).map((x) => x.kind).join(",");
const label = (k: string) => { const n = Number(k.slice(0, -1)), u = k.slice(-1); return `${n} ${u === "d" ? (n === 1 ? "día" : "días") : u === "h" ? (n === 1 ? "hora" : "horas") : "minutos"}`; };

export async function sendEventReminders(): Promise<string> {
  const t = Date.now();
  const events = all<any>("SELECT * FROM events WHERE status='publicado' AND active=1 AND start_at>? AND start_at<=? AND IFNULL(reminders,'')<>''",
    new Date(t).toISOString(), new Date(t + 61 * 86400000).toISOString());
  let msgs = 0, people = 0;
  for (const ev of events) {
    const start = new Date(ev.start_at).getTime();
    const due = parseReminders(ev.reminders).filter((o) => t >= start - o.ms).sort((a, b) => a.ms - b.ms);
    if (!due.length) continue;
    const nearest = due[0];
    const when = new Date(ev.start_at).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" });
    for (const r of all<any>("SELECT * FROM registrations WHERE event_id=? AND waitlist=0", ev.id)) {
      // INSERT OR IGNORE sobre UNIQUE(event_id, registration_id, kind): nunca se duplica un recordatorio
      const fresh = run("INSERT OR IGNORE INTO reminder_log(event_id,registration_id,kind,sent_at) VALUES(?,?,?,?)", ev.id, r.id, nearest.kind, now()).changes;
      // los recordatorios más lejanos que ya pasaron se marcan para no enviarlos tarde
      for (const o of due.slice(1)) run("INSERT OR IGNORE INTO reminder_log(event_id,registration_id,kind,sent_at) VALUES(?,?,?,NULL)", ev.id, r.id, o.kind);
      if (!fresh) continue;
      msgs += notify({ key: "recordatorio_evento", vars: { event: ev.title, when, lead: label(nearest.kind), place: ev.place || "" }, email: r.email, phone: r.phone, userId: r.user_id }).length;
      people++;
    }
  }
  return `${events.length} evento(s) revisados · ${people} inscrito(s) recordados · ${msgs} mensaje(s)`;
}

/* ---------------- minimización: invitaciones no aceptadas (RNF-PRI-05, Ley 1581) ---------------- */
export async function anonymizeInvites(): Promise<string> {
  const days = Number(setting("invite_anonymize_days", "90")) || 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const rows = all<any>("SELECT id FROM users WHERE status='invitado' AND last_login_at IS NULL AND IFNULL(invited_at, created_at)<?", cutoff);
  for (const u of rows) {
    run(`UPDATE users SET email=?, name='Invitación anonimizada', phone=NULL, password_hash=NULL, temp_expires_at=NULL, mfa_secret=NULL, mfa_enabled=0,
      sso_subject=NULL, status='anonimizado', title=NULL WHERE id=?`, `anonimizado-${u.id}@anonimizado.invalid`, u.id);
    run("DELETE FROM user_roles WHERE user_id=?", u.id);
    await audit(null, "anonimizar_invitacion", "user", u.id, { status: "invitado" }, { status: "anonimizado", motivo: `Invitación no aceptada en ${days} días (Ley 1581)` });
  }
  return `${rows.length} invitación(es) anonimizada(s) (plazo ${days} días)`;
}

/* ---------------- limpieza de sesiones, tokens y registros técnicos ---------------- */
export async function cleanup(): Promise<string> {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const timeout = Number(setting("session_timeout_min", "30")) * 60000;
  const r = {
    sesiones: run("DELETE FROM sessions WHERE last_seen<?", ago(timeout)).changes,
    tokens: run("DELETE FROM api_tokens WHERE expires_at<?", now()).changes,
    flujos: run("DELETE FROM auth_flows WHERE expires_at<?", ago(3600000)).changes,
    otp: run("DELETE FROM otp_codes WHERE expires_at<?", ago(86400000)).changes,
  };
  run("DELETE FROM session_meta WHERE token NOT IN (SELECT token FROM sessions)");
  run("DELETE FROM rate_limits WHERE window_start<?", Date.now() - 86400000);
  run("DELETE FROM job_runs WHERE started_at<? AND id NOT IN (SELECT MAX(id) FROM job_runs GROUP BY job)", ago(7 * 86400000));
  run("DELETE FROM api_log WHERE ts<?", ago(90 * 86400000));
  run("DELETE FROM integration_log WHERE ts<?", ago(180 * 86400000));
  run("DELETE FROM security_events WHERE ts<?", ago(180 * 86400000));
  run("DELETE FROM webhook_deliveries WHERE status='entregado' AND delivered_at<?", ago(90 * 86400000));
  return `Sesiones vencidas: ${r.sesiones} · tokens API: ${r.tokens} · flujos: ${r.flujos} · códigos: ${r.otp}`;
}

/* ---------------- detección de anomalías y alertas (TEC-78, TEC-80) ---------------- */
function securityAdmins() {
  return all<any>(`SELECT DISTINCT u.id, u.email, u.phone FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE u.status='activo' AND (r.perms LIKE '%"*"%' OR r.perms LIKE '%"security.manage"%')`);
}
function alertAdmins(detail: string) {
  for (const a of securityAdmins())
    notify({ key: "alerta_seguridad", vars: { detalle: detail, fecha: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }) }, email: a.email, phone: a.phone, userId: a.id, channels: ["correo"], security: true });
}
export async function detectAnomalies(): Promise<string> {
  const win = 10 * 60000;
  const since = new Date(Date.now() - win).toISOString();
  const recent = new Date(Date.now() - 30 * 60000).toISOString();
  const th = Number(setting("anomaly_login_threshold", "10")) || 10;
  const found: string[] = [];
  const ips = all<any>(`SELECT ip, COUNT(*) n, COUNT(DISTINCT IFNULL(email,'')) cuentas FROM security_events
    WHERE kind IN ('login_fallido','otp_fallido','mfa_fallido','api_token_fallido','bot_honeypot','limite_excedido') AND ts>=? GROUP BY ip HAVING n>=?`, since, th);
  for (const x of ips) {
    if (get("SELECT 1 FROM security_events WHERE kind='anomalia' AND ip=? AND ts>=?", x.ip, recent)) continue;
    const d = `Pico de ingresos fallidos: ${x.n} intentos desde la IP ${x.ip} contra ${x.cuentas} cuenta(s) en 10 minutos`;
    securityEvent("anomalia", x.ip, null, d);
    await audit(null, "alerta_seguridad", "security", null, null, { tipo: "ingresos_fallidos", ip: x.ip, intentos: x.n });
    alertAdmins(d);
    found.push(d);
  }
  const eth = Number(setting("anomaly_error_threshold", "20")) || 20;
  const errs = get<any>("SELECT COUNT(*) n FROM error_log WHERE ts>=?", since).n;
  if (errs >= eth && !get("SELECT 1 FROM security_events WHERE kind='anomalia' AND ip='sistema' AND ts>=?", recent)) {
    const d = `Pico de errores técnicos: ${errs} en 10 minutos`;
    securityEvent("anomalia", "sistema", null, d);
    await audit(null, "alerta_tecnica", "system", null, null, { errores: errs });
    alertAdmins(d);
    found.push(d);
  }
  return found.length ? found.join(" | ") : "Sin anomalías";
}

/** Procesos por lotes del módulo técnico. */
export const jobs: Job[] = [
  { name: "recordatorios_eventos", everyMs: 60_000, run: sendEventReminders },
  { name: "reintentos_onbase", everyMs: 30_000, run: () => processQueue("onbase.store") },
  { name: "entregas_webhooks", everyMs: 15_000, run: deliverDue },
  { name: "deteccion_anomalias", everyMs: 60_000, run: detectAnomalies },
  { name: "limpieza_sesiones_tokens", everyMs: 10 * 60_000, run: cleanup },
  { name: "anonimizar_invitaciones", everyMs: 6 * 3600_000, run: anonymizeInvites },
];
