import { all } from "@/lib/db";
import { can, currentUser } from "@/lib/auth";
import { fmtDate } from "@/lib/util";
import { fileResponse, toXlsx, XLSX_TYPE } from "@/lib/xlsx";
import { FEEDBACK_KINDS_PUBLIC } from "@/lib/feedback-kinds";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !can(u, "config.manage")) return new Response("Sin acceso", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const where = ["1=1"]; const p: any[] = [];
  if (sp.get("tipo")) { where.push("kind=?"); p.push(sp.get("tipo")); }
  if (sp.get("estado")) { where.push("status=?"); p.push(sp.get("estado")); }
  if (sp.get("q")) { where.push("(message LIKE ? OR page LIKE ? OR user_name LIKE ?)"); const q = `%${sp.get("q")}%`; p.push(q, q, q); }
  const rows = all<any>(`SELECT * FROM feedback WHERE ${where.join(" AND ")} ORDER BY id`, ...p)
    .map((r) => ({ ...r, fecha: fmtDate(r.created_at), tipo: FEEDBACK_KINDS_PUBLIC[r.kind] || r.kind }));
  const cols = [["Fecha", "fecha"], ["Persona", "user_name"], ["Correo", "user_email"], ["Rol", "roles"], ["Pantalla", "page"], ["Tipo", "tipo"], ["Calificación (1-5)", "rating"], ["Comentario", "message"], ["Estado", "status"], ["Nota interna", "note"]]
    .map(([header, key]) => ({ header, key, width: key === "message" ? 70 : 20 }));
  return fileResponse(await toXlsx("Retroalimentación", cols, rows), "retroalimentacion.xlsx", XLSX_TYPE);
}
