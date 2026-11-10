/** Datos de demostración del módulo formularios y diagnóstico. Idempotente: no inserta si ya existen. */
import fs from "node:fs";
import path from "node:path";
import { get, insert, run, tx } from "../db";
import { computeResult, type Schema, type Scoring } from "../forms";
import { encryptBuffer } from "../onbase";

const TEMPLATES: [string, string, string][] = [
  ["formulario_recibido", "Recibimos tu formulario: {{form}}", "Hola {{name}}, recibimos «{{form}}» con el radicado {{folio}}. Puedes consultar su estado en Mis formularios ({{url}})."],
  ["formulario_estado", "Tu formulario cambió de estado: {{status}}", "Hola {{name}}, «{{form}}» (radicado {{folio}}) ahora está: {{status}}. Motivo: {{reason}}. Consulta el detalle en {{url}}."],
  ["formulario_ajustes", "Tu formulario requiere ajustes", "Hola {{name}}, «{{form}}» (radicado {{folio}}) requiere ajustes: {{reason}}. Ingresa a {{url}}, corrige y reenvía."],
  ["formulario_borrador", "Tienes un formulario sin terminar", "Hola {{name}}, tu avance en «{{form}}» está guardado. Continúa donde quedaste: {{url}}."],
  ["diagnostico_asignado", "Tienes un diagnóstico empresarial pendiente", "Hola {{name}}, se asignó a {{company}} el diagnóstico «{{form}}» (etapa {{stage}}). Diligéncialo desde tu cuenta: {{url}}."],
  ["diagnostico_resultado", "Resultado de tu diagnóstico: {{level}}", "Hola {{name}}, {{company}} obtuvo {{score}}/100 (nivel {{level}}) en «{{form}}». Mira el detalle y las recomendaciones en {{url}}."],
];

const opt = (pairs: [string, number][]) => pairs.map(([label, score], i) => ({ value: "o" + (i + 1), label, score }));
const yesNo = [{ value: "si", label: "Sí" }, { value: "no", label: "No" }];

export const DIAG_SCHEMA: Schema = {
  settings: {},
  sections: [
    { id: "dim_com", title: "Comercial", description: "Planeación comercial, clientes y canales de venta.", weight: 1, questions: [
      { id: "c1", type: "single", label: "¿La empresa tiene un plan comercial con metas de ventas?", required: true, weight: 2,
        options: opt([["No existe", 0], ["Existe de manera informal", 2], ["Está documentado", 3], ["Documentado y con seguimiento mensual", 4]]) },
      { id: "c2", type: "scale", label: "¿Qué tan diversificada está su base de clientes?", help: "1 = depende de uno o dos clientes; 5 = ningún cliente supera el 15 % de las ventas", required: true, scaleMax: 5, scaleMinLabel: "Muy concentrada", scaleMaxLabel: "Muy diversificada", weight: 1 },
      { id: "c3", type: "multi", label: "¿Qué canales de venta utiliza?", required: true, min: 1, weight: 1,
        options: opt([["Punto de venta físico", 1], ["Redes sociales", 1], ["Tienda en línea", 1], ["Distribuidores", 1], ["Ventas corporativas (B2B)", 1]]) },
    ] },
    { id: "dim_fin", title: "Financiera", description: "Contabilidad, costos y flujo de caja.", weight: 1, questions: [
      { id: "f1", type: "single", label: "¿Lleva contabilidad formal y estados financieros al día?", required: true, weight: 1, options: opt([["No", 0], ["Parcialmente", 2], ["Sí, al día", 4]]) },
      { id: "f2", type: "single", label: "¿Conoce sus costos y fija los precios con base en ellos?", required: true, weight: 2, options: opt([["No", 0], ["De forma aproximada", 2], ["Sí, con estructura de costos", 4]]) },
      { id: "f3", type: "scale", label: "Nivel de control del flujo de caja", required: true, scaleMax: 5, scaleMinLabel: "Sin control", scaleMaxLabel: "Proyectado y controlado", weight: 1 },
    ] },
    { id: "dim_th", title: "Talento humano", description: "Estructura, formación y seguridad y salud en el trabajo.", weight: 1, questions: [
      { id: "t1", type: "single", label: "¿Los cargos tienen funciones definidas por escrito?", required: true, weight: 1, options: opt([["No", 0], ["Algunos", 2], ["Todos", 4]]) },
      { id: "t2", type: "scale", label: "¿Cuánto invierte en formación de su equipo?", required: true, scaleMax: 5, scaleMinLabel: "Nada", scaleMaxLabel: "Plan anual de formación", weight: 1 },
      { id: "t3", type: "single", label: "¿Cuenta con el Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST)?", required: true, weight: 1, options: opt([["No", 0], ["En implementación", 2], ["Implementado", 4]]) },
    ] },
    { id: "dim_dig", title: "Transformación digital", description: "Herramientas, presencia en internet y habilidades digitales.", weight: 1, questions: [
      { id: "d1", type: "multi", label: "¿Qué herramientas digitales usa?", required: true, min: 1, weight: 1,
        options: opt([["Facturación electrónica", 1], ["Software contable", 1], ["CRM o base de clientes", 1], ["Pagos digitales", 1], ["Almacenamiento en la nube", 1]]) },
      { id: "d2", type: "single", label: "¿Qué presencia tiene la empresa en internet?", required: true, weight: 1,
        options: [{ value: "no", label: "Ninguna", score: 0 }, { value: "redes", label: "Solo redes sociales", score: 2 }, { value: "web", label: "Página web", score: 3 }, { value: "ecom", label: "Página web con ventas en línea", score: 4 }] },
      { id: "d2b", type: "single", label: "¿Le interesa recibir acompañamiento para crear su presencia digital?", help: "Pregunta condicional: aparece solo si no tiene presencia en internet.", required: true,
        options: yesNo, logic: { action: "show", questionId: "d2", op: "eq", value: "no" } },
      { id: "d3", type: "scale", label: "Nivel de habilidades digitales del equipo", required: true, scaleMax: 5, scaleMinLabel: "Básico", scaleMaxLabel: "Avanzado", weight: 1 },
    ] },
  ],
};

