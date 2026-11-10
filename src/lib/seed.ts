import { get, insert, run, now, setSetting, tx } from "./db";
import { hashPassword } from "./auth";
import { nitDv } from "./util";
import { seedModules } from "./seeds";

export const DEMO_PASSWORD = "Demo2026!";

const ROLES: Record<string, { name: string; description: string; internal: number; perms: string[] }> = {
  admin: { name: "Administrador", description: "Configura y opera toda la organización", internal: 1, perms: ["*"] },
  aux_admin: { name: "Auxiliar Administrativo", description: "Inscritos, asistencia, certificados y activación de empresas", internal: 1,
    perms: ["attendance.manage", "registrations.view", "registrations.export_pii", "companies.view", "companies.activate", "report:R-01", "report:R-04", "directory.view", "forms.responses", "validation.manage", "validation.view", "documents.view", "library.view", "analytics.view", "report:R-13"] },
  evaluador: { name: "Evaluador", description: "Evalúa empresas asignadas", internal: 1, perms: ["companies.view", "companies.evaluate", "directory.view", "validation.manage", "validation.view", "diagnostics.view", "documents.view", "report:R-13"] },
  gestor_contenidos: { name: "Gestor de Contenidos", description: "Crea y publica eventos y landings", internal: 1,
    perms: ["events.manage", "registrations.view", "report:R-04", "directory.view", "forms.manage", "forms.responses", "library.manage", "library.view", "surveys.view", "report:R-15"] },
  gestor_cursos: { name: "Gestor de Cursos", description: "Cursos, inscripciones y asistencia", internal: 1,
    perms: ["events.manage", "attendance.manage", "registrations.view", "report:R-04", "directory.view", "forms.responses", "library.view", "surveys.view"] },
  gestor_mentorias: { name: "Gestor de Mentorías", description: "Asigna mentores, aprueba cierres", internal: 1,
    perms: ["users.manage.mentors", "companies.view", "companies.activate", "mentors.assign", "items.assign", "sessions.view", "sessions.schedule",
      "referrals.create", "referrals.assign", "closure.manage", "closure.approve", "registrations.export_pii", "directory.view",
      "report:R-01", "report:R-02", "report:R-03", "report:R-05", "report:R-06", "report:R-10", "diagnostics.manage", "diagnostics.view", "routes.manage", "routes.approve", "routes.view", "indicators.manage", "indicators.update", "surveys.view", "alerts.view", "alerts.manage", "tasks.manage", "messages.use", "analytics.view", "dashboards.manage", "documents.view", "validation.manage", "validation.view", "library.view", "library.manage", "forms.responses", "report:R-13", "report:R-14", "report:R-15", "report:R-04", "report:R-07", "report:R-08", "report:R-09"] },
  mentor: { name: "Mentor", description: "Acompaña empresas asignadas, agenda y registra seguimiento", internal: 1,
    perms: ["companies.view", "sessions.view", "sessions.schedule", "sessions.followup", "hours.register", "referrals.create", "docs.upload", "directory.view", "report:R-05", "diagnostics.manage", "diagnostics.view", "routes.manage", "routes.approve", "routes.view", "indicators.update", "alerts.view", "tasks.manage", "messages.use", "library.view", "documents.view", "analytics.view"] },
  coord_aliado: { name: "Coordinador de aliado", description: "Reparte remisiones entre los mentores de su organización", internal: 0,
    perms: ["users.manage.aliado", "referrals.assign", "companies.view", "sessions.view", "directory.view", "report:R-09", "surveys.view", "alerts.view", "library.view", "analytics.view", "tasks.manage", "report:R-15"] },
  aprobador_pagos: { name: "Aprobador de pagos", description: "Aprueba el reporte de servicios por aliado", internal: 1,
    perms: ["payments.view", "payments.approve", "report:R-03", "report:R-07", "report:R-08", "report:R-09", "analytics.view", "documents.view"] },
  auditor: { name: "Auditor", description: "Consulta la auditoría en solo lectura", internal: 1,
    perms: ["audit.view", "companies.view", "sessions.view", "report:R-12", "report:R-11", "documents.view", "analytics.view", "surveys.view", "alerts.view", "validation.view", "diagnostics.view", "report:R-01", "report:R-02", "report:R-03", "report:R-04", "report:R-05", "report:R-06", "report:R-07", "report:R-08", "report:R-09", "report:R-10", "report:R-13", "report:R-14", "report:R-15"] },
  empresa: { name: "Vinculado / Empresa", description: "Representante de la empresa", internal: 0,
    perms: ["company.manage_collab", "company.manage_profile", "companies.view", "sessions.view", "sessions.accept", "docs.upload", "directory.view", "events.register", "diagnostics.self", "routes.view", "messages.use", "library.view", "forms.fill", "indicators.update"] },
  colaborador: { name: "Colaborador empresa", description: "Accede a mentorías y capacitaciones de su empresa", internal: 0,
    perms: ["companies.view", "sessions.view", "sessions.accept", "docs.upload", "directory.view", "events.register", "diagnostics.self", "routes.view", "messages.use", "library.view", "forms.fill", "indicators.update"] },
};

