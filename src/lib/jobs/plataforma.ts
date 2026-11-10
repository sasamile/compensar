import crypto from "node:crypto";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Job } from "./types";
import { all, get, insert, now, run, setting, tx } from "../db";
import { canInProgram, hashPasswordAsync, loadUser, type User } from "../auth";
import { audit } from "../audit";
import { notify } from "../notify";
import { jparse, nitDv, validNit } from "../util";

/**
 * Importación de empresas (RF-EMP-01, RF-EMP-03, RF-INT-06, RNF-REN-07, Anexo 05 #118).
 *  - Formatos: Excel (.xlsx), CSV (coma o punto y coma, UTF-8) y JSON (arreglo de objetos o {"empresas": [...]}).
 *  - Misma validación fila por fila para los tres formatos y todo-o-nada: si una fila falla no se guarda ninguna.
 *  - Origen del cargue (companies.source): cargue directo, Propulsor Empresarial, Universidad-Empresa, DEI u otro.
 *  - Un correo que ya es usuario de EMPRESA se vincula como contacto de la nueva empresa (company_contacts);
 *    un correo de un usuario interno o de aliado se rechaza.
 *  - Más de BACKGROUND_THRESHOLD filas: se encola en import_jobs y lo procesa el job `cargue_empresas`,
 *    que avisa al usuario al terminar (notificación + correo, plantilla `cargue_terminado`).
 * Cada cargue (inmediato o en segundo plano) queda en import_jobs con su resultado y errores por fila.
 */

export const BACKGROUND_THRESHOLD = 50;
export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const IMPORT_FORMATS = [".xlsx", ".csv", ".json"];

export const SOURCES: [string, string][] = [
  ["cargue_masivo", "Cargue directo"],
  ["propulsor_empresarial", "Propulsor Empresarial"],
  ["universidad_empresa", "Universidad-Empresa"],
  ["dei", "DEI"],
  ["otro", "Otro"],
];
const LEGACY_SOURCES: Record<string, string> = { cargue: "Cargue (demo)", manual: "Creación individual", autorregistro: "Autorregistro" };
export function sourceLabel(src?: string | null) {
  if (!src) return "—";
  if (src.startsWith("otro:")) return `Otro: ${src.slice(5)}`;
  return SOURCES.find(([k]) => k === src)?.[1] ?? LEGACY_SOURCES[src] ?? src;
}

/** Columnas de la plantilla (mismo orden en Excel/CSV; mismas claves en JSON). */
export const IMPORT_COLUMNS: { key: keyof RowData; header: string; json: string; aliases: string[]; example: string }[] = [
  { key: "nit", header: "NIT (sin DV)", json: "nit", aliases: ["nit", "nitsindv", "numeronit"], example: "900555777" },
  { key: "dv", header: "DV", json: "dv", aliases: ["dv", "digitoverificacion", "digitodeverificacion"], example: "" },
  { key: "razon", header: "Razón social", json: "razon_social", aliases: ["razonsocial", "razon", "empresa", "nombreempresa"], example: "Empresa Ejemplo SAS" },
  { key: "sector", header: "Sector", json: "sector", aliases: ["sector", "sectoreconomico"], example: "Comercio" },
  { key: "size", header: "Tamaño", json: "tamano", aliases: ["tamano", "tamanio", "size"], example: "Micro" },
  { key: "city", header: "Ciudad", json: "ciudad", aliases: ["ciudad", "municipio", "city"], example: "Bogotá" },
  { key: "program", header: "Programa", json: "programa", aliases: ["programa", "program"], example: "Territorio MIPYME" },
  { key: "rep", header: "Representante", json: "representante", aliases: ["representante", "nombrerepresentante", "contacto"], example: "Juan Pérez" },
  { key: "email", header: "Correo representante", json: "correo", aliases: ["correorepresentante", "correo", "email", "correoelectronico"], example: "juan@ejemplo.co" },
  { key: "phone", header: "Celular", json: "celular", aliases: ["celular", "telefono", "movil", "phone"], example: "3001112233" },
];
IMPORT_COLUMNS[1].example = nitDv(IMPORT_COLUMNS[0].example);

type RowData = { nit: string; dv: string; razon: string; sector: string; size: string; city: string; program: string; rep: string; email: string; phone: string };
export type ImportRow = RowData & { row: number };
export type RowError = { row: number; msg: string };
export type ImportOptions = { activate: boolean; source: string };

