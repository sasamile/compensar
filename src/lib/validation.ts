/**
 * Lógica compartida de Validación de requisitos (RF-VAL-01..07, FUN-72..78, FUN-96).
 * Funciones síncronas y asíncronas reutilizadas por páginas, server actions, API y procesos por lotes.
 */
import { all, get, insert, now, run, setting, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { can, companyFilter, type User } from "@/lib/auth";
import type { Col } from "@/lib/xlsx";
import { jparse } from "@/lib/util";
import { campoLabel, consultarEmpresa, consultarLocal, FUENTE, type RegistroCliente } from "@/lib/integrations/gestion-clientes";

/* ---------------- catálogos ---------------- */
export const CASE_STATUS: Record<string, string> = {
  pendiente: "Pendiente", en_revision: "En revisión", ajustes: "Ajustes solicitados", aprobado: "Aprobado", rechazado: "Rechazado",
};
export const OPEN = ["pendiente", "en_revision", "ajustes"];
export const KIND_LABEL: Record<string, string> = { empresa: "Registro de empresa", inscripcion: "Inscripción (formulario)" };
export const statusTone = (s: string) => ({ pendiente: "amber", en_revision: "blue", ajustes: "violet", aprobado: "green", rechazado: "red", abierta: "amber", respondida: "green", vencida: "red" } as any)[s] || "slate";

export const OPERATORS: [string, string][] = [
  [">=", "mayor o igual que"], [">", "mayor que"], ["<=", "menor o igual que"], ["<", "menor que"],
  ["=", "igual a"], ["!=", "distinto de"], ["contiene", "contiene"], ["existe", "tiene dato"],
];
export const opLabel = (o: string) => OPERATORS.find((x) => x[0] === o)?.[1] ?? o;

const APP_URL = () => process.env.APP_URL || "";

/* ---------------- reglas ---------------- */
export type Rule = { id: number; program_id: number; key: string; name: string; field: string; operator: string; value: string; active: number };
export type RuleResult = { rule_id: number; name: string; field: string; operator: string; expected: string; actual: any; ok: boolean; msg: string };
export type AutoResult = { at: string; source: string; found: boolean; ok: boolean | null; error?: string; results: RuleResult[]; data?: Partial<RegistroCliente> | null };

const fmtVal = (v: any) => (v === null || v === undefined || v === "" ? "sin dato" : String(v));

export function evalRule(r: Rule, data: Record<string, any> | null): RuleResult {
  const actual = data ? data[r.field] : undefined;
  const a = Number(actual), b = Number(r.value);
  const numeric = actual !== null && actual !== undefined && actual !== "" && !isNaN(a) && r.value !== "" && !isNaN(b);
  let ok = false;
  switch (r.operator) {
    case ">=": ok = numeric && a >= b; break;
    case ">": ok = numeric && a > b; break;
    case "<=": ok = numeric && a <= b; break;
    case "<": ok = numeric && a < b; break;
    case "=": ok = numeric ? a === b : String(actual ?? "").toLowerCase() === String(r.value).toLowerCase(); break;
    case "!=": ok = numeric ? a !== b : String(actual ?? "").toLowerCase() !== String(r.value).toLowerCase(); break;
    case "contiene": ok = String(actual ?? "").toLowerCase().includes(String(r.value).toLowerCase()); break;
    case "existe": ok = actual !== null && actual !== undefined && actual !== ""; break;
  }
  const label = r.name || campoLabel(r.field);
  const msg = ok ? `${label}: cumple (${fmtVal(actual)})`
    : `${label}: no cumple — se requiere ${campoLabel(r.field).toLowerCase()} ${opLabel(r.operator)} ${r.operator === "existe" ? "" : r.value}`.trim() + ` y el valor es ${fmtVal(actual)}`;
  return { rule_id: r.id, name: label, field: r.field, operator: r.operator, expected: r.value, actual: actual ?? null, ok, msg };
}

export const activeRules = (programId: number | null) =>
  all<Rule>("SELECT * FROM validation_rules WHERE program_id=? AND active=1 ORDER BY id", programId ?? 0);

/** Evalúa un registro contra las reglas activas del programa. */
export function evaluate(data: RegistroCliente | null, programId: number | null, source = FUENTE()): AutoResult {
  const rules = activeRules(programId);
  if (!data) return { at: now(), source, found: false, ok: false, results: [], data: null, error: "El NIT no está registrado en Gestión de Clientes" };
  const results = rules.map((r) => evalRule(r, data as any));
  return { at: now(), source, found: true, ok: rules.length ? results.every((x) => x.ok) : null, results, data };
}

/** Consulta Gestión de Clientes (adaptador) y evalúa. Si el servicio falla, ok=null con el error. */
export async function evaluateNit(nit: string, programId: number | null): Promise<AutoResult> {
  try {
    return evaluate(await consultarEmpresa(nit), programId);
  } catch (e: any) {
    return { at: now(), source: FUENTE(), found: false, ok: null, results: [], error: "No fue posible consultar Gestión de Clientes: " + (e?.message || e) };
  }
}

export const autoSummary = (a: AutoResult | null) =>
  !a ? "Sin evaluar" : a.ok === true ? "Cumple" : a.ok === false ? "No cumple" : a.error ? "Sin consulta" : "Sin reglas";
export const autoTone = (a: AutoResult | null) => (!a ? "slate" : a.ok === true ? "green" : a.ok === false ? "red" : "amber");
export const failedReasons = (a: AutoResult | null) =>
  !a ? "" : a.error && !a.found ? a.error : a.results.filter((r) => !r.ok).map((r) => r.msg).join("; ");

/** NIT del solicitante de un caso (empresa o empresa de la respuesta). */
function caseNit(c: any): string | null {
  const cid = c.company_id ?? (c.response_id ? get<any>("SELECT company_id FROM form_responses WHERE id=?", c.response_id)?.company_id : null);
  if (cid) return get<any>("SELECT nit FROM companies WHERE id=?", cid)?.nit ?? null;
  if (c.response_id) {
    const r = get<any>("SELECT answers FROM form_responses WHERE id=?", c.response_id);
    const a = jparse<any>(r?.answers, {});
    const k = Object.keys(a).find((x) => /nit/i.test(x));
    return k ? String(a[k]).split("-")[0].replace(/\D/g, "") : null;
  }
  return null;
}

export async function runAutoValidation(caseId: number, user: { id?: number; email?: string } | null = null) {
  const c = get<any>("SELECT * FROM validation_cases WHERE id=?", caseId);
  if (!c) return null;
  const nit = caseNit(c);
  const res: AutoResult = nit ? await evaluateNit(nit, c.program_id)
    : { at: now(), source: FUENTE(), found: false, ok: false, results: [], error: "La solicitud no tiene NIT asociado" };
  run("UPDATE validation_cases SET auto_result=?, updated_at=? WHERE id=?", JSON.stringify(res), now(), caseId);
  await audit(user, "validacion_automatica", "validation_case", caseId, null, { resultado: autoSummary(res), motivo: failedReasons(res) || null });
  return res;
}

/** Versión síncrona (réplica local) para la semilla. */
export function runAutoValidationLocal(caseId: number) {
  const c = get<any>("SELECT * FROM validation_cases WHERE id=?", caseId);
  const nit = c && caseNit(c);
  const res = evaluate(nit ? consultarLocal(nit) : null, c?.program_id ?? null);
  run("UPDATE validation_cases SET auto_result=?, updated_at=? WHERE id=?", JSON.stringify(res), now(), caseId);
  return res;
}

/* ---------------- casos ---------------- */

/**
 * FUN-72 (a): toda empresa en estado 'pendiente' tiene su caso de validación kind 'empresa'.
 * Se llama desde el proceso por lotes y al cargar la bandeja. Devuelve los casos creados.
 */
export async function ensureCompanyCases(): Promise<number> {
  const missing = all<any>(`SELECT c.id, c.program_id, c.created_at FROM companies c WHERE c.status='pendiente'
    AND NOT EXISTS (SELECT 1 FROM validation_cases v WHERE v.kind='empresa' AND v.company_id=c.id AND (v.program_id=c.program_id OR v.program_id IS NULL))`);
  const ids: number[] = [];
  for (const m of missing) {
    const id = insert("INSERT INTO validation_cases(kind,company_id,program_id,status,created_at,updated_at) VALUES('empresa',?,?,'pendiente',?,?)",
      m.id, m.program_id, m.created_at || now(), now());
    await audit(null, "crear_caso_validacion", "validation_case", id, null, { company_id: m.id, origen: "empresa pendiente" });
    ids.push(id);
  }
  // casos (también los de inscripción que crea el módulo de formularios) sin validación automática
  for (const c of all<any>("SELECT id FROM validation_cases WHERE auto_result IS NULL AND status IN ('pendiente','en_revision','ajustes') LIMIT 200"))
    await runAutoValidation(c.id);
  return ids.length;
}

/**
 * Filtro de alcance sobre validation_cases (alias vc). org = todo; program = su programa;
 * assigned = casos asignados a él o de empresas que acompaña.
 */
export function caseFilter(u: User, perm: "validation.view" | "validation.manage" = "validation.view", alias = "vc"): { sql: string; params: any[] } {
  const parts: string[] = []; const params: any[] = [];
  const has = (g: any, p: string) => g.perms.includes(p) || g.perms.includes("*");
  for (const g of u.grants) {
    const ok = perm === "validation.view" ? has(g, "validation.view") || has(g, "validation.manage") : has(g, perm);
    if (!ok) continue;
    if (g.scope_type === "org") return { sql: "1=1", params: [] };
    if (g.scope_type === "program" && g.scope_id) { parts.push(`${alias}.program_id=?`); params.push(g.scope_id); }
    if (g.scope_type === "assigned") {
      parts.push(`(${alias}.assigned_to=? OR ${alias}.company_id IN (SELECT company_id FROM mentor_assignments WHERE mentor_id=? AND active=1))`);
      params.push(u.id, u.id);
    }
  }
  return parts.length ? { sql: "(" + parts.join(" OR ") + ")", params } : { sql: "1=0", params: [] };
}

export function canCase(u: User, caseId: number, perm: "validation.view" | "validation.manage" = "validation.view") {
  if (!can(u, perm) && !(perm === "validation.view" && can(u, "validation.manage"))) return false;
  const f = caseFilter(u, perm);
  return !!get(`SELECT 1 FROM validation_cases vc WHERE vc.id=? AND ${f.sql}`, caseId, ...f.params);
}

/** Programas en los que el usuario puede gestionar validación (para reglas). null = todos. */
export function managePrograms(u: User): number[] | null {
  const gs = u.grants.filter((g) => g.perms.includes("validation.manage") || g.perms.includes("*"));
  if (gs.some((g) => g.scope_type === "org")) return null;
  return gs.filter((g) => g.scope_type === "program" && g.scope_id).map((g) => g.scope_id!);
}

/** Usuarios internos que pueden validar (para asignación). */
export const validators = () =>
  all<{ id: number; name: string }>(`SELECT DISTINCT u.id, u.name FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE u.internal=1 AND u.status='activo' AND (r.perms LIKE '%"validation.manage"%' OR r.perms LIKE '%"*"%') ORDER BY u.name`);

/** Consulta base de casos con datos del solicitante. */
export const CASE_SELECT = `SELECT vc.*, COALESCE(c.razon_social, rc.razon_social, fr.email, 'Solicitud ' || vc.id) applicant,
  COALESCE(c.nit, rc.nit) nit, COALESCE(c.id, rc.id) cid, p.name program, a.name assignee, d.name decider, f.name form_name,
  (SELECT COUNT(*) FROM info_requests ir WHERE ir.case_id=vc.id AND ir.status='abierta') open_requests
  FROM validation_cases vc
  LEFT JOIN companies c ON c.id=vc.company_id
  LEFT JOIN form_responses fr ON fr.id=vc.response_id
  LEFT JOIN companies rc ON rc.id=fr.company_id
  LEFT JOIN forms f ON f.id=fr.form_id
  LEFT JOIN programs p ON p.id=vc.program_id
  LEFT JOIN users a ON a.id=vc.assigned_to
  LEFT JOIN users d ON d.id=vc.decided_by`;

/** Tiempo de espera legible: «3 d 4 h». */
export function waitTime(fromIso: string | null, toIso?: string | null) {
  if (!fromIso) return { label: "—", days: 0 };
  const ms = Math.max(0, new Date(toIso || now()).getTime() - new Date(fromIso).getTime());
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return { label: d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`, days: ms / 86400000 };
}
export const slaDays = () => Number(setting("val_sla_days", "5")) || 5;

/** Lista de chequeo manual por programa (FUN-74). Configurable en settings `val_checklist_<programa>`. */
export function checklistFor(programId: number | null): string[] {
  const own = jparse<string[]>(setting(`val_checklist_${programId}`, ""), []);
  return own.length ? own : ["Documentos soporte completos y legibles", "Datos del solicitante coinciden con el soporte", "Cumple los requisitos del programa"];
}

/** Destinatarios del caso: representante(s) de la empresa o quien diligenció el formulario. */
export function caseRecipients(c: any): { userId: number | null; email: string | null; phone: string | null; name: string }[] {
  const companyId = c.company_id ?? (c.response_id ? get<any>("SELECT company_id FROM form_responses WHERE id=?", c.response_id)?.company_id : null);
  if (c.kind === "inscripcion" && c.response_id) {
    const r = get<any>("SELECT fr.user_id, fr.email, u.email uemail, u.phone, u.name FROM form_responses fr LEFT JOIN users u ON u.id=fr.user_id WHERE fr.id=?", c.response_id);
    if (r && (r.user_id || r.email)) return [{ userId: r.user_id ?? null, email: r.uemail || r.email, phone: r.phone ?? null, name: r.name || r.email }];
  }
  if (companyId) {
    const us = all<any>("SELECT id, email, phone, name FROM users WHERE company_id=? AND status IN ('activo','invitado') ORDER BY is_principal DESC, id LIMIT 3", companyId);
    const principal = us.filter((x, i) => i === 0);
    return principal.map((x) => ({ userId: x.id, email: x.email, phone: x.phone, name: x.name }));
  }
  return [];
}

function caseVars(c: any, extra: Record<string, any> = {}) {
  const company = c.company_id ? get<any>("SELECT razon_social FROM companies WHERE id=?", c.company_id)?.razon_social : null;
  const form = c.response_id ? get<any>("SELECT f.name FROM form_responses r JOIN forms f ON f.id=r.form_id WHERE r.id=?", c.response_id)?.name : null;
  const program = get<any>("SELECT name FROM programs WHERE id=?", c.program_id)?.name ?? "el programa";
  return { company: company || form || "tu solicitud", program, request: c.kind === "empresa" ? `registro de ${company}` : `inscripción «${form || program}»`, url: APP_URL() + "/validacion/solicitudes", ...extra };
}

function notifyCase(c: any, key: string, extra: Record<string, any> = {}) {
  for (const r of caseRecipients(c)) notify({ key, vars: { ...caseVars(c, extra), name: r.name }, email: r.email, phone: r.phone, userId: r.userId });
}

/* ---------------- decisiones (FUN-75) ---------------- */
export type Decision = "aprobado" | "rechazado" | "ajustes";

/**
 * Aprueba, rechaza o pide ajustes. Aprobar un caso 'empresa' activa la empresa y envía 'activacion';
 * en inscripciones actualiza form_responses. Pedir ajustes abre además una solicitud de información con plazo.
 */
export async function decideCase(u: User, caseId: number, decision: Decision, reason: string, opts: { dueIso?: string | null } = {}) {
  const c = get<any>("SELECT * FROM validation_cases WHERE id=?", caseId);
  if (!c) return { ok: false, error: "La solicitud no existe" };
  if (!["aprobado", "rechazado", "ajustes"].includes(decision)) return { ok: false, error: "Decisión no válida" };
  if (!OPEN.includes(c.status)) return { ok: false, error: `La solicitud ya fue decidida (${CASE_STATUS[c.status]})` };
  if (!reason.trim() && decision !== "aprobado") return { ok: false, error: "Escribe el motivo: el solicitante lo recibirá" };
  const why = reason.trim() || "Cumple los requisitos del programa";
  const ts = now();
  const before = { status: c.status, reason: c.reason };
  let activated = false;
  tx(() => {
    run("UPDATE validation_cases SET status=?, reason=?, decided_by=?, decided_at=?, updated_at=?, assigned_to=COALESCE(assigned_to, ?) WHERE id=?",
      decision, why, u.id, ts, ts, u.id, caseId);
    if (c.kind === "empresa" && c.company_id && decision === "aprobado") {
      const co = get<any>("SELECT status FROM companies WHERE id=?", c.company_id);
      if (co && co.status !== "activa") { run("UPDATE companies SET status='activa' WHERE id=?", c.company_id); activated = true; }
    }
    if (c.response_id) run("UPDATE form_responses SET status=?, decision_reason=?, updated_at=? WHERE id=?", decision, why, ts, c.response_id);
  });
  await audit(u, "decidir_validacion", "validation_case", caseId, before, { status: decision, reason: why });
  if (activated) await audit(u, "activar_empresa_validacion", "company", c.company_id, { status: "pendiente" }, { status: "activa", caso: caseId });
  if (c.response_id) await audit(u, "decidir_inscripcion", "form_response", c.response_id, null, { status: decision, decision_reason: why });

  const fresh = { ...c, status: decision };
  if (decision === "aprobado") {
    if (c.kind === "empresa" && c.company_id) {
      const co = get<any>("SELECT c.razon_social, p.name program FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", c.company_id);
      for (const r of caseRecipients(c)) notify({ key: "activacion", vars: { company: co?.razon_social, program: co?.program }, email: r.email, phone: r.phone, userId: r.userId });
    } else notifyCase(fresh, "validacion_aprobada", { reason: why });
  } else if (decision === "rechazado") {
    notifyCase(fresh, "validacion_rechazada", { reason: why });
  } else {
    const due = opts.dueIso || new Date(Date.now() + Number(setting("val_info_days", "5")) * 86400000).toISOString();
    notifyCase(fresh, "validacion_ajustes", { reason: why, due: fmtDue(due) });
    await createInfoRequest(u, caseId, why, due, { silent: true, keepStatus: true });
  }
  return { ok: true, activated };
}

/* ---------------- solicitudes de información (FUN-76) ---------------- */
export async function createInfoRequest(u: User, caseId: number, message: string, dueIso: string, o: { silent?: boolean; keepStatus?: boolean } = {}) {
  const c = get<any>("SELECT * FROM validation_cases WHERE id=?", caseId);
  if (!c) return { ok: false, error: "La solicitud no existe" };
  if (!message.trim()) return { ok: false, error: "Describe qué documento o información se requiere" };
  if (!dueIso || new Date(dueIso).getTime() <= Date.now()) return { ok: false, error: "El plazo debe ser una fecha futura" };
  const id = insert("INSERT INTO info_requests(case_id,message,due_at,status,created_by,created_at) VALUES(?,?,?,'abierta',?,?)", caseId, message.trim(), dueIso, u.id, now());
  if (!o.keepStatus) run("UPDATE validation_cases SET status='ajustes', updated_at=?, assigned_to=COALESCE(assigned_to, ?) WHERE id=?", now(), u.id, caseId);
  await audit(u, "solicitar_informacion", "info_request", id, null, { case_id: caseId, message: message.trim(), due_at: dueIso });
  if (!o.silent) notifyCase(c, "solicitud_informacion", { message: message.trim(), due: fmtDue(dueIso) });
  return { ok: true, id };
}

const fmtDue = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Proceso de plazos: recordatorio antes del vencimiento (setting val_reminder_hours, 48 h por defecto)
 * y, al vencer, la solicitud pasa a 'vencida' y el caso vuelve a 'en_revision' para que el validador decida.
 */
export async function processDueRequests() {
  const hrs = Number(setting("val_reminder_hours", "48")) || 48;
  const ts = now();
  const soon = new Date(Date.now() + hrs * 3600000).toISOString();
  let reminded = 0, expired = 0;
  for (const r of all<any>("SELECT ir.*, vc.kind, vc.company_id, vc.response_id, vc.program_id, vc.assigned_to FROM info_requests ir JOIN validation_cases vc ON vc.id=ir.case_id WHERE ir.status='abierta' AND ir.due_at<=? AND ir.due_at>? AND ir.reminded_at IS NULL", soon, ts)) {
    run("UPDATE info_requests SET reminded_at=? WHERE id=?", ts, r.id);
    notifyCase(r, "recordatorio_informacion", { message: r.message, due: fmtDue(r.due_at) });
    await audit(null, "recordatorio_solicitud_informacion", "info_request", r.id, null, { due_at: r.due_at });
    reminded++;
  }
  for (const r of all<any>("SELECT ir.*, vc.kind, vc.company_id, vc.response_id, vc.program_id, vc.assigned_to, vc.status case_status, vc.observations FROM info_requests ir JOIN validation_cases vc ON vc.id=ir.case_id WHERE ir.status='abierta' AND ir.due_at<=?", ts)) {
    tx(() => {
      run("UPDATE info_requests SET status='vencida' WHERE id=?", r.id);
      if (OPEN.includes(r.case_status)) {
        const obs = ((r.observations ? r.observations + "\n" : "") + `[${fmtDue(ts)}] Venció sin respuesta la solicitud de información #${r.id}.`).slice(-4000);
        run("UPDATE validation_cases SET status='en_revision', observations=?, updated_at=? WHERE id=?", obs, ts, r.case_id);
      }
    });
    await audit(null, "solicitud_informacion_vencida", "info_request", r.id, { status: "abierta" }, { status: "vencida", case_status: OPEN.includes(r.case_status) ? "en_revision" : r.case_status });
    notifyCase({ ...r, id: r.case_id }, "solicitud_vencida", { message: r.message, due: fmtDue(r.due_at) });
    if (r.assigned_to) {
      const v = get<any>("SELECT id, email, phone, name FROM users WHERE id=?", r.assigned_to);
      if (v) notify({ key: "solicitud_vencida", vars: { ...caseVars({ ...r, id: r.case_id }), name: v.name, message: r.message, due: fmtDue(r.due_at) }, email: v.email, userId: v.id, channels: ["correo"] });
    }
    expired++;
  }
  return { reminded, expired };
}

