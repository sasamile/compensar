import { can, currentUser } from "@/lib/auth";
import { fileResponse, toXlsx, XLSX_TYPE } from "@/lib/xlsx";

/** Plantilla del archivo de validación masiva (FUN-77). */
export async function GET() {
  const u = await currentUser();
  if (!u || !can(u, "validation.manage")) return new Response("Sin acceso", { status: 403 });
  const cols = [{ header: "NIT (sin DV)", key: "nit", width: 16 }, { header: "Programa", key: "programa", width: 22 }, { header: "Razón social (opcional)", key: "razon", width: 32 }];
  const rows = [
    { nit: "900999000", programa: "Territorio MIPYME", razon: "Café Origen SAS" },
    { nit: "860777888", programa: "Territorio MIPYME", razon: "Ferretería El Tornillo" },
    { nit: "1020304050", programa: "Emprendimiento", razon: "Juan Emprendedor" },
  ];
  return fileResponse(await toXlsx("Validación", cols, rows), "plantilla-validacion-masiva.xlsx", XLSX_TYPE);
}
