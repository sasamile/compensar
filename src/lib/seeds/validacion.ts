/** Datos de demostración del módulo Validación de requisitos + Rutas de acompañamiento. Idempotente. */
import fs from "node:fs";
import path from "node:path";
import { all, get, insert, run, setSetting, tx } from "@/lib/db";
import { runAutoValidationLocal } from "@/lib/validation";

const TEMPLATES: [string, string, string][] = [
  ["validacion_aprobada", "Tu solicitud fue aprobada", "{{name}}, tu {{request}} en {{program}} fue aprobada. {{reason}}"],
  ["validacion_rechazada", "Tu solicitud no fue aprobada", "{{name}}, tu {{request}} en {{program}} no fue aprobada. Motivo: {{reason}}"],
  ["validacion_ajustes", "Tu solicitud requiere ajustes", "{{name}}, tu {{request}} en {{program}} requiere ajustes: {{reason}}. Plazo: {{due}}. Responde en {{url}}"],
  ["solicitud_informacion", "Compensar solicita información adicional", "{{name}}, para continuar con tu {{request}} necesitamos: {{message}}. Plazo: {{due}}. Responde en {{url}}"],
  ["recordatorio_informacion", "Recordatorio: información pendiente", "{{name}}, recuerda enviar: {{message}}. El plazo vence el {{due}}. Responde en {{url}}"],
  ["solicitud_vencida", "Venció el plazo de la solicitud de información", "{{name}}: venció el plazo ({{due}}) para enviar «{{message}}» de tu {{request}}. La solicitud vuelve a revisión de Compensar."],
  ["informacion_recibida", "Información recibida en la solicitud #{{case}}", "{{name}}, el solicitante respondió la solicitud de información del caso #{{case}}. Revísala en {{url}}"],
  ["ruta_asignada", "Tienes una ruta de acompañamiento", "{{name}}, se activó tu ruta «{{route}}». Consulta etapas, servicios y avance en {{url}}"],
  ["ruta_cerrada", "Tu ruta de acompañamiento fue cerrada", "{{name}}, la ruta «{{route}}» fue cerrada. Resultado: {{result}}. Consulta el detalle en {{url}}"],
];

// nit, razón social, afiliado, meses_afiliacion, al_dia_parafiscales, ventas_brutas, inscrito_agencia, aportes_meses_3a, cesante
const REGISTRY: [string, string, number, number, number | null, number, number, number, number][] = [
  ["900111222", "Panadería La Espiga SAS", 1, 38, 1, 420000000, 1, 36, 0],
  ["800333444", "Textiles del Norte Ltda", 1, 72, 1, 1850000000, 1, 36, 0],
  ["901555666", "Tecnosoft Colombia SAS", 1, 50, 1, 5200000000, 1, 36, 0],
  ["860777888", "Ferretería El Tornillo", 1, 4, 1, 95000000, 1, 4, 0],          // no cumple: < 6 meses de afiliación
  ["900999000", "Café Origen SAS", 1, 14, 1, 180000000, 1, 14, 0],
  ["901222333", "Confecciones Aurora SAS", 1, 24, 0, 300000000, 1, 24, 0],      // no cumple: no está al día en parafiscales
  ["830444555", "Logística Andina SAS", 1, 10, 1, 0, 0, 10, 0],                 // no cumple: sin ventas y sin inscripción en la Agencia
  ["1020304050", "Juan Emprendedor", 0, 0, null, 0, 1, 18, 1],                  // Emprendimiento: cumple
  ["52111222", "María Cesante", 0, 0, null, 0, 1, 8, 1],                        // Emprendimiento: no cumple aportes
  ["79888777", "Pedro Empleado", 1, 30, 1, 0, 1, 30, 0],                        // Emprendimiento: no cumple cesante
];

