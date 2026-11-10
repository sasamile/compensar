/**
 * Lógica de formularios sin código y diagnóstico (RF-FRM / RF-DIA).
 * Síncrona y sin dependencias de servidor: la usan el constructor, el renderizador (cliente)
 * y las acciones de servidor, de modo que la validación en pantalla y en el servidor es la misma.
 */
import { nitDv } from "./util";
import { validLocation, locationLabel } from "./divipola";

/* ===================== Tipos ===================== */
export type QType = "text" | "paragraph" | "number" | "date" | "single" | "multi" | "scale" | "file" | "nit" | "location";
export type Op = "eq" | "neq" | "includes" | "answered" | "empty" | "gte" | "lte";
export type Logic = { action: "show" | "hide"; questionId: string; op: Op; value?: string } | null;
export type Option = { value: string; label: string; score?: number };
export type Question = {
  id: string; type: QType; label: string; help?: string; required?: boolean; placeholder?: string;
  options?: Option[];
  min?: number | string | null; max?: number | string | null;   // número: valor; texto: longitud; múltiple: n.º opciones; fecha: AAAA-MM-DD
  format?: "" | "email" | "phone";                              // texto
  scaleMax?: 5 | 10; scaleMinLabel?: string; scaleMaxLabel?: string;
  weight?: number;                                              // diagnóstico: peso de la pregunta
  unique?: boolean;                                             // no se admite el mismo valor en dos respuestas enviadas
  logic?: Logic;
};
export type Section = { id: string; title: string; description?: string; weight?: number; logic?: Logic; questions: Question[] };
export type FormSettings = { allowMultiple?: boolean; confirmation?: string };
export type Schema = { sections: Section[]; settings?: FormSettings };
export type Level = { name: string; min: number; max: number; color?: string; recommendations?: string };
export type Segment = { name: string; target: string; op: "gte" | "lt"; value: number };
export type Scoring = { levels: Level[]; segments?: Segment[]; defaultSegment?: string; review?: boolean };
export type SectionResult = { id: string; name: string; score: number; max: number; raw: number; rawMax: number; weight: number; level?: string };
export type Result = {
  total: number; level: string; color?: string; segment?: string; recommendations: string[];
  sections: SectionResult[]; findings: string[]; computed_at?: string;
};
export type Answers = Record<string, any>;

export const QTYPES: { type: QType; label: string; hint: string }[] = [
  { type: "text", label: "Texto corto", hint: "Una línea: nombre, cargo, correo…" },
  { type: "paragraph", label: "Párrafo", hint: "Respuesta larga" },
  { type: "number", label: "Número", hint: "Con mínimo y máximo" },
  { type: "date", label: "Fecha", hint: "Calendario" },
  { type: "single", label: "Selección única", hint: "Una opción" },
  { type: "multi", label: "Selección múltiple", hint: "Varias opciones" },
  { type: "scale", label: "Escala", hint: "1–5 o 1–10" },
  { type: "file", label: "Archivo", hint: "Se guarda en OnBase" },
  { type: "nit", label: "NIT", hint: "Valida el dígito de verificación" },
  { type: "location", label: "Ubicación (DIVIPOLA)", hint: "Departamento → municipio" },
];
export const QTYPE_LABEL: Record<string, string> = Object.fromEntries(QTYPES.map((t) => [t.type, t.label]));
export const OPS: { op: Op; label: string; needsValue: boolean }[] = [
  { op: "eq", label: "es igual a", needsValue: true },
  { op: "neq", label: "es diferente de", needsValue: true },
  { op: "includes", label: "incluye", needsValue: true },
  { op: "gte", label: "es mayor o igual a", needsValue: true },
  { op: "lte", label: "es menor o igual a", needsValue: true },
  { op: "answered", label: "fue respondida", needsValue: false },
  { op: "empty", label: "no fue respondida", needsValue: false },
];
export const FORM_KINDS: [string, string][] = [["inscripcion", "Inscripción a programa"], ["diagnostico", "Diagnóstico empresarial"], ["encuesta", "Encuesta"], ["general", "General"]];
export const RESPONSE_STATUS: [string, string][] = [
  ["borrador", "Borrador"], ["enviado", "Enviado"], ["en_revision", "En revisión"], ["ajustes", "Requiere ajustes"], ["aprobado", "Aprobado"], ["rechazado", "Rechazado"],
];
export const statusLabel = (s: string) => RESPONSE_STATUS.find(([k]) => k === s)?.[1] ?? s;
export const DIAG_STATUS: [string, string][] = [["asignado", "Asignado"], ["en_curso", "En curso"], ["en_revision", "En revisión"], ["completado", "Completado"]];
export const DIAG_STAGES: [string, string][] = [["inicial", "Inicial"], ["seguimiento", "Seguimiento"], ["final", "Final"]];

