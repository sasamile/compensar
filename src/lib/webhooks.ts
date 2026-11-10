import crypto from "node:crypto";
import { all, get, insert, now, run, setting } from "./db";
import { logError, logExchange } from "./resilience";

/**
 * Webhooks firmados (RF-INT-05, Anexo 05 #43).
 * emit(evento, datos) crea una entrega por cada suscripción activa y la intenta enseguida en segundo plano.
 * Cada POST lleva:
 *   X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secreto, `${t}.${cuerpo}`)>
 *   X-Event, X-Delivery-Id (clave de idempotencia para el receptor), User-Agent: Fomento-Webhooks/1.0
 * Respuesta 2xx = entregado. Si falla, se reintenta con espera creciente (job entregas_webhooks) hasta 10 intentos.
 */
export const WEBHOOK_EVENTS: [string, string][] = [
  ["inscripcion.creada", "Una empresa se inscribe a un evento o curso"],
  ["asistencia.registrada", "Se registra asistencia (QR, manual o reporte Teams/Zoom)"],
  ["certificado.emitido", "Se emite un certificado de asistencia"],
  ["empresa.activada", "Compensar activa una empresa en un programa"],
  ["sesion.aceptada", "La empresa acepta una sesión de mentoría"],
  ["cierre.aprobado", "Se aprueba el cierre de un servicio"],
];
export const MAX_WEBHOOK_ATTEMPTS = 10;

export const sign = (secret: string, t: number, body: string) => crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

/** Verificación de firma (la usan los receptores; ejemplo en la guía técnica). Tolerancia de 5 min contra repetición. */
export function verifySignature(secret: string, header: string, body: string, toleranceS = 300): boolean {
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceS) return false;
  const exp = Buffer.from(sign(secret, t, body));
  const got = Buffer.from(parts.v1);
  return exp.length === got.length && crypto.timingSafeEqual(exp, got);
}

const backoff = (attempts: number) => Math.min(6 * 3600, (Number(setting("webhook_backoff_base_s", "30")) || 30) * 2 ** Math.max(0, attempts - 1)) * 1000;

/** Publica un evento. Nunca lanza excepción: un webhook caído no debe romper la operación de negocio. */
export function emit(event: string, data: Record<string, any>): number[] {
  const ids: number[] = [];
  try {
    const hooks = all<any>("SELECT * FROM webhooks WHERE active=1");
    for (const h of hooks) {
      const evs = String(h.events || "").split(",").map((s) => s.trim());
      if (!evs.includes(event) && !evs.includes("*")) continue;
      const payload = JSON.stringify({ id: "evt_" + crypto.randomBytes(8).toString("hex"), event, created_at: now(), data });
      ids.push(insert("INSERT INTO webhook_deliveries(webhook_id,event,payload,status,attempts,next_at,created_at) VALUES(?,?,?,?,0,?,?)",
        h.id, event, payload, "pendiente", now(), now()));
    }
    if (ids.length) setTimeout(() => { for (const id of ids) void deliver(id).catch(() => {}); }, 0);
  } catch (e) {
    logError("webhooks.emit", e);
  }
  return ids;
}

/** Entrega única a un webhook concreto (botón «Probar»). */
export function emitTo(webhookId: number, event: string, data: Record<string, any>): number {
  const payload = JSON.stringify({ id: "evt_" + crypto.randomBytes(8).toString("hex"), event, created_at: now(), data });
  return insert("INSERT INTO webhook_deliveries(webhook_id,event,payload,status,attempts,next_at,created_at) VALUES(?,?,?,?,0,?,?)",
    webhookId, event, payload, "pendiente", now(), now());
}

export async function deliver(deliveryId: number): Promise<boolean> {
  const d = get<any>("SELECT d.*, w.url, w.secret, w.active FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.id=?", deliveryId);
  if (!d || d.status === "entregado") return true;
  // reclama la entrega para que dos ejecutores no la envíen a la vez
  const claim = run("UPDATE webhook_deliveries SET next_at=? WHERE id=? AND status='pendiente' AND IFNULL(next_at,'')=IFNULL(?,'')",
    new Date(Date.now() + 60000).toISOString(), d.id, d.next_at).changes;
  if (!claim) return false;
  const t = Math.floor(Date.now() / 1000);
  const t0 = Date.now();
  let ok = false, err = "";
  try {
    const r = await fetch(d.url, {
      method: "POST", body: d.payload, redirect: "manual", signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json", "User-Agent": "Fomento-Webhooks/1.0", "X-Event": d.event, "X-Delivery-Id": String(d.id),
        "X-Signature": `t=${t},v1=${sign(d.secret, t, d.payload)}`,
      },
    });
    ok = r.status >= 200 && r.status < 300;
    if (!ok) err = `HTTP ${r.status}`;
  } catch (e: any) {
    err = e?.name === "TimeoutError" ? "Tiempo de espera agotado (10 s)" : (e?.cause?.code || e?.message || "Error de red");
  }
  const attempts = d.attempts + 1;
  if (ok) run("UPDATE webhook_deliveries SET status='entregado', attempts=?, delivered_at=?, last_error=NULL, next_at=NULL WHERE id=?", attempts, now(), d.id);
  else {
    const final = attempts >= MAX_WEBHOOK_ATTEMPTS;
    run("UPDATE webhook_deliveries SET status=?, attempts=?, last_error=?, next_at=? WHERE id=?",
      final ? "fallido" : "pendiente", attempts, String(err).slice(0, 300), final ? null : new Date(Date.now() + backoff(attempts)).toISOString(), d.id);
  }
  logExchange("webhook", d.event, `entrega ${d.id}`, ok, Date.now() - t0, ok ? undefined : err);
  return ok;
}

/** Job: reintenta las entregas vencidas. */
export async function deliverDue(): Promise<string> {
  const rows = all<any>("SELECT d.id FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.status='pendiente' AND w.active=1 AND (d.next_at IS NULL OR d.next_at<=?) ORDER BY d.id LIMIT 50", now());
  let ok = 0;
  for (const r of rows) if (await deliver(r.id)) ok++;
  return `${rows.length} entregas intentadas · ${ok} entregadas`;
}