/** Respuesta del solicitante: el caso vuelve a revisión y se avisa al validador asignado. */
export async function answerInfoRequest(u: User, reqId: number, text: string, docId: number | null) {
  const r = get<any>("SELECT ir.*, vc.assigned_to, vc.status case_status FROM info_requests ir JOIN validation_cases vc ON vc.id=ir.case_id WHERE ir.id=?", reqId);
  if (!r) return { ok: false, error: "La solicitud no existe" };
  if (r.status !== "abierta") return { ok: false, error: r.status === "vencida" ? "El plazo de esta solicitud ya venció; comunícate con Compensar" : "Esta solicitud ya fue respondida" };
  if (new Date(r.due_at).getTime() < Date.now()) return { ok: false, error: "El plazo de esta solicitud ya venció; comunícate con Compensar" };
  if (!text.trim() && !docId) return { ok: false, error: "Escribe una respuesta o adjunta un archivo" };
  const ts = now();
  tx(() => {
    run("UPDATE info_requests SET status='respondida', response=?, doc_id=?, answered_at=? WHERE id=?", text.trim(), docId, ts, reqId);
    if (OPEN.includes(r.case_status)) run("UPDATE validation_cases SET status='en_revision', updated_at=? WHERE id=?", ts, r.case_id);
  });
  await audit(u, "responder_solicitud_informacion", "info_request", reqId, { status: "abierta" }, { status: "respondida", doc_id: docId });
  if (r.assigned_to) {
    const v = get<any>("SELECT id, email, phone, name FROM users WHERE id=?", r.assigned_to);
    if (v) notify({ key: "informacion_recibida", vars: { name: v.name, case: r.case_id, url: APP_URL() + "/validacion/" + r.case_id }, email: v.email, userId: v.id, channels: ["correo"] });
  }
  return { ok: true };
}

