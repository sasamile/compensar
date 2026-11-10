/** Descarga de un archivo adjunto a una respuesta, con los permisos del formulario (equipo con alcance o dueño de la respuesta). */
import { get } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readDocument } from "@/lib/onbase";
import { canSeeResponse, getForm } from "@/app/(app)/formularios/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const f = getForm(Number((await params).id));
  const r = get<any>("SELECT * FROM form_responses WHERE id=? AND form_id=?", Number(sp.get("r")), f?.id ?? 0);
  if (!f || !r) return new Response("No existe", { status: 404 });
  if (!canSeeResponse(u, r, f)) return new Response("Sin acceso", { status: 403 });
  const docId = Number(sp.get("doc"));
  const referenced = Object.values(JSON.parse(r.answers || "{}")).some((v: any) => v && typeof v === "object" && Number(v.docId) === docId);
  if (!referenced) return new Response("El archivo no pertenece a esta respuesta", { status: 403 });
  const d = get<any>("SELECT * FROM documents WHERE id=?", docId);
  if (!d) return new Response("No existe", { status: 404 });
  const buf = readDocument(d);
  if (!buf) return new Response("Documento en cola de envío a OnBase", { status: 202 });
  await audit(u, "descargar_adjunto", "document", d.id, null, { response_id: r.id });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": d.mime || "application/octet-stream", "Content-Disposition": `attachment; filename="${encodeURIComponent(d.name)}"` } });
}
