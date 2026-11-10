/**
 * Lógica de Rutas de acompañamiento (RF-RUT-01..05, RF-ANA-02; FUN-79..82, FUN-94).
 * Plantillas = tabla `rutas` (+ route_template_steps); ruta de la empresa = company_routes (+ company_route_steps).
 */
import { all, get, insert, now, run, setting, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { can, companyFilter, type User } from "@/lib/auth";
import { jparse } from "@/lib/util";

export const ROUTE_STATUS: Record<string, string> = { propuesta: "Propuesta", activa: "Activa", cerrada: "Cerrada", escalada: "Escalada" };
export const STEP_STATUS: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", completado: "Completado" };
export const STEP_KIND: Record<string, string> = { servicio: "Servicio del catálogo", curso: "Curso / evento", actividad: "Actividad" };
export const ORIGIN: Record<string, string> = { plantilla: "Desde plantilla", diagnostico: "Desde diagnóstico", recomendacion: "Recomendada (reglas)" };
export const OUTCOME: Record<string, string> = { cumplida: "Metas cumplidas", parcial: "Cumplimiento parcial", no_cumplida: "Metas no cumplidas" };
export const routeTone = (s: string) => ({ propuesta: "amber", activa: "blue", cerrada: "green", escalada: "violet", pendiente: "amber", en_curso: "blue", completado: "green", aprobada: "green", rechazada: "red" } as any)[s] || "slate";

const APP_URL = () => process.env.APP_URL || "";

/* ---------------- plantillas ---------------- */
export const TEMPLATE_SELECT = `SELECT r.*, l.name linea, e.name eje, e.id eje_id, p.id program_id, p.name program,
  (SELECT COUNT(*) FROM route_template_steps s WHERE s.ruta_id=r.id) steps
  FROM rutas r LEFT JOIN lineas l ON l.id=r.linea_id LEFT JOIN ejes e ON e.id=l.eje_id LEFT JOIN programs p ON p.id=e.program_id`;
export const templates = (onlyActive = true) => all<any>(`${TEMPLATE_SELECT} ${onlyActive ? "WHERE r.active=1" : ""} ORDER BY p.id, e.id, r.id`);
export const template = (id: number) => get<any>(`${TEMPLATE_SELECT} WHERE r.id=?`, id);
export const templateSteps = (rutaId: number) =>
  all<any>(`SELECT s.*, sv.name servicio, ev.title evento FROM route_template_steps s LEFT JOIN servicios sv ON sv.id=s.servicio_id
    LEFT JOIN events ev ON ev.id=s.event_id WHERE s.ruta_id=? ORDER BY s.ord, s.id`, rutaId);

/** ¿Puede editar plantillas del programa? (routes.manage con alcance de organización o del programa) */
export function canEditTemplate(u: User, programId: number | null) {
  const gs = u.grants.filter((g) => g.perms.includes("routes.manage") || g.perms.includes("*"));
  return gs.some((g) => g.scope_type === "org" || (g.scope_type === "program" && g.scope_id === programId));
}

/* ---------------- alcance ---------------- */
export const isInternalRouteUser = (u: User) => can(u, "routes.manage") || can(u, "routes.approve");

/** Rutas visibles (alias cr): empresas del alcance (companyFilter). La empresa no ve las propuestas. */
export function routeFilter(u: User, alias = "cr"): { sql: string; params: any[] } {
  const f = companyFilter(u, "c0");
  const extra = isInternalRouteUser(u) ? "" : ` AND ${alias}.status!='propuesta'`;
  return { sql: `${alias}.company_id IN (SELECT c0.id FROM companies c0 WHERE ${f.sql})${extra}`, params: f.params };
}
export function canSeeRoute(u: User, routeId: number) {
  if (!can(u, "routes.view") && !isInternalRouteUser(u)) return false;
  const f = routeFilter(u);
  return !!get(`SELECT 1 FROM company_routes cr WHERE cr.id=? AND ${f.sql}`, routeId, ...f.params);
}

export const ROUTE_SELECT = `SELECT cr.*, c.razon_social company, c.nit, c.program_id, p.name program, r.name template,
  ap.name approver, cb.name creator,
  (SELECT COUNT(*) FROM company_route_steps s WHERE s.company_route_id=cr.id) total_steps,
  (SELECT COUNT(*) FROM company_route_steps s WHERE s.company_route_id=cr.id AND s.status='completado') done_steps,
  (SELECT COUNT(*) FROM route_closures rc WHERE rc.company_route_id=cr.id AND rc.status='pendiente') pending_closures,
  (SELECT u.name FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=cr.company_id AND a.active=1 LIMIT 1) mentor
  FROM company_routes cr JOIN companies c ON c.id=cr.company_id LEFT JOIN programs p ON p.id=c.program_id
  LEFT JOIN rutas r ON r.id=cr.ruta_id LEFT JOIN users ap ON ap.id=cr.approved_by LEFT JOIN users cb ON cb.id=cr.created_by`;

export const routeSteps = (routeId: number) =>
  all<any>(`SELECT s.*, sv.name servicio, ev.title evento, d.name doc_name FROM company_route_steps s
    LEFT JOIN servicios sv ON sv.id=s.servicio_id LEFT JOIN events ev ON ev.id=s.event_id LEFT JOIN documents d ON d.id=s.evidence_doc_id
    WHERE s.company_route_id=? ORDER BY s.ord, s.id`, routeId);

export function progress(steps: { status: string }[]) {
  const total = steps.length, done = steps.filter((s) => s.status === "completado").length, inCourse = steps.filter((s) => s.status === "en_curso").length;
  return { total, done, inCourse, pct: total ? Math.round((done / total) * 100) : 0 };
}
/** Avance de un indicador de etapa entre línea base y meta (0..100). */
export function indicatorPct(s: { baseline: number | null; goal: number | null; current: number | null }) {
  if (s.goal == null || s.current == null) return null;
  const b = s.baseline ?? 0;
  if (s.goal === b) return s.current >= s.goal ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((s.current - b) / (s.goal - b)) * 100)));
}

