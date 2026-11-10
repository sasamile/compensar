// Tablas e índices propios del módulo convocatorias (eventos, cursos y certificados).
// Las columnas nuevas de events/registrations (sessions_count, landing_template, banner_doc_id, certs_auto,
// sessions_attended) viven en db.ts; aquí solo lo que el módulo necesita además.
export const SQL = `
-- Asistencia por sesión (RF-PAR-04, RF-CON-14): una fila por inscripción y número de sesión asistida.
CREATE TABLE IF NOT EXISTS attendance_sessions (
  registration_id INTEGER NOT NULL, session_no INTEGER NOT NULL, source TEXT, minutes INTEGER,
  recorded_by INTEGER, recorded_at TEXT, PRIMARY KEY (registration_id, session_no)
);
-- Datos adicionales del evento: intensidad horaria que se imprime en el certificado.
CREATE TABLE IF NOT EXISTS event_meta (event_id INTEGER PRIMARY KEY, hours REAL);
-- Firma electrónica Ed25519 de cada certificado (RF-CON-15): datos firmados + firma + llave usada.
CREATE TABLE IF NOT EXISTS certificate_signatures (
  certificate_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, signature TEXT NOT NULL,
  key_id TEXT NOT NULL, alg TEXT DEFAULT 'Ed25519', created_at TEXT
);
-- Rendimiento del listado y del calendario (RF-CON-08: 150 eventos < 2 s)
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_prog_status ON events(program_id, status, active);
CREATE INDEX IF NOT EXISTS idx_reg_event_wait ON registrations(event_id, waitlist);
CREATE INDEX IF NOT EXISTS idx_docs_event ON documents(event_id);
`;
