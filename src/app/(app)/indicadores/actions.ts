"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { all, get, insert, now, run } from "@/lib/db";
import { can, canSeeCompany, requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeDocument } from "@/lib/onbase";
import { applyValue, canManageDef, canRecord, indicatorForUser, PERIODICITIES } from "@/lib/indicators";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const v = s(fd, k).replace(",", "."); return v === "" ? null : Number(v); };
const go = (path: string, kind: "ok" | "error", m: string): never => {
  revalidatePath("/indicadores");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(m)}`);
};
/** Solo se permite volver a rutas internas conocidas. */
const safeBack = (b: string, def: string) => (/^\/(indicadores|agenda)(\/|\?|$)/.test(b) ? b : def);

function readDef(fd: FormData) {
  const target = s(fd, "target");
  const program_id = target === "programa" ? Number(fd.get("program_id")) || null : null;
  const servicio_id = target === "servicio" ? Number(fd.get("servicio_id")) || null : null;
  return {
    name: s(fd, "name"), unit: s(fd, "unit"), kind: s(fd, "kind") === "gestion" ? "gestion" : "impacto", formula: s(fd, "formula"),
    baseline_default: num(fd, "baseline_default"), goal: num(fd, "goal"),
    periodicity: PERIODICITIES.some((p) => p[0] === s(fd, "periodicity")) ? s(fd, "periodicity") : "mensual",
    program_id, servicio_id,
  };
}
function validateDef(d: ReturnType<typeof readDef>, back: string) {
  if (d.name.length < 3) go(back, "error", "El nombre del indicador es obligatorio (mínimo 3 caracteres)");
  if (!d.unit) go(back, "error", "Indica la unidad de medida (p. ej. %, millones COP, clientes)");
  if (!d.program_id && !d.servicio_id) go(back, "error", "Elige el programa o el servicio del catálogo al que aplica el indicador");
  if (d.servicio_id && !get("SELECT 1 FROM servicios WHERE id=?", d.servicio_id)) go(back, "error", "Servicio no válido");
  if (d.program_id && !get("SELECT 1 FROM programs WHERE id=?", d.program_id)) go(back, "error", "Programa no válido");
  if ([d.baseline_default, d.goal].some((x) => x != null && isNaN(x))) go(back, "error", "Línea base y meta deben ser números");
}

export async function createDef(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "indicators.manage");
  const back = "/indicadores?tab=definiciones";
  const d = readDef(fd);
  validateDef(d, back);
  if (!canManageDef(u, d)) go(back, "error", "No puedes definir indicadores para ese programa");
  const id = insert("INSERT INTO indicator_defs(program_id,servicio_id,name,unit,kind,formula,baseline_default,goal,periodicity,active) VALUES(?,?,?,?,?,?,?,?,?,1)",
    d.program_id, d.servicio_id, d.name, d.unit, d.kind, d.formula, d.baseline_default, d.goal, d.periodicity);
  await audit(u, "crear_indicador", "indicator_def", id, null, d);
  go(back, "ok", `Indicador «${d.name}» definido. Ya puedes aplicarlo a las empresas.`);
}

export async function updateDef(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "indicators.manage");
  const back = "/indicadores?tab=definiciones";
  const old = get<any>("SELECT * FROM indicator_defs WHERE id=?", Number(fd.get("id")));
  if (!old || !canManageDef(u, old)) redirect("/sin-acceso");
  const d = readDef(fd);
  validateDef(d, back);
  if (!canManageDef(u, d)) go(back, "error", "No puedes mover el indicador a ese programa");
  run("UPDATE indicator_defs SET program_id=?, servicio_id=?, name=?, unit=?, kind=?, formula=?, baseline_default=?, goal=?, periodicity=? WHERE id=?",
    d.program_id, d.servicio_id, d.name, d.unit, d.kind, d.formula, d.baseline_default, d.goal, d.periodicity, old.id);
  // la unidad y el nombre se propagan a las empresas que lo tienen aplicado (las metas por empresa se conservan)
  run("UPDATE indicators SET name=?, unit=? WHERE def_id=?", d.name, d.unit, old.id);
  await audit(u, "editar_indicador", "indicator_def", old.id, old, d);
  go(back, "ok", "Definición actualizada");
}

export async function toggleDef(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "indicators.manage");
  const old = get<any>("SELECT * FROM indicator_defs WHERE id=?", Number(fd.get("id")));
  if (!old || !canManageDef(u, old)) redirect("/sin-acceso");
  const active = old.active ? 0 : 1;
  run("UPDATE indicator_defs SET active=? WHERE id=?", active, old.id);
  await audit(u, active ? "activar_indicador" : "desactivar_indicador", "indicator_def", old.id, { active: old.active }, { active });
  go("/indicadores?tab=definiciones", "ok", active ? "Indicador activado" : "Indicador desactivado (ya no se puede aplicar a nuevas empresas)");
}

/** Aplica una definición a empresas: crea filas en `indicators` con def_id (sin duplicar). */
export async function applyDef(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "indicators.manage");
  const back = "/indicadores?tab=aplicar";
  const d = get<any>("SELECT d.*, COALESCE(d.program_id, sv.program_id) prog FROM indicator_defs d LEFT JOIN servicios sv ON sv.id=d.servicio_id WHERE d.id=?", Number(fd.get("def_id")));
  if (!d || !canManageDef(u, d)) go(back, "error", "Elige un indicador válido");
  if (!d.active) go(back, "error", "El indicador está inactivo");
  let ids = fd.getAll("company_ids").map(Number).filter(Boolean);
  if (fd.get("all") === "1") {
    ids = d.servicio_id
      ? all<any>(`SELECT DISTINCT c.id FROM companies c WHERE c.status='activa' AND (c.id IN (SELECT company_id FROM referrals WHERE servicio_id=? AND status NOT IN ('rechazada'))
          OR c.id IN (SELECT company_id FROM company_items WHERE kind='servicio' AND ref_id=?))`, d.servicio_id, d.servicio_id).map((r) => r.id)
      : all<any>("SELECT id FROM companies WHERE status='activa' AND program_id=?", d.prog).map((r) => r.id);
  }
  if (!ids.length) go(back, "error", d.servicio_id && fd.get("all") === "1" ? "No hay empresas activas con ese servicio" : "Selecciona al menos una empresa");
  const baseline = num(fd, "baseline") ?? d.baseline_default ?? null;
  const goal = num(fd, "goal") ?? d.goal ?? null;
  if (goal == null) go(back, "error", "Este indicador no tiene meta por defecto: indica la meta para estas empresas");
  let created = 0, skipped = 0;
  for (const cid of ids) {
    const c = get<any>("SELECT * FROM companies WHERE id=?", cid);
    if (!c || !canSeeCompany(u, cid) || c.program_id !== d.prog) { skipped++; continue; }
    if (get("SELECT 1 FROM indicators WHERE company_id=? AND def_id=?", cid, d.id)) { skipped++; continue; }
    const ref = d.servicio_id ? get<any>("SELECT id FROM referrals WHERE company_id=? AND servicio_id=? AND status NOT IN ('rechazada') ORDER BY id DESC LIMIT 1", cid, d.servicio_id) : null;
    const iid = insert("INSERT INTO indicators(company_id,program_id,name,baseline,goal,def_id,servicio_id,referral_id,unit,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      cid, c.program_id, d.name, baseline, goal, d.id, d.servicio_id, ref?.id ?? null, d.unit, u.id, now());
    await audit(u, "aplicar_indicador", "indicator", iid, null, { company_id: cid, def_id: d.id, baseline, goal });
    created++;
  }
  go(back, created ? "ok" : "error", created ? `Indicador aplicado a ${created} empresa(s)${skipped ? `; ${skipped} omitida(s) (ya lo tenían o no corresponden al programa)` : ""}` : "Ninguna empresa nueva: ya lo tenían o no corresponden al programa del indicador");
}

/** Ajusta línea base y meta de un indicador de una empresa. */
export async function updateTargets(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "indicators.manage");
  const ind = indicatorForUser(u, Number(fd.get("id")));
  if (!ind) redirect("/sin-acceso");
  const back = `/indicadores/${ind.id}`;
  const baseline = num(fd, "baseline"), goal = num(fd, "goal");
  if (goal == null || isNaN(goal) || (baseline != null && isNaN(baseline))) go(back, "error", "Línea base y meta deben ser números");
  run("UPDATE indicators SET baseline=?, goal=? WHERE id=?", baseline, goal, ind.id);
  await audit(u, "ajustar_meta_indicador", "indicator", ind.id, { baseline: ind.baseline, goal: ind.goal }, { baseline, goal, motivo: s(fd, "reason") });
  go(back, "ok", "Línea base y meta actualizadas");
}

/**
 * Registra un avance (FUN-84): valor + nota + soporte. El soporte es un documento (OnBase) o la sesión de
 * mentoría/consultoría en la que se registra. Lo pueden registrar mentores/administrativos (indicators.update)
 * dentro de su alcance y la empresa sobre sus propios indicadores.
 */
export async function recordValue(fd: FormData) {
  const u = await requireUser();
  if (!canRecord(u)) redirect("/sin-acceso");
  const ind = indicatorForUser(u, Number(fd.get("indicator_id")));
  const back = safeBack(s(fd, "back"), ind ? `/indicadores/${ind.id}` : "/indicadores");
  if (!ind) go(back, "error", "Elige un indicador de la empresa");
  if (u.company_id && u.company_id !== ind.company_id) redirect("/sin-acceso");
  const value = num(fd, "value");
  if (value == null || isNaN(value)) go(back, "error", "El valor del avance es obligatorio y debe ser numérico");
  const note = s(fd, "note");
  if (note.length < 3) go(back, "error", "Describe el soporte del avance en la nota (fuente, periodo, observaciones)");
  let sessionId = Number(fd.get("session_id")) || null;
  if (sessionId) {
    const ses = get<any>("SELECT * FROM mentoring_sessions WHERE id=?", sessionId);
    if (!ses || ses.company_id !== ind.company_id || ses.status === "cancelada") go(back, "error", "La sesión no corresponde a la empresa del indicador");
    // el mentor solo registra en sus propias sesiones; administrativos con alcance amplio pueden referenciar cualquiera de la empresa
    if (!can(u, "indicators.manage") && !u.company_id && ses.mentor_id !== u.id) go(back, "error", "Solo el mentor de la sesión puede registrar avances en ella");
  }
  const file = fd.get("file") as File | null;
  let docId: number | null = null;
  if (file && typeof file === "object" && file.size > 0) {
    const r = await storeDocument(u, file, { company_id: ind.company_id, session_id: sessionId, kind: "evidencia_indicador" });
    if (!r.ok) go(back, "error", r.error || "No se pudo guardar la evidencia");
    docId = r.id!;
  }
  if (!docId && !sessionId) go(back, "error", "Cada avance lleva su soporte: adjunta un archivo de evidencia o regístralo desde la sesión de mentoría");
  const vid = applyValue(ind, value!, note, docId, sessionId, u.id);
  await audit(u, "registrar_avance_indicador", "indicator", ind.id, { valor: ind.final }, { valor: value, nota: note, doc_id: docId, session_id: sessionId, value_id: vid });
  if (back.startsWith("/agenda")) revalidatePath(back.split("?")[0]);
  go(back, "ok", `Avance registrado en «${ind.name}»: ${value}${ind.unit ? " " + ind.unit : ""}`);
}

export async function removeIndicator(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "indicators.manage");
  const ind = indicatorForUser(u, Number(fd.get("id")));
  if (!ind) redirect("/sin-acceso");
  if (ind.n_values > 0) go(`/indicadores/${ind.id}`, "error", "No se puede retirar un indicador con avances registrados (se conserva la trazabilidad)");
  run("DELETE FROM indicators WHERE id=?", ind.id);
  await audit(u, "retirar_indicador", "indicator", ind.id, ind, null);
  go("/indicadores?tab=empresas", "ok", "Indicador retirado de la empresa");
}
