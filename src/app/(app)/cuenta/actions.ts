"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { all, get, insert, now, run } from "@/lib/db";
import { currentSessionToken, hashPassword, mfaRequired, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clean, cleanPhone } from "@/lib/sanitize";
import { disableMfa, enableMfa, generateSecret, newRecoveryCodes, openSecret, stashOnce, verifyUserTotp } from "@/lib/totp";
import { jparse } from "@/lib/util";

const go = (tab: string, kind: "ok" | "error", m: string, extra = "") => { revalidatePath("/cuenta"); redirect(`/cuenta?tab=${tab}&${kind}=${encodeURIComponent(m)}${extra}`); };
const strongPw = (p: string) => p.length >= 10 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
const handle = (token: string) => crypto.createHash("sha256").update(token).digest("hex").slice(0, 20);

export async function saveMyProfile(fd: FormData) {
  const u = await requireUser();
  const name = clean(fd.get("name"), 120);
  if (name.length < 3) go("datos", "error", "Escribe tu nombre completo");
  const after = { name, phone: cleanPhone(fd.get("phone")) || null, title: clean(fd.get("title"), 120) || null };
  const before = get<any>("SELECT name, phone, title FROM users WHERE id=?", u.id);
  run("UPDATE users SET name=?, phone=?, title=? WHERE id=?", after.name, after.phone, after.title, u.id);
  await audit(u, "editar_mis_datos", "user", u.id, before, after);
  go("datos", "ok", "Datos actualizados");
}

export async function changeMyPassword(fd: FormData) {
  const u = await requireUser();
  const row = get<any>("SELECT password_hash FROM users WHERE id=?", u.id);
  const cur = String(fd.get("current") || ""), a = String(fd.get("password") || ""), b = String(fd.get("password2") || "");
  if (row?.password_hash && !verifyPassword(cur, row.password_hash)) go("clave", "error", "La contraseña actual no es correcta");
  if (a !== b) go("clave", "error", "Las contraseñas nuevas no coinciden");
  if (!strongPw(a)) go("clave", "error", "La contraseña debe tener 10+ caracteres con mayúscula, minúscula y número");
  if (row?.password_hash && verifyPassword(a, row.password_hash)) go("clave", "error", "La nueva contraseña debe ser distinta de la actual");
  run("UPDATE users SET password_hash=?, must_change_password=0, temp_expires_at=NULL WHERE id=?", hashPassword(a), u.id);
  const t = await currentSessionToken();
  const closed = run("DELETE FROM sessions WHERE user_id=? AND token<>?", u.id, t || "").changes;
  await audit(u, "cambiar_clave", "user", u.id, null, { otras_sesiones_cerradas: closed });
  go("clave", "ok", `Contraseña actualizada${closed ? `. Se cerraron ${closed} sesión(es) en otros dispositivos.` : "."}`);
}

/* ---------------- segundo factor ---------------- */
export async function startEnroll() {
  const u = await requireUser();
  run("DELETE FROM auth_flows WHERE kind='enroll' AND user_id=?", u.id);
  insert("INSERT INTO auth_flows(id,kind,user_id,data,created_at,expires_at) VALUES(?,?,?,?,?,?)", crypto.randomBytes(16).toString("hex"), "enroll", u.id,
    JSON.stringify({ secret: generateSecret() }), now(), new Date(Date.now() + 15 * 60000).toISOString());
  go("seguridad", "ok", "Escanea el código QR con tu aplicación autenticadora y confirma con un código");
}

export async function confirmEnroll(fd: FormData) {
  const u = await requireUser();
  const f = get<any>("SELECT * FROM auth_flows WHERE kind='enroll' AND user_id=? ORDER BY created_at DESC LIMIT 1", u.id);
  if (!f || new Date(f.expires_at) < new Date()) go("seguridad", "error", "El enrolamiento venció. Empieza de nuevo.");
  const secret = jparse<any>(f.data, {}).secret;
  if (!verifyUserTotp(u.id, secret, String(fd.get("code") || ""))) go("seguridad", "error", "El código no coincide. Revisa la hora del celular e inténtalo de nuevo.");
  run("DELETE FROM auth_flows WHERE id=?", f.id);
  const had = get<any>("SELECT mfa_enabled FROM users WHERE id=?", u.id)?.mfa_enabled;
  const codes = enableMfa(u.id, secret);
  await audit(u, had ? "reconfigurar_2fa" : "activar_2fa", "user", u.id, { mfa_enabled: had ? 1 : 0 }, { mfa_enabled: 1, metodo: "totp" });
  go("seguridad", "ok", "Verificación en dos pasos activada", `&codigos=${stashOnce(u.id, "show_codes", { codes })}`);
}

