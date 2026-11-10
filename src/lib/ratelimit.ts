import { get, insert, now, run, setting } from "./db";

/**
 * Protección contra bots y abuso (TEC-7, RNF-SEG-03):
 *  - Límite de peticiones por IP y por cuenta (ventana fija en la tabla rate_limits).
 *  - Campo trampa (honeypot) invisible para personas: si llega con valor, es un bot.
 *  - Cloudflare Turnstile (verificación invisible) opcional si existen TURNSTILE_SITE_KEY y TURNSTILE_SECRET.
 *  - Bloqueo de cuenta por intentos fallidos (en login/actions.ts) y registro de eventos de seguridad para
 *    la detección de anomalías (job deteccion_anomalias).
 * En producción se complementa con AWS WAF Bot Control en el perímetro (fuera del código).
 */
export const HONEYPOT_FIELD = "website";
export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || "";
export const turnstileEnabled = () => !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET);

export type Limit = { ok: boolean; count: number; limit: number; retryAfter: number };

/** Cuenta un intento en la ventana y dice si todavía está dentro del límite. */
export function hit(key: string, limit: number, windowMs: number): Limit {
  const t = Date.now();
  const r = get<any>("SELECT * FROM rate_limits WHERE key=?", key);
  if (!r || t - r.window_start >= windowMs) {
    run("INSERT INTO rate_limits(key,count,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start", key, t);
    return { ok: 1 <= limit, count: 1, limit, retryAfter: 0 };
  }
  const count = r.count + 1;
  run("UPDATE rate_limits SET count=? WHERE key=?", count, key);
  return { ok: count <= limit, count, limit, retryAfter: Math.ceil((r.window_start + windowMs - t) / 1000) };
}

/** Consulta sin sumar. */
export function peek(key: string, limit: number, windowMs: number): Limit {
  const t = Date.now();
  const r = get<any>("SELECT * FROM rate_limits WHERE key=?", key);
  if (!r || t - r.window_start >= windowMs) return { ok: true, count: 0, limit, retryAfter: 0 };
  return { ok: r.count < limit, count: r.count, limit, retryAfter: Math.ceil((r.window_start + windowMs - t) / 1000) };
}

export const resetLimit = (key: string) => run("DELETE FROM rate_limits WHERE key=?", key);
/** Devuelve un intento al cupo (p. ej. tras un ingreso exitoso): el límite por IP frena a quien falla, no a una oficina que entra bien. */
export const refundLimit = (key: string) => run("UPDATE rate_limits SET count=MAX(count-1,0) WHERE key=?", key);

/** Límites por acción (configurables en Integraciones → Seguridad). */
const DEF: Record<string, [number, number]> = {
  login: [60, 15], // por IP: 60 intentos / 15 min (oficinas detrás de una misma IP); los ingresos exitosos no consumen cupo
  login_cuenta: [10, 15], // por cuenta: 10 intentos / 15 min (además del bloqueo tras 5 fallidos)
  otp: [30, 15], // solicitudes de código por IP; las que terminan en ingreso exitoso no consumen cupo
  otp_cuenta: [5, 15], // solicitudes de código por correo
  registro: [5, 60], // autorregistros por IP / hora
  inscripcion: [30, 10], // inscripciones por IP
  token: [30, 5], // emisión de tokens OAuth por IP
  api: [600, 1], // llamadas a la API por cliente / minuto
};
export function limitFor(action: string): { limit: number; windowMs: number } {
  const [l, m] = DEF[action] ?? [30, 10];
  return { limit: Number(setting(`rl_${action}`, String(l))) || l, windowMs: m * 60000 };
}

export function securityEvent(kind: string, ip: string, email?: string | null, detail?: string) {
  try { insert("INSERT INTO security_events(ts,kind,ip,email,detail) VALUES(?,?,?,?,?)", now(), kind, ip || "", email || null, detail || null); } catch {}
}

