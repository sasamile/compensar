"use server";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { beginMfa, clearMfa, clientIp, currentSessionToken, currentUser, endSession, hashPassword, isContactOf, mfaRequired, pendingMfa, startSession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { validNit } from "@/lib/util";
import { botGuard, clearCodeFailures, codeLockStatus, limitAction, registerCodeFailure, resetLimit, securityEvent, refundLimit } from "@/lib/ratelimit";
import { clean, cleanEmail, cleanPhone } from "@/lib/sanitize";
import { consumeRecoveryCode, enableMfa, openSecret, stashOnce, verifyUserTotp } from "@/lib/totp";


/** Ruta interna a la que volver tras ingresar (?next=); nunca una URL externa. */
const safeNext = (fd: FormData) => { const n = String(fd.get("next") || ""); return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/"; };
const E = (m: string, p = "/login") => redirect(`${p}${p.includes("?") ? "&" : "?"}error=${encodeURIComponent(m)}`);
const strongPw = (p: string) => p.length >= 10 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);
const emailOf = (fd: FormData) => cleanEmail(fd.get("email")) || clean(fd.get("email"), 254).toLowerCase();

export async function loginPassword(fd: FormData) {
  const email = emailOf(fd);
  const password = String(fd.get("password") || "").slice(0, 200);
  const ip = await clientIp();
  const bot = await botGuard(fd, "login", ip, email);
  if (bot) E(bot);
  const acct = limitAction("login_cuenta", `acct:${email}`, ip, email);
  if (acct) E(acct);
  const u = get<any>("SELECT * FROM users WHERE email=?", email);
  if (u?.locked_until && new Date(u.locked_until) > new Date()) E("Cuenta bloqueada temporalmente por intentos fallidos. Intenta en 15 minutos.");
  if (!u || !["activo", "invitado"].includes(u.status) || !verifyPassword(password, u.password_hash)) {
    securityEvent("login_fallido", ip, email);
    if (u) {
      const n = (u.failed_attempts || 0) + 1;
      run("UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?", n, n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null, u.id);
      await audit({ id: u.id, email }, n >= 5 ? "bloqueo_cuenta" : "login_fallido", "user", u.id, null, n >= 5 ? { intentos: n } : null);
    }
    E("Credenciales inválidas");
  }
  if (u.temp_expires_at && new Date(u.temp_expires_at) < new Date()) E("La contraseña temporal venció. Pide al administrador que reenvíe la invitación.");
  run("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?", u.id);
  resetLimit(`login_cuenta:acct:${email}`);
  refundLimit(`login:ip:${ip}`);
  const next = u.must_change_password ? "/cambiar-clave" : safeNext(fd);
  // RN-08 / RF-ACC-05: segundo factor obligatorio para roles internos y de aliado (o si el usuario lo activó)
  if (u.mfa_enabled || mfaRequired(u)) {
    await beginMfa(u.id, "clave", next);
    await audit(u, "login_clave_ok_pendiente_2fa", "user", u.id);
    redirect("/login/mfa");
  }
  await startSession(u.id, "clave");
  await audit(u, "login", "user", u.id);
  redirect(next);
}

export async function requestOtp(fd: FormData) {
  const email = emailOf(fd);
  const purpose = String(fd.get("purpose") || "login") === "reset" ? "reset" : "login";
  const base = purpose === "reset" ? "/recuperar" : "/login";
  const ip = await clientIp();
  const bot = await botGuard(fd, "otp", ip, email);
  if (bot) E(bot, purpose === "reset" ? "/recuperar" : "/login?mode=codigo");
  // RF-ACC-03: con la cuenta bloqueada por códigos errados no se emiten códigos nuevos hasta que venza el bloqueo
  const lock = codeLockStatus(email);
  if (lock.locked) E(`Por seguridad la cuenta está bloqueada temporalmente por códigos incorrectos. Intenta de nuevo en ${lock.minutesLeft} minuto${lock.minutesLeft === 1 ? "" : "s"}.`, purpose === "reset" ? "/recuperar" : "/login?mode=codigo");
  const u = get<any>("SELECT * FROM users WHERE email=? AND status='activo'", email);
  let demo = "";
  // límite por cuenta: si se excede no se envía, pero la respuesta es la misma (no revela si el correo existe)
  if (u && (purpose === "reset" || u.company_id) && !limitAction("otp_cuenta", `acct:${email}`, ip, email)) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    run("UPDATE otp_codes SET used=1 WHERE email=? AND purpose=? AND used=0", email, purpose); // solo vale el último código
    insert("INSERT INTO otp_codes(email,code,purpose,expires_at) VALUES(?,?,?,?)", email, code, purpose, new Date(Date.now() + 10 * 60000).toISOString());
    notify({ key: "otp", vars: { code }, email: u.email, phone: u.phone, userId: u.id, channels: ["correo"], security: true });
    if (process.env.DEMO_MODE !== "0") demo = code; // MODO DEMO: en producción el código solo llega por correo
  }
  // La respuesta no revela si el correo existe (RF-ACC-03)
  redirect(`${base}?step=code&email=${encodeURIComponent(email)}${demo ? `&demo=${demo}` : ""}${safeNext(fd) !== "/" ? `&next=${encodeURIComponent(safeNext(fd))}` : ""}`);
}

