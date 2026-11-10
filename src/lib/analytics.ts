/**
 * Analítica (RF-ANA-01/05/06/07/08, TEC-92..97): exportación multi-formato, tablero analítico,
 * widgets de tableros configurables, trazabilidad de punta a punta e informe final por empresa.
 */
import { all, get, now, run, setting } from "./db";
import type { User } from "./auth";
import { fmtDate, jparse } from "./util";
import { fileResponse, toCsv, toXlsx, XLSX_TYPE, type Col } from "./xlsx";
import {
  aliadoLock, dataset, isOrgWide, programIds, runSpec, rowsOf, visibleCompanies, visibleSessions,
  type Agg, type Filter, type Global, type Result, type Spec,
} from "./datasets";

/* ===================== Exportación (FUN-100: Excel, CSV, JSON y PDF) ===================== */
export type Format = "xlsx" | "csv" | "json" | "pdf";
export const FORMATS: [Format, string][] = [["xlsx", "Excel"], ["csv", "CSV"], ["json", "JSON"], ["pdf", "PDF"]];
export const normFormat = (f?: string | null): Format => (f === "csv" || f === "json" || f === "pdf" ? f : f === "excel" ? "xlsx" : "xlsx");
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const safeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);

/** Vista imprimible con la marca (se guarda como PDF desde el diálogo de impresión del navegador). */
export function printableHtml(o: { title: string; subtitle?: string; cols: Col[]; rows: any[]; user?: string; meta?: string[]; autoprint?: boolean }) {
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff"), tagline = setting("brand_tagline", "Plataforma de Fomento Empresarial");
  const max = 5000, rows = o.rows.slice(0, max);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)} · ${esc(brand)}</title>
<style>
*{box-sizing:border-box}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14213d;margin:24px;font-size:12px}
header{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${color};padding-bottom:10px;margin-bottom:12px}
.logo{width:40px;height:40px;border-radius:10px;background:${color};color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px}
h1{font-size:18px;margin:0}.sub{color:#64748b;font-size:12px}.meta{color:#475569;font-size:11px;margin:4px 0 10px}
table{width:100%;border-collapse:collapse}th{background:${color};color:#fff;text-align:left;padding:5px 6px;font-size:11px}
td{border-bottom:1px solid #e2e8f0;padding:4px 6px;vertical-align:top;font-size:11px}tr:nth-child(even) td{background:#f8fafc}
.bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px}.bar button{background:${color};color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer}
footer{margin-top:14px;color:#94a3b8;font-size:10px}@media print{.bar{display:none}body{margin:10mm}thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimir / guardar como PDF</button></div>
<header><div class="logo">${esc(brand[0] || "C")}</div><div><div style="font-weight:600">${esc(brand)}</div><div class="sub">${esc(tagline)}</div></div></header>
<h1>${esc(o.title)}</h1>${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ""}
<div class="meta">Generado el ${esc(fmtDate(now()))}${o.user ? ` por ${esc(o.user)}` : ""} · ${o.rows.length} fila(s)${o.rows.length > max ? ` (se muestran ${max}; use Excel/CSV para el total)` : ""}${(o.meta || []).map((m) => ` · ${esc(m)}`).join("")}</div>
<table><thead><tr>${o.cols.map((c) => `<th>${esc(c.header)}</th>`).join("")}</tr></thead><tbody>
${rows.length ? rows.map((r) => `<tr>${o.cols.map((c) => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("\n") : `<tr><td colspan="${o.cols.length || 1}">Sin datos</td></tr>`}
</tbody></table>
<footer>Documento generado por la Plataforma de Fomento Empresarial. La información respeta el alcance del rol de quien la generó.</footer>
${o.autoprint !== false ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>` : ""}
</body></html>`;
}

export async function exportResponse(format: Format, o: { title: string; subtitle?: string; cols: Col[]; rows: any[]; filename: string; user?: string; meta?: string[]; types?: Record<string, string> }) {
  const base = safeName(o.filename);
  const dateKeys = o.types ? Object.keys(o.types).filter((k) => o.types![k] === "date") : [];
  if (format === "csv") return fileResponse(toCsv(o.cols, o.rows), `${base}.csv`, "text/csv; charset=utf-8");
  if (format === "json") {
    const body = JSON.stringify({ titulo: o.title, generado: now(), filas: o.rows.length, columnas: o.cols.map((c) => ({ clave: c.key, nombre: c.header })),
      datos: o.rows.map((r) => Object.fromEntries(o.cols.map((c) => [c.key, r[c.key] ?? null]))) }, null, 2);
    return fileResponse(body, `${base}.json`, "application/json; charset=utf-8");
  }
  if (format === "pdf")
    return new Response(printableHtml(dateKeys.length ? { ...o, rows: o.rows.map((r) => { const x = { ...r }; dateKeys.forEach((k) => { if (x[k]) x[k] = fmtDate(x[k]); }); return x; }) } : o), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename="${base}.html"` } });
  return fileResponse(await toXlsx(o.title, o.cols, o.rows.map((r) => Object.fromEntries(o.cols.map((c) => [c.key, r[c.key] ?? ""])))), `${base}.xlsx`, XLSX_TYPE);
}

