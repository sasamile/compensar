"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, insert, now, run, tx } from "@/lib/db";
import { canInProgram, can, canSeeCompany, hashPassword, requirePerm, requireUser, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nitDv, validNit } from "@/lib/util";
import { emit } from "@/lib/webhooks";
import { BACKGROUND_THRESHOLD, contactProblem, createImportJob, finishImportJob, importCompanyRows, linkContact, parseCompanyFile } from "@/lib/jobs/plataforma";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const flash = (path: string, kind: "ok" | "error", m: string) => { revalidatePath(path); redirect(`${path}?${kind}=${encodeURIComponent(m)}`); };
const temp = () => "Tmp-" + crypto.randomBytes(4).toString("hex") + "9A";

export type ImportResult = {
  ok: boolean; errors: { row: number; msg: string }[]; created?: number; linked?: number;
  creds?: { email: string; pw: string }[]; linkedEmails?: string[]; background?: boolean; jobId?: number; total?: number; format?: string;
};

/** Origen elegido en el formulario (Anexo 05 #118): clave del catálogo; «Otro» admite un detalle. */
function sourceOf(fd: FormData) {
  const k = s(fd, "source");
  if (k === "otro") { const d = s(fd, "source_detail").replace(/[^\p{L}\p{N} .,_-]/gu, "").slice(0, 60); return d ? `otro:${d}` : "otro"; }
  return k;
}

/**
 * Cargue masivo (RF-EMP-01, RF-INT-06): Excel, CSV o JSON con la misma validación fila por fila y todo o nada.
 * Más de BACKGROUND_THRESHOLD filas se procesan en segundo plano con aviso al terminar (RNF-REN-07).
 */
export async function importCompanies(_prev: ImportResult | null, fd: FormData): Promise<ImportResult> {
  const u = await requireUser();
  requirePerm(u, "companies.activate");
  const f = fd.get("file") as File;
  if (!f || typeof f === "string" || !f.size) return { ok: false, errors: [{ row: 0, msg: "Selecciona un archivo Excel (.xlsx), CSV (.csv) o JSON (.json)" }] };
  const opts = { activate: fd.get("activate") === "on", source: sourceOf(fd) };
  if (!opts.source) return { ok: false, errors: [{ row: 0, msg: "Selecciona el origen del cargue" }] };
  const { rows, format, error } = await parseCompanyFile(f.name, Buffer.from(await f.arrayBuffer()));
  if (error) return { ok: false, errors: [{ row: 0, msg: error }], format };
  if (!rows.length) return { ok: false, errors: [{ row: 0, msg: "El archivo no tiene filas de datos" }], format };
  if (rows.length > BACKGROUND_THRESHOLD) {
    const jobId = createImportJob(u, f.name, format, rows, opts, true);
    await audit(u, "cargue_masivo_encolado", "import_job", jobId, null, { archivo: f.name, formato: format, filas: rows.length, origen: opts.source });
    revalidatePath("/empresas/cargue");
    return { ok: true, errors: [], background: true, jobId, total: rows.length, format };
  }
  const jobId = createImportJob(u, f.name, format, rows, opts, false);
  const out = await importCompanyRows(rows, u, opts);
  finishImportJob(jobId, out);
  revalidatePath("/empresas/cargue");
  revalidatePath("/empresas");
  return { ...out, jobId, total: rows.length, format };
}

