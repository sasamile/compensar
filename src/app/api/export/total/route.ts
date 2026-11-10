import ExcelJS from "exceljs";
import { all } from "@/lib/db";
import { currentUser, isAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { XLSX_TYPE } from "@/lib/xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/export/total?formato=xlsx|json — exportación TOTAL de la información en formatos abiertos (TEC-89, RNF-PRI-06).
 * Solo Administrador. Incluye todas las tablas (también auditoría y registros técnicos). Por seguridad se omiten
 * las credenciales (hashes de contraseña, secretos 2FA/API/webhooks, tokens), que no son información de negocio.
 * Los archivos adjuntos se descargan desde OnBase/almacenamiento (referencias en la tabla documents).
 */
const SECRET_COLS: Record<string, string[]> = {
  users: ["password_hash", "mfa_secret"], api_clients: ["secret_hash"], api_tokens: ["token"], webhooks: ["secret"],
  sessions: ["token"], session_meta: ["token"], auth_flows: ["id", "data"], otp_codes: ["code"], mfa_recovery_codes: ["code_hash"],
};
const SECRET_SETTINGS = ["mock_idp_jwk", "mock_idp_client_secret", "sso_client_secret"];
const OMIT = "[credencial omitida]";

function dump() {
  const tables = all<any>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name as string);
  return tables.map((name) => {
    const cols = all<any>(`PRAGMA table_info("${name.replace(/"/g, "")}")`).map((c) => c.name as string);
    const hide = SECRET_COLS[name] || [];
    const rows = all<any>(`SELECT * FROM "${name.replace(/"/g, "")}"`).map((r) => {
      for (const c of hide) if (r[c] != null) r[c] = OMIT;
      if (name === "settings" && SECRET_SETTINGS.includes(r.key) && r.value) r.value = OMIT;
      return r;
    });
    return { name, cols, rows };
  });
}

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  if (!isAdmin(u)) return new Response("Solo el Administrador puede descargar la exportación total", { status: 403 });
  const fmt = new URL(req.url).searchParams.get("formato") === "json" ? "json" : "xlsx";
  const data = dump();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const total = data.reduce((a, t) => a + t.rows.length, 0);
  await audit(u, "exportacion_total", "system", null, null, { formato: fmt, tablas: data.length, filas: total });
  const headers = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="fomento-exportacion-total-${stamp}.${ext}"`, "Cache-Control": "no-store" });
  if (fmt === "json") {
    const body = JSON.stringify({
      exportado_at: new Date().toISOString(), exportado_por: u.email, formato: "fomento-export.v1", nota: "Credenciales omitidas por seguridad.",
      tablas: Object.fromEntries(data.map((t) => [t.name, { columnas: t.cols, filas: t.rows }])),
    });
    return new Response(body, { headers: headers("application/json; charset=utf-8", "json") });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de Fomento Empresarial";
  const idx = wb.addWorksheet("_indice");
  idx.columns = [{ header: "Hoja", key: "h", width: 32 }, { header: "Tabla", key: "t", width: 32 }, { header: "Filas", key: "n", width: 10 }];
  const used = new Set<string>(["_indice"]);
  for (const t of data) {
    let sheet = t.name.slice(0, 31);
    for (let i = 2; used.has(sheet); i++) sheet = `${t.name.slice(0, 28)}_${i}`;
    used.add(sheet);
    idx.addRow({ h: sheet, t: t.name, n: t.rows.length });
    const ws = wb.addWorksheet(sheet);
    ws.columns = t.cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 2)) }));
    for (const r of t.rows) ws.addRow(Object.fromEntries(t.cols.map((c) => [c, typeof r[c] === "string" && r[c].length > 32000 ? r[c].slice(0, 32000) + "…" : r[c]])));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  idx.getRow(1).font = { bold: true };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buf), { headers: headers(XLSX_TYPE, "xlsx") });
}
