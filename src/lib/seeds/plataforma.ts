import { get, insert, now, run, setSetting, setting } from "../db";

/**
 * Datos de demostración del módulo plataforma (idempotente).
 * Plantillas nuevas (aprobadas) para los tres canales:
 *  - cargue_terminado: aviso al terminar un cargue masivo en segundo plano (RNF-REN-07).
 *  - vinculacion_empresa: un contacto existente queda vinculado a otra empresa (RF-EMP-03).
 */
const TEMPLATES: [string, string, string][] = [
  ["cargue_terminado", "Tu cargue de empresas terminó", "Hola {{name}}, el cargue «{{file}}» ({{total}} filas) terminó: {{result}}. Revisa el detalle y los errores por fila en {{url}}."],
  ["vinculacion_empresa", "Fuiste vinculado/a a otra empresa", "Hola {{name}}, ahora también eres contacto de {{company}} en {{program}}. Ingresa con tu cuenta de siempre y elige la empresa en el selector de la parte superior."],
];

export function seed() {
  seedHistory();
  for (const [key, subject, body] of TEMPLATES)
    for (const ch of ["correo", "sms", "whatsapp"])
      run("INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,1)", key, ch, key, ch === "correo" ? subject : "", body);
}

/**
 * Historial de demostración (6 meses de sesiones realizadas y aceptadas) para que los tableros y
 * gráficas muestren tendencias durante las pruebas. Se inserta una sola vez.
 */
export function seedHistory() {
  if (process.env.DEMO_HISTORY === "0" || setting("demo_history_seeded") === "1") return;
  const mentor = get<any>("SELECT id FROM users WHERE email='mentor1@compensar.test'");
  const rep = get<any>("SELECT id, company_id FROM users WHERE email='empresa1@laespiga.test'");
  if (!mentor || !rep?.company_id) return;
  const program = get<any>("SELECT program_id FROM companies WHERE id=?", rep.company_id)?.program_id ?? null;
  const topics = ["Diagnóstico comercial", "Estructura de costos", "Plan de ventas", "Canales digitales", "Flujo de caja", "Indicadores del negocio"];
  const perMonth = [2, 3, 3, 4, 5, 6]; // tendencia creciente: del mes más antiguo al más reciente
  const today = new Date();
  perMonth.forEach((n, k) => {
    const monthsAgo = 6 - k;
    for (let j = 0; j < n; j++) {
      const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo + 1, 3 + j * 4, 15, 0);
      if (d > today) continue;
      const accepted = j < n - (k % 2); // casi todas aceptadas
      insert(`INSERT INTO mentoring_sessions(company_id,mentor_id,program_id,title,scheduled_at,duration_min,modality,status,topics,commitments,results,hours,registered_by,accepted_by,accepted_at,accepted_ip,created_by,created_at)
        VALUES(?,?,?,?,?,60,'virtual','realizada',?,?,?,1,?,?,?,?,?,?)`,
        rep.company_id, mentor.id, program, `${topics[(k + j) % topics.length]} (historial)`, d.toISOString(),
        "Revisión de avances y próximos pasos", "Compromisos registrados en la sesión", "Avance según lo planeado", mentor.id,
        accepted ? rep.id : null, accepted ? new Date(d.getTime() + 86400000).toISOString() : null, accepted ? "181.51.34.221" : null, mentor.id, now());
    }
  });
  setSetting("demo_history_seeded", "1");
}
