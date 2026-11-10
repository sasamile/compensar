"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { canSeeCompany, requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { storeDocument } from "@/lib/onbase";
import { fmtDate, localToIso } from "@/lib/util";
import { assignees, visibleTask } from "./scope";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (kind: "ok" | "error", m: string): never => { revalidatePath("/tareas"); redirect(`/tareas?${kind}=${encodeURIComponent(m)}`); };
const STATUSES = ["pendiente", "en_curso", "hecha"];

export async function createTask(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "tasks.manage");
  const title = s(fd, "title");
  if (title.length < 3) go("error", "El título de la tarea es obligatorio");
  const due = localToIso(s(fd, "due_at"));
  if (!due) go("error", "Indica la fecha de vencimiento");
  const assignee = Number(fd.get("assignee_id")) || u.id;
  if (!assignees(u).some((a) => a.id === assignee)) go("error", "Responsable no válido");
  const companyId = Number(fd.get("company_id")) || null;
  if (companyId && !canSeeCompany(u, companyId)) redirect("/sin-acceso");
  const programId = companyId ? get<any>("SELECT program_id FROM companies WHERE id=?", companyId)?.program_id : Number(fd.get("program_id")) || null;
  const id = insert("INSERT INTO tasks(title,description,company_id,program_id,assignee_id,due_at,status,created_by,created_at) VALUES(?,?,?,?,?,?,'pendiente',?,?)",
    title, s(fd, "description"), companyId, programId, assignee, due, u.id, now());
  await audit(u, "crear_tarea", "task", id, null, { title, company_id: companyId, assignee_id: assignee, due_at: due });
  if (assignee !== u.id) {
    const a = get<any>("SELECT * FROM users WHERE id=?", assignee);
    notify({ key: "tarea_asignada", vars: { title, by: u.name, due: fmtDate(due), url: `${process.env.APP_URL ?? ""}/tareas` }, email: a.email, phone: a.phone, userId: a.id, channels: ["correo"] });
  }
  go("ok", "Tarea registrada");
}

export async function setTaskStatus(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "tasks.manage");
  const t = visibleTask(u, Number(fd.get("id")));
  if (!t) redirect("/sin-acceso");
  const status = s(fd, "status");
  if (!STATUSES.includes(status)) go("error", "Estado no válido");
  const ts = now();
  run("UPDATE tasks SET status=?, done_at=? WHERE id=?", status, status === "hecha" ? ts : null, t.id);
  if (status === "hecha") // la alerta de tarea vencida se cierra de inmediato (el proceso de alertas también la cerraría)
    run("UPDATE alerts SET status='cerrada', resolved_at=?, resolved_by=COALESCE(resolved_by, ?) WHERE rule_key='tarea_vencida' AND entity='task' AND entity_id=? AND status IN ('abierta','atendida')", ts, u.id, t.id);
  await audit(u, "cambiar_estado_tarea", "task", t.id, { status: t.status }, { status });
  go("ok", status === "hecha" ? "Tarea terminada" : "Estado actualizado");
}

export async function uploadTaskEvidence(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "tasks.manage");
  const t = visibleTask(u, Number(fd.get("id")));
  if (!t) redirect("/sin-acceso");
  const file = fd.get("file") as File | null;
  if (!file || typeof file !== "object" || !file.size) go("error", "Selecciona el archivo de evidencia");
  const r = await storeDocument(u, file!, { company_id: t.company_id, kind: "evidencia_tarea" });
  if (!r.ok) go("error", r.error || "No se pudo guardar la evidencia");
  run("UPDATE tasks SET evidence_doc_id=? WHERE id=?", r.id, t.id);
  await audit(u, "evidencia_tarea", "task", t.id, { evidence_doc_id: t.evidence_doc_id }, { evidence_doc_id: r.id });
  go("ok", "Evidencia cargada en OnBase");
}