/* ---------------- respuesta de formulario (inscripciones) ---------------- */

/** Convierte answers + forms.schema en pares etiqueta/valor (tolera varias formas del esquema). */
export function answersWithLabels(schemaJson: string | null, answersJson: string | null): { label: string; value: string }[] {
  const schema = jparse<any>(schemaJson, {});
  const answers = jparse<Record<string, any>>(answersJson, {});
  const labels: Record<string, string> = {};
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const key = node.id ?? node.key ?? node.name;
    const lab = node.label ?? node.title ?? node.question;
    if (key != null && lab && (node.type || node.kind)) labels[String(key)] = String(lab);
    for (const k of ["sections", "fields", "questions", "items", "children"]) if (node[k]) walk(node[k]);
  };
  walk(schema);
  const show = (v: any) => Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? (v.name ? `${v.name}` : JSON.stringify(v)) : v === true ? "Sí" : v === false ? "No" : String(v ?? "");
  return Object.entries(answers).map(([k, v]) => ({ label: labels[k] || k, value: show(v) }));
}

/** Respuesta de la empresa por canal: info requests pendientes del usuario (para avisos en otras vistas). */
export function myOpenRequests(u: User) {
  return all<any>(`SELECT ir.* FROM info_requests ir JOIN validation_cases vc ON vc.id=ir.case_id LEFT JOIN form_responses fr ON fr.id=vc.response_id
    WHERE ir.status='abierta' AND (vc.company_id=? OR fr.company_id=? OR fr.user_id=?)`, u.company_id ?? -1, u.company_id ?? -1, u.id);
}

