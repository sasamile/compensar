import crypto from "node:crypto";
import { get, insert, now, run } from "./db";
import { hashPassword, verifyPassword } from "./auth";
import { hit, limitFor } from "./ratelimit";
import { logError } from "./resilience";

/**
 * API REST propia (TEC-33, TEC-34, RF-INT-02): OAuth 2.0 client credentials.
 * - Clientes en api_clients (secreto con scrypt, nunca en claro); tokens Bearer opacos de 1 h en api_tokens
 *   (se guarda solo el SHA-256 del token).
 * - Permisos por scope y, opcionalmente, restricción del cliente a un programa (mismo alcance que un rol).
 * - Cada llamada queda en api_log (cliente, ruta, estado, duración) y tiene límite por cliente.
 */
export const API_SCOPES: [string, string][] = [
  ["empresas.read", "Empresas (sin datos de contacto)"],
  ["eventos.read", "Eventos y cursos"],
  ["inscripciones.read", "Inscripciones y asistencia"],
  ["servicios.read", "Catálogo de servicios"],
  ["sesiones.read", "Sesiones de mentoría"],
  ["remisiones.read", "Remisiones a aliados"],
  ["auditoria.read", "Registro de auditoría (SIEM)"],
  ["bi.read", "Lectura para BI: todos los recursos de negocio (no incluye auditoría)"],
  ["pii.read", "Incluir datos personales (correo y celular) — Ley 1581"],
];
export const TOKEN_TTL_S = 3600;

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const newClientId = () => "fe_" + crypto.randomBytes(9).toString("hex");
export const newClientSecret = () => "fes_" + crypto.randomBytes(32).toString("base64url");
export const hashSecret = hashPassword;

export type ApiClient = { client_id: string; name: string; scopes: string[]; program_id: number | null };

export function apiError(status: number, error: string, message: string, extra: Record<string, string> = {}) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

/** Emite un token (grant client_credentials). Devuelve el cuerpo OAuth o un error OAuth. */
export function issueToken(clientId: string, secret: string, scopeReq: string | null): { ok: boolean; status?: number; body: any } {
  const c = get<any>("SELECT * FROM api_clients WHERE client_id=?", clientId);
  let valid = false;
  try { valid = !!c && !!c.active && verifyPassword(secret, c.secret_hash); } catch { valid = false; }
  if (!valid) return { ok: false, status: 401, body: { error: "invalid_client", error_description: "Cliente desconocido, revocado o secreto inválido" } };
  const allowed: string[] = String(c.scopes || "").split(/[\s,]+/).filter(Boolean);
  const asked = scopeReq ? scopeReq.split(/[\s,]+/).filter(Boolean) : allowed;
  const bad = asked.filter((s) => !allowed.includes(s));
  if (bad.length) return { ok: false, status: 400, body: { error: "invalid_scope", error_description: `Scopes no autorizados para este cliente: ${bad.join(", ")}` } };
  const token = crypto.randomBytes(32).toString("base64url");
  run("INSERT INTO api_tokens(token,client_id,scopes,expires_at) VALUES(?,?,?,?)", sha256(token), clientId, asked.join(" "), new Date(Date.now() + TOKEN_TTL_S * 1000).toISOString());
  return { ok: true, body: { access_token: token, token_type: "Bearer", expires_in: TOKEN_TTL_S, scope: asked.join(" ") } };
}

const hasScope = (scopes: string[], need: string) =>
  scopes.includes(need) || (need.endsWith(".read") && need !== "auditoria.read" && need !== "pii.read" && scopes.includes("bi.read"));

/**
 * Autentica la petición con Bearer y exige `scope`. Devuelve el cliente o una Response de error (401/403/429).
 * Uso: const c = await apiAuth(req, "empresas.read"); if (c instanceof Response) return c;
 */
