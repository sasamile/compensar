import crypto from "node:crypto";
import { get } from "@/lib/db";
import { can, currentUser, type User } from "@/lib/auth";
import type { Global } from "@/lib/datasets";

export type BiCaller =
  | { kind: "user"; u: User; label: string }
  | { kind: "token"; clientId: string; scopes: string[]; forced: Global; label: string };

const parseScopes = (s: any): string[] => {
  if (!s) return [];
  try { const j = JSON.parse(s); if (Array.isArray(j)) return j.map(String); } catch { /* texto plano */ }
  return String(s).split(/[\s,;]+/).filter(Boolean);
};

/**
 * Autenticación de BI (TEC-94):
 *  - `Authorization: Bearer <token>` válido en api_tokens (scopes con «bi.read» y expires_at futuro; el token puede
 *    guardarse en claro o como SHA-256 hex). Scopes opcionales «bi.program:<id>» / «bi.aliado:<id>» acotan los datos.
 *  - O la sesión del usuario con permiso analytics.view (se aplica la seguridad a nivel de fila de su rol).
 */
export async function biAuth(req: Request): Promise<BiCaller | { error: string; status: number }> {
  const h = req.headers.get("authorization") || "";
  if (/^bearer\s+/i.test(h)) {
    const tok = h.replace(/^bearer\s+/i, "").trim();
    if (!tok) return { error: "Token vacío", status: 401 };
    const sha = crypto.createHash("sha256").update(tok).digest("hex");
    const row = get<any>("SELECT * FROM api_tokens WHERE token=? OR token=?", tok, sha);
    if (!row) return { error: "Token no válido", status: 401 };
    if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) return { error: "Token vencido", status: 401 };
    const scopes = parseScopes(row.scopes);
    if (!scopes.includes("bi.read")) return { error: "El token no tiene el alcance bi.read", status: 403 };
    if (row.client_id) {
      const cli = get<any>("SELECT active FROM api_clients WHERE client_id=?", row.client_id);
      if (cli && !cli.active) return { error: "Cliente API inactivo", status: 403 };
    }
    const num = (p: string) => { const s = scopes.find((x) => x.startsWith(p)); return s && /^\d+$/.test(s.slice(p.length)) ? Number(s.slice(p.length)) : null; };
    return { kind: "token", clientId: row.client_id || "token", scopes, forced: { program: num("bi.program:"), aliado: num("bi.aliado:") }, label: `api:${row.client_id || "token"}` };
  }
  const u = await currentUser();
  if (!u) return { error: "Autenticación requerida: sesión o cabecera Authorization: Bearer <token>", status: 401 };
  if (!can(u, "analytics.view")) return { error: "Sin permiso de analítica", status: 403 };
  return { kind: "user", u, label: u.email };
}