export async function createCompany(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "companies.activate");
  const nit = s(fd, "nit").replace(/\D/g, ""), dv = s(fd, "dv"), prog = Number(fd.get("program_id"));
  const email = s(fd, "email").toLowerCase();
  if (!s(fd, "razon_social") || !s(fd, "rep") || !email) flash("/empresas", "error", "Completa razón social, representante y correo");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) flash("/empresas", "error", "El correo del representante no es válido");
  if (!validNit(nit, dv)) flash("/empresas", "error", `NIT inválido: el DV correcto para ${nit} es ${nitDv(nit)}`);
  if (get("SELECT 1 FROM companies WHERE nit=? AND program_id=?", nit, prog)) flash("/empresas", "error", "Este NIT ya está en este programa");
  const other = get<any>("SELECT p.name FROM companies c JOIN programs p ON p.id=c.program_id WHERE c.nit=?", nit);
  if (other) flash("/empresas", "error", `Este NIT ya existe en la organización (programa ${other.name})`);
  if (!canInProgram(u, "companies.activate", prog)) redirect("/sin-acceso");
  // RF-EMP-03: si el correo ya es usuario de una empresa, se vincula como contacto de la nueva; si es interno, se rechaza
  const existing = get<any>("SELECT id, name, email, phone, internal, company_id, status FROM users WHERE email=?", email);
  if (existing) { const p = contactProblem(existing); if (p) flash("/empresas", "error", p); }
  const programName = get<any>("SELECT name FROM programs WHERE id=?", prog)?.name ?? "";
  const pw = existing ? null : temp();
  const hash = pw ? hashPassword(pw) : null;
  const { cid, uid } = tx(() => {
    const cid = insert("INSERT INTO companies(razon_social,nit,dv,sector,size,city,program_id,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      s(fd, "razon_social"), nit, dv, s(fd, "sector"), s(fd, "size"), s(fd, "city"), prog, "pendiente", "manual", now());
    if (existing) { linkContact(cid, existing.id, "representante", u.id); return { cid, uid: existing.id }; }
    const uid = insert(`INSERT INTO users(email,name,phone,password_hash,status,internal,must_change_password,temp_expires_at,invited_at,company_id,is_principal,created_at)
      VALUES(?,?,?,?,?,0,1,?,?,?,1,?)`, email, s(fd, "rep"), s(fd, "phone"), hash, "invitado", new Date(Date.now() + 3 * 86400000).toISOString(), now(), cid, now());
    insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,granted_by,created_at) VALUES(?,?,?,?,?,?)", uid, get<any>("SELECT id FROM roles WHERE key='empresa'").id, "company", cid, u.id, now());
    run("INSERT OR IGNORE INTO company_contacts(company_id,user_id,role,created_by,created_at) VALUES(?,?,?,?,?)", cid, uid, "representante", u.id, now());
    return { cid, uid };
  });
  if (existing) {
    notify({ key: "vinculacion_empresa", vars: { name: existing.name, company: s(fd, "razon_social"), program: programName }, email: existing.email, phone: existing.phone, userId: existing.id });
    await audit(u, "crear", "company", cid, null, { nit, razon_social: s(fd, "razon_social"), contacto_vinculado: existing.id });
    await audit(u, "vincular_contacto", "company_contact", cid, null, { company_id: cid, user_id: existing.id, role: "representante" });
    flash("/empresas", "ok", `Empresa creada (pendiente de activación). ${existing.email} ya tenía cuenta: quedó vinculado/a como representante y puede cambiar de empresa desde el selector.`);
  }
  notify({ key: "invitacion", vars: { name: s(fd, "rep"), email, password: pw }, email, phone: s(fd, "phone"), userId: uid });
  await audit(u, "crear", "company", cid, null, { nit, razon_social: s(fd, "razon_social") });
  flash("/empresas", "ok", `Empresa creada (pendiente de activación). (MODO DEMO) clave temporal del representante: ${pw}`);
}

/** Contactos de una empresa: los de empresa principal más los vinculados (RF-EMP-03). */
const companyContacts = (companyId: number) =>
  all<any>("SELECT * FROM users WHERE company_id=? OR id IN (SELECT user_id FROM company_contacts WHERE company_id=?)", companyId, companyId);

// Botones con acción propia: React no envía su name/value, por eso cada estado tiene su acción.
export async function activateCompanies(fd: FormData) { fd.set("to", "activa"); return setCompanyStatus(fd); }
export async function suspendCompanies(fd: FormData) { fd.set("to", "suspendida"); return setCompanyStatus(fd); }

export async function setCompanyStatus(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "companies.activate");
  const ids = fd.getAll("id").map(Number).filter(Boolean);
  const to = s(fd, "to");
  if (!["activa", "suspendida", "pendiente"].includes(to)) flash(s(fd, "back") || "/empresas", "error", "Acción no válida");
  if (!ids.length) flash(s(fd, "back") || "/empresas", "error", "Selecciona al menos una empresa");
  let n = 0;
  for (const id of ids) {
    const c = get<any>("SELECT c.*, p.name program FROM companies c JOIN programs p ON p.id=c.program_id WHERE c.id=?", id);
    if (!c || !canInProgram(u, "companies.activate", c.program_id) || c.status === to) continue;
    run("UPDATE companies SET status=? WHERE id=?", to, id);
    await audit(u, to === "activa" ? "activar" : to === "suspendida" ? "suspender" : "cambiar_estado", "company", id, { status: c.status }, { status: to });
    if (to === "activa") emit("empresa.activada", { empresa_id: id, nit: c.nit, razon_social: c.razon_social, programa_id: c.program_id, programa: c.program });
    for (const rep of companyContacts(id))
      notify({ key: to === "activa" ? "activacion" : "suspension", vars: { company: c.razon_social, program: c.program }, email: rep.email, phone: rep.phone, userId: rep.id });
    n++;
  }
  flash(s(fd, "back") || "/empresas", "ok", `${n} empresa(s) → ${to}`);
}