export function logStep(routeId: number, stepId: number | null, action: string, o: { status?: string | null; note?: string | null; value?: number | null; doc_id?: number | null; user_id?: number | null } = {}) {
  insert("INSERT INTO route_step_log(company_route_id,step_id,action,status,note,value,doc_id,user_id,at) VALUES(?,?,?,?,?,?,?,?,?)",
    routeId, stepId, action, o.status ?? null, o.note ?? null, o.value ?? null, o.doc_id ?? null, o.user_id ?? null, now());
}
export const routeLog = (routeId: number) =>
  all<any>(`SELECT l.*, u.name user_name, s.name step_name, d.name doc_name FROM route_step_log l LEFT JOIN users u ON u.id=l.user_id
    LEFT JOIN company_route_steps s ON s.id=l.step_id LEFT JOIN documents d ON d.id=l.doc_id WHERE l.company_route_id=? ORDER BY l.at DESC, l.id DESC`, routeId);

function companyContact(companyId: number) {
  return get<any>("SELECT id, email, phone, name FROM users WHERE company_id=? AND status IN ('activo','invitado') ORDER BY is_principal DESC, id LIMIT 1", companyId);
}

/* ---------------- creación (FUN-79) ---------------- */
export function createFromTemplate(u: { id: number } | null, companyId: number, rutaId: number, o: { name?: string; origin?: string; diagnosticId?: number | null; parentId?: number | null } = {}) {
  const t = template(rutaId);
  if (!t) throw new Error("La plantilla no existe");
  return tx(() => {
    const id = insert("INSERT INTO company_routes(company_id,ruta_id,name,status,origin,diagnostic_id,parent_id,created_by,created_at) VALUES(?,?,?,'propuesta',?,?,?,?,?)",
      companyId, rutaId, (o.name || t.name).trim(), o.origin || "plantilla", o.diagnosticId ?? null, o.parentId ?? null, u?.id ?? null, now());
    for (const s of templateSteps(rutaId))
      insert("INSERT INTO company_route_steps(company_route_id,ord,name,kind,servicio_id,event_id,indicator,goal,status) VALUES(?,?,?,?,?,?,?,?,'pendiente')",
        id, s.ord, s.name, s.kind, s.servicio_id, s.event_id, s.indicator, s.goal);
    logStep(id, null, "creada", { status: "propuesta", note: `${ORIGIN[o.origin || "plantilla"]}: ${t.name}`, user_id: u?.id ?? null });
    return id;
  });
}

