import crypto from "node:crypto";
import { get, run } from "@/lib/db";
import { MOCK_CLIENT_ID, mockClientSecret, originFrom, b64url } from "@/lib/oidc";
import { mockEnabled, notFound, signJwt } from "../lib";

export const dynamic = "force-dynamic";

const err = (error: string, description: string, status = 400) => Response.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store" } });
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Token endpoint del IdP de prueba: authorization_code + PKCE S256, autenticación client_secret_post o basic. */
export async function POST(req: Request) {
  if (!mockEnabled()) return notFound();
  const f = new URLSearchParams(await req.text());
  let clientId = f.get("client_id") || "", secret = f.get("client_secret") || "";
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [i, s] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    clientId = decodeURIComponent(i || ""); secret = decodeURIComponent(s || "");
  }
  if (f.get("grant_type") !== "authorization_code") return err("unsupported_grant_type", "Solo authorization_code");
  if (clientId !== MOCK_CLIENT_ID || !safeEq(secret, mockClientSecret())) return err("invalid_client", "Cliente o secreto inválidos", 401);
  const code = f.get("code") || "";
  const flow = get<any>("SELECT * FROM auth_flows WHERE id=? AND kind='mock_code'", code);
  if (flow) run("DELETE FROM auth_flows WHERE id=?", code); // de un solo uso
  if (!flow || new Date(flow.expires_at) < new Date()) return err("invalid_grant", "Código inválido, usado o vencido");
  const d = JSON.parse(flow.data);
  if (d.redirect_uri !== f.get("redirect_uri") || d.client_id !== clientId) return err("invalid_grant", "redirect_uri no coincide");
  const verifier = f.get("code_verifier") || "";
  if (!verifier || b64url(crypto.createHash("sha256").update(verifier).digest()) !== d.code_challenge) return err("invalid_grant", "PKCE: code_verifier no coincide");
  const iss = `${originFrom(req.headers, req.url)}/mock-idp`;
  const t = Math.floor(Date.now() / 1000);
  const idToken = signJwt({
    iss, sub: d.sub, aud: clientId, iat: t, exp: t + 300, auth_time: t, nonce: d.nonce,
    email: d.email, email_verified: true, name: d.name, preferred_username: d.email, groups: d.groups, amr: ["pwd", "mfa"],
  });
  return Response.json({ access_token: b64url(crypto.randomBytes(24)), token_type: "Bearer", expires_in: 300, id_token: idToken, scope: d.scope },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
