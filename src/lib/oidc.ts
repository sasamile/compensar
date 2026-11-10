import crypto from "node:crypto";
import { all, get, insert, now, run, setting, setSetting, tx } from "./db";
import { jparse } from "./util";

/**
 * SSO corporativo con OpenID Connect (TEC-2, TEC-3, TEC-4, RN-07, RF-ACC-02).
 * Authorization Code + PKCE (S256), discovery (.well-known/openid-configuration), state y nonce,
 * verificación RS256 del id_token contra el JWKS del IdP con node:crypto (iss, aud, exp, iat, nonce).
 * Compatible con Microsoft Entra ID (registrar la app y emitir el claim "groups"), Keycloak, Okta, AD FS 2019+
 * y el IAM de Compensar. SAML 2.0 se federa vía Entra ID / broker (la app habla OIDC con el broker).
 * Mapeo de grupos del IAM a roles (setting sso_group_map), aprovisionamiento JIT y retiro de roles si el IAM
 * ya no autoriza al usuario.
 */
export type GroupRule = { group: string; role: string; scope_type?: string; scope_id?: number | null };
export const DEFAULT_GROUP_MAP: GroupRule[] = [
  { group: "GRP-FOMENTO-ADMIN", role: "admin", scope_type: "org" },
  { group: "GRP-FOMENTO-GESTOR-TERRITORIO", role: "gestor_mentorias", scope_type: "program", scope_id: 2 },
  { group: "GRP-FOMENTO-CONTENIDOS", role: "gestor_contenidos", scope_type: "program", scope_id: 2 },
  { group: "GRP-FOMENTO-MENTOR", role: "mentor", scope_type: "assigned" },
  { group: "GRP-FOMENTO-AUDITOR", role: "auditor", scope_type: "org" },
];
export const MOCK_CLIENT_ID = "fomento-empresarial";
/** Marca de las asignaciones de rol que administra el IAM (user_roles.granted_by = 0). */
export const IAM_GRANTOR = 0;

export const b64url = (b: Buffer) => b.toString("base64url");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest();

export function mockClientSecret(): string {
  let s = setting("mock_idp_client_secret");
  if (!s) { s = b64url(crypto.randomBytes(24)); setSetting("mock_idp_client_secret", s); }
  return s;
}

export type SsoConfig = {
  enabled: boolean; provider: "mock" | "externo"; issuer: string; clientId: string; clientSecret: string;
  scopes: string; groupClaim: string; jit: boolean; map: GroupRule[]; label: string;
};
export function ssoConfig(origin: string): SsoConfig {
  const provider = (setting("sso_provider", "mock") === "externo" ? "externo" : "mock") as "mock" | "externo";
  const mock = provider === "mock";
  return {
    enabled: setting("sso_enabled", "1") === "1",
    provider,
    issuer: mock ? `${origin}/mock-idp` : setting("sso_issuer").replace(/\/$/, ""),
    clientId: mock ? MOCK_CLIENT_ID : setting("sso_client_id"),
    clientSecret: mock ? mockClientSecret() : setting("sso_client_secret"),
    scopes: setting("sso_scopes", "openid profile email"),
    groupClaim: setting("sso_group_claim", "groups"),
    jit: setting("sso_jit", "1") === "1",
    map: jparse<GroupRule[]>(setting("sso_group_map"), DEFAULT_GROUP_MAP),
    label: mock ? "IdP de prueba (demo)" : setting("sso_label", "IAM corporativo"),
  };
}

/** Origen público de la app (PUBLIC_BASE_URL o cabeceras del proxy). */
export function originFrom(h: Headers, fallbackUrl?: string): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (fallbackUrl ? new URL(fallbackUrl).protocol.replace(":", "") : "http");
  if (host) return `${proto}://${host}`;
  return fallbackUrl ? new URL(fallbackUrl).origin : "http://localhost:3100";
}

/* ---------------- discovery y JWKS (con caché) ---------------- */
const g = globalThis as any;
const cache: Map<string, { at: number; v: any }> = (g.__feOidcCache ??= new Map());
async function cachedJson(url: string, ttlMs = 600000, force = false) {
  const c = cache.get(url);
  if (!force && c && Date.now() - c.at < ttlMs) return c.v;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`El IdP respondió HTTP ${r.status} en ${new URL(url).pathname}`);
  const v = await r.json();
  cache.set(url, { at: Date.now(), v });
  return v;
}
export async function discovery(issuer: string) {
  const d = await cachedJson(`${issuer}/.well-known/openid-configuration`);
  if (d.issuer !== issuer) throw new Error("El issuer del documento de discovery no coincide con el configurado");
  return d;
}

