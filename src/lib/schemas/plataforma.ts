// Tablas adicionales propias del módulo plataforma.
export const SQL = `
-- Comentarios de los probadores (se escriben desde cualquier pantalla con el botón «Comentarios»)
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY, user_id INTEGER, user_name TEXT, user_email TEXT, roles TEXT,
  page TEXT, kind TEXT, rating INTEGER, message TEXT NOT NULL, user_agent TEXT,
  status TEXT DEFAULT 'nuevo', note TEXT, created_at TEXT, handled_by INTEGER, handled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
`;