/** Aplica el límite de una acción a una clave (IP o cuenta). Devuelve mensaje de error o null. */
export function limitAction(action: string, subject: string, ip: string, email?: string | null): string | null {
  const { limit, windowMs } = limitFor(action);
  const r = hit(`${action}:${subject}`, limit, windowMs);
  if (r.ok) return null;
  if (r.count === limit + 1) securityEvent("limite_excedido", ip, email, `${action} (${limit} en ${windowMs / 60000} min)`);
  const min = Math.max(1, Math.ceil(r.retryAfter / 60));
  return `Demasiados intentos. Por seguridad espera ${min} minuto${min === 1 ? "" : "s"} e inténtalo de nuevo.`;
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET || "", response: token, remoteip: ip });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const j: any = await r.json();
    return !!j.success;
  } catch {
    return false; // si Cloudflare no responde se niega (fail-closed); el usuario puede reintentar
  }
}

/**
 * Verificación anti-bots de un formulario público: campo trampa + Turnstile (si está configurado) + límite por IP.
 * Devuelve un mensaje de error para el usuario o null si puede continuar.
 */
export async function botGuard(fd: FormData, action: string, ip: string, email?: string | null): Promise<string | null> {
  if (String(fd.get(HONEYPOT_FIELD) || "").trim()) {
    securityEvent("bot_honeypot", ip, email, action);
    return "No pudimos procesar la solicitud. Recarga la página e inténtalo de nuevo.";
  }
  if (turnstileEnabled() && setting("turnstile_enabled", "1") === "1") {
    const tok = String(fd.get("cf-turnstile-response") || "");
    if (!tok || !(await verifyTurnstile(tok, ip))) {
      securityEvent("bot_turnstile", ip, email, action);
      return "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.";
    }
  }
  return limitAction(action, `ip:${ip}`, ip, email);
}

/* ---------- RF-ACC-03: bloqueo temporal por códigos errados (ingreso con código y recuperación de clave) ---------- */
/** Máximo de códigos errados por cuenta antes del bloqueo (configurable: setting codigo_max_fallidos). */
export const codeMaxFails = () => Number(setting("codigo_max_fallidos", "5")) || 5;
/** Minutos de bloqueo tras el último código errado (configurable: setting codigo_bloqueo_min). */
export const codeLockMinutes = () => Number(setting("codigo_bloqueo_min", "15")) || 15;
const codeKey = (email: string) => `codigo_fallido:${String(email || "").toLowerCase()}`;

/**
 * Estado del bloqueo por códigos de una cuenta (por correo, exista o no: la respuesta no revela si existe).
 * Los fallos se cuentan dentro de una ventana de N minutos; al llegar al máximo la ventana se reinicia y
 * mientras dure la cuenta queda bloqueada.
 */
export function codeLockStatus(email: string): { locked: boolean; fails: number; minutesLeft: number } {
  const r = get<any>("SELECT * FROM rate_limits WHERE key=?", codeKey(email));
  const ms = codeLockMinutes() * 60000;
  if (!r || Date.now() - r.window_start >= ms) return { locked: false, fails: 0, minutesLeft: 0 };
  const locked = r.count >= codeMaxFails();
  return { locked, fails: r.count, minutesLeft: locked ? Math.max(1, Math.ceil((r.window_start + ms - Date.now()) / 60000)) : 0 };
}

/** Registra un código errado. Devuelve si la cuenta quedó bloqueada y cuántos intentos le quedan. */
export function registerCodeFailure(email: string): { locked: boolean; fails: number; remaining: number } {
  const t = Date.now();
  const max = codeMaxFails();
  const ms = codeLockMinutes() * 60000;
  const r = get<any>("SELECT * FROM rate_limits WHERE key=?", codeKey(email));
  const fails = !r || t - r.window_start >= ms ? 1 : r.count + 1;
  // al llegar al máximo la ventana arranca de nuevo: el bloqueo dura los minutos completos desde el último intento
  const start = !r || t - r.window_start >= ms || fails >= max ? t : r.window_start;
  run("INSERT INTO rate_limits(key,count,window_start) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count, window_start=excluded.window_start",
    codeKey(email), fails, start);
  return { locked: fails >= max, fails, remaining: Math.max(0, max - fails) };
}

/** Un código correcto limpia el contador de fallos. */
export const clearCodeFailures = (email: string) => resetLimit(codeKey(email));