export const DIAG_SCORING: Scoring = {
  levels: [
    { name: "Inicial", min: 0, max: 40, color: "#dc2626", recommendations: "Formalizar un plan comercial básico con metas trimestrales.\nImplementar contabilidad formal y una estructura de costos para fijar precios.\nVincularse a la ruta de fortalecimiento empresarial con mentoría quincenal." },
    { name: "En desarrollo", min: 40, max: 70, color: "#f59e0b", recommendations: "Documentar procesos clave y hacer seguimiento mensual a indicadores.\nProyectar el flujo de caja a seis meses.\nFortalecer la presencia digital y los canales de venta en línea." },
    { name: "Consolidado", min: 70, max: 100, color: "#16a34a", recommendations: "Explorar nuevos mercados y alianzas comerciales.\nAcceder a líneas de financiación para crecimiento.\nCompartir buenas prácticas como empresa referente del programa." },
  ],
  segments: [
    { name: "Prioridad financiera", target: "dim_fin", op: "lt", value: 40 },
    { name: "Prioridad digital", target: "dim_dig", op: "lt", value: 40 },
    { name: "Lista para escalar", target: "total", op: "gte", value: 70 },
  ],
  defaultSegment: "Fortalecimiento integral",
  review: true,
};

const INSCRIPCION: Schema = {
  settings: { allowMultiple: false, confirmation: "Tu inscripción al programa Territorio MIPYME quedó radicada. El equipo validará los requisitos y te notificará cada cambio de estado." },
  sections: [
    { id: "s_emp", title: "Datos de la empresa", questions: [
      { id: "razon", type: "text", label: "Razón social", required: true, max: 200 },
      { id: "nit", type: "nit", label: "NIT de la empresa", required: true, unique: true, help: "Sin puntos. El dígito de verificación va en la casilla DV." },
      { id: "ubic", type: "location", label: "Departamento y municipio de la sede principal", required: true },
      { id: "tamano", type: "single", label: "Tamaño de la empresa", required: true, options: ["Micro", "Pequeña", "Mediana"].map((l, i) => ({ value: "t" + (i + 1), label: l })) },
      { id: "empleados", type: "number", label: "Número de empleados", required: true, min: 1, max: 200 },
      { id: "sector", type: "single", label: "Sector económico", required: true, options: ["Alimentos", "Manufactura", "Comercio", "Servicios", "Tecnología", "Otro"].map((l) => ({ value: l.toLowerCase(), label: l })) },
      { id: "sector_otro", type: "text", label: "¿Cuál otro sector?", required: true, logic: { action: "show", questionId: "sector", op: "eq", value: "otro" } },
      { id: "fundacion", type: "date", label: "Fecha de constitución", required: true, max: "2026-12-31" },
    ] },
    { id: "s_con", title: "Representante y contacto", questions: [
      { id: "rep", type: "text", label: "Nombre del representante legal", required: true },
      { id: "correo", type: "text", label: "Correo electrónico de contacto", format: "email", required: true },
      { id: "celular", type: "text", label: "Celular", format: "phone", required: true },
    ] },
    { id: "s_req", title: "Requisitos del programa", description: "Territorio MIPYME exige afiliación a Compensar, estar al día en parafiscales y certificar ventas brutas.", questions: [
      { id: "afiliado", type: "single", label: "¿La empresa está afiliada a Compensar?", required: true, options: yesNo },
      { id: "meses", type: "number", label: "¿Cuántos meses lleva afiliada?", required: true, min: 0, max: 600, help: "Se requieren al menos 6 meses.", logic: { action: "show", questionId: "afiliado", op: "eq", value: "si" } },
      { id: "parafiscales", type: "single", label: "¿Está al día en parafiscales y seguridad social?", required: true, options: yesNo },
      { id: "parafiscales_obs", type: "paragraph", label: "Explique la situación y el plan para ponerse al día", required: true, max: 1000, logic: { action: "show", questionId: "parafiscales", op: "eq", value: "no" } },
      { id: "ventas", type: "number", label: "Ventas brutas del último año (COP)", required: true, min: 0 },
      { id: "cert_ventas", type: "file", label: "Certificado de ventas brutas firmado por contador", required: true },
    ] },
    { id: "s_int", title: "Intereses y autorización", questions: [
      { id: "areas", type: "multi", label: "¿En qué áreas quiere fortalecer su empresa?", required: true, min: 1, max: 3,
        options: ["Comercial", "Financiera", "Talento humano", "Transformación digital"].map((l, i) => ({ value: "a" + (i + 1), label: l })) },
      { id: "prioridad", type: "scale", label: "¿Qué tan urgente es para usted recibir acompañamiento?", required: false, scaleMax: 10, scaleMinLabel: "Poco", scaleMaxLabel: "Muy urgente" },
      { id: "expectativa", type: "paragraph", label: "¿Qué espera lograr con el programa?", max: 1000 },
      { id: "autoriza", type: "single", label: "¿Autoriza el tratamiento de sus datos personales conforme a la Ley 1581 de 2012?", required: true, options: [{ value: "si", label: "Sí, autorizo" }] },
    ] },
  ],
};

