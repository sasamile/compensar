import { mockEnabled, mockKeys, notFound } from "../lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!mockEnabled()) return notFound();
  return Response.json({ keys: [mockKeys().jwk] }, { headers: { "Cache-Control": "public, max-age=300" } });
}
