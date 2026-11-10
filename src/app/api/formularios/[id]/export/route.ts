/** RF-FRM-06: exportación de respuestas a Excel/CSV con una columna por pregunta (unión de todas las versiones). */
import { all } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fileResponse, toCsv, toXlsx, XLSX_TYPE, type Col } from "@/lib/xlsx";
import { fmtDate, jparse, slugify } from "@/lib/util";
import { answerText, parseSchema, statusLabel, type Question } from "@/lib/forms";
import { canSeeResponses, folio, getForm, responseRows } from "@/app/(app)/formularios/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const f = getForm(Number((await params).id));
  if (!f) return new Response("No existe", { status: 404 });
  if (!canSeeResponses(u, f)) return new Response("Sin acceso", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const fmt = sp.format === "csv" ? "csv" : "xlsx";
  const rows = responseRows(f.id, sp);

  // Preguntas: orden de la versión más reciente; las eliminadas en versiones nuevas se agregan al final
  const versions = all<any>("SELECT version, schema FROM form_versions WHERE form_id=? ORDER BY version DESC", f.id);
  const qmap = new Map<string, { q: Question; section: string }>();
  const dims = new Map<string, string>();
  for (const v of versions) {
    for (const s of parseSchema(v.schema).sections) {
      if (!dims.has(s.id)) dims.set(s.id, s.title);
      for (const q of s.questions) if (!qmap.has(q.id)) qmap.set(q.id, { q, section: s.title });
    }
  }
  const diag = f.kind === "diagnostico";
  const labels = new Map<string, number>();
  const qcols: Col[] = [...qmap.values()].map(({ q }) => {
    let h = q.label || q.id;
    const n = (labels.get(h) || 0) + 1; labels.set(h, n);
    if (n > 1) h = `${h} (${n})`;
    return { header: h, key: "q_" + q.id, width: Math.min(45, Math.max(16, h.length + 2)) };
  });
  const cols: Col[] = [
    { header: "Folio", key: "folio" }, { header: "Versión", key: "version" }, { header: "Estado", key: "estado" },
    { header: "Empresa", key: "empresa", width: 28 }, { header: "NIT empresa", key: "nit" }, { header: "Diligenciado por", key: "usuario", width: 24 },
    { header: "Correo", key: "email", width: 26 }, { header: "Enviado", key: "enviado", width: 20 }, { header: "Actualizado", key: "actualizado", width: 20 },
    ...(diag ? [{ header: "Etapa", key: "etapa" }, { header: "Puntaje total", key: "puntaje" }, { header: "Nivel", key: "nivel" }, { header: "Segmento", key: "segmento" },
      ...[...dims.entries()].map(([id, t]) => ({ header: `Dimensión: ${t}`, key: "d_" + id }))] : []),
    { header: "Motivo / observación", key: "motivo", width: 30 },
    ...qcols,
  ];
  const data = rows.map((r) => {
    const a = jparse<any>(r.answers, {});
    const res = jparse<any>(r.result, null);
    const o: any = {
      folio: folio(r), version: r.form_version, estado: statusLabel(r.status), empresa: r.company || "", nit: r.company_nit ? `${r.company_nit}-${r.company_dv}` : "",
      usuario: r.user_name || "", email: r.email || "", enviado: fmtDate(r.submitted_at), actualizado: fmtDate(r.updated_at), motivo: r.decision_reason || "",
      etapa: r.stage || "", puntaje: r.score ?? "", nivel: r.level || "", segmento: r.segment || "",
    };
    for (const s of res?.sections || []) o["d_" + s.id] = s.score;
    for (const [id, { q }] of qmap) o["q_" + id] = answerText(q, a[id]);
    return o;
  });
  await audit(u, "exportar_respuestas", "form", f.id, null, { formato: fmt, filas: data.length, filtros: sp });
  const name = `respuestas-${slugify(f.name) || f.id}`;
  return fmt === "csv"
    ? fileResponse(toCsv(cols, data), `${name}.csv`, "text/csv; charset=utf-8")
    : fileResponse(await toXlsx("Respuestas", cols, data), `${name}.xlsx`, XLSX_TYPE);
}