const RULES: Record<string, [string, string, string, string, string][]> = {
  "Territorio MIPYME": [
    ["ter_afiliacion", "Afiliación a Compensar ≥ 6 meses", "meses_afiliacion", ">=", "6"],
    ["ter_parafiscales", "Al día en parafiscales y seguridad social", "al_dia_parafiscales", "=", "1"],
    ["ter_agencia", "Inscrita en la Agencia de Empleo y Fomento con un asesor", "inscrito_agencia", "=", "1"],
    ["ter_ventas", "Certificado de ventas brutas (ventas > 0)", "ventas_brutas", ">", "0"],
  ],
  Emprendimiento: [
    ["emp_aportes", "Un año de aportes a caja en los últimos 3 años", "aportes_meses_3a", ">=", "12"],
    ["emp_cesante", "Cesante (desempleado e inactivo en EPS)", "cesante", "=", "1"],
  ],
};

const CHECKLISTS: Record<string, string[]> = {
  "Territorio MIPYME": ["Certificado de ventas brutas revisado", "Certificado de afiliación a Compensar (≥ 6 meses)", "Paz y salvo de parafiscales y seguridad social", "Inscripción en la Agencia de Empleo y Fomento con asesor", "RUT y Cámara de Comercio vigentes"],
  Emprendimiento: ["Historia de aportes (12 meses en los últimos 3 años)", "Certificado de inactividad en EPS / cesantía", "Documento de identidad", "Idea de negocio descrita"],
};

// pasos por plantilla: [nombre, tipo, servicio (nombre) | evento (título) | null, indicador, meta]
const STEPS: Record<string, [string, string, string | null, string, number][]> = {
  "Ruta de ventas": [
    ["Diagnóstico comercial con el mentor", "actividad", null, "Plan comercial elaborado (%)", 100],
    ["Mentoría en estrategia comercial", "servicio", "Mentoría en estrategia comercial", "Ventas mensuales (millones COP)", 30],
    ["Charla: ventas en canales digitales", "curso", "Charla: ventas en canales digitales", "Asistencia (%)", 80],
    ["Plan de captación de nuevos clientes", "actividad", null, "Nuevos clientes por mes", 10],
  ],
  "Ruta de costos y precios": [
    ["Taller de finanzas para mipymes", "curso", "Taller de finanzas para mipymes", "Asistencia (%)", 80],
    ["Consultoría financiera", "servicio", "Consultoría financiera", "Margen neto (%)", 15],
    ["Curso de costos y precios", "curso", "Curso de costos y precios", "Productos costeados (%)", 100],
    ["Estructura de precios implementada", "actividad", null, "Productos con precio revisado", 20],
  ],
  "Ruta de nómina y SST": [
    ["Capacitación en talento humano", "servicio", "Capacitación en talento humano", "Rotación de personal (%)", 10],
    ["Autoevaluación de estándares mínimos de SST", "actividad", null, "Cumplimiento de estándares SST (%)", 85],
    ["Nómina electrónica al día", "actividad", null, "Meses de nómina electrónica al día", 6],
  ],
  "Ruta de e-commerce": [
    ["Charla: ventas en canales digitales", "curso", "Charla: ventas en canales digitales", "Asistencia (%)", 80],
    ["Tienda en línea publicada", "actividad", null, "Catálogo publicado (%)", 100],
    ["Mentoría en estrategia comercial (canal digital)", "servicio", "Mentoría en estrategia comercial", "Ventas en línea (millones COP)", 5],
  ],
};

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const uid = (email: string) => get<any>("SELECT id FROM users WHERE email=?", email)?.id ?? null;