export function seed() {
  for (const [key, subject, body] of TEMPLATES)
    for (const ch of ["correo", "sms", "whatsapp"])
      run("INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,1)", key, ch, key, ch === "correo" ? subject : "", body);

  if (get("SELECT 1 FROM forms WHERE name='Diagnóstico de madurez empresarial'")) return;
  const uid = (email: string) => get<any>("SELECT id FROM users WHERE email=?", email)?.id ?? null;
  const cid = (nit: string) => get<any>("SELECT id FROM companies WHERE nit=?", nit)?.id ?? null;
  const author = uid("contenidos@compensar.test") ?? uid("admin@compensar.test");
  const pTer = get<any>("SELECT id FROM programs WHERE name='Territorio MIPYME'")?.id ?? null;
  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  tx(() => {
    // ---------- Diagnóstico ----------
    const sd = JSON.stringify(DIAG_SCHEMA), sc = JSON.stringify(DIAG_SCORING);
    const dId = insert(`INSERT INTO forms(name,description,kind,program_id,slug,status,version,schema,scoring,requires_login,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,'publicado',1,?,?,1,?,?,?)`,
      "Diagnóstico de madurez empresarial", "Evalúa la madurez de la empresa en cuatro dimensiones y entrega puntaje, nivel y recomendaciones.",
      "diagnostico", pTer, "diagnostico-madurez", sd, sc, author, day(-120), day(-120));
    insert("INSERT INTO form_versions(form_id,version,schema,scoring,published_at,published_by) VALUES(?,1,?,?,?,?)", dId, sd, sc, day(-120), author);

    // ---------- Inscripción ----------
    const si = JSON.stringify(INSCRIPCION);
    const iId = insert(`INSERT INTO forms(name,description,kind,program_id,slug,status,version,schema,scoring,requires_login,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,'publicado',1,?,'{"levels":[]}',1,?,?,?)`,
      "Inscripción Territorio MIPYME", "Formulario de inscripción al programa Territorio MIPYME 2026. Tu avance se guarda automáticamente.",
      "inscripcion", pTer, "inscripcion-territorio-mipyme", si, author, day(-60), day(-60));
    insert("INSERT INTO form_versions(form_id,version,schema,scoring,published_at,published_by) VALUES(?,1,?,'{\"levels\":[]}',?,?)", iId, si, day(-60), author);

    // ---------- Diagnósticos de demostración ----------
    const espiga = cid("900111222"), textiles = cid("800333444"), tecno = cid("901555666");
    const e1 = uid("empresa1@laespiga.test"), m1 = uid("mentor1@compensar.test"), gestor = uid("gestor@compensar.test");
    const respond = (company: number, user: number | null, answers: any, at: string, status: string) => {
      const res = computeResult(DIAG_SCHEMA, DIAG_SCORING, answers);
      const email = user ? get<any>("SELECT email FROM users WHERE id=?", user)?.email : null;
      const rid = insert(`INSERT INTO form_responses(form_id,form_version,company_id,user_id,email,answers,status,score,level,result,submitted_at,updated_at,created_at)
        VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?)`, dId, company, user, email, JSON.stringify(answers), status, res.total, res.level, JSON.stringify({ ...res, computed_at: at }), at, at, at);
      return { rid, res };
    };
    if (espiga) {
      const ini = respond(espiga, e1, { c1: "o2", c2: 2, c3: ["o1"], f1: "o2", f2: "o1", f3: 2, t1: "o1", t2: 1, t3: "o2", d1: ["o1"], d2: "no", d2b: "si", d3: 2 }, day(-85), "aprobado");
      insert(`INSERT INTO diagnostics(company_id,form_id,response_id,stage,status,assigned_by,assigned_to,score,level,segment,completed_at,created_at)
        VALUES(?,?,?,'inicial','completado',?,?,?,?,?,?,?)`, espiga, dId, ini.rid, m1, m1, ini.res.total, ini.res.level, ini.res.segment, day(-84), day(-90));
      const fin = respond(espiga, e1, { c1: "o4", c2: 3, c3: ["o1", "o2", "o3"], f1: "o3", f2: "o2", f3: 4, t1: "o2", t2: 3, t3: "o2", d1: ["o1", "o2", "o4"], d2: "ecom", d3: 3 }, day(-3), "aprobado");
      insert(`INSERT INTO diagnostics(company_id,form_id,response_id,stage,status,assigned_by,assigned_to,score,level,segment,completed_at,created_at)
        VALUES(?,?,?,'final','completado',?,NULL,?,?,?,?,?)`, espiga, dId, fin.rid, e1, fin.res.total, fin.res.level, fin.res.segment, day(-2), day(-5));
    }
    if (textiles) insert("INSERT INTO diagnostics(company_id,form_id,stage,status,assigned_by,assigned_to,created_at) VALUES(?,?,'inicial','asignado',?,?,?)", textiles, dId, gestor, gestor, day(-1));

    // ---------- Una inscripción enviada (abre caso de validación «pendiente») ----------
    const e3 = uid("empresa3@tecnosoft.test");
    if (tecno && e3) {
      const ref = "ONB-SEEDFRM001";
      const dir = path.join(process.cwd(), "storage");
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, ref + ".pdf"), encryptBuffer(Buffer.from("%PDF-1.4\n% Certificado de ventas (demo)\n%%EOF\n"))); } catch {}
      const doc = insert("INSERT INTO documents(company_id,name,kind,mime,size,onbase_ref,onbase_status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        tecno, "certificado-ventas-tecnosoft.pdf", "formulario", "application/pdf", 48, ref, "almacenado", e3, day(-6));
      const answers = {
        razon: "Tecnosoft Colombia SAS", nit: "901555666-" + get<any>("SELECT dv FROM companies WHERE id=?", tecno).dv, ubic: { dep: "25", mun: "25754" }, tamano: "t3", empleados: 45,
        sector: "tecnología", fundacion: "2015-03-10", rep: "Sofía Rep. Tecnosoft", correo: "empresa3@tecnosoft.test", celular: "3001234567",
        afiliado: "si", meses: 48, parafiscales: "si", ventas: 1850000000, cert_ventas: { docId: doc, name: "certificado-ventas-tecnosoft.pdf" },
        areas: ["a1", "a4"], prioridad: 8, expectativa: "Abrir nuevos canales de venta digitales y mejorar la estructura de costos.", autoriza: "si",
      };
      const rid = insert(`INSERT INTO form_responses(form_id,form_version,company_id,user_id,email,answers,status,submitted_at,updated_at,created_at)
        VALUES(?,1,?,?,?,?,'enviado',?,?,?)`, iId, tecno, e3, "empresa3@tecnosoft.test", JSON.stringify(answers), day(-6), day(-6), day(-7));
      insert("INSERT INTO validation_cases(kind,response_id,company_id,program_id,status,created_at,updated_at) VALUES('inscripcion',?,?,?,'pendiente',?,?)", rid, tecno, pTer, day(-6), day(-6));
    }
  });
}
