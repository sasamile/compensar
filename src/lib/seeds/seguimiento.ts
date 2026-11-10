/** Datos de demostración del módulo seguimiento. Idempotente: plantillas y reglas con INSERT OR IGNORE; el resto una sola vez (bandera en settings). */
import crypto from "node:crypto";
import { get, insert, run, setting, setSetting, tx } from "../db";
import { RULES } from "../alerts";

const TEMPLATES: [string, string, string, string][] = [
  ["alerta", "Alerta de seguimiento", "Alerta {{severity}}: {{rule}}", "{{message}} Empresa: {{company}}. Revisa el tablero de seguimiento: {{url}}"],
  ["encuesta", "Encuesta de satisfacción", "¿Cómo te fue con {{name}}?", "Cuéntanos tu experiencia con «{{name}}». Responder toma 2 minutos: {{url}}"],
  ["mensaje_nuevo", "Nuevo mensaje mentor-empresa", "Nuevo mensaje de {{from}}", "{{from}} te escribió: «{{preview}}». Responde en la plataforma: {{url}}"],
  ["tarea_asignada", "Tarea asignada", "Nueva tarea: {{title}}", "{{by}} te asignó la tarea «{{title}}» con vencimiento {{due}}. Detalle: {{url}}"],
];

const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const id = (sql: string, ...p: any[]) => get<any>(sql, ...p)?.id as number | undefined;

