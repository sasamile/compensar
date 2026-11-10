import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { buildReport, canReport, parsePeriod } from "@/lib/reports";
import { exportResponse, normFormat } from "@/lib/analytics";
import { fmtDate } from "@/lib/util";
import { REPORTS } from "@/lib/perms";

/** Descarga de un reporte del catálogo (R-01..R-15) en Excel (por defecto), CSV, JSON o PDF (vista imprimible). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  const { id } = await params;
  if (!u) return new Response("No autenticado", { status: 401 });
  if (!canReport(u, id)) return new Response("Sin acceso", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const per = parsePeriod(sp.get("desde"), sp.get("hasta"));
  const t0 = Date.now();
  const rep = buildReport(id, u, per, Object.fromEntries(sp));
  if (!rep) return new Response("Reporte no existe", { status: 404 });
  const name = REPORTS.find((r) => r[0] === id)?.[1] ?? id;
  const fmt = normFormat(sp.get("fmt") || sp.get("format"));
  await audit(u, "descargar_reporte", "report", id, null, { fmt, filas: rep.rows.length, ms: Date.now() - t0 });
  return exportResponse(fmt, {
    title: `${id} · ${name}`, subtitle: `Periodo: ${fmtDate(per.from, false)} – ${fmtDate(per.to, false)}`, cols: rep.cols, rows: rep.rows,
    filename: `${id}-${name}`, user: `${u.name} (${u.email})`,
  });
}
