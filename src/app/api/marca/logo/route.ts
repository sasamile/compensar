import path from "node:path";
import { get, setting } from "@/lib/db";
import { readDocument } from "@/lib/onbase";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };

/**
 * GET /api/marca/logo — logo de la marca (RF-PAR-06), público: lo usan el menú, las pantallas de acceso,
 * las landings y los certificados. Solo sirve el documento configurado en el setting brand_logo_doc.
 */
export async function GET() {
  const id = Number(setting("brand_logo_doc", "")) || 0;
  const d = id ? get<any>("SELECT id, name, onbase_ref FROM documents WHERE id=? AND kind='marca_logo'", id) : null;
  const buf = d ? readDocument(d) : null;
  if (!d || !buf) return new Response("Sin logo configurado", { status: 404, headers: { "Cache-Control": "no-store" } });
  const type = TYPES[path.extname(d.name).toLowerCase()] || "application/octet-stream";
  return new Response(buf as any, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // un SVG servido aparte no puede ejecutar scripts
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
