import crypto from "node:crypto";
import { setting, setSetting } from "@/lib/db";
import { demoMode } from "@/lib/auth";
import { b64url } from "@/lib/oidc";

/**
 * IdP DE PRUEBA (solo demostración): proveedor OpenID Connect mínimo dentro de la app para probar el SSO
 * de punta a punta sin el IAM real. Publica discovery, authorize (selector de funcionarios ficticios),
 * token (con PKCE) y JWKS. El par RSA se genera una vez y se guarda en settings (mock_idp_jwk).
 * Se habilita con el setting sso_mock_enabled (por defecto activo en MODO DEMO). No usar en producción.
 */
export const mockEnabled = () => setting("sso_mock_enabled", demoMode() ? "1" : "0") === "1";

export type Employee = { sub: string; email: string; name: string; groups: string[]; enabled: boolean; title: string };
export const EMPLOYEES: Employee[] = [
  { sub: "e-1001", email: "admin@compensar.test", name: "Ana Administradora", groups: ["GRP-FOMENTO-ADMIN"], enabled: true, title: "Administradora de la plataforma (usuario existente)" },
  { sub: "e-2001", email: "lucia.gestora@compensar.test", name: "Lucía Gestora (SSO)", groups: ["GRP-FOMENTO-GESTOR-TERRITORIO", "GRP-TODOS-FUNCIONARIOS"], enabled: true, title: "Gestora de mentorías — Territorio MIPYME (nueva, se crea al ingresar)" },
  { sub: "e-2002", email: "pedro.mentor@compensar.test", name: "Pedro Mentor (SSO)", groups: ["GRP-FOMENTO-MENTOR"], enabled: true, title: "Mentor interno (nuevo)" },
  { sub: "e-2003", email: "andres.auditor@compensar.test", name: "Andrés Auditor (SSO)", groups: ["GRP-FOMENTO-AUDITOR"], enabled: true, title: "Auditor interno (nuevo)" },
  { sub: "e-3001", email: "sin.grupo@compensar.test", name: "Sergio Sin Grupo", groups: ["GRP-TODOS-FUNCIONARIOS"], enabled: true, title: "Funcionario sin grupo autorizado (se niega el acceso)" },
  { sub: "e-3002", email: "retirado@compensar.test", name: "Rita Retirada", groups: ["GRP-FOMENTO-MENTOR"], enabled: false, title: "Cuenta deshabilitada en el directorio (el IdP niega el acceso)" },
];

let cached: { priv: crypto.KeyObject; jwk: any } | null = null;
export function mockKeys() {
  const stored = setting("mock_idp_jwk");
  if (cached && stored && JSON.parse(stored).kid === cached.jwk.kid) return cached;
  let jwkPriv: any;
  if (stored) jwkPriv = JSON.parse(stored);
  else {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    jwkPriv = privateKey.export({ format: "jwk" });
    // kid = huella RFC 7638 de la llave pública
    jwkPriv.kid = b64url(crypto.createHash("sha256").update(JSON.stringify({ e: jwkPriv.e, kty: "RSA", n: jwkPriv.n })).digest()).slice(0, 16);
    setSetting("mock_idp_jwk", JSON.stringify(jwkPriv));
  }
  const priv = crypto.createPrivateKey({ key: jwkPriv, format: "jwk" });
  cached = { priv, jwk: { kty: "RSA", use: "sig", alg: "RS256", kid: jwkPriv.kid, n: jwkPriv.n, e: jwkPriv.e } };
  return cached;
}

export function signJwt(claims: Record<string, any>): string {
  const { priv, jwk } = mockKeys();
  const h = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid })));
  const p = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), priv);
  return `${h}.${p}.${b64url(sig)}`;
}

export const notFound = () => new Response("IdP de prueba deshabilitado", { status: 404 });
