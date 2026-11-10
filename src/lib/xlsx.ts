import ExcelJS from "exceljs";

export type Col = { header: string; key: string; width?: number };

export async function toXlsx(sheet: string, cols: Col[], rows: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.slice(0, 30));
  ws.columns = cols.map((c) => ({ ...c, width: c.width || Math.max(14, c.header.length + 4) }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A6CFF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCsv(cols: Col[], rows: any[]): string {
  const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [cols.map((c) => esc(c.header)).join(","), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(","))].join("\n");
}

export const fileResponse = (buf: Buffer | string, name: string, type: string) =>
  new Response(buf as any, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"` } });
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
