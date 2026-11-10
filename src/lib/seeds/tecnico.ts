import { get, insert, now, run } from "../db";
import { hashPassword } from "../auth";
import { DEFAULT_GROUP_MAP, mockClientSecret } from "../oidc";

/** Datos de demostración y valores por defecto del módulo técnico. Idempotente. */
export const DEMO_API_CLIENT = { client_id: "fe_demo_bi", secret: "fes_demo_PowerBI_2026_solo_para_demostracion" };

export function seed() {
  const demo = process.env.DEMO_MODE !== "0";
  const defaults: Record<string, string> = {
    mfa_required_internal: "1",
    sso_enabled: "1",
    sso_provider: "mock",
    sso_mock_enabled: demo ? "1" : "0",
    sso_jit: "1",
    sso_trust_idp_mfa: "1",
    sso_session_max_h: "8",
    sso_scopes: "openid profile email",
    sso_group_claim: "groups",
    sso_group_map: JSON.stringify(DEFAULT_GROUP_MAP, null, 1),
    turnstile_enabled: "1",
    invite_anonymize_days: "90",
    anomaly_login_threshold: "10",
    anomaly_error_threshold: "20",
    webhook_backoff_base_s: "30",
    retry_base_s: "30",
    breaker_threshold: "3",
    breaker_open_s: "60",
    onbase_simulate_down: "0",
  };
  for (const [k, v] of Object.entries(defaults)) run("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", k, v);
  mockClientSecret();

  const tpl: [string, string, string][] = [
    ["alerta_seguridad", "Alerta de seguridad — Fomento Empresarial", "Alerta automática ({{fecha}}): {{detalle}}. Revisa Integraciones → Seguridad."],
  ];
  for (const [key, subject, body] of tpl)
    for (const ch of ["correo", "sms", "whatsapp"])
      run("INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,1)", key, ch, "Alerta de seguridad", subject, body);

  // Cliente API de demostración (solo MODO DEMO): permite probar /api/v1 sin pasar por la consola.
  if (demo && !get("SELECT 1 FROM api_clients WHERE client_id=?", DEMO_API_CLIENT.client_id)) {
    insert("INSERT INTO api_clients(name,client_id,secret_hash,scopes,active,created_at) VALUES(?,?,?,?,1,?)",
      "Power BI Compensar (demo)", DEMO_API_CLIENT.client_id, hashPassword(DEMO_API_CLIENT.secret),
      "empresas.read eventos.read inscripciones.read servicios.read sesiones.read remisiones.read bi.read", now());
    run("INSERT OR IGNORE INTO api_client_meta(client_id,description) VALUES(?,?)", DEMO_API_CLIENT.client_id, "Cliente de demostración sin datos personales ni auditoría");
  }
}