const norm = (s: any) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldOf = (header: any) => { const h = norm(header); return IMPORT_COLUMNS.find((c) => c.aliases.includes(h))?.key ?? null; };
const str = (v: any) => String(v ?? "").trim();

function toRow(values: Partial<Record<keyof RowData, any>>, row: number): ImportRow | null {
  const r: ImportRow = { row, nit: "", dv: "", razon: "", sector: "", size: "", city: "", program: "", rep: "", email: "", phone: "" };
  for (const c of IMPORT_COLUMNS) (r as any)[c.key] = str(values[c.key]).slice(0, 300);
  r.nit = r.nit.replace(/\D/g, "");
  r.email = r.email.toLowerCase();
  return IMPORT_COLUMNS.some((c) => (r as any)[c.key]) ? r : null; // las filas vacías se ignoran
}

/** Asigna columnas por encabezado; si el archivo no trae encabezados reconocibles usa el orden de la plantilla. */
function mapTable(table: any[][], firstRow = 1): ImportRow[] {
  if (!table.length) return [];
  const header = table[0].map(fieldOf);
  const known = header.filter(Boolean).length;
  const cols: (keyof RowData | null)[] = known >= 3 ? header : IMPORT_COLUMNS.map((c) => c.key);
  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const v: any = {};
    cols.forEach((k, j) => { if (k && v[k] === undefined) v[k] = cells[j]; });
    const r = toRow(v, firstRow + i + 1);
    if (r) rows.push(r);
  });
  return rows;
}

/** CSV (RFC 4180): comillas dobles, separador coma o punto y coma (detectado en la primera línea), BOM UTF-8. */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const count = (ch: string) => first.split("").reduce((n, c, i, a) => n + (c === ch && a.slice(0, i).filter((x) => x === '"').length % 2 === 0 ? 1 : 0), 0);
  const sep = count(";") > count(",") ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Lee el archivo según su formato. `error` = problema del archivo completo (fila 0). */
export async function parseCompanyFile(name: string, buf: Buffer): Promise<{ format: string; rows: ImportRow[]; error?: string }> {
  const ext = path.extname(name || "").toLowerCase();
  const format = ext.slice(1);
  if (!IMPORT_FORMATS.includes(ext)) return { format, rows: [], error: `Formato no admitido (${ext || "sin extensión"}). Usa Excel (.xlsx), CSV (.csv) o JSON (.json)` };
  if (buf.length > MAX_FILE_BYTES) return { format, rows: [], error: "El archivo supera el máximo de 10 MB" };
  try {
    if (ext === ".xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const ws = wb.worksheets[0];
      if (!ws) return { format, rows: [], error: "El libro de Excel no tiene hojas" };
      const cell = (v: any) => (v && typeof v === "object" ? v.text ?? v.result ?? (v.richText ? v.richText.map((t: any) => t.text).join("") : v.hyperlink ?? "") : v);
      const table: any[][] = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => { const vals: any[] = []; for (let c = 1; c <= Math.max(r.cellCount, IMPORT_COLUMNS.length); c++) vals.push(cell(r.getCell(c).value)); table[n - 1] = vals; });
      for (let i = 0; i < table.length; i++) table[i] ??= [];
      return { format, rows: mapTable(table) };
    }
    if (ext === ".csv") return { format, rows: mapTable(parseCsv(buf.toString("utf8"))) };
    const j = JSON.parse(buf.toString("utf8").replace(/^﻿/, ""));
    const list = Array.isArray(j) ? j : Array.isArray(j?.empresas) ? j.empresas : null;
    if (!list) return { format, rows: [], error: "El JSON debe ser un arreglo de empresas o un objeto con la propiedad «empresas»" };
    const rows: ImportRow[] = [];
    list.forEach((o: any, i: number) => {
      if (!o || typeof o !== "object" || Array.isArray(o)) { rows.push({ row: i + 1, nit: "", dv: "", razon: "", sector: "", size: "", city: "", program: "", rep: "", email: "", phone: "" }); return; }
      const v: any = {};
      for (const [k, x] of Object.entries(o)) { const f = fieldOf(k); if (f && v[f] === undefined) v[f] = x; }
      const r = toRow(v, i + 1);
      if (r) rows.push(r);
    });
    return { format, rows };
  } catch {
    return { format, rows: [], error: ext === ".xlsx" ? "El archivo no es un Excel (.xlsx) válido" : ext === ".csv" ? "No se pudo leer el CSV (usa UTF-8)" : "El archivo no es un JSON válido" };
  }
}

