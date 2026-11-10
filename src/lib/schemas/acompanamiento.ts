// Tablas propias del módulo acompañamiento (agenda, calendario M365, sincronización con Gestión de Clientes).
// mentor_availability y session_reminder_log están en schema2.ts (convención: weekday 1=lunes … 7=domingo; horas "HH:MM" Colombia).
export const SQL = `
-- Estado de la sincronización de cada sesión con el calendario Microsoft 365 del mentor (RF-ACO-04)
CREATE TABLE IF NOT EXISTS session_calendar_sync (
  session_id INTEGER PRIMARY KEY, mentor_email TEXT, event_id TEXT, mode TEXT, -- graph | simulado
  status TEXT, last_op TEXT, sequence INTEGER DEFAULT 0, ics TEXT, last_error TEXT, updated_at TEXT
);
-- Última fotografía de los datos de la empresa en Gestión de Clientes (ERS §6)
CREATE TABLE IF NOT EXISTS company_client_sync (
  company_id INTEGER PRIMARY KEY, nit TEXT, status TEXT, -- ok | no_encontrada | error
  data TEXT, source TEXT, synced_at TEXT, synced_by INTEGER, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_mentor_at ON mentoring_sessions(mentor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_avail_mentor ON mentor_availability(mentor_id, weekday);
`;
