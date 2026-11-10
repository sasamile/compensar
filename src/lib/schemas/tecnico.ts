// Tablas adicionales propias del módulo técnico (seguridad, integraciones, observabilidad). Se ejecuta al abrir la base.
export const SQL = `
-- Flujos de autenticación de corta vida: segundo factor pendiente, enrolamiento, OIDC (state/nonce/PKCE),
-- códigos del IdP de prueba y secretos de "mostrar una sola vez".
CREATE TABLE IF NOT EXISTS auth_flows (
  id TEXT PRIMARY KEY, kind TEXT, user_id INTEGER, data TEXT, created_at TEXT, expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_flows_exp ON auth_flows(expires_at);
-- Último paso TOTP usado por usuario (anti-repetición) y códigos de recuperación (hash).
CREATE TABLE IF NOT EXISTS mfa_state (user_id INTEGER PRIMARY KEY, last_step INTEGER DEFAULT 0, enrolled_at TEXT);
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (id INTEGER PRIMARY KEY, user_id INTEGER, code_hash TEXT, used_at TEXT, created_at TEXT);
-- Metadatos de la sesión web (método de ingreso y navegador) para "sesiones activas" y cierre remoto.
CREATE TABLE IF NOT EXISTS session_meta (token TEXT PRIMARY KEY, user_id INTEGER, method TEXT, ua TEXT, created_at TEXT);
-- Eventos de seguridad (ingresos fallidos, bloqueos por bots/límite, anomalías) para detección y alertas.
CREATE TABLE IF NOT EXISTS security_events (id INTEGER PRIMARY KEY, ts TEXT, kind TEXT, ip TEXT, email TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_secev_ts ON security_events(ts, kind);
-- Registro de cada intercambio con sistemas externos (RF-INT-04), sin datos sensibles.
CREATE TABLE IF NOT EXISTS integration_log (id INTEGER PRIMARY KEY, ts TEXT, system TEXT, operation TEXT, ref TEXT, ok INTEGER, ms INTEGER, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_intlog_ts ON integration_log(ts);
-- Accesos a la API REST (trazabilidad y métricas).
CREATE TABLE IF NOT EXISTS api_log (id INTEGER PRIMARY KEY, ts TEXT, client_id TEXT, method TEXT, path TEXT, status INTEGER, ms INTEGER, ip TEXT);
CREATE INDEX IF NOT EXISTS idx_apilog_ts ON api_log(ts);
-- Restricción opcional de un cliente API a un programa (mismo alcance que un rol de programa).
CREATE TABLE IF NOT EXISTS api_client_meta (client_id TEXT PRIMARY KEY, program_id INTEGER, description TEXT, last_used_at TEXT);
-- Candado de procesos por lotes: una sola instancia ejecuta cada job aunque haya varios servidores.
CREATE TABLE IF NOT EXISTS job_locks (name TEXT PRIMARY KEY, owner TEXT, until INTEGER);
CREATE INDEX IF NOT EXISTS idx_jobruns_job ON job_runs(job, id);
CREATE INDEX IF NOT EXISTS idx_whd_status ON webhook_deliveries(status, next_at);
CREATE INDEX IF NOT EXISTS idx_ij_status ON integration_jobs(status, next_at);
`;
