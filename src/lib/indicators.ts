/**
 * Indicadores de gestión e impacto (RF-SEG-02/03, RF-GSV-01/02 · FUN-67, 68, 83, 84).
 * - indicator_defs: definición por programa o por servicio del catálogo (sin desarrollo).
 * - indicators: indicador aplicado a una empresa (línea base, valor actual = final, meta).
 * - indicator_values: cada avance con nota, evidencia (documento OnBase) y sesión opcional.
 */
import { all, get, insert, now, run } from "./db";
import { can, companyFilter, programScope, type User } from "./auth";
import { TZ } from "./util";

export const PERIODICITIES: [string, string, number][] = [
  ["mensual", "Mensual", 30], ["bimestral", "Bimestral", 60], ["trimestral", "Trimestral", 90], ["semestral", "Semestral", 180], ["anual", "Anual", 365],
];
export const periodDays = (p?: string | null) => PERIODICITIES.find((x) => x[0] === p)?.[2] ?? 30;
export const periodLabel = (p?: string | null) => PERIODICITIES.find((x) => x[0] === p)?.[1] ?? (p || "—");
export const KINDS: [string, string][] = [["impacto", "Impacto"], ["gestion", "Gestión"]];

/** % de cumplimiento entre línea base y meta (sirve para metas crecientes y decrecientes). null si no hay datos. */
export function compliance(baseline: number | null, goal: number | null, current: number | null): number | null {
  if (current == null || goal == null) return null;
  const b = baseline ?? 0;
  if (goal === b) return current >= goal ? 100 : 0;
  const pct = ((current - b) / (goal - b)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
export const complianceTone = (p: number | null) => (p == null ? "slate" : p >= 80 ? "green" : p >= 40 ? "blue" : "amber");

export const fmtNum = (v: any, unit?: string | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  const s = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n);
  return unit ? `${s} ${unit}` : s;
};

/** Clave de mes YYYY-MM en hora de Colombia y su etiqueta corta. */
export const monthKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
};

/** Etiqueta corta de día ("12 jun") y puntos de una serie: último valor de cada día. */
export const shortDay = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: TZ, day: "numeric", month: "short" }).replace(".", "");
export function dailyPoints(values: { value: any; recorded_at: string }[]) {
  const m = new Map<string, { x: string; y: number }>();
  for (const v of values) m.set(new Date(v.recorded_at).toLocaleDateString("en-CA", { timeZone: TZ }), { x: shortDay(v.recorded_at), y: Number(v.value) });
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, p]) => p);
}

/** ¿Puede ver / registrar avances? Mentores y administrativos con indicators.update; la empresa sobre sus propios indicadores. */
export const canViewIndicators = (u: User) => can(u, "indicators.manage") || can(u, "indicators.update") || !!u.company_id;
export const canRecord = (u: User) => can(u, "indicators.update") || can(u, "indicators.manage") || !!u.company_id;

/** Programas sobre los que puede definir indicadores (null = todos). */
export const defScope = (u: User) => programScope(u, "indicators.manage");
export function canManageDef(u: User, def: { program_id: number | null; servicio_id: number | null }) {
  if (!can(u, "indicators.manage")) return false;
  const s = defScope(u);
  if (s === null) return true;
  const prog = def.program_id ?? get<any>("SELECT program_id FROM servicios WHERE id=?", def.servicio_id)?.program_id;
  return prog != null && s.includes(Number(prog));
}

export type IndFilters = { program?: number; servicio?: number; company?: number; def?: number; kind?: string };

/** Indicadores aplicados a empresas visibles para el usuario (alcance por rol vía companyFilter). */
export function visibleIndicators(u: User, f: IndFilters = {}) {
  const cf = companyFilter(u, "c");
  const where = [cf.sql];
  const params: any[] = [...cf.params];
  if (f.program) { where.push("i.program_id=?"); params.push(f.program); }
  if (f.servicio) { where.push("COALESCE(i.servicio_id, d.servicio_id)=?"); params.push(f.servicio); }
  if (f.company) { where.push("i.company_id=?"); params.push(f.company); }
  if (f.def) { where.push("i.def_id=?"); params.push(f.def); }
  if (f.kind) { where.push("COALESCE(d.kind,'impacto')=?"); params.push(f.kind); }
  return all<any>(
    `SELECT i.*, c.razon_social, p.name program, sv.name service, d.kind, d.periodicity, d.formula, COALESCE(i.unit, d.unit) unit,
       (SELECT MAX(recorded_at) FROM indicator_values v WHERE v.indicator_id=i.id) last_at,
       (SELECT COUNT(*) FROM indicator_values v WHERE v.indicator_id=i.id) n_values, ub.name updater
     FROM indicators i JOIN companies c ON c.id=i.company_id LEFT JOIN programs p ON p.id=i.program_id
     LEFT JOIN indicator_defs d ON d.id=i.def_id LEFT JOIN servicios sv ON sv.id=COALESCE(i.servicio_id, d.servicio_id)
     LEFT JOIN users ub ON ub.id=i.updated_by
     WHERE ${where.join(" AND ")} ORDER BY c.razon_social, i.name`, ...params,
  ).map((i) => ({ ...i, pct: compliance(i.baseline, i.goal, i.final) }));
}

