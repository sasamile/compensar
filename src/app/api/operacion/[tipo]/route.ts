import { all, setting } from "@/lib/db";
import { can, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fileResponse, toCsv, toXlsx, XLSX_TYPE, type Col } from "@/lib/xlsx";
import { fmtDate, jparse, slugify } from "@/lib/util";
import { RULES, ENTITY_LABEL } from "@/lib/alerts";
import { canViewIndicators, visibleIndicators } from "@/lib/indicators";
import { KIND_LABEL, SURVEY_JOINS, surveyFilter } from "@/lib/surveys";
import { alertFilter } from "@/app/(app)/seguimiento/scope";
import { taskFilter } from "@/app/(app)/tareas/scope";

/** Exportes operativos en Excel/CSV (FUN-92): alertas, tareas, encuestas, indicadores y avances. Respetan el alcance del rol. */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const { tipo } = await params;
  const sp = new URL(req.url).searchParams;
  let name = "", cols: Col[] = [], rows: any[] = [];

  if (tipo === "alertas") {
    if (!can(u, "alerts.view")) return new Response("Sin acceso", { status: 403 });
    const f = alertFilter(u);
    name = "Alertas";
    cols = [{ header: "Severidad", key: "severity" }, { header: "Regla", key: "rule", width: 30 }, { header: "Empresa", key: "razon_social", width: 30 }, { header: "Programa", key: "program" },
      { header: "Entidad", key: "entity" }, { header: "Mensaje", key: "message", width: 70 }, { header: "Responsable", key: "owner", width: 26 }, { header: "Estado", key: "status" },
      { header: "Generada", key: "created" }, { header: "Atendida/cerrada", key: "resolved" }, { header: "Atendida por", key: "resolver" }];
    rows = all<any>(`SELECT a.*, c.razon_social, p.name program, o.name owner, rb.name resolver FROM alerts a LEFT JOIN companies c ON c.id=a.company_id LEFT JOIN programs p ON p.id=a.program_id
      LEFT JOIN users o ON o.id=a.owner_id LEFT JOIN users rb ON rb.id=a.resolved_by WHERE ${f.sql} ORDER BY a.created_at DESC`, ...f.params)
      .map((a) => ({ ...a, rule: RULES[a.rule_key]?.name ?? a.rule_key, entity: `${ENTITY_LABEL[a.entity] ?? a.entity} #${a.entity_id}`, created: fmtDate(a.created_at), resolved: fmtDate(a.resolved_at) }));
  } else if (tipo === "tareas") {
    if (!can(u, "tasks.manage")) return new Response("Sin acceso", { status: 403 });
    const f = taskFilter(u);
    name = "Tareas";
    cols = [{ header: "Tarea", key: "title", width: 40 }, { header: "Descripción", key: "description", width: 50 }, { header: "Empresa", key: "razon_social", width: 30 },
      { header: "Responsable", key: "assignee", width: 26 }, { header: "Vence", key: "due" }, { header: "Estado", key: "status" }, { header: "Vencida", key: "late" },
      { header: "Terminada", key: "done" }, { header: "Evidencia (OnBase)", key: "onbase_ref" }, { header: "Creada por", key: "creator" }];
    const ts = new Date().toISOString();
    rows = all<any>(`SELECT t.*, c.razon_social, a.name assignee, cb.name creator, d.onbase_ref FROM tasks t LEFT JOIN companies c ON c.id=t.company_id LEFT JOIN users a ON a.id=t.assignee_id
      LEFT JOIN users cb ON cb.id=t.created_by LEFT JOIN documents d ON d.id=t.evidence_doc_id WHERE ${f.sql} ORDER BY t.due_at`, ...f.params)
      .map((t) => ({ ...t, due: fmtDate(t.due_at), done: fmtDate(t.done_at), late: t.status !== "hecha" && t.due_at < ts ? "Sí" : "No" }));
  } else if (tipo === "encuestas") {
    if (!can(u, "surveys.view")) return new Response("Sin acceso", { status: 403 });
    const f = surveyFilter(u);
    const where = [f.sql], p: any[] = [...f.params];
    if (["servicio", "cierre", "evento"].includes(sp.get("kind") ?? "")) { where.push("s.kind=?"); p.push(sp.get("kind")); }
    if (Number(sp.get("aliado"))) { where.push("COALESCE(s.aliado_id, sv.aliado_id)=?"); p.push(Number(sp.get("aliado"))); }
    if (Number(sp.get("servicio"))) { where.push("s.servicio_id=?"); p.push(Number(sp.get("servicio"))); }
    name = "Encuestas";
    cols = [{ header: "Tipo", key: "kind" }, { header: "Servicio / evento", key: "subject", width: 34 }, { header: "Aliado", key: "aliado", width: 26 }, { header: "Empresa", key: "razon_social", width: 30 },
      { header: "Estado", key: "status" }, { header: "Enviada", key: "sent" }, { header: "Respondida", key: "answered" }, { header: "NPS (0-10)", key: "nps" }, { header: "Satisfacción (1-5)", key: "satisfaction" },
      { header: "Contenido", key: "a_contenido" }, { header: "Mentor/consultor", key: "a_mentor" }, { header: "Puntualidad", key: "a_puntualidad" }, { header: "Comentario", key: "comment", width: 70 }];
    rows = all<any>(`SELECT s.*, sv.name service, al.name aliado, ev.title event, c.razon_social FROM surveys s ${SURVEY_JOINS} WHERE ${where.join(" AND ")} ORDER BY s.sent_at DESC`, ...p)
      .map((s) => { const a = jparse<any>(s.answers, {}); return { ...s, kind: KIND_LABEL[s.kind] ?? s.kind, subject: s.event || s.service || "Acompañamiento", sent: fmtDate(s.sent_at), answered: fmtDate(s.answered_at),
        a_contenido: a.contenido, a_mentor: a.mentor, a_puntualidad: a.puntualidad }; });
  } else if (tipo === "indicadores") {
    if (!canViewIndicators(u)) return new Response("Sin acceso", { status: 403 });
    name = "Indicadores";
    cols = [{ header: "Empresa", key: "razon_social", width: 30 }, { header: "Programa", key: "program", width: 20 }, { header: "Servicio", key: "service", width: 28 }, { header: "Indicador", key: "name", width: 30 },
      { header: "Tipo", key: "kind" }, { header: "Unidad", key: "unit" }, { header: "Periodicidad", key: "periodicity" }, { header: "Línea base", key: "baseline" }, { header: "Valor actual", key: "final" },
      { header: "Meta", key: "goal" }, { header: "Cumplimiento %", key: "pct" }, { header: "Avances", key: "n_values" }, { header: "Último avance", key: "last" }];
    rows = visibleIndicators(u).map((i) => ({ ...i, kind: i.kind === "gestion" ? "Gestión" : "Impacto", last: fmtDate(i.last_at) }));
  } else if (tipo === "avances") {
    if (!canViewIndicators(u)) return new Response("Sin acceso", { status: 403 });
    const ids = visibleIndicators(u).map((i) => i.id);
    name = "Avances de indicadores";
    cols = [{ header: "Fecha", key: "date" }, { header: "Empresa", key: "razon_social", width: 30 }, { header: "Indicador", key: "name", width: 30 }, { header: "Valor", key: "value" }, { header: "Unidad", key: "unit" },
      { header: "Nota", key: "note", width: 50 }, { header: "Evidencia (OnBase)", key: "onbase_ref" }, { header: "Sesión", key: "session" }, { header: "Registrado por", key: "recorder", width: 26 }];
    rows = ids.length ? all<any>(`SELECT v.*, i.name, i.unit, c.razon_social, d.onbase_ref, s.title session, us.name recorder FROM indicator_values v JOIN indicators i ON i.id=v.indicator_id
      JOIN companies c ON c.id=i.company_id LEFT JOIN documents d ON d.id=v.doc_id LEFT JOIN mentoring_sessions s ON s.id=v.session_id LEFT JOIN users us ON us.id=v.recorded_by
      WHERE v.indicator_id IN (${ids.map(() => "?").join(",")}) ORDER BY v.recorded_at DESC`, ...ids).map((v) => ({ ...v, date: fmtDate(v.recorded_at) })) : [];
  } else return new Response("Exporte no existe", { status: 404 });

  const fmt = sp.get("fmt") === "csv" ? "csv" : "xlsx";
  await audit(u, "exportar_operacion", "export", tipo, null, { fmt, filas: rows.length });
  const file = `${slugify(setting("brand_name", "Compensar"))}-${slugify(name)}-${new Date().toISOString().slice(0, 10)}`;
  return fmt === "csv" ? fileResponse(toCsv(cols, rows), `${file}.csv`, "text/csv; charset=utf-8") : fileResponse(await toXlsx(`${name}`, cols, rows), `${file}.xlsx`, XLSX_TYPE);
}