/* ---------------- validación masiva (FUN-77) ---------------- */
export type BulkRow = { fila: number; nit: string; programa: string; razon_social: string; resultado: string; motivo: string; empresa: string; accion: string };
export type BulkMode = "validar" | "aprobar" | "aprobar_rechazar";
const plain = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Valida fila por fila con las reglas del programa. Según `mode` aplica decisiones sobre los casos abiertos
 * de las empresas que ya están en la plataforma (aprobar las que cumplen y, opcionalmente, rechazar las que no).
 */
export async function bulkValidate(u: User, input: { nit: string; programa: string; razon?: string }[], mode: BulkMode) {
  const programs = all<any>("SELECT id, name FROM programs");
  const scope = managePrograms(u);
  const seen = new Set<string>();
  const out: BulkRow[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i];
    const fila = i + 2;
    const nit = String(r.nit || "").replace(/\D/g, "");
    const row: BulkRow = { fila, nit, programa: r.programa, razon_social: r.razon || "", resultado: "Error", motivo: "", empresa: "No registrada", accion: "Sin cambios" };
    out.push(row);
    if (!nit) { row.motivo = "Falta el NIT"; continue; }
    const prog = programs.find((p) => plain(p.name) === plain(r.programa) || String(p.id) === String(r.programa).trim());
    if (!prog) { row.motivo = `El programa «${r.programa || "(vacío)"}» no existe`; continue; }
    row.programa = prog.name;
    if (scope !== null && !scope.includes(prog.id)) { row.motivo = "No tienes permiso de validación en este programa"; continue; }
    if (seen.has(nit + "|" + prog.id)) { row.motivo = "Fila duplicada en el archivo (mismo NIT y programa)"; continue; }
    seen.add(nit + "|" + prog.id);
    const res = await evaluateNit(nit, prog.id);
    row.razon_social = row.razon_social || (res.data?.razon_social as string) || "";
    row.resultado = autoSummary(res);
    row.motivo = res.ok === true ? `Cumple las ${res.results.length} regla(s) del programa` : failedReasons(res) || res.error || "Sin reglas activas";
    const co = get<any>("SELECT id, status, razon_social FROM companies WHERE nit=? AND program_id=?", nit, prog.id);
    if (!co) continue;
    row.razon_social = row.razon_social || co.razon_social;
    row.empresa = `Registrada (${co.status})`;
    const c = get<any>(`SELECT * FROM validation_cases WHERE kind='empresa' AND company_id=? AND status IN ('pendiente','en_revision','ajustes') ORDER BY id DESC LIMIT 1`, co.id);
    if (!c) { if (mode !== "validar") row.accion = "Sin solicitud abierta"; continue; }
    run("UPDATE validation_cases SET auto_result=?, updated_at=? WHERE id=?", JSON.stringify(res), now(), c.id);
    if (mode === "validar") { row.accion = `Resultado guardado en la solicitud #${c.id}`; continue; }
    if (!canCase(u, c.id, "validation.manage")) { row.accion = "Sin permiso sobre la solicitud"; continue; }
    if (res.ok === true) {
      const d = await decideCase(u, c.id, "aprobado", "Validación masiva: cumple todos los requisitos del programa");
      row.accion = d.ok ? `Aprobada (solicitud #${c.id})${d.activated ? " y empresa activada" : ""}` : d.error!;
    } else if (res.ok === false && mode === "aprobar_rechazar") {
      const d = await decideCase(u, c.id, "rechazado", "Validación masiva: " + row.motivo);
      row.accion = d.ok ? `Rechazada (solicitud #${c.id})` : d.error!;
    } else row.accion = "Pendiente de revisión manual";
  }
  const summary = {
    total: out.length, cumple: out.filter((r) => r.resultado === "Cumple").length, no_cumple: out.filter((r) => r.resultado === "No cumple").length,
    errores: out.filter((r) => r.resultado === "Error" || r.resultado === "Sin consulta").length,
    aplicadas: out.filter((r) => /^(Aprobada|Rechazada)/.test(r.accion)).length,
  };
  await audit(u, "validacion_masiva", "validation_case", null, null, { modo: mode, ...summary });
  return { rows: out, summary };
}

