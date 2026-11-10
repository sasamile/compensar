/**
 * Ayudas de servidor del módulo Formularios y Diagnóstico (consultas, permisos, recálculo, estados).
 * Funciones síncronas (salvo las que auditan): se importan desde páginas, acciones, rutas API y jobs.
 */
import { all, get, now, run } from "@/lib/db";
import { can, canSeeCompany, programScope, type User } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { computeResult, parseSchema, parseScoring, statusLabel, type Result, type Schema, type Scoring } from "@/lib/forms";

export type FormRow = {
  id: number; name: string; description: string | null; kind: string; program_id: number | null; event_id: number | null; slug: string | null;
  status: string; version: number; schema: string; scoring: string; requires_login: number; created_by: number; created_at: string; updated_at: string;
};

export const getForm = (id: number) => get<FormRow>("SELECT * FROM forms WHERE id=?", id);
export const getFormBySlug = (slug: string) => get<FormRow>("SELECT * FROM forms WHERE slug=?", slug);

/** Esquema y reglas de una versión publicada (por defecto la última). */
export function versionOf(formId: number, version?: number): { schema: Schema; scoring: Scoring; version: number; published_at?: string } | null {
  const v = version
    ? get<any>("SELECT * FROM form_versions WHERE form_id=? AND version=?", formId, version)
    : get<any>("SELECT * FROM form_versions WHERE form_id=? ORDER BY version DESC LIMIT 1", formId);
  if (!v) return null;
  return { schema: parseSchema(v.schema), scoring: parseScoring(v.scoring), version: v.version, published_at: v.published_at };
}

/* ---------- alcance por programa ---------- */
/** Filtro SQL de formularios visibles con un permiso. Los formularios sin programa son de alcance organización. */
export function formFilter(u: User, perm: string, alias = "f"): { sql: string; params: any[] } {
  if (!can(u, perm)) return { sql: "1=0", params: [] };
  const sc = programScope(u, perm);
  if (sc === null) return { sql: "1=1", params: [] };
  if (!sc.length) return { sql: "1=0", params: [] };
  return { sql: `${alias}.program_id IN (${sc.map(() => "?").join(",")})`, params: sc };
}
const inScope = (u: User, perm: string, programId: number | null) => {
  if (!can(u, perm)) return false;
  const sc = programScope(u, perm);
  return sc === null || (programId != null && sc.includes(programId));
};
export const canManageForm = (u: User, f: { program_id: number | null }) => inScope(u, "forms.manage", f.program_id);
export const canSeeResponses = (u: User, f: { program_id: number | null }) => inScope(u, "forms.responses", f.program_id) || canManageForm(u, f);
/** Recalcular afecta a todas las empresas del instrumento: requiere gestión del formulario o diagnostics.manage con alcance de programa/organización. */
export const canRecalc = (u: User, f: { program_id: number | null }) => canManageForm(u, f) || inScope(u, "diagnostics.manage", f.program_id);
/** Programas en los que puede crear formularios (null = todos + "sin programa"). */
export const manageablePrograms = (u: User) => {
  const sc = programScope(u, "forms.manage");
  return all<any>("SELECT id,name FROM programs WHERE status='activo' ORDER BY name").filter((p) => sc === null || sc.includes(p.id));
};

/** ¿Puede el usuario ver esta respuesta? (dueño, su empresa, equipo con alcance) */
export function canSeeResponse(u: User, r: any, f: FormRow) {
  if (r.user_id === u.id) return true;
  if (u.company_id && r.company_id === u.company_id) return true;
  if (canSeeResponses(u, f)) return true;
  if (f.kind === "diagnostico" && r.company_id && (can(u, "diagnostics.view") || can(u, "diagnostics.manage")) && canSeeCompany(u, r.company_id)) return true;
  return false;
}

/** Diagnóstico: ¿puede diligenciarlo? La empresa (autodiagnóstico) o el equipo con diagnostics.manage sobre la empresa (asistido). */
export function canFillDiagnostic(u: User, d: any) {
  if (u.company_id && u.company_id === d.company_id && can(u, "diagnostics.self")) return true;
  return can(u, "diagnostics.manage") && canSeeCompany(u, d.company_id);
}
export const canManageDiagnostic = (u: User, d: any) => can(u, "diagnostics.manage") && canSeeCompany(u, d.company_id);
export const canSeeDiagnostic = (u: User, d: any) =>
  (u.company_id === d.company_id && (can(u, "diagnostics.self") || can(u, "diagnostics.view"))) ||
  ((can(u, "diagnostics.view") || can(u, "diagnostics.manage")) && canSeeCompany(u, d.company_id));

/* ---------- puntaje y recálculo ---------- */
/** Guarda el resultado en la respuesta y en el diagnóstico asociado. */
export function storeResult(responseId: number, res: Result) {
  run("UPDATE form_responses SET score=?, level=?, result=? WHERE id=?", res.total, res.level, JSON.stringify({ ...res, computed_at: now() }), responseId);
  run("UPDATE diagnostics SET score=?, level=?, segment=? WHERE response_id=?", res.total, res.level, res.segment || null, responseId);
}

/**
 * RF-DIA-06: recalcula la clasificación de todas las respuestas enviadas de un diagnóstico con las reglas vigentes
 * (forms.scoring) y el esquema de la versión con la que se respondió cada una. Devuelve cuántas cambiaron de nivel/segmento.
 */
