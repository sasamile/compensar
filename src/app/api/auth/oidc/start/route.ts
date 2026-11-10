import { cookies } from "next/headers";
import { beginLogin, originFrom } from "@/lib/oidc";
import { clientIp } from "@/lib/auth";
import { limitAction } from "@/lib/ratelimit";
import { logError } from "@/lib/resilience";

export const dynamic = "force-dynamic";

/** Inicia el SSO corporativo (OIDC Authorization Code + PKCE). Enlazar con <a href="/api/auth/oidc/start">, no con <Link>. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originFrom(req.headers, req.url);
  const fail = (m: string) => Response.redirect(`${origin}/login?error=${encodeURIComponent(m)}`, 303);
  const ip = await clientIp();
  const lim = limitAction("login", `ip:${ip}`, ip);
  if (lim) return fail(lim);
  try {
    const { url: to, state } = await beginLogin(origin, url.searchParams.get("next") || "/");
    (await cookies()).set("oidc_state", state, { httpOnly: true, sameSite: "lax", path: "/api/auth/oidc", maxAge: 600, secure: origin.startsWith("https://") });
    return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
  } catch (e: any) {
    const trace = logError("sso.start", e);
    return fail(`No fue posible iniciar el ingreso corporativo: ${e?.message || "error"} (traza ${trace})`);
  }
}