/* ===================== Opciones de filtros según alcance (FUN-98) ===================== */
export function filterOptions(u: User) {
  const org = isOrgWide(u);
  const vc = visibleCompanies(u);
  const vs = visibleSessions(u);
  const progs = programIds(u);
  const programs = org ? all<any>("SELECT id,name FROM programs ORDER BY name")
    : all<any>(`SELECT id,name FROM programs WHERE id IN (${progs.map(() => "?").join(",") || "NULL"}) OR id IN (SELECT c.program_id FROM companies c WHERE ${vc.sql}) ORDER BY name`, ...progs, ...vc.params);
  const lock = aliadoLock(u);
  const aliados = org ? all<any>("SELECT id,name FROM aliados ORDER BY name")
    : lock ? all<any>(`SELECT id,name FROM aliados WHERE id IN (${lock.map(() => "?").join(",")}) ORDER BY name`, ...lock)
      : all<any>(`SELECT id,name FROM aliados WHERE id IN (SELECT r.aliado_id FROM referrals r WHERE r.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql}))${progs.length ? ` OR id IN (SELECT aliado_id FROM servicios WHERE program_id IN (${progs.map(() => "?").join(",")}))` : ""} ORDER BY name`, ...vc.params, ...progs);
  const mentors = org
    ? all<any>(`SELECT DISTINCT u.id, u.name FROM users u WHERE u.id IN (SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.key='mentor')
        OR u.id IN (SELECT mentor_id FROM mentoring_sessions) OR u.id IN (SELECT mentor_id FROM mentor_assignments) ORDER BY u.name`)
    : lock ? all<any>(`SELECT DISTINCT u.id, u.name FROM users u WHERE u.id IN (SELECT s.mentor_id FROM mentoring_sessions s WHERE ${vs.sql})
        OR u.id IN (SELECT r.mentor_id FROM referrals r WHERE r.aliado_id IN (${lock.map(() => "?").join(",")})) OR u.aliado_id IN (${lock.map(() => "?").join(",")}) ORDER BY u.name`, ...vs.params, ...lock, ...lock)
    : all<any>(`SELECT DISTINCT u.id, u.name FROM users u WHERE u.id IN (SELECT s.mentor_id FROM mentoring_sessions s WHERE ${vs.sql})
        OR u.id IN (SELECT ma.mentor_id FROM mentor_assignments ma WHERE ma.active=1 AND ma.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql}))
        OR u.id IN (SELECT r.mentor_id FROM referrals r WHERE r.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql})) ORDER BY u.name`, ...vs.params, ...vc.params, ...vc.params);
  const events = rowsOf(u, "eventos", [], {}, 300).map((e) => ({ id: e.event_id, name: `${e.evento}${e.fecha ? ` (${fmtDate(e.fecha, false)})` : ""}` }));
  return { programs, aliados, mentors, events, org, lock };
}

/* ===================== Ayudantes de agregación ===================== */
const okVal = (r: Result) => (r.ok ? Number(r.rows[0]?.value ?? 0) : null);
export function kpi(u: User, source: string, g: Global, filters: Filter[] = [], agg: Agg = "count", measure?: string) {
  return okVal(runSpec(u, { source, agg, measure, filters, global: g }));
}
export function series(u: User, source: string, groupBy: string, g: Global, filters: Filter[] = [], agg: Agg = "count", measure?: string, limit = 50) {
  const r = runSpec(u, { source, groupBy, agg, measure, filters, global: g, limit });
  return r.ok ? r.rows.map((x) => ({ label: String(x.label), value: Number(x.value) || 0 })) : null;
}
const F = (col: string, op: Filter["op"], value?: string | number): Filter => ({ col, op, value: value == null ? "" : String(value) });