export const newId = (p = "q") => p + "_" + Math.random().toString(36).slice(2, 8);
export const isChoice = (t: QType) => t === "single" || t === "multi";
export const isScorable = (q: Question) => q.type === "single" || q.type === "multi" || q.type === "scale";

export function blankQuestion(type: QType): Question {
  const q: Question = { id: newId(), type, label: "", required: false };
  if (isChoice(type)) q.options = [{ value: "op1", label: "Opción 1" }, { value: "op2", label: "Opción 2" }];
  if (type === "scale") { q.scaleMax = 5; q.scaleMinLabel = "Muy bajo"; q.scaleMaxLabel = "Muy alto"; }
  if (type === "nit") q.label = "NIT de la empresa";
  if (type === "location") q.label = "Departamento y municipio";
  return q;
}

export const parseSchema = (s: any): Schema => {
  let o: any = s;
  if (typeof s === "string") { try { o = JSON.parse(s); } catch { o = null; } }
  if (!o || !Array.isArray(o.sections)) return { sections: [], settings: {} };
  return { sections: o.sections.map((x: any) => ({ ...x, questions: Array.isArray(x.questions) ? x.questions : [] })), settings: o.settings || {} };
};
export const parseScoring = (s: any): Scoring => {
  let o: any = s;
  if (typeof s === "string") { try { o = JSON.parse(s); } catch { o = null; } }
  return { levels: Array.isArray(o?.levels) ? o.levels : [], segments: Array.isArray(o?.segments) ? o.segments : [], defaultSegment: o?.defaultSegment || "", review: o?.review !== false };
};
export const allQuestions = (s: Schema) => s.sections.flatMap((x) => x.questions);

/* ===================== Valores ===================== */
export const isEmpty = (v: any) =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && (("docId" in v && !v.docId) || ("dep" in v && !v.dep) || ("nit" in v && !v.nit)));

/** Separa "900111222-3" → { nit, dv } */
export function splitNit(v: any): { nit: string; dv: string } {
  if (v && typeof v === "object") return { nit: String(v.nit ?? ""), dv: String(v.dv ?? "") };
  const s = String(v ?? "").replace(/[.\s]/g, "");
  const [nit, dv] = s.split("-");
  return { nit: (nit || "").replace(/\D/g, ""), dv: (dv || "").replace(/\D/g, "") };
}

/** Texto legible de una respuesta (detalle y exportación). */
export function answerText(q: Question, v: any): string {
  if (isEmpty(v)) return "";
  switch (q.type) {
    case "single": return q.options?.find((o) => o.value === v)?.label ?? String(v);
    case "multi": return (Array.isArray(v) ? v : [v]).map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join("; ");
    case "scale": return `${v} / ${q.scaleMax || 5}`;
    case "file": return v?.name ? `${v.name} (doc ${v.docId})` : "";
    case "nit": { const { nit, dv } = splitNit(v); return dv ? `${nit}-${dv}` : nit; }
    case "location": return locationLabel(v);
    default: return String(v);
  }
}

