import { all } from "@/lib/db";
import { apiRoute } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auditoria — exportación para SIEM (TEC-75): JSON Lines (application/x-ndjson) por defecto.
 * Parámetros: desde (ISO, por defecto últimas 24 h), hasta, desde_id (cursor incremental), accion, entidad,
 * limite (máx. 5000), formato=jsonl|json. La cabecera X-Next-Cursor trae el último id para la siguiente lectura.
 */
export const GET = apiRoute("auditoria.read", (req) => {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const w: string[] = [], p: any[] = [];
  const cursor = Number(sp.get("desde_id") || 0);
  if (cursor) { w.push("id>?"); p.push(cursor); }
  else { w.push("ts>=?"); p.push(sp.get("desde") || new Date(Date.now() - 86400000).toISOString()); }
  if (sp.get("hasta")) { w.push("ts<=?"); p.push(sp.get("hasta")); }
  if (sp.get("accion")) { w.push("action=?"); p.push(sp.get("accion")); }
  if (sp.get("entidad")) { w.push("entity=?"); p.push(sp.get("entidad")); }
  const limit = Math.min(5000, Math.max(1, Number(sp.get("limite") || 1000) || 1000));
  const rows = all<any>(`SELECT id, ts, user_id, user_email, action, entity, entity_id, before, after, ip, ua FROM audit_log WHERE ${w.join(" AND ")} ORDER BY id LIMIT ?`, ...p, limit)
    .map((r) => ({ ...r, before: r.before ? safe(r.before) : null, after: r.after ? safe(r.after) : null, source: "fomento-empresarial", schema: "audit.v1" }));
  const last = rows.length ? rows[rows.length - 1].id : cursor || 0;
  const headers = { "Cache-Control": "no-store", "X-Next-Cursor": String(last), "X-Count": String(rows.length) };
  if (sp.get("formato") === "json") return Response.json({ data: rows, meta: { count: rows.length, next_cursor: last } }, { headers });
  return new Response(rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" } });
});
const safe = (s: string) => { try { return JSON.parse(s); } catch { return s; } };
