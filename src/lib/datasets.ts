/**
 * Conjuntos de datos analíticos (TEC-93/94/95, RF-ANA-05/06/08).
 * Cada conjunto lee una vista de solo lectura bi_* (src/lib/schemas/analitica.ts) y le aplica:
 *  1) Seguridad a nivel de fila (RLS) según el alcance del rol (companyFilter / sessionFilter, aliado, programa).
 *  2) Filtros globales de consulta: programa, convocatoria/evento, mentor/asesor, aliado y periodo (FUN-98).
 *  3) Filtros, columnas, agrupación y agregación definidos por el usuario (constructor self-service, tableros).
 * Los nombres de columna se validan contra una lista blanca: nunca se interpola texto del usuario en el SQL.
 */
import { all } from "./db";
import { can, companyFilter, sessionFilter, type Grant, type User } from "./auth";
import type { Col } from "./xlsx";

export type ColType = "text" | "num" | "date" | "bool";
export type DCol = { key: string; label: string; type: ColType; hidden?: boolean };
type Cond = { sql: string; params: any[] };
export type Viewer = User | "system"; // "system" = token BI de organización (sin usuario)

export type Dataset = {
  key: string; name: string; view: string; description: string;
  cols: DCol[];
  date: string;                                       // columna para el periodo
  allow: (u: User) => boolean;
  rls: (u: User) => Cond;                             // condición sobre el alias t
  bi?: boolean;                                       // publicado para BI externo con token (por defecto sí)
};

/* ===================== Alcance (RLS) ===================== */
const has = (g: Grant, p: string) => g.perms.includes(p) || g.perms.includes("*") || g.perms.includes(p.split(":")[0] + ":*");
const ANA = ["analytics.view", "companies.view"];

/** ¿Tiene alcance de toda la organización para alguno de estos permisos? */
export function isOrgWide(u: User, perms: string[] = ANA) {
  if (u.company_id) return false;
  return u.grants.some((g) => g.scope_type === "org" && perms.some((p) => has(g, p)));
}
/** Programas acotados por los grants (alcance "program"). */
export function programIds(u: User, perms: string[] = ANA): number[] {
  return Array.from(new Set(u.grants.filter((g) => g.scope_type === "program" && g.scope_id && perms.some((p) => has(g, p))).map((g) => g.scope_id!)));
}
/** Aliados a los que está restringido el usuario (coordinador o mentor de aliado). null = sin restricción de aliado. */
export function aliadoLock(u: User): number[] | null {
  if (isOrgWide(u) || programIds(u).length) return null;
  const ids = new Set<number>();
  if (u.aliado_id) ids.add(u.aliado_id);
  u.grants.forEach((g) => { if (g.scope_type === "aliado" && g.scope_id) ids.add(g.scope_id); });
  return ids.size ? Array.from(ids) : null;
}
/** Empresas visibles: companyFilter (RN-01/02) ampliado con el alcance de analítica (org/programa). */
export function visibleCompanies(u: User, alias = "c", perms: string[] = ANA): Cond {
  if (isOrgWide(u, perms)) return { sql: "1=1", params: [] };
  const cf = companyFilter(u, alias);
  if (cf.sql === "1=1") return cf;
  const progs = u.company_id ? [] : programIds(u, perms);
  const parts = [cf.sql, ...progs.map(() => `${alias}.program_id=?`)];
  return { sql: "(" + parts.join(" OR ") + ")", params: [...cf.params, ...progs] };
}
export function visibleSessions(u: User, alias = "s"): Cond {
  if (isOrgWide(u, ["analytics.view", "sessions.view"])) return { sql: "1=1", params: [] };
  const sf = sessionFilter(u, alias);
  if (sf.sql === "1=1") return sf;
  const progs = u.company_id ? [] : programIds(u, ["analytics.view", "sessions.view"]);
  const parts = [sf.sql, ...progs.map(() => `${alias}.program_id=?`)];
  return { sql: "(" + parts.join(" OR ") + ")", params: [...sf.params, ...progs] };
}
const inList = (col: string, ids: number[]): Cond => ({ sql: ids.length ? `${col} IN (${ids.map(() => "?").join(",")})` : "1=0", params: ids });
const and = (...cs: Cond[]): Cond => ({ sql: cs.map((c) => `(${c.sql})`).join(" AND "), params: cs.flatMap((c) => c.params) });
const or = (...cs: Cond[]): Cond => ({ sql: cs.map((c) => `(${c.sql})`).join(" OR "), params: cs.flatMap((c) => c.params) });
const ALL: Cond = { sql: "1=1", params: [] };
const NONE: Cond = { sql: "1=0", params: [] };