/* ===================== Lógica condicional ===================== */
function testCond(op: Op, value: string | undefined, ans: any): boolean {
  const empty = isEmpty(ans);
  if (op === "answered") return !empty;
  if (op === "empty") return empty;
  if (empty) return op === "neq";
  const arr = Array.isArray(ans) ? ans.map(String) : [String(typeof ans === "object" ? JSON.stringify(ans) : ans)];
  const v = String(value ?? "");
  switch (op) {
    case "eq": return arr.length === 1 && arr[0] === v;
    case "neq": return !arr.includes(v);
    case "includes": return arr.includes(v) || arr.some((a) => a.toLowerCase().includes(v.toLowerCase()) && !Array.isArray(ans));
    case "gte": return Number(arr[0]) >= Number(v);
    case "lte": return Number(arr[0]) <= Number(v);
  }
  return true;
}
const logicPasses = (l: Logic | undefined, answers: Answers, visible: Record<string, boolean>) => {
  if (!l || !l.questionId) return true;
  const ans = visible[l.questionId] === false ? undefined : answers[l.questionId];
  const hit = testCond(l.op, l.value, ans);
  return l.action === "hide" ? !hit : hit;
};

/** Visibilidad de secciones y preguntas según las respuestas (se evalúa en orden; una pregunta oculta cuenta como no respondida). */
export function visibility(schema: Schema, answers: Answers) {
  const q: Record<string, boolean> = {};
  const s: Record<string, boolean> = {};
  for (const sec of schema.sections) {
    const secOn = logicPasses(sec.logic, answers, q);
    s[sec.id] = secOn;
    for (const qq of sec.questions) q[qq.id] = secOn && logicPasses(qq.logic, answers, q);
  }
  return { q, s };
}

/* ===================== Validación de respuestas ===================== */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?\d[\d\s-]{6,14}$/;
const num = (x: any) => (x === "" || x == null || isNaN(Number(x)) ? null : Number(x));

export function validateAnswer(q: Question, v: any): string | null {
  if (isEmpty(v)) return q.required ? "Esta pregunta es obligatoria" : null;
  const min = num(q.min), max = num(q.max);
  switch (q.type) {
    case "text": case "paragraph": {
      if (typeof v !== "string") return "Respuesta no válida";
      const s = v.trim();
      if (q.required && !s) return "Esta pregunta es obligatoria";
      if (s.length > 5000) return "El texto es demasiado largo (máx. 5000 caracteres)";
      if (min != null && s.length < min) return `Escribe al menos ${min} caracteres`;
      if (max != null && s.length > max) return `Escribe máximo ${max} caracteres`;
      if (q.format === "email" && !EMAIL.test(s)) return "Escribe un correo válido (ej.: nombre@empresa.com)";
      if (q.format === "phone" && !PHONE.test(s)) return "Escribe un teléfono válido (solo números, 7 a 15 dígitos)";
      return null;
    }
    case "number": {
      const n = num(v);
      if (n == null) return "Escribe un número válido";
      if (min != null && n < min) return `El valor mínimo es ${min}`;
      if (max != null && n > max) return `El valor máximo es ${max}`;
      return null;
    }
    case "date": {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(+new Date(v))) return "Escribe una fecha válida";
      if (q.min && v < String(q.min)) return `La fecha debe ser igual o posterior a ${q.min}`;
      if (q.max && v > String(q.max)) return `La fecha debe ser igual o anterior a ${q.max}`;
      return null;
    }
    case "single":
      return q.options?.some((o) => o.value === v) ? null : "Selecciona una opción de la lista";
    case "multi": {
      if (!Array.isArray(v)) return "Respuesta no válida";
      if (v.some((x) => !q.options?.some((o) => o.value === x))) return "Hay opciones que no pertenecen a la lista";
      if (new Set(v).size !== v.length) return "Opciones repetidas";
      if (min != null && v.length < min) return `Selecciona al menos ${min} opciones`;
      if (max != null && v.length > max) return `Selecciona máximo ${max} opciones`;
      return null;
    }
    case "scale": {
      const n = num(v), top = q.scaleMax || 5;
      return n != null && Number.isInteger(n) && n >= 1 && n <= top ? null : `Elige un valor entre 1 y ${top}`;
    }
    case "file":
      return v && typeof v === "object" && Number(v.docId) > 0 ? null : "Adjunta el archivo";
    case "nit": {
      const { nit, dv } = splitNit(v);
      if (!/^\d{6,15}$/.test(nit)) return "El NIT debe tener entre 6 y 15 dígitos, sin puntos";
      if (!/^\d$/.test(dv)) return "Escribe el dígito de verificación (DV)";
      if (nitDv(nit) !== dv) return "El dígito de verificación no corresponde al NIT";
      return null;
    }
    case "location":
      return v && typeof v === "object" && v.dep && v.mun && validLocation(v.dep, v.mun) ? null : v?.dep && !v?.mun ? "Selecciona el municipio" : "Selecciona un departamento y municipio válidos";
  }
  return null;
}