/** Validación fila por fila (la misma para los tres formatos y para el proceso en segundo plano). */
export function validateCompanyRows(rows: ImportRow[], actor: User, opts: ImportOptions) {
  const errors: RowError[] = [];
  const programs = all<any>("SELECT id,name,status FROM programs");
  if (!SOURCES.some(([k]) => k === opts.source || opts.source.startsWith("otro:"))) errors.push({ row: 0, msg: "Selecciona el origen del cargue" });
  if (rows.length > MAX_ROWS) errors.push({ row: 0, msg: `El archivo tiene ${rows.length} filas; el máximo por cargue es ${MAX_ROWS}` });
  const seen = new Set<string>();
  for (const r of rows) {
    const e = (m: string) => errors.push({ row: r.row, msg: m });
    if (!r.razon || !r.nit || !r.dv || !r.email || !r.rep) { e("Faltan campos obligatorios (NIT, DV, razón social, representante, correo)"); continue; }
    if (!validNit(r.nit, r.dv)) { e(`NIT ${r.nit}-${r.dv} inválido: el dígito de verificación correcto es ${nitDv(r.nit)}`); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) { e("Correo inválido"); continue; }
    if (r.phone && !/^\+?\d{7,15}$/.test(r.phone.replace(/[\s-]/g, ""))) { e("Celular inválido (solo números, 7 a 15 dígitos)"); continue; }
    const prog = programs.find((p) => p.name.toLowerCase() === r.program.toLowerCase());
    if (!prog) { e(`Programa «${r.program || "(vacío)"}» no existe`); continue; }
    if (!canInProgram(actor, "companies.activate", prog.id)) { e(`No tienes permiso para cargar empresas en el programa ${prog.name}`); continue; }
    const key = r.nit + "|" + prog.id;
    if (seen.has(key)) { e("NIT duplicado dentro del archivo"); continue; }
    if (seen.has(r.nit)) { e("Este NIT aparece en otra fila del archivo con otro programa: carga cada NIT una sola vez"); continue; }
    seen.add(key); seen.add(r.nit);
    if (get("SELECT 1 FROM companies WHERE nit=? AND program_id=?", r.nit, prog.id)) { e("Este NIT ya está en este programa (no se vuelve a cargar)"); continue; }
    const other = get<any>("SELECT p.name FROM companies c JOIN programs p ON p.id=c.program_id WHERE c.nit=?", r.nit);
    if (other) { e(`Este NIT ya existe en la organización (programa ${other.name}). Vincúlalo al programa desde su ficha en lugar de cargarlo`); continue; }
    const ex = get<any>("SELECT id, internal, company_id, status FROM users WHERE email=?", r.email);
    const contactErr = ex ? contactProblem(ex) : null;
    if (contactErr) { e(contactErr); continue; }
  }
  return { errors, programs };
}

/** RF-EMP-03: ¿puede un usuario existente quedar como contacto de otra empresa? null = sí. */
export function contactProblem(u: { id: number; internal: number; company_id: number | null; status: string }): string | null {
  const isCompanyUser = !!u.company_id || !!get("SELECT 1 FROM company_contacts WHERE user_id=?", u.id);
  if (u.internal || !isCompanyUser) return "El correo pertenece a un usuario interno o de un aliado de la organización; un contacto de empresa debe usar otro correo";
  if (u.status === "inactivo" || u.status === "bloqueado") return "El correo pertenece a un usuario inactivo; reactívalo antes de vincularlo a otra empresa";
  return null;
}

/** Vincula un usuario existente de empresa como contacto (y rol) de otra empresa. Debe correr dentro de tx(). */
export function linkContact(companyId: number, userId: number, role: "representante" | "colaborador", byId: number | null) {
  run("INSERT OR IGNORE INTO company_contacts(company_id,user_id,role,created_by,created_at) VALUES(?,?,?,?,?)", companyId, userId, role, byId, now());
  const roleId = get<any>("SELECT id FROM roles WHERE key=?", role === "representante" ? "empresa" : "colaborador")?.id;
  if (roleId && !get("SELECT 1 FROM user_roles WHERE user_id=? AND role_id=? AND scope_type='company' AND scope_id=?", userId, roleId, companyId))
    insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,granted_by,created_at) VALUES(?,?,?,?,?,?)", userId, roleId, "company", companyId, byId, now());
}