/** Tablero analítico principal (/analitica). Cada cifra respeta la seguridad a nivel de fila. */
export function overview(u: User, g: Global) {
  const can = (k: string) => !!dataset(k)?.allow(u);
  const funnel = [
    { label: "Registradas", value: kpi(u, "empresas", g) ?? 0 },
    { label: "Activas", value: kpi(u, "empresas", g, [F("activa", "eq", 1)]) ?? 0 },
    { label: "Con mentor", value: kpi(u, "empresas", g, [F("con_mentor", "eq", 1)]) ?? 0 },
    { label: "Con servicio", value: kpi(u, "empresas", g, [F("con_servicio", "eq", 1)]) ?? 0 },
    { label: "Cerradas", value: kpi(u, "empresas", g, [F("cerrada", "eq", 1)]) ?? 0 },
  ];
  const realizadas = kpi(u, "sesiones", g, [F("estado", "eq", "realizada")]) ?? 0;
  const aceptadas = kpi(u, "sesiones", g, [F("estado", "eq", "realizada"), F("aceptada", "eq", 1)]) ?? 0;
  const horas = kpi(u, "sesiones", g, [F("estado", "eq", "realizada")], "sum", "horas") ?? 0;
  const sesEstado = series(u, "sesiones", "estado", g) ?? [];
  const mesProg = series(u, "sesiones", "mes", g, [F("estado", "ne", "cancelada")]) ?? [];
  const mesReal = series(u, "sesiones", "mes", g, [F("estado", "eq", "realizada")]) ?? [];
  const mesAcc = series(u, "sesiones", "mes", g, [F("aceptada", "eq", 1)]) ?? [];
  const insc = series(u, "inscripciones", "evento", g, [F("lista_espera", "eq", 0)], "count", undefined, 10) ?? [];
  const asis = series(u, "inscripciones", "evento", g, [F("asistio", "eq", 1)], "count", undefined, 50) ?? [];
  const attendance = insc.map((i) => ({ label: i.label, inscritos: i.value, asistentes: asis.find((a) => a.label === i.label)?.value ?? 0 }));
  const totInsc = insc.reduce((a, b) => a + b.value, 0), totAsis = attendance.reduce((a, b) => a + b.asistentes, 0);
  const remAliado = series(u, "remisiones", "aliado", g) ?? [];
  const sesAliado = series(u, "sesiones", "aliado", g, [F("estado", "eq", "realizada"), F("aliado", "notempty")]) ?? [];
  const impacto = rowsOf(u, "indicadores", [], g, 2000);
  const withBoth = impacto.filter((i) => i.linea_base != null && i.resultado != null);
  const meta = impacto.filter((i) => i.cumple_meta != null);
  const impactoPorIndicador = Object.values(withBoth.reduce((acc: any, i) => {
    const k = i.indicador || "(sin nombre)"; (acc[k] ??= { label: k, base: 0, res: 0, n: 0 }); acc[k].base += Number(i.linea_base); acc[k].res += Number(i.resultado); acc[k].n++; return acc;
  }, {})).map((x: any) => ({ label: x.label, base: x.base / x.n, res: x.res / x.n, n: x.n }));
  const diag = can("diagnosticos") ? { nivel: series(u, "diagnosticos", "nivel", g, [F("nivel", "notempty")]) ?? [], etapa: series(u, "diagnosticos", "etapa", g) ?? [], prom: kpi(u, "diagnosticos", g, [F("puntaje", "notempty")], "avg", "puntaje") } : null;
  const valid = can("validacion") ? { estado: series(u, "validacion", "estado", g) ?? [], dias: kpi(u, "validacion", g, [], "avg", "dias_en_tramite") } : null;
  const alertas = can("alertas") ? { severidad: series(u, "alertas", "severidad", g, [F("estado", "eq", "abierta")]) ?? [], regla: series(u, "alertas", "nombre_regla", g, [F("estado", "eq", "abierta")], "count", undefined, 8) ?? [] } : null;
  let nps: null | { score: number | null; respuestas: number; cat: { label: string; value: number }[]; satisf: number | null; comentarios: number } = null;
  if (can("encuestas")) {
    const cat = series(u, "encuestas", "categoria_nps", g, [F("nps", "notempty")]) ?? [];
    const n = cat.reduce((a, b) => a + b.value, 0);
    const p = cat.find((c) => c.label === "promotor")?.value ?? 0, d = cat.find((c) => c.label === "detractor")?.value ?? 0;
    nps = { score: n ? Math.round(((p - d) / n) * 100) : null, respuestas: n, cat, satisf: kpi(u, "encuestas", g, [F("satisfaccion", "notempty")], "avg", "satisfaccion"), comentarios: kpi(u, "encuestas", g, [F("comentario", "notempty")]) ?? 0 };
  }
  return {
    funnel, realizadas, aceptadas, horas, sesEstado, mesProg, mesReal, mesAcc, attendance, totInsc, totAsis, remAliado, sesAliado,
    impacto: { total: impacto.length, conResultado: withBoth.length, cumplen: meta.filter((i) => Number(i.cumple_meta) === 1).length, conMeta: meta.length, porIndicador: impactoPorIndicador, filas: impacto.slice(0, 12) },
    diag, valid, alertas, nps,
  };
}

/* ===================== Tableros configurables (FUN-97, TEC-96/97) ===================== */
export type WidgetType = "kpi" | "bar" | "hbar" | "donut" | "line" | "table";
export const WIDGET_TYPES: [WidgetType, string, string][] = [
  ["kpi", "Indicador (KPI)", "Una cifra: conteo, suma o promedio"],
  ["bar", "Barras verticales", "Comparar categorías o meses"],
  ["hbar", "Barras horizontales", "Rankings (aliados, mentores, servicios)"],
  ["donut", "Dona", "Distribución por estado o tipo"],
  ["line", "Línea (tendencia mensual)", "Evolución por mes"],
  ["table", "Tabla", "Detalle de registros con columnas elegidas"],
];
export type Widget = {
  id: string; type: WidgetType; title: string; source: string; agg?: Agg; measure?: string | null; groupBy?: string | null;
  filters?: Filter[]; columns?: string[]; limit?: number; span?: 1 | 2 | 3;
};
export function widgetSpec(w: Widget, g: Global): Spec {
  const groupBy = w.type === "kpi" || w.type === "table" ? null : w.type === "line" ? w.groupBy || "mes" : w.groupBy || null;
  return {
    source: w.source, filters: w.filters || [], global: g,
    ...(w.type === "table" ? { columns: w.columns || [], limit: Math.min(w.limit || 10, 200) } : { agg: w.agg || "count", measure: w.measure || null, groupBy, limit: w.limit || (w.type === "line" ? 36 : 12), order: w.type === "line" ? "label" : null }),
  };
}
export function widgetData(u: User, w: Widget, g: Global): Result {
  return runSpec(u, widgetSpec(w, g));
}
export const newWidgetId = () => Math.random().toString(36).slice(2, 10);

/* ===================== Trazabilidad de punta a punta (FUN-99) ===================== */
export const TRACE_CATS: [string, string][] = [
  ["vinculacion", "Vinculación"], ["validacion", "Validación"], ["diagnostico", "Diagnóstico"], ["rutas", "Rutas"], ["servicios", "Servicios y remisiones"],
  ["sesiones", "Sesiones y aceptaciones"], ["eventos", "Eventos y certificados"], ["documentos", "Documentos (OnBase)"], ["resultados", "Resultados y cierres"],
  ["encuestas", "Encuestas"], ["seguimiento", "Alertas y tareas"], ["auditoria", "Auditoría"],
];
export type TraceItem = { at: string; cat: string; title: string; detail?: string; who?: string; ip?: string; ref?: string; link?: string };