/** Valida las preguntas visibles. `only` limita a una sección (validación al avanzar). */
export function validateAll(schema: Schema, answers: Answers, only?: string): Record<string, string> {
  const vis = visibility(schema, answers);
  const errors: Record<string, string> = {};
  for (const sec of schema.sections) {
    if (only && sec.id !== only) continue;
    if (!vis.s[sec.id]) continue;
    for (const q of sec.questions) {
      if (!vis.q[q.id]) continue;
      const e = validateAnswer(q, answers[q.id]);
      if (e) errors[q.id] = e;
    }
  }
  return errors;
}

/** Limpia: deja solo preguntas existentes (y, al enviar, solo las visibles). Normaliza tipos. */
export function sanitizeAnswers(schema: Schema, answers: Answers, onlyVisible: boolean): Answers {
  const vis = visibility(schema, answers);
  const out: Answers = {};
  for (const q of allQuestions(schema)) {
    let v = answers?.[q.id];
    if (v === undefined || (onlyVisible && !vis.q[q.id])) continue;
    if (q.type === "number" && v !== "" && v != null && !isNaN(Number(v))) v = Number(v);
    if (q.type === "scale" && v !== "" && v != null) v = Number(v);
    if (q.type === "nit") { const { nit, dv } = splitNit(v); v = dv ? `${nit}-${dv}` : nit; }
    if ((q.type === "text" || q.type === "paragraph") && typeof v === "string") v = onlyVisible ? v.trim() : v;
    if (q.type === "file" && v && typeof v === "object") v = { docId: Number(v.docId) || 0, name: String(v.name || "").slice(0, 200) };
    if (q.type === "location" && v && typeof v === "object") v = { dep: String(v.dep || ""), mun: String(v.mun || "") };
    if (typeof v === "string" && v.length > 10000) v = v.slice(0, 10000);
    if (!onlyVisible || !isEmpty(v)) out[q.id] = v;
  }
  if (!onlyVisible && typeof answers?._step === "number") out._step = answers._step;
  return out;
}