/** Aprueba/activa una ruta (RF-RUT-05: requiere routes.approve). Opcionalmente la muestra en el inicio de la empresa. */
export async function activateRoute(u: User, routeId: number, showOnHome = true) {
  const r = get<any>("SELECT * FROM company_routes WHERE id=?", routeId);
  if (!r) return { ok: false, error: "La ruta no existe" };
  if (r.status !== "propuesta") return { ok: false, error: "Solo se aprueba una ruta en estado propuesta" };
  if (!can(u, "routes.approve")) return { ok: false, error: "Necesitas el permiso de aprobar rutas" };
  if (!get("SELECT 1 FROM company_route_steps WHERE company_route_id=?", routeId)) return { ok: false, error: "La ruta no tiene etapas" };
  const ts = now();
  tx(() => {
    run("UPDATE company_routes SET status='activa', approved_by=?, approved_at=? WHERE id=?", u.id, ts, routeId);
    if (showOnHome && !get("SELECT 1 FROM company_items WHERE company_id=? AND kind='ruta' AND ref_id=?", r.company_id, routeId))
      insert("INSERT INTO company_items(company_id,kind,ref_id,label,status,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)", r.company_id, "ruta", routeId, r.name, "en curso", u.id, ts);
    logStep(routeId, null, "activada", { status: "activa", note: r.origin === "plantilla" ? "Ruta aprobada y activada" : "Recomendación aprobada por el mentor y activada", user_id: u.id });
  });
  await audit(u, "aprobar_ruta", "company_route", routeId, { status: "propuesta" }, { status: "activa", inicio_empresa: showOnHome });
  const c = companyContact(r.company_id);
  if (c) notify({ key: "ruta_asignada", vars: { name: c.name, route: r.name, url: APP_URL() + "/rutas/" + routeId }, email: c.email, phone: c.phone, userId: c.id });
  return { ok: true };
}

/* ---------------- recomendación por reglas (RF-RUT-05) ---------------- */
const EJE_KEYWORDS: [RegExp, RegExp][] = [
  [/comercial|venta|mercad|marketing|client/i, /comercial|venta/i],
  [/financ|costo|precio|contab|finanz|caja/i, /financ|costo/i],
  [/talento|humano|personas|n[oó]mina|sst|laboral|equipo/i, /talento|n[oó]mina/i],
  [/digital|tecnolog|e-?commerce|innovaci|datos|tic/i, /digital|commerce/i],
];
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export type Recommendation = {
  diagnostic: any | null; sections: { name: string; pct: number }[]; weakest: { name: string; pct: number } | null;
  level: string | null; ruta: any | null; reason: string; ai: boolean;
};

export function latestDiagnostic(companyId: number) {
  return get<any>(`SELECT d.*, fr.result, f.name form_name FROM diagnostics d LEFT JOIN form_responses fr ON fr.id=d.response_id LEFT JOIN forms f ON f.id=d.form_id
    WHERE d.company_id=? AND (d.status='completado' OR d.completed_at IS NOT NULL OR d.score IS NOT NULL)
    ORDER BY COALESCE(d.completed_at, d.created_at) DESC, d.id DESC LIMIT 1`, companyId) ?? null;
}

/**
 * Recomienda una plantilla a partir del diagnóstico: dimensión más débil → eje de la plantilla; nivel → línea
 * Básico/Avanzado. La IA es opcional (setting ai_enabled, desactivada por defecto) y nunca asigna sola.
 */
export function recommend(companyId: number): Recommendation {
  const ai = setting("ai_enabled", "0") === "1";
  const company = get<any>("SELECT * FROM companies WHERE id=?", companyId);
  const d = latestDiagnostic(companyId);
  const empty: Recommendation = { diagnostic: d, sections: [], weakest: null, level: d?.level ?? null, ruta: null, reason: "", ai };
  if (!d) return { ...empty, reason: "La empresa no tiene un diagnóstico completado." };
  const res = jparse<any>(d.result, {});
  const sections = (Array.isArray(res.sections) ? res.sections : []).map((s: any) => {
    const max = Number(s.max) || 0, sc = Number(s.score) || 0;
    return { name: String(s.name ?? s.title ?? "Dimensión"), pct: Math.round(max > 0 ? (sc / max) * 100 : sc) };
  });
  const weakest = sections.length ? sections.reduce((a: any, b: any) => (b.pct < a.pct ? b : a)) : null;
  const level = d.level || d.segment || null;
  const pool = templates().filter((t) => !company?.program_id || t.program_id === company.program_id || t.program_id == null);
  const custom = jparse<Record<string, number>>(setting("route_reco_map", ""), {});
  let ruta: any = null; let why = "";
  if (weakest) {
    const key = Object.keys(custom).find((k) => norm(weakest.name).includes(norm(k)));
    if (key) { ruta = pool.find((t) => t.id === Number(custom[key])); why = `regla configurada «${key}»`; }
    if (!ruta) {
      const pair = EJE_KEYWORDS.find(([dim]) => dim.test(norm(weakest.name)));
      const byEje = pool.filter((t) => (pair ? pair[1].test(norm(t.eje + " " + t.name)) : norm(t.eje).includes(norm(weakest.name))));
      const basic = /bajo|basic|inicial|incipiente|emergente|1/i.test(norm(level || ""));
      ruta = byEje.find((t) => (basic ? /basic/i.test(norm(t.linea)) : /avanzad/i.test(norm(t.linea)))) || byEje[0] || null;
      if (ruta) why = `la dimensión más débil es «${weakest.name}» (${weakest.pct}%) y corresponde al eje «${ruta.eje}»`;
    }
  }
  if (!ruta && pool.length) {
    ruta = pool[0];
    why = weakest ? `no hay una plantilla para «${weakest.name}»; se propone la primera del programa` : "el diagnóstico no trae puntaje por dimensión; se propone la primera plantilla del programa";
  }
  const reason = ruta ? `Se recomienda «${ruta.name}» porque ${why}${level ? `; nivel del diagnóstico: ${level}` : ""}.` : "No hay plantillas activas para el programa de la empresa.";
  return { diagnostic: d, sections, weakest, level, ruta, reason: (ai ? "IA habilitada sin proveedor configurado: se usa el motor de reglas. " : "") + reason, ai };
}