export function companyTrace(cid: number, o: { audit: boolean }): TraceItem[] {
  const t: TraceItem[] = [];
  const push = (x: TraceItem) => { if (x.at) t.push(x); };
  const name = (id: any) => (id ? get<any>("SELECT name FROM users WHERE id=?", id)?.name : undefined);
  const c = get<any>("SELECT c.*, p.name program FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", cid);
  if (!c) return t;
  push({ at: c.created_at, cat: "vinculacion", title: "Registro de la empresa", detail: `Programa ${c.program} · origen ${c.source || "—"} · estado actual ${c.status}` });
  if (c.consent_at) push({ at: c.consent_at, cat: "vinculacion", title: "Autorización de tratamiento de datos", detail: setting("consent_version") });
  for (const x of all<any>("SELECT * FROM users WHERE company_id=?", cid))
    push({ at: x.invited_at || x.created_at, cat: "vinculacion", title: `Usuario de la empresa: ${x.name}`, detail: `${x.is_principal ? "Representante" : "Colaborador"} · ${x.email} · ${x.status}` });
  for (const v of all<any>("SELECT * FROM validation_cases WHERE company_id=?", cid)) {
    const ref = `validacion:${v.id}`;
    push({ at: v.created_at, cat: "validacion", title: `Caso de validación #${v.id} creado`, detail: `Estado ${v.status}${v.assigned_to ? ` · asignado a ${name(v.assigned_to)}` : ""}`, ref });
    if (v.decided_at) push({ at: v.decided_at, cat: "validacion", title: `Decisión de validación: ${v.status}`, detail: v.reason || "", who: name(v.decided_by), ref });
    for (const ir of all<any>("SELECT * FROM info_requests WHERE case_id=?", v.id)) {
      push({ at: ir.created_at, cat: "validacion", title: "Solicitud de información", detail: ir.message, who: name(ir.created_by), ref });
      if (ir.answered_at) push({ at: ir.answered_at, cat: "validacion", title: "Respuesta a solicitud de información", detail: ir.response || "", ref });
    }
  }
  for (const d of all<any>("SELECT d.*, f.name form FROM diagnostics d LEFT JOIN forms f ON f.id=d.form_id WHERE d.company_id=?", cid)) {
    push({ at: d.created_at, cat: "diagnostico", title: `Diagnóstico ${d.stage} asignado`, detail: d.form || "", who: name(d.assigned_by) });
    if (d.completed_at) push({ at: d.completed_at, cat: "diagnostico", title: `Diagnóstico ${d.stage} completado`, detail: `Puntaje ${d.score ?? "—"} · nivel ${d.level ?? "—"}${d.segment ? ` · segmento ${d.segment}` : ""}` });
  }
  for (const r of all<any>("SELECT * FROM company_routes WHERE company_id=?", cid)) {
    push({ at: r.created_at, cat: "rutas", title: `Ruta «${r.name}» (${r.origin})`, detail: `Estado ${r.status}`, who: name(r.created_by) });
    if (r.approved_at) push({ at: r.approved_at, cat: "rutas", title: `Ruta «${r.name}» aprobada`, who: name(r.approved_by) });
    if (r.closed_at) push({ at: r.closed_at, cat: "rutas", title: `Ruta «${r.name}» cerrada`, detail: r.close_result || "" });
  }
  for (const i of all<any>("SELECT * FROM company_items WHERE company_id=?", cid))
    push({ at: i.created_at, cat: "rutas", title: `Asignación de ${i.kind}: ${i.label}`, detail: `Estado ${i.status}`, who: name(i.assigned_by) });
  for (const m of all<any>("SELECT * FROM mentor_assignments WHERE company_id=?", cid))
    push({ at: m.from_at, cat: "servicios", title: `Mentor asignado: ${name(m.mentor_id)}`, detail: m.active ? "Vigente" : `Hasta ${fmtDate(m.to_at, false)}`, who: name(m.assigned_by) });
  const refs = all<any>("SELECT r.*, sv.name service, a.name aliado FROM referrals r LEFT JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN aliados a ON a.id=r.aliado_id WHERE r.company_id=?", cid);
  for (const r of refs) {
    const ref = `remision:${r.id}`;
    push({ at: r.created_at, cat: "servicios", title: `Remisión #${r.id} a «${r.service}» (${r.aliado})`, detail: `Estado ${r.status}${r.mentor_id ? ` · mentor ${name(r.mentor_id)}` : ""}`, who: name(r.referred_by), ref });
    if (r.accepted_at) push({ at: r.accepted_at, cat: "servicios", title: `Remisión #${r.id} ${r.status === "rechazada" ? "rechazada" : "aceptada"} por el aliado`, who: name(r.accepted_by), ip: r.accepted_ip, ref });
    if (r.closed_at) push({ at: r.closed_at, cat: "servicios", title: `Remisión #${r.id} cerrada`, ref });
  }
  const sess = all<any>("SELECT * FROM mentoring_sessions WHERE company_id=?", cid);
  for (const s of sess) {
    const ref = s.referral_id ? `remision:${s.referral_id}` : undefined;
    push({ at: s.created_at || s.scheduled_at, cat: "sesiones", title: `Sesión «${s.title}» programada para ${fmtDate(s.scheduled_at)}`, detail: `${s.modality || ""} · estado ${s.status}${s.cancel_reason ? ` · motivo: ${s.cancel_reason}` : ""}`, who: name(s.created_by), ref, link: `/agenda/${s.id}` });
    if (s.status === "realizada") push({ at: s.scheduled_at, cat: "sesiones", title: `Sesión «${s.title}» realizada (${s.hours || 0} h)`, detail: s.topics ? `Temas: ${s.topics}` : "Sin seguimiento registrado", who: name(s.registered_by) || name(s.mentor_id), ref, link: `/agenda/${s.id}` });
    if (s.accepted_at) push({ at: s.accepted_at, cat: "sesiones", title: `Empresa aceptó la sesión «${s.title}»`, who: name(s.accepted_by), ip: s.accepted_ip, ref, link: `/agenda/${s.id}` });
  }
  for (const g of all<any>("SELECT g.*, e.title FROM registrations g JOIN events e ON e.id=g.event_id WHERE g.company_id=?", cid)) {
    push({ at: g.created_at, cat: "eventos", title: `Inscripción a «${g.title}»`, detail: `${g.name || ""} · estado ${g.status}${g.waitlist ? " · lista de espera" : ""}` });
    if (g.attended) push({ at: g.created_at, cat: "eventos", title: `Asistencia a «${g.title}»`, detail: `${g.minutes || 0} min · fuente ${g.attendance_source || "—"}` });
    const ce = get<any>("SELECT * FROM certificates WHERE registration_id=?", g.id);
    if (ce) push({ at: ce.issued_at, cat: "eventos", title: `Certificado emitido (${ce.code})`, detail: g.title, link: `/verificar/${ce.code}` });
  }
  const sessRef = new Map(sess.map((s) => [s.id, s.referral_id]));
  for (const d of all<any>("SELECT * FROM documents WHERE company_id=? OR session_id IN (SELECT id FROM mentoring_sessions WHERE company_id=?)", cid, cid)) {
    const rid = d.session_id ? sessRef.get(d.session_id) : null;
    push({ at: d.created_at, cat: "documentos", title: `Documento «${d.name}» (${d.kind || "—"})`, detail: `OnBase ${d.onbase_ref} · ${d.onbase_status}`, who: name(d.uploaded_by), ref: rid ? `remision:${rid}` : undefined, link: `/documentos?ver=${d.id}` });
    if (d.accepted_at) push({ at: d.accepted_at, cat: "documentos", title: `Documento «${d.name}» aceptado`, who: name(d.accepted_by), ip: d.accepted_ip, ref: rid ? `remision:${rid}` : undefined });
  }
  for (const i of all<any>("SELECT * FROM indicators WHERE company_id=?", cid)) {
    push({ at: i.updated_at, cat: "resultados", title: `Indicador «${i.name}»`, detail: `Línea base ${i.baseline ?? "—"} → resultado ${i.final ?? "—"} (meta ${i.goal ?? "—"})`, who: name(i.updated_by), ref: i.referral_id ? `remision:${i.referral_id}` : undefined });
    for (const v of all<any>("SELECT * FROM indicator_values WHERE indicator_id=?", i.id))
      push({ at: v.recorded_at, cat: "resultados", title: `Medición de «${i.name}»: ${v.value}`, detail: v.note || "", who: name(v.recorded_by), ref: i.referral_id ? `remision:${i.referral_id}` : undefined });
  }
  for (const cl of all<any>("SELECT * FROM closures WHERE company_id=?", cid)) {
    const ref = cl.referral_id ? `remision:${cl.referral_id}` : undefined;
    push({ at: cl.created_at, cat: "resultados", title: "Resultados consolidados", detail: cl.result, who: name(cl.created_by), ref });
    if (cl.approved_at) push({ at: cl.approved_at, cat: "resultados", title: "Cierre aprobado", who: name(cl.approved_by), ref });
  }
  for (const s of all<any>("SELECT * FROM surveys WHERE company_id=?", cid)) {
    const ref = s.referral_id ? `remision:${s.referral_id}` : undefined;
    push({ at: s.sent_at, cat: "encuestas", title: `Encuesta de ${s.kind} enviada`, ref });
    if (s.answered_at) push({ at: s.answered_at, cat: "encuestas", title: `Encuesta respondida: NPS ${s.nps ?? "—"}, satisfacción ${s.satisfaction ?? "—"}`, detail: s.comment || "", ref });
  }
  for (const a of all<any>("SELECT * FROM alerts WHERE company_id=?", cid)) {
    push({ at: a.created_at, cat: "seguimiento", title: `Alerta ${a.severity}: ${a.message || a.rule_key}`, detail: `Estado ${a.status}`, who: name(a.owner_id) });
    if (a.resolved_at) push({ at: a.resolved_at, cat: "seguimiento", title: "Alerta resuelta", detail: a.message || "", who: name(a.resolved_by) });
  }
  for (const k of all<any>("SELECT * FROM tasks WHERE company_id=?", cid)) {
    push({ at: k.created_at, cat: "seguimiento", title: `Tarea: ${k.title}`, detail: `Responsable ${name(k.assignee_id) || "—"} · vence ${fmtDate(k.due_at, false)} · ${k.status}`, who: name(k.created_by) });
    if (k.done_at) push({ at: k.done_at, cat: "seguimiento", title: `Tarea completada: ${k.title}`, who: name(k.assignee_id) });
  }
  const nMsg = get<any>("SELECT COUNT(*) n, MAX(sent_at) last FROM messages WHERE company_id=?", cid);
  if (nMsg?.n) push({ at: nMsg.last, cat: "seguimiento", title: `${nMsg.n} mensaje(s) mentor-empresa`, detail: "El contenido se consulta en Mensajes" });
  if (o.audit) {
    const ids = (sql: string) => all<any>(sql, cid).map((x) => String(x.id));
    const ents: [string, string[]][] = [
      ["company", [String(cid)]], ["session", sess.map((s) => String(s.id))], ["referral", refs.map((r) => String(r.id))],
      ["closure", ids("SELECT id FROM closures WHERE company_id=?")], ["document", ids("SELECT id FROM documents WHERE company_id=?")],
      ["validation_case", ids("SELECT id FROM validation_cases WHERE company_id=?")], ["registration", ids("SELECT id FROM registrations WHERE company_id=?")],
      ["indicator", ids("SELECT id FROM indicators WHERE company_id=?")], ["diagnostic", ids("SELECT id FROM diagnostics WHERE company_id=?")],
      ["company_route", ids("SELECT id FROM company_routes WHERE company_id=?")], ["form_response", ids("SELECT id FROM form_responses WHERE company_id=?")],
      ["user", ids("SELECT id FROM users WHERE company_id=?")],
    ];
    const refOf = (ent: string, id: string) => (ent === "referral" ? `remision:${id}` : ent === "session" && sessRef.get(Number(id)) ? `remision:${sessRef.get(Number(id))}` : ent === "validation_case" ? `validacion:${id}` : undefined);
    for (const [ent, list] of ents) {
      if (!list.length) continue;
      for (const a of all<any>(`SELECT * FROM audit_log WHERE entity=? AND entity_id IN (${list.map(() => "?").join(",")})
          AND action NOT IN ('consultar_trazabilidad','ver_informe_final','exportar_trazabilidad','consultar_documento','descargar_documento') ORDER BY id DESC LIMIT 500`, ent, ...list))
        push({ at: a.ts, cat: "auditoria", title: `${a.action.replace(/_/g, " ")} (${ent} #${a.entity_id})`, detail: a.after ? a.after.slice(0, 240) : "", who: a.user_email || "sistema", ip: a.ip, ref: refOf(ent, a.entity_id) });
    }
  }
  return t.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
export const TRACE_COLS: Col[] = [
  { header: "Fecha", key: "fecha" }, { header: "Categoría", key: "categoria" }, { header: "Evento", key: "title" }, { header: "Detalle", key: "detail" },
  { header: "Usuario", key: "who" }, { header: "IP", key: "ip" }, { header: "Caso", key: "ref" },
];
export const traceRows = (items: TraceItem[]) => items.map((i) => ({ ...i, fecha: fmtDate(i.at), categoria: TRACE_CATS.find(([k]) => k === i.cat)?.[1] || i.cat }));
export function filterTrace(items: TraceItem[], sp: { cat?: string; caso?: string; desde?: string; hasta?: string; q?: string }) {
  const cats = sp.cat ? String(sp.cat).split(",") : null;
  return items.filter((i) => (!cats || cats.includes(i.cat))
    && (!sp.caso || i.ref === sp.caso)
    && (!sp.desde || i.at >= new Date(sp.desde + "T00:00:00-05:00").toISOString())
    && (!sp.hasta || i.at <= new Date(sp.hasta + "T23:59:59-05:00").toISOString())
    && (!sp.q || `${i.title} ${i.detail || ""} ${i.who || ""}`.toLowerCase().includes(String(sp.q).toLowerCase())));
}
/** Casos de una empresa (remisiones y casos de validación) para filtrar la trazabilidad. */
export function companyCases(cid: number) {
  return [
    ...all<any>("SELECT r.id, sv.name s FROM referrals r LEFT JOIN servicios sv ON sv.id=r.servicio_id WHERE r.company_id=?", cid).map((r) => ({ key: `remision:${r.id}`, label: `Remisión #${r.id} · ${r.s}` })),
    ...all<any>("SELECT id, status FROM validation_cases WHERE company_id=?", cid).map((v) => ({ key: `validacion:${v.id}`, label: `Validación #${v.id} · ${v.status}` })),
  ];
}

/* ===================== Informe final por empresa (FUN-93) ===================== */
type Section = { name: string; score: number; max: number };
const sectionsOf = (responseId?: number | null): Section[] => {
  if (!responseId) return [];
  const r = get<any>("SELECT result FROM form_responses WHERE id=?", responseId);
  return jparse<any>(r?.result, {}).sections || [];
};
const recsOf = (responseId?: number | null): string[] => {
  if (!responseId) return [];
  const r = get<any>("SELECT result FROM form_responses WHERE id=?", responseId);
  return (jparse<any>(r?.result, {}).recommendations || []).map((x: any) => (typeof x === "string" ? x : x?.text || x?.title || JSON.stringify(x)));
};

export function finalReport(cid: number) {
  const c = get<any>("SELECT c.*, p.name program, p.valid_from, p.valid_to FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", cid);
  if (!c) return null;
  const mentors = all<any>("SELECT u.name, a.active, a.from_at FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=? ORDER BY a.id", cid);
  const referrals = all<any>(`SELECT r.*, sv.name service, sv.hours planned_hours, sv.sessions planned_sessions, a.name aliado, m.name mentor,
      (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.status='realizada') realizadas,
      (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.accepted_at IS NOT NULL) aceptadas,
      (SELECT COALESCE(SUM(s.hours),0) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.accepted_at IS NOT NULL) horas
    FROM referrals r LEFT JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN aliados a ON a.id=r.aliado_id LEFT JOIN users m ON m.id=r.mentor_id WHERE r.company_id=? ORDER BY r.id`, cid);
  const items = all<any>("SELECT * FROM company_items WHERE company_id=? ORDER BY id", cid);
  const accepted = all<any>(`SELECT s.*, m.name mentor, ab.name accepter, sv.name service FROM mentoring_sessions s LEFT JOIN users m ON m.id=s.mentor_id LEFT JOIN users ab ON ab.id=s.accepted_by
    LEFT JOIN referrals r ON r.id=s.referral_id LEFT JOIN servicios sv ON sv.id=r.servicio_id WHERE s.company_id=? AND s.status='realizada' AND s.accepted_at IS NOT NULL ORDER BY s.scheduled_at`, cid);
  const stats = get<any>(`SELECT SUM(status='realizada') realizadas, SUM(status='realizada' AND accepted_at IS NOT NULL) aceptadas, SUM(status='cancelada') canceladas,
    COALESCE(SUM(CASE WHEN status='realizada' AND accepted_at IS NOT NULL THEN hours END),0) horas, MIN(scheduled_at) primera, MAX(CASE WHEN status='realizada' THEN scheduled_at END) ultima FROM mentoring_sessions WHERE company_id=?`, cid);
  const indicators = all<any>("SELECT * FROM bi_indicadores WHERE company_id=? ORDER BY indicador", cid);
  const diags = all<any>("SELECT * FROM diagnostics WHERE company_id=? AND status='completado' ORDER BY completed_at", cid);
  const ini = diags.filter((d) => d.stage === "inicial").at(0) || null;
  const fin = diags.filter((d) => d.stage === "final").at(-1) || null;
  const events = all<any>(`SELECT e.title, e.type, e.start_at, g.attended, g.minutes, ce.code cert FROM registrations g JOIN events e ON e.id=g.event_id LEFT JOIN certificates ce ON ce.registration_id=g.id
    WHERE g.company_id=? AND g.waitlist=0 ORDER BY e.start_at`, cid);
  const closures = all<any>("SELECT cl.*, ap.name approver, sv.name service FROM closures cl LEFT JOIN users ap ON ap.id=cl.approved_by LEFT JOIN referrals r ON r.id=cl.referral_id LEFT JOIN servicios sv ON sv.id=r.servicio_id WHERE cl.company_id=? ORDER BY cl.id", cid);
  const routes = all<any>("SELECT * FROM bi_rutas WHERE company_id=? ORDER BY fecha", cid);
  const survey = get<any>("SELECT COUNT(*) n, AVG(nps) nps, AVG(satisfaction) sat FROM surveys WHERE company_id=? AND answered_at IS NOT NULL", cid);
  const notes = get<any>("SELECT n.*, u.name author FROM ana_report_notes n LEFT JOIN users u ON u.id=n.updated_by WHERE n.company_id=?", cid);
  // Recomendaciones: las del equipo + las del diagnóstico final (o inicial) + automáticas por indicadores
  const recs: { text: string; source: string }[] = [];
  String(notes?.recommendations || "").split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((text) => recs.push({ text, source: "Equipo de acompañamiento" }));
  recsOf((fin || ini)?.response_id).forEach((text) => recs.push({ text, source: `Diagnóstico ${fin ? "final" : "inicial"}` }));
  for (const i of indicators) {
    if (i.meta != null && i.resultado != null && Number(i.resultado) < Number(i.meta))
      recs.push({ text: `Continuar fortaleciendo «${i.indicador}»: resultado ${i.resultado}${i.unidad ? " " + i.unidad : ""} frente a una meta de ${i.meta}.`, source: "Indicadores" });
    else if (i.resultado == null) recs.push({ text: `Registrar la medición final de «${i.indicador}» para cerrar la evaluación de impacto.`, source: "Indicadores" });
  }
  if (Number(stats?.realizadas || 0) > Number(stats?.aceptadas || 0)) recs.push({ text: `Hay ${stats.realizadas - stats.aceptadas} sesión(es) realizada(s) pendiente(s) de aceptación por la empresa.`, source: "Sesiones" });
  return {
    c, mentors, referrals, items, accepted, stats, indicators, ini: ini && { ...ini, sections: sectionsOf(ini.response_id) }, fin: fin && { ...fin, sections: sectionsOf(fin.response_id) },
    events, closures, routes, survey, notes, recs,
  };
}

/* ===================== Instantáneas (TEC-97: tableros analíticos cada 15 min) ===================== */
export function takeSnapshot() {
  const day = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const n = (sql: string) => Number(get<any>(sql)?.n ?? 0);
  const m: Record<string, number> = {
    empresas_registradas: n("SELECT COUNT(*) n FROM companies"),
    empresas_activas: n("SELECT COUNT(*) n FROM companies WHERE status='activa'"),
    empresas_con_mentor: n("SELECT COUNT(*) n FROM bi_empresas WHERE con_mentor=1"),
    empresas_con_servicio: n("SELECT COUNT(*) n FROM bi_empresas WHERE con_servicio=1"),
    empresas_cerradas: n("SELECT COUNT(*) n FROM bi_empresas WHERE cerrada=1"),
    sesiones_realizadas: n("SELECT COUNT(*) n FROM mentoring_sessions WHERE status='realizada'"),
    sesiones_aceptadas: n("SELECT COUNT(*) n FROM mentoring_sessions WHERE accepted_at IS NOT NULL"),
    inscritos_eventos: n("SELECT COUNT(*) n FROM registrations WHERE waitlist=0"),
    asistentes_eventos: n("SELECT COUNT(*) n FROM registrations WHERE attended=1"),
    alertas_abiertas: n("SELECT COUNT(*) n FROM alerts WHERE status='abierta'"),
    diagnosticos_completados: n("SELECT COUNT(*) n FROM diagnostics WHERE status='completado'"),
  };
  const ts = now();
  for (const [k, v] of Object.entries(m))
    run("INSERT INTO ana_snapshots(day,metric,value,taken_at) VALUES(?,?,?,?) ON CONFLICT(day,metric) DO UPDATE SET value=excluded.value, taken_at=excluded.taken_at", day, k, v, ts);
  return `${Object.keys(m).length} métricas del ${day}`;
}
export const lastSnapshot = () => get<any>("SELECT MAX(taken_at) t FROM ana_snapshots")?.t as string | undefined;

/* ===================== Consultas guardadas (TEC-93) ===================== */
export function savedSpec(r: { source: string; columns?: string | null; filters?: string | null }): Spec {
  const f = jparse<any>(r.filters, {});
  return { source: r.source, columns: jparse<string[]>(r.columns, []), filters: f.filters || [], groupBy: f.groupBy || null, agg: f.agg || null,
    measure: f.measure || null, order: f.order || null, limit: f.limit || null, global: f.global || {} };
}
export function specToSaved(s: Spec) {
  return { source: s.source, columns: JSON.stringify(s.columns || []),
    filters: JSON.stringify({ filters: s.filters || [], groupBy: s.groupBy || null, agg: s.agg || null, measure: s.measure || null, order: s.order || null, limit: s.limit || null, global: s.global || {} }) };
}

/* ===================== Plantillas de tableros (TEC-96: operativo y estratégico) ===================== */
const W = (type: WidgetType, title: string, source: string, o: Partial<Widget> = {}): Widget => ({ id: newWidgetId(), type, title, source, agg: "count", span: 1, ...o });
const FF = (col: string, op: Filter["op"], value = ""): Filter => ({ col, op, value });
export const DASHBOARD_PRESETS: Record<string, { name: string; description: string; widgets: () => Widget[] }> = {
  operativo: { name: "Tablero operativo", description: "Seguimiento diario: sesiones, aceptaciones, alertas y agenda", widgets: () => [
    W("kpi", "Empresas activas", "empresas", { filters: [FF("activa", "eq", "1")] }),
    W("kpi", "Sesiones realizadas", "sesiones", { filters: [FF("estado", "eq", "realizada")] }),
    W("kpi", "Pendientes de aceptación", "sesiones", { filters: [FF("estado", "eq", "realizada"), FF("aceptada", "eq", "0")] }),
    W("donut", "Sesiones por estado", "sesiones", { groupBy: "estado" }),
    W("hbar", "Sesiones realizadas por mentor", "sesiones", { groupBy: "mentor", filters: [FF("estado", "eq", "realizada")] }),
    W("bar", "Remisiones por estado", "remisiones", { groupBy: "estado" }),
    W("table", "Próximas sesiones", "sesiones", { span: 3, filters: [FF("estado", "eq", "programada")], columns: ["fecha", "empresa", "mentor", "titulo", "modalidad"], limit: 10 }),
  ] },
  estrategico: { name: "Tablero estratégico", description: "Cobertura, impacto, aliados y satisfacción del programa", widgets: () => [
    W("kpi", "Empresas registradas", "empresas"),
    W("kpi", "Empresas con servicio", "empresas", { filters: [FF("con_servicio", "eq", "1")] }),
    W("kpi", "Empresas cerradas", "empresas", { filters: [FF("cerrada", "eq", "1")] }),
    W("line", "Empresas registradas por mes", "empresas", { groupBy: "mes", span: 2 }),
    W("hbar", "Remisiones por aliado", "remisiones", { groupBy: "aliado" }),
    W("bar", "Asistentes por evento", "inscripciones", { groupBy: "evento", filters: [FF("asistio", "eq", "1")], span: 2 }),
    W("donut", "Empresas por sector", "empresas", { groupBy: "sector" }),
    W("bar", "Variación % promedio por indicador", "indicadores", { groupBy: "indicador", agg: "avg", measure: "variacion_pct", span: 2 }),
    W("donut", "Diagnósticos por nivel", "diagnosticos", { groupBy: "nivel", filters: [FF("nivel", "notempty")] }),
  ] },
};

/* ===================== Acceso por empresa (trazabilidad e informe final) ===================== */
/** Empresa visible para el usuario con el alcance de analítica/empresas (RN-01/02). */
export function companyVisible(u: User, cid: number) {
  const vc = visibleCompanies(u, "c", ["analytics.view", "companies.view", "closure.manage"]);
  return !!get(`SELECT 1 FROM companies c WHERE c.id=? AND ${vc.sql}`, cid, ...vc.params);
}
export function companiesList(u: User, q?: string, limit = 200) {
  const vc = visibleCompanies(u, "c", ["analytics.view", "companies.view", "closure.manage"]);
  const like = q ? `%${q.toLowerCase()}%` : null;
  return all<any>(`SELECT c.id, c.razon_social, c.nit || '-' || c.dv nit, c.status, p.name program,
      (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada') sesiones,
      (SELECT MAX(cl.approved_at) FROM closures cl WHERE cl.company_id=c.id) cierre
    FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE ${vc.sql} ${like ? "AND (LOWER(c.razon_social) LIKE ? OR c.nit LIKE ?)" : ""} ORDER BY c.razon_social LIMIT ${limit}`,
    ...vc.params, ...(like ? [like, like] : []));
}