const TEMPLATES: [string, string, string][] = [
  // key, subject, body (correo); sms/whatsapp reutilizan el cuerpo corto
  ["otp", "Tu código de ingreso", "Tu código de ingreso a la plataforma de Fomento Empresarial es {{code}}. Vence en 10 minutos."],
  ["invitacion", "Invitación a la plataforma de Fomento Empresarial", "Hola {{name}}, fuiste invitado/a a la plataforma. Ingresa con {{email}} y la contraseña temporal {{password}} (vigente 3 días)."],
  ["activacion", "Tu empresa fue activada", "{{company}} ya está activa en {{program}}. Ingresa para completar los pasos iniciales."],
  ["suspension", "Tu empresa fue suspendida", "{{company}} fue suspendida/restringida en {{program}}. Comunícate con tu asesor."],
  ["asignacion_mentor", "Nueva asignación de acompañamiento", "{{mentor}} fue asignado/a como mentor de {{company}}."],
  ["sesion_programada", "Sesión programada", "Sesión «{{title}}» el {{when}} entre {{mentor}} y {{company}}."],
  ["sesion_cancelada", "Sesión cancelada", "La sesión «{{title}}» del {{when}} fue cancelada. Motivo: {{reason}}."],
  ["recordatorio_evento", "Recordatorio: {{event}}", "Te recordamos {{event}} el {{when}}."],
  ["inscripcion", "Inscripción confirmada", "{{name}}, tu inscripción a {{event}} quedó confirmada. Código: {{code}}."],
  ["certificado", "Tu certificado está listo", "Descarga tu certificado de {{event}}: {{url}} (código {{cert}})."],
  ["remision", "Remisión a servicio", "{{company}} fue remitida al servicio «{{service}}» de {{aliado}}."],
];

export function ensureSeed() {
  if (!get("SELECT 1 FROM roles LIMIT 1")) seedBase();
  seedModules();
}

