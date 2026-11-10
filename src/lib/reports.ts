import { all } from "./db";
import { can, companyFilter, sessionFilter, type User } from "./auth";
import { fmtDate } from "./util";
import { aliadoReport } from "./payments";
import { aliadoLock, isOrgWide, programIds } from "./datasets";
import type { Col } from "./xlsx";

export type Period = { from: string; to: string }; // ISO UTC
export type Report = { cols: Col[]; rows: any[] };
const c = (header: string, key: string): Col => ({ header, key });
const inL = (col: string, ids: number[]) => (ids.length ? `${col} IN (${ids.map(() => "?").join(",")})` : "1=0");

/**
 * Alcance para tablas sin empresa (servicios, eventos, aliados): org = todo; programa = sus programas;
 * aliado = solo su aliado (TEC-95 seguridad a nivel de fila).
 */
function scopeOf(u: User, id: string) {
  const perms = ["analytics.view", "companies.view", `report:${id}`];
  const org = isOrgWide(u, perms);
  return { org, programs: org ? [] : programIds(u, perms), lock: org ? null : aliadoLock(u) };
}

/** Cada reporte respeta el alcance del rol (RN-02) y el periodo elegido. */
export function buildReport(id: string, u: User, per: Period, q: Record<string, string> = {}): Report | null {
  const cf = companyFilter(u, "c");
  const sc = scopeOf(u, id);
  // Alcance para tablas con aliado (servicios/aliados) y con programa (eventos)
  const aliadoW = (col: string) => (sc.lock ? { sql: inL(col, sc.lock), p: sc.lock as any[] } : { sql: "1=1", p: [] as any[] });
  const progW = (col: string) => (sc.org || !sc.programs.length ? { sql: "1=1", p: [] as any[] } : { sql: inL(col, sc.programs), p: sc.programs });
  switch (id) {
    case "R-01":
      return { cols: [c("Empresa", "razon_social"), c("NIT", "nit"), c("Programa", "program"), c("Estado", "status"), c("Sector", "sector"), c("Tamaño", "size"), c("Ciudad", "city"), c("Origen", "source"), c("Creada", "created")],
        rows: all<any>(`SELECT c.*, p.name program FROM companies c JOIN programs p ON p.id=c.program_id WHERE c.created_at BETWEEN ? AND ? AND ${cf.sql} ORDER BY c.id`, per.from, per.to, ...cf.params)
          .map((r) => ({ ...r, nit: `${r.nit}-${r.dv}`, created: fmtDate(r.created_at) })) };
    case "R-02": {
      const aw = aliadoW("r.aliado_id");
      return { cols: [c("Empresa", "razon_social"), c("Servicio", "service"), c("Aliado", "aliado"), c("Estado remisión", "status"), c("Mentor", "mentor"), c("Remitida", "created")],
        rows: all<any>(`SELECT c.razon_social, sv.name service, a.name aliado, r.status, m.name mentor, r.created_at FROM referrals r JOIN companies c ON c.id=r.company_id JOIN servicios sv ON sv.id=r.servicio_id
          JOIN aliados a ON a.id=r.aliado_id LEFT JOIN users m ON m.id=r.mentor_id WHERE r.created_at BETWEEN ? AND ? AND ${cf.sql} AND ${aw.sql}`, per.from, per.to, ...cf.params, ...aw.p).map((r) => ({ ...r, created: fmtDate(r.created_at) })) };
    }
    case "R-03": {
      const aw = aliadoW("sv.aliado_id"), pw = progW("sv.program_id");
      return { cols: [c("Servicio", "name"), c("Aliado", "aliado"), c("Tipo", "kind"), c("Horas previstas", "hours"), c("Sesiones previstas", "sessions"), c("Sesiones ejecutadas", "done"), c("Horas ejecutadas", "hdone"), c("Costo interno", "internal_cost")],
        rows: all<any>(`SELECT sv.name, a.name aliado, sv.kind, sv.hours, sv.sessions, sv.internal_cost,
          (SELECT COUNT(*) FROM mentoring_sessions s JOIN referrals r ON r.id=s.referral_id WHERE r.servicio_id=sv.id AND s.status='realizada' AND s.scheduled_at BETWEEN ? AND ?) done,
          (SELECT COALESCE(SUM(s.hours),0) FROM mentoring_sessions s JOIN referrals r ON r.id=s.referral_id WHERE r.servicio_id=sv.id AND s.status='realizada' AND s.scheduled_at BETWEEN ? AND ?) hdone
          FROM servicios sv LEFT JOIN aliados a ON a.id=sv.aliado_id WHERE ${aw.sql} AND ${pw.sql}`, per.from, per.to, per.from, per.to, ...aw.p, ...pw.p) };
    }
    case "R-04": {
      const pw = progW("e.program_id");
      return { cols: [c("Evento / curso", "title"), c("Tipo", "type"), c("Fecha", "fecha"), c("Inscritos", "inscritos"), c("Asistentes", "asistentes"), c("% asistencia", "pct"), c("Certificados", "certs")],
        rows: all<any>(`SELECT e.title, e.type, e.start_at,
          (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.waitlist=0) inscritos,
          (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.attended=1) asistentes,
          (SELECT COUNT(*) FROM certificates ce JOIN registrations r ON r.id=ce.registration_id WHERE r.event_id=e.id) certs FROM events e WHERE e.start_at BETWEEN ? AND ? AND ${pw.sql}`, per.from, per.to, ...pw.p)
          .map((r) => ({ ...r, fecha: fmtDate(r.start_at), pct: r.inscritos ? Math.round((r.asistentes / r.inscritos) * 100) + "%" : "—" })) };
    }
    case "R-05": {
      const sf = sessionFilter(u, "s");
      return { cols: [c("Mentor", "mentor"), c("Programadas", "prog"), c("Realizadas", "real"), c("Aceptadas", "acc"), c("Pendientes de aceptación", "pend"), c("Canceladas", "canc"), c("Horas", "h")],
        rows: all<any>(`SELECT m.name mentor, SUM(s.status='programada') prog, SUM(s.status='realizada') real, SUM(s.accepted_at IS NOT NULL) acc,
          SUM(s.status='realizada' AND s.accepted_at IS NULL) pend, SUM(s.status='cancelada') canc, COALESCE(SUM(CASE WHEN s.status='realizada' THEN s.hours END),0) h
          FROM mentoring_sessions s JOIN users m ON m.id=s.mentor_id WHERE s.scheduled_at BETWEEN ? AND ? AND ${sf.sql} GROUP BY m.id`, per.from, per.to, ...sf.params) };
    }
    case "R-06":
      return { cols: [c("Empresa", "razon_social"), c("NIT", "nit"), c("Programa", "program"), c("Etapa", "stage"), c("Estado", "status"), c("Puntaje", "score"), c("Nivel", "level"), c("Segmento", "segment"),
          c("Formulario", "form"), c("Asignado a", "assignee"), c("Fecha", "fecha")],
        rows: all<any>(`SELECT c.razon_social, c.nit || '-' || c.dv nit, p.name program, d.stage, d.status, d.score, d.level, d.segment, f.name form, u.name assignee, COALESCE(d.completed_at, d.created_at) f
          FROM diagnostics d JOIN companies c ON c.id=d.company_id LEFT JOIN programs p ON p.id=c.program_id LEFT JOIN forms f ON f.id=d.form_id LEFT JOIN users u ON u.id=d.assigned_to
          WHERE COALESCE(d.completed_at, d.created_at) BETWEEN ? AND ? AND ${cf.sql} ORDER BY COALESCE(d.completed_at, d.created_at) DESC`, per.from, per.to, ...cf.params)
          .map((r) => ({ ...r, score: r.score ?? "", level: r.level ?? "", segment: r.segment ?? "", fecha: fmtDate(r.f) })) };
    case "R-07": {
      const aw = aliadoW("a.id");
      return { cols: [c("Aliado", "aliado"), c("Empresas atendidas", "empresas"), c("Remisiones", "remisiones"), c("Sesiones realizadas", "sesiones")],
        rows: all<any>(`SELECT a.name aliado, COUNT(DISTINCT r.company_id) empresas, COUNT(DISTINCT r.id) remisiones,
          (SELECT COUNT(*) FROM mentoring_sessions s JOIN referrals r2 ON r2.id=s.referral_id WHERE r2.aliado_id=a.id AND s.status='realizada' AND s.scheduled_at BETWEEN ? AND ?) sesiones
          FROM aliados a LEFT JOIN referrals r ON r.aliado_id=a.id WHERE ${aw.sql} GROUP BY a.id`, per.from, per.to, ...aw.p) };
    }
    case "R-08": {
      const aw = aliadoW("sv.aliado_id"), pw = progW("sv.program_id");
      return { cols: [c("Servicio", "name"), c("Aliado", "aliado"), c("Costo interno unitario", "internal_cost"), c("Sesiones aceptadas", "n"), c("Costo imputable", "total")],
        rows: all<any>(`SELECT sv.name, a.name aliado, sv.internal_cost, COUNT(s.id) n,
          ROUND(COALESCE(SUM(CASE WHEN sv.hours>0 THEN sv.internal_cost/sv.hours*s.hours END),0)) total FROM servicios sv LEFT JOIN aliados a ON a.id=sv.aliado_id
          LEFT JOIN referrals r ON r.servicio_id=sv.id LEFT JOIN mentoring_sessions s ON s.referral_id=r.id AND s.accepted_at IS NOT NULL AND s.scheduled_at BETWEEN ? AND ?
          WHERE ${aw.sql} AND ${pw.sql} GROUP BY sv.id`, per.from, per.to, ...aw.p, ...pw.p) };
    }
    case "R-09": {
      const aliados = all<any>("SELECT id,name FROM aliados").filter((a) => (u.aliado_id ? a.id === u.aliado_id : sc.lock ? sc.lock.includes(a.id) : q.aliado ? String(a.id) === q.aliado : true));
      const period = q.period || new Date(per.from).toISOString().slice(0, 7);
      const rows: any[] = [];
      for (const a of aliados) for (const r of aliadoReport(a.id, period).rows)
        rows.push({ aliado: a.name, empresa: r.razon_social, nit: r.nit, servicio: r.service, mentor: r.mentor, fecha: fmtDate(r.scheduled_at), horas: r.hours, aceptada: r.cuenta, aceptada_por: r.accepter || "", ip: r.accepted_ip || "", costo: r.costo });
      return { cols: [c("Aliado", "aliado"), c("Empresa", "empresa"), c("NIT", "nit"), c("Servicio", "servicio"), c("Mentor", "mentor"), c("Fecha", "fecha"), c("Horas", "horas"), c("¿Cuenta para pago?", "aceptada"), c("Aceptada por", "aceptada_por"), c("IP", "ip"), c("Costo interno", "costo")], rows };
    }
    case "R-10":
      return { cols: [c("Empresa", "razon_social"), c("Programa", "program"), c("Indicador", "name"), c("Unidad", "unit"), c("Línea base", "baseline"), c("Meta", "goal"), c("Resultado", "final"), c("Variación", "delta"),
          c("Variación %", "pct"), c("¿Cumple meta?", "cumple"), c("Último valor registrado", "last"), c("Fecha última medición", "last_at"), c("Mediciones", "n")],
        rows: all<any>(`SELECT c.razon_social, p.name program, i.name, i.unit, i.baseline, i.goal, i.final,
            (SELECT v.value FROM indicator_values v WHERE v.indicator_id=i.id ORDER BY v.recorded_at DESC, v.id DESC LIMIT 1) last,
            (SELECT v.recorded_at FROM indicator_values v WHERE v.indicator_id=i.id ORDER BY v.recorded_at DESC, v.id DESC LIMIT 1) last_at,
            (SELECT COUNT(*) FROM indicator_values v WHERE v.indicator_id=i.id) n
          FROM indicators i JOIN companies c ON c.id=i.company_id LEFT JOIN programs p ON p.id=c.program_id WHERE ${cf.sql} ORDER BY c.razon_social, i.name`, ...cf.params)
          .map((r) => ({ ...r, unit: r.unit ?? "", last: r.last ?? "", last_at: r.last_at ? fmtDate(r.last_at) : "",
            delta: r.final != null && r.baseline != null ? Math.round((r.final - r.baseline) * 100) / 100 : "",
            pct: r.final != null && r.baseline ? Math.round(((r.final - r.baseline) / Math.abs(r.baseline)) * 1000) / 10 + "%" : "",
            cumple: r.final != null && r.goal != null ? (r.final >= r.goal ? "Sí" : "No") : "" })) };
    case "R-11":
      return { cols: [c("Canal", "channel"), c("Plantilla", "template_key"), c("Destinatario", "to_addr"), c("Estado", "status"), c("Enviado", "sent"), c("Entregado", "deliv"), c("Leído", "read"), c("Error", "error")],
        rows: all<any>("SELECT * FROM notifications WHERE sent_at BETWEEN ? AND ? ORDER BY id DESC", per.from, per.to).map((r) => ({ ...r, sent: fmtDate(r.sent_at), deliv: fmtDate(r.delivered_at), read: fmtDate(r.read_at) })) };
    case "R-12":
      return { cols: [c("Fecha", "fecha"), c("Usuario", "user_email"), c("Acción", "action"), c("Entidad", "entity"), c("ID", "entity_id"), c("Antes", "before"), c("Después", "after"), c("IP", "ip")],
        rows: all<any>("SELECT * FROM audit_log WHERE ts BETWEEN ? AND ? ORDER BY id DESC LIMIT 50000", per.from, per.to).map((r) => ({ ...r, fecha: fmtDate(r.ts) })) };
    case "R-13": // FUN-96 reporte de validación
      return { cols: [c("Caso", "id"), c("Tipo", "kind"), c("Empresa", "razon_social"), c("NIT", "nit"), c("Programa", "program"), c("Estado", "status"), c("Asignado a", "assignee"),
          c("Días en trámite", "dias"), c("Solicitudes de información", "info"), c("Solicitudes abiertas", "info_open"), c("Decidido por", "decider"), c("Fecha de decisión", "decided"), c("Motivo", "reason"), c("Creado", "created")],
        rows: all<any>(`SELECT v.*, c.razon_social, c.nit || '-' || c.dv nit, p.name program, ua.name assignee, ud.name decider,
            ROUND(julianday(COALESCE(v.decided_at, ?)) - julianday(v.created_at), 1) dias,
            (SELECT COUNT(*) FROM info_requests ir WHERE ir.case_id=v.id) info, (SELECT COUNT(*) FROM info_requests ir WHERE ir.case_id=v.id AND ir.status='abierta') info_open
          FROM validation_cases v LEFT JOIN companies c ON c.id=v.company_id LEFT JOIN programs p ON p.id=COALESCE(v.program_id, c.program_id)
          LEFT JOIN users ua ON ua.id=v.assigned_to LEFT JOIN users ud ON ud.id=v.decided_by
          WHERE v.created_at BETWEEN ? AND ? AND ${isOrgWide(u, ["analytics.view", "companies.view", "validation.view", "report:R-13"]) ? "1=1" : `v.company_id IN (SELECT c.id FROM companies c WHERE ${cf.sql})`} ORDER BY v.id DESC`,
          new Date().toISOString(), per.from, per.to, ...(isOrgWide(u, ["analytics.view", "companies.view", "validation.view", "report:R-13"]) ? [] : cf.params))
          .map((r) => ({ ...r, razon_social: r.razon_social ?? "", decided: fmtDate(r.decided_at), created: fmtDate(r.created_at), reason: r.reason ?? "" })) };
    case "R-14": { // FUN-96 reporte de seguimiento de empresas
      const nowIso = new Date().toISOString();
      return { cols: [c("Empresa", "razon_social"), c("NIT", "nit"), c("Programa", "program"), c("Estado", "status"), c("Mentor", "mentor"), c("Servicios activos", "serv"), c("Sesiones realizadas", "real"),
          c("Sesiones aceptadas", "acc"), c("Pendientes de aceptación", "pend"), c("Horas", "horas"), c("Última sesión", "last"), c("Próxima sesión", "next"), c("Días sin sesión", "dias"),
          c("Ruta (avance)", "ruta"), c("Nivel de diagnóstico", "nivel"), c("Indicadores que cumplen meta", "ind"), c("Alertas abiertas", "alertas"), c("Cierre", "cierre"), c("Semáforo", "semaforo")],
        rows: all<any>(`SELECT c.id, c.razon_social, c.nit || '-' || c.dv nit, p.name program, c.status,
            (SELECT u.name FROM mentor_assignments ma JOIN users u ON u.id=ma.mentor_id WHERE ma.company_id=c.id AND ma.active=1 ORDER BY ma.id DESC LIMIT 1) mentor,
            (SELECT COUNT(*) FROM referrals r WHERE r.company_id=c.id AND r.status NOT IN ('cerrada','rechazada')) serv,
            (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada' AND s.scheduled_at BETWEEN ? AND ?) real,
            (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.accepted_at IS NOT NULL AND s.scheduled_at BETWEEN ? AND ?) acc,
            (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada' AND s.accepted_at IS NULL) pend,
            (SELECT COALESCE(SUM(s.hours),0) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada' AND s.scheduled_at BETWEEN ? AND ?) horas,
            (SELECT MAX(s.scheduled_at) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada') last_at,
            (SELECT MIN(s.scheduled_at) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='programada' AND s.scheduled_at>?) next_at,
            (SELECT cr.name || ' · ' || cr.status || ' (' || (SELECT COUNT(*) FROM company_route_steps st WHERE st.company_route_id=cr.id AND st.status='completado') || '/' ||
               (SELECT COUNT(*) FROM company_route_steps st WHERE st.company_route_id=cr.id) || ')' FROM company_routes cr WHERE cr.company_id=c.id ORDER BY cr.id DESC LIMIT 1) ruta,
            (SELECT d.level FROM diagnostics d WHERE d.company_id=c.id AND d.status='completado' ORDER BY d.completed_at DESC LIMIT 1) nivel,
            (SELECT SUM(i.final>=i.goal) || '/' || COUNT(*) FROM indicators i WHERE i.company_id=c.id AND i.goal IS NOT NULL) ind,
            (SELECT COUNT(*) FROM alerts a WHERE a.company_id=c.id AND a.status='abierta') alertas,
            (SELECT SUM(a.severity='roja') FROM alerts a WHERE a.company_id=c.id AND a.status='abierta') rojas,
            (SELECT cl.status FROM closures cl WHERE cl.company_id=c.id ORDER BY cl.id DESC LIMIT 1) cierre
          FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE ${cf.sql} ORDER BY c.razon_social`,
          per.from, per.to, per.from, per.to, per.from, per.to, nowIso, ...cf.params)
          .map((r) => {
            const dias = r.last_at ? Math.floor((Date.now() - +new Date(r.last_at)) / 86400000) : null;
            const semaforo = r.rojas > 0 || (r.status === "activa" && dias != null && dias > 30) ? "rojo" : r.alertas > 0 || r.pend > 0 || (r.status === "activa" && !r.last_at) ? "amarillo" : "verde";
            return { ...r, mentor: r.mentor ?? "", last: r.last_at ? fmtDate(r.last_at, false) : "", next: r.next_at ? fmtDate(r.next_at) : "", dias: dias ?? "", ruta: r.ruta ?? "", nivel: r.nivel ?? "", ind: r.ind ?? "", cierre: r.cierre ?? "", semaforo };
          }) };
    }
    case "R-15": { // Satisfacción (encuestas): aporta a FUN-95/96
      const lock = sc.lock;
      const scope = isOrgWide(u, ["analytics.view", "companies.view", "surveys.view", "report:R-15"]) ? { sql: "1=1", p: [] as any[] }
        : { sql: `(s.company_id IN (SELECT c.id FROM companies c WHERE ${cf.sql})${lock ? ` OR ${inL("s.aliado_id", lock)}` : ""})${lock ? ` AND (s.aliado_id IS NULL OR ${inL("s.aliado_id", lock)})` : ""}`,
            p: [...cf.params, ...(lock || []), ...(lock || [])] };
      return { cols: [c("Tipo", "kind"), c("Empresa", "razon_social"), c("Servicio", "service"), c("Aliado", "aliado"), c("Evento", "event"), c("Estado", "status"), c("NPS (0-10)", "nps"),
          c("Categoría NPS", "cat"), c("Satisfacción", "satisfaction"), c("Comentario", "comment"), c("Enviada", "sent"), c("Respondida", "answered")],
        rows: all<any>(`SELECT s.*, c.razon_social, sv.name service, a.name aliado, e.title event FROM surveys s LEFT JOIN companies c ON c.id=s.company_id LEFT JOIN servicios sv ON sv.id=s.servicio_id
          LEFT JOIN aliados a ON a.id=s.aliado_id LEFT JOIN events e ON e.id=s.event_id WHERE COALESCE(s.answered_at, s.sent_at) BETWEEN ? AND ? AND ${scope.sql} ORDER BY s.id DESC`, per.from, per.to, ...scope.p)
          .map((r) => ({ ...r, razon_social: r.razon_social ?? "", service: r.service ?? "", aliado: r.aliado ?? "", event: r.event ?? "", nps: r.nps ?? "", satisfaction: r.satisfaction ?? "", comment: r.comment ?? "",
            cat: r.nps == null ? "" : r.nps >= 9 ? "promotor" : r.nps >= 7 ? "pasivo" : "detractor", sent: fmtDate(r.sent_at), answered: fmtDate(r.answered_at) })) };
    }
  }
  return null;
}
export const canReport = (u: User, id: string) => can(u, `report:${id}`);

export function parsePeriod(from?: string | null, to?: string | null): Period {
  const ok = (d?: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(+new Date(d + "T00:00:00-05:00"));
  const f = ok(from) ? new Date(from + "T00:00:00-05:00") : new Date(Date.now() - 365 * 86400000);
  const t = ok(to) ? new Date(to + "T23:59:59-05:00") : new Date(Date.now() + 365 * 86400000);
  return { from: f.toISOString(), to: t.toISOString() };
}