/** Crea la ruta recomendada en estado 'propuesta' (nunca activa sin aprobación). */
export async function proposeRecommended(u: User | null, companyId: number) {
  const rec = recommend(companyId);
  if (!rec.ruta) return { ok: false, error: rec.reason };
  if (rec.diagnostic && get("SELECT 1 FROM company_routes WHERE company_id=? AND diagnostic_id=? AND status='propuesta'", companyId, rec.diagnostic.id))
    return { ok: false, error: "Ya existe una propuesta pendiente para este diagnóstico" };
  const id = createFromTemplate(u, companyId, rec.ruta.id, { origin: "recomendacion", diagnosticId: rec.diagnostic?.id ?? null });
  logStep(id, null, "recomendacion", { note: rec.reason, user_id: u?.id ?? null });
  await audit(u, "proponer_ruta_recomendada", "company_route", id, null, { company_id: companyId, ruta_id: rec.ruta.id, motivo: rec.reason, ia: rec.ai });
  return { ok: true, id, reason: rec.reason };
}

/** Proceso por lotes: propone rutas para diagnósticos completados que aún no tienen ruta. */
export async function proposeForNewDiagnostics() {
  const ds = all<any>(`SELECT d.company_id, MAX(d.id) id FROM diagnostics d JOIN companies c ON c.id=d.company_id AND c.status='activa'
    WHERE (d.status='completado' OR d.completed_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM company_routes cr WHERE cr.company_id=d.company_id AND (cr.diagnostic_id=d.id OR cr.status IN ('propuesta','activa')))
    GROUP BY d.company_id LIMIT 50`);
  let n = 0;
  for (const d of ds) if ((await proposeRecommended(null, d.company_id)).ok) n++;
  return n;
}

/* ---------------- cierre y escalamiento (FUN-94) ---------------- */
export async function requestClosure(u: User, routeId: number, kind: "cierre" | "escalamiento", outcome: string, result: string, nextRutaId: number | null) {
  const r = get<any>("SELECT * FROM company_routes WHERE id=?", routeId);
  if (!r) return { ok: false, error: "La ruta no existe" };
  if (kind === "cierre" && r.status !== "activa") return { ok: false, error: "Solo se cierra una ruta activa" };
  if (kind === "escalamiento" && !["activa", "cerrada"].includes(r.status)) return { ok: false, error: "Solo se escala una ruta activa o cerrada" };
  if (kind === "escalamiento" && !nextRutaId) return { ok: false, error: "Elige la plantilla de la nueva ruta" };
  if (!result.trim()) return { ok: false, error: "Describe el resultado obtenido" };
  if (!OUTCOME[outcome]) return { ok: false, error: "Elige el resultado" };
  if (get("SELECT 1 FROM route_closures WHERE company_route_id=? AND status='pendiente'", routeId)) return { ok: false, error: "Ya hay una solicitud pendiente de aprobación" };
  const id = insert("INSERT INTO route_closures(company_route_id,kind,outcome,result,next_ruta_id,status,requested_by,requested_at) VALUES(?,?,?,?,?,'pendiente',?,?)",
    routeId, kind, outcome, result.trim(), nextRutaId, u.id, now());
  logStep(routeId, null, "cierre_solicitado", { note: `${kind === "cierre" ? "Cierre" : "Escalamiento"} solicitado — ${OUTCOME[outcome]}: ${result.trim()}`, user_id: u.id });
  await audit(u, kind === "cierre" ? "solicitar_cierre_ruta" : "solicitar_escalamiento_ruta", "company_route", routeId, null, { closure_id: id, outcome, result: result.trim(), next_ruta_id: nextRutaId });
  return { ok: true, id };
}

