"use server";
/** Diagnóstico empresarial (RF-DIA-02/03/04/06): asignar, registrar empresa, estados auditados, autodiagnóstico, recálculo. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run, tx } from "@/lib/db";
import { can, canSeeCompany, programScope, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nitDv, validNit } from "@/lib/util";
import { DIAG_STAGES } from "@/lib/forms";
import { canManageDiagnostic, getForm, nextStage } from "../formularios/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, kind: "ok" | "error", m: string): never => { revalidatePath(path.split("?")[0]); redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(m)}`); };
const stageOk = (x: string) => DIAG_STAGES.some(([k]) => k === x);

function notifyAssigned(companyId: number, formName: string, stage: string, diagId: number) {
  const c = get<any>("SELECT razon_social FROM companies WHERE id=?", companyId);
  for (const usr of [get<any>("SELECT * FROM users WHERE company_id=? AND is_principal=1 AND status='activo' LIMIT 1", companyId)].filter(Boolean))
    notify({ key: "diagnostico_asignado", vars: { name: usr.name, company: c?.razon_social, form: formName, stage, url: `/diagnosticos/${diagId}` }, email: usr.email, phone: usr.phone, userId: usr.id });
}

async function createDiagnostic(u: any, companyId: number, formId: number, stage: string, assignedTo: number | null) {
  const f = getForm(formId);
  if (!f || f.kind !== "diagnostico" || f.status !== "publicado") go("/diagnosticos", "error", "Elige un instrumento de diagnóstico publicado");
  const open = get<any>("SELECT id FROM diagnostics WHERE company_id=? AND form_id=? AND stage=? AND status<>'completado'", companyId, formId, stage);
  if (open) go(`/diagnosticos/${open.id}`, "error", "La empresa ya tiene un diagnóstico abierto en esa etapa");
  const id = insert("INSERT INTO diagnostics(company_id,form_id,stage,status,assigned_by,assigned_to,created_at) VALUES(?,?,?,'asignado',?,?,?)",
    companyId, formId, stage, u.id, assignedTo, now());
  await audit(u, "asignar", "diagnostic", id, null, { company_id: companyId, form_id: formId, stage, status: "asignado", assigned_to: assignedTo });
  notifyAssigned(companyId, f!.name, stage, id);
  return id;
}

export async function assignDiagnostic(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "diagnostics.manage")) redirect("/sin-acceso");
  const companyId = Number(fd.get("company_id"));
  if (!companyId || !canSeeCompany(u, companyId)) go("/diagnosticos", "error", "Elige una empresa de tu alcance");
  const stage = stageOk(s(fd, "stage")) ? s(fd, "stage") : nextStage(companyId, Number(fd.get("form_id")));
  const assignedTo = Number(fd.get("assigned_to")) || u.id;
  const id = await createDiagnostic(u, companyId, Number(fd.get("form_id")), stage, assignedTo);
  go(`/diagnosticos/${id}`, "ok", "Diagnóstico asignado. La empresa fue notificada y puede diligenciarlo desde su cuenta, o puedes diligenciarlo con ella.");
}

/** RF-DIA-02: registrar empresa manualmente validando el NIT; un NIT existente no crea duplicado. */
export async function registerCompany(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "diagnostics.manage")) redirect("/sin-acceso");
  const nit = s(fd, "nit").replace(/\D/g, ""), dv = s(fd, "dv");
  const name = s(fd, "razon_social");
  if (name.length < 3) go("/diagnosticos?tab=registrar", "error", "Escribe la razón social");
  if (!validNit(nit, dv)) go("/diagnosticos?tab=registrar", "error", `El NIT ${nit}-${dv} no es válido: el dígito de verificación no corresponde`);
  const sc = programScope(u, "diagnostics.manage");
  let programId = Number(fd.get("program_id")) || null;
  if (sc && sc.length && (!programId || !sc.includes(programId))) programId = sc[0];
  const existing = get<any>("SELECT * FROM companies WHERE nit=? ORDER BY id LIMIT 1", nit);
  let companyId: number;
  if (existing) {
    if (!canSeeCompany(u, existing.id)) go("/diagnosticos?tab=registrar", "error", `La empresa con NIT ${nit} ya está registrada (${existing.razon_social}) y no está en tu alcance. Pide al gestor que te la asigne; no se creó un duplicado.`);
    companyId = existing.id;
    await audit(u, "registro_empresa_existente", "company", existing.id, null, { nit, motivo: "diagnóstico" });
  } else {
    companyId = tx(() => {
      const id = insert(
        "INSERT INTO companies(razon_social,nit,dv,sector,size,city,program_id,status,source,created_at) VALUES(?,?,?,?,?,?,?,'pendiente','diagnostico',?)",
        name, nit, nitDv(nit), s(fd, "sector") || null, s(fd, "size") || null, s(fd, "city") || null, programId, now());
      // un mentor (alcance «asignados») queda asignado para poder ver y acompañar la empresa que registró
      if (u.grants.some((g) => g.scope_type === "assigned" && (g.perms.includes("diagnostics.manage")))) {
        insert("INSERT INTO mentor_assignments(company_id,mentor_id,program_id,active,assigned_by,from_at) VALUES(?,?,?,1,?,?)", id, u.id, programId, u.id, now());
      }
      return id;
    });
    await audit(u, "crear", "company", companyId, null, { razon_social: name, nit, dv, program_id: programId, origen: "diagnóstico manual" });
  }
  const formId = Number(fd.get("form_id"));
  if (formId) {
    const stage = stageOk(s(fd, "stage")) ? s(fd, "stage") : nextStage(companyId, formId);
    const id = await createDiagnostic(u, companyId, formId, stage, u.id);
    go(`/diagnosticos/${id}`, "ok", existing ? `La empresa ya existía (NIT ${nit}); se usó su registro y se asignó el diagnóstico.` : "Empresa registrada y diagnóstico asignado.");
  }
  go("/diagnosticos", "ok", existing ? `La empresa ya existía (NIT ${nit}); no se creó un duplicado.` : "Empresa registrada.");
}

