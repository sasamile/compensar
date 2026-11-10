import { toXlsx, toCsv, fileResponse, XLSX_TYPE } from "@/lib/xlsx";
import { currentUser, can } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/jobs/plataforma";

export const dynamic = "force-dynamic";

/** Plantilla del cargue masivo de empresas en Excel, CSV o JSON (RF-INT-06): GET ?formato=xlsx|csv|json. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !can(u, "companies.activate")) return new Response("Sin acceso", { status: 403 });
  const formato = new URL(req.url).searchParams.get("formato") || "xlsx";
  if (formato === "json") {
    const example = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.json, c.example]));
    return fileResponse(JSON.stringify([example], null, 2) + "\n", "plantilla-cargue-empresas.json", "application/json; charset=utf-8");
  }
  const cols = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  const rows = [Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.example]))];
  if (formato === "csv") return fileResponse(toCsv(cols, rows), "plantilla-cargue-empresas.csv", "text/csv; charset=utf-8");
  return fileResponse(await toXlsx("Empresas", cols, rows), "plantilla-cargue-empresas.xlsx", XLSX_TYPE);
}