const tempPw = () => "Tmp-" + crypto.randomBytes(4).toString("hex") + "9A";

export type ImportOutcome = {
  ok: boolean; errors: RowError[]; created: number; linked: number;
  creds: { email: string; pw: string }[]; linkedEmails: string[];
};

/**
 * Valida y, si todo está bien, crea las empresas en una sola transacción (todo o nada).
 * Después de confirmar: auditoría por empresa e invitaciones (nuevos) o aviso de vinculación (contactos existentes).
 */
export async function importCompanyRows(rows: ImportRow[], actor: User, opts: ImportOptions): Promise<ImportOutcome> {
  const fail = (errors: RowError[]): ImportOutcome => ({ ok: false, errors, created: 0, linked: 0, creds: [], linkedEmails: [] });
  if (!rows.length) return fail([{ row: 0, msg: "El archivo no tiene filas de datos" }]);
  const { errors, programs } = validateCompanyRows(rows, actor, opts);
  if (errors.length) return fail(errors); // no se guarda nada a medias
  // claves temporales calculadas antes de la transacción y sin bloquear el proceso
  const newEmails = [...new Set(rows.map((r) => r.email))].filter((e) => !get("SELECT 1 FROM users WHERE email=?", e));
  const pw: Record<string, { pw: string; hash: string }> = {};
  for (let i = 0; i < newEmails.length; i += 16) // en lotes: usa los hilos de libuv sin bloquear el servidor
    await Promise.all(newEmails.slice(i, i + 16).map(async (e) => { const p = tempPw(); pw[e] = { pw: p, hash: await hashPasswordAsync(p) }; }));
  const empresaRole = get<any>("SELECT id FROM roles WHERE key='empresa'");
  const ts = now();
  type Done = { cid: number; uid: number; r: ImportRow; prog: any; linked: boolean };
  let done: Done[];
  try {
    done = tx(() => {
      const createdUsers: Record<string, number> = {};
      return rows.map((r) => {
        const prog = programs.find((p) => p.name.toLowerCase() === r.program.toLowerCase());
        const cid = insert("INSERT INTO companies(razon_social,nit,dv,sector,size,city,program_id,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          r.razon, r.nit, r.dv, r.sector, r.size, r.city, prog.id, opts.activate ? "activa" : "pendiente", opts.source, ts);
        const existing = createdUsers[r.email] ?? get<any>("SELECT id FROM users WHERE email=?", r.email)?.id;
        if (existing) { linkContact(cid, existing, "representante", actor.id); return { cid, uid: existing, r, prog, linked: !createdUsers[r.email] }; }
        const uid = insert(`INSERT INTO users(email,name,phone,password_hash,status,internal,must_change_password,temp_expires_at,invited_at,company_id,is_principal,created_at)
          VALUES(?,?,?,?,?,0,1,?,?,?,1,?)`, r.email, r.rep, r.phone, pw[r.email].hash, "invitado", new Date(Date.now() + 3 * 86400000).toISOString(), ts, cid, ts);
        insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,granted_by,created_at) VALUES(?,?,?,?,?,?)", uid, empresaRole.id, "company", cid, actor.id, ts);
        run("INSERT OR IGNORE INTO company_contacts(company_id,user_id,role,created_by,created_at) VALUES(?,?,?,?,?)", cid, uid, "representante", actor.id, ts);
        createdUsers[r.email] = uid;
        return { cid, uid, r, prog, linked: false };
      });
    });
  } catch (e: any) {
    return fail([{ row: 0, msg: "No se guardó nada: " + String(e?.message || e).slice(0, 200) }]);
  }
  const invited = new Set<string>();
  for (const x of done) {
    await audit(actor, x.linked ? "crear_cargue_masivo_contacto_vinculado" : "crear_cargue_masivo", "company", x.cid, null,
      { nit: x.r.nit, razon_social: x.r.razon, estado: opts.activate ? "activa" : "pendiente", origen: opts.source, ...(x.linked ? { contacto_vinculado: x.uid } : {}) });
    if (x.linked) notify({ key: "vinculacion_empresa", vars: { name: x.r.rep, company: x.r.razon, program: x.prog.name }, email: x.r.email, phone: x.r.phone, userId: x.uid });
    else if (!invited.has(x.r.email)) { invited.add(x.r.email); notify({ key: "invitacion", vars: { name: x.r.rep, email: x.r.email, password: pw[x.r.email].pw }, email: x.r.email, phone: x.r.phone, userId: x.uid }); }
    else notify({ key: "vinculacion_empresa", vars: { name: x.r.rep, company: x.r.razon, program: x.prog.name }, email: x.r.email, phone: x.r.phone, userId: x.uid });
    if (opts.activate) notify({ key: "activacion", vars: { company: x.r.razon, program: x.prog.name }, email: x.r.email, phone: x.r.phone, userId: x.uid });
  }
  const linkedEmails = [...new Set(done.filter((x) => x.linked).map((x) => x.r.email))];
  return { ok: true, errors: [], created: done.length, linked: done.filter((x) => x.linked).length, creds: Object.entries(pw).map(([email, p]) => ({ email, pw: p.pw })), linkedEmails };
}

