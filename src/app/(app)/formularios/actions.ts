"use server";
/** Administración de formularios: crear, constructor, configuración, reglas, versiones/estados y decisiones (RF-FRM-01..06, RF-DIA-01/06). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run, tx } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rand, slugify } from "@/lib/util";
import { FORM_KINDS, parseSchema, parseScoring, validateSchema, validateScoring, type Scoring } from "@/lib/forms";
import { canManageForm, canRecalc, canSeeResponses, getForm, notifyResponseStatus, recalcForm, versionOf } from "./server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, kind: "ok" | "error", m: string): never => { revalidatePath(path.split("?")[0]); redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(m)}`); };

async function managed(id: number) {
  const u = await requireUser();
  const f = getForm(id);
  if (!f || !canManageForm(u, f)) redirect("/sin-acceso");
  return { u, f: f! };
}

export async function createForm(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "forms.manage")) redirect("/sin-acceso");
  const name = s(fd, "name");
  const kind = FORM_KINDS.some(([k]) => k === s(fd, "kind")) ? s(fd, "kind") : "general";
  const programId = Number(fd.get("program_id")) || null;
  if (!canManageForm(u, { program_id: programId })) go("/formularios", "error", "No puedes crear formularios en ese programa");
  if (name.length < 3) go("/formularios", "error", "Escribe un nombre de al menos 3 caracteres");
  const copyOf = Number(fd.get("copy_of")) || 0;
  const src = copyOf ? getForm(copyOf) : null;
  if (src && !canManageForm(u, src)) redirect("/sin-acceso");
  const first = kind === "diagnostico"
    ? { sections: [{ id: "s_" + rand(6), title: "Dimensión 1", weight: 1, questions: [] }], settings: {} }
    : { sections: [{ id: "s_" + rand(6), title: "Datos generales", questions: [] }], settings: {} };
  const scoring = kind === "diagnostico" ? {
    levels: [{ name: "Inicial", min: 0, max: 40, color: "#dc2626", recommendations: "" }, { name: "En desarrollo", min: 40, max: 70, color: "#f59e0b", recommendations: "" }, { name: "Consolidado", min: 70, max: 100, color: "#16a34a", recommendations: "" }],
    segments: [], defaultSegment: "", review: true,
  } : { levels: [] };
  const ts = now();
  const id = insert(
    "INSERT INTO forms(name,description,kind,program_id,slug,status,version,schema,scoring,requires_login,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'borrador',0,?,?,?,?,?,?)",
    name, src?.description ?? s(fd, "description"), src?.kind ?? kind, programId, slugify(name) + "-" + rand(4),
    src ? src.schema : JSON.stringify(first), src ? src.scoring : JSON.stringify(scoring), src ? src.requires_login : 1, u.id, ts, ts);
  await audit(u, src ? "duplicar" : "crear", "form", id, src ? { origen: src.id } : null, { name, kind: src?.kind ?? kind, program_id: programId });
  redirect(`/formularios/${id}?ok=${encodeURIComponent(src ? "Copia creada como borrador" : "Formulario creado. Agrega tus preguntas.")}`);
}

/** Guardado del constructor (autoguardado). Solo cambia las secciones del borrador; conserva la configuración. */
export async function saveFormSchema(formId: number, json: string): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  const u = await requireUser();
  const f = getForm(Number(formId));
  if (!f || !canManageForm(u, f)) return { ok: false, error: "Sin permiso para editar este formulario" };
  if (f.status === "archivado") return { ok: false, error: "El formulario está archivado; restáuralo para editarlo" };
  if (json.length > 500_000) return { ok: false, error: "El formulario es demasiado grande" };
  let incoming: any;
  try { incoming = JSON.parse(json); } catch { return { ok: false, error: "Datos no válidos" }; }
  const cur = parseSchema(f.schema);
  const next = parseSchema({ sections: incoming.sections, settings: cur.settings });
  const ts = now();
  const body = JSON.stringify(next);
  if (body === JSON.stringify(cur)) return { ok: true, savedAt: ts };
  run("UPDATE forms SET schema=?, updated_at=? WHERE id=?", body, ts, f.id);
  // auditoría resumida (el autoguardado es frecuente): solo conteos
  await audit(u, "editar_borrador", "form", f.id, { preguntas: cur.sections.reduce((a, x) => a + x.questions.length, 0) }, { preguntas: next.sections.reduce((a, x) => a + x.questions.length, 0) });
  return { ok: true, savedAt: ts };
}

