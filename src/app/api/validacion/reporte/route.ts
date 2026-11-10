import { can, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { reportData } from "@/lib/validation";
import { fileResponse, toCsv, toXlsx, XLSX_TYPE } from "@/lib/xlsx";

/** FUN-96 / RF-ANA-04: exportación Excel/CSV de los reportes de validación y de seguimiento de empresas. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  if (!can(u, "validation.view") && !can(u, "validation.manage")) return new Response("Sin acceso", { status: 403 });
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { title, cols, rows } = reportData(u, q);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = (q.tipo === "seguimiento" ? "seguimiento-empresas" : "validacion-requisitos") + "-" + stamp;
  await audit(u, "exportar_reporte_validacion", "report", q.tipo || "validacion", null, { filtros: q, filas: rows.length });
  if (q.formato === "csv") return fileResponse(toCsv(cols, rows), base + ".csv", "text/csv; charset=utf-8");
  return fileResponse(await toXlsx(title, cols, rows), base + ".xlsx", XLSX_TYPE);
}