/** Aprobación del cierre/escalamiento: requiere routes.approve y otra persona distinta a quien lo solicitó (salvo administrador). */
export async function decideClosure(u: User, closureId: number, approve: boolean, note: string) {
  const k = get<any>("SELECT * FROM route_closures WHERE id=?", closureId);
  if (!k || k.status !== "pendiente") return { ok: false, error: "La solicitud no está pendiente" };
  if (!can(u, "routes.approve")) return { ok: false, error: "Necesitas el permiso de aprobar rutas" };
  const admin = u.grants.some((g) => g.perms.includes("*"));
  if (k.requested_by === u.id && !admin) return { ok: false, error: "Separación de funciones: otra persona debe aprobar la solicitud que tú hiciste" };
  const r = get<any>("SELECT * FROM company_routes WHERE id=?", k.company_route_id);
  const ts = now();
  if (!approve) {
    if (!note.trim()) return { ok: false, error: "Escribe el motivo del rechazo" };
    run("UPDATE route_closures SET status='rechazada', decided_by=?, decided_at=?, decision_note=? WHERE id=?", u.id, ts, note.trim(), closureId);
    logStep(r.id, null, "cierre_rechazado", { note: note.trim(), user_id: u.id });
    await audit(u, "rechazar_cierre_ruta", "company_route", r.id, null, { closure_id: closureId, note: note.trim() });
    return { ok: true };
  }
  const closeText = `${OUTCOME[k.outcome] || k.outcome}: ${k.result}`;
  let newId: number | null = null;
  if (k.kind === "escalamiento") {
    newId = createFromTemplate(u, r.company_id, k.next_ruta_id, { origin: "plantilla", parentId: r.id });
  }
  tx(() => {
    if (k.kind === "cierre") {
      run("UPDATE company_routes SET status='cerrada', closed_at=?, close_result=? WHERE id=?", ts, closeText, r.id);
      run("UPDATE company_items SET status='cerrada' WHERE company_id=? AND kind='ruta' AND ref_id=?", r.company_id, r.id);
      logStep(r.id, null, "cerrada", { status: "cerrada", note: closeText + (note.trim() ? ` — Aprobación: ${note.trim()}` : ""), user_id: u.id });
    } else {
      run("UPDATE company_routes SET status='escalada', closed_at=COALESCE(closed_at, ?), close_result=COALESCE(close_result, ?) WHERE id=?", ts, closeText, r.id);
      run("UPDATE company_items SET status='cerrada' WHERE company_id=? AND kind='ruta' AND ref_id=?", r.company_id, r.id);
      run("UPDATE company_routes SET status='activa', approved_by=?, approved_at=? WHERE id=?", u.id, ts, newId);
      insert("INSERT INTO company_items(company_id,kind,ref_id,label,status,assigned_by,created_at) VALUES(?,?,?,?,?,?,?)", r.company_id, "ruta", newId,
        get<any>("SELECT name FROM company_routes WHERE id=?", newId).name, "en curso", u.id, ts);
      logStep(r.id, null, "escalada", { status: "escalada", note: `${closeText}. Continúa en la ruta #${newId}`, user_id: u.id });
      logStep(newId!, null, "activada", { status: "activa", note: `Escalamiento aprobado desde la ruta #${r.id}`, user_id: u.id });
    }
    run("UPDATE route_closures SET status='aprobada', decided_by=?, decided_at=?, decision_note=?, new_route_id=? WHERE id=?", u.id, ts, note.trim() || null, newId, closureId);
  });
  await audit(u, k.kind === "cierre" ? "aprobar_cierre_ruta" : "aprobar_escalamiento_ruta", "company_route", r.id, { status: r.status },
    { status: k.kind === "cierre" ? "cerrada" : "escalada", close_result: closeText, new_route_id: newId });
  const c = companyContact(r.company_id);
  if (c) {
    notify({ key: "ruta_cerrada", vars: { name: c.name, route: r.name, result: closeText, url: APP_URL() + "/rutas/" + r.id }, email: c.email, phone: c.phone, userId: c.id });
    if (newId) notify({ key: "ruta_asignada", vars: { name: c.name, route: get<any>("SELECT name FROM company_routes WHERE id=?", newId).name, url: APP_URL() + "/rutas/" + newId }, email: c.email, phone: c.phone, userId: c.id });
  }
  return { ok: true, newId };
}
