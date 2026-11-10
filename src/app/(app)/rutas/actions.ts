"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, insert, now, run, tx } from "@/lib/db";
import { can, canSeeCompany, requirePerm, requireUser, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeDocument } from "@/lib/onbase";
import {
  activateRoute, canEditTemplate, canSeeRoute, createFromTemplate, decideClosure, logStep, proposeRecommended, requestClosure, STEP_KIND, template,
} from "@/lib/routes";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const v = s(fd, k).replace(",", "."); return v === "" || isNaN(Number(v)) ? null : Number(v); };
const ref = (fd: FormData, k: string) => Number(s(fd, k)) || null;
function flash(path: string, kind: "ok" | "error", m: string): never {
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(m)}`);
}
const dateIso = (v: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T23:59:00-05:00").toISOString() : null);

/** Ruta editable por el usuario (routes.manage + alcance sobre la empresa). */
async function managedRoute(fd: FormData, key = "route_id") {
  const u = await requireUser();
  requirePerm(u, "routes.manage");
  const id = Number(s(fd, key));
  if (!id || !canSeeRoute(u, id)) redirect("/sin-acceso");
  const r = get<any>("SELECT * FROM company_routes WHERE id=?", id);
  return { u, r, path: `/rutas/${id}` };
}
function stepFields(fd: FormData) {
  const kind = STEP_KIND[s(fd, "kind")] ? s(fd, "kind") : "actividad";
  return {
    name: s(fd, "name"), kind, servicio_id: kind === "servicio" ? ref(fd, "servicio_id") : null, event_id: kind === "curso" ? ref(fd, "event_id") : null,
    indicator: s(fd, "indicator") || null, goal: num(fd, "goal"),
  };
}

/* ---------------- creación (FUN-79) ---------------- */
export async function createRoute(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "routes.manage");
  const companyId = Number(s(fd, "company_id")), rutaId = Number(s(fd, "ruta_id"));
  const back = `/rutas/nueva?empresa=${companyId}`;
  if (!companyId || !canSeeCompany(u, companyId)) redirect("/sin-acceso");
  if (!rutaId || !template(rutaId)) flash(back, "error", "Elige una plantilla");
  const diagnosticId = fd.get("link_diagnostic") === "on" ? ref(fd, "diagnostic_id") : null;
  const id = createFromTemplate(u, companyId, rutaId, { name: s(fd, "name"), origin: diagnosticId ? "diagnostico" : "plantilla", diagnosticId });
  const started = Number(s(fd, "started_at")) || null;
  const secs = started ? Math.round((Date.now() - started) / 1000) : null;
  await audit(u, "crear_ruta", "company_route", id, null, { company_id: companyId, ruta_id: rutaId, origen: diagnosticId ? "diagnostico" : "plantilla", tiempo_armado_seg: secs });
  if (fd.get("activate") === "on" && can(u, "routes.approve")) {
    const r = await activateRoute(u, id, fd.get("show_home") === "on");
    if (!r.ok) flash(`/rutas/${id}`, "error", r.error!);
    flash(`/rutas/${id}`, "ok", `Ruta creada y activada${secs ? ` en ${Math.floor(secs / 60)} min ${secs % 60} s` : ""}. La empresa fue notificada`);
  }
  flash(`/rutas/${id}`, "ok", "Ruta creada como propuesta: ajusta metas y apruébala para activarla");
}

/** RF-RUT-05: propuesta recomendada desde el diagnóstico (queda 'propuesta' hasta que el mentor la apruebe). */
export async function proposeRoute(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "routes.manage");
  const companyId = Number(s(fd, "company_id"));
  if (!companyId || !canSeeCompany(u, companyId)) redirect("/sin-acceso");
  const r = await proposeRecommended(u, companyId);
  if (!r.ok) flash(`/rutas/nueva?empresa=${companyId}`, "error", r.error!);
  flash(`/rutas/${r.id}`, "ok", "Propuesta creada. Revisa las etapas y apruébala para asignarla a la empresa");
}

export async function approveRoute(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "routes.approve");
  const id = Number(s(fd, "route_id"));
  if (!id || !canSeeRoute(u, id)) redirect("/sin-acceso");
  const r = await activateRoute(u, id, fd.get("show_home") === "on");
  if (!r.ok) flash(`/rutas/${id}`, "error", r.error!);
  flash(`/rutas/${id}`, "ok", "Ruta aprobada y activada. La empresa ya la ve y fue notificada");
}

export async function discardRoute(fd: FormData) {
  const { u, r } = await managedRoute(fd);
  if (r.status !== "propuesta") flash(`/rutas/${r.id}`, "error", "Solo se descarta una ruta en estado propuesta");
  const steps = all<any>("SELECT * FROM company_route_steps WHERE company_route_id=?", r.id);
  tx(() => { run("DELETE FROM company_route_steps WHERE company_route_id=?", r.id); run("DELETE FROM company_routes WHERE id=?", r.id); });
  await audit(u, "descartar_ruta_propuesta", "company_route", r.id, { ...r, steps }, null);
  flash("/rutas", "ok", "Propuesta descartada");
}

/* ---------------- etapas: servicios, indicadores, línea base y metas (FUN-80) ---------------- */
export async function saveStep(fd: FormData) {
  const { u, r, path } = await managedRoute(fd);
  if (!["propuesta", "activa"].includes(r.status)) flash(path, "error", "La ruta está cerrada");
  const st = get<any>("SELECT * FROM company_route_steps WHERE id=? AND company_route_id=?", Number(s(fd, "step_id")), r.id);
  if (!st) redirect("/sin-acceso");
  const f = stepFields(fd);
  if (!f.name) flash(path, "error", "La etapa necesita un nombre");
  if (f.goal == null) flash(path, "error", "Cada etapa debe tener su meta");
  const baseline = num(fd, "baseline"), due = dateIso(s(fd, "due"));
  run("UPDATE company_route_steps SET name=?, kind=?, servicio_id=?, event_id=?, indicator=?, baseline=?, goal=?, due_at=? WHERE id=?",
    f.name, f.kind, f.servicio_id, f.event_id, f.indicator, baseline, f.goal, due, st.id);
  logStep(r.id, st.id, "editado", { note: `Etapa ajustada: ${f.indicator || "indicador"} · línea base ${baseline ?? "—"} · meta ${f.goal}`, user_id: u.id });
  await audit(u, "editar_etapa_ruta", "company_route_step", st.id, st, { ...f, baseline, due_at: due });
  flash(path, "ok", "Etapa actualizada");
}

export async function addStep(fd: FormData) {
  const { u, r, path } = await managedRoute(fd);
  if (!["propuesta", "activa"].includes(r.status)) flash(path, "error", "La ruta está cerrada");
  const f = stepFields(fd);
  if (!f.name) flash(path, "error", "La etapa necesita un nombre");
  if (f.goal == null) flash(path, "error", "Cada etapa debe tener su meta");
  const ord = (get<any>("SELECT MAX(ord) m FROM company_route_steps WHERE company_route_id=?", r.id)?.m ?? 0) + 1;
  const baseline = num(fd, "baseline"), due = dateIso(s(fd, "due"));
  const id = insert("INSERT INTO company_route_steps(company_route_id,ord,name,kind,servicio_id,event_id,indicator,baseline,goal,status,due_at) VALUES(?,?,?,?,?,?,?,?,?,'pendiente',?)",
    r.id, ord, f.name, f.kind, f.servicio_id, f.event_id, f.indicator, baseline, f.goal, due);
  logStep(r.id, id, "editado", { note: `Etapa agregada: ${f.name}`, user_id: u.id });
  await audit(u, "agregar_etapa_ruta", "company_route_step", id, null, { route_id: r.id, ...f, baseline });
  flash(path, "ok", "Etapa agregada");
}

export async function removeStep(fd: FormData) {
  const { u, r, path } = await managedRoute(fd);
  const st = get<any>("SELECT * FROM company_route_steps WHERE id=? AND company_route_id=?", Number(s(fd, "step_id")), r.id);
  if (!st) redirect("/sin-acceso");
  if (st.status !== "pendiente" || !["propuesta", "activa"].includes(r.status)) flash(path, "error", "Solo se quitan etapas pendientes de rutas abiertas");
  run("DELETE FROM company_route_steps WHERE id=?", st.id);
  logStep(r.id, null, "editado", { note: `Etapa quitada: ${st.name}`, user_id: u.id });
  await audit(u, "quitar_etapa_ruta", "company_route_step", st.id, st, null);
  flash(path, "ok", "Etapa quitada");
}

export async function moveStep(fd: FormData) {
  const { u, r, path } = await managedRoute(fd);
  const steps = all<any>("SELECT id, ord FROM company_route_steps WHERE company_route_id=? ORDER BY ord, id", r.id);
  const i = steps.findIndex((x) => x.id === Number(s(fd, "step_id")));
  const j = s(fd, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= steps.length) flash(path, "error", "No se puede mover");
  [steps[i], steps[j]] = [steps[j], steps[i]];
  tx(() => steps.forEach((x, k) => run("UPDATE company_route_steps SET ord=? WHERE id=?", k + 1, x.id)));
  await audit(u, "reordenar_etapas_ruta", "company_route", r.id, null, { orden: steps.map((x) => x.id) });
  flash(path, "ok", "Orden actualizado");
}

/* ---------------- avance con evidencia (FUN-82) ---------------- */
export async function progressStep(fd: FormData) {
  const { u, r, path } = await managedRoute(fd);
  if (r.status !== "activa") flash(path, "error", "Solo se registra avance en rutas activas");
  const st = get<any>("SELECT * FROM company_route_steps WHERE id=? AND company_route_id=?", Number(s(fd, "step_id")), r.id);
  if (!st) redirect("/sin-acceso");
  const status = s(fd, "status");
  if (!["pendiente", "en_curso", "completado"].includes(status)) flash(path, "error", "Estado no válido");
  const note = s(fd, "note"), value = num(fd, "current");
  if (!note) flash(path, "error", "Describe qué se hizo (queda en la trazabilidad)");
  let docId: number | null = null;
  const f = fd.get("file") as File | null;
  if (f && typeof f === "object" && f.size) {
    const d = await storeDocument(u, f, { company_id: r.company_id, kind: "evidencia_ruta" });
    if (!d.ok) flash(path, "error", d.error!);
    docId = d.id!;
  }
  if (status === "completado" && !docId && !st.evidence_doc_id) flash(path, "error", "Adjunta la evidencia para completar la etapa");
  const ts = now();
  run("UPDATE company_route_steps SET status=?, current=COALESCE(?, current), evidence_doc_id=COALESCE(?, evidence_doc_id), completed_at=? WHERE id=?",
    status, value, docId, status === "completado" ? st.completed_at || ts : null, st.id);
  logStep(r.id, st.id, status === "pendiente" ? "reabierto" : status === st.status ? "evidencia" : status, { status, note, value, doc_id: docId, user_id: u.id });
  await audit(u, "avance_etapa_ruta", "company_route_step", st.id, { status: st.status, current: st.current }, { status, current: value ?? st.current, note, doc_id: docId });
  const left = get<any>("SELECT COUNT(*) n FROM company_route_steps WHERE company_route_id=? AND status!='completado'", r.id).n;
  flash(path, "ok", status === "completado" ? (left ? "Etapa completada con evidencia" : "¡Todas las etapas completadas! Ya puedes solicitar el cierre de la ruta") : "Avance registrado");
}

/* ---------------- cierre y escalamiento con aprobación (FUN-94) ---------------- */
export async function requestClose(fd: FormData) {
  const { u, r, path } = await managedRoute(fd);
  const kind = s(fd, "kind") === "escalamiento" ? "escalamiento" : "cierre";
  const res = await requestClosure(u, r.id, kind, s(fd, "outcome"), s(fd, "result"), ref(fd, "next_ruta_id"));
  if (!res.ok) flash(path, "error", res.error!);
  flash(path, "ok", `${kind === "cierre" ? "Cierre" : "Escalamiento"} solicitado; queda pendiente de aprobación`);
}

export async function decideClose(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "routes.approve");
  const k = get<any>("SELECT * FROM route_closures WHERE id=?", Number(s(fd, "closure_id")));
  if (!k || !canSeeRoute(u, k.company_route_id)) redirect("/sin-acceso");
  const approve = s(fd, "approve") === "1";
  const res = await decideClosure(u, k.id, approve, s(fd, "note"));
  if (!res.ok) flash(`/rutas/${k.company_route_id}`, "error", res.error!);
  if (approve && res.newId) flash(`/rutas/${res.newId}`, "ok", `Escalamiento aprobado: la ruta #${k.company_route_id} quedó escalada y esta es la nueva ruta activa`);
  flash(`/rutas/${k.company_route_id}`, "ok", approve ? "Cierre aprobado: la ruta quedó cerrada y la empresa fue notificada" : "Solicitud rechazada");
}

