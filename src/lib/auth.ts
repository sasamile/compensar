import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { all, get, insert, now, run, setting } from "./db";
import { reqInfo } from "./audit";
import { jparse } from "./util";

export type Grant = { role_key: string; role_name: string; perms: string[]; scope_type: string; scope_id: number | null };
export type User = {
  id: number; email: string; name: string; phone: string | null; internal: number; status: string;
  company_id: number | null; is_principal: number; aliado_id: number | null; must_change_password: number;
  grants: Grant[];
};

export const hashPassword = (pw: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`;
};
/** Igual que hashPassword pero sin bloquear el proceso (cargues masivos con cientos de cuentas). */
export const hashPasswordAsync = (pw: string) => new Promise<string>((res, rej) => {
  const salt = crypto.randomBytes(16).toString("hex");
  crypto.scrypt(pw, salt, 32, (e, k) => (e ? rej(e) : res(`${salt}:${k.toString("hex")}`)));
});
export const verifyPassword = (pw: string, hash?: string | null) => {
  if (!hash) return false;
  const [salt, h] = hash.split(":");
  const x = crypto.scryptSync(pw, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h));
};

export function loadGrants(userId: number): Grant[] {
  return all<any>(
    `SELECT r.key role_key, r.name role_name, r.perms, ur.scope_type, ur.scope_id
     FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`, userId,
  ).map((g) => ({ ...g, perms: jparse<string[]>(g.perms, []) }));
}

/** MODO DEMO (por defecto activo salvo DEMO_MODE=0): muestra en pantalla códigos que en producción solo llegan al usuario. */
export const demoMode = () => process.env.DEMO_MODE !== "0";
const secureCookie = () => process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1";

/** Crea la sesión web. `method`: clave | otp | mfa | sso (queda en session_meta para "sesiones activas"). */
export async function startSession(userId: number, method = "clave") {
  const token = crypto.randomBytes(32).toString("hex");
  const { ip, ua } = await reqInfo();
  insert("INSERT INTO sessions(token,user_id,created_at,last_seen,ip) VALUES(?,?,?,?,?)", token, userId, now(), now(), ip);
  try {
    run("INSERT OR REPLACE INTO session_meta(token,user_id,method,ua,created_at) VALUES(?,?,?,?,?)", token, userId, method, ua.slice(0, 300), now());
    run("UPDATE users SET last_login_at=? WHERE id=?", now(), userId);
  } catch {}
  (await cookies()).set("sid", token, { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookie() });
}

export async function endSession() {
  const c = await cookies();
  const t = c.get("sid")?.value;
  if (t) { run("DELETE FROM sessions WHERE token=?", t); run("DELETE FROM session_meta WHERE token=?", t); }
  c.delete("sid");
}

export async function currentSessionToken() {
  return (await cookies()).get("sid")?.value ?? null;
}

/** RN-08 / RF-ACC-05: los roles internos y de aliado deben usar segundo factor fuerte (configurable). */
export function mfaRequired(u: { internal?: number; aliado_id?: number | null; company_id?: number | null }) {
  if (setting("mfa_required_internal", "1") !== "1") return false;
  return !u.company_id && (u.internal === 1 || !!u.aliado_id);
}

export const isAdmin = (u: User) => u.grants.some((g) => g.perms.includes("*"));

export async function currentUser(): Promise<User | null> {
  const t = (await cookies()).get("sid")?.value;
  if (!t) return null;
  const s = get<any>("SELECT * FROM sessions WHERE token=?", t);
  if (!s) return null;
  const timeout = Number(setting("session_timeout_min", "30")) * 60 * 1000;
  if (Date.now() - new Date(s.last_seen).getTime() > timeout) {
    run("DELETE FROM sessions WHERE token=?", t); // RN-09 cierre por inactividad
    return null;
  }
  // RN-07: una sesión iniciada por SSO dura como máximo sso_session_max_h; luego el IAM debe volver a autorizar
  const meta = get<any>("SELECT method FROM session_meta WHERE token=?", t);
  if (meta?.method === "sso" && Date.now() - new Date(s.created_at).getTime() > Number(setting("sso_session_max_h", "8")) * 3600000) {
    run("DELETE FROM sessions WHERE token=?", t);
    return null;
  }
  // refresca como máximo cada 30 s (las páginas de servidor no pueden escribir cookies, solo la BD)
  if (Date.now() - new Date(s.last_seen).getTime() > 30000) run("UPDATE sessions SET last_seen=? WHERE token=?", now(), t);
  const u = get<any>("SELECT * FROM users WHERE id=?", s.user_id);
  if (!u || (u.status !== "activo" && u.status !== "invitado")) return null;
  return withActiveCompany({ ...u, grants: loadGrants(u.id) }, s.active_company_id);
}

/* ---------- contactos multiempresa (RF-EMP-03) ---------- */
/**
 * Empresas de las que el usuario es contacto: su empresa principal (users.company_id) más las vinculadas en
 * company_contacts. Orden: la principal primero.
 */
export function userCompanies(userId: number): { id: number; razon_social: string; nit: string; status: string; role: string; principal: number }[] {
  return all<any>(
    `SELECT c.id, c.razon_social, c.nit, c.status, COALESCE(cc.role, CASE WHEN u.is_principal=1 THEN 'representante' ELSE 'colaborador' END) role,
            CASE WHEN c.id=u.company_id THEN 1 ELSE 0 END principal
     FROM users u JOIN companies c ON c.id=u.company_id OR c.id IN (SELECT company_id FROM company_contacts WHERE user_id=u.id)
     LEFT JOIN company_contacts cc ON cc.company_id=c.id AND cc.user_id=u.id
     WHERE u.id=? GROUP BY c.id ORDER BY principal DESC, c.razon_social`, userId);
}

/** ¿La empresa pertenece al usuario (principal o contacto vinculado)? */
export function isContactOf(userId: number, companyId: number) {
  return !!get("SELECT 1 FROM users WHERE id=? AND company_id=?", userId, companyId)
    || !!get("SELECT 1 FROM company_contacts WHERE user_id=? AND company_id=?", userId, companyId);
}

/**
 * Aplica la empresa activa de la sesión: `company_id` pasa a ser la empresa elegida (solo si es suya) y los
 * permisos de alcance «company» se limitan a los de esa empresa (cada vínculo tiene su propio rol). Todo lo que
 * filtra por user.company_id (companyFilter, sessionFilter…) sigue funcionando sin cambios.
 */
export function withActiveCompany(u: User, activeCompanyId?: number | null): User {
  if (!u.company_id && !activeCompanyId) return u;
  const principal = u.company_id;
  let active = principal;
  if (activeCompanyId && activeCompanyId !== principal && isContactOf(u.id, activeCompanyId)) active = activeCompanyId;
  if (!active) return u;
  if (active === principal) {
    // los vínculos a otras empresas no suman permisos mientras la principal está activa
    return { ...u, grants: u.grants.filter((g) => g.scope_type !== "company" || !g.scope_id || g.scope_id === principal) };
  }
  const link = get<any>("SELECT role FROM company_contacts WHERE user_id=? AND company_id=?", u.id, active);
  return {
    ...u,
    company_id: active,
    is_principal: link?.role === "representante" ? 1 : 0,
    grants: u.grants.filter((g) => g.scope_type !== "company" || g.scope_id === active),
  };
}

/** Usuario completo por id (sin cookies): procesos por lotes y pruebas. */
export function loadUser(userId: number): User | null {
  const u = get<any>("SELECT * FROM users WHERE id=?", userId);
  return u ? withActiveCompany({ ...u, grants: loadGrants(u.id) }) : null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.must_change_password) redirect("/cambiar-clave");
  // RF-EMP-06 / RF-PAR-08: la empresa activa no avanza a ninguna pantalla hasta completar los pasos del primer ingreso
  if (u.company_id) {
    const path = (await headers()).get("x-pathname") || "";
    const ALLOWED = ["/onboarding", "/cuenta", "/notificaciones"];
    if (path && !ALLOWED.some((a) => path === a || path.startsWith(a + "/"))) {
      const c = get<any>("SELECT status, onboarding_done FROM companies WHERE id=?", u.company_id);
      if (c?.status === "activa" && !c.onboarding_done) redirect("/onboarding");
    }
  }
  return u;
}

/* ---------- permisos ---------- */
const match = (perms: string[], p: string) => perms.includes(p) || perms.includes("*") || perms.includes(p.split(":")[0] + ":*");

export const can = (u: User, perm: string) => u.grants.some((g) => match(g.perms, perm));

export function requirePerm(u: User, perm: string) {
  if (!can(u, perm)) redirect("/sin-acceso");
}

/** Programas sobre los que el usuario tiene el permiso. null = todos (alcance organización). */
export function programScope(u: User, perm: string): number[] | null {
  const gs = u.grants.filter((g) => match(g.perms, perm));
  if (gs.some((g) => g.scope_type === "org")) return null;
  return gs.filter((g) => g.scope_type === "program" && g.scope_id).map((g) => g.scope_id!);
}
export const canInProgram = (u: User, perm: string, programId: number) => {
  const s = programScope(u, perm);
  if (!can(u, perm)) return false;
  return s === null || s.includes(programId);
};

export const isCompanyUser = (u: User) => !!u.company_id;
export const isAliadoUser = (u: User) => !!u.aliado_id;

/**
 * RN-01/RN-02: filtro SQL de las empresas que el usuario puede ver.
 * Une los alcances de todos sus roles (RN-04).
 */
export function companyFilter(u: User, alias = "c"): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const g of u.grants) {
    if (!match(g.perms, "companies.view")) continue;
    if (g.scope_type === "org") return { sql: "1=1", params: [] };
    if (g.scope_type === "program" && g.scope_id) { parts.push(`${alias}.program_id=?`); params.push(g.scope_id); }
    if (g.scope_type === "assigned") {
      parts.push(`(${alias}.id IN (SELECT company_id FROM mentor_assignments WHERE mentor_id=? AND active=1)
        OR ${alias}.id IN (SELECT company_id FROM referrals WHERE mentor_id=? AND status NOT IN ('rechazada')))`);
      params.push(u.id, u.id);
    }
    if (g.scope_type === "aliado" && g.scope_id) {
      parts.push(`${alias}.id IN (SELECT company_id FROM referrals WHERE aliado_id=?)`);
      params.push(g.scope_id);
    }
    if (g.scope_type === "company") { parts.push(`${alias}.id=?`); params.push(u.company_id); }
  }
  if (u.company_id) { parts.push(`${alias}.id=?`); params.push(u.company_id); }
  return parts.length ? { sql: "(" + parts.join(" OR ") + ")", params } : { sql: "1=0", params: [] };
}

export function canSeeCompany(u: User, companyId: number) {
  const f = companyFilter(u, "c");
  return !!get(`SELECT 1 FROM companies c WHERE c.id=? AND ${f.sql}`, companyId, ...f.params);
}

export async function requireCompanyAccess(u: User, companyId: number) {
  if (!canSeeCompany(u, companyId)) redirect("/sin-acceso");
}

/** Sesiones visibles (mentor ve las suyas; gestor las del programa; empresa las suyas). */
export function sessionFilter(u: User, alias = "s"): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const g of u.grants) {
    if (!match(g.perms, "sessions.view")) continue;
    if (g.scope_type === "org") return { sql: "1=1", params: [] };
    if (g.scope_type === "program" && g.scope_id) { parts.push(`${alias}.program_id=?`); params.push(g.scope_id); }
    if (g.scope_type === "assigned") { parts.push(`${alias}.mentor_id=?`); params.push(u.id); }
    if (g.scope_type === "aliado" && g.scope_id) {
      parts.push(`${alias}.referral_id IN (SELECT id FROM referrals WHERE aliado_id=?)`);
      params.push(g.scope_id);
    }
  }
  if (u.company_id) { parts.push(`${alias}.company_id=?`); params.push(u.company_id); }
  return parts.length ? { sql: "(" + parts.join(" OR ") + ")", params } : { sql: "1=0", params: [] };
}

export const clientIp = async () => (await reqInfo()).ip;

/* ---------- segundo factor pendiente (entre la clave/SSO y la sesión) ---------- */
/** Deja al usuario a la espera del segundo factor: no hay sesión hasta verificar el código o enrolarse. */
export async function beginMfa(userId: number, method: string, next = "/") {
  const id = crypto.randomBytes(24).toString("hex");
  run("DELETE FROM auth_flows WHERE kind='mfa' AND user_id=?", userId);
  insert("INSERT INTO auth_flows(id,kind,user_id,data,created_at,expires_at) VALUES(?,?,?,?,?,?)", id, "mfa", userId,
    JSON.stringify({ method, next, attempts: 0 }), now(), new Date(Date.now() + 10 * 60000).toISOString());
  (await cookies()).set("mfa_flow", id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: secureCookie() });
}

export async function pendingMfa(): Promise<{ flow: any; data: any; user: any } | null> {
  const id = (await cookies()).get("mfa_flow")?.value;
  if (!id) return null;
  const flow = get<any>("SELECT * FROM auth_flows WHERE id=? AND kind='mfa'", id);
  if (!flow || new Date(flow.expires_at) < new Date()) return null;
  const user = get<any>("SELECT * FROM users WHERE id=?", flow.user_id);
  if (!user || !["activo", "invitado"].includes(user.status)) return null;
  return { flow, data: jparse<any>(flow.data, {}), user };
}

export async function clearMfa() {
  const c = await cookies();
  const id = c.get("mfa_flow")?.value;
  if (id) run("DELETE FROM auth_flows WHERE id=?", id);
  c.delete("mfa_flow");
}