export async function saveFormSettings(fd: FormData) {
  const { u, f } = await managed(Number(fd.get("id")));
  const back = `/formularios/${f.id}?tab=config`;
  const name = s(fd, "name");
  if (name.length < 3) go(back, "error", "El nombre debe tener al menos 3 caracteres");
  const programId = Number(fd.get("program_id")) || null;
  if (!canManageForm(u, { program_id: programId })) go(back, "error", "No puedes asignar ese programa");
  const kind = FORM_KINDS.some(([k]) => k === s(fd, "kind")) ? s(fd, "kind") : f.kind;
  const responses = get<any>("SELECT COUNT(*) n FROM form_responses WHERE form_id=? AND status<>'borrador'", f.id).n;
  if (kind !== f.kind && responses) go(back, "error", "No se puede cambiar el tipo de un formulario que ya tiene respuestas");
  let slug = slugify(s(fd, "slug")) || f.slug || slugify(name) + "-" + rand(4);
  if (slug.length < 4) go(back, "error", "El enlace debe tener al menos 4 caracteres");
  if (get("SELECT 1 FROM forms WHERE slug=? AND id<>?", slug, f.id)) go(back, "error", "Ese enlace ya está en uso; elige otro");
  const eventId = Number(fd.get("event_id")) || null;
  if (eventId) {
    const ev = get<any>("SELECT * FROM events WHERE id=?", eventId);
    if (!ev || (!canManageForm(u, { program_id: ev.program_id }) && !can(u, "events.manage"))) go(back, "error", "No puedes asociar ese evento");
  }
  const schema = parseSchema(f.schema);
  schema.settings = { ...schema.settings, allowMultiple: fd.get("allow_multiple") === "1", confirmation: s(fd, "confirmation").slice(0, 1000) };
  const before = { name: f.name, kind: f.kind, program_id: f.program_id, event_id: f.event_id, slug: f.slug, requires_login: f.requires_login };
  const after = { name, kind, program_id: programId, event_id: eventId, slug, requires_login: fd.get("requires_login") === "1" ? 1 : 0, ...schema.settings };
  tx(() => {
    run("UPDATE forms SET name=?, description=?, kind=?, program_id=?, event_id=?, slug=?, requires_login=?, schema=?, updated_at=? WHERE id=?",
      name, s(fd, "description"), kind, programId, eventId, slug, after.requires_login, JSON.stringify(schema), now(), f.id);
    // asociación a convocatoria/evento: events.form_id (FUN-11/FUN-55)
    run("UPDATE events SET form_id=NULL WHERE form_id=? AND id<>?", f.id, eventId ?? 0);
    if (eventId) run("UPDATE events SET form_id=? WHERE id=?", f.id, eventId);
  });
  await audit(u, "configurar", "form", f.id, before, after);
  go(back, "ok", "Configuración guardada");
}