/* ---------------- plantillas (editor de pasos) ---------------- */
async function editableTemplate(fd: FormData): Promise<{ u: User; t: any; path: string }> {
  const u = await requireUser();
  requirePerm(u, "routes.manage");
  const t = template(Number(s(fd, "ruta_id")));
  if (!t || !canEditTemplate(u, t.program_id)) redirect("/sin-acceso");
  return { u, t, path: `/rutas/plantillas/${t.id}` };
}

export async function addTemplateStep(fd: FormData) {
  const { u, t, path } = await editableTemplate(fd);
  const f = stepFields(fd);
  if (!f.name) flash(path, "error", "El paso necesita un nombre");
  if (f.goal == null) flash(path, "error", "Cada etapa debe tener su meta");
  if (f.kind === "servicio" && !f.servicio_id) flash(path, "error", "Elige el servicio del catálogo");
  const ord = (get<any>("SELECT MAX(ord) m FROM route_template_steps WHERE ruta_id=?", t.id)?.m ?? 0) + 1;
  const id = insert("INSERT INTO route_template_steps(ruta_id,ord,name,kind,servicio_id,event_id,indicator,goal) VALUES(?,?,?,?,?,?,?,?)", t.id, ord, f.name, f.kind, f.servicio_id, f.event_id, f.indicator, f.goal);
  await audit(u, "agregar_paso_plantilla", "route_template_step", id, null, { ruta_id: t.id, ...f });
  flash(path, "ok", "Paso agregado");
}