export function seed() {
  for (const [key, name, subject, body] of TEMPLATES)
    for (const ch of ["correo", "sms", "whatsapp"])
      run("INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,1)", key, ch, name, ch === "correo" ? subject : "", body);
  for (const [key, r] of Object.entries(RULES))
    run("INSERT OR IGNORE INTO alert_rules(key,name,description,threshold,owner_role,channel,active) VALUES(?,?,?,?,?,?,1)", key, r.name, r.description, r.threshold, r.owner, r.channel);

  if (setting("seed_seguimiento") === "1") return;
  const pEmp = id("SELECT id FROM programs WHERE name='Emprendimiento'");
  const pTer = id("SELECT id FROM programs WHERE name='Territorio MIPYME'");
  const c1 = id("SELECT id FROM companies WHERE nit='900111222'"), c2 = id("SELECT id FROM companies WHERE nit='800333444'"), c3 = id("SELECT id FROM companies WHERE nit='901555666'");
  const sCom = get<any>("SELECT * FROM servicios WHERE name='Mentoría en estrategia comercial'");
  const sFin = get<any>("SELECT * FROM servicios WHERE name='Consultoría financiera'");
  const sPlan = get<any>("SELECT * FROM servicios WHERE name='Plan de negocio para emprendedores'");
  const user = (email: string) => id("SELECT id FROM users WHERE email=?", email);
  const admin = user("admin@compensar.test"), gestor = user("gestor@compensar.test"), m1 = user("mentor1@compensar.test");
  const e1 = user("empresa1@laespiga.test"), e2 = user("empresa2@textiles.test");
  if (!pTer || !c1 || !c2 || !sCom || !sFin || !m1 || !gestor) return; // la semilla base no está completa

  tx(() => {
    // ---- Definiciones de indicadores (por programa y por servicio) ----
    const def = (program: number | null, servicio: number | null, name: string, unit: string, kind: string, formula: string, base: number | null, goal: number | null, per: string) =>
      insert("INSERT INTO indicator_defs(program_id,servicio_id,name,unit,kind,formula,baseline_default,goal,periodicity,active) VALUES(?,?,?,?,?,?,?,?,?,1)",
        program, servicio, name, unit, kind, formula, base, goal, per);
    const dVentas = def(pTer, null, "Ventas mensuales", "millones COP", "impacto", "Ventas brutas del mes según reporte contable de la empresa", null, null, "mensual");
    const dEmpleo = def(pTer, null, "Empleos formales", "empleos", "impacto", "Trabajadores con aportes a seguridad social (PILA) al cierre del trimestre", null, null, "trimestral");
    def(pTer, null, "Sesiones de acompañamiento realizadas", "sesiones", "gestion", "Sesiones con seguimiento registrado y aceptadas por la empresa", 0, 6, "mensual");
    const dClientes = def(null, sCom.id, "Nuevos clientes", "clientes", "impacto", "Clientes nuevos acumulados desde el inicio de la mentoría", 0, 15, "mensual");
    const dMargen = def(null, sFin.id, "Margen neto", "%", "impacto", "Utilidad neta / ventas netas del periodo × 100", 8, 15, "mensual");
    def(null, sFin.id, "Días de caja disponibles", "días", "gestion", "Efectivo disponible / gasto operativo diario promedio", 10, 30, "mensual");
    if (pEmp && sPlan) {
      def(pEmp, null, "Emprendimientos formalizados", "%", "impacto", "Emprendedores con registro mercantil / emprendedores atendidos × 100", 0, 60, "semestral");
      def(null, sPlan.id, "Avance del plan de negocio", "%", "gestion", "Secciones del plan de negocio validadas por el mentor / total × 100", 0, 100, "mensual");
    }

    // ---- Indicadores aplicados a empresas + valores históricos ----
    const apply = (company: number, defId: number, servicio: number | null, name: string, unit: string, base: number, goal: number,
      values: [number, number, string, number | undefined][]) => {
      const last = values[values.length - 1];
      const iid = insert("INSERT INTO indicators(company_id,program_id,name,baseline,final,goal,updated_by,updated_at,def_id,servicio_id,unit) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        company, pTer, name, base, last ? last[1] : null, goal, last?.[3] ?? null, last ? ago(last[0]) : null, defId, servicio, unit);
      for (const [d, v, note, by] of values)
        insert("INSERT INTO indicator_values(indicator_id,value,note,recorded_by,recorded_at) VALUES(?,?,?,?,?)", iid, v, note, by ?? null, ago(d));
      return iid;
    };
    apply(c1, dVentas, null, "Ventas mensuales", "millones COP", 18, 27, [
      [175, 18.5, "Ventas de mayo según libro auxiliar", m1], [145, 19.2, "Ventas de junio", m1], [115, 20.1, "Ventas de julio; inicia domicilios", m1],
      [85, 21.4, "Ventas de agosto", e1], [55, 22.0, "Ventas de septiembre", m1], [20, 23.3, "Ventas de octubre con el nuevo canal empresarial", m1]]);
    apply(c1, dClientes, sCom.id, "Nuevos clientes", "clientes", 0, 15, [
      [140, 2, "Dos cafeterías del barrio", m1], [110, 4, "Convenio con oficina vecina", m1], [80, 5, "Nuevo cliente por domicilios", e1], [50, 7, "Dos clientes empresariales", m1], [18, 9, "Pedidos recurrentes de dos hoteles", m1]]);
    apply(c1, dMargen, sFin.id, "Margen neto", "%", 8, 14, [
      [120, 8.2, "Primer cálculo con la plantilla de costos", gestor], [90, 9.0, "Ajuste de precios de pan especial", gestor], [60, 9.5, "Reducción de mermas", m1], [25, 10.4, "Compra consolidada de harina", m1]]);
    apply(c2, dVentas, null, "Ventas mensuales", "millones COP", 45, 60, [
      [170, 46, "Ventas de mayo", gestor], [140, 47.5, "Ventas de junio", gestor], [110, 49, "Ventas de julio", e2], [80, 50.2, "Ventas de agosto", gestor], [40, 52, "Ventas de septiembre", gestor]]);
    apply(c2, dEmpleo, null, "Empleos formales", "empleos", 12, 16, [[160, 12, "PILA de mayo", gestor], [70, 13, "Ingreso de una operaria", gestor], [10, 14, "PILA de octubre", e2]]);
    apply(c2, dMargen, sFin.id, "Margen neto", "%", 10, 15, [[130, 10.5, "Estado de resultados del trimestre", gestor], [75, 11.0, "Ajuste de costos de tela", gestor]]);

    // ---- Tareas (una vencida) ----
    const task = (title: string, desc: string, company: number | null, assignee: number, due: number, status: string, by: number, done?: number) =>
      insert("INSERT INTO tasks(title,description,company_id,program_id,assignee_id,due_at,status,created_by,created_at,done_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        title, desc, company, pTer, assignee, ago(-due), status, by, ago(20), done != null ? ago(done) : null);
    task("Enviar plantilla de costos a La Espiga", "Compartir la plantilla de costeo y revisar con la empresa los precios del pan especial.", c1, m1, -5, "pendiente", gestor);
    task("Consolidar indicadores de Textiles del Norte", "Revisar soportes de ventas y empleo del trimestre.", c2, gestor, 7, "en_curso", gestor);
    task("Preparar informe mensual de mentorías", "Informe para la coordinación del programa Territorio MIPYME.", null, gestor, 15, "pendiente", admin ?? gestor);
    task("Verificar evidencias de la sesión de diagnóstico", "Confirmar que las evidencias quedaron cargadas en OnBase.", c1, m1, -10, "hecha", gestor, 8);

    // ---- Biblioteca ----
    const content = (title: string, desc: string, kind: string, url: string, program: number | null, servicio: number | null, tags: string) =>
      insert("INSERT INTO contents(title,description,kind,url,program_id,servicio_id,tags,active,created_by,created_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
        title, desc, kind, url, program, servicio, tags, admin ?? gestor, ago(30));
    content("Guía: cómo construir tu flujo de caja", "Paso a paso para proyectar entradas y salidas de efectivo a 12 semanas.", "documento", "https://www.compensar.com/empresas", pTer, sFin.id, "finanzas, flujo de caja, liquidez");
    content("Plantilla de costeo y precios", "Hoja de cálculo para costear productos y fijar precios con margen objetivo.", "herramienta", "https://www.compensar.com/empresas", pTer, sFin.id, "costos, precios, margen");
    content("Video: técnicas de venta consultiva", "Cómo descubrir necesidades del cliente y cerrar ventas B2B (18 min).", "video", "https://www.youtube.com/results?search_query=venta+consultiva", pTer, sCom.id, "ventas, clientes, comercial");
    content("Preguntas frecuentes de Territorio MIPYME", "Base de conocimiento: requisitos, servicios, mentorías, certificados y cierres.", "enlace", "https://www.compensar.com/empresas", pTer, null, "base de conocimiento, programa, preguntas frecuentes");
    if (pEmp) content("Lienzo de modelo de negocio", "Plantilla y guía para validar la propuesta de valor del emprendimiento.", "herramienta", "https://www.compensar.com/empresas", pEmp, sPlan?.id ?? null, "emprendimiento, modelo de negocio");

    // ---- Hilo de mensajes mentor1 ↔ La Espiga ----
    const msg = (from: number, body: string, d: number, read: boolean) =>
      insert("INSERT INTO messages(company_id,mentor_id,from_user_id,body,sent_at,read_at) VALUES(?,?,?,?,?,?)", c1, m1, from, body, ago(d), read ? ago(d - 0.2) : null);
    msg(m1, "Hola Laura, te comparto la plantilla de flujo de caja para que la revisemos en la próxima sesión.", 6, true);
    if (e1) msg(e1, "Gracias Mateo, la revisamos con el equipo esta semana.", 5.5, true);
    msg(m1, "Recuerda registrar las ventas de octubre en el indicador de ventas mensuales.", 2, true);
    if (e1) msg(e1, "Listo, ya quedaron registradas. ¿Podemos mover la próxima sesión al jueves en la tarde?", 1, false);

    // ---- Encuestas respondidas (para resultados y análisis de temas) ----
    const survey = (kind: string, company: number, servicio: any, event: number | null, nps: number | null, sat: number | null, asp: number[] | null, comment: string | null, d: number, userId?: number) =>
      insert("INSERT INTO surveys(kind,event_id,company_id,servicio_id,aliado_id,user_id,token,status,nps,satisfaction,answers,comment,sent_at,answered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        kind, event, company, servicio?.id ?? null, servicio?.aliado_id ?? null, userId ?? null, crypto.randomBytes(18).toString("base64url"),
        nps == null ? "enviada" : "respondida", nps, sat, asp ? JSON.stringify({ contenido: asp[0], mentor: asp[1], puntualidad: asp[2] }) : null, comment, ago(d + 2), nps == null ? null : ago(d));
    survey("servicio", c1, sCom, null, 10, 5, [5, 5, 4], "El mentor explicó muy bien las herramientas de ventas. Las herramientas de seguimiento de clientes fueron muy útiles para el negocio.", 40, e1);
    survey("servicio", c2, sFin, null, 6, 3, [4, 3, 2], "Faltó puntualidad en algunas sesiones. El contenido de flujo de caja fue útil, pero me gustaría tener más sesiones presenciales.", 35, e2);
    if (c3) survey("servicio", c3, sCom, null, 9, 4, [4, 5, 4], "Buen acompañamiento del mentor; el flujo de caja quedó claro. Me gustaría más sesiones presenciales y más ejemplos prácticos.", 28);
    survey("cierre", c1, sFin, null, 8, 4, [5, 4, 3], "Las herramientas de flujo de caja y de costos son prácticas; la puntualidad del consultor podría mejorar.", 15, e1);
    const ev = id("SELECT id FROM events ORDER BY id LIMIT 1");
    if (ev) survey("evento", c2, null, ev, 7, 4, [4, 4, 5], "Ejemplos prácticos muy útiles para el flujo de caja de la empresa.", 10, e2);
    if (c3) survey("servicio", c3, sFin, null, null, null, null, null, 1); // pendiente de respuesta

    setSetting("seed_seguimiento", "1");
  });
}