export async function verifyOtp(fd: FormData) {
  const email = emailOf(fd);
  const code = String(fd.get("code") || "").trim().slice(0, 12);
  const purpose = String(fd.get("purpose") || "login") === "reset" ? "reset" : "login";
  const base = purpose === "reset" ? "/recuperar" : "/login";
  const ip = await clientIp();
  const bad = (m = "Código inválido o vencido") => redirect(`${base}?step=code&email=${encodeURIComponent(email)}&error=${encodeURIComponent(m)}`);
  // RF-ACC-03: tras 5 códigos errados (configurable) la cuenta queda bloqueada temporalmente para códigos
  const lock = codeLockStatus(email);
  if (lock.locked) {
    run("UPDATE otp_codes SET used=1 WHERE email=? AND used=0", email);
    bad(`Por seguridad la cuenta está bloqueada temporalmente por códigos incorrectos. Intenta de nuevo en ${lock.minutesLeft} minuto${lock.minutesLeft === 1 ? "" : "s"}.`);
  }
  const lim = limitAction("login_cuenta", `otp:${email}`, ip, email);
  if (lim) { run("UPDATE otp_codes SET used=1 WHERE email=? AND used=0", email); bad(lim); }
  const o = get<any>("SELECT * FROM otp_codes WHERE email=? AND purpose=? AND used=0 ORDER BY id DESC LIMIT 1", email, purpose);
  const u = get<any>("SELECT * FROM users WHERE email=?", email);
  if (!o || !u || o.code !== code || new Date(o.expires_at) < new Date()) {
    securityEvent("otp_fallido", ip, email);
    const f = registerCodeFailure(email);
    if (f.locked) {
      run("UPDATE otp_codes SET used=1 WHERE email=? AND used=0", email); // el código vigente deja de servir
      securityEvent("bloqueo_codigo", ip, email, `${f.fails} códigos errados (${purpose})`);
      if (u) await audit({ id: u.id, email }, "bloqueo_codigo", "user", u.id, null, { intentos: f.fails, proposito: purpose });
      const m = codeLockStatus(email).minutesLeft;
      bad(`Demasiados códigos incorrectos. Por seguridad la cuenta queda bloqueada ${m} minuto${m === 1 ? "" : "s"}; luego pide un código nuevo.`);
    }
    bad(`Código inválido o vencido. Te queda${f.remaining === 1 ? "" : "n"} ${f.remaining} intento${f.remaining === 1 ? "" : "s"} antes del bloqueo temporal.`);
  }
  clearCodeFailures(email);
  run("UPDATE otp_codes SET used=1 WHERE id=?", o.id);
  if (purpose === "reset") {
    const pw = String(fd.get("password") || "");
    if (!strongPw(pw)) redirect(`/recuperar?error=${encodeURIComponent("La contraseña debe tener 10+ caracteres con mayúscula, minúscula y número")}`);
    run("UPDATE users SET password_hash=?, must_change_password=0, temp_expires_at=NULL, failed_attempts=0, locked_until=NULL WHERE id=?", hashPassword(pw), u.id);
    run("DELETE FROM sessions WHERE user_id=?", u.id); // cierra las sesiones abiertas con la clave anterior
    await audit(u, "recuperar_clave", "user", u.id);
    redirect("/login?ok=" + encodeURIComponent("Contraseña actualizada. Ya puedes ingresar."));
  }
  resetLimit(`login_cuenta:otp:${email}`);
  refundLimit(`otp:ip:${ip}`);
  // el ingreso con código al correo es el camino de las empresas; un usuario interno debe usar clave + 2FA o SSO
  if (!u.company_id && (u.mfa_enabled || mfaRequired(u))) { await beginMfa(u.id, "otp", safeNext(fd)); redirect("/login/mfa"); }
  await startSession(u.id, "otp");
  await audit(u, "login_otp", "user", u.id);
  redirect(safeNext(fd));
}

