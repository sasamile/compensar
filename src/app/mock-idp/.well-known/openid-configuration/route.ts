import { originFrom } from "@/lib/oidc";
import { mockEnabled, notFound } from "../../lib";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!mockEnabled()) return notFound();
  const iss = `${originFrom(req.headers, req.url)}/mock-idp`;
  return Response.json({
    issuer: iss,
    authorization_endpoint: `${iss}/authorize`,
    token_endpoint: `${iss}/token`,
    jwks_uri: `${iss}/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "nonce", "email", "email_verified", "name", "groups", "amr"],
  });
}
