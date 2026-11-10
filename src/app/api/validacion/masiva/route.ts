import ExcelJS from "exceljs";
import { can, currentUser } from "@/lib/auth";
import { bulkValidate, type BulkMode } from "@/lib/validation";
import { fileResponse, toXlsx, XLSX_TYPE } from "@/lib/xlsx";

const MAX_ROWS = 3000;
const plain = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * FUN-77: POST multipart (file=.xlsx, modo=validar|aprobar|aprobar_rechazar).
 * Devuelve el Excel de resultado fila por fila (o JSON con ?formato=json, que incluye el Excel en base64).
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  if (!can(u, "validation.manage")) return new Response("Sin acceso", { status: 403 });
  const json = new URL(req.url).searchParams.get("formato") === "json";
  const fail = (msg: string, status = 400) => (json ? Response.json({ ok: false, error: msg }, { status }) : new Response(msg, { status }));
  const fd = await req.formData();
  const f = fd.get("file") as File | null;
  if (!f || typeof f !== "object" || !f.size) return fail("Selecciona un archivo .xlsx");
  if (!/\.xlsx$/i.test(f.name)) return fail("El archivo debe ser Excel (.xlsx)");
  const mode = (["validar", "aprobar", "aprobar_rechazar"].includes(String(fd.get("modo"))) ? String(fd.get("modo")) : "validar") as BulkMode;
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await f.arrayBuffer()) as any); } catch { return fail("El archivo no es un Excel (.xlsx) válido"); }
  const ws = wb.worksheets[0];
  if (!ws) return fail("El archivo no tiene hojas");
  const val = (r: ExcelJS.Row, c: number) => { if (!c) return ""; const v: any = r.getCell(c).value; return String(v?.text ?? v?.result ?? v ?? "").trim(); };
  const head = ws.getRow(1);
  const col = (re: RegExp, def: number) => { let idx = 0; head.eachCell((cell, n) => { if (!idx && re.test(plain(String((cell.value as any)?.text ?? cell.value ?? "")))) idx = n; }); return idx || def; };
  const cNit = col(/^nit/, 1), cProg = col(/program/, 2), cRaz = col(/razon|nombre/, 0);
  const rows: { nit: string; programa: string; razon?: string }[] = [];
  ws.eachRow((r, n) => { if (n === 1) return; const x = { nit: val(r, cNit), programa: val(r, cProg), razon: val(r, cRaz) }; if (x.nit || x.programa) rows.push(x); });
  if (!rows.length) return fail("El archivo no tiene filas de datos (la fila 1 es el encabezado)");
  if (rows.length > MAX_ROWS) return fail(`El archivo supera el máximo de ${MAX_ROWS} filas`);
  const { rows: out, summary } = await bulkValidate(u, rows, mode);
  const cols = [
    { header: "Fila", key: "fila", width: 8 }, { header: "NIT", key: "nit", width: 14 }, { header: "Programa", key: "programa", width: 20 },
    { header: "Razón social", key: "razon_social", width: 30 }, { header: "Resultado", key: "resultado", width: 14 },
    { header: "Motivo", key: "motivo", width: 70 }, { header: "Empresa en la plataforma", key: "empresa", width: 24 }, { header: "Acción aplicada", key: "accion", width: 40 },
  ];
  const buf = await toXlsx("Resultado validación", cols, out);
  const name = `resultado-validacion-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (json) return Response.json({ ok: true, summary, rows: out, file: buf.toString("base64"), name });
  return fileResponse(buf, name, XLSX_TYPE);
}