export async function saveScoring(fd: FormData) {
  const { u, f } = await managed(Number(fd.get("id")));
  const back = `/formularios/${f.id}?tab=clasificacion`;
  let sc: Scoring;
  try { sc = parseScoring(JSON.parse(String(fd.get("scoring") || "{}"))); } catch { return go(back, "error", "Reglas no válidas"); }
  sc.levels = sc.levels.map((l) => ({ name: String(l.name).trim().slice(0, 60), min: Number(l.min), max: Number(l.max), color: /^#[0-9a-f]{6}$/i.test(l.color || "") ? l.color : "#64748b", recommendations: String(l.recommendations || "").slice(0, 4000) }));
  sc.segments = (sc.segments || []).map((g) => ({ name: String(g.name).trim().slice(0, 60), target: String(g.target), op: g.op === "gte" ? "gte" : "lt", value: Number(g.value) || 0 }));
  const errs = validateScoring(sc);
  if (errs.length) go(back, "error", errs.join(" "));
  const before = parseScoring(f.scoring);
  run("UPDATE forms SET scoring=?, updated_at=? WHERE id=?", JSON.stringify(sc), now(), f.id);
  await audit(u, "editar_reglas", "form", f.id, before, sc);
  if (fd.get("recalc") === "1") {
    const r = recalcForm(f.id);
    await audit(u, "recalcular", "form", f.id, null, r);
    go(back, "ok", `Reglas guardadas. Recalculados ${r.total} diagnósticos; ${r.changed} cambiaron de puntaje, nivel o segmento.`);
  }
  go(back, "ok", "Reglas guardadas. Usa «recalcular» para aplicarlas a los diagnósticos ya enviados.");
}

/** Publicar: congela el borrador como versión nueva. Las respuestas recibidas conservan su versión (RF-FRM-01). */
export async function publishForm(fd: FormData) {
  const { u, f } = await managed(Number(fd.get("id")));
  const back = `/formularios/${f.id}`;
  const schema = parseSchema(f.schema);
  const errs = validateSchema(schema, f.kind);
  if (f.kind === "diagnostico") errs.push(...validateScoring(parseScoring(f.scoring)));
  if (f.kind === "diagnostico" && !parseScoring(f.scoring).levels.length) errs.push("Configura los niveles en «Clasificación».");
  if (errs.length) go(back, "error", "No se puede publicar: " + errs.slice(0, 5).join(" "));
  const last = versionOf(f.id);
  if (last && JSON.stringify(last.schema) === JSON.stringify(schema) && JSON.stringify(last.scoring) === JSON.stringify(parseScoring(f.scoring)) && f.status === "publicado")
    go(back, "ok", `No hay cambios: sigue publicada la versión ${f.version}`);
  const v = (f.version || 0) + 1;
  const ts = now();
  tx(() => {
    insert("INSERT INTO form_versions(form_id,version,schema,scoring,published_at,published_by) VALUES(?,?,?,?,?,?)", f.id, v, JSON.stringify(schema), f.scoring, ts, u.id);
    run("UPDATE forms SET status='publicado', version=?, slug=COALESCE(slug, ?), updated_at=? WHERE id=?", v, slugify(f.name) + "-" + rand(4), ts, f.id);
  });
  await audit(u, "publicar", "form", f.id, { status: f.status, version: f.version }, { status: "publicado", version: v });
  go(back, "ok", v === 1 ? "Formulario publicado (versión 1). Ya puedes compartir el enlace." : `Versión ${v} publicada. Las respuestas anteriores conservan su versión.`);
}

export async function setFormStatus(fd: FormData) {
  const { u, f } = await managed(Number(fd.get("id")));
  const to = s(fd, "status");
  if (!["archivado", "publicado", "borrador"].includes(to)) go(`/formularios/${f.id}`, "error", "Estado no válido");
  if (to === "publicado" && !f.version) go(`/formularios/${f.id}`, "error", "Primero publica una versión");
  run("UPDATE forms SET status=?, updated_at=? WHERE id=?", to, now(), f.id);
  await audit(u, to === "archivado" ? "archivar" : "cambiar_estado", "form", f.id, { status: f.status }, { status: to });
  go(`/formularios/${f.id}`, "ok", to === "archivado" ? "Formulario archivado: ya no recibe respuestas. Las respuestas se conservan." : to === "publicado" ? "Formulario reactivado" : "Formulario despublicado (en borrador)");
}

/** Descarta los cambios del borrador y vuelve a la última versión publicada. */
export async function discardDraft(fd: FormData) {
  const { u, f } = await managed(Number(fd.get("id")));
  const last = versionOf(f.id);
  if (!last) go(`/formularios/${f.id}`, "error", "No hay versión publicada para restaurar");
  const cur = parseSchema(f.schema);
  run("UPDATE forms SET schema=?, updated_at=? WHERE id=?", JSON.stringify({ ...last!.schema, settings: cur.settings }), now(), f.id);
  await audit(u, "descartar_borrador", "form", f.id, null, { version: last!.version });
  go(`/formularios/${f.id}`, "ok", `Se restauró el contenido de la versión ${last!.version}`);
}

/** Decisión sobre respuestas de formularios generales/encuestas (las inscripciones se deciden en la bandeja de Validación). */
export async function setResponseStatus(fd: FormData) {
  const u = await requireUser();
  const r = get<any>("SELECT * FROM form_responses WHERE id=?", Number(fd.get("id")));
  const f = r && getForm(r.form_id);
  if (!r || !f || !canSeeResponses(u, f) || !can(u, "forms.responses") && !can(u, "forms.manage")) redirect("/sin-acceso");
  const back = `/formularios/${f.id}/respuestas/${r.id}`;
  if (f.kind === "inscripcion" || f.kind === "diagnostico") go(back, "error", "El estado de este tipo de formulario se gestiona en su bandeja (Validación / Diagnósticos)");
  const to = s(fd, "status"), reason = s(fd, "reason");
  if (!["en_revision", "ajustes", "aprobado", "rechazado"].includes(to)) go(back, "error", "Estado no válido");
  if ((to === "ajustes" || to === "rechazado") && reason.length < 5) go(back, "error", "Escribe el motivo (mín. 5 caracteres): el participante lo verá");
  if (r.status === "borrador") go(back, "error", "La respuesta aún es un borrador");
  run("UPDATE form_responses SET status=?, decision_reason=?, assigned_to=COALESCE(assigned_to, ?), updated_at=? WHERE id=?", to, reason || null, u.id, now(), r.id);
  await audit(u, "cambiar_estado", "form_response", r.id, { status: r.status, reason: r.decision_reason }, { status: to, reason });
  notifyResponseStatus(r, to, reason);
  go(back, "ok", "Estado actualizado y participante notificado");
}

export async function recalcFormAction(fd: FormData) {
  const u = await requireUser();
  const f = getForm(Number(fd.get("id")));
  const back = s(fd, "back") || `/formularios/${f?.id}`;
  if (!f || f.kind !== "diagnostico") redirect("/sin-acceso");
  if (!canRecalc(u, f!)) redirect("/sin-acceso");
  const r = recalcForm(f!.id);
  await audit(u, "recalcular", "form", f!.id, null, r);
  go(back, "ok", `Clasificación recalculada: ${r.total} diagnósticos, ${r.changed} con cambios.`);
}
