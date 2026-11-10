import { audit } from "@/lib/audit";
import { dataset, globalFromParams, rowsOf, type Global } from "@/lib/datasets";
import { toCsv } from "@/lib/xlsx";
import { now } from "@/lib/db";
import { biAuth } from "../_auth";

export const dynamic = "force-dynamic";

/**
 * Fuente de solo lectura para BI externo (Power BI / Tableau), TEC-94 / RF-ANA-05.
 * GET /api/bi/<conjunto>?format=json|csv&limit=50000&offset=0&programa=&aliado=&mentor=&evento=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 * Lee las vistas bi_* (incluye columnas id para relacionar tablas en el modelo de BI).
 */
export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const who = await biAuth(req);
  if ("error" in who) return Response.json({ error: who.error }, { status: who.status, headers: who.status === 401 ? { "WWW-Authenticate": 'Bearer realm="bi"' } : {} });
  const key = (await params).dataset.replace(/\.(csv|json)$/i, "");
  const ds = dataset(key);
  if (!ds) return Response.json({ error: "Conjunto de datos no existe. Consulte /api/bi" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const ext = (await params).dataset.match(/\.(csv|json)$/i)?.[1]?.toLowerCase();
  const format = (sp.get("format") || ext || "json").toLowerCase() === "csv" ? "csv" : "json";
  const limit = Math.min(200000, Math.max(1, Number(sp.get("limit")) || 50000));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  let g: Global = globalFromParams(sp);
  let rows: any[];
  if (who.kind === "token") {
    if (ds.bi === false) return Response.json({ error: "Conjunto no publicado para BI" }, { status: 403 });
    g = { ...g, ...(who.forced.program ? { program: who.forced.program } : {}), ...(who.forced.aliado ? { aliado: who.forced.aliado } : {}) };
    rows = rowsOf("system", key, [], g, limit, offset);
  } else {
    if (!ds.allow(who.u)) return Response.json({ error: "Sin permiso para este conjunto" }, { status: 403 });
    rows = rowsOf(who.u, key, [], g, limit, offset);
  }
  await audit(who.kind === "user" ? who.u : { email: who.label }, "bi_lectura", "dataset", key, null, { format, filas: rows.length, offset, via: who.kind });
  const headers = { "Cache-Control": "no-store", "X-Total-Rows": String(rows.length) };
  if (format === "csv") {
    const cols = ds.cols.map((c) => ({ header: c.key, key: c.key }));
    return new Response(toCsv(cols, rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `inline; filename="${key}.csv"` } });
  }
  return Response.json({ conjunto: key, nombre: ds.name, generado: now(), filas: rows.length, offset, limit,
    columnas: ds.cols.map((c) => ({ clave: c.key, nombre: c.label, tipo: c.type })), value: rows }, { headers });
}
