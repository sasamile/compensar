"use server";
import { redirect } from "next/navigation";
import { get, now, run } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { companyVisible } from "@/lib/analytics";

/** Conclusiones y recomendaciones del equipo para el informe final (FUN-93). Solo personal interno con alcance sobre la empresa. */
export async function saveNotes(fd: FormData) {
  const u = await requireUser();
  const cid = Number(fd.get("company_id"));
  const allowed = !u.company_id && (can(u, "closure.manage") || can(u, "sessions.followup") || can(u, "config.manage")) && companyVisible(u, cid);
  if (!allowed) redirect("/sin-acceso");
  const conclusions = String(fd.get("conclusions") || "").trim().slice(0, 4000);
  const recommendations = String(fd.get("recommendations") || "").trim().slice(0, 4000);
  const before = get<any>("SELECT conclusions, recommendations FROM ana_report_notes WHERE company_id=?", cid) || null;
  run(`INSERT INTO ana_report_notes(company_id,conclusions,recommendations,updated_by,updated_at) VALUES(?,?,?,?,?)
       ON CONFLICT(company_id) DO UPDATE SET conclusions=excluded.conclusions, recommendations=excluded.recommendations, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    cid, conclusions, recommendations, u.id, now());
  await audit(u, "editar_informe_final", "company", cid, before, { conclusions, recommendations });
  redirect(`/informe-final/${cid}?ok=${encodeURIComponent("Conclusiones y recomendaciones guardadas")}`);
}
