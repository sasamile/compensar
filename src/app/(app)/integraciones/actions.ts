"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, insert, now, run, setSetting, setting } from "@/lib/db";
import { can, demoMode, requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { API_SCOPES, hashSecret, newClientId, newClientSecret } from "@/lib/api-auth";
import { WEBHOOK_EVENTS, deliver, emitTo } from "@/lib/webhooks";
import { logError, processQueue, resetBreaker } from "@/lib/resilience";
import { runJobNow } from "@/lib/jobs/runner";
import { clean, cleanInt, cleanText, cleanUrl } from "@/lib/sanitize";
import { stashOnce } from "@/lib/totp";
import { jparse } from "@/lib/util";
import "@/lib/onbase";

const go = (tab: string, kind: "ok" | "error", m: string, extra = "") => { revalidatePath("/integraciones"); redirect(`/integraciones?tab=${tab}&${kind}=${encodeURIComponent(m)}${extra}`); };
const apiAdmin = async () => { const u = await requireUser(); requirePerm(u, "api.manage"); return u; };
const secAdmin = async () => { const u = await requireUser(); if (!can(u, "security.manage")) redirect("/sin-acceso"); return u; };

/* ---------------- clientes API ---------------- */
export async function createClient(fd: FormData) {
  const u = await apiAdmin();
  const name = clean(fd.get("name"), 80);
  const scopes = fd.getAll("scopes").map(String).filter((s) => API_SCOPES.some(([k]) => k === s));
  // restricciones opcionales del BI (las valida /api/bi/[dataset]): bi.program:<id> / bi.aliado:<id>
  const biProgram = cleanInt(fd.get("bi_program"), 0), biAliado = cleanInt(fd.get("bi_aliado"), 0);
  if ((biProgram || biAliado) && !scopes.includes("bi.read")) scopes.push("bi.read");
  if (biProgram) scopes.push(`bi.program:${biProgram}`);
  if (biAliado) scopes.push(`bi.aliado:${biAliado}`);
  if (name.length < 3) go("clientes", "error", "Escribe un nombre descriptivo (sistema que consumirá la API)");
  if (!scopes.length) go("clientes", "error", "Selecciona al menos un scope");
  const programId = cleanInt(fd.get("program_id"), 0) || null;
  const clientId = newClientId(), secret = newClientSecret();
  insert("INSERT INTO api_clients(name,client_id,secret_hash,scopes,active,created_by,created_at) VALUES(?,?,?,?,1,?,?)", name, clientId, hashSecret(secret), scopes.join(" "), u.id, now());
  run("INSERT OR REPLACE INTO api_client_meta(client_id,program_id,description) VALUES(?,?,?)", clientId, programId, clean(fd.get("description"), 200) || null);
  await audit(u, "crear_cliente_api", "api_client", clientId, null, { name, scopes, program_id: programId });
  go("clientes", "ok", "Cliente creado. Copia el secreto ahora: no se volverá a mostrar.", `&secreto=${stashOnce(u.id, "show_secret", { clientId, secret, name })}`);
}

export async function rotateClient(fd: FormData) {
  const u = await apiAdmin();
  const c = get<any>("SELECT * FROM api_clients WHERE id=?", cleanInt(fd.get("id")));
  if (!c) go("clientes", "error", "Cliente no encontrado");
  const secret = newClientSecret();
  run("UPDATE api_clients SET secret_hash=? WHERE id=?", hashSecret(secret), c.id);
  run("DELETE FROM api_tokens WHERE client_id=?", c.client_id);
  await audit(u, "rotar_secreto_cliente_api", "api_client", c.client_id, null, { tokens_revocados: true });
  go("clientes", "ok", "Secreto rotado; los tokens vigentes se revocaron.", `&secreto=${stashOnce(u.id, "show_secret", { clientId: c.client_id, secret, name: c.name })}`);
}

export async function toggleClient(fd: FormData) {
  const u = await apiAdmin();
  const c = get<any>("SELECT * FROM api_clients WHERE id=?", cleanInt(fd.get("id")));
  if (!c) go("clientes", "error", "Cliente no encontrado");
  const active = c.active ? 0 : 1;
  run("UPDATE api_clients SET active=? WHERE id=?", active, c.id);
  if (!active) run("DELETE FROM api_tokens WHERE client_id=?", c.client_id);
  await audit(u, active ? "reactivar_cliente_api" : "revocar_cliente_api", "api_client", c.client_id, { active: c.active }, { active });
  go("clientes", "ok", active ? "Cliente reactivado" : "Cliente revocado: sus tokens dejaron de funcionar de inmediato");
}

/* ---------------- webhooks ---------------- */
export async function createWebhook(fd: FormData) {
  const u = await apiAdmin();
  const url = cleanUrl(fd.get("url"), !demoMode());
  if (!url) go("webhooks", "error", demoMode() ? "URL inválida (http/https)" : "La URL debe ser https://");
  const events = fd.getAll("events").map(String).filter((e) => e === "*" || WEBHOOK_EVENTS.some(([k]) => k === e));
  if (!events.length) go("webhooks", "error", "Selecciona al menos un evento");
  const secret = "whsec_" + crypto.randomBytes(24).toString("base64url");
  const id = insert("INSERT INTO webhooks(url,events,secret,active,created_by,created_at) VALUES(?,?,?,1,?,?)", url, events.join(","), secret, u.id, now());
  await audit(u, "crear_webhook", "webhook", id, null, { url, events });
  go("webhooks", "ok", "Webhook creado. Copia el secreto de firma: no se volverá a mostrar.", `&secreto=${stashOnce(u.id, "show_secret", { webhook: id, secret, url })}`);
}

export async function toggleWebhook(fd: FormData) {
  const u = await apiAdmin();
  const w = get<any>("SELECT * FROM webhooks WHERE id=?", cleanInt(fd.get("id")));
  if (!w) go("webhooks", "error", "Webhook no encontrado");
  run("UPDATE webhooks SET active=? WHERE id=?", w.active ? 0 : 1, w.id);
  await audit(u, w.active ? "desactivar_webhook" : "activar_webhook", "webhook", w.id, { active: w.active }, { active: w.active ? 0 : 1 });
  go("webhooks", "ok", w.active ? "Webhook desactivado" : "Webhook activado");
}

export async function testWebhook(fd: FormData) {
  const u = await apiAdmin();
  const w = get<any>("SELECT * FROM webhooks WHERE id=?", cleanInt(fd.get("id")));
  if (!w) go("webhooks", "error", "Webhook no encontrado");
  const did = emitTo(w.id, "ping", { mensaje: "Prueba de conexión desde Fomento Empresarial", por: u.email });
  const ok = await deliver(did);
  const d = get<any>("SELECT * FROM webhook_deliveries WHERE id=?", did);
  await audit(u, "probar_webhook", "webhook", w.id, null, { entrega: did, resultado: ok ? "entregado" : d?.last_error });
  ok ? go("webhooks", "ok", `Entrega de prueba #${did} recibida por el destino (2xx)`) : go("webhooks", "error", `La entrega de prueba #${did} falló (${d?.last_error}). Se reintentará con espera creciente.`);
}

export async function retryDelivery(fd: FormData) {
  const u = await apiAdmin();
  const id = cleanInt(fd.get("id"));
  run("UPDATE webhook_deliveries SET status='pendiente', next_at=? WHERE id=? AND status<>'entregado'", now(), id);
  const ok = await deliver(id);
  await audit(u, "reintentar_webhook", "webhook_delivery", id, null, { resultado: ok ? "entregado" : "falla" });
  go("webhooks", ok ? "ok" : "error", ok ? `Entrega #${id} entregada` : `La entrega #${id} volvió a fallar`);
}

/* ---------------- colas, breakers y adaptadores ---------------- */
export async function retryQueue() {
  const u = await apiAdmin();
  run("UPDATE integration_jobs SET status='pendiente', next_at=? WHERE status IN ('pendiente','fallido')", now());
  const r = await processQueue(undefined, true);
  await audit(u, "reintentar_cola_integracion", "integration_jobs", null, null, { resultado: r });
  go("colas", "ok", `Cola procesada: ${r}`);
}

export async function resetBreakerAction(fd: FormData) {
  const u = await apiAdmin();
  const name = clean(fd.get("name"), 60);
  resetBreaker(name);
  await audit(u, "restablecer_breaker", "circuit_breaker", name, null, { state: "cerrado" });
  go("colas", "ok", `Circuit breaker «${name}» restablecido`);
}

export async function toggleOnbaseDown() {
  const u = await apiAdmin();
  const v = setting("onbase_simulate_down", "0") === "1" ? "0" : "1";
  setSetting("onbase_simulate_down", v);
  await audit(u, "simular_caida_onbase", "setting", "onbase_simulate_down", null, { valor: v });
  go("colas", "ok", v === "1" ? "Simulación activa: OnBase «no responde». Los documentos nuevos quedarán en cola." : "OnBase disponible de nuevo. La cola se reenviará en el siguiente ciclo (o pulsa «Reintentar ahora»).");
}

/* ---------------- procesos por lotes ---------------- */
export async function runJobAction(fd: FormData) {
  const u = await apiAdmin();
  const name = clean(fd.get("name"), 60);
  const r = await runJobNow(name);
  await audit(u, "ejecutar_proceso", "job", name, null, { ok: r.ok, detalle: r.detail });
  go("procesos", r.ok ? "ok" : "error", `${name}: ${r.detail}`);
}

/* ---------------- seguridad ---------------- */
export async function saveSecurity(fd: FormData) {
  const u = await secAdmin();
  const keys = ["mfa_required_internal", "session_timeout_min", "turnstile_enabled", "anomaly_login_threshold", "invite_anonymize_days", "rl_login", "rl_login_cuenta"];
  const before = Object.fromEntries(keys.map((k) => [k, setting(k)]));
  const timeout = cleanInt(fd.get("session_timeout_min"), 30, 5, 480);
  setSetting("mfa_required_internal", fd.get("mfa_required_internal") ? "1" : "0");
  setSetting("session_timeout_min", String(timeout));
  setSetting("turnstile_enabled", fd.get("turnstile_enabled") ? "1" : "0");
  setSetting("anomaly_login_threshold", String(cleanInt(fd.get("anomaly_login_threshold"), 10, 3, 1000)));
  setSetting("invite_anonymize_days", String(cleanInt(fd.get("invite_anonymize_days"), 90, 7, 3650)));
  setSetting("rl_login", String(cleanInt(fd.get("rl_login"), 20, 3, 10000)));
  setSetting("rl_login_cuenta", String(cleanInt(fd.get("rl_login_cuenta"), 10, 3, 1000)));
  await audit(u, "configurar_seguridad", "setting", "seguridad", before, Object.fromEntries(keys.map((k) => [k, setting(k)])));
  go("seguridad", "ok", "Configuración de seguridad guardada");
}

export async function saveSso(fd: FormData) {
  const u = await secAdmin();
  const map = cleanText(fd.get("sso_group_map"), 20000);
  const parsed = jparse<any>(map, null);
  if (!Array.isArray(parsed) || parsed.some((r: any) => !r?.group || !r?.role)) go("seguridad", "error", "El mapeo de grupos debe ser un arreglo JSON de objetos {group, role, scope_type, scope_id}");
  const roles = new Set((await import("@/lib/db")).all<any>("SELECT key FROM roles").map((r) => r.key));
  const unknown = parsed.filter((r: any) => !roles.has(r.role)).map((r: any) => r.role);
  if (unknown.length) go("seguridad", "error", `Roles inexistentes en el mapeo: ${unknown.join(", ")}`);
  const provider = fd.get("sso_provider") === "externo" ? "externo" : "mock";
  const issuer = cleanUrl(fd.get("sso_issuer"), !demoMode()).replace(/\/$/, "");
  if (provider === "externo" && (!issuer || !clean(fd.get("sso_client_id")))) go("seguridad", "error", "Para el IdP corporativo indica issuer (https) y client_id");
  const before = { sso_enabled: setting("sso_enabled"), sso_provider: setting("sso_provider"), sso_issuer: setting("sso_issuer"), sso_client_id: setting("sso_client_id"), sso_jit: setting("sso_jit"), sso_trust_idp_mfa: setting("sso_trust_idp_mfa"), sso_group_claim: setting("sso_group_claim") };
  setSetting("sso_enabled", fd.get("sso_enabled") ? "1" : "0");
  setSetting("sso_provider", provider);
  setSetting("sso_issuer", issuer);
  setSetting("sso_client_id", clean(fd.get("sso_client_id"), 200));
  const secret = String(fd.get("sso_client_secret") || "").trim();
  if (secret) setSetting("sso_client_secret", secret.slice(0, 500));
  setSetting("sso_label", clean(fd.get("sso_label"), 60) || "IAM corporativo");
  setSetting("sso_group_claim", clean(fd.get("sso_group_claim"), 60) || "groups");
  setSetting("sso_jit", fd.get("sso_jit") ? "1" : "0");
  setSetting("sso_trust_idp_mfa", fd.get("sso_trust_idp_mfa") ? "1" : "0");
  setSetting("sso_session_max_h", String(cleanInt(fd.get("sso_session_max_h"), 8, 1, 72)));
  setSetting("sso_group_map", JSON.stringify(parsed, null, 1));
  if (demoMode()) setSetting("sso_mock_enabled", fd.get("sso_mock_enabled") ? "1" : "0");
  await audit(u, "configurar_sso", "setting", "sso", before, { ...before, sso_enabled: setting("sso_enabled"), sso_provider: provider, sso_issuer: issuer, sso_client_id: setting("sso_client_id"), sso_jit: setting("sso_jit"), sso_trust_idp_mfa: setting("sso_trust_idp_mfa"), secreto_cambiado: !!secret, reglas: parsed.length });
  go("seguridad", "ok", "Configuración de SSO guardada");
}

export async function testError() {
  const u = await apiAdmin();
  const trace = logError("prueba manual", new Error("Error técnico de prueba generado desde Integraciones (contacto prueba@correo.test)"), u.id);
  await audit(u, "generar_error_prueba", "error_log", trace);
  go("errores", "ok", `Error de prueba registrado (traza ${trace}); el correo del mensaje quedó enmascarado`);
}
