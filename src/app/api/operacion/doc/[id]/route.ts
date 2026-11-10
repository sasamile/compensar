import fs from "node:fs";
import { get } from "@/lib/db";
import { can, canSeeCompany, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readDocument } from "@/lib/onbase";
import { visibleTask } from "@/app/(app)/tareas/scope";

/** Descarga de archivos de la biblioteca y de evidencias de tareas (pueden no tener empresa asociada). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const id = Number((await params).id);
  const d = get<any>("SELECT * FROM documents WHERE id=?", id);
  if (!d) return new Response("No existe", { status: 404 });
  const content = get<any>("SELECT * FROM contents WHERE doc_id=? ORDER BY active DESC LIMIT 1", id);
  const task = get<any>("SELECT id FROM tasks WHERE evidence_doc_id=?", id);
  let ok = false;
  if (content) {
    const companyProgram = u.company_id ? get<any>("SELECT program_id FROM companies WHERE id=?", u.company_id)?.program_id : null;
    ok = can(u, "library.manage") || (can(u, "library.view") && !!content.active && (!u.company_id || content.program_id == null || content.program_id === companyProgram));
  }
  if (!ok && task && can(u, "tasks.manage")) ok = !!visibleTask(u, task.id);
  if (!ok && d.company_id) ok = canSeeCompany(u, d.company_id);
  if (!ok) return new Response("Sin acceso", { status: 403 });
  const buf = readDocument(d);
  if (!buf) return new Response("Documento en cola de envío a OnBase", { status: 202 });
  await audit(u, "descargar_documento", "document", id, null, { origen: content ? "biblioteca" : task ? "tarea" : "empresa" });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": d.mime || "application/octet-stream", "Content-Disposition": `attachment; filename="${encodeURIComponent(d.name)}"` } });
}
