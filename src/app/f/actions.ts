"use server";
/**
 * Diligenciamiento de formularios (RF-FRM-07/08/09): guardado automático de borradores, envío con validación
 * en servidor (formatos, obligatorios, NIT, duplicados), archivos a OnBase, resultado automático del diagnóstico
 * y creación del caso de validación para inscripciones.
 */
import { redirect } from "next/navigation";
import { get, insert, now, run, tx } from "@/lib/db";
import { can, currentUser, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { storeDocument } from "@/lib/onbase";
import { allQuestions, computeResult, parseScoring, sanitizeAnswers, validateAll, type Answers } from "@/lib/forms";
import {
  canFillDiagnostic, folio, getForm, nextStage, storeResult, versionOf, type FormRow,
} from "../(app)/formularios/server";

type Ctx = { formId: number; responseId?: number | null; diagnosticId?: number | null; email?: string };
type Loaded = { u: User | null; f: FormRow; resp: any; diag: any; version: ReturnType<typeof versionOf> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Carga y autoriza el contexto de diligenciamiento. Devuelve un mensaje de error si no procede. */
async function load(ctx: Ctx): Promise<Loaded | string> {
  const u = await currentUser();
  const f = getForm(Number(ctx.formId));
  if (!f) return "El formulario no existe";
  let diag: any = null, resp: any = null;
  if (ctx.diagnosticId) {
    if (!u) return "Tu sesión expiró. Ingresa de nuevo.";
    diag = get<any>("SELECT * FROM diagnostics WHERE id=?", Number(ctx.diagnosticId));
    if (!diag || diag.form_id !== f.id) return "Diagnóstico no encontrado";
    if (!canFillDiagnostic(u, diag)) return "No tienes acceso a este diagnóstico";
    if (!["asignado", "en_curso"].includes(diag.status)) return "Este diagnóstico ya fue enviado";
    resp = diag.response_id ? get<any>("SELECT * FROM form_responses WHERE id=?", diag.response_id) : null;
  } else {
    if (f.kind === "diagnostico") return "Los diagnósticos se diligencian desde el módulo Diagnósticos";
    if (f.status !== "publicado") return "Este formulario no está recibiendo respuestas";
    if (f.requires_login && !u) return "Tu sesión expiró. Ingresa de nuevo para continuar.";
    if (u && ctx.responseId) {
      resp = get<any>("SELECT * FROM form_responses WHERE id=? AND form_id=?", Number(ctx.responseId), f.id);
      if (!resp) return "Respuesta no encontrada";
      const mine = resp.user_id === u.id || (u.company_id && resp.company_id === u.company_id);
      if (!mine) return "Esta respuesta no te pertenece";
    } else if (u) {
      // evita borradores duplicados si se guardó desde otra pestaña
      resp = get<any>("SELECT * FROM form_responses WHERE form_id=? AND user_id=? AND status='borrador' ORDER BY id DESC LIMIT 1", f.id, u.id);
    }
    if (resp && !["borrador", "ajustes"].includes(resp.status)) return "Esta respuesta ya fue enviada y no se puede modificar";
  }
  if (!f.version) return "El formulario aún no tiene una versión publicada";
  const version = versionOf(f.id); // las ediciones siempre trabajan sobre la última versión publicada
  if (!version) return "El formulario aún no tiene una versión publicada";
  return { u, f, resp, diag, version };
}

/** RF-FRM-08: guardado automático del borrador (debounce en el cliente). */
export async function saveDraft(ctx: Ctx & { answers: Answers }): Promise<{ ok: boolean; responseId?: number; savedAt?: string; error?: string }> {
  const L = await load(ctx);
  if (typeof L === "string") return { ok: false, error: L };
  const { u, f, diag, version } = L;
  let { resp } = L;
  if (!u) return { ok: false, error: "Los formularios sin inicio de sesión guardan el borrador solo en este navegador" };
  const answers = sanitizeAnswers(version!.schema, ctx.answers || {}, false);
  const ts = now();
  if (resp) {
    run("UPDATE form_responses SET answers=?, form_version=?, updated_at=? WHERE id=?", JSON.stringify(answers), version!.version, ts, resp.id);
  } else {
    const companyId = diag ? diag.company_id : u.company_id ?? null;
    const id = insert(
      "INSERT INTO form_responses(form_id,form_version,company_id,user_id,email,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'borrador',?,?)",
      f.id, version!.version, companyId, u.id, u.email, JSON.stringify(answers), ts, ts);
    resp = { id };
    await audit(u, "iniciar_respuesta", "form_response", id, null, { form_id: f.id, version: version!.version, diagnostic_id: diag?.id ?? null });
    if (diag) {
      run("UPDATE diagnostics SET response_id=?, status='en_curso' WHERE id=?", id, diag.id);
      await audit(u, "cambiar_estado", "diagnostic", diag.id, { status: diag.status }, { status: "en_curso" });
    }
  }
  return { ok: true, responseId: resp.id, savedAt: ts };
}

/** Envío definitivo: validación completa en el servidor + resultado + caso de validación + notificación. */
export async function submitResponse(ctx: Ctx & { answers: Answers }): Promise<{ ok: boolean; errors?: Record<string, string>; error?: string; redirect?: string }> {
  const L = await load(ctx);
  if (typeof L === "string") return { ok: false, error: L };
  const { u, f, diag, version } = L;
  let { resp } = L;
  const schema = version!.schema;
  const answers = sanitizeAnswers(schema, ctx.answers || {}, true);

  // 1) formatos y obligatorios (misma regla que en pantalla)
  const errors = validateAll(schema, answers);

  // 2) correo del participante sin cuenta
  const email = u ? u.email : String(ctx.email || "").trim().toLowerCase();
  if (!u && !EMAIL.test(email)) return { ok: false, errors, error: "Escribe un correo de contacto válido" };

  // 3) archivos: deben existir y haber sido cargados por este participante
  for (const q of allQuestions(schema)) {
    if (q.type !== "file" || !answers[q.id]) continue;
    const d = get<any>("SELECT * FROM documents WHERE id=? AND kind='formulario'", Number(answers[q.id].docId));
    if (!d || (u ? d.uploaded_by !== u.id && !(diag && d.company_id === diag.company_id) : d.uploaded_by != null)) errors[q.id] = "El archivo no es válido; vuelve a adjuntarlo";
  }

  // 4) duplicados: valores únicos por pregunta (p. ej. NIT) y una respuesta por empresa/usuario/correo
  for (const q of allQuestions(schema)) {
    if (!q.unique || answers[q.id] == null || answers[q.id] === "") continue;
    const dup = get<any>(`SELECT id FROM form_responses WHERE form_id=? AND status<>'borrador' AND id<>? AND json_extract(answers, ?)=?`,
      f.id, resp?.id ?? 0, `$."${q.id}"`, typeof answers[q.id] === "object" ? JSON.stringify(answers[q.id]) : answers[q.id]);
    if (dup) errors[q.id] = "Ya existe una respuesta enviada con este mismo valor";
  }
  if (Object.keys(errors).length) return { ok: false, errors, error: "Revisa los campos marcados" };

  if (!diag && !(schema.settings?.allowMultiple)) {
    const companyId = u?.company_id ?? null;
    const dup = companyId
      ? get<any>("SELECT id FROM form_responses WHERE form_id=? AND company_id=? AND status<>'borrador' AND id<>?", f.id, companyId, resp?.id ?? 0)
      : u ? get<any>("SELECT id FROM form_responses WHERE form_id=? AND user_id=? AND status<>'borrador' AND id<>?", f.id, u.id, resp?.id ?? 0)
        : get<any>("SELECT id FROM form_responses WHERE form_id=? AND lower(email)=? AND status<>'borrador'", f.id, email);
    if (dup) return { ok: false, error: companyId ? "Tu empresa ya envió este formulario. Consulta su estado en «Mis formularios»." : "Ya enviaste este formulario con estos datos." };
  }

  // 5) resultado automático (diagnóstico)
  const isDiag = f.kind === "diagnostico";
  const result = isDiag ? computeResult(schema, parseScoring(f.scoring), answers) : null;
  const ts = now();
  const prevStatus = resp?.status ?? null;
  const reviewed = isDiag && parseScoring(f.scoring).review;

  const rid = tx(() => {
    let id = resp?.id as number | undefined;
    if (id) {
      run("UPDATE form_responses SET answers=?, form_version=?, status='enviado', submitted_at=?, updated_at=?, decision_reason=NULL WHERE id=?",
        JSON.stringify(answers), version!.version, ts, ts, id);
    } else {
      id = insert(
        "INSERT INTO form_responses(form_id,form_version,company_id,user_id,email,answers,status,submitted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'enviado',?,?,?)",
        f.id, version!.version, diag ? diag.company_id : u?.company_id ?? null, u?.id ?? null, email, JSON.stringify(answers), ts, ts, ts);
    }
    if (result) storeResult(id!, result);
    if (diag) {
      const st = reviewed ? "en_revision" : "completado";
      run("UPDATE diagnostics SET response_id=?, status=?, score=?, level=?, segment=?, completed_at=? WHERE id=?",
        id, st, result!.total, result!.level, result!.segment || null, st === "completado" ? ts : null, diag.id);
    }
    // RF-FRM-10 / bandeja de validación: cada inscripción enviada abre un caso «pendiente»
    if (f.kind === "inscripcion") {
      const vc = get<any>("SELECT * FROM validation_cases WHERE response_id=?", id);
      if (!vc) {
        insert("INSERT INTO validation_cases(kind,response_id,company_id,program_id,status,created_at,updated_at) VALUES('inscripcion',?,?,?,'pendiente',?,?)",
          id, u?.company_id ?? null, f.program_id, ts, ts);
      } else if (vc.status === "ajustes") {
        run("UPDATE validation_cases SET status='pendiente', updated_at=? WHERE id=?", ts, vc.id);
      }
    }
    return id!;
  });

  await audit(u ?? { email }, prevStatus === "ajustes" ? "reenviar" : "enviar", "form_response", rid, prevStatus ? { status: prevStatus } : null,
    { form_id: f.id, version: version!.version, status: "enviado", score: result?.total, level: result?.level });
  if (diag) await audit(u, "cambiar_estado", "diagnostic", diag.id, { status: diag.status }, { status: reviewed ? "en_revision" : "completado", score: result!.total, level: result!.level });

  // RF-FRM-09: confirmación automática
  const r = { id: rid, form_id: f.id };
  const company = (diag?.company_id || u?.company_id) ? get<any>("SELECT razon_social FROM companies WHERE id=?", diag?.company_id || u?.company_id)?.razon_social : "";
  const vars = { name: u?.name || email, form: f.name, folio: folio(r), company: company || "", score: result?.total ?? "", level: result?.level ?? "", url: isDiag ? `/diagnosticos/${diag.id}` : `/mis-formularios/${rid}` };
  run("INSERT OR IGNORE INTO form_notices(response_id,kind,sent_at) VALUES(?,?,?)", rid, "recibido:" + ts, ts);
  notify({ key: isDiag ? "diagnostico_resultado" : "formulario_recibido", vars, email, phone: u?.phone, userId: u?.id ?? null });

  const msg = isDiag ? `Diagnóstico enviado. Puntaje ${result!.total}/100 · nivel ${result!.level}` : prevStatus === "ajustes" ? "Respuesta reenviada para revisión" : "Respuesta enviada";
  return {
    ok: true,
    redirect: isDiag ? `/diagnosticos/${diag.id}?ok=${encodeURIComponent(msg)}` : `/f/${f.slug}/gracias?r=${rid}`,
  };
}

/** Archivo adjunto de una pregunta: se valida (formato, tamaño, antivirus) y se guarda en OnBase. */
export async function uploadFormFile(fd: FormData): Promise<{ ok: boolean; docId?: number; name?: string; error?: string }> {
  const file = fd.get("file") as File | null;
  if (!file || typeof file === "string" || !file.size) return { ok: false, error: "Selecciona un archivo" };
  const L = await load({ formId: Number(fd.get("formId")), diagnosticId: Number(fd.get("diagnosticId")) || null, responseId: Number(fd.get("responseId")) || null });
  if (typeof L === "string") return { ok: false, error: L };
  const { u, diag } = L;
  const email = u?.email || String(fd.get("email") || "");
  const r = await storeDocument({ id: (u?.id ?? null) as any, email }, file, { company_id: diag?.company_id ?? u?.company_id ?? null, kind: "formulario" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, docId: r.id, name: file.name };
}

/** /f/[slug] de un diagnóstico: la empresa inicia su autodiagnóstico (RF-DIA-04). */
export async function startSelfDiagnostic(fd: FormData) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const f = getForm(Number(fd.get("form_id")));
  if (!f || f.kind !== "diagnostico" || f.status !== "publicado") redirect("/diagnosticos?error=" + encodeURIComponent("El instrumento no está publicado"));
  if (!u.company_id || !can(u, "diagnostics.self")) redirect("/diagnosticos?error=" + encodeURIComponent("El autodiagnóstico lo realiza la cuenta de la empresa"));
  const open = get<any>("SELECT id FROM diagnostics WHERE company_id=? AND form_id=? AND status IN ('asignado','en_curso')", u.company_id, f.id);
  if (open) redirect(`/diagnosticos/${open.id}`);
  const stage = ["inicial", "final", "seguimiento"].includes(String(fd.get("stage"))) ? String(fd.get("stage")) : nextStage(u.company_id, f.id);
  const id = insert("INSERT INTO diagnostics(company_id,form_id,stage,status,assigned_by,created_at) VALUES(?,?,?,'asignado',?,?)", u.company_id, f.id, stage, u.id, now());
  await audit(u, "autodiagnostico_iniciar", "diagnostic", id, null, { form_id: f.id, stage });
  redirect(`/diagnosticos/${id}`);
}
