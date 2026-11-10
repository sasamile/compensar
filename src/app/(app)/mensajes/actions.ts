"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { linked } from "./threads";

export async function sendMessage(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "messages.use");
  const companyId = Number(fd.get("company_id")), mentorId = Number(fd.get("mentor_id"));
  const back = `/mensajes?c=${companyId}&m=${mentorId}`;
  const isCompany = u.company_id === companyId;
  const isMentor = !u.company_id && u.id === mentorId;
  if (!(isCompany || isMentor) || !linked(companyId, mentorId)) redirect("/sin-acceso");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) redirect(`${back}&error=${encodeURIComponent("Escribe el mensaje")}`);
  if (body.length > 4000) redirect(`${back}&error=${encodeURIComponent("El mensaje supera 4.000 caracteres")}`);
  const id = insert("INSERT INTO messages(company_id,mentor_id,from_user_id,body,sent_at) VALUES(?,?,?,?,?)", companyId, mentorId, u.id, body, now());
  // aviso al destinatario por correo, SMS y WhatsApp (según canales activos y sus plantillas aprobadas)
  const to = isMentor
    ? get<any>("SELECT * FROM users WHERE company_id=? AND status IN ('activo','invitado') ORDER BY is_principal DESC, id LIMIT 1", companyId)
    : get<any>("SELECT * FROM users WHERE id=?", mentorId);
  const c = get<any>("SELECT razon_social FROM companies WHERE id=?", companyId);
  if (to) {
    const ids = notify({ key: "mensaje_nuevo", email: to.email, phone: to.phone, userId: to.id,
      vars: { from: isMentor ? u.name : `${u.name} (${c?.razon_social})`, preview: body.length > 120 ? body.slice(0, 117) + "…" : body, url: `${process.env.APP_URL ?? ""}/mensajes?c=${companyId}&m=${mentorId}` } });
    for (const nid of ids) run("INSERT OR IGNORE INTO message_notifications(message_id,notification_id) VALUES(?,?)", id, nid);
  }
  await audit(u, "enviar_mensaje", "message", id, null, { company_id: companyId, mentor_id: mentorId, para: to?.email ?? null, largo: body.length });
  revalidatePath("/mensajes");
  redirect(`${back}&ok=${encodeURIComponent("Mensaje enviado")}#ultimo`);
}