export async function assignMentor(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "mentors.assign");
  const mentor = get<any>("SELECT * FROM users WHERE id=?", Number(fd.get("mentor_id")));
  const ids = fd.getAll("id").map(Number).filter(Boolean);
  if (!mentor || !ids.length) flash(s(fd, "back") || "/empresas", "error", "Selecciona empresas y un mentor");
  let n = 0;
  for (const id of ids) {
    const c = get<any>("SELECT * FROM companies WHERE id=?", id);
    if (!canSeeCompany(u, id) || c.status !== "activa") continue;
    const prev = get<any>("SELECT * FROM mentor_assignments WHERE company_id=? AND active=1", id);
    if (prev?.mentor_id === mentor.id) continue;
    if (prev) run("UPDATE mentor_assignments SET active=0, to_at=? WHERE id=?", now(), prev.id); // conserva el historial
    const aid = insert("INSERT INTO mentor_assignments(company_id,mentor_id,program_id,assigned_by,from_at) VALUES(?,?,?,?,?)", id, mentor.id, c.program_id, u.id, now());
    await audit(u, prev ? "reasignar_mentor" : "asignar_mentor", "company", id, prev ? { mentor_id: prev.mentor_id } : null, { mentor_id: mentor.id });
    notify({ key: "asignacion_mentor", vars: { mentor: mentor.name, company: c.razon_social }, email: mentor.email, phone: mentor.phone, userId: mentor.id });
    for (const rep of companyContacts(id))
      notify({ key: "asignacion_mentor", vars: { mentor: mentor.name, company: c.razon_social }, email: rep.email, phone: rep.phone, userId: rep.id });
    n++;
  }
  flash(s(fd, "back") || "/empresas", "ok", `Mentor asignado a ${n} empresa(s)`);
}

export async function assignItem(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "items.assign");
  const cid = Number(fd.get("company_id"));
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  const [kind, ref] = s(fd, "item").split(":");
  const label = kind === "servicio" ? get<any>("SELECT name FROM servicios WHERE id=?", +ref)?.name
    : kind === "ruta" ? get<any>("SELECT name FROM rutas WHERE id=?", +ref)?.name : get<any>("SELECT title name FROM events WHERE id=?", +ref)?.name;
  const id = insert("INSERT INTO company_items(company_id,kind,ref_id,label,status,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)", cid, kind, +ref, label, "asignado", u.id, now());
  await audit(u, "asignar_" + kind, "company", cid, null, { label });
  flash(`/empresas/${cid}`, "ok", `${kind} asignado: ${label}`);
}

export async function saveProfile(fd: FormData) {
  const u = await requireUser();
  const cid = Number(fd.get("id"));
  const mentorOf = !!get("SELECT 1 FROM mentor_assignments WHERE company_id=? AND mentor_id=? AND active=1", cid, u.id);
  const repOf = u.company_id === cid && !!u.is_principal;
  if (!repOf && !mentorOf && !can(u, "config.manage")) redirect("/sin-acceso");
  const before = get<any>("SELECT * FROM companies WHERE id=?", cid);
  const vis = fd.getAll("visible").map(String);
  run("UPDATE companies SET sector=?,size=?,city=?,value_prop=?,social=?,visible_fields=? WHERE id=?",
    s(fd, "sector"), s(fd, "size"), s(fd, "city"), s(fd, "value_prop"), s(fd, "social"), repOf ? JSON.stringify(vis) : before.visible_fields, cid);
  const after = get<any>("SELECT * FROM companies WHERE id=?", cid);
  await audit(u, "editar_perfil", "company", cid, before, after); // quién, cuándo, valor anterior y nuevo
  flash(`/empresas/${cid}`, "ok", "Perfil actualizado");
}

export async function saveIndicator(fd: FormData) {
  const u = await requireUser();
  const cid = Number(fd.get("company_id"));
  if (!can(u, "sessions.followup") && !can(u, "closure.manage")) redirect("/sin-acceso");
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  const id = Number(fd.get("id") || 0);
  const c = get<any>("SELECT program_id FROM companies WHERE id=?", cid);
  const nv = (k: string) => (s(fd, k) === "" ? null : Number(s(fd, k)));
  if (id) { const b = get("SELECT * FROM indicators WHERE id=?", id); run("UPDATE indicators SET final=?, goal=?, updated_by=?, updated_at=? WHERE id=?", nv("final"), nv("goal"), u.id, now(), id); await audit(u, "actualizar_indicador", "indicator", id, b, { final: nv("final") }); }
  else { const nid = insert("INSERT INTO indicators(company_id,program_id,name,baseline,final,goal,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?)", cid, c.program_id, s(fd, "name"), nv("baseline"), nv("final"), nv("goal"), u.id, now()); await audit(u, "crear_indicador", "indicator", nid, null, Object.fromEntries(fd)); }
  flash(`/empresas/${cid}`, "ok", "Indicador guardado");
}

export async function evaluateCompany(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "companies.evaluate");
  const cid = Number(fd.get("company_id"));
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  await audit(u, "evaluar", "company", cid, null, { resultado: s(fd, "resultado"), observaciones: s(fd, "obs") });
  flash(`/empresas/${cid}`, "ok", "Evaluación registrada");
}
