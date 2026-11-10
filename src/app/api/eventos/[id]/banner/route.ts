import { get } from "@/lib/db";
import { can, canInProgram, currentUser } from "@/lib/auth";
import { readDocument } from "@/lib/onbase";
import { logError } from "@/lib/resilience";

/**
 * Banner del evento subido como archivo (RF-CON-06). Público SOLO si el evento está publicado y activo
 * (las imágenes ya pasaron el antivirus al subirse). Para revisar un borrador, el gestor del programa
 * también puede verlo con su sesión (sin caché compartida).
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ev = get<any>("SELECT id, program_id, status, active, banner_doc_id FROM events WHERE id=?", Number((await params).id));
  if (!ev?.banner_doc_id) return new Response("No encontrado", { status: 404 });
  const isPublic = ev.status === "publicado" && ev.active;
  if (!isPublic) {
    const u = await currentUser();
    const staff = u && (canInProgram(u, "events.manage", ev.program_id) || canInProgram(u, "attendance.manage", ev.program_id) || can(u, "registrations.view"));
    if (!staff) return new Response("No encontrado", { status: 404 }); // no revela si existe
  }
  const d = get<any>("SELECT * FROM documents WHERE id=? AND kind='banner'", ev.banner_doc_id);
  if (!d) return new Response("No encontrado", { status: 404 });
  let buf: Buffer | null = null;
  try { buf = readDocument(d); } catch (e) { logError("api/eventos/banner", e); }
  if (!buf) return new Response("Imagen no disponible", { status: 404 });
  const type = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "";
  if (!type) return new Response("Formato no permitido", { status: 415 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Cache-Control": isPublic ? "public, max-age=300" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