export function indicatorForUser(u: User, id: number) {
  return visibleIndicators(u).find((i) => i.id === id) ?? null;
}

export function valuesOf(indicatorId: number) {
  return all<any>(
    `SELECT v.*, u.name recorder, u.company_id recorder_company, d.name doc_name, s.title session_title
     FROM indicator_values v LEFT JOIN users u ON u.id=v.recorded_by LEFT JOIN documents d ON d.id=v.doc_id
     LEFT JOIN mentoring_sessions s ON s.id=v.session_id WHERE v.indicator_id=? ORDER BY v.recorded_at, v.id`, indicatorId);
}

/** Registra un avance y actualiza el valor actual del indicador (síncrono; la auditoría la hace quien llama). */
export function applyValue(ind: { id: number }, value: number, note: string, docId: number | null, sessionId: number | null, userId: number) {
  const ts = now();
  const id = insert("INSERT INTO indicator_values(indicator_id,value,note,doc_id,session_id,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?)",
    ind.id, value, note, docId, sessionId, userId, ts);
  run("UPDATE indicators SET final=?, updated_by=?, updated_at=? WHERE id=?", value, userId, ts, ind.id);
  return id;
}

/** Serie de un indicador: último valor de cada mes (más la línea base como punto inicial). */
export function seriesOf(ind: any, values: any[]) {
  const byMonth = new Map<string, number>();
  for (const v of values) byMonth.set(monthKey(v.recorded_at), Number(v.value));
  return Array.from(byMonth.entries()).sort().map(([k, y]) => ({ x: monthLabel(k), y }));
}

/**
 * Evolución del cumplimiento promedio (% hacia la meta) mes a mes para un conjunto de indicadores.
 * Arrastra el último valor conocido de cada indicador.
 */
export function complianceTimeline(inds: any[], months = 8) {
  if (!inds.length) return [];
  const ids = inds.map((i) => i.id);
  const vals = all<any>(`SELECT indicator_id, value, recorded_at FROM indicator_values WHERE indicator_id IN (${ids.map(() => "?").join(",")}) ORDER BY recorded_at, id`, ...ids);
  if (!vals.length) return [];
  const keys: string[] = [];
  const d = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 15));
    keys.push(x.toISOString().slice(0, 7));
  }
  const first = monthKey(vals[0].recorded_at);
  const use = keys.filter((k) => k >= first);
  const byInd = new Map<number, any[]>();
  for (const v of vals) { const a = byInd.get(v.indicator_id) ?? []; a.push(v); byInd.set(v.indicator_id, a); }
  return use.map((k) => {
    const pcts: number[] = [];
    for (const ind of inds) {
      const list = (byInd.get(ind.id) ?? []).filter((v) => monthKey(v.recorded_at) <= k);
      if (!list.length) continue;
      const p = compliance(ind.baseline, ind.goal, Number(list[list.length - 1].value));
      if (p != null) pcts.push(p);
    }
    return { x: monthLabel(k), y: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0 };
  });
}

/** Agrupa indicadores por una clave y calcula cumplimiento promedio. */
export function groupCompliance(inds: any[], key: (i: any) => string) {
  const m = new Map<string, { label: string; n: number; sum: number; withData: number; met: number }>();
  for (const i of inds) {
    const k = key(i) || "Sin clasificar";
    const g = m.get(k) ?? { label: k, n: 0, sum: 0, withData: 0, met: 0 };
    g.n++;
    if (i.pct != null) { g.sum += i.pct; g.withData++; if (i.pct >= 100) g.met++; }
    m.set(k, g);
  }
  return Array.from(m.values()).map((g) => ({ ...g, avg: g.withData ? Math.round(g.sum / g.withData) : 0 })).sort((a, b) => b.avg - a.avg);
}

/** Definiciones visibles (las de los programas del alcance del usuario; null = todas). */
export function visibleDefs(u: User, onlyActive = false) {
  const s = programScope(u, "indicators.manage") ?? (can(u, "indicators.manage") ? null : programScope(u, "indicators.update"));
  const rows = all<any>(`SELECT d.*, p.name program, sv.name service, COALESCE(d.program_id, sv.program_id) prog_id,
      (SELECT COUNT(*) FROM indicators i WHERE i.def_id=d.id) applied
    FROM indicator_defs d LEFT JOIN programs p ON p.id=d.program_id LEFT JOIN servicios sv ON sv.id=d.servicio_id
    ${onlyActive ? "WHERE d.active=1" : ""} ORDER BY COALESCE(d.program_id, sv.program_id), d.servicio_id IS NOT NULL, d.name`);
  return s === null ? rows : rows.filter((d) => s.includes(Number(d.prog_id)));
}