/** RLS para conjuntos ligados a empresa; si el conjunto tiene aliado_id y el usuario está acotado a un aliado, también filtra por aliado. */
const byCompany = (withAliado = false, perms: string[] = ANA) => (u: User): Cond => {
  if (isOrgWide(u, perms)) return ALL;
  const vc = visibleCompanies(u, "c", perms);
  const base: Cond = { sql: `t.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql})`, params: vc.params };
  const lock = withAliado ? aliadoLock(u) : null;
  return lock ? and(base, { sql: `(t.aliado_id IS NULL OR ${inList("t.aliado_id", lock).sql})`, params: lock }) : base;
};
const bySession = (u: User): Cond => {
  if (isOrgWide(u, ["analytics.view", "sessions.view"])) return ALL;
  const vs = visibleSessions(u, "s");
  return { sql: `t.sesion_id IN (SELECT s.id FROM mentoring_sessions s WHERE ${vs.sql})`, params: vs.params };
};
const byEvent = (u: User): Cond => {
  if (isOrgWide(u)) return ALL;
  const vc = visibleCompanies(u);
  const viaCompany: Cond = { sql: `t.event_id IN (SELECT g.event_id FROM registrations g WHERE g.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql}))`, params: vc.params };
  const progs = u.company_id ? [] : programIds(u);
  return progs.length ? or(inList("t.program_id", progs), viaCompany) : viaCompany;
};
const byRegistration = (u: User): Cond => {
  if (isOrgWide(u)) return ALL;
  const progs = u.company_id ? [] : programIds(u);
  const comp = byCompany()(u);
  return progs.length ? or(inList("t.program_id", progs), comp) : comp;
};
const byService = (u: User): Cond => {
  if (isOrgWide(u)) return ALL;
  const lock = aliadoLock(u);
  if (lock) return inList("t.aliado_id", lock);
  const vc = visibleCompanies(u);
  const used: Cond = { sql: `t.servicio_id IN (SELECT r.servicio_id FROM referrals r WHERE r.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql}))`, params: vc.params };
  const progs = u.company_id ? [] : programIds(u);
  return progs.length ? or(inList("t.program_id", progs), used) : used;
};
const DOCS = ["documents.view", "companies.view"];
const byDocument = (u: User): Cond => {
  if (isOrgWide(u, ["documents.view"])) return ALL;
  const vc = visibleCompanies(u, "c", DOCS);
  const vs = visibleSessions(u, "s");
  const parts: Cond[] = [
    { sql: `t.company_id IN (SELECT c.id FROM companies c WHERE ${vc.sql})`, params: vc.params },
    { sql: `t.session_id IN (SELECT s.id FROM mentoring_sessions s WHERE ${vs.sql})`, params: vs.params },
  ];
  const progs = u.company_id ? [] : programIds(u, ["documents.view"]);
  if (progs.length) parts.push({ sql: `(t.company_id IS NULL AND t.event_id IN (SELECT e.id FROM events e WHERE ${inList("e.program_id", progs).sql}))`, params: progs });
  return or(...parts);
};
const orgOnly = (u: User): Cond => (isOrgWide(u) ? ALL : NONE);

/* ===================== Catálogo ===================== */
const T = (key: string, label: string): DCol => ({ key, label, type: "text" });
const N = (key: string, label: string): DCol => ({ key, label, type: "num" });
const D = (key: string, label: string): DCol => ({ key, label, type: "date" });
const B = (key: string, label: string): DCol => ({ key, label, type: "bool" });
const H = (key: string, label: string): DCol => ({ key, label, type: "num", hidden: true });

const ana = (u: User) => can(u, "analytics.view");
const anaAnd = (...ps: string[]) => (u: User) => ana(u) && ps.some((p) => can(u, p));

