"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, insert, now, run } from "@/lib/db";
import { canSeeCompany, requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/webhooks";

const back = (kind: "ok" | "error", m: string) => { revalidatePath("/cierres"); redirect(`/cierres?${kind}=${encodeURIComponent(m)}`); };

export async function proposeClosure(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "closure.manage");
  const cid = Number(fd.get("company_id")), rid = Number(fd.get("referral_id")) || null;
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  const c = get<any>("SELECT * FROM companies WHERE id=?", cid);
  const ses = all<any>("SELECT * FROM mentoring_sessions WHERE company_id=? AND (referral_id IS ? OR referral_id=?) AND status='realizada'", cid, rid, rid);
  const inds = all<any>("SELECT * FROM indicators WHERE company_id=?", cid);
  const result = `${ses.length} sesión(es) realizadas, ${ses.filter((s) => s.accepted_at).length} aceptadas, ${ses.reduce((a, s) => a + (s.hours || 0), 0)} h. ` +
    inds.map((i) => `${i.name}: ${i.baseline ?? "?"} → ${i.final ?? "?"}`).join("; ");
  const id = insert("INSERT INTO closures(company_id,referral_id,program_id,result,status,created_by,created_at) VALUES(?,?,?,?,'pendiente',?,?)", cid, rid, c.program_id, result, u.id, now());
  await audit(u, "consolidar_resultados", "closure", id, null, { result });
  back("ok", "Resultados consolidados; pendientes de aprobación del cierre");
}

export async function approveClosure(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "closure.approve");
  const cl = get<any>("SELECT * FROM closures WHERE id=?", Number(fd.get("id")));
  if (!cl || cl.status === "aprobado") back("error", "Cierre no disponible");
  // RN-05: quien registró las horas del servicio no aprueba el cierre
  const reg = get<any>("SELECT 1 x FROM mentoring_sessions WHERE company_id=? AND registered_by=? AND (? IS NULL OR referral_id=?)", cl.company_id, u.id, cl.referral_id, cl.referral_id);
  if (reg) back("error", "Separación de funciones: quien registró las horas de este servicio no puede aprobar su cierre");
  run("UPDATE closures SET status='aprobado', approved_by=?, approved_at=? WHERE id=?", u.id, now(), cl.id);
  if (cl.referral_id) run("UPDATE referrals SET status='cerrada', closed_at=? WHERE id=?", now(), cl.referral_id);
  run("UPDATE company_items SET status='cerrado' WHERE company_id=? AND status IN ('asignado','en curso')", cl.company_id);
  await audit(u, "aprobar_cierre", "closure", cl.id, { status: cl.status }, { status: "aprobado" });
  emit("cierre.aprobado", { cierre_id: cl.id, empresa_id: cl.company_id, remision_id: cl.referral_id, programa_id: cl.program_id });
  back("ok", "Cierre aprobado: ya no se pueden programar nuevas sesiones de ese servicio");
}
