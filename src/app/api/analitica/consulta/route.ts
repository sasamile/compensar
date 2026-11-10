import { get } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runSpec, specFromParams } from "@/lib/datasets";
import { exportResponse, normFormat, savedSpec } from "@/lib/analytics";

/**
 * Exporta una consulta (ad hoc por parámetros, o guardada con ?id=) en Excel, CSV, JSON o PDF (FUN-100, TEC-93).
 * Sirve como botón «Exportar» genérico para cualquier tabla: /api/analitica/consulta?fuente=<conjunto>&format=csv
 * La seguridad a nivel de fila se aplica con el usuario de la sesión.
 */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  let name = "";
  let spec = specFromParams(sp);
  if (sp.get("id")) {
    const r = get<any>("SELECT * FROM saved_reports WHERE id=?", Number(sp.get("id")));
    if (!r || r.user_id !== u.id) return new Response("Consulta no disponible", { status: 404 });
    spec = savedSpec(r);
    name = r.name;
  }
  const res = runSpec(u, spec);
  if (!res.ok) return new Response(res.error, { status: res.error?.includes("permiso") ? 403 : 400 });
  const fmt = normFormat(sp.get("format") || sp.get("fmt"));
  const title = name || `${res.ds!.name}${spec.groupBy ? ` por ${res.cols[0].header.toLowerCase()}` : ""}`;
  await audit(u, "exportar_consulta", "dataset", spec.source, null, { fmt, filas: res.rows.length, saved: sp.get("id") || null });
  return exportResponse(fmt, { title, subtitle: res.ds!.description, cols: res.cols, rows: res.rows, filename: title, user: `${u.name} (${u.email})`, meta: res.notes, types: res.types });
}
