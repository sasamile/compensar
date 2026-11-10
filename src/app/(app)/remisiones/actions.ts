"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, insert, now, run } from "@/lib/db";
import { can, canSeeCompany, clientIp, requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const back = (kind: "ok" | "error", m: string) => { revalidatePath("/remisiones"); redirect(`/remisiones?${kind}=${encodeURIComponent(m)}`); };

export async function createReferral(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "referrals.create");
  const cid = Number(fd.get("company_id")), sid = Number(fd.get("servicio_id"));
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  const c = get<any>("SELECT * FROM companies WHERE id=?", cid), sv = get<any>("SELECT s.*, a.name aliado FROM servicios s JOIN aliados a ON a.id=s.aliado_id WHERE s.id=?", sid);
  if (c.status !== "activa") back("error", "La empresa no está activa");
  if (!sv?.aliado_id) back("error", "El servicio no tiene aliado");
  const id = insert("INSERT INTO referrals(company_id,servicio_id,aliado_id,referred_by,status,created_at) VALUES(?,?,?,?,'enviada',?)", cid, sid, sv.aliado_id, u.id, now());
  await audit(u, "remitir", "referral", id, null, { company: c.razon_social, servicio: sv.name, aliado: sv.aliado });
  for (const rep of all<any>("SELECT * FROM users WHERE company_id=?", cid))
    notify({ key: "remision", vars: { company: c.razon_social, service: sv.name, aliado: sv.aliado }, email: rep.email, phone: rep.phone, userId: rep.id });
  for (const co of all<any>("SELECT u.* FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.key='coord_aliado' AND u.aliado_id=?", sv.aliado_id))
    notify({ key: "remision", vars: { company: c.razon_social, service: sv.name, aliado: sv.aliado }, email: co.email, phone: co.phone, userId: co.id });
  back("ok", "Remisión enviada: la empresa debe aceptarla y el coordinador del aliado asignará un mentor");
}

export async function respondReferral(fd: FormData) {
  const u = await requireUser();
  const r = get<any>("SELECT * FROM referrals WHERE id=?", Number(fd.get("id")));
  if (!r || u.company_id !== r.company_id || !can(u, "sessions.accept")) redirect("/sin-acceso");
  if (r.status !== "enviada") back("error", "La remisión ya fue respondida");
  const accept = fd.get("decision") === "aceptar";
  const ip = await clientIp();
  run("UPDATE referrals SET status=?, accepted_by=?, accepted_at=?, accepted_ip=? WHERE id=?", accept ? "aceptada" : "rechazada", u.id, now(), ip, r.id);
  await audit(u, accept ? "aceptar_remision" : "rechazar_remision", "referral", r.id, { status: r.status }, { status: accept ? "aceptada" : "rechazada", ip });
  back("ok", accept ? "Remisión aceptada" : "Remisión rechazada");
}

/** El coordinador del aliado reparte entre SUS mentores (RF-SRV-02). El Gestor de Mentorías puede asignar a cualquiera. */
export async function assignReferral(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "referrals.assign");
  const r = get<any>("SELECT * FROM referrals WHERE id=?", Number(fd.get("id")));
  const m = get<any>("SELECT * FROM users WHERE id=?", Number(fd.get("mentor_id")));
  if (!r || !m) back("error", "Datos inválidos");
  if (u.aliado_id && (r.aliado_id !== u.aliado_id || m.aliado_id !== u.aliado_id)) back("error", "Solo puedes asignar remisiones de tu organización a tus mentores");
  const before = { mentor_id: r.mentor_id };
  run("UPDATE referrals SET mentor_id=?, assigned_by=? WHERE id=?", m.id, u.id, r.id);
  await audit(u, "asignar_remision", "referral", r.id, before, { mentor_id: m.id });
  const c = get<any>("SELECT razon_social FROM companies WHERE id=?", r.company_id);
  notify({ key: "asignacion_mentor", vars: { mentor: m.name, company: c.razon_social }, email: m.email, phone: m.phone, userId: m.id });
  back("ok", `Remisión asignada a ${m.name}`);
}
