import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA2 } from "./schema2";
import { MODULE_SCHEMAS } from "./schemas";

const DIR = path.join(process.cwd(), "data");
// Durante `next build` cada proceso usa una base en memoria: la compilación no necesita datos y así
// varios procesos no compiten por el archivo (evita "database is locked").
const FILE = process.env.NEXT_PHASE === "phase-production-build" ? ":memory:"
  : process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DIR, "fomento.db");
fs.mkdirSync(DIR, { recursive: true });

const g = globalThis as any;

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY, key TEXT UNIQUE, name TEXT, description TEXT,
  internal INTEGER DEFAULT 1, perms TEXT DEFAULT '[]', system INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, phone TEXT,
  password_hash TEXT, status TEXT DEFAULT 'activo', internal INTEGER DEFAULT 1,
  must_change_password INTEGER DEFAULT 0, temp_expires_at TEXT,
  failed_attempts INTEGER DEFAULT 0, locked_until TEXT, invited_at TEXT,
  company_id INTEGER, is_principal INTEGER DEFAULT 0, aliado_id INTEGER, created_at TEXT,
  mfa_secret TEXT, mfa_enabled INTEGER DEFAULT 0, sso_subject TEXT, last_login_at TEXT,
  notif_prefs TEXT DEFAULT '{"correo":1,"sms":1,"whatsapp":1}', title TEXT
);
CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, role_id INTEGER NOT NULL,
  scope_type TEXT DEFAULT 'org', scope_id INTEGER, granted_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT, last_seen TEXT, ip TEXT, active_company_id INTEGER
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY, email TEXT, code TEXT, purpose TEXT, expires_at TEXT, used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, requirements TEXT, valid_from TEXT, valid_to TEXT,
  owner TEXT, status TEXT DEFAULT 'activo'
);
CREATE TABLE IF NOT EXISTS ejes (id INTEGER PRIMARY KEY, program_id INTEGER, name TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS lineas (id INTEGER PRIMARY KEY, eje_id INTEGER, name TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS rutas (id INTEGER PRIMARY KEY, linea_id INTEGER, name TEXT, description TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS aliados (id INTEGER PRIMARY KEY, name TEXT NOT NULL, nit TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY, program_id INTEGER, linea_id INTEGER, aliado_id INTEGER, name TEXT NOT NULL,
  kind TEXT DEFAULT 'mentoria', hours REAL DEFAULT 0, sessions INTEGER DEFAULT 0, indicators TEXT,
  internal_cost REAL DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY, key TEXT, channel TEXT, name TEXT, subject TEXT, body TEXT,
  approved INTEGER DEFAULT 0, approved_by INTEGER, UNIQUE(key, channel)
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY, razon_social TEXT NOT NULL, nit TEXT NOT NULL, dv TEXT NOT NULL,
  sector TEXT, size TEXT, city TEXT, program_id INTEGER, status TEXT DEFAULT 'pendiente',
  value_prop TEXT, social TEXT, visible_fields TEXT DEFAULT '["razon_social","sector","value_prop","social","city"]',
  onboarding_done INTEGER DEFAULT 0, consent_at TEXT, source TEXT, created_at TEXT,
  UNIQUE(nit, program_id)
);
CREATE TABLE IF NOT EXISTS company_items (
  id INTEGER PRIMARY KEY, company_id INTEGER, kind TEXT, ref_id INTEGER, label TEXT,
  status TEXT DEFAULT 'asignado', assigned_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS mentor_assignments (
  id INTEGER PRIMARY KEY, company_id INTEGER, mentor_id INTEGER, program_id INTEGER,
  active INTEGER DEFAULT 1, assigned_by INTEGER, from_at TEXT, to_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, program_id INTEGER, title TEXT NOT NULL, type TEXT, description TEXT,
  audience TEXT, requirements TEXT, owner TEXT, status TEXT DEFAULT 'borrador', modality TEXT,
  place TEXT, start_at TEXT, end_at TEXT, capacity INTEGER DEFAULT 30, internal_cost REAL DEFAULT 0,
  external_form_url TEXT, banner_url TEXT, summary TEXT, slug TEXT UNIQUE, min_attendance INTEGER DEFAULT 80,
  min_minutes INTEGER DEFAULT 30, active INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT,
  reminders TEXT DEFAULT '7d,1d,1h', form_id INTEGER, sessions_count INTEGER DEFAULT 1,
  landing_template TEXT DEFAULT 'clasica', banner_doc_id INTEGER, certs_auto INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY, event_id INTEGER, company_id INTEGER, user_id INTEGER, name TEXT, email TEXT,
  phone TEXT, code TEXT UNIQUE, status TEXT DEFAULT 'inscrito', consent_version TEXT, consent_at TEXT,
  waitlist INTEGER DEFAULT 0, attended INTEGER DEFAULT 0, minutes INTEGER DEFAULT 0,
  attendance_source TEXT, created_at TEXT, sessions_attended TEXT DEFAULT '[]',
  UNIQUE(event_id, company_id)
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY, registration_id INTEGER UNIQUE, code TEXT UNIQUE, issued_at TEXT
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY, company_id INTEGER, servicio_id INTEGER, aliado_id INTEGER, referred_by INTEGER,
  mentor_id INTEGER, assigned_by INTEGER, status TEXT DEFAULT 'enviada', accepted_by INTEGER,
  accepted_at TEXT, accepted_ip TEXT, created_at TEXT, closed_at TEXT
);
CREATE TABLE IF NOT EXISTS mentoring_sessions (
  id INTEGER PRIMARY KEY, company_id INTEGER, mentor_id INTEGER, referral_id INTEGER, program_id INTEGER,
  title TEXT, scheduled_at TEXT, duration_min INTEGER DEFAULT 60, modality TEXT, status TEXT DEFAULT 'programada',
  cancel_reason TEXT, topics TEXT, commitments TEXT, results TEXT, hours REAL DEFAULT 0,
  registered_by INTEGER, accepted_by INTEGER, accepted_at TEXT, accepted_ip TEXT, created_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, company_id INTEGER, session_id INTEGER, event_id INTEGER, name TEXT, kind TEXT,
  mime TEXT, size INTEGER, onbase_ref TEXT, onbase_status TEXT DEFAULT 'en_cola',
  uploaded_by INTEGER, accepted_by INTEGER, accepted_at TEXT, accepted_ip TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS indicators (
  id INTEGER PRIMARY KEY, company_id INTEGER, program_id INTEGER, name TEXT, baseline REAL, final REAL,
  goal REAL, updated_by INTEGER, updated_at TEXT, def_id INTEGER, servicio_id INTEGER, referral_id INTEGER, unit TEXT
);
CREATE TABLE IF NOT EXISTS closures (
  id INTEGER PRIMARY KEY, company_id INTEGER, referral_id INTEGER, program_id INTEGER, result TEXT,
  status TEXT DEFAULT 'pendiente', approved_by INTEGER, approved_at TEXT, created_by INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_reports (
  id INTEGER PRIMARY KEY, aliado_id INTEGER, period TEXT, status TEXT DEFAULT 'pendiente',
  total_sessions INTEGER, total_hours REAL, total_cost REAL, approved_by INTEGER, approved_at TEXT,
  created_by INTEGER, created_at TEXT, UNIQUE(aliado_id, period)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, channel TEXT, template_key TEXT, to_addr TEXT, user_id INTEGER, subject TEXT, body TEXT,
  status TEXT DEFAULT 'enviado', sent_at TEXT, delivered_at TEXT, read_at TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, ts TEXT, user_id INTEGER, user_email TEXT, action TEXT, entity TEXT, entity_id TEXT,
  before TEXT, after TEXT, ip TEXT, ua TEXT
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log es inalterable'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log es inalterable'); END;
`;

function open() {
  const db = new DatabaseSync(FILE);
  db.exec("PRAGMA busy_timeout = 15000;");
  db.exec(SCHEMA);
  db.exec(SCHEMA2);
  for (const sql of MODULE_SCHEMAS) if (sql.trim()) db.exec(sql);
  return db;
}

export const db: DatabaseSync = (g.__db ??= open());

export const all = <T = any>(sql: string, ...p: any[]): T[] => db.prepare(sql).all(...p) as T[];
export const get = <T = any>(sql: string, ...p: any[]): T | undefined => db.prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);
export const insert = (sql: string, ...p: any[]): number => Number(db.prepare(sql).run(...p).lastInsertRowid);
export const now = () => new Date().toISOString();

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function setting(key: string, def = ""): string {
  return get<{ value: string }>("SELECT value FROM settings WHERE key=?", key)?.value ?? def;
}
export function setSetting(key: string, value: string) {
  run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value);
}
