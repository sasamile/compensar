/**
 * Tablas propias del módulo Validación de requisitos + Rutas de acompañamiento.
 * (Las tablas principales están en src/lib/schema2.ts; aquí solo las complementarias.)
 */
export const SQL = `
-- Bitácora de avance de las rutas (FUN-82): qué se hizo, cuándo, quién y con qué evidencia
CREATE TABLE IF NOT EXISTS route_step_log (
  id INTEGER PRIMARY KEY, company_route_id INTEGER, step_id INTEGER,
  action TEXT,                                -- creada | activada | en_curso | completado | reabierto | evidencia | editado | cierre_solicitado | cerrada | escalada
  status TEXT, note TEXT, value REAL, doc_id INTEGER, user_id INTEGER, at TEXT
);
-- Solicitudes de cierre / escalamiento de rutas con aprobación (FUN-94)
CREATE TABLE IF NOT EXISTS route_closures (
  id INTEGER PRIMARY KEY, company_route_id INTEGER,
  kind TEXT DEFAULT 'cierre',                 -- cierre | escalamiento
  outcome TEXT,                               -- cumplida | parcial | no_cumplida
  result TEXT, next_ruta_id INTEGER,
  status TEXT DEFAULT 'pendiente',            -- pendiente | aprobada | rechazada
  requested_by INTEGER, requested_at TEXT, decided_by INTEGER, decided_at TEXT, decision_note TEXT, new_route_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vcases_company ON validation_cases(company_id);
CREATE INDEX IF NOT EXISTS idx_vcases_status ON validation_cases(status);
CREATE INDEX IF NOT EXISTS idx_inforeq_case ON info_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_croutes_company ON company_routes(company_id);
CREATE INDEX IF NOT EXISTS idx_crsteps_route ON company_route_steps(company_route_id);
CREATE INDEX IF NOT EXISTS idx_rslog_route ON route_step_log(company_route_id);
`;