/* ---------------- cargues en segundo plano (RNF-REN-07) ---------------- */
export function createImportJob(actor: User, filename: string, format: string, rows: ImportRow[], opts: ImportOptions, pending: boolean): number {
  return insert(`INSERT INTO import_jobs(kind,filename,format,status,total,created_count,errors,options,payload,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    "empresas", filename.slice(0, 200), format, pending ? "pendiente" : "procesando", rows.length, 0, "[]", JSON.stringify(opts), pending ? JSON.stringify(rows) : null, actor.id, now());
}

export function finishImportJob(id: number, out: ImportOutcome, status?: string) {
  run("UPDATE import_jobs SET status=?, created_count=?, errors=?, options=json_set(COALESCE(options,'{}'),'$.linked',CAST(? AS INTEGER)), payload=NULL, finished_at=? WHERE id=?",
    status ?? (out.ok ? "ok" : "con_errores"), out.created, JSON.stringify(out.errors), out.linked, now(), id);
}

export function importResultText(out: ImportOutcome) {
  return out.ok
    ? `${out.created} empresa(s) creada(s)${out.linked ? `, ${out.linked} con un contacto existente vinculado` : ""}`
    : `no se guardó nada; ${out.errors.length} error(es) por corregir`;
}

/** Procesa un cargue pendiente (lo usa el job y la prueba). */
export async function processImportJob(id: number): Promise<string> {
  if (!run("UPDATE import_jobs SET status='procesando' WHERE id=? AND status='pendiente'", id).changes) return "ya tomado";
  const j = get<any>("SELECT * FROM import_jobs WHERE id=?", id);
  const actor = loadUser(j.created_by);
  let out: ImportOutcome;
  try {
    if (!actor) throw new Error("El usuario que hizo el cargue ya no existe");
    out = await importCompanyRows(jparse<ImportRow[]>(j.payload, []), actor, jparse<ImportOptions>(j.options, { activate: false, source: "cargue_masivo" }));
    finishImportJob(id, out);
  } catch (e: any) {
    out = { ok: false, errors: [{ row: 0, msg: "Falla técnica del proceso: " + String(e?.message || e).slice(0, 200) }], created: 0, linked: 0, creds: [], linkedEmails: [] };
    finishImportJob(id, out, "fallido");
  }
  if (actor) {
    const base = (process.env.APP_URL || setting("app_url", "")).replace(/\/$/, "");
    notify({
      key: "cargue_terminado", userId: actor.id, email: actor.email, phone: actor.phone, channels: ["correo"],
      vars: { name: actor.name, file: j.filename, total: j.total, result: importResultText(out), url: `${base}/empresas/cargue?job=${id}` },
    });
    await audit(actor, "cargue_masivo_terminado", "import_job", id, null, { estado: out.ok ? "ok" : "con_errores", creadas: out.created, errores: out.errors.length });
  }
  return `cargue ${id}: ${importResultText(out)}`;
}

export const jobs: Job[] = [
  {
    name: "cargue_empresas",
    everyMs: 5000,
    run: async () => {
      // un cargue que quedó «procesando» por una caída del proceso se reintenta (la transacción es todo o nada)
      run("UPDATE import_jobs SET status='pendiente' WHERE status='procesando' AND payload IS NOT NULL AND created_at<?", new Date(Date.now() - 30 * 60000).toISOString());
      const pending = all<any>("SELECT id FROM import_jobs WHERE status='pendiente' ORDER BY id LIMIT 3");
      if (!pending.length) return "sin cargues pendientes";
      const out: string[] = [];
      for (const p of pending) out.push(await processImportJob(p.id));
      return out.join(" · ");
    },
  },
];
