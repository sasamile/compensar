/**
 * Modelo de datos de los módulos Deseables, Futuros y técnicos (Anexo 07: FUN-50..100, TEC).
 * Tablas compartidas entre módulos: cualquier módulo puede LEER cualquier tabla; cada módulo escribe en las suyas.
 * Si un módulo necesita tablas adicionales propias, las declara en src/lib/schemas/<modulo>.ts.
 */
export const SCHEMA2 = `
-- ===== Formularios sin código y diagnóstico (FRM / DIA) =====
CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  kind TEXT DEFAULT 'inscripcion',            -- inscripcion | diagnostico | encuesta | general
  program_id INTEGER, event_id INTEGER, slug TEXT UNIQUE,
  status TEXT DEFAULT 'borrador',             -- borrador | publicado | archivado
  version INTEGER DEFAULT 0,                  -- última versión publicada (0 = nunca)
  schema TEXT DEFAULT '{"sections":[]}',      -- borrador actual (JSON)
  scoring TEXT DEFAULT '{"levels":[]}',       -- niveles/recomendaciones (diagnóstico)
  requires_login INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS form_versions (
  id INTEGER PRIMARY KEY, form_id INTEGER, version INTEGER, schema TEXT, scoring TEXT,
  published_at TEXT, published_by INTEGER, UNIQUE(form_id, version)
);
CREATE TABLE IF NOT EXISTS form_responses (
  id INTEGER PRIMARY KEY, form_id INTEGER, form_version INTEGER, company_id INTEGER, user_id INTEGER, email TEXT,
  answers TEXT DEFAULT '{}',
  status TEXT DEFAULT 'borrador',             -- borrador | enviado | en_revision | ajustes | aprobado | rechazado
  score REAL, level TEXT, result TEXT,        -- result: JSON {sections:[{name,score,max}], recommendations:[]}
  assigned_to INTEGER, decision_reason TEXT, submitted_at TEXT, updated_at TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS diagnostics (
  id INTEGER PRIMARY KEY, company_id INTEGER, form_id INTEGER, response_id INTEGER,
  stage TEXT DEFAULT 'inicial',               -- inicial | final | seguimiento
  status TEXT DEFAULT 'asignado',             -- asignado | en_curso | en_revision | completado
  assigned_by INTEGER, assigned_to INTEGER, score REAL, level TEXT, segment TEXT,
  completed_at TEXT, created_at TEXT
);

-- ===== Validación de requisitos (VAL) =====
CREATE TABLE IF NOT EXISTS validation_rules (
  id INTEGER PRIMARY KEY, program_id INTEGER, key TEXT, name TEXT, field TEXT, operator TEXT, value TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS validation_cases (
  id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'empresa', company_id INTEGER, response_id INTEGER, program_id INTEGER,
  status TEXT DEFAULT 'pendiente',            -- pendiente | en_revision | ajustes | aprobado | rechazado
  assigned_to INTEGER, auto_result TEXT, checklist TEXT, observations TEXT,
  decided_by INTEGER, decided_at TEXT, reason TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS info_requests (
  id INTEGER PRIMARY KEY, case_id INTEGER, message TEXT, due_at TEXT,
  status TEXT DEFAULT 'abierta',              -- abierta | respondida | vencida
  response TEXT, doc_id INTEGER, created_by INTEGER, created_at TEXT, answered_at TEXT, reminded_at TEXT
);
-- Réplica simulada de "Gestión de Clientes" de Compensar (adaptador en src/lib/integrations/gestion-clientes.ts)
CREATE TABLE IF NOT EXISTS client_registry (
  nit TEXT PRIMARY KEY, razon_social TEXT, afiliado INTEGER, meses_afiliacion INTEGER, al_dia_parafiscales INTEGER,
  ventas_brutas REAL, inscrito_agencia INTEGER, aportes_meses_3a INTEGER, cesante INTEGER
);

-- ===== Rutas de acompañamiento (RUT) — plantillas = tabla rutas =====
CREATE TABLE IF NOT EXISTS route_template_steps (
  id INTEGER PRIMARY KEY, ruta_id INTEGER, ord INTEGER, name TEXT, kind TEXT DEFAULT 'servicio', -- servicio | curso | actividad
  servicio_id INTEGER, event_id INTEGER, indicator TEXT, goal REAL
);
CREATE TABLE IF NOT EXISTS company_routes (
  id INTEGER PRIMARY KEY, company_id INTEGER, ruta_id INTEGER, name TEXT,
  status TEXT DEFAULT 'propuesta',            -- propuesta | activa | cerrada | escalada
  origin TEXT DEFAULT 'plantilla',            -- plantilla | diagnostico | recomendacion
  diagnostic_id INTEGER, approved_by INTEGER, approved_at TEXT, closed_at TEXT, close_result TEXT,
  parent_id INTEGER, created_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS company_route_steps (
  id INTEGER PRIMARY KEY, company_route_id INTEGER, ord INTEGER, name TEXT, kind TEXT, servicio_id INTEGER, event_id INTEGER,
  indicator TEXT, baseline REAL, goal REAL, current REAL,
  status TEXT DEFAULT 'pendiente',            -- pendiente | en_curso | completado
  due_at TEXT, completed_at TEXT, evidence_doc_id INTEGER
);

-- ===== Indicadores, servicios, alertas y operación (SEG / GSV / ALE) =====
CREATE TABLE IF NOT EXISTS indicator_defs (
  id INTEGER PRIMARY KEY, program_id INTEGER, servicio_id INTEGER, name TEXT, unit TEXT,
  kind TEXT DEFAULT 'impacto',                -- gestion | impacto
  formula TEXT, baseline_default REAL, goal REAL, periodicity TEXT DEFAULT 'mensual', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS indicator_values (
  id INTEGER PRIMARY KEY, indicator_id INTEGER, value REAL, note TEXT, doc_id INTEGER, session_id INTEGER,
  recorded_by INTEGER, recorded_at TEXT
);
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'servicio',  -- servicio | evento | cierre
  referral_id INTEGER, closure_id INTEGER, event_id INTEGER, company_id INTEGER, servicio_id INTEGER, aliado_id INTEGER,
  user_id INTEGER, token TEXT UNIQUE, status TEXT DEFAULT 'enviada', nps INTEGER, satisfaction INTEGER,
  answers TEXT, comment TEXT, sent_at TEXT, answered_at TEXT
);
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, kind TEXT DEFAULT 'documento', -- documento | video | enlace | herramienta
  url TEXT, doc_id INTEGER, program_id INTEGER, servicio_id INTEGER, tags TEXT, active INTEGER DEFAULT 1,
  created_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY, key TEXT UNIQUE, name TEXT, description TEXT, threshold INTEGER,
  owner_role TEXT, channel TEXT DEFAULT 'correo', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, rule_key TEXT, company_id INTEGER, program_id INTEGER, entity TEXT, entity_id INTEGER,
  severity TEXT DEFAULT 'amarilla',           -- amarilla | roja
  message TEXT, status TEXT DEFAULT 'abierta', owner_id INTEGER, created_at TEXT, resolved_at TEXT, resolved_by INTEGER
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, company_id INTEGER, program_id INTEGER,
  assignee_id INTEGER, due_at TEXT, status TEXT DEFAULT 'pendiente', -- pendiente | en_curso | hecha
  evidence_doc_id INTEGER, created_by INTEGER, created_at TEXT, done_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, company_id INTEGER, mentor_id INTEGER, from_user_id INTEGER, body TEXT NOT NULL,
  sent_at TEXT, read_at TEXT
);

-- ===== Analítica (ANA) =====
CREATE TABLE IF NOT EXISTS dashboards (
  id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, widgets TEXT DEFAULT '[]', shared INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS saved_reports (
  id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, source TEXT, columns TEXT, filters TEXT, created_at TEXT
);

-- ===== Técnicos (TEC): API, webhooks, colas, jobs, logs, seguridad =====
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER);
CREATE TABLE IF NOT EXISTS api_clients (
  id INTEGER PRIMARY KEY, name TEXT, client_id TEXT UNIQUE, secret_hash TEXT, scopes TEXT, active INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS api_tokens (token TEXT PRIMARY KEY, client_id TEXT, scopes TEXT, expires_at TEXT);
CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY, url TEXT, events TEXT, secret TEXT, active INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY, webhook_id INTEGER, event TEXT, payload TEXT, status TEXT DEFAULT 'pendiente',
  attempts INTEGER DEFAULT 0, next_at TEXT, last_error TEXT, created_at TEXT, delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS integration_jobs (
  id INTEGER PRIMARY KEY, kind TEXT, ref_id INTEGER, payload TEXT, status TEXT DEFAULT 'pendiente', -- pendiente | ok | fallido
  attempts INTEGER DEFAULT 0, next_at TEXT, last_error TEXT, created_at TEXT, done_at TEXT
);
CREATE TABLE IF NOT EXISTS circuit_breakers (name TEXT PRIMARY KEY, state TEXT DEFAULT 'cerrado', failures INTEGER DEFAULT 0, opened_at TEXT);
CREATE TABLE IF NOT EXISTS error_log (id INTEGER PRIMARY KEY, ts TEXT, source TEXT, message TEXT, stack TEXT, user_id INTEGER);
CREATE TABLE IF NOT EXISTS job_runs (id INTEGER PRIMARY KEY, job TEXT, started_at TEXT, finished_at TEXT, ok INTEGER, detail TEXT);
-- ===== Ampliaciones ERS (segunda revisión) =====
-- Disponibilidad semanal del mentor (RF-ACO-04/05)
CREATE TABLE IF NOT EXISTS mentor_availability (
  id INTEGER PRIMARY KEY, mentor_id INTEGER, weekday INTEGER, start_time TEXT, end_time TEXT, modality TEXT, active INTEGER DEFAULT 1
);
-- Un usuario puede ser contacto de varias empresas (RF-EMP-03); users.company_id es su empresa principal
CREATE TABLE IF NOT EXISTS company_contacts (
  id INTEGER PRIMARY KEY, company_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'colaborador', created_by INTEGER, created_at TEXT,
  UNIQUE(company_id, user_id)
);
-- Cargues masivos en segundo plano con aviso al terminar (RNF-REN-07)
CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY, kind TEXT, filename TEXT, format TEXT, status TEXT DEFAULT 'pendiente', -- pendiente | procesando | ok | con_errores | fallido
  total INTEGER, created_count INTEGER, errors TEXT, options TEXT, payload TEXT, created_by INTEGER, created_at TEXT, finished_at TEXT
);
-- Recordatorios de sesiones de mentoría (RF-ACO-11)
CREATE TABLE IF NOT EXISTS session_reminder_log (session_id INTEGER, kind TEXT, sent_at TEXT, UNIQUE(session_id, kind));

CREATE TABLE IF NOT EXISTS reminder_log (event_id INTEGER, registration_id INTEGER, kind TEXT, sent_at TEXT, UNIQUE(event_id, registration_id, kind));
`;