/* ===================== Validación del instrumento (antes de publicar) ===================== */
export function validateSchema(schema: Schema, kind?: string): string[] {
  const errs: string[] = [];
  const qs = allQuestions(schema);
  if (!schema.sections.length || !qs.length) errs.push("Agrega al menos una pregunta.");
  const ids = new Set<string>();
  const seen: Question[] = [];
  schema.sections.forEach((sec, si) => {
    if (!sec.title?.trim()) errs.push(`La sección ${si + 1} no tiene título.`);
    if (sec.logic?.questionId && !seen.some((x) => x.id === sec.logic!.questionId)) errs.push(`La condición de la sección «${sec.title || si + 1}» debe depender de una pregunta anterior.`);
    sec.questions.forEach((q, qi) => {
      const name = `«${q.label || `pregunta ${qi + 1} de la sección ${si + 1}`}»`;
      if (ids.has(q.id)) errs.push(`Identificador repetido en ${name}.`);
      ids.add(q.id);
      if (!q.label?.trim()) errs.push(`La pregunta ${qi + 1} de la sección «${sec.title || si + 1}» no tiene enunciado.`);
      if (isChoice(q.type)) {
        if (!q.options?.length) errs.push(`${name} necesita al menos una opción.`);
        if (q.options?.some((o) => !o.label?.trim())) errs.push(`${name} tiene opciones sin texto.`);
        const vals = q.options?.map((o) => o.value) ?? [];
        if (new Set(vals).size !== vals.length) errs.push(`${name} tiene opciones repetidas.`);
      }
      const mn = num(q.min), mx = num(q.max);
      if (q.type !== "date" && mn != null && mx != null && mn > mx) errs.push(`${name}: el mínimo es mayor que el máximo.`);
      if (q.type === "date" && q.min && q.max && String(q.min) > String(q.max)) errs.push(`${name}: la fecha mínima es posterior a la máxima.`);
      if (q.logic?.questionId && !seen.some((x) => x.id === q.logic!.questionId)) errs.push(`La condición de ${name} debe depender de una pregunta anterior.`);
      if (q.logic?.questionId && q.logic.op !== "answered" && q.logic.op !== "empty" && (q.logic.value ?? "") === "") errs.push(`La condición de ${name} no tiene valor.`);
      seen.push(q);
    });
  });
  if (kind === "diagnostico" && !qs.some((q) => isScorable(q))) errs.push("Un diagnóstico necesita preguntas con puntaje (selección o escala).");
  return errs;
}

export function validateScoring(sc: Scoring): string[] {
  const errs: string[] = [];
  sc.levels.forEach((l, i) => {
    if (!l.name?.trim()) errs.push(`El nivel ${i + 1} no tiene nombre.`);
    if (!(Number(l.min) >= 0 && Number(l.max) <= 100 && Number(l.min) < Number(l.max))) errs.push(`El rango del nivel «${l.name || i + 1}» debe estar entre 0 y 100 (desde < hasta).`);
  });
  const sorted = [...sc.levels].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].min < sorted[i - 1].max) errs.push(`Los niveles «${sorted[i - 1].name}» y «${sorted[i].name}» se superponen.`);
  (sc.segments || []).forEach((s, i) => { if (!s.name?.trim()) errs.push(`El segmento ${i + 1} no tiene nombre.`); });
  return errs;
}

/* ===================== Puntaje (RF-DIA-05) ===================== */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/** Puntaje bruto y máximo de una pregunta. */
export function questionPoints(q: Question, v: any): { pts: number; max: number } {
  if (q.type === "scale") { const top = q.scaleMax || 5; const n = Number(v); return { pts: isEmpty(v) || isNaN(n) ? 0 : Math.min(top, Math.max(0, n)), max: top }; }
  if (q.type === "single") {
    const max = Math.max(0, ...(q.options || []).map((o) => Number(o.score) || 0));
    return { pts: Number(q.options?.find((o) => o.value === v)?.score) || 0, max };
  }
  if (q.type === "multi") {
    const pos = (q.options || []).reduce((a, o) => a + Math.max(0, Number(o.score) || 0), 0);
    const sel = Array.isArray(v) ? v : [];
    const pts = (q.options || []).filter((o) => sel.includes(o.value)).reduce((a, o) => a + (Number(o.score) || 0), 0);
    return { pts: Math.max(0, Math.min(pos, pts)), max: pos };
  }
  return { pts: 0, max: 0 };
}

export function levelFor(score: number, levels: Level[]): Level | undefined {
  const sorted = [...levels].sort((a, b) => a.min - b.min);
  return sorted.find((l, i) => score >= l.min && (score < l.max || (i === sorted.length - 1 && score <= l.max))) ??
    (score >= 100 ? sorted[sorted.length - 1] : undefined);
}

/**
 * Fórmula (documentada en docs/modulos/formularios-diagnostico.md):
 *  dimensión % = Σ(peso_pregunta × puntos) / Σ(peso_pregunta × puntos_máx) × 100   (preguntas visibles con puntaje)
 *  total      = Σ(peso_dimensión × dimensión %) / Σ(peso_dimensión)                 (dimensiones con puntaje)
 *  nivel      = rango [desde, hasta) que contiene el total (el último rango incluye 100)
 *  segmento   = primera regla que se cumple (total o dimensión ≥ / < valor); si ninguna, el segmento por defecto
 */