/* ---------------- reportes (FUN-96 / RF-ANA-04) ---------------- */

export type ReportFilters = { tipo?: string; programa?: string; estado?: string; desde?: string; hasta?: string; resultado?: string };
const fmtD = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "");

/** Reporte de validación (casos con su resultado) o de seguimiento de empresas (validación + ruta). */
export function reportData(u: User, f: ReportFilters): { title: string; cols: Col[]; rows: any[] } {
  const range = (col: string, where: string[], p: any[]) => {
    if (f.desde) where.push(`${col}>=?`), p.push(new Date(f.desde + "T00:00:00-05:00").toISOString());
    if (f.hasta) where.push(`${col}<=?`), p.push(new Date(f.hasta + "T23:59:59-05:00").toISOString());
  };
  if (f.tipo === "seguimiento") {
    const cf = companyFilter(u, "c");
    const where = [cf.sql]; const p: any[] = [...cf.params];
    if (f.programa) where.push("c.program_id=?"), p.push(Number(f.programa));
    if (f.estado) where.push("c.status=?"), p.push(f.estado);
    range("c.created_at", where, p);
    const rows = all<any>(`SELECT c.id, c.razon_social, c.nit, c.status, c.city, c.sector, p.name program,
      (SELECT u.name FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=c.id AND a.active=1 LIMIT 1) mentor,
      v.status v_status, v.auto_result, v.decided_at, v.reason,
      cr.id route_id, cr.name route, cr.status route_status,
      (SELECT COUNT(*) FROM company_route_steps s WHERE s.company_route_id=cr.id) steps,
      (SELECT COUNT(*) FROM company_route_steps s WHERE s.company_route_id=cr.id AND s.status='completado') done,
      (SELECT MAX(at) FROM route_step_log l WHERE l.company_route_id=cr.id) last_activity
      FROM companies c LEFT JOIN programs p ON p.id=c.program_id
      LEFT JOIN validation_cases v ON v.id=(SELECT MAX(id) FROM validation_cases WHERE company_id=c.id)
      LEFT JOIN company_routes cr ON cr.id=(SELECT id FROM company_routes WHERE company_id=c.id ORDER BY CASE status WHEN 'activa' THEN 0 WHEN 'propuesta' THEN 1 ELSE 2 END, id DESC LIMIT 1)
      WHERE ${where.join(" AND ")} ORDER BY c.razon_social`, ...p);
    return {
      title: "Seguimiento de empresas",
      cols: [
        { header: "Empresa", key: "razon_social", width: 30 }, { header: "NIT", key: "nit" }, { header: "Programa", key: "program", width: 20 },
        { header: "Estado empresa", key: "status" }, { header: "Mentor", key: "mentor", width: 22 }, { header: "Validación", key: "validacion" },
        { header: "Resultado automático", key: "auto" }, { header: "Motivo / observación", key: "reason", width: 50 }, { header: "Fecha decisión", key: "decided" },
        { header: "Ruta", key: "route", width: 30 }, { header: "Estado ruta", key: "route_status" }, { header: "Etapas completadas", key: "etapas" },
        { header: "% avance", key: "pct" }, { header: "Última actividad ruta", key: "last" },
      ],
      rows: rows.map((r) => {
        const a = jparse<AutoResult | null>(r.auto_result, null);
        return {
          ...r, validacion: r.v_status ? CASE_STATUS[r.v_status] : "Sin caso", auto: autoSummary(a), reason: r.reason || failedReasons(a), decided: fmtD(r.decided_at),
          route: r.route || "", route_status: r.route_status || "", etapas: r.route_id ? `${r.done}/${r.steps}` : "", pct: r.steps ? Math.round((r.done / r.steps) * 100) : "", last: fmtD(r.last_activity),
        };
      }),
    };
  }
  const cf = caseFilter(u);
  const where = [cf.sql]; const p: any[] = [...cf.params];
  if (f.programa) where.push("vc.program_id=?"), p.push(Number(f.programa));
  if (f.estado === "abiertas") where.push("vc.status IN ('pendiente','en_revision','ajustes')");
  else if (f.estado) where.push("vc.status=?"), p.push(f.estado);
  range("vc.created_at", where, p);
  let rows = all<any>(`${CASE_SELECT} WHERE ${where.join(" AND ")} ORDER BY vc.id DESC`, ...p).map((r) => {
    const a = jparse<AutoResult | null>(r.auto_result, null);
    const ck = jparse<any>(r.checklist, null);
    return {
      id: r.id, tipo: KIND_LABEL[r.kind] || r.kind, solicitante: r.applicant, nit: r.nit || "", programa: r.program || "", estado: CASE_STATUS[r.status] || r.status,
      auto: autoSummary(a), auto_ok: a?.ok, reglas_no: failedReasons(a), checklist: ck ? ck.items.filter((x: any) => x.ok).length + "/" + ck.items.length : "",
      observaciones: r.observations || "", responsable: r.assignee || "", decidio: r.decider || "", motivo: r.reason || "",
      radicada: fmtD(r.created_at), decidida: fmtD(r.decided_at), espera: waitTime(r.created_at, OPEN.includes(r.status) ? null : r.decided_at).label,
      solicitudes: r.open_requests,
    };
  });
  if (f.resultado === "cumple") rows = rows.filter((r) => r.auto_ok === true);
  if (f.resultado === "no_cumple") rows = rows.filter((r) => r.auto_ok === false);
  return {
    title: "Validación de requisitos",
    cols: [
      { header: "Solicitud", key: "id", width: 10 }, { header: "Tipo", key: "tipo", width: 22 }, { header: "Solicitante", key: "solicitante", width: 30 }, { header: "NIT", key: "nit" },
      { header: "Programa", key: "programa", width: 20 }, { header: "Estado", key: "estado" }, { header: "Resultado automático", key: "auto" },
      { header: "Reglas no cumplidas", key: "reglas_no", width: 60 }, { header: "Lista de chequeo", key: "checklist" }, { header: "Observaciones", key: "observaciones", width: 40 },
      { header: "Responsable", key: "responsable", width: 22 }, { header: "Decidió", key: "decidio", width: 22 }, { header: "Motivo", key: "motivo", width: 40 },
      { header: "Radicada", key: "radicada" }, { header: "Decidida", key: "decidida" }, { header: "Tiempo", key: "espera" }, { header: "Solicitudes de info abiertas", key: "solicitudes" },
    ],
    rows,
  };
}
