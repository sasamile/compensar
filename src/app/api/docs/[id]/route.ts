import { get } from "@/lib/db";
import { can, canSeeCompany, currentUser, programScope } from "@/lib/auth";
import { readDocument } from "@/lib/onbase";
import { logError } from "@/lib/resilience";

/** Descarga de documentos: control de acceso por alcance + descifrado AES-256-GCM (TEC-58). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const d = get<any>("SELECT * FROM documents WHERE id=?", Number((await params).id));
  if (!d) return new Response("No existe", { status: 404 });
  if (!mayDownload(u, d)) return new Response("Sin acceso", { status: 403 });
  let buf: Buffer | null = null;
  try { buf = readDocument(d); } catch (e) {
    const trace = logError("api/docs", e, u.id);
    return new Response(`No fue posible descifrar el documento (traza ${trace})`, { status: 500 });
  }
  if (!buf) return new Response("Documento en cola de envío a OnBase", { status: 202 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": d.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(d.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Alcance: empresa visible, o documents.view en su alcance (organización o programa de la empresa). */
function mayDownload(u: any, d: any): boolean {
  if (d.company_id) {
    if (canSeeCompany(u, d.company_id)) return true;
    if (!can(u, "documents.view")) return false;
    const scope = programScope(u, "documents.view");
    if (scope === null) return true;
    const c = get<any>("SELECT program_id FROM companies WHERE id=?", d.company_id);
    return !!c && scope.includes(c.program_id);
  }
  return ["events.manage", "attendance.manage", "documents.view", "library.view"].some((p) => can(u, p));
}