export function computeResult(schema: Schema, scoring: Scoring, answers: Answers): Result {
  const vis = visibility(schema, answers);
  const sections: SectionResult[] = [];
  for (const sec of schema.sections) {
    if (!vis.s[sec.id]) continue;
    let raw = 0, rawMax = 0, wPts = 0, wMax = 0;
    for (const q of sec.questions) {
      if (!vis.q[q.id] || !isScorable(q)) continue;
      const w = q.weight == null || (q.weight as any) === "" ? 1 : Number(q.weight);
      const { pts, max } = questionPoints(q, answers[q.id]);
      if (max <= 0) continue;
      raw += pts; rawMax += max; wPts += w * pts; wMax += w * max;
    }
    if (rawMax <= 0) continue;
    const score = wMax > 0 ? r1((wPts / wMax) * 100) : 0;
    sections.push({ id: sec.id, name: sec.title, score, max: 100, raw: r1(raw), rawMax: r1(rawMax), weight: sec.weight == null || (sec.weight as any) === "" ? 1 : Number(sec.weight) });
  }
  const tw = sections.reduce((a, s) => a + s.weight, 0);
  const total = tw > 0 ? r1(sections.reduce((a, s) => a + s.weight * s.score, 0) / tw) : 0;
  const lv = levelFor(total, scoring.levels);
  for (const s of sections) s.level = levelFor(s.score, scoring.levels)?.name;
  const recs = (lv?.recommendations || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  // Segmento: primera regla que se cumple
  let segment = scoring.defaultSegment || "";
  for (const sg of scoring.segments || []) {
    const val = sg.target === "total" ? total : sections.find((s) => s.id === sg.target || s.name === sg.target)?.score;
    if (val == null) continue;
    if (sg.op === "gte" ? val >= Number(sg.value) : val < Number(sg.value)) { segment = sg.name; break; }
  }
  // Hallazgos automáticos
  const findings: string[] = [];
  const sorted = [...sections].sort((a, b) => b.score - a.score);
  if (sorted.length) {
    const best = sorted[0], worst = sorted[sorted.length - 1];
    findings.push(`Fortaleza principal: ${best.name} (${best.score}/100${best.level ? ", " + best.level : ""}).`);
    if (sorted.length > 1) findings.push(`Mayor brecha: ${worst.name} (${worst.score}/100${worst.level ? ", " + worst.level : ""}). Priorizar esta dimensión en la ruta de acompañamiento.`);
    const low = sections.filter((s) => s.score < 40).map((s) => s.name);
    if (low.length) findings.push(`Dimensiones en nivel crítico (< 40): ${low.join(", ")}.`);
    const gap = best.score - worst.score;
    if (sorted.length > 1 && gap >= 30) findings.push(`Desarrollo desigual: ${r1(gap)} puntos de diferencia entre la dimensión más fuerte y la más débil.`);
  }
  return { total, level: lv?.name || "Sin nivel", color: lv?.color, segment, recommendations: recs, sections, findings };
}

/* ===================== Utilidades de presentación ===================== */
export const LEVEL_COLORS = ["#dc2626", "#f59e0b", "#16a34a", "#0a6cff", "#7c3aed"];
export const describeLogic = (l: Logic | undefined, schema: Schema) => {
  if (!l?.questionId) return "";
  const q = allQuestions(schema).find((x) => x.id === l.questionId);
  const op = OPS.find((o) => o.op === l.op);
  const val = q && isChoice(q.type) ? q.options?.find((o) => o.value === l.value)?.label ?? l.value : l.value;
  return `${l.action === "hide" ? "Omitir" : "Mostrar"} si «${q?.label || "?"}» ${op?.label || l.op}${op?.needsValue ? ` «${val}»` : ""}`;
};