export async function apiAuth(req: Request, scope: string): Promise<ApiClient | Response> {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return apiError(401, "invalid_request", "Falta el token. Envía «Authorization: Bearer <token>» (obténlo en /api/oauth/token).", { "WWW-Authenticate": 'Bearer realm="fomento"' });
  const t = get<any>("SELECT * FROM api_tokens WHERE token=?", sha256(m[1]));
  if (!t || new Date(t.expires_at) < new Date())
    return apiError(401, "invalid_token", "Token inválido o vencido", { "WWW-Authenticate": 'Bearer realm="fomento", error="invalid_token"' });
  const c = get<any>("SELECT c.*, m.program_id FROM api_clients c LEFT JOIN api_client_meta m ON m.client_id=c.client_id WHERE c.client_id=?", t.client_id);
  if (!c || !c.active) return apiError(401, "invalid_token", "El cliente fue revocado", { "WWW-Authenticate": 'Bearer realm="fomento", error="invalid_token"' });
  const scopes = String(t.scopes || "").split(/\s+/).filter(Boolean);
  if (!hasScope(scopes, scope))
    return apiError(403, "insufficient_scope", `El token no tiene el scope requerido: ${scope}`, { "WWW-Authenticate": `Bearer realm="fomento", error="insufficient_scope", scope="${scope}"` });
  const { limit, windowMs } = limitFor("api");
  const rl = hit(`api:${c.client_id}`, limit, windowMs);
  if (!rl.ok) return apiError(429, "rate_limited", "Límite de peticiones excedido", { "Retry-After": String(rl.retryAfter) });
  const biProgram = scopes.find((x) => /^bi\.program:\d+$/.test(x));
  return { client_id: c.client_id, name: c.name, scopes, program_id: c.program_id ?? (biProgram ? Number(biProgram.split(":")[1]) : null) };
}

export const hasPii = (c: ApiClient) => c.scopes.includes("pii.read");

/** Paginación estándar: ?page=1&per_page=50 (máx. 200). */
export function paging(url: URL) {
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page") || 1)) || 1);
  const perPage = Math.min(200, Math.max(1, Math.trunc(Number(url.searchParams.get("per_page") || 50)) || 50));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function pageBody(url: URL, data: any[], total: number, page: number, perPage: number) {
  const next = page * perPage < total ? (() => { const u = new URL(url); u.searchParams.set("page", String(page + 1)); return u.pathname + u.search; })() : null;
  return { data, meta: { page, per_page: perPage, total, next } };
}

/** Envoltorio de un endpoint: autenticación, scope, registro en api_log y errores controlados. */
export function apiRoute(scope: string, fn: (req: Request, client: ApiClient, params: any) => Promise<Response> | Response) {
  return async (req: Request, ctx: { params?: Promise<any> } = {}) => {
    const t0 = Date.now();
    const url = new URL(req.url);
    let res: Response;
    let cid: string | null = null;
    try {
      const c = await apiAuth(req, scope);
      if (c instanceof Response) res = c;
      else {
        cid = c.client_id;
        res = await fn(req, c, ctx.params ? await ctx.params : {});
        run("INSERT INTO api_client_meta(client_id,last_used_at) VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET last_used_at=excluded.last_used_at", c.client_id, now());
      }
    } catch (e) {
      const trace = logError(`api ${url.pathname}`, e);
      res = apiError(500, "server_error", `Error interno (traza ${trace})`);
    }
    try {
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
      insert("INSERT INTO api_log(ts,client_id,method,path,status,ms,ip) VALUES(?,?,?,?,?,?,?)", now(), cid, req.method, url.pathname, res.status, Date.now() - t0, ip);
    } catch {}
    return res;
  };
}

/** Enmascara correo/celular cuando el cliente no tiene pii.read. */
export const maskEmail = (e?: string | null) => (e ? e.replace(/^(.).*(@.*)$/, "$1***$2") : e);
export const maskPhone = (p?: string | null) => (p ? p.replace(/.(?=.{2})/g, "*") : p);