/** RF-DIA-03: transición de estado auditada. */
export async function setDiagnosticStatus(fd: FormData) {
  const u = await requireUser();
  const d = get<any>("SELECT * FROM diagnostics WHERE id=?", Number(fd.get("id")));
  if (!d || !canManageDiagnostic(u, d)) redirect("/sin-acceso");
  const to = s(fd, "status");
  const allowed: Record<string, string[]> = { en_revision: ["completado", "en_curso"], completado: ["en_revision"], asignado: [], en_curso: [] };
  if (!allowed[d.status]?.includes(to)) go(`/diagnosticos/${d.id}`, "error", `No se puede pasar de «${d.status}» a «${to}»`);
  const note = s(fd, "note");
  tx(() => {
    run("UPDATE diagnostics SET status=?, completed_at=? WHERE id=?", to, to === "completado" ? now() : null, d.id);
    if (d.response_id) {
      const rs = to === "completado" ? "aprobado" : to === "en_curso" ? "ajustes" : "en_revision";
      run("UPDATE form_responses SET status=?, decision_reason=?, updated_at=? WHERE id=?", rs, note || null, now(), d.response_id);
    }
  });
  await audit(u, "cambiar_estado", "diagnostic", d.id, { status: d.status }, { status: to, note });
  go(`/diagnosticos/${d.id}`, "ok", to === "completado" ? "Diagnóstico completado" : to === "en_curso" ? "Devuelto a la empresa para ajustes" : "Diagnóstico reabierto para revisión");
}

export async function reassignDiagnostic(fd: FormData) {
  const u = await requireUser();
  const d = get<any>("SELECT * FROM diagnostics WHERE id=?", Number(fd.get("id")));
  if (!d || !canManageDiagnostic(u, d)) redirect("/sin-acceso");
  const stage = stageOk(s(fd, "stage")) ? s(fd, "stage") : d.stage;
  const to = Number(fd.get("assigned_to")) || null;
  run("UPDATE diagnostics SET stage=?, assigned_to=? WHERE id=?", stage, to, d.id);
  await audit(u, "editar", "diagnostic", d.id, { stage: d.stage, assigned_to: d.assigned_to }, { stage, assigned_to: to });
  go(`/diagnosticos/${d.id}`, "ok", "Diagnóstico actualizado");
}
