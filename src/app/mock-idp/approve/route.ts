import crypto from "node:crypto";
import { insert, now } from "@/lib/db";
import { MOCK_CLIENT_ID, originFrom, b64url } from "@/lib/oidc";
import { clean, cleanEmail } from "@/lib/sanitize";
import { EMPLOYEES, mockEnabled, notFound } from "../lib";

export const dynamic = "force-dynamic";

/** Respuesta del IdP de prueba: emite el código de autorización (o access_denied) y vuelve a la app (303). */
export async function POST(req: Request) {
  if (!mockEnabled()) return notFound();
  const fd = await req.formData();
  const origin = originFrom(req.headers, req.url);
  const redirectUri = String(fd.get("redirect_uri") || "");
  if (String(fd.get("client_id")) !== MOCK_CLIENT_ID || redirectUri !== `${origin}/api/auth/oidc/callback`)
    return new Response("Solicitud de SSO inválida (client_id o redirect_uri)", { status: 400 });
  const state = String(fd.get("state") || "");
  const back = (p: Record<string, string>) => new Response(null, { status: 303, headers: { Location: `${redirectUri}?${new URLSearchParams({ ...p, state })}` } });
  if (fd.get("cancel")) return back({ error: "access_denied", error_description: "El usuario canceló el ingreso" });
  const pick = String(fd.get("employee") || "");
  let emp = EMPLOYEES.find((e) => e.sub === pick);
  if (pick === "custom") {
    const email = cleanEmail(fd.get("c_email"));
    if (!email) return back({ error: "access_denied", error_description: "Correo inválido" });
    emp = { sub: "c-" + b64url(crypto.createHash("sha256").update(email).digest()).slice(0, 10), email, name: clean(fd.get("c_name"), 120) || email, groups: [], enabled: true, title: "" };
  }
  if (!emp) return back({ error: "access_denied", error_description: "Selecciona un funcionario" });
  if (!emp.enabled) return back({ error: "access_denied", error_description: "La cuenta está deshabilitada en el directorio corporativo" });
  const override = clean(fd.get("groups"), 500);
  const groups = override ? override.split(/[,\s]+/).filter(Boolean) : emp.groups;
  const code = b64url(crypto.randomBytes(24));
  insert("INSERT INTO auth_flows(id,kind,user_id,data,created_at,expires_at) VALUES(?,?,?,?,?,?)", code, "mock_code", null,
    JSON.stringify({ sub: emp.sub, email: emp.email, name: emp.name, groups, nonce: String(fd.get("nonce") || ""), code_challenge: String(fd.get("code_challenge") || ""),
      redirect_uri: redirectUri, client_id: MOCK_CLIENT_ID, scope: String(fd.get("scope") || "openid") }),
    now(), new Date(Date.now() + 2 * 60000).toISOString());
  return back({ code });
}