export const DATASETS: Dataset[] = [
  { key: "empresas", name: "Empresas", view: "bi_empresas", description: "Empresas registradas, estado, mentor y etapa del embudo", date: "fecha", allow: ana, rls: byCompany(),
    cols: [H("company_id", "ID empresa"), T("empresa", "Empresa"), T("nit", "NIT"), H("program_id", "ID programa"), T("programa", "Programa"), T("estado", "Estado"), T("sector", "Sector"),
      T("tamano", "Tamaño"), T("ciudad", "Ciudad"), T("origen", "Origen"), D("fecha", "Registro"), T("mes", "Mes de registro"), T("mentor", "Mentor"), H("mentor_id", "ID mentor"),
      B("activa", "Activa"), B("con_mentor", "Con mentor"), B("con_servicio", "Con servicio"), B("cerrada", "Cerrada"), N("sesiones_realizadas", "Sesiones realizadas"),
      N("horas", "Horas"), T("nivel_diagnostico", "Nivel de diagnóstico"), N("alertas_abiertas", "Alertas abiertas")] },
  { key: "sesiones", name: "Sesiones de mentoría", view: "bi_sesiones", description: "Sesiones por estado, mentor, aliado y aceptación (usuario, fecha, IP)", date: "fecha", allow: ana, rls: bySession,
    cols: [H("sesion_id", "ID sesión"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), H("mentor_id", "ID mentor"), T("mentor", "Mentor"),
      H("referral_id", "ID remisión"), H("aliado_id", "ID aliado"), T("aliado", "Aliado"), T("servicio", "Servicio"), T("titulo", "Título"), D("fecha", "Fecha"), T("mes", "Mes"), T("modalidad", "Modalidad"),
      T("estado", "Estado"), N("duracion_min", "Duración (min)"), N("horas", "Horas"), B("aceptada", "Aceptada"), T("aceptada_por", "Aceptada por"), D("aceptada_en", "Aceptada en"),
      T("ip_aceptacion", "IP de aceptación"), B("con_seguimiento", "Con seguimiento")] },
  { key: "remisiones", name: "Remisiones a servicios", view: "bi_remisiones", description: "Empresas remitidas por servicio, aliado, mentor y estado", date: "fecha", allow: ana, rls: byCompany(true),
    cols: [H("remision_id", "ID remisión"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), H("servicio_id", "ID servicio"), T("servicio", "Servicio"),
      H("aliado_id", "ID aliado"), T("aliado", "Aliado"), H("mentor_id", "ID mentor"), T("mentor", "Mentor"), T("estado", "Estado"), D("fecha", "Remitida"), T("mes", "Mes"),
      D("aceptada_en", "Aceptada en"), D("cerrada_en", "Cerrada en"), N("sesiones_realizadas", "Sesiones realizadas"), N("sesiones_aceptadas", "Sesiones aceptadas")] },
  { key: "inscripciones", name: "Inscripciones a eventos", view: "bi_inscripciones", description: "Inscritos, asistencia y certificados por evento (sin datos personales)", date: "fecha", allow: ana, rls: byRegistration,
    cols: [H("inscripcion_id", "ID inscripción"), H("event_id", "ID evento"), T("evento", "Evento"), T("tipo_evento", "Tipo de evento"), H("program_id", "ID programa"), T("programa", "Programa"),
      H("company_id", "ID empresa"), T("empresa", "Empresa"), T("estado", "Estado"), B("lista_espera", "Lista de espera"), B("asistio", "Asistió"), N("minutos", "Minutos"), D("fecha", "Inscripción"),
      T("mes", "Mes"), B("certificado", "Certificado")] },
  { key: "eventos", name: "Eventos y convocatorias", view: "bi_eventos", description: "Eventos, cursos y charlas con inscritos, asistentes y certificados", date: "fecha", allow: ana, rls: byEvent,
    cols: [H("event_id", "ID evento"), T("evento", "Evento"), T("tipo", "Tipo"), H("program_id", "ID programa"), T("programa", "Programa"), T("estado", "Estado"), T("modalidad", "Modalidad"),
      D("fecha", "Fecha"), T("mes", "Mes"), N("cupo", "Cupo"), N("costo_interno", "Costo interno"), N("inscritos", "Inscritos"), N("asistentes", "Asistentes"), N("certificados", "Certificados")] },
  { key: "servicios", name: "Servicios", view: "bi_servicios", description: "Servicios por aliado: previsto frente a ejecutado y costo interno", date: "", allow: ana, rls: byService,
    cols: [H("servicio_id", "ID servicio"), T("servicio", "Servicio"), T("tipo", "Tipo"), H("program_id", "ID programa"), T("programa", "Programa"), H("aliado_id", "ID aliado"), T("aliado", "Aliado"),
      N("horas_previstas", "Horas previstas"), N("sesiones_previstas", "Sesiones previstas"), N("costo_interno", "Costo interno"), B("activo", "Activo"), N("remisiones", "Remisiones"),
      N("empresas", "Empresas"), N("sesiones_realizadas", "Sesiones realizadas"), N("sesiones_aceptadas", "Sesiones aceptadas"), N("horas_ejecutadas", "Horas ejecutadas")] },
  { key: "indicadores", name: "Indicadores de impacto", view: "bi_indicadores", description: "Línea base, meta, resultado y última medición por empresa", date: "fecha", allow: ana, rls: byCompany(true),
    cols: [H("indicador_id", "ID indicador"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), T("indicador", "Indicador"), T("unidad", "Unidad"),
      N("linea_base", "Línea base"), N("meta", "Meta"), N("resultado", "Resultado"), N("variacion", "Variación"), N("variacion_pct", "Variación %"), B("cumple_meta", "Cumple meta"),
      N("ultimo_valor", "Último valor"), D("ultima_medicion", "Última medición"), N("mediciones", "Mediciones"), H("aliado_id", "ID aliado"), D("fecha", "Actualizado"), T("mes", "Mes")] },
  { key: "diagnosticos", name: "Diagnósticos", view: "bi_diagnosticos", description: "Diagnósticos por etapa, puntaje, nivel y segmento", date: "fecha", allow: anaAnd("diagnostics.view", "diagnostics.manage"), rls: byCompany(),
    cols: [H("diagnostico_id", "ID diagnóstico"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), T("etapa", "Etapa"), T("estado", "Estado"),
      N("puntaje", "Puntaje"), T("nivel", "Nivel"), T("segmento", "Segmento"), T("formulario", "Formulario"), H("mentor_id", "ID asignado"), T("asignado_a", "Asignado a"), D("fecha", "Fecha"), T("mes", "Mes")] },
  { key: "validacion", name: "Validación de requisitos", view: "bi_validacion", description: "Casos de validación por estado, responsable y tiempo en trámite", date: "fecha", allow: anaAnd("validation.view", "validation.manage"), rls: byCompany(),
    cols: [H("caso_id", "ID caso"), T("tipo", "Tipo"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), T("estado", "Estado"),
      H("mentor_id", "ID asignado"), T("asignado_a", "Asignado a"), T("decidido_por", "Decidido por"), D("decidido_en", "Decidido en"), T("motivo", "Motivo"), D("fecha", "Creado"), T("mes", "Mes"),
      N("dias_en_tramite", "Días en trámite"), N("solicitudes_info", "Solicitudes de información")] },
  { key: "encuestas", name: "Encuestas de satisfacción", view: "bi_encuestas", description: "NPS y satisfacción por servicio, aliado y evento", date: "fecha", allow: anaAnd("surveys.view"), rls: byCompany(true),
    cols: [H("encuesta_id", "ID encuesta"), T("tipo", "Tipo"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), H("servicio_id", "ID servicio"),
      T("servicio", "Servicio"), H("aliado_id", "ID aliado"), T("aliado", "Aliado"), H("event_id", "ID evento"), T("evento", "Evento"), T("estado", "Estado"), N("nps", "NPS (0-10)"),
      N("satisfaccion", "Satisfacción"), T("categoria_nps", "Categoría NPS"), T("comentario", "Comentario"), D("enviada_en", "Enviada"), D("respondida_en", "Respondida"), D("fecha", "Fecha"), T("mes", "Mes")] },
  { key: "alertas", name: "Alertas", view: "bi_alertas", description: "Alertas por regla, severidad, estado y responsable", date: "fecha", allow: anaAnd("alerts.view"), rls: byCompany(),
    cols: [H("alerta_id", "ID alerta"), T("regla", "Regla"), T("nombre_regla", "Nombre de la regla"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"),
      T("entidad", "Entidad"), T("severidad", "Severidad"), T("mensaje", "Mensaje"), T("estado", "Estado"), H("mentor_id", "ID responsable"), T("responsable", "Responsable"), D("fecha", "Creada"),
      T("mes", "Mes"), D("resuelta_en", "Resuelta")] },
  { key: "cierres", name: "Resultados y cierres", view: "bi_cierres", description: "Cierres de servicios con resultado y aprobación", date: "fecha", allow: ana, rls: byCompany(true),
    cols: [H("cierre_id", "ID cierre"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), H("referral_id", "ID remisión"), H("aliado_id", "ID aliado"),
      T("servicio", "Servicio"), T("estado", "Estado"), T("resultado", "Resultado"), T("aprobado_por", "Aprobado por"), D("aprobado_en", "Aprobado en"), D("fecha", "Creado"), T("mes", "Mes")] },
  { key: "rutas", name: "Rutas de acompañamiento", view: "bi_rutas", description: "Rutas por empresa, estado y avance de pasos", date: "fecha", allow: ana, rls: byCompany(),
    cols: [H("ruta_empresa_id", "ID ruta"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), T("ruta", "Ruta"), T("estado", "Estado"),
      T("origen", "Origen"), D("aprobada_en", "Aprobada"), D("cerrada_en", "Cerrada"), T("resultado_cierre", "Resultado de cierre"), D("fecha", "Creada"), T("mes", "Mes"), N("pasos", "Pasos"), N("pasos_completados", "Pasos completados")] },
  { key: "documentos", name: "Documentos (OnBase)", view: "bi_documentos", description: "Documentos de cada proceso con referencia OnBase y aceptación", date: "fecha",
    allow: (u) => can(u, "documents.view") || !!u.company_id, rls: byDocument,
    cols: [H("documento_id", "ID documento"), H("company_id", "ID empresa"), T("empresa", "Empresa"), H("program_id", "ID programa"), T("programa", "Programa"), H("session_id", "ID sesión"), T("sesion", "Sesión"),
      H("event_id", "ID evento"), T("evento", "Evento"), T("proceso", "Proceso"), T("nombre", "Nombre"), T("tipo", "Tipo"), T("mime", "Formato"), N("tamano", "Tamaño (bytes)"),
      T("referencia_onbase", "Referencia OnBase"), T("estado_onbase", "Estado OnBase"), T("subido_por", "Subido por"), B("aceptado", "Aceptado"), T("aceptado_por", "Aceptado por"),
      D("aceptado_en", "Aceptado en"), T("ip_aceptacion", "IP de aceptación"), H("mentor_id", "ID mentor"), D("fecha", "Fecha"), T("mes", "Mes")] },
  { key: "notificaciones", name: "Notificaciones", view: "bi_notificaciones", description: "Envíos por canal y estado de entrega/lectura", date: "fecha",
    allow: (u) => ana(u) && (can(u, "audit.view") || can(u, "report:R-11")), rls: orgOnly,
    cols: [H("notificacion_id", "ID"), T("canal", "Canal"), T("plantilla", "Plantilla"), T("estado", "Estado"), D("fecha", "Enviada"), T("mes", "Mes"), D("entregada_en", "Entregada"), D("leida_en", "Leída"), B("con_error", "Con error")] },
  { key: "auditoria", name: "Auditoría", view: "bi_auditoria", description: "Registro inalterable de acciones (quién, qué, cuándo, IP)", date: "fecha", allow: anaAnd("audit.view"), rls: () => ALL, bi: false,
    cols: [H("registro_id", "ID"), D("fecha", "Fecha"), T("mes", "Mes"), H("user_id", "ID usuario"), T("usuario", "Usuario"), T("accion", "Acción"), T("entidad", "Entidad"), T("entity_id", "ID entidad"), T("ip", "IP")] },
  { key: "historico", name: "Histórico de indicadores (instantáneas)", view: "bi_snapshots", description: "Indicadores de la organización tomados cada 15 minutos", date: "", allow: ana, rls: orgOnly,
    cols: [T("dia", "Día"), T("metrica", "Métrica"), N("valor", "Valor"), D("tomado_en", "Tomado en")] },
];

export const dataset = (key: string) => DATASETS.find((d) => d.key === key);
export const datasetsFor = (u: User) => DATASETS.filter((d) => d.allow(u));
export const visibleCols = (ds: Dataset) => ds.cols.filter((c) => !c.hidden);
const colOf = (ds: Dataset, k?: string | null) => (k ? ds.cols.find((c) => c.key === k) : undefined);

/* ===================== Especificación de consulta ===================== */
export type Agg = "count" | "count_distinct" | "sum" | "avg" | "min" | "max";
export const AGGS: [Agg, string][] = [["count", "Conteo de filas"], ["count_distinct", "Conteo de distintos"], ["sum", "Suma"], ["avg", "Promedio"], ["min", "Mínimo"], ["max", "Máximo"]];
export type Op = "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "empty" | "notempty";
export const OPS: [Op, string][] = [["eq", "es igual a"], ["ne", "es distinto de"], ["contains", "contiene"], ["gt", "mayor que"], ["gte", "mayor o igual"], ["lt", "menor que"], ["lte", "menor o igual"], ["empty", "está vacío"], ["notempty", "no está vacío"]];
export type Filter = { col: string; op: Op; value?: string };
export type Global = { program?: number | null; aliado?: number | null; mentor?: number | null; event?: number | null; from?: string | null; to?: string | null };
export type Spec = {
  source: string; columns?: string[]; filters?: Filter[]; groupBy?: string | null; agg?: Agg | null; measure?: string | null;
  order?: string | null; limit?: number | null; global?: Global;
};
export type Result = { ok: boolean; error?: string; ds?: Dataset; cols: Col[]; types: Record<string, ColType>; rows: any[]; notes: string[]; grouped: boolean };

const GLOBAL_LABEL: Record<string, string> = { program: "programa", aliado: "aliado", mentor: "mentor/asesor", event: "convocatoria/evento", period: "periodo" };
export const dayStart = (d: string) => new Date(d + "T00:00:00-05:00").toISOString();
export const dayEnd = (d: string) => new Date(d + "T23:59:59.999-05:00").toISOString();
const validDay = (d?: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

function globalCond(ds: Dataset, g: Global = {}, notes: string[]): Cond {
  const parts: Cond[] = [];
  const hasCol = (k: string) => !!colOf(ds, k);
  const hasCompany = hasCol("company_id");
  const na = (k: string) => notes.push(`El filtro de ${GLOBAL_LABEL[k]} no aplica a «${ds.name}».`);
  if (g.program) {
    if (hasCol("program_id")) parts.push({ sql: "t.program_id=?", params: [g.program] });
    else na("program");
  }
  if (g.aliado) {
    if (hasCol("aliado_id")) parts.push({ sql: "t.aliado_id=?", params: [g.aliado] });
    else if (hasCompany) parts.push({ sql: "t.company_id IN (SELECT company_id FROM referrals WHERE aliado_id=?)", params: [g.aliado] });
    else na("aliado");
  }
  if (g.mentor) {
    if (hasCol("mentor_id") && ds.key !== "empresas") parts.push({ sql: "t.mentor_id=?", params: [g.mentor] });
    else if (hasCompany) parts.push({ sql: "t.company_id IN (SELECT company_id FROM mentor_assignments WHERE mentor_id=? UNION SELECT company_id FROM referrals WHERE mentor_id=? UNION SELECT company_id FROM mentoring_sessions WHERE mentor_id=?)", params: [g.mentor, g.mentor, g.mentor] });
    else if (ds.key === "servicios") parts.push({ sql: "t.servicio_id IN (SELECT servicio_id FROM referrals WHERE mentor_id=?)", params: [g.mentor] });
    else na("mentor");
  }
  if (g.event) {
    if (hasCol("event_id") && ds.key !== "encuestas") parts.push({ sql: "t.event_id=?", params: [g.event] });
    else if (hasCompany) parts.push({ sql: "(t.company_id IN (SELECT company_id FROM registrations WHERE event_id=?)" + (hasCol("event_id") ? " OR t.event_id=?)" : ")"), params: hasCol("event_id") ? [g.event, g.event] : [g.event] });
    else na("event");
  }
  if (validDay(g.from) || validDay(g.to)) {
    if (ds.date) {
      if (validDay(g.from)) parts.push({ sql: `t.${ds.date}>=?`, params: [dayStart(g.from!)] });
      if (validDay(g.to)) parts.push({ sql: `t.${ds.date}<=?`, params: [dayEnd(g.to!)] });
    } else na("period");
  }
  return parts.length ? and(...parts) : ALL;
}

function filterCond(ds: Dataset, fs: Filter[] = [], notes: string[]): Cond {
  const parts: Cond[] = [];
  for (const f of fs) {
    const c = colOf(ds, f.col);
    if (!c || !OPS.some(([o]) => o === f.op)) continue;
    const col = `t.${c.key}`;
    const v: any = c.type === "num" || c.type === "bool" ? (f.value === "" || f.value == null || isNaN(Number(f.value)) ? f.value : Number(f.value)) : f.value ?? "";
    if (f.op === "empty") parts.push({ sql: `(${col} IS NULL OR ${col}='')`, params: [] });
    else if (f.op === "notempty") parts.push({ sql: `(${col} IS NOT NULL AND ${col}<>'')`, params: [] });
    else if (f.value == null || f.value === "") { notes.push(`Filtro sobre «${c.label}» sin valor: se ignoró.`); continue; }
    else if (f.op === "contains") parts.push({ sql: `LOWER(CAST(${col} AS TEXT)) LIKE ?`, params: [`%${String(f.value).toLowerCase()}%`] });
    else if (c.type === "date" && validDay(String(f.value))) {
      const s = String(f.value);
      const m: Record<string, Cond> = {
        eq: { sql: `${col}>=? AND ${col}<=?`, params: [dayStart(s), dayEnd(s)] }, ne: { sql: `NOT (${col}>=? AND ${col}<=?)`, params: [dayStart(s), dayEnd(s)] },
        gt: { sql: `${col}>?`, params: [dayEnd(s)] }, gte: { sql: `${col}>=?`, params: [dayStart(s)] }, lt: { sql: `${col}<?`, params: [dayStart(s)] }, lte: { sql: `${col}<=?`, params: [dayEnd(s)] },
      };
      parts.push(m[f.op]);
    } else {
      const sym = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op as "eq"];
      parts.push(c.type === "text" && (f.op === "eq" || f.op === "ne")
        ? { sql: `LOWER(COALESCE(${col},''))${sym}LOWER(?)`, params: [v] }
        : { sql: `${col}${sym}?`, params: [v] });
    }
  }
  return parts.length ? and(...parts) : ALL;
}

const boolLabel = (v: any) => (v === 1 || v === "1" ? "Sí" : v === 0 || v === "0" ? "No" : v);

/** Ejecuta una especificación con la seguridad del espectador. */
export function runSpec(viewer: Viewer, spec: Spec, opt: { maxRows?: number } = {}): Result {
  const notes: string[] = [];
  const empty = (error: string): Result => ({ ok: false, error, cols: [], types: {}, rows: [], notes, grouped: false });
  const ds = dataset(spec.source);
  if (!ds) return empty("Fuente de datos no existe");
  if (viewer !== "system" && !ds.allow(viewer)) return empty("No tienes permiso para consultar esta fuente");
  if (viewer === "system" && ds.bi === false) return empty("Fuente no publicada para BI");
  const rls = viewer === "system" ? ALL : ds.rls(viewer);
  const where = and(rls, globalCond(ds, spec.global, notes), filterCond(ds, spec.filters, notes));
  const max = Math.min(opt.maxRows ?? 100000, Math.max(1, Number(spec.limit) || 100000));
  const gcol = colOf(ds, spec.groupBy);
  const agg: Agg = (AGGS.find(([a]) => a === spec.agg)?.[0]) || "count";
  const mcol = colOf(ds, spec.measure);
  const types: Record<string, ColType> = {};
  try {
    if (gcol || spec.agg) {
      if (agg !== "count" && !mcol) return empty("Elige la columna a medir para la agregación");
      const aggSql = agg === "count" ? "COUNT(*)" : agg === "count_distinct" ? `COUNT(DISTINCT t.${mcol!.key})` : `ROUND(${agg.toUpperCase()}(t.${mcol!.key}), 2)`;
      const aggLabel = agg === "count" ? "Cantidad" : `${AGGS.find(([a]) => a === agg)![1]} de ${mcol!.label.toLowerCase()}`;
      const ord = spec.order === "label" || (gcol && (gcol.type === "date" || gcol.key === "mes")) ? "label ASC" : "value DESC";
      const sql = gcol
        ? `SELECT COALESCE(CAST(t.${gcol.key} AS TEXT), '(sin dato)') label, ${aggSql} value FROM ${ds.view} t WHERE ${where.sql} GROUP BY 1 ORDER BY ${ord} LIMIT ${max}`
        : `SELECT 'Total' label, ${aggSql} value FROM ${ds.view} t WHERE ${where.sql}`;
      const rows = all<any>(sql, ...where.params).map((r) => ({ label: gcol?.type === "bool" ? boolLabel(Number(r.label)) : r.label, value: r.value ?? 0 }));
      types.label = gcol?.type === "num" ? "num" : "text"; types.value = "num";
      return { ok: true, ds, cols: [{ header: gcol?.label || "Total", key: "label" }, { header: aggLabel, key: "value" }], types, rows, notes, grouped: true };
    }
    const vis = visibleCols(ds);
    const chosen = (spec.columns || []).map((k) => colOf(ds, k)).filter((c): c is DCol => !!c && !c.hidden);
    const cols = chosen.length ? chosen : vis;
    const desc = spec.order?.startsWith("-");
    const ocol = colOf(ds, spec.order?.replace(/^-/, "")) || (ds.date ? colOf(ds, ds.date) : undefined);
    const orderSql = ocol ? `ORDER BY t.${ocol.key} ${spec.order ? (desc ? "DESC" : "ASC") : "DESC"}` : "";
    const sql = `SELECT ${cols.map((c) => `t.${c.key}`).join(", ")} FROM ${ds.view} t WHERE ${where.sql} ${orderSql} LIMIT ${max}`;
    const rows = all<any>(sql, ...where.params).map((r) => {
      for (const c of cols) if (c.type === "bool") r[c.key] = boolLabel(r[c.key]);
      return r;
    });
    cols.forEach((c) => (types[c.key] = c.type));
    return { ok: true, ds, cols: cols.map((c) => ({ header: c.label, key: c.key })), types, rows, notes, grouped: false };
  } catch (e: any) {
    return empty("No fue posible ejecutar la consulta: " + (e?.message || e));
  }
}

/** Filas crudas de un conjunto (incluye columnas ocultas de dimensión) con RLS; uso interno de páginas. */
export function rowsOf(viewer: Viewer, source: string, filters: Filter[] = [], global: Global = {}, limit = 5000, offset = 0): any[] {
  const ds = dataset(source);
  if (!ds || (viewer !== "system" && !ds.allow(viewer))) return [];
  const notes: string[] = [];
  const where = and(viewer === "system" ? ALL : ds.rls(viewer), globalCond(ds, global, notes), filterCond(ds, filters, notes));
  return all<any>(`SELECT * FROM ${ds.view} t WHERE ${where.sql} ${ds.date ? `ORDER BY t.${ds.date} DESC` : ""} LIMIT ${Math.max(1, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset) || 0)}`, ...where.params);
}

/* ===================== Serialización a parámetros de URL ===================== */
type SP = URLSearchParams | Record<string, any>;
const pick = (sp: SP, k: string): string | undefined => {
  const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
  return Array.isArray(v) ? v[0] : v ?? undefined;
};
const pickAll = (sp: SP, k: string): string[] => {
  const v = sp instanceof URLSearchParams ? sp.getAll(k) : sp[k];
  return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x: string) => String(x).split(",")).filter(Boolean);
};
const numOrNull = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

