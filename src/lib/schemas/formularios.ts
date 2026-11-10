// Tablas adicionales propias del módulo formularios. Se ejecuta al abrir la base.
export const SQL = `
-- Avisos enviados por respuesta (evita notificar dos veces el mismo cambio de estado o recordatorio) — FUN-70
CREATE TABLE IF NOT EXISTS form_notices (response_id INTEGER, kind TEXT, sent_at TEXT, UNIQUE(response_id, kind));
CREATE INDEX IF NOT EXISTS idx_fresp_form ON form_responses(form_id, status);
CREATE INDEX IF NOT EXISTS idx_fresp_company ON form_responses(company_id);
CREATE INDEX IF NOT EXISTS idx_fresp_user ON form_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_diag_company ON diagnostics(company_id);
`;