/* ---------------- verificación del id_token ---------------- */
export async function verifyIdToken(token: string, o: { issuer: string; audience: string; nonce?: string; jwksUri: string }) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("id_token mal formado");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  if (header.alg !== "RS256") throw new Error(`Algoritmo de firma no permitido: ${header.alg}`); // rechaza "none" y HS256
  let jwks = await cachedJson(o.jwksUri);
  let jwk = (jwks.keys || []).find((k: any) => k.kid === header.kid && (k.use ?? "sig") === "sig");
  if (!jwk) { jwks = await cachedJson(o.jwksUri, 0, true); jwk = (jwks.keys || []).find((k: any) => k.kid === header.kid); } // rotación de llaves
  if (!jwk || jwk.kty !== "RSA") throw new Error("Llave de firma del IdP no encontrada en el JWKS");
  const key = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: "jwk" });
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("Firma del id_token inválida");
  const t = Math.floor(Date.now() / 1000), skew = 120;
  if (claims.iss !== o.issuer) throw new Error("Emisor (iss) del id_token no coincide");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(o.audience)) throw new Error("Audiencia (aud) del id_token no coincide");
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp && claims.azp !== o.audience) throw new Error("azp no coincide");
  if (!claims.exp || claims.exp + skew < t) throw new Error("id_token vencido");
  if (claims.iat && claims.iat - skew > t) throw new Error("id_token emitido en el futuro");
  if (claims.nbf && claims.nbf - skew > t) throw new Error("id_token aún no es válido");
  if (o.nonce !== undefined && claims.nonce !== o.nonce) throw new Error("nonce del id_token no coincide (posible repetición)");
  return claims;
}

/* ---------------- inicio del flujo ---------------- */
export async function beginLogin(origin: string, next = "/"): Promise<{ url: string; state: string }> {
  const cfg = ssoConfig(origin);
  if (!cfg.enabled) throw new Error("El ingreso con cuenta corporativa (SSO) está desactivado");
  if (!cfg.issuer || !cfg.clientId) throw new Error("SSO sin configurar: falta issuer o client_id (Integraciones → Seguridad)");
  const d = await discovery(cfg.issuer);
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const redirectUri = `${origin}/api/auth/oidc/callback`;
  insert("INSERT INTO auth_flows(id,kind,user_id,data,created_at,expires_at) VALUES(?,?,?,?,?,?)", state, "oidc", null,
    JSON.stringify({ nonce, verifier, redirectUri, issuer: cfg.issuer, next: next.startsWith("/") && !next.startsWith("//") ? next : "/" }),
    now(), new Date(Date.now() + 10 * 60000).toISOString());
  const p = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: redirectUri, scope: cfg.scopes, state, nonce,
    code_challenge: b64url(sha256(verifier)), code_challenge_method: "S256",
  });
  return { url: `${d.authorization_endpoint}?${p}`, state };
}

/* ---------------- callback: canje del código y verificación ---------------- */
export async function finishLogin(origin: string, q: URLSearchParams, cookieState: string | undefined) {
  const state = q.get("state") || "";
  const flow = get<any>("SELECT * FROM auth_flows WHERE id=? AND kind='oidc'", state);
  if (flow) run("DELETE FROM auth_flows WHERE id=?", state); // un solo uso
  if (!flow || !cookieState || cookieState !== state || new Date(flow.expires_at) < new Date()) throw new Error("La solicitud de ingreso venció o no corresponde a este navegador. Inténtalo de nuevo.");
  if (q.get("error")) {
    const e = q.get("error");
    throw new Error(e === "access_denied" ? `El IAM corporativo no autorizó el ingreso${q.get("error_description") ? `: ${q.get("error_description")}` : ""}` : `El IAM corporativo devolvió un error (${e})`);
  }
  const code = q.get("code");
  if (!code) throw new Error("El IAM no devolvió el código de autorización");
  const f = JSON.parse(flow.data);
  const cfg = ssoConfig(origin);
  if (cfg.issuer !== f.issuer) throw new Error("La configuración del IdP cambió durante el ingreso");
  const d = await discovery(cfg.issuer);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: f.redirectUri, code_verifier: f.verifier, client_id: cfg.clientId });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const methods: string[] = d.token_endpoint_auth_methods_supported || ["client_secret_basic"];
  if (methods.includes("client_secret_post")) body.set("client_secret", cfg.clientSecret);
  else headers.Authorization = "Basic " + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
  const r = await fetch(d.token_endpoint, { method: "POST", body, headers, signal: AbortSignal.timeout(10000) });
  const tok: any = await r.json().catch(() => ({}));
  if (!r.ok || !tok.id_token) throw new Error(`El IAM rechazó el canje del código (${tok.error || "HTTP " + r.status})`);
  const claims = await verifyIdToken(tok.id_token, { issuer: cfg.issuer, audience: cfg.clientId, nonce: f.nonce, jwksUri: d.jwks_uri });
  return { claims, next: f.next as string, cfg };
}