function seedBase() {
  tx(() => {
    const ts = now();
    setSetting("brand_name", "Compensar");
    setSetting("brand_color", "#0a6cff");
    setSetting("brand_tagline", "Plataforma de Fomento Empresarial");
    setSetting("session_timeout_min", "30");
    setSetting("channel_correo", "1");
    setSetting("channel_sms", "1");
    setSetting("channel_whatsapp", "1");
    setSetting("consent_version", "Política de tratamiento de datos v1.0 (Ley 1581 de 2012)");
    setSetting("consent_text", "Autorizo a Compensar el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y su política de tratamiento de datos.");
    setSetting("onboarding_steps", JSON.stringify(["Autorizar tratamiento de datos", "Completar el perfil de la empresa"]));
    setSetting("welcome_text", "Bienvenido/a al programa. Aquí verás tus servicios, mentorías y próximos eventos.");

    const roleId: Record<string, number> = {};
    for (const [key, r] of Object.entries(ROLES))
      roleId[key] = insert("INSERT INTO roles(key,name,description,internal,perms,system) VALUES(?,?,?,?,?,1)", key, r.name, r.description, r.internal, JSON.stringify(r.perms));

    for (const [key, subject, body] of TEMPLATES) {
      for (const ch of ["correo", "sms", "whatsapp"]) {
        const approved = !(key === "remision" && ch === "whatsapp"); // demo: plantilla pendiente de aprobación
        insert("INSERT INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,?)", key, ch, key, ch === "correo" ? subject : "", body, approved ? 1 : 0);
      }
    }

    // Programas
    const pEmp = insert("INSERT INTO programs(name,requirements,valid_from,valid_to,owner,status) VALUES(?,?,?,?,?,'activo')",
      "Emprendimiento", "Un año de aportes a caja en los últimos 3 años; cesante = desempleado e inactivo en EPS.", "2026-01-01", "2026-12-31", "Agencia de Empleo y Fomento");
    const pTer = insert("INSERT INTO programs(name,requirements,valid_from,valid_to,owner,status) VALUES(?,?,?,?,?,'activo')",
      "Territorio MIPYME", "Certificado de ventas brutas; afiliación a Compensar ≥ 6 meses; al día en parafiscales y seguridad social; inscripción en la Agencia de Empleo y Fomento con un asesor.", "2026-01-01", "2026-12-31", "Agencia de Empleo y Fomento");

    const ejes = ["Gestión comercial", "Gestión financiera", "Talento humano", "Transformación digital"];
    const lineaIds: number[] = [];
    ejes.forEach((e, i) => {
      const eid = insert("INSERT INTO ejes(program_id,name) VALUES(?,?)", pTer, e);
      for (const l of [`${e} · Básico`, `${e} · Avanzado`]) lineaIds.push(insert("INSERT INTO lineas(eje_id,name) VALUES(?,?)", eid, l));
    });
    ["Ruta de ventas", "Ruta de costos y precios", "Ruta de nómina y SST", "Ruta de e-commerce"].forEach((n, i) =>
      insert("INSERT INTO rutas(linea_id,name,description) VALUES(?,?,?)", lineaIds[i * 2], n, "Secuencia de cursos y servicios"));

    // Aliados y servicios
    const a1 = insert("INSERT INTO aliados(name,nit) VALUES(?,?)", "Fundación Crecer", "900123456");
    const a2 = insert("INSERT INTO aliados(name,nit) VALUES(?,?)", "Consultores Andinos SAS", "800765432");
    const s1 = insert("INSERT INTO servicios(program_id,linea_id,aliado_id,name,kind,hours,sessions,indicators,internal_cost) VALUES(?,?,?,?,?,?,?,?,?)",
      pTer, lineaIds[0], a1, "Mentoría en estrategia comercial", "mentoria", 12, 6, "Ventas mensuales, nuevos clientes", 1800000);
    const s2 = insert("INSERT INTO servicios(program_id,linea_id,aliado_id,name,kind,hours,sessions,indicators,internal_cost) VALUES(?,?,?,?,?,?,?,?,?)",
      pTer, lineaIds[2], a2, "Consultoría financiera", "mentoria", 16, 8, "Margen neto, flujo de caja", 2400000);
    insert("INSERT INTO servicios(program_id,linea_id,aliado_id,name,kind,hours,sessions,indicators,internal_cost) VALUES(?,?,?,?,?,?,?,?,?)",
      pTer, lineaIds[4], a1, "Capacitación en talento humano", "capacitacion", 8, 4, "Rotación de personal", 900000);
    insert("INSERT INTO servicios(program_id,linea_id,aliado_id,name,kind,hours,sessions,indicators,internal_cost) VALUES(?,?,?,?,?,?,?,?,?)",
      pEmp, null, a2, "Plan de negocio para emprendedores", "mentoria", 10, 5, "Plan de negocio validado", 1500000);

    // Usuarios internos
    const pw = hashPassword(DEMO_PASSWORD);
    const mk = (email: string, name: string, role: string, scope: string, scopeId: number | null, extra: any = {}) => {
      const id = insert(
        "INSERT INTO users(email,name,phone,password_hash,status,internal,company_id,is_principal,aliado_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        email, name, extra.phone ?? "3001234567", pw, "activo", ROLES[role].internal, extra.company_id ?? null, extra.principal ? 1 : 0, extra.aliado_id ?? null, ts);
      insert("INSERT INTO user_roles(user_id,role_id,scope_type,scope_id,created_at) VALUES(?,?,?,?,?)", id, roleId[role], scope, scopeId, ts);
      return id;
    };
    mk("admin@compensar.test", "Ana Administradora", "admin", "org", null);
    mk("aux@compensar.test", "Carlos Auxiliar", "aux_admin", "program", pTer);
    mk("evaluador@compensar.test", "Elena Evaluadora", "evaluador", "assigned", null);
    mk("contenidos@compensar.test", "Gabriela Contenidos", "gestor_contenidos", "program", pTer);
    mk("cursos@compensar.test", "Camilo Cursos", "gestor_cursos", "program", pTer);
    mk("gestor@compensar.test", "Marta Gestora de Mentorías", "gestor_mentorias", "program", pTer);
    const m1 = mk("mentor1@compensar.test", "Mateo Mentor", "mentor", "assigned", null);
    mk("mentor2@compensar.test", "Mónica Mentora", "mentor", "assigned", null);
    mk("pagos@compensar.test", "Pablo Aprobador de Pagos", "aprobador_pagos", "org", null);
    mk("auditor@compensar.test", "Aurora Auditora", "auditor", "org", null);
    const coord = mk("coord@crecer.test", "Cristina Coordinadora (Fundación Crecer)", "coord_aliado", "aliado", a1, { aliado_id: a1 });
    const ma1 = mk("mentor@crecer.test", "Manuel Mentor Aliado (Crecer)", "mentor", "assigned", null, { aliado_id: a1 });
    mk("mentor@andinos.test", "Andrés Mentor Aliado (Andinos)", "mentor", "assigned", null, { aliado_id: a2 });

    // Empresas
    const mkCompany = (name: string, nit: string, status: string, sector: string, city: string, size: string) => {
      const id = insert(
        "INSERT INTO companies(razon_social,nit,dv,sector,size,city,program_id,status,value_prop,social,onboarding_done,consent_at,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        name, nit, nitDv(nit), sector, size, city, pTer, status, `${name}: soluciones de calidad para su sector.`, `https://linkedin.com/company/${nit}`,
        status === "activa" ? 1 : 0, status === "activa" ? ts : null, "cargue", ts);
      return id;
    };
    const c1 = mkCompany("Panadería La Espiga SAS", "900111222", "activa", "Alimentos", "Bogotá", "Micro");
    const c2 = mkCompany("Textiles del Norte Ltda", "800333444", "activa", "Manufactura", "Bogotá", "Pequeña");
    const c3 = mkCompany("Tecnosoft Colombia SAS", "901555666", "activa", "Tecnología", "Soacha", "Mediana");
    mkCompany("Ferretería El Tornillo", "860777888", "pendiente", "Comercio", "Bogotá", "Micro");
    mkCompany("Café Origen SAS", "900999000", "pendiente", "Alimentos", "Chía", "Micro");
    for (const [cid, email, name] of [[c1, "empresa1@laespiga.test", "Laura Rep. La Espiga"], [c2, "empresa2@textiles.test", "Tomás Rep. Textiles"], [c3, "empresa3@tecnosoft.test", "Sofía Rep. Tecnosoft"]] as const) {
      mk(email, name, "empresa", "company", cid, { company_id: cid, principal: true });
    }
    mk("colab1@laespiga.test", "Camila Colaboradora La Espiga", "colaborador", "company", c1, { company_id: c1 });

    // Asignación de mentor + sesión de ejemplo
    insert("INSERT INTO mentor_assignments(company_id,mentor_id,program_id,from_at) VALUES(?,?,?,?)", c1, m1, pTer, ts);
    insert("INSERT INTO company_items(company_id,kind,ref_id,label,status,created_at) VALUES(?,?,?,?,?,?)", c1, "servicio", s1, "Mentoría en estrategia comercial", "en curso", ts);
    const d = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
    insert("INSERT INTO mentoring_sessions(company_id,mentor_id,program_id,title,scheduled_at,duration_min,modality,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      c1, m1, pTer, "Diagnóstico comercial inicial", d(2), 60, "virtual", "programada", ts);

    // Eventos
    const ev = (title: string, type: string, status: string, days: number, cap: number, mod: string) => {
      const slug = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 6);
      return insert(
        `INSERT INTO events(program_id,title,type,description,audience,owner,status,modality,place,start_at,end_at,capacity,internal_cost,summary,slug,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        pTer, title, type, "Sesión práctica con casos reales de mipymes.", "Mipymes afiliadas", "Agencia de Empleo y Fomento", status, mod,
        mod === "virtual" ? "https://teams.microsoft.com/l/meetup-join/demo" : "Sede Compensar, Av. 68 # 49A-47", d(days), d(days + 0.1), cap, 0, "Aprende herramientas para crecer tu negocio.", slug, ts);
    };
    ev("Taller de finanzas para mipymes", "evento", "publicado", 7, 30, "hibrido");
    ev("Charla: ventas en canales digitales", "charla", "publicado", 12, 100, "virtual");
    ev("Curso de costos y precios", "curso", "borrador", 20, 25, "presencial");
  });
}
