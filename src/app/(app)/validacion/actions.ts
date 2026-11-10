"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeDocument } from "@/lib/onbase";
import {
  answerInfoRequest, canCase, checklistFor, createInfoRequest, decideCase, ensureCompanyCases, managePrograms, OPERATORS,
  processDueRequests, runAutoValidation, validators, type Decision,
} from "@/lib/validation";
import { CAMPOS } from "@/lib/integrations/gestion-clientes";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (fd: FormData, def: string) => { const b = s(fd, "back"); return b.startsWith("/validacion") ? b : def; };
function flash(path: string, kind: "ok" | "error", m: string): never {
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(m)}`);
}
/** Fecha (yyyy-mm-dd, hora Colombia) → fin del día en ISO. */
const dueFromDate = (v: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T23:59:00-05:00").toISOString() : null);

async function managedCase(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "validation.manage");
  const id = Number(s(fd, "id"));
  if (!id || !canCase(u, id, "validation.manage")) redirect("/sin-acceso");
  return { u, id };
}

/** FUN-72: asignar (o reasignar) solicitudes a un validador. */
export async function assignCases(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "validation.manage");
  const to = Number(s(fd, "assignee"));
  const path = back(fd, "/validacion");
  const ids = fd.getAll("ids").map(Number).filter(Boolean);
  if (!ids.length) flash(path, "error", "Selecciona al menos una solicitud");
  if (!to || !validators().some((v) => v.id === to)) flash(path, "error", "Elige un validador");
  let n = 0;
  for (const id of ids) {
    if (!canCase(u, id, "validation.manage")) continue;
    const c = get<any>("SELECT assigned_to, status FROM validation_cases WHERE id=?", id);
    run("UPDATE validation_cases SET assigned_to=?, status=CASE WHEN status='pendiente' THEN 'en_revision' ELSE status END, updated_at=? WHERE id=?", to, now(), id);
    await audit(u, "asignar_validacion", "validation_case", id, { assigned_to: c.assigned_to }, { assigned_to: to });
    n++;
  }
  const name = get<any>("SELECT name FROM users WHERE id=?", to)?.name;
  flash(path, "ok", `${n} solicitud(es) asignada(s) a ${name}`);
}

/** FUN-73: re-ejecuta la validación automática contra Gestión de Clientes. */
export async function runAuto(fd: FormData) {
  const { u, id } = await managedCase(fd);
  const r = await runAutoValidation(id, u);
  flash(`/validacion/${id}`, r?.ok === false ? "error" : "ok", r?.ok === true ? "Validación automática: cumple todos los requisitos" : r?.ok === false ? "Validación automática: no cumple (ver detalle por regla)" : "Validación automática sin resultado: " + (r?.error || "sin reglas activas"));
}

/** FUN-74: validación manual complementaria (lista de chequeo + observaciones). Queda quién y por qué. */
export async function saveManual(fd: FormData) {
  const { u, id } = await managedCase(fd);
  const c = get<any>("SELECT * FROM validation_cases WHERE id=?", id);
  const items = checklistFor(c.program_id).map((label, i) => ({ label, ok: fd.get(`chk_${i}`) === "on", note: s(fd, `note_${i}`) || undefined }));
  const obs = s(fd, "observations");
  if (!obs) flash(`/validacion/${id}`, "error", "Escribe las observaciones de la validación manual (por qué)");
  const checklist = { items, by: u.id, by_name: u.name, at: now() };
  run("UPDATE validation_cases SET checklist=?, observations=?, status=CASE WHEN status='pendiente' THEN 'en_revision' ELSE status END, assigned_to=COALESCE(assigned_to, ?), updated_at=? WHERE id=?",
    JSON.stringify(checklist), obs, u.id, now(), id);
  await audit(u, "validacion_manual", "validation_case", id, { checklist: c.checklist ? JSON.parse(c.checklist) : null, observations: c.observations },
    { checklist: items.map((x) => `${x.ok ? "✓" : "✗"} ${x.label}${x.note ? ` (${x.note})` : ""}`), observations: obs });
  flash(`/validacion/${id}`, "ok", "Validación manual guardada");
}

/** FUN-75: aprobar, rechazar o pedir ajustes con motivo y notificación. */
export async function decide(fd: FormData) {
  const { u, id } = await managedCase(fd);
  const decision = s(fd, "decision") as Decision;
  const r = await decideCase(u, id, decision, s(fd, "reason"), { dueIso: dueFromDate(s(fd, "due")) });
  if (!r.ok) flash(`/validacion/${id}`, "error", r.error!);
  const msg = decision === "aprobado" ? (r.activated ? "Solicitud aprobada: la empresa quedó activa y fue notificada" : "Solicitud aprobada y notificada")
    : decision === "rechazado" ? "Solicitud rechazada; el solicitante recibió el motivo" : "Se pidieron ajustes; el solicitante recibió el motivo y el plazo";
  flash(`/validacion/${id}`, "ok", msg);
}

/** FUN-76: solicitar documentos o información adicional con plazo. */
export async function requestInfo(fd: FormData) {
  const { u, id } = await managedCase(fd);
  const due = dueFromDate(s(fd, "due"));
  if (!due) flash(`/validacion/${id}`, "error", "Indica la fecha límite");
  const r = await createInfoRequest(u, id, s(fd, "message"), due!);
  if (!r.ok) flash(`/validacion/${id}`, "error", r.error!);
  flash(`/validacion/${id}`, "ok", "Solicitud de información enviada al solicitante");
}

/** Respuesta del solicitante (empresa) a una solicitud de información: texto + archivo. */
export async function answerRequest(fd: FormData) {
  const u = await requireUser();
  const reqId = Number(s(fd, "request_id"));
  const r = get<any>(`SELECT ir.*, vc.company_id, fr.company_id rcompany, fr.user_id ruser FROM info_requests ir JOIN validation_cases vc ON vc.id=ir.case_id
    LEFT JOIN form_responses fr ON fr.id=vc.response_id WHERE ir.id=?`, reqId);
  const mine = r && ((u.company_id && (r.company_id === u.company_id || r.rcompany === u.company_id)) || r.ruser === u.id);
  if (!mine) redirect("/sin-acceso");
  let docId: number | null = null;
  const f = fd.get("file") as File | null;
  if (f && typeof f === "object" && f.size) {
    const d = await storeDocument(u, f, { company_id: r.company_id ?? r.rcompany ?? null, kind: "validacion" });
    if (!d.ok) flash("/validacion/solicitudes", "error", d.error!);
    docId = d.id!;
  }
  const res = await answerInfoRequest(u, reqId, s(fd, "response"), docId);
  if (!res.ok) flash("/validacion/solicitudes", "error", res.error!);
  flash("/validacion/solicitudes", "ok", "Respuesta enviada. Compensar revisará la información");
}

/** FUN-73: crear o editar una regla de validación del programa. */
export async function saveRule(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "validation.manage");
  const id = Number(s(fd, "id")) || null;
  const programId = Number(s(fd, "program_id"));
  const scope = managePrograms(u);
  const prev = id ? get<any>("SELECT * FROM validation_rules WHERE id=?", id) : null;
  const allowed = (p: number) => scope === null || scope.includes(p);
  if (!programId || !allowed(programId) || (prev && !allowed(prev.program_id))) redirect("/sin-acceso");
  const field = s(fd, "field"), operator = s(fd, "operator"), value = s(fd, "value"), name = s(fd, "name");
  const path = `/validacion/reglas?programa=${programId}`;
  if (!CAMPOS.some((c) => c.key === field)) flash(path, "error", "Campo no válido");
  if (!OPERATORS.some((o) => o[0] === operator)) flash(path, "error", "Operador no válido");
  if (operator !== "existe" && value === "") flash(path, "error", "Indica el valor de comparación");
  if ([">=", ">", "<=", "<"].includes(operator) && isNaN(Number(value))) flash(path, "error", "El valor debe ser numérico para ese operador");
  if (!name) flash(path, "error", "Ponle un nombre a la regla (es el motivo que verá el validador)");
  const active = fd.get("active") === "on" ? 1 : 0;
  if (prev) {
    run("UPDATE validation_rules SET program_id=?, name=?, field=?, operator=?, value=?, active=? WHERE id=?", programId, name, field, operator, value, active, id);
    await audit(u, "editar_regla_validacion", "validation_rule", id, prev, { program_id: programId, name, field, operator, value, active });
    flash(path, "ok", "Regla actualizada");
  }
  const key = field + "_" + Date.now().toString(36);
  const nid = insert("INSERT INTO validation_rules(program_id,key,name,field,operator,value,active) VALUES(?,?,?,?,?,?,?)", programId, key, name, field, operator, value, active);
  await audit(u, "crear_regla_validacion", "validation_rule", nid, null, { program_id: programId, name, field, operator, value, active });
  flash(path, "ok", "Regla creada");
}

/** Activar / desactivar una regla. */
export async function toggleRule(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "validation.manage");
  const r = get<any>("SELECT * FROM validation_rules WHERE id=?", Number(s(fd, "id")));
  const scope = managePrograms(u);
  if (!r || (scope !== null && !scope.includes(r.program_id))) redirect("/sin-acceso");
  run("UPDATE validation_rules SET active=? WHERE id=?", r.active ? 0 : 1, r.id);
  await audit(u, r.active ? "desactivar_regla_validacion" : "activar_regla_validacion", "validation_rule", r.id, { active: r.active }, { active: r.active ? 0 : 1 });
  flash(`/validacion/reglas?programa=${r.program_id}`, "ok", r.active ? "Regla desactivada" : "Regla activada");
}

/** Ejecuta ya los procesos de la bandeja (casos de empresas pendientes, recordatorios y vencimientos). */
export async function processNow(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "validation.manage");
  const n = await ensureCompanyCases();
  const r = await processDueRequests();
  await audit(u, "procesar_validacion", "validation_case", null, null, { casos_creados: n, ...r });
  flash(back(fd, "/validacion"), "ok", `Procesado: ${n} caso(s) nuevo(s), ${r.reminded} recordatorio(s), ${r.expired} solicitud(es) vencida(s)`);
}

