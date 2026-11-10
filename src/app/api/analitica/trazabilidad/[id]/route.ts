import { get } from "@/lib/db";
import { can, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { TRACE_COLS, companyTrace, companyVisible, exportResponse, filterTrace, normFormat, traceRows } from "@/lib/analytics";

/** Exporta la trazabilidad de una empresa (o de un caso con ?caso=) en Excel, CSV, JSON o PDF (FUN-99 + FUN-100). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const cid = Number((await params).id);
  if (u.company_id || !companyVisible(u, cid)) return new Response("Sin acceso", { status: 403 });
  const url = new URL(req.url);
  const sp: any = Object.fromEntries(url.searchParams);
  sp.cat = url.searchParams.getAll("cat").join(",") || undefined;
  const c = get<any>("SELECT razon_social, nit, dv FROM companies WHERE id=?", cid);
  const items = filterTrace(companyTrace(cid, { audit: can(u, "audit.view") || can(u, "analytics.view") }), sp);
  const fmt = normFormat(sp.format || sp.fmt);
  await audit(u, "exportar_trazabilidad", "company", cid, null, { fmt, filas: items.length, caso: sp.caso || null });
  return exportResponse(fmt, {
    title: `Trazabilidad · ${c.razon_social}`, subtitle: `NIT ${c.nit}-${c.dv}${sp.caso ? ` · caso ${sp.caso}` : ""}`, cols: TRACE_COLS, rows: traceRows(items),
    filename: `trazabilidad-${c.razon_social}`, user: `${u.name} (${u.email})`,
  });
}