export async function cancelEnroll() {
  const u = await requireUser();
  run("DELETE FROM auth_flows WHERE kind='enroll' AND user_id=?", u.id);
  go("seguridad", "ok", "Configuración cancelada");
}

async function requireCode(u: any, fd: FormData) {
  const row = get<any>("SELECT mfa_secret, mfa_enabled FROM users WHERE id=?", u.id);
  if (!row?.mfa_enabled) go("seguridad", "error", "No tienes la verificación en dos pasos activa");
  if (!verifyUserTotp(u.id, openSecret(row.mfa_secret), String(fd.get("code") || ""))) go("seguridad", "error", "Código incorrecto");
}

export async function disableMyMfa(fd: FormData) {
  const u = await requireUser();
  if (mfaRequired(u)) go("seguridad", "error", "Tu rol exige verificación en dos pasos: puedes reconfigurarla, pero no desactivarla");
  await requireCode(u, fd);
  disableMfa(u.id);
  await audit(u, "desactivar_2fa", "user", u.id, { mfa_enabled: 1 }, { mfa_enabled: 0 });
  go("seguridad", "ok", "Verificación en dos pasos desactivada");
}

export async function regenRecovery(fd: FormData) {
  const u = await requireUser();
  await requireCode(u, fd);
  const codes = newRecoveryCodes(u.id);
  await audit(u, "regenerar_codigos_recuperacion", "user", u.id);
  go("seguridad", "ok", "Nuevos códigos de recuperación generados; los anteriores dejaron de servir", `&codigos=${stashOnce(u.id, "show_codes", { codes })}`);
}

/* ---------------- preferencias de notificación (RF-NOT-05) ---------------- */
export async function savePrefs(fd: FormData) {
  const u = await requireUser();
  const before = jparse<any>(get<any>("SELECT notif_prefs FROM users WHERE id=?", u.id)?.notif_prefs, {});
  const prefs = { correo: fd.get("correo") ? 1 : 0, sms: fd.get("sms") ? 1 : 0, whatsapp: fd.get("whatsapp") ? 1 : 0, no_esenciales: fd.get("no_esenciales") ? 1 : 0 };
  run("UPDATE users SET notif_prefs=? WHERE id=?", JSON.stringify(prefs), u.id);
  await audit(u, "preferencias_notificacion", "user", u.id, before, prefs);
  go("notificaciones", "ok", "Preferencias guardadas");
}

/* ---------------- sesiones activas ---------------- */
export async function revokeSession(fd: FormData) {
  const u = await requireUser();
  const h = String(fd.get("s") || "");
  const cur = await currentSessionToken();
  const s = all<any>("SELECT token, ip FROM sessions WHERE user_id=?", u.id).find((x) => handle(x.token) === h);
  if (!s) go("sesiones", "error", "La sesión ya no existe");
  if (s.token === cur) go("sesiones", "error", "Para cerrar esta sesión usa «Salir»");
  run("DELETE FROM sessions WHERE token=?", s.token);
  run("DELETE FROM session_meta WHERE token=?", s.token);
  await audit(u, "cerrar_sesion_remota", "user", u.id, null, { ip: s.ip });
  go("sesiones", "ok", "Sesión cerrada");
}

export async function revokeOtherSessions() {
  const u = await requireUser();
  const cur = await currentSessionToken();
  const n = run("DELETE FROM sessions WHERE user_id=? AND token<>?", u.id, cur || "").changes;
  run("DELETE FROM session_meta WHERE user_id=? AND token NOT IN (SELECT token FROM sessions)", u.id);
  await audit(u, "cerrar_otras_sesiones", "user", u.id, null, { cerradas: n });
  go("sesiones", "ok", `${n} sesión(es) cerrada(s)`);
}