export function seed() {
  // ensureSeed() se invoca en cada render del layout: basta con una pasada por proceso (además cada bloque es idempotente)
  const g = globalThis as any;
  if (g.__seedValidacion) return;
  if (!get("SELECT 1 FROM programs LIMIT 1")) return;
  g.__seedValidacion = true;
  tx(() => {
    // Plantillas de notificación (correo / sms / whatsapp aprobadas)
    for (const [key, subject, body] of TEMPLATES)
      for (const ch of ["correo", "sms", "whatsapp"])
        run("INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,1)", key, ch, key, ch === "correo" ? subject : "", body);

    // Parámetros
    for (const [k, v] of [["ai_enabled", "0"], ["val_sla_days", "5"], ["val_reminder_hours", "48"], ["val_info_days", "5"]])
      if (!get("SELECT 1 FROM settings WHERE key=?", k)) setSetting(k, v);

    // Réplica de Gestión de Clientes: NIT conocidos + todas las empresas sembradas
    for (const r of REGISTRY)
      run("INSERT OR IGNORE INTO client_registry(nit,razon_social,afiliado,meses_afiliacion,al_dia_parafiscales,ventas_brutas,inscrito_agencia,aportes_meses_3a,cesante) VALUES(?,?,?,?,?,?,?,?,?)", ...r);
    for (const c of all<any>("SELECT nit, razon_social FROM companies WHERE COALESCE(source,'') NOT IN ('autorregistro','manual','cargue_masivo')")) {
      const h = [...c.nit].reduce((a: number, ch: string) => a + Number(ch || 0), 0);
      run("INSERT OR IGNORE INTO client_registry(nit,razon_social,afiliado,meses_afiliacion,al_dia_parafiscales,ventas_brutas,inscrito_agencia,aportes_meses_3a,cesante) VALUES(?,?,1,?,1,?,1,?,0)",
        c.nit, c.razon_social, 12 + (h % 40), 100000000 + h * 7000000, 12 + (h % 24));
    }

    // Reglas y listas de chequeo por programa
    for (const [pname, rules] of Object.entries(RULES)) {
      const p = get<any>("SELECT id FROM programs WHERE name=?", pname);
      if (!p) continue;
      if (!get("SELECT 1 FROM validation_rules WHERE program_id=?", p.id))
        for (const [key, name, field, op, value] of rules)
          insert("INSERT INTO validation_rules(program_id,key,name,field,operator,value,active) VALUES(?,?,?,?,?,?,1)", p.id, key, name, field, op, value);
      if (!get("SELECT 1 FROM settings WHERE key=?", `val_checklist_${p.id}`)) setSetting(`val_checklist_${p.id}`, JSON.stringify(CHECKLISTS[pname]));
    }

    // Pasos de las plantillas existentes
    for (const [rname, steps] of Object.entries(STEPS)) {
      const r = get<any>("SELECT id FROM rutas WHERE name=?", rname);
      if (!r || get("SELECT 1 FROM route_template_steps WHERE ruta_id=?", r.id)) continue;
      steps.forEach(([name, kind, ref, indicator, goal], i) => {
        const sv = kind === "servicio" && ref ? get<any>("SELECT id FROM servicios WHERE name=?", ref)?.id : null;
        const ev = kind === "curso" && ref ? get<any>("SELECT id FROM events WHERE title=?", ref)?.id : null;
        insert("INSERT INTO route_template_steps(ruta_id,ord,name,kind,servicio_id,event_id,indicator,goal) VALUES(?,?,?,?,?,?,?,?)", r.id, i + 1, name, kind, sv ?? null, ev ?? null, indicator, goal);
      });
    }
  });

  // Casos de validación de demostración (solo la primera vez; otros módulos pueden haber creado casos de inscripción)
  if (!get("SELECT 1 FROM validation_cases WHERE kind='empresa' LIMIT 1")) {
    const aux = uid("aux@compensar.test");
    const ids: number[] = [];
    tx(() => {
      for (const [nit, days] of [["900111222", 40], ["800333444", 35], ["901555666", 30]] as const) {
        const c = get<any>("SELECT id, program_id FROM companies WHERE nit=?", nit);
        if (!c || get("SELECT 1 FROM validation_cases WHERE kind='empresa' AND company_id=?", c.id)) continue;
        const id = insert("INSERT INTO validation_cases(kind,company_id,program_id,status,assigned_to,checklist,observations,decided_by,decided_at,reason,created_at,updated_at) VALUES('empresa',?,?,'aprobado',?,?,?,?,?,?,?,?)",
          c.id, c.program_id, aux, JSON.stringify({ items: (CHECKLISTS["Territorio MIPYME"]).map((label) => ({ label, ok: true })), by: aux, at: ago(days - 2) }),
          "Soportes completos.", aux, ago(days - 2), "Cumple los requisitos del programa", ago(days), ago(days - 2));
        ids.push(id);
      }
      for (const [nit, days, assign] of [["860777888", 6, true], ["900999000", 1, false]] as const) {
        const c = get<any>("SELECT id, program_id FROM companies WHERE nit=? AND status='pendiente'", nit);
        if (!c || get("SELECT 1 FROM validation_cases WHERE kind='empresa' AND company_id=?", c.id)) continue;
        ids.push(insert("INSERT INTO validation_cases(kind,company_id,program_id,status,assigned_to,created_at,updated_at) VALUES('empresa',?,?,'pendiente',?,?,?)",
          c.id, c.program_id, assign ? aux : null, ago(days), ago(days)));
      }
    });
    for (const id of ids) runAutoValidationLocal(id);
  }

  // Ruta activa de La Espiga con avance parcial (solo la primera vez)
  const espiga = get<any>("SELECT id FROM companies WHERE nit='900111222'");
  const ventas = get<any>("SELECT id, name FROM rutas WHERE name='Ruta de ventas'");
  if (espiga && ventas && !get("SELECT 1 FROM company_routes WHERE company_id=?", espiga.id)) {
    const m1 = uid("mentor1@compensar.test");
    tx(() => {
      const ref = "ONB-SEEDRUTA01";
      const file = path.join(process.cwd(), "storage", ref + ".pdf");
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (!fs.existsSync(file)) fs.writeFileSync(file, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
      } catch { /* almacenamiento de solo lectura: el documento queda en cola */ }
      const doc = insert("INSERT INTO documents(company_id,name,kind,mime,size,onbase_ref,onbase_status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        espiga.id, "plan-comercial-la-espiga.pdf", "evidencia_ruta", "application/pdf", 120, ref, "almacenado", m1, ago(12));
      const rid = insert("INSERT INTO company_routes(company_id,ruta_id,name,status,origin,approved_by,approved_at,created_by,created_at) VALUES(?,?,?,'activa','plantilla',?,?,?,?)",
        espiga.id, ventas.id, "Ruta de ventas — La Espiga", m1, ago(20), m1, ago(21));
      const log = (step: number | null, action: string, status: string | null, note: string, at: string, value: number | null = null, docId: number | null = null) =>
        insert("INSERT INTO route_step_log(company_route_id,step_id,action,status,note,value,doc_id,user_id,at) VALUES(?,?,?,?,?,?,?,?,?)", rid, step, action, status, note, value, docId, m1, at);
      log(null, "creada", "propuesta", "Desde plantilla: Ruta de ventas", ago(21));
      log(null, "activada", "activa", "Ruta aprobada y activada", ago(20));
      const tsteps = all<any>("SELECT * FROM route_template_steps WHERE ruta_id=? ORDER BY ord", ventas.id);
      const state: [string, number | null, number | null, string | null, number | null][] = [
        ["completado", 0, 100, ago(12), doc], ["en_curso", 18, 22, null, null], ["pendiente", 40, null, null, null], ["pendiente", 2, null, null, null],
      ];
      tsteps.forEach((s, i) => {
        const [st, base, cur, done, ev] = state[i] ?? ["pendiente", null, null, null, null];
        const sid = insert("INSERT INTO company_route_steps(company_route_id,ord,name,kind,servicio_id,event_id,indicator,baseline,goal,current,status,due_at,completed_at,evidence_doc_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          rid, s.ord, s.name, s.kind, s.servicio_id, s.event_id, s.indicator, base, s.goal, cur, st, new Date(Date.now() + (i * 20 - 5) * 86400000).toISOString(), done, ev);
        if (st === "completado") {
          log(sid, "en_curso", "en_curso", "Inicio de la etapa", ago(18));
          log(sid, "completado", "completado", "Se elaboró y validó el plan comercial con la gerente", ago(12), 100, doc);
        }
        if (st === "en_curso") log(sid, "en_curso", "en_curso", "Primeras 3 sesiones de mentoría realizadas; ventas pasaron de 18 a 22 millones", ago(5), 22);
      });
      if (!get("SELECT 1 FROM company_items WHERE company_id=? AND kind='ruta' AND ref_id=?", espiga.id, rid))
        insert("INSERT INTO company_items(company_id,kind,ref_id,label,status,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)", espiga.id, "ruta", rid, "Ruta de ventas — La Espiga", "en curso", m1, ago(20));
    });
  }
}
