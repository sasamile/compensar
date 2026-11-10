import { insert, now } from "@/lib/db";
import { issueToken } from "@/lib/api-auth";
import { limitAction, securityEvent } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const oauthErr = (status: number, error: string, desc: string) =>
  Response.json({ error, error_description: desc }, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });

/**
 * POST /api/oauth/token — OAuth 2.0 client credentials (RFC 6749 §4.4).
 * Credenciales por HTTP Basic (recomendado) o client_id/client_secret en el cuerpo (form o JSON).
 */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const lim = limitAction("token", `ip:${ip}`, ip);
  if (lim) return oauthErr(429, "slow_down", lim);
  const ct = req.headers.get("content-type") || "";
  let f: Record<string, string> = {};
  try {
    f = ct.includes("application/json") ? await req.json() : Object.fromEntries(new URLSearchParams(await req.text()));
  } catch { return oauthErr(400, "invalid_request", "Cuerpo inválido"); }
  let id = String(f.client_id || ""), secret = String(f.client_secret || "");
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    const [a, b] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    id = decodeURIComponent(a || ""); secret = decodeURIComponent(b || "");
  }
  if (f.grant_type !== "client_credentials") return oauthErr(400, "unsupported_grant_type", "Solo se admite grant_type=client_credentials");
  if (!id || !secret) return oauthErr(401, "invalid_client", "Faltan client_id y client_secret");
  const r = issueToken(id, secret, f.scope ? String(f.scope) : null);
  try { insert("INSERT INTO api_log(ts,client_id,method,path,status,ms,ip) VALUES(?,?,?,?,?,?,?)", now(), id.slice(0, 40), "POST", "/api/oauth/token", r.ok ? 200 : r.status, 0, ip); } catch {}
  if (!r.ok) { securityEvent("api_token_fallido", ip, null, id.slice(0, 40)); return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } }); }
  return Response.json(r.body, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
