import { cookies } from "next/headers";
import { beginMfa, clientIp, mfaRequired, startSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setting } from "@/lib/db";
import { finishLogin, originFrom, provision } from "@/lib/oidc";
import { securityEvent } from "@/lib/ratelimit";
import { logError } from "@/lib/resilience";

export const dynamic = "force-dynamic";

/** Vuelta del IAM: valida state, canjea el código con PKCE, verifica el id_token (RS256/JWKS), aprovisiona y crea sesión. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originFrom(req.headers, req.url);
  const go = (path: string) => new Response(null, { status: 303, headers: { Location: `${origin}${path}`, "Cache-Control": "no-store" } });
  const fail = (m: string) => go(`/login?error=${encodeURIComponent(m)}`);
  const jar = await cookies();
  const cookieState = jar.get("oidc_state")?.value;
  jar.delete({ name: "oidc_state", path: "/api/auth/oidc" });
  const ip = await clientIp();
  let res;
  try {
    res = await finishLogin(origin, url.searchParams, cookieState);
  } catch (e: any) {
    securityEvent("sso_fallido", ip, null, e?.message);
    await audit(null, "sso_denegado", "user", null, null, { motivo: e?.message });
    if (!/no autorizó|venció|canceló/i.test(e?.message || "")) logError("sso.callback", e);
    return fail(e?.message || "No fue posible completar el ingreso corporativo");
  }
  const { claims, next, cfg } = res;
  const p = provision(claims, cfg);
  if (p.changes && p.changes.antes.join() !== p.changes.despues.join() && p.user)
    await audit({ id: p.user.id, email: p.user.email }, p.changes.despues.length ? "sso_sincronizar_roles" : "sso_retirar_roles", "user", p.user.id, { roles_iam: p.changes.antes }, { roles_iam: p.changes.despues });
  if (p.error || !p.user) {
    securityEvent("sso_denegado", ip, claims.email || null, p.error);
    await audit(p.user ? { id: p.user.id, email: p.user.email } : { email: claims.email }, "sso_denegado", "user", p.user?.id ?? null, null, { motivo: p.error });
    return fail(p.error || "Acceso denegado");
  }
  const u = p.user;
  if (p.created) await audit({ id: u.id, email: u.email }, "sso_aprovisionar", "user", u.id, null, { email: u.email, name: u.name, origen: cfg.label });
  // Segundo factor: por defecto se confía en el MFA del IAM corporativo (Entra ID / acceso condicional).
  if (setting("sso_trust_idp_mfa", "1") !== "1" && mfaRequired(u)) {
    await beginMfa(u.id, "sso", next);
    return go("/login/mfa");
  }
  await startSession(u.id, "sso");
  await audit({ id: u.id, email: u.email }, "login_sso", "user", u.id, null, { idp: cfg.label, amr: claims.amr ?? null });
  return go(next || "/");
}