export function globalFromParams(sp: SP): Global {
  return { program: numOrNull(pick(sp, "programa")), aliado: numOrNull(pick(sp, "aliado")), mentor: numOrNull(pick(sp, "mentor")), event: numOrNull(pick(sp, "evento")),
    from: validDay(pick(sp, "desde")) ? pick(sp, "desde")! : null, to: validDay(pick(sp, "hasta")) ? pick(sp, "hasta")! : null };
}
export function globalToParams(g: Global = {}): Record<string, string> {
  const o: Record<string, string> = {};
  if (g.program) o.programa = String(g.program); if (g.aliado) o.aliado = String(g.aliado); if (g.mentor) o.mentor = String(g.mentor);
  if (g.event) o.evento = String(g.event); if (g.from) o.desde = g.from; if (g.to) o.hasta = g.to;
  return o;
}
export function specFromParams(sp: SP): Spec {
  const filters: Filter[] = [];
  for (let i = 1; i <= 5; i++) {
    const col = pick(sp, `f${i}`), op = pick(sp, `op${i}`) as Op;
    if (col && op) filters.push({ col, op, value: pick(sp, `v${i}`) ?? "" });
  }
  return {
    source: pick(sp, "fuente") || "", columns: pickAll(sp, "col"), filters,
    groupBy: pick(sp, "agrupar") || null, agg: (pick(sp, "agg") as Agg) || null, measure: pick(sp, "medida") || null,
    order: pick(sp, "orden") || null, limit: numOrNull(pick(sp, "limite")), global: globalFromParams(sp),
  };
}
export function specToParams(s: Spec): URLSearchParams {
  const p = new URLSearchParams();
  p.set("fuente", s.source);
  (s.columns || []).forEach((c) => p.append("col", c));
  (s.filters || []).forEach((f, i) => { p.set(`f${i + 1}`, f.col); p.set(`op${i + 1}`, f.op); if (f.value != null) p.set(`v${i + 1}`, f.value); });
  if (s.groupBy) p.set("agrupar", s.groupBy); if (s.agg) p.set("agg", s.agg); if (s.measure) p.set("medida", s.measure);
  if (s.order) p.set("orden", s.order); if (s.limit) p.set("limite", String(s.limit));
  Object.entries(globalToParams(s.global)).forEach(([k, v]) => p.set(k, v));
  return p;
}