export async function saveTemplateStep(fd: FormData) {
  const { u, t, path } = await editableTemplate(fd);
  const st = get<any>("SELECT * FROM route_template_steps WHERE id=? AND ruta_id=?", Number(s(fd, "step_id")), t.id);
  if (!st) redirect("/sin-acceso");
  const f = stepFields(fd);
  if (!f.name) flash(path, "error", "El paso necesita un nombre");
  if (f.goal == null) flash(path, "error", "Cada etapa debe tener su meta");
  run("UPDATE route_template_steps SET name=?, kind=?, servicio_id=?, event_id=?, indicator=?, goal=? WHERE id=?", f.name, f.kind, f.servicio_id, f.event_id, f.indicator, f.goal, st.id);
  await audit(u, "editar_paso_plantilla", "route_template_step", st.id, st, f);
  flash(path, "ok", "Paso actualizado");
}

export async function removeTemplateStep(fd: FormData) {
  const { u, t, path } = await editableTemplate(fd);
  const st = get<any>("SELECT * FROM route_template_steps WHERE id=? AND ruta_id=?", Number(s(fd, "step_id")), t.id);
  if (!st) redirect("/sin-acceso");
  run("DELETE FROM route_template_steps WHERE id=?", st.id);
  await audit(u, "quitar_paso_plantilla", "route_template_step", st.id, st, null);
  flash(path, "ok", "Paso quitado (las rutas ya creadas no cambian)");
}

export async function moveTemplateStep(fd: FormData) {
  const { u, t, path } = await editableTemplate(fd);
  const steps = all<any>("SELECT id FROM route_template_steps WHERE ruta_id=? ORDER BY ord, id", t.id);
  const i = steps.findIndex((x) => x.id === Number(s(fd, "step_id")));
  const j = s(fd, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= steps.length) flash(path, "error", "No se puede mover");
  [steps[i], steps[j]] = [steps[j], steps[i]];
  tx(() => steps.forEach((x, k) => run("UPDATE route_template_steps SET ord=? WHERE id=?", k + 1, x.id)));
  await audit(u, "reordenar_pasos_plantilla", "ruta", t.id, null, { orden: steps.map((x) => x.id) });
  flash(path, "ok", "Orden actualizado");
}
