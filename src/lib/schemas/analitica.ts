/**
 * Módulo Analítica (RF-ANA, TEC-92..97).
 * - ana_snapshots: instantáneas de indicadores organizacionales (job cada 15 min, TEC-97).
 * - Vistas bi_* de SOLO LECTURA: fuente única para la analítica nativa (con seguridad a nivel de fila
 *   aplicada encima en src/lib/datasets.ts) y para herramientas de BI externas (Power BI/Tableau) vía /api/bi.
 *   Se recrean en cada apertura de la base (DROP + CREATE) para que siempre reflejen la última definición.
 *   Solo referencian tablas del esquema base y de schema2.
 */
const M = (c: string) => `strftime('%Y-%m', datetime(${c}, '-5 hours'))`; // mes en hora Colombia

const VIEWS: Record<string, string> = {
  bi_empresas: `
SELECT c.id company_id, c.razon_social empresa, c.nit || '-' || c.dv nit, c.program_id, p.name programa, c.status estado,
  c.sector, c.size tamano, c.city ciudad, c.source origen, c.created_at fecha, ${M("c.created_at")} mes,
  (SELECT u.name FROM mentor_assignments ma JOIN users u ON u.id=ma.mentor_id WHERE ma.company_id=c.id AND ma.active=1 ORDER BY ma.id DESC LIMIT 1) mentor,
  (SELECT ma.mentor_id FROM mentor_assignments ma WHERE ma.company_id=c.id AND ma.active=1 ORDER BY ma.id DESC LIMIT 1) mentor_id,
  CASE WHEN c.status='activa' THEN 1 ELSE 0 END activa,
  CASE WHEN EXISTS(SELECT 1 FROM mentor_assignments ma WHERE ma.company_id=c.id AND ma.active=1)
    OR EXISTS(SELECT 1 FROM referrals r WHERE r.company_id=c.id AND r.mentor_id IS NOT NULL) THEN 1 ELSE 0 END con_mentor,
  CASE WHEN EXISTS(SELECT 1 FROM referrals r WHERE r.company_id=c.id AND r.status<>'rechazada')
    OR EXISTS(SELECT 1 FROM company_items ci WHERE ci.company_id=c.id AND ci.kind IN ('servicio','ruta')) THEN 1 ELSE 0 END con_servicio,
  CASE WHEN EXISTS(SELECT 1 FROM closures cl WHERE cl.company_id=c.id AND cl.status='aprobado')
    OR EXISTS(SELECT 1 FROM company_routes cr WHERE cr.company_id=c.id AND cr.status='cerrada') THEN 1 ELSE 0 END cerrada,
  (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada') sesiones_realizadas,
  (SELECT COALESCE(SUM(s.hours),0) FROM mentoring_sessions s WHERE s.company_id=c.id AND s.status='realizada') horas,
  (SELECT d.level FROM diagnostics d WHERE d.company_id=c.id AND d.status='completado' ORDER BY d.completed_at DESC LIMIT 1) nivel_diagnostico,
  (SELECT COUNT(*) FROM alerts a WHERE a.company_id=c.id AND a.status='abierta') alertas_abiertas
FROM companies c LEFT JOIN programs p ON p.id=c.program_id`,

  bi_sesiones: `
SELECT s.id sesion_id, s.company_id, c.razon_social empresa, COALESCE(s.program_id, c.program_id) program_id, p.name programa,
  s.mentor_id, m.name mentor, s.referral_id, r.aliado_id, a.name aliado, sv.name servicio, s.title titulo,
  s.scheduled_at fecha, ${M("s.scheduled_at")} mes, s.modality modalidad, s.status estado, s.duration_min duracion_min,
  COALESCE(s.hours,0) horas, CASE WHEN s.accepted_at IS NOT NULL THEN 1 ELSE 0 END aceptada, ac.name aceptada_por,
  s.accepted_at aceptada_en, s.accepted_ip ip_aceptacion, CASE WHEN s.topics IS NOT NULL AND s.topics<>'' THEN 1 ELSE 0 END con_seguimiento
FROM mentoring_sessions s LEFT JOIN companies c ON c.id=s.company_id LEFT JOIN programs p ON p.id=COALESCE(s.program_id, c.program_id)
  LEFT JOIN users m ON m.id=s.mentor_id LEFT JOIN referrals r ON r.id=s.referral_id LEFT JOIN aliados a ON a.id=r.aliado_id
  LEFT JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN users ac ON ac.id=s.accepted_by`,

  bi_remisiones: `
SELECT r.id remision_id, r.company_id, c.razon_social empresa, c.program_id, p.name programa, r.servicio_id, sv.name servicio,
  r.aliado_id, a.name aliado, r.mentor_id, m.name mentor, r.status estado, r.created_at fecha, ${M("r.created_at")} mes,
  r.accepted_at aceptada_en, r.closed_at cerrada_en,
  (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.status='realizada') sesiones_realizadas,
  (SELECT COUNT(*) FROM mentoring_sessions s WHERE s.referral_id=r.id AND s.accepted_at IS NOT NULL) sesiones_aceptadas
FROM referrals r LEFT JOIN companies c ON c.id=r.company_id LEFT JOIN programs p ON p.id=c.program_id
  LEFT JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN aliados a ON a.id=r.aliado_id LEFT JOIN users m ON m.id=r.mentor_id`,

  bi_inscripciones: `
SELECT g.id inscripcion_id, g.event_id, e.title evento, e.type tipo_evento, e.program_id, p.name programa, g.company_id, c.razon_social empresa,
  g.status estado, g.waitlist lista_espera, g.attended asistio, g.minutes minutos, g.created_at fecha, ${M("g.created_at")} mes,
  CASE WHEN EXISTS(SELECT 1 FROM certificates ce WHERE ce.registration_id=g.id) THEN 1 ELSE 0 END certificado
FROM registrations g LEFT JOIN events e ON e.id=g.event_id LEFT JOIN programs p ON p.id=e.program_id LEFT JOIN companies c ON c.id=g.company_id`,

  bi_eventos: `
SELECT e.id event_id, e.title evento, e.type tipo, e.program_id, p.name programa, e.status estado, e.modality modalidad,
  e.start_at fecha, ${M("e.start_at")} mes, e.capacity cupo, e.internal_cost costo_interno,
  (SELECT COUNT(*) FROM registrations g WHERE g.event_id=e.id AND g.waitlist=0) inscritos,
  (SELECT COUNT(*) FROM registrations g WHERE g.event_id=e.id AND g.attended=1) asistentes,
  (SELECT COUNT(*) FROM certificates ce JOIN registrations g ON g.id=ce.registration_id WHERE g.event_id=e.id) certificados
FROM events e LEFT JOIN programs p ON p.id=e.program_id`,

  bi_servicios: `
SELECT sv.id servicio_id, sv.name servicio, sv.kind tipo, sv.program_id, p.name programa, sv.aliado_id, a.name aliado,
  sv.hours horas_previstas, sv.sessions sesiones_previstas, sv.internal_cost costo_interno, sv.active activo,
  (SELECT COUNT(*) FROM referrals r WHERE r.servicio_id=sv.id) remisiones,
  (SELECT COUNT(DISTINCT r.company_id) FROM referrals r WHERE r.servicio_id=sv.id) empresas,
  (SELECT COUNT(*) FROM mentoring_sessions s JOIN referrals r ON r.id=s.referral_id WHERE r.servicio_id=sv.id AND s.status='realizada') sesiones_realizadas,
  (SELECT COUNT(*) FROM mentoring_sessions s JOIN referrals r ON r.id=s.referral_id WHERE r.servicio_id=sv.id AND s.accepted_at IS NOT NULL) sesiones_aceptadas,
  (SELECT COALESCE(SUM(s.hours),0) FROM mentoring_sessions s JOIN referrals r ON r.id=s.referral_id WHERE r.servicio_id=sv.id AND s.status='realizada') horas_ejecutadas
FROM servicios sv LEFT JOIN programs p ON p.id=sv.program_id LEFT JOIN aliados a ON a.id=sv.aliado_id`,

  bi_indicadores: `
SELECT i.id indicador_id, i.company_id, c.razon_social empresa, COALESCE(i.program_id, c.program_id) program_id, p.name programa,
  i.name indicador, i.unit unidad, i.baseline linea_base, i.goal meta, i.final resultado,
  CASE WHEN i.final IS NOT NULL AND i.baseline IS NOT NULL THEN i.final - i.baseline END variacion,
  CASE WHEN i.final IS NOT NULL AND i.baseline IS NOT NULL AND i.baseline<>0 THEN ROUND((i.final - i.baseline) * 100.0 / ABS(i.baseline), 1) END variacion_pct,
  CASE WHEN i.goal IS NOT NULL AND i.final IS NOT NULL THEN (CASE WHEN i.final >= i.goal THEN 1 ELSE 0 END) END cumple_meta,
  (SELECT v.value FROM indicator_values v WHERE v.indicator_id=i.id ORDER BY v.recorded_at DESC, v.id DESC LIMIT 1) ultimo_valor,
  (SELECT v.recorded_at FROM indicator_values v WHERE v.indicator_id=i.id ORDER BY v.recorded_at DESC, v.id DESC LIMIT 1) ultima_medicion,
  (SELECT COUNT(*) FROM indicator_values v WHERE v.indicator_id=i.id) mediciones,
  i.servicio_id, i.referral_id, (SELECT r.aliado_id FROM referrals r WHERE r.id=i.referral_id) aliado_id,
  i.updated_at fecha, ${M("i.updated_at")} mes
FROM indicators i LEFT JOIN companies c ON c.id=i.company_id LEFT JOIN programs p ON p.id=COALESCE(i.program_id, c.program_id)`,

  bi_diagnosticos: `
SELECT d.id diagnostico_id, d.company_id, c.razon_social empresa, c.program_id, p.name programa, d.stage etapa, d.status estado,
  d.score puntaje, d.level nivel, d.segment segmento, f.name formulario, d.assigned_to mentor_id, u.name asignado_a,
  COALESCE(d.completed_at, d.created_at) fecha, ${M("COALESCE(d.completed_at, d.created_at)")} mes, d.completed_at completado_en
FROM diagnostics d LEFT JOIN companies c ON c.id=d.company_id LEFT JOIN programs p ON p.id=c.program_id
  LEFT JOIN forms f ON f.id=d.form_id LEFT JOIN users u ON u.id=d.assigned_to`,

  bi_validacion: `
SELECT v.id caso_id, v.kind tipo, v.company_id, c.razon_social empresa, COALESCE(v.program_id, c.program_id) program_id, p.name programa,
  v.status estado, v.assigned_to mentor_id, ua.name asignado_a, ud.name decidido_por, v.decided_at decidido_en, v.reason motivo,
  v.created_at fecha, ${M("v.created_at")} mes,
  ROUND(julianday(COALESCE(v.decided_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))) - julianday(v.created_at), 1) dias_en_tramite,
  (SELECT COUNT(*) FROM info_requests ir WHERE ir.case_id=v.id) solicitudes_info
FROM validation_cases v LEFT JOIN companies c ON c.id=v.company_id LEFT JOIN programs p ON p.id=COALESCE(v.program_id, c.program_id)
  LEFT JOIN users ua ON ua.id=v.assigned_to LEFT JOIN users ud ON ud.id=v.decided_by`,

  bi_encuestas: `
SELECT s.id encuesta_id, s.kind tipo, s.company_id, c.razon_social empresa, c.program_id, p.name programa, s.servicio_id, sv.name servicio,
  s.aliado_id, a.name aliado, s.event_id, e.title evento, s.status estado, s.nps, s.satisfaction satisfaccion,
  CASE WHEN s.nps IS NULL THEN NULL WHEN s.nps>=9 THEN 'promotor' WHEN s.nps>=7 THEN 'pasivo' ELSE 'detractor' END categoria_nps,
  s.comment comentario, s.sent_at enviada_en, s.answered_at respondida_en, COALESCE(s.answered_at, s.sent_at) fecha,
  ${M("COALESCE(s.answered_at, s.sent_at)")} mes
FROM surveys s LEFT JOIN companies c ON c.id=s.company_id LEFT JOIN programs p ON p.id=c.program_id
  LEFT JOIN servicios sv ON sv.id=s.servicio_id LEFT JOIN aliados a ON a.id=s.aliado_id LEFT JOIN events e ON e.id=s.event_id`,

  bi_alertas: `
SELECT a.id alerta_id, a.rule_key regla, COALESCE(ar.name, a.rule_key) nombre_regla, a.company_id, c.razon_social empresa, COALESCE(a.program_id, c.program_id) program_id,
  p.name programa, a.entity entidad, a.entity_id, a.severity severidad, a.message mensaje, a.status estado, a.owner_id mentor_id,
  u.name responsable, a.created_at fecha, ${M("a.created_at")} mes, a.resolved_at resuelta_en
FROM alerts a LEFT JOIN alert_rules ar ON ar.key=a.rule_key LEFT JOIN companies c ON c.id=a.company_id
  LEFT JOIN programs p ON p.id=COALESCE(a.program_id, c.program_id) LEFT JOIN users u ON u.id=a.owner_id`,

  bi_cierres: `
SELECT cl.id cierre_id, cl.company_id, c.razon_social empresa, COALESCE(cl.program_id, c.program_id) program_id, p.name programa,
  cl.referral_id, r.aliado_id, sv.name servicio, cl.status estado, cl.result resultado, ap.name aprobado_por, cl.approved_at aprobado_en,
  cl.created_at fecha, ${M("cl.created_at")} mes
FROM closures cl LEFT JOIN companies c ON c.id=cl.company_id LEFT JOIN programs p ON p.id=COALESCE(cl.program_id, c.program_id)
  LEFT JOIN referrals r ON r.id=cl.referral_id LEFT JOIN servicios sv ON sv.id=r.servicio_id LEFT JOIN users ap ON ap.id=cl.approved_by`,

  bi_rutas: `
SELECT cr.id ruta_empresa_id, cr.company_id, c.razon_social empresa, c.program_id, p.name programa, cr.name ruta, cr.status estado,
  cr.origin origen, cr.approved_at aprobada_en, cr.closed_at cerrada_en, cr.close_result resultado_cierre, cr.created_at fecha, ${M("cr.created_at")} mes,
  (SELECT COUNT(*) FROM company_route_steps st WHERE st.company_route_id=cr.id) pasos,
  (SELECT COUNT(*) FROM company_route_steps st WHERE st.company_route_id=cr.id AND st.status='completado') pasos_completados
FROM company_routes cr LEFT JOIN companies c ON c.id=cr.company_id LEFT JOIN programs p ON p.id=c.program_id`,

  bi_documentos: `
SELECT d.id documento_id, d.company_id, c.razon_social empresa, c.program_id, p.name programa, d.session_id, s.title sesion, d.event_id, e.title evento,
  CASE WHEN d.session_id IS NOT NULL THEN 'Sesión' WHEN d.event_id IS NOT NULL THEN 'Evento' WHEN d.company_id IS NOT NULL THEN 'Empresa' ELSE 'General' END proceso,
  d.name nombre, d.kind tipo, d.mime, d.size tamano, d.onbase_ref referencia_onbase, d.onbase_status estado_onbase, ub.name subido_por,
  CASE WHEN d.accepted_at IS NOT NULL THEN 1 ELSE 0 END aceptado, ua.name aceptado_por, d.accepted_at aceptado_en, d.accepted_ip ip_aceptacion,
  s.mentor_id, d.created_at fecha, ${M("d.created_at")} mes
FROM documents d LEFT JOIN companies c ON c.id=d.company_id LEFT JOIN programs p ON p.id=c.program_id LEFT JOIN mentoring_sessions s ON s.id=d.session_id
  LEFT JOIN events e ON e.id=d.event_id LEFT JOIN users ub ON ub.id=d.uploaded_by LEFT JOIN users ua ON ua.id=d.accepted_by`,

  bi_notificaciones: `
SELECT n.id notificacion_id, n.channel canal, n.template_key plantilla, n.status estado, n.sent_at fecha, ${M("n.sent_at")} mes,
  n.delivered_at entregada_en, n.read_at leida_en, CASE WHEN n.error IS NOT NULL AND n.error<>'' THEN 1 ELSE 0 END con_error
FROM notifications n`,

  bi_auditoria: `
SELECT l.id registro_id, l.ts fecha, ${M("l.ts")} mes, l.user_id, l.user_email usuario, l.action accion, l.entity entidad, l.entity_id, l.ip
FROM audit_log l`,

  bi_snapshots: `SELECT day dia, metric metrica, value valor, taken_at tomado_en FROM ana_snapshots`,
};

export const BI_VIEWS = Object.keys(VIEWS);

export const SQL = `
CREATE TABLE IF NOT EXISTS ana_snapshots (day TEXT, metric TEXT, value REAL, taken_at TEXT, PRIMARY KEY(day, metric));
-- Conclusiones y recomendaciones del equipo para el informe final por empresa (FUN-93)
CREATE TABLE IF NOT EXISTS ana_report_notes (company_id INTEGER PRIMARY KEY, conclusions TEXT, recommendations TEXT, updated_by INTEGER, updated_at TEXT);
${Object.entries(VIEWS).map(([name, sql]) => `DROP VIEW IF EXISTS ${name};\nCREATE VIEW ${name} AS ${sql.trim()};`).join("\n")}
`;