/* ---------------- mapeo de grupos y aprovisionamiento ---------------- */
export function mapGroups(groups: string[], map: GroupRule[]): GroupRule[] {
  const set = new Set(groups.map(String));
  const out: GroupRule[] = [];
  for (const r of map) if (set.has(r.group) && !out.some((x) => x.role === r.role && (x.scope_type ?? "org") === (r.scope_type ?? "org") && (x.scope_id ?? null) === (r.scope_id ?? null))) out.push(r);
  return out;
}

export type ProvisionResult = { user?: any; error?: string; created?: boolean; changes?: { antes: string[]; despues: string[] } };

/** Crea o actualiza al funcionario y sincroniza los roles que vienen del IAM. */
export function provision(claims: any, cfg: SsoConfig): ProvisionResult {
  const subject = `${claims.iss}|${claims.sub}`;
  const email = String(claims.email || claims.preferred_username || claims.upn || "").trim().toLowerCase();
  const name = String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || email);
  const rawGroups = claims[cfg.groupClaim] ?? claims.groups ?? [];
  const groups: string[] = Array.isArray(rawGroups) ? rawGroups : String(rawGroups).split(/[,\s]+/).filter(Boolean);
  if (!email || !/@/.test(email)) return { error: "El IAM no envió el correo del usuario (claim email / preferred_username)" };
  if (claims.email_verified === false) return { error: "El correo de la cuenta corporativa no está verificado en el IAM" };
  const rules = mapGroups(groups, cfg.map);
  let u = get<any>("SELECT * FROM users WHERE sso_subject=?", subject) ?? get<any>("SELECT * FROM users WHERE email=?", email);
  const roleIds = Object.fromEntries(all<any>("SELECT id, key FROM roles").map((r) => [r.key, r.id]));
  const desired = rules.filter((r) => roleIds[r.role]);
  const key = (x: any) => `${x.role ?? x.role_key}|${x.scope_type ?? "org"}|${x.scope_id ?? ""}`;
  return tx(() => {
    if (u?.company_id) return { error: "El ingreso corporativo (SSO) es solo para funcionarios; las empresas ingresan con código al correo" };
    if (u && !["activo", "invitado"].includes(u.status)) return { error: "Tu usuario está inactivo en la plataforma. Comunícate con el administrador." };
    const currentIam = u ? all<any>("SELECT ur.id, r.key role, ur.scope_type, ur.scope_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND ur.granted_by=?", u.id, IAM_GRANTOR) : [];
    if (!desired.length) {
      // el IAM ya no autoriza: se retiran los roles que había dado el IAM (RN-07)
      if (u && currentIam.length) {
        run("DELETE FROM user_roles WHERE user_id=? AND granted_by=?", u.id, IAM_GRANTOR);
        // sin ningún rol restante, se cortan sus sesiones abiertas de inmediato
        if (!get("SELECT 1 FROM user_roles WHERE user_id=?", u.id)) run("DELETE FROM sessions WHERE user_id=?", u.id);
      }
      return { error: "Tu cuenta corporativa no pertenece a un grupo autorizado para esta plataforma.", user: u, changes: { antes: currentIam.map(key), despues: [] } };
    }
    let created = false;
    if (!u) {
      if (!cfg.jit) return { error: "Tu usuario no existe en la plataforma y el aprovisionamiento automático está desactivado." };
      const id = insert("INSERT INTO users(email,name,status,internal,sso_subject,created_at) VALUES(?,?,?,?,?,?)", email, name, "activo", 1, subject, now());
      u = get<any>("SELECT * FROM users WHERE id=?", id);
      created = true;
    } else {
      run("UPDATE users SET sso_subject=?, name=?, status='activo' WHERE id=?", subject, name || u.name, u.id);
    }
    const want = new Set(desired.map(key));
    const have = new Set(currentIam.map(key));
    for (const c of currentIam) if (!want.has(key(c))) run("DELETE FROM user_roles WHERE id=?", c.id);
    const manual = new Set(all<any>("SELECT r.key role, ur.scope_type, ur.scope_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND IFNULL(ur.granted_by,-1)<>?", u.id, IAM_GRANTOR).map(key));
    for (const r of desired) if (!have.has(key(r)) && !manual.has(key(r)))
      insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,granted_by,created_at) VALUES(?,?,?,?,?,?)", u.id, roleIds[r.role], r.scope_type ?? "org", r.scope_id ?? null, IAM_GRANTOR, now());
    return { user: get<any>("SELECT * FROM users WHERE id=?", u.id), created, changes: { antes: [...have], despues: [...want] } };
  });
}