/* ---------------- segundo factor (TOTP) ---------------- */
export async function verifyMfa(fd: FormData) {
  const p = await pendingMfa();
  if (!p) E("La verificación venció. Ingresa de nuevo.");
  const { flow, data, user: u } = p!;
  const ip = await clientIp();
  const code = String(fd.get("code") || "").replace(/\s/g, "").slice(0, 20);
  const useRecovery = fd.get("recovery") === "1";
  const ok = useRecovery ? consumeRecoveryCode(u.id, code) : verifyUserTotp(u.id, openSecret(u.mfa_secret), code);
  if (!ok) {
    securityEvent("mfa_fallido", ip, u.email);
    const attempts = (data.attempts || 0) + 1;
    if (attempts >= 5) {
      await clearMfa();
      await audit(u, "mfa_bloqueo", "user", u.id, null, { intentos: attempts });
      E("Demasiados códigos incorrectos. Ingresa de nuevo.");
    }
    run("UPDATE auth_flows SET data=? WHERE id=?", JSON.stringify({ ...data, attempts }), flow.id);
    redirect(`/login/mfa?error=${encodeURIComponent(useRecovery ? "Código de recuperación inválido o ya usado" : "Código incorrecto. Revisa la hora de tu celular e inténtalo de nuevo.")}`);
  }
  await clearMfa();
  await startSession(u.id, "mfa");
  await audit(u, useRecovery ? "login_2fa_recuperacion" : "login_2fa", "user", u.id, null, { metodo: data.method });
  redirect(data.next || "/");
}

/** Enrolamiento obligatorio durante el ingreso (RF-ACC-05): sin 2FA configurado no hay sesión. */
export async function enrollMfaLogin(fd: FormData) {
  const p = await pendingMfa();
  if (!p) E("La verificación venció. Ingresa de nuevo.");
  const { flow, data, user: u } = p!;
  if (u.mfa_enabled) redirect("/login/mfa");
  const secret = String(data.secret || "");
  if (!secret || !verifyUserTotp(u.id, secret, String(fd.get("code") || ""))) {
    securityEvent("mfa_fallido", await clientIp(), u.email, "enrolamiento");
    redirect(`/login/mfa?error=${encodeURIComponent("El código no coincide. Escanea de nuevo el QR y escribe el código que muestra la aplicación.")}`);
  }
  run("DELETE FROM auth_flows WHERE id=?", flow.id);
  const codes = enableMfa(u.id, secret);
  await audit(u, "activar_2fa", "user", u.id, { mfa_enabled: 0 }, { mfa_enabled: 1, metodo: "totp" });
  await clearMfa();
  await startSession(u.id, "mfa");
  await audit(u, "login_2fa", "user", u.id, null, { metodo: data.method, enrolamiento: true });
  const once = stashOnce(u.id, "show_codes", { codes, next: data.next || "/" });
  redirect(`/login/mfa/listo?c=${once}`);
}

