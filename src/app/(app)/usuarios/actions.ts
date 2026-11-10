"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, run, now } from "@/lib/db";
import { can, hashPassword, requireUser, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { delegation } from "@/lib/delegation";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (m: string, err = false) => { revalidatePath("/usuarios"); redirect(`/usuarios?${err ? "error" : "ok"}=${encodeURIComponent(m)}`); };

export async function inviteUser(fd: FormData) {
  const u = await requireUser();
  const email = s(fd, "email").toLowerCase();
  const role = get<any>("SELECT * FROM roles WHERE id=?", Number(fd.get("role_id")));
  if (!role || !email || !s(fd, "name")) done("Completa los datos", true);
  const d = delegation(u, role.key);
  if (!d) done("No tienes permiso para asignar ese rol", true);
  if (get("SELECT 1 FROM users WHERE email=?", email)) done("Ya existe un usuario con ese correo", true);
  let scope = { scope_type: s(fd, "scope_type") || "org", scope_id: Number(fd.get("scope_id")) || null } as any;
  let aliado_id: number | null = null, company_id: number | null = null;
  if (d !== "admin") { scope = d; aliado_id = d!.aliado_id ?? null; company_id = d!.company_id ?? null; }
  else if (scope.scope_type === "aliado") aliado_id = scope.scope_id;
  const temp = "Tmp-" + crypto.randomBytes(4).toString("hex") + "9A";
  const id = insert(
    `INSERT INTO users(email,name,phone,password_hash,status,internal,must_change_password,temp_expires_at,invited_at,company_id,is_principal,aliado_id,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)`,
    email, s(fd, "name"), s(fd, "phone"), hashPassword(temp), "invitado", role.internal, 1, new Date(Date.now() + 3 * 86400000).toISOString(), now(), company_id, aliado_id, now());
  insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,granted_by,created_at) VALUES(?,?,?,?,?,?)", id, role.id, scope.scope_type, scope.scope_id, u.id, now());
  notify({ key: "invitacion", vars: { name: s(fd, "name"), email, password: temp }, email, phone: s(fd, "phone"), userId: id });
  await audit(u, "invitar", "user", id, null, { email, role: role.name, scope });
  done(`Invitación enviada a ${email}. (MODO DEMO) contraseña temporal: ${temp}`);
}

function manageable(u: User, target: any) {
  if (target.id === u.id) return false; // nadie se gestiona a sí mismo
  if (can(u, "users.manage")) return true;
  const rk = get<any>("SELECT r.key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?", target.id)?.key;
  if (can(u, "users.manage.mentors") && rk === "mentor") return true;
  if (u.aliado_id && target.aliado_id === u.aliado_id && can(u, "users.manage.aliado")) return true;
  if (u.company_id && target.company_id === u.company_id && u.is_principal && can(u, "company.manage_collab")) return true;
  return false;
}

export async function setUserStatus(fd: FormData) {
  const u = await requireUser();
  const t = get<any>("SELECT * FROM users WHERE id=?", Number(fd.get("id")));
  if (!t || !manageable(u, t)) done("No tienes permiso sobre este usuario", true);
  const to = s(fd, "to"); // activo | inactivo | revocada
  run("UPDATE users SET status=? WHERE id=?", to, t.id);
  if (to === "inactivo" || to === "revocada") run("DELETE FROM sessions WHERE user_id=?", t.id); // corta acceso de inmediato
  await audit(u, to === "activo" ? "reactivar" : to === "revocada" ? "revocar_invitacion" : "desactivar", "user", t.id, { status: t.status }, { status: to });
  done("Estado actualizado");
}

export async function resendInvite(fd: FormData) {
  const u = await requireUser();
  const t = get<any>("SELECT * FROM users WHERE id=?", Number(fd.get("id")));
  if (!t || !manageable(u, t)) done("Sin permiso", true);
  const temp = "Tmp-" + crypto.randomBytes(4).toString("hex") + "9A";
  run("UPDATE users SET password_hash=?, must_change_password=1, temp_expires_at=?, status=CASE WHEN status='revocada' THEN 'invitado' ELSE status END WHERE id=?", hashPassword(temp), new Date(Date.now() + 3 * 86400000).toISOString(), t.id);
  notify({ key: "invitacion", vars: { name: t.name, email: t.email, password: temp }, email: t.email, phone: t.phone, userId: t.id });
  await audit(u, "reenviar_invitacion", "user", t.id);
  done(`Invitación reenviada. (MODO DEMO) contraseña temporal: ${temp}`);
}

export async function addRole(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "users.manage")) done("Solo el Administrador asigna roles adicionales", true);
  const uid = Number(fd.get("user_id"));
  if (uid === u.id) done("Nadie se asigna roles a sí mismo", true); // RN-03
  const role = get<any>("SELECT * FROM roles WHERE id=?", Number(fd.get("role_id")));
  const scope = { scope_type: s(fd, "scope_type"), scope_id: Number(fd.get("scope_id")) || null };
  insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,granted_by,created_at) VALUES(?,?,?,?,?,?)", uid, role.id, scope.scope_type, scope.scope_id, u.id, now());
  await audit(u, "asignar_rol", "user", uid, null, { role: role.name, ...scope });
  done("Rol asignado");
}
export async function removeRole(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "users.manage")) done("Sin permiso", true);
  const ur = get<any>("SELECT ur.*, r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.id=?", Number(fd.get("id")));
  if (ur.user_id === u.id) done("No puedes revocarte tus propios roles", true);
  run("DELETE FROM user_roles WHERE id=?", ur.id);
  await audit(u, "revocar_rol", "user", ur.user_id, { role: ur.name, scope: ur.scope_type }, null);
  done("Rol revocado");
}