export function recalcForm(formId: number): { total: number; changed: number } {
  const f = getForm(formId);
  if (!f) return { total: 0, changed: 0 };
  const rules = parseScoring(f.scoring);
  const cache = new Map<number, Schema>();
  let changed = 0;
  const rows = all<any>("SELECT * FROM form_responses WHERE form_id=? AND status<>'borrador'", formId);
  for (const r of rows) {
    if (!cache.has(r.form_version)) cache.set(r.form_version, versionOf(formId, r.form_version)?.schema ?? parseSchema(f.schema));
    const res = computeResult(cache.get(r.form_version)!, rules, JSON.parse(r.answers || "{}"));
    const prev = get<any>("SELECT level, segment FROM diagnostics WHERE response_id=?", r.id);
    if (r.level !== res.level || r.score !== res.total || (prev && (prev.segment || "") !== (res.segment || ""))) changed++;
    storeResult(r.id, res);
  }
  return { total: rows.length, changed };
}

/* ---------- estados y notificaciones (FUN-70 / FUN-71) ---------- */
const CASE_TO_RESPONSE: Record<string, string> = { pendiente: "enviado", en_revision: "en_revision", ajustes: "ajustes", aprobado: "aprobado", rechazado: "rechazado" };

/** Notifica al participante un cambio de estado de su respuesta (una sola vez por estado). */
export function notifyResponseStatus(r: any, status: string, reason?: string | null) {
  const f = getForm(r.form_id);
  const u = r.user_id ? get<any>("SELECT * FROM users WHERE id=?", r.user_id) : null;
  const kind = `estado:${status}:${(reason || "").slice(0, 40)}`;
  const res = run("INSERT OR IGNORE INTO form_notices(response_id,kind,sent_at) VALUES(?,?,?)", r.id, kind, now());
  if (!res.changes) return;
  notify({
    key: status === "ajustes" ? "formulario_ajustes" : "formulario_estado",
    vars: { name: u?.name || r.email || "", form: f?.name || "", status: statusLabel(status), reason: reason || "—", folio: folio(r), url: "/mis-formularios/" + r.id },
    email: u?.email || r.email, phone: u?.phone, userId: u?.id ?? null,
  });
}

/**
 * Sincroniza el estado de las inscripciones con la bandeja de validación (validation_cases, del módulo Validación):
 * copia estado y motivo a form_responses y notifica al participante. Se ejecuta como job y al abrir «Mis formularios».
 */
export function syncValidationStatuses(onlyUserId?: number): number {
  const rows = all<any>(
    `SELECT r.*, v.status case_status, v.reason case_reason, v.observations case_obs FROM form_responses r
     JOIN validation_cases v ON v.response_id=r.id
     WHERE r.status<>'borrador' ${onlyUserId ? "AND (r.user_id=? OR r.company_id=(SELECT company_id FROM users WHERE id=?))" : ""}`,
    ...(onlyUserId ? [onlyUserId, onlyUserId] : []));
  let n = 0;
  for (const r of rows) {
    const target = CASE_TO_RESPONSE[r.case_status];
    if (!target) continue;
    // si el participante ya reenvió tras «ajustes», el caso volverá a «pendiente»; no pisar la edición en curso
    if (r.status === "ajustes" && target === "ajustes") continue;
    const reason = r.case_reason || (target === "ajustes" ? r.case_obs : null) || r.decision_reason || null;
    if (r.status === target && (r.decision_reason || null) === reason) continue;
    if (r.status === "enviado" && target === "enviado") continue;
    run("UPDATE form_responses SET status=?, decision_reason=?, updated_at=? WHERE id=?", target, reason, now(), r.id);
    if (target !== "enviado") notifyResponseStatus(r, target, reason);
    n++;
  }
  return n;
}

export const folio = (r: { id: number; form_id: number }) => `FRM-${r.form_id}-${String(r.id).padStart(5, "0")}`;

/** Siguiente etapa sugerida para un nuevo diagnóstico de la empresa. */
export function nextStage(companyId: number, formId: number) {
  const st = all<any>("SELECT stage FROM diagnostics WHERE company_id=? AND form_id=?", companyId, formId).map((x) => x.stage);
  return !st.includes("inicial") ? "inicial" : !st.includes("final") ? "final" : "seguimiento";
}

/* ---------- respuestas: filtros compartidos por el listado y la exportación ---------- */
export function responseRows(formId: number, sp: Record<string, any>) {
  const where = ["r.form_id=?"]; const p: any[] = [formId];
  if (sp.estado) { where.push("r.status=?"); p.push(sp.estado); } else where.push("r.status<>'borrador'");
  if (sp.version) { where.push("r.form_version=?"); p.push(Number(sp.version)); }
  if (sp.empresa) { where.push("(c.razon_social LIKE ? OR c.nit LIKE ? OR r.email LIKE ? OR u.name LIKE ?)"); p.push(...Array(4).fill(`%${sp.empresa}%`)); }
  if (sp.desde) { where.push("COALESCE(r.submitted_at, r.updated_at)>=?"); p.push(new Date(sp.desde + "T00:00:00-05:00").toISOString()); }
  if (sp.hasta) { where.push("COALESCE(r.submitted_at, r.updated_at)<=?"); p.push(new Date(sp.hasta + "T23:59:59-05:00").toISOString()); }
  if (sp.nivel) { where.push("r.level=?"); p.push(sp.nivel); }
  if (sp.q) { where.push("r.answers LIKE ?"); p.push(`%${sp.q}%`); }
  return all<any>(`SELECT r.*, c.razon_social company, c.nit company_nit, c.dv company_dv, u.name user_name, d.segment, d.stage, d.id diagnostic_id,
      v.status case_status, v.id case_id
    FROM form_responses r LEFT JOIN companies c ON c.id=r.company_id LEFT JOIN users u ON u.id=r.user_id
    LEFT JOIN diagnostics d ON d.response_id=r.id LEFT JOIN validation_cases v ON v.response_id=r.id
    WHERE ${where.join(" AND ")} ORDER BY COALESCE(r.submitted_at, r.updated_at) DESC LIMIT 5000`, ...p);
}
