import fs from "node:fs";
import { get } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readDocument } from "@/lib/onbase";
import { rowsOf } from "@/lib/datasets";

const INLINE = /^(application\/pdf|image\/(png|jpe?g|gif|webp))$/i;
const byExt: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

/**
 * Visualización del documento SIN salir de la plataforma (RF-SEG-01 / FUN-65): sirve el archivo «inline»
 * para PDF e imágenes, con los mismos permisos por rol y alcance del centro documental.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const id = Number((await params).id);
  const visible = rowsOf(u, "documentos", [{ col: "documento_id", op: "eq", value: String(id) }], {}, 1)[0];
  if (!visible) return new Response("Sin acceso", { status: 403 });
  const d = get<any>("SELECT * FROM documents WHERE id=?", id);
  const buf = readDocument(d);
  if (!buf) return new Response("El documento está en cola de envío a OnBase; intente más tarde.", { status: 202 });
  const ext = (d.name.split(".").pop() || "").toLowerCase();
  const mime = d.mime && INLINE.test(d.mime) ? d.mime : byExt[ext] || d.mime || "application/octet-stream";
  const inline = INLINE.test(mime) && !new URL(req.url).searchParams.get("descargar");
  await audit(u, inline ? "consultar_documento" : "descargar_documento", "document", id, null, { onbase_ref: d.onbase_ref });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(d.name)}"`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN" },
  });
}