export async function cancelMfa() {
  await clearMfa();
  redirect("/login");
}

export async function changePassword(fd: FormData) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const a = String(fd.get("password") || "");
  if (a !== String(fd.get("password2") || "")) E("Las contraseñas no coinciden", "/cambiar-clave");
  if (!strongPw(a)) E("La contraseña debe tener 10+ caracteres con mayúscula, minúscula y número", "/cambiar-clave");
  run("UPDATE users SET password_hash=?, must_change_password=0, temp_expires_at=NULL, status='activo' WHERE id=?", hashPassword(a), u.id);
  await audit(u, "cambiar_clave", "user", u.id);
  redirect("/");
}

export async function registerCompany(fd: FormData) {
  const g = (k: string, max = 200) => clean(fd.get(k), max);
  const ip = await clientIp();
  const bot = await botGuard(fd, "registro", ip, cleanEmail(fd.get("email")));
  if (bot) E(bot, "/registro");
  const nit = g("nit", 20).replace(/\D/g, "");
  const dv = g("dv", 2);
  const email = cleanEmail(fd.get("email"));
  if (!g("razon_social") || !g("email") || !g("name")) E("Completa los campos obligatorios", "/registro");
  if (!email) E("El correo no es válido", "/registro");
  if (!validNit(nit, dv)) E("El NIT o su dígito de verificación no son válidos", "/registro");
  const programId = Number(g("program_id"));
  if (!get("SELECT 1 FROM programs WHERE id=? AND status='activo'", programId)) E("Selecciona un programa válido", "/registro");
  if (get("SELECT 1 FROM companies WHERE nit=? AND program_id=?", nit, programId)) E("Este NIT ya está registrado en el programa. Ingresa con tu cuenta.", "/registro");
  if (get("SELECT 1 FROM users WHERE email=?", email)) E("Ese correo ya tiene una cuenta", "/registro");
  const cid = insert("INSERT INTO companies(razon_social,nit,dv,program_id,status,source,created_at) VALUES(?,?,?,?,?,?,?)",
    g("razon_social"), nit, dv, programId, "pendiente", "autorregistro", now());
  const uid = insert("INSERT INTO users(email,name,phone,status,internal,company_id,is_principal,created_at) VALUES(?,?,?,?,0,?,1,?)",
    email, g("name", 120), cleanPhone(fd.get("phone")), "activo", cid, now());
  const role = get<any>("SELECT id FROM roles WHERE key='empresa'");
  insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,created_at) VALUES(?,?,?,?,?)", uid, role.id, "company", cid, now());
  await audit({ id: uid, email }, "autorregistro", "company", cid, null, { nit, razon_social: g("razon_social") });
  redirect("/login?ok=" + encodeURIComponent("Registro recibido. Tu empresa queda pendiente de activación por Compensar. Ingresa con un código al correo."));
}

export async function logout() {
  const u = await currentUser();
  if (u) await audit(u, "logout", "user", u.id);
  await endSession();
  redirect("/login");
}

/* ---------------- empresa activa (RF-EMP-03) ---------------- */
/** Un contacto de varias empresas elige con cuál trabaja; queda en la sesión y en auditoría. */
export async function switchCompany(companyId: number) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const t = await currentSessionToken();
  const id = Number(companyId);
  if (!t || !id || !isContactOf(u.id, id)) redirect("/sin-acceso");
  const before = u.company_id;
  if (before !== id) {
    run("UPDATE sessions SET active_company_id=? WHERE token=?", id, t);
    const c = get<any>("SELECT razon_social FROM companies WHERE id=?", id);
    await audit(u, "cambiar_empresa_activa", "company", id, { empresa_activa: before }, { empresa_activa: id, razon_social: c?.razon_social });
  }
  redirect("/");
}
