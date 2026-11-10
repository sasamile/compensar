import crypto from "node:crypto";
import { all, get, insert, now, run, setting } from "./db";
import { redactPii } from "./sanitize";

/**
 * Resiliencia de integraciones (TEC-35, TEC-37, RF-INT-03, RF-INT-04):
 *  - Circuit breaker persistente (tabla circuit_breakers): tras N fallas seguidas deja de llamar al sistema
 *    externo durante un tiempo; luego permite un intento de prueba (semiabierto).
 *  - Cola de reintentos (integration_jobs) con espera exponencial e idempotencia (kind + ref_id).
 *  - Registro de cada intercambio (integration_log) sin datos sensibles.
 *  - Registro de errores técnicos (error_log) con identificador de traza (TEC-73).
 */

/* ---------------- errores técnicos ---------------- */
export function logError(source: string, err: unknown, userId?: number | null): string {
  const trace = crypto.randomBytes(6).toString("hex");
  try {
    const e = err as any;
    const msg = redactPii(String(e?.message ?? e ?? "Error desconocido")).slice(0, 1000);
    const stack = e?.stack ? redactPii(String(e.stack)).split("\n").slice(0, 12).join("\n") : null;
    insert("INSERT INTO error_log(ts,source,message,stack,user_id) VALUES(?,?,?,?,?)", now(), source.slice(0, 200), `[traza ${trace}] ${msg}`, stack, userId ?? null);
    console.error(JSON.stringify({ level: "error", ts: now(), trace, source, message: msg }));
  } catch {}
  return trace;
}

/* ---------------- registro de intercambios ---------------- */
export function logExchange(system: string, operation: string, ref: string | number | null, ok: boolean, ms: number, detail?: string) {
  try {
    insert("INSERT INTO integration_log(ts,system,operation,ref,ok,ms,detail) VALUES(?,?,?,?,?,?,?)",
      now(), system, operation, ref == null ? null : String(ref), ok ? 1 : 0, Math.round(ms), detail ? redactPii(detail).slice(0, 500) : null);
  } catch {}
}

/* ---------------- circuit breaker ---------------- */
export class BreakerOpenError extends Error {
  constructor(public breaker: string) { super(`Integración ${breaker} temporalmente suspendida (circuit breaker abierto)`); }
}
const threshold = () => Number(setting("breaker_threshold", "3")) || 3;
const openMs = () => (Number(setting("breaker_open_s", "60")) || 60) * 1000;

export function breakerState(name: string): { state: string; failures: number; opened_at: string | null } {
  return get<any>("SELECT * FROM circuit_breakers WHERE name=?", name) ?? { state: "cerrado", failures: 0, opened_at: null };
}
function setBreaker(name: string, state: string, failures: number, openedAt: string | null) {
  run("INSERT INTO circuit_breakers(name,state,failures,opened_at) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET state=excluded.state, failures=excluded.failures, opened_at=excluded.opened_at",
    name, state, failures, openedAt);
}
export const resetBreaker = (name: string) => setBreaker(name, "cerrado", 0, null);

/** Ejecuta `fn` protegido por el breaker `name`, con tiempo de espera. Registra el intercambio. */
export async function callExternal<T>(name: string, operation: string, ref: string | number | null, fn: () => Promise<T>, timeoutMs = 10000): Promise<T> {
  const b = breakerState(name);
  if (b.state === "abierto") {
    if (Date.now() - new Date(b.opened_at || 0).getTime() < openMs()) {
      logExchange(name, operation, ref, false, 0, "breaker abierto: no se llamó al sistema externo");
      throw new BreakerOpenError(name);
    }
    setBreaker(name, "semiabierto", b.failures, b.opened_at); // un intento de prueba
  }
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Tiempo de espera agotado (${timeoutMs} ms)`)), timeoutMs)),
    ]);
    setBreaker(name, "cerrado", 0, null);
    logExchange(name, operation, ref, true, Date.now() - t0);
    return r;
  } catch (e: any) {
    const cur = breakerState(name);
    const failures = (cur.failures || 0) + 1;
    const open = cur.state === "semiabierto" || failures >= threshold();
    setBreaker(name, open ? "abierto" : "cerrado", failures, open ? now() : null);
    logExchange(name, operation, ref, false, Date.now() - t0, e?.message);
    throw e;
  }
}

/* ---------------- cola de reintentos ---------------- */
type Handler = (job: { id: number; ref_id: number; payload: any; attempts: number }) => Promise<string | void>;
const g = globalThis as any;
const handlers: Record<string, Handler> = (g.__feQueueHandlers ??= {});
export const registerHandler = (kind: string, fn: Handler) => { handlers[kind] = fn; };

export const MAX_ATTEMPTS = 12;
/** Espera exponencial: base·2^(n-1), con tope de 6 h (base configurable, 30 s por defecto). */
export function backoffMs(attempts: number, baseS = Number(setting("retry_base_s", "30")) || 30) {
  return Math.min(6 * 3600, baseS * 2 ** Math.max(0, attempts - 1)) * 1000;
}

/** Encola de forma idempotente: si ya hay un trabajo pendiente del mismo tipo y referencia, no duplica. */
export function enqueue(kind: string, refId: number, payload: any = {}, delayMs = 0): number {
  const ex = get<any>("SELECT id FROM integration_jobs WHERE kind=? AND ref_id=? AND status IN ('pendiente','fallido')", kind, refId);
  if (ex) { run("UPDATE integration_jobs SET status='pendiente' WHERE id=?", ex.id); return ex.id; }
  return insert("INSERT INTO integration_jobs(kind,ref_id,payload,status,attempts,next_at,created_at) VALUES(?,?,?,?,0,?,?)",
    kind, refId, JSON.stringify(payload ?? {}), "pendiente", new Date(Date.now() + delayMs).toISOString(), now());
}

/** Procesa los trabajos vencidos (o todos si force). Devuelve un resumen. */
export async function processQueue(kind?: string, force = false): Promise<string> {
  const rows = all<any>(
    `SELECT * FROM integration_jobs WHERE status='pendiente' ${kind ? "AND kind=?" : ""} ${force ? "" : "AND (next_at IS NULL OR next_at<=?)"} ORDER BY id LIMIT 50`,
    ...(kind ? [kind] : []), ...(force ? [] : [now()]));
  let ok = 0, fail = 0;
  for (const j of rows) {
    const h = handlers[j.kind];
    if (!h) continue;
    // reclama el trabajo (evita doble proceso si dos ejecutores coinciden)
    const claimed = run("UPDATE integration_jobs SET next_at=? WHERE id=? AND status='pendiente' AND IFNULL(next_at,'')=IFNULL(?,'')",
      new Date(Date.now() + 120000).toISOString(), j.id, j.next_at).changes;
    if (!claimed) continue;
    try {
      await h({ id: j.id, ref_id: j.ref_id, payload: JSON.parse(j.payload || "{}"), attempts: j.attempts });
      run("UPDATE integration_jobs SET status='ok', attempts=attempts+1, done_at=?, last_error=NULL, next_at=NULL WHERE id=?", now(), j.id);
      ok++;
    } catch (e: any) {
      const attempts = j.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      run("UPDATE integration_jobs SET attempts=?, status=?, next_at=?, last_error=? WHERE id=?",
        attempts, final ? "fallido" : "pendiente", final ? null : new Date(Date.now() + backoffMs(attempts)).toISOString(), redactPii(e?.message || String(e)).slice(0, 300), j.id);
      fail++;
    }
  }
  return `${rows.length} en cola · ${ok} ok · ${fail} con falla`;
}
