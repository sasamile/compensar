import { get } from "@/lib/db";
import { can, currentUser } from "@/lib/auth";
import { fileResponse, toCsv, toXlsx, XLSX_TYPE } from "@/lib/xlsx";
import { jparse } from "@/lib/util";

export const dynamic = "force-dynamic";

/** Errores por fila de un cargue propio (RF-INT-06), en Excel o CSV. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !can(u, "companies.activate")) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const j = get<any>("SELECT id, filename, errors FROM import_jobs WHERE id=? AND kind='empresas' AND created_by=?", Number(id), u.id);
  if (!j) return new Response("No encontrado", { status: 404 });
  const rows = jparse<{ row: number; msg: string }[]>(j.errors, []).map((e) => ({ fila: e.row || "Archivo", error: e.msg }));
  const cols = [{ header: "Fila", key: "fila", width: 10 }, { header: "Error", key: "error", width: 100 }];
  const base = `errores-cargue-${j.id}`;
  if (new URL(req.url).searchParams.get("formato") === "csv") return fileResponse(toCsv(cols, rows), `${base}.csv`, "text/csv; charset=utf-8");
  return fileResponse(await toXlsx("Errores", cols, rows), `${base}.xlsx`, XLSX_TYPE);
}
