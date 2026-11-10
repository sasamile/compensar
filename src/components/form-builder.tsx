"use client";
/**
 * Constructor visual sin código (RF-FRM-02/03/04). Pensado para usuarios funcionales:
 * secciones, 10 tipos de pregunta, obligatoriedad, mínimos/máximos, ayuda, lógica mostrar/omitir,
 * reordenar, duplicar, bloques frecuentes, puntaje y pesos (diagnóstico), vista previa y guardado automático.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft, ArrowDown, ArrowUp, Calendar, CheckCircle2, CheckSquare, ChevronDown, ChevronRight, CircleDot, Copy, Eye, FileUp, GitBranch,
  Hash, IdCard, Loader2, MapPin, PencilRuler, Plus, SlidersHorizontal, Trash2, Type, CloudOff, ListPlus,
} from "lucide-react";
import FormRenderer from "./form-renderer";
import {
  OPS, QTYPES, QTYPE_LABEL, blankQuestion, describeLogic, isChoice, isScorable, newId, questionPoints, validateSchema,
  type Logic, type Option, type QType, type Question, type Schema, type Section,
} from "@/lib/forms";

const ICON: Record<QType, any> = {
  text: Type, paragraph: AlignLeft, number: Hash, date: Calendar, single: CircleDot, multi: CheckSquare,
  scale: SlidersHorizontal, file: FileUp, nit: IdCard, location: MapPin,
};

type SaveFn = (formId: number, json: string) => Promise<{ ok: boolean; savedAt?: string; error?: string }>;

const BLOCKS: { name: string; questions: () => Question[] }[] = [
  { name: "Datos de la empresa", questions: () => [
    { ...blankQuestion("text"), label: "Razón social", required: true },
    { ...blankQuestion("nit"), required: true, unique: true },
    { ...blankQuestion("location"), label: "Ubicación de la empresa", required: true },
    { ...blankQuestion("single"), label: "Tamaño de la empresa", required: true, options: ["Micro", "Pequeña", "Mediana", "Grande"].map((l, i) => ({ value: "t" + (i + 1), label: l })) },
    { ...blankQuestion("number"), label: "Número de empleados", min: 0, max: 10000 },
  ] },
  { name: "Datos de contacto", questions: () => [
    { ...blankQuestion("text"), label: "Nombre del representante", required: true },
    { ...blankQuestion("text"), label: "Cargo" },
    { ...blankQuestion("text"), label: "Correo electrónico", format: "email", required: true },
    { ...blankQuestion("text"), label: "Celular", format: "phone", required: true },
  ] },
  { name: "Autorización de datos", questions: () => [
    { ...blankQuestion("single"), label: "¿Autoriza el tratamiento de sus datos personales conforme a la Ley 1581 de 2012?", required: true,
      options: [{ value: "si", label: "Sí, autorizo" }, { value: "no", label: "No autorizo" }] },
  ] },
];

export default function FormBuilder({ formId, kind, initial, save, readOnly }: {
  formId: number; kind: string; initial: Schema; save: SaveFn; readOnly?: boolean;
}) {
  const diag = kind === "diagnostico";
  const [schema, setSchema] = useState<Schema>(() => (initial.sections.length ? initial : { ...initial, sections: [{ id: newId("s"), title: "Sección 1", questions: [] }] }));
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"design" | "preview">("design");
  const [st, setSt] = useState<{ state: "idle" | "dirty" | "saving" | "saved" | "error"; at?: string; msg?: string }>({ state: "idle" });
  const [palette, setPalette] = useState<string | null>(null);
  const lastSaved = useRef(JSON.stringify(schema.sections));
  const timer = useRef<any>(null);
  const latest = useRef(schema);
  latest.current = schema;

  async function doSave() {
    setSt((s) => ({ ...s, state: "saving" }));
    try {
      const body = JSON.stringify(latest.current.sections);
      const r = await save(formId, JSON.stringify({ sections: latest.current.sections }));
      if (r.ok) lastSaved.current = body;
      setSt(r.ok ? { state: "saved", at: r.savedAt } : { state: "error", msg: r.error });
    } catch { setSt({ state: "error", msg: "Sin conexión" }); }
  }
  useEffect(() => {
    if (readOnly || JSON.stringify(schema.sections) === lastSaved.current) return;
    setSt((s) => ({ ...s, state: "dirty" }));
    clearTimeout(timer.current);
    timer.current = setTimeout(doSave, 1200);
    return () => clearTimeout(timer.current);
  }, [schema]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); clearTimeout(timer.current); doSave(); } };
    const b = (e: BeforeUnloadEvent) => { if (st.state === "dirty" || st.state === "saving") e.preventDefault(); };
    window.addEventListener("keydown", k); window.addEventListener("beforeunload", b);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("beforeunload", b); };
  });

  /* ---------- operaciones ---------- */
  const mutate = (fn: (s: Section[]) => Section[]) => setSchema((x) => ({ ...x, sections: fn(structuredClone(x.sections)) }));
  const updQ = (qid: string, patch: Partial<Question>) => mutate((ss) => ss.map((s) => ({ ...s, questions: s.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) })));
  const updS = (sid: string, patch: Partial<Section>) => mutate((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const addQ = (sid: string, qs: Question[]) => { mutate((ss) => ss.map((s) => (s.id === sid ? { ...s, questions: [...s.questions, ...qs] } : s))); setOpen(qs.length === 1 ? qs[0].id : null); setPalette(null);
    setTimeout(() => document.getElementById(`bq-${qs[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); };
  const delQ = (qid: string) => { if (confirm("¿Eliminar esta pregunta? Las condiciones que dependan de ella también se quitarán.")) mutate((ss) => clearRefs(ss.map((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== qid) })), qid)); };
  const dupQ = (qid: string) => {
    const nid = newId();
    mutate((ss) => ss.map((s) => {
      const i = s.questions.findIndex((q) => q.id === qid);
      if (i < 0) return s;
      s.questions.splice(i + 1, 0, { ...structuredClone(s.questions[i]), id: nid, label: s.questions[i].label + " (copia)" });
      return s;
    }));
    setOpen(nid);
  };
  /** Mueve una pregunta; en los bordes pasa a la sección anterior/siguiente. */
  const moveQ = (qid: string, dir: -1 | 1) => mutate((ss) => {
    const si = ss.findIndex((s) => s.questions.some((q) => q.id === qid));
    const qi = ss[si].questions.findIndex((q) => q.id === qid);
    const [q] = ss[si].questions.splice(qi, 1);
    const ni = qi + dir;
    if (ni < 0) { if (si > 0) ss[si - 1].questions.push(q); else ss[si].questions.unshift(q); }
    else if (ni > ss[si].questions.length) { if (si < ss.length - 1) ss[si + 1].questions.unshift(q); else ss[si].questions.push(q); }
    else ss[si].questions.splice(ni, 0, q);
    return ss;
  });
  const moveS = (sid: string, dir: -1 | 1) => mutate((ss) => { const i = ss.findIndex((s) => s.id === sid); const j = i + dir; if (j < 0 || j >= ss.length) return ss; [ss[i], ss[j]] = [ss[j], ss[i]]; return ss; });
  const addS = () => { const id = newId("s"); mutate((ss) => [...ss, { id, title: diag ? `Dimensión ${ss.length + 1}` : `Sección ${ss.length + 1}`, questions: [], weight: diag ? 1 : undefined }]); setPalette(id); };
  const delS = (sid: string) => {
    const s = schema.sections.find((x) => x.id === sid)!;
    if (schema.sections.length === 1) return alert("El formulario necesita al menos una sección.");
    if (!confirm(`¿Eliminar la sección «${s.title}» y sus ${s.questions.length} pregunta(s)?`)) return;
    mutate((ss) => { let out = ss.filter((x) => x.id !== sid); for (const q of s.questions) out = clearRefs(out, q.id); return out; });
  };

  const flat = useMemo(() => schema.sections.flatMap((s) => s.questions), [schema]);
  const num = (qid: string) => flat.findIndex((q) => q.id === qid) + 1;
  const problems = useMemo(() => validateSchema(schema, kind), [schema, kind]);

  return (
    <div>
      {/* barra de herramientas */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8 print:hidden">
        <div className="flex rounded-lg bg-slate-200/70 p-0.5 text-sm" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "design"} onClick={() => setTab("design")} className={`flex items-center gap-1 rounded-md px-3 py-1 ${tab === "design" ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}><PencilRuler className="h-4 w-4" />Diseño</button>
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={`flex items-center gap-1 rounded-md px-3 py-1 ${tab === "preview" ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}><Eye className="h-4 w-4" />Vista previa</button>
        </div>
        <span className="text-xs text-slate-500">{schema.sections.length} {diag ? (schema.sections.length === 1 ? "dimensión" : "dimensiones") : schema.sections.length === 1 ? "sección" : "secciones"} · {flat.length} {flat.length === 1 ? "pregunta" : "preguntas"}</span>
        <div className="flex-1" />
        <span className="text-xs" aria-live="polite">
          {st.state === "saving" ? <span className="flex items-center gap-1 text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Guardando…</span>
            : st.state === "dirty" ? <span className="text-slate-500">Cambios sin guardar…</span>
            : st.state === "saved" ? <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" />Borrador guardado {st.at ? new Date(st.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : ""}</span>
            : st.state === "error" ? <span className="flex items-center gap-1 text-red-700"><CloudOff className="h-3 w-3" />{st.msg}</span>
            : readOnly ? <span className="text-slate-500">Solo lectura</span> : <span className="text-slate-500">Se guarda automáticamente (Ctrl+S)</span>}
        </span>
        {!readOnly && <button type="button" className="btn-ghost btn-sm" onClick={() => { clearTimeout(timer.current); doSave(); }}>Guardar ahora</button>}
      </div>

      {tab === "preview" ? (
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Así verán el formulario los participantes. Puedes probar las validaciones y la lógica condicional; nada se guarda.</div>
          <div className="card"><FormRenderer key={JSON.stringify(schema).length} schema={schema} mode="preview" kind={kind} /></div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* índice */}
          <nav aria-label="Índice del formulario" className="hidden lg:block">
            <div className="sticky top-32 max-h-[70vh] space-y-3 overflow-y-auto text-sm">
              {schema.sections.map((s, si) => (
                <div key={s.id}>
                  <a href={`#bs-${s.id}`} className="block truncate font-medium text-slate-700 hover:text-brand">{si + 1}. {s.title || "Sin título"}</a>
                  <ul className="mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                    {s.questions.map((q) => (
                      <li key={q.id}><button type="button" onClick={() => { setOpen(q.id); document.getElementById(`bq-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                        className={`block w-full truncate text-left text-xs ${open === q.id ? "font-medium text-brand" : "text-slate-500 hover:text-slate-800"}`}>{num(q.id)}. {q.label || "(sin enunciado)"}</button></li>))}
                  </ul>
                </div>))}
              {problems.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <b>Antes de publicar:</b>
                  <ul className="ml-4 mt-1 list-disc space-y-0.5">{problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>)}
            </div>
          </nav>

          <div className="min-w-0 space-y-6">
            {schema.sections.map((s, si) => (
              <section key={s.id} id={`bs-${s.id}`} className="scroll-mt-32 rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="rounded-t-xl border-b border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="mt-2 rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-white">{diag ? "Dimensión" : "Sección"} {si + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input aria-label="Título de la sección" disabled={readOnly} className="input !text-base font-semibold" value={s.title} placeholder="Título de la sección" onChange={(e) => updS(s.id, { title: e.target.value })} />
                      <textarea aria-label="Descripción de la sección" disabled={readOnly} rows={1} className="input text-sm" value={s.description || ""} placeholder="Descripción o instrucciones (opcional)" onChange={(e) => updS(s.id, { description: e.target.value })} />
                    </div>
                    {!readOnly && <div className="flex gap-1">
                      <IconBtn label="Subir sección" onClick={() => moveS(s.id, -1)} disabled={si === 0}><ArrowUp className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Bajar sección" onClick={() => moveS(s.id, 1)} disabled={si === schema.sections.length - 1}><ArrowDown className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Eliminar sección" danger onClick={() => delS(s.id)}><Trash2 className="h-4 w-4" /></IconBtn>
                    </div>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 pl-0 text-xs sm:pl-20">
                    {diag && <label className="flex items-center gap-1.5 text-slate-600">Peso de la dimensión
                      <input type="number" min={0} step="any" disabled={readOnly} className="input !w-20 !py-1" value={s.weight ?? 1} onChange={(e) => updS(s.id, { weight: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>}
                    <LogicEditor logic={s.logic} disabled={readOnly} before={schema.sections.slice(0, si).flatMap((x) => x.questions)} subject="esta sección" onChange={(l) => updS(s.id, { logic: l })} />
                  </div>
                </div>

                <div className="space-y-2 p-3 sm:p-4">
                  {s.questions.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Esta sección aún no tiene preguntas. Usa «Agregar pregunta».</p>}
                  {s.questions.map((q) => {
                    const Icon = ICON[q.type];
                    const isOpen = open === q.id;
                    const before = flat.slice(0, flat.findIndex((x) => x.id === q.id));
                    return (
                      <div key={q.id} id={`bq-${q.id}`} className={`scroll-mt-32 rounded-lg border ${isOpen ? "border-brand shadow-sm ring-2 ring-brand/10" : "border-slate-200"}`}>
                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : q.id)}>
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                          <span className="w-6 shrink-0 text-xs font-semibold text-slate-400">{num(q.id)}</span>
                          <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                          <span className={`min-w-0 flex-1 truncate text-sm ${q.label ? "text-slate-800" : "italic text-slate-400"}`}>{q.label || "Pregunta sin enunciado"}{q.required && <span className="text-red-600"> *</span>}</span>
                          {q.logic?.questionId && <span title={describeLogic(q.logic, schema)} className="hidden items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800 sm:flex"><GitBranch className="h-3 w-3" />condicional</span>}
                          {diag && isScorable(q) && <span className="hidden rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 sm:inline">{questionPoints(q, null).max} pts × {q.weight ?? 1}</span>}
                          <span className="hidden text-[11px] text-slate-400 md:inline">{QTYPE_LABEL[q.type]}</span>
                        </button>
                        {isOpen && (
                          <QuestionEditor q={q} diag={diag} readOnly={readOnly} before={before} schema={schema}
                            onChange={(p) => updQ(q.id, p)} onDelete={() => delQ(q.id)} onDuplicate={() => dupQ(q.id)}
                            onUp={() => moveQ(q.id, -1)} onDown={() => moveQ(q.id, 1)} />)}
                      </div>);
                  })}

                  {!readOnly && (palette === s.id ? (
                    <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                      <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700">¿Qué tipo de pregunta? <button type="button" className="text-xs text-slate-500 underline" onClick={() => setPalette(null)}>Cancelar</button></div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
                        {QTYPES.map((t) => { const I = ICON[t.type]; return (
                          <button key={t.type} type="button" onClick={() => addQ(s.id, [blankQuestion(t.type)])}
                            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-brand hover:bg-white focus:border-brand">
                            <I className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span><span className="block text-sm font-medium text-slate-800">{t.label}</span><span className="block text-[11px] text-slate-500">{t.hint}</span></span>
                          </button>); })}
                      </div>
                      {!diag && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-brand/20 pt-2 text-xs">
                          <span className="text-slate-500"><ListPlus className="mr-1 inline h-3.5 w-3.5" />Bloques listos:</span>
                          {BLOCKS.map((b) => <button key={b.name} type="button" className="btn-ghost btn-sm" onClick={() => addQ(s.id, b.questions().map((q) => ({ ...q, id: newId() })))}>{b.name}</button>)}
                        </div>)}
                    </div>
                  ) : (
                    <button type="button" className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:border-brand hover:text-brand" onClick={() => setPalette(s.id)}>
                      <Plus className="h-4 w-4" />Agregar pregunta
                    </button>))}
                </div>
              </section>))}
            {!readOnly && <button type="button" className="btn-ghost w-full" onClick={addS}><Plus className="h-4 w-4" />Agregar {diag ? "dimensión" : "sección"}</button>}
            {problems.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:hidden">
                <b>Antes de publicar:</b><ul className="ml-4 mt-1 list-disc">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Quita condiciones que apuntaban a una pregunta eliminada. */
function clearRefs(ss: Section[], qid: string): Section[] {
  return ss.map((s) => ({ ...s, logic: s.logic?.questionId === qid ? null : s.logic, questions: s.questions.map((q) => (q.logic?.questionId === qid ? { ...q, logic: null } : q)) }));
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
    className={`rounded-md border border-slate-200 bg-white p-1.5 disabled:opacity-30 ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100"}`}>{children}</button>;
}

/* ===================== Editor de pregunta ===================== */
function QuestionEditor({ q, diag, before, schema, onChange, onDelete, onDuplicate, onUp, onDown, readOnly }: {
  q: Question; diag: boolean; before: Question[]; schema: Schema; readOnly?: boolean;
  onChange: (p: Partial<Question>) => void; onDelete: () => void; onDuplicate: () => void; onUp: () => void; onDown: () => void;
}) {
  const [bulk, setBulk] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!q.label) labelRef.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changeType = (t: QType) => {
    const p: Partial<Question> = { type: t };
    if (isChoice(t) && !q.options?.length) p.options = blankQuestion(t).options;
    if (t === "scale" && !q.scaleMax) Object.assign(p, { scaleMax: 5, scaleMinLabel: "Muy bajo", scaleMaxLabel: "Muy alto" });
    if (t !== q.type) { p.min = null; p.max = null; }
    onChange(p);
  };
  const opts = q.options || [];
  const setOpt = (i: number, patch: Partial<Option>) => onChange({ options: opts.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const nextVal = () => "op" + (Math.max(0, ...opts.map((o) => Number(String(o.value).replace(/\D/g, "")) || 0)) + 1);
  const minMax = q.type === "number" ? ["Valor mínimo", "Valor máximo"] : q.type === "multi" ? ["Mínimo de opciones", "Máximo de opciones"] : q.type === "text" || q.type === "paragraph" ? ["Mínimo de caracteres", "Máximo de caracteres"] : q.type === "date" ? ["Fecha mínima", "Fecha máxima"] : null;
  const id = (k: string) => `${q.id}-${k}`;
  return (
    <fieldset disabled={readOnly} className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-3 sm:px-4">
      <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
        <div><label className="label" htmlFor={id("l")}>Enunciado de la pregunta *</label>
          <input ref={labelRef} id={id("l")} className="input" value={q.label} placeholder="Ej.: ¿Cuántos empleados tiene la empresa?" onChange={(e) => onChange({ label: e.target.value })} /></div>
        <div><label className="label" htmlFor={id("t")}>Tipo de respuesta</label>
          <select id={id("t")} className="input" value={q.type} onChange={(e) => changeType(e.target.value as QType)}>
            {QTYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select></div>
      </div>
      <div><label className="label" htmlFor={id("h")}>Texto de ayuda (opcional)</label>
        <input id={id("h")} className="input" value={q.help || ""} placeholder="Explica qué debe responder o en qué formato" onChange={(e) => onChange({ help: e.target.value })} /></div>

      {/* opciones */}
      {isChoice(q.type) && (
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="label !mb-0">Opciones {diag && "y puntaje"}</span>
            <button type="button" className="text-xs text-brand underline" onClick={() => setBulk(!bulk)}>{bulk ? "Volver a la lista" : "Pegar varias opciones"}</button></div>
          {bulk ? (
            <div>
              <textarea className="input" rows={5} defaultValue={opts.map((o) => (diag ? `${o.label} | ${o.score ?? 0}` : o.label)).join("\n")} id={id("bulk")}
                placeholder={diag ? "Una opción por línea. Puntaje opcional después de |\nNo existe | 0\nParcial | 2\nCompleto | 4" : "Una opción por línea"} />
              <button type="button" className="btn btn-sm mt-1" onClick={() => {
                const lines = (document.getElementById(id("bulk")) as HTMLTextAreaElement).value.split("\n").map((l) => l.trim()).filter(Boolean);
                onChange({ options: lines.map((l, i) => { const [lab, sc] = l.split("|").map((x) => x.trim()); return { value: opts[i]?.value || "op" + (i + 1), label: lab, ...(diag ? { score: Number(sc) || 0 } : {}) }; }) });
                setBulk(false);
              }}>Aplicar opciones</button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {opts.map((o, i) => (
                <li key={o.value + i} className="flex items-center gap-1.5">
                  {q.type === "single" ? <CircleDot className="h-4 w-4 shrink-0 text-slate-300" /> : <CheckSquare className="h-4 w-4 shrink-0 text-slate-300" />}
                  <input className="input !py-1.5" aria-label={`Opción ${i + 1}`} value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onChange({ options: [...opts.slice(0, i + 1), { value: nextVal(), label: "", ...(diag ? { score: 0 } : {}) }, ...opts.slice(i + 1)] }); setTimeout(() => (document.querySelector(`[aria-label="Opción ${i + 2}"]`) as HTMLInputElement)?.focus(), 30); } }} />
                  {diag && <input type="number" step="any" className="input !w-20 !py-1.5" aria-label={`Puntaje de la opción ${i + 1}`} title="Puntaje" value={o.score ?? 0} onChange={(e) => setOpt(i, { score: Number(e.target.value) })} />}
                  <IconBtn label="Subir opción" disabled={i === 0} onClick={() => { const a = [...opts]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange({ options: a }); }}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Eliminar opción" danger onClick={() => onChange({ options: opts.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </li>))}
              <li><button type="button" className="text-sm text-brand" onClick={() => onChange({ options: [...opts, { value: nextVal(), label: `Opción ${opts.length + 1}`, ...(diag ? { score: 0 } : {}) }] })}>+ Agregar opción</button>
                <span className="ml-2 text-[11px] text-slate-400">Consejo: Enter crea la siguiente opción</span></li>
            </ul>)}
        </div>)}

      {q.type === "scale" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div><span className="label">Rango</span>
            <div className="flex gap-1">{[5, 10].map((n) => <button key={n} type="button" onClick={() => onChange({ scaleMax: n as 5 | 10 })} className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${q.scaleMax === n ? "border-brand bg-brand text-white" : "border-slate-300"}`}>1 – {n}</button>)}</div></div>
          <div><label className="label" htmlFor={id("smin")}>Etiqueta del 1</label><input id={id("smin")} className="input" value={q.scaleMinLabel || ""} onChange={(e) => onChange({ scaleMinLabel: e.target.value })} /></div>
          <div><label className="label" htmlFor={id("smax")}>Etiqueta del máximo</label><input id={id("smax")} className="input" value={q.scaleMaxLabel || ""} onChange={(e) => onChange({ scaleMaxLabel: e.target.value })} /></div>
        </div>)}

      {q.type === "text" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={id("f")}>Formato</label>
            <select id={id("f")} className="input" value={q.format || ""} onChange={(e) => onChange({ format: e.target.value as any })}>
              <option value="">Texto libre</option><option value="email">Correo electrónico</option><option value="phone">Teléfono</option>
            </select></div>
          <div><label className="label" htmlFor={id("ph")}>Texto de ejemplo (placeholder)</label><input id={id("ph")} className="input" value={q.placeholder || ""} onChange={(e) => onChange({ placeholder: e.target.value })} /></div>
        </div>)}

      {minMax && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={id("min")}>{minMax[0]}</label>
            <input id={id("min")} className="input" type={q.type === "date" ? "date" : "number"} value={q.min ?? ""} onChange={(e) => onChange({ min: e.target.value === "" ? null : q.type === "date" ? e.target.value : Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor={id("max")}>{minMax[1]}</label>
            <input id={id("max")} className="input" type={q.type === "date" ? "date" : "number"} value={q.max ?? ""} onChange={(e) => onChange({ max: e.target.value === "" ? null : q.type === "date" ? e.target.value : Number(e.target.value) })} /></div>
        </div>)}
      {q.type === "file" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">El participante adjunta PDF, Word, Excel, PowerPoint o imagen (máx. 20 MB). El archivo pasa por antivirus y se guarda en OnBase.</p>}
      {q.type === "nit" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Se pide el NIT y el dígito de verificación; se valida con el algoritmo módulo 11 de la DIAN en pantalla y en el servidor.</p>}
      {q.type === "location" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Lista de departamentos y municipios según DIVIPOLA (DANE). El municipio depende del departamento elegido.</p>}

      {diag && isScorable(q) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <label className="flex items-center gap-1.5">Peso de la pregunta
            <input type="number" min={0} step="any" className="input !w-20 !py-1" value={q.weight ?? 1} onChange={(e) => onChange({ weight: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
          <span>Puntaje máximo: <b>{questionPoints(q, null).max}</b>{q.type === "scale" ? " (el valor elegido es el puntaje)" : ""}</span>
        </div>)}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!q.required} onChange={(e) => onChange({ required: e.target.checked })} />Obligatoria</label>
        {(q.type === "text" || q.type === "nit") && <label className="flex items-center gap-2" title="Rechaza el envío si otra respuesta ya usó el mismo valor"><input type="checkbox" checked={!!q.unique} onChange={(e) => onChange({ unique: e.target.checked })} />No permitir valores repetidos</label>}
      </div>
      <LogicEditor logic={q.logic} before={before} subject="esta pregunta" onChange={(l) => onChange({ logic: l })} disabled={readOnly} />

      {!readOnly && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          <button type="button" className="btn-ghost btn-sm" onClick={onUp}><ArrowUp className="h-3.5 w-3.5" />Subir</button>
          <button type="button" className="btn-ghost btn-sm" onClick={onDown}><ArrowDown className="h-3.5 w-3.5" />Bajar</button>
          <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" />Duplicar</button>
          <div className="flex-1" />
          <button type="button" className="btn-ghost btn-sm !text-red-600" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" />Eliminar</button>
        </div>)}
    </fieldset>
  );
}

/* ===================== Lógica condicional ===================== */
function LogicEditor({ logic, before, subject, onChange, disabled }: { logic?: Logic; before: Question[]; subject: string; onChange: (l: Logic) => void; disabled?: boolean }) {
  const on = !!logic?.questionId;
  const src = before.find((x) => x.id === logic?.questionId);
  const opDef = OPS.find((o) => o.op === logic?.op);
  if (!on) return (
    <button type="button" disabled={disabled || !before.length} className="flex items-center gap-1 text-xs text-violet-700 disabled:text-slate-400"
      title={before.length ? "" : "Necesitas preguntas anteriores para crear una condición"}
      onClick={() => onChange({ action: "show", questionId: before[before.length - 1].id, op: "eq", value: before[before.length - 1].options?.[0]?.value ?? "" })}>
      <GitBranch className="h-3.5 w-3.5" />{before.length ? `Agregar condición (mostrar u omitir ${subject})` : "Condición: disponible desde la segunda pregunta"}
    </button>);
  const l = logic!;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-2 text-xs text-violet-900">
      <GitBranch className="h-3.5 w-3.5" />
      <select aria-label="Acción" className="input !w-auto !py-1 !text-xs" value={l.action} onChange={(e) => onChange({ ...l, action: e.target.value as any })}>
        <option value="show">Mostrar {subject} solo si</option><option value="hide">Omitir {subject} si</option>
      </select>
      <select aria-label="Pregunta de referencia" className="input !w-auto max-w-56 !py-1 !text-xs" value={l.questionId} onChange={(e) => { const q = before.find((x) => x.id === e.target.value); onChange({ ...l, questionId: e.target.value, value: q?.options?.[0]?.value ?? "" }); }}>
        {before.map((q, i) => <option key={q.id} value={q.id}>{i + 1}. {(q.label || "(sin enunciado)").slice(0, 50)}</option>)}
      </select>
      <select aria-label="Operador" className="input !w-auto !py-1 !text-xs" value={l.op} onChange={(e) => onChange({ ...l, op: e.target.value as any })}>
        {OPS.filter((o) => (o.op === "gte" || o.op === "lte" ? src?.type === "number" || src?.type === "scale" : o.op === "includes" ? src?.type !== "number" : true))
          .map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {opDef?.needsValue && (src && isChoice(src.type) ? (
        <select aria-label="Valor" className="input !w-auto max-w-48 !py-1 !text-xs" value={l.value ?? ""} onChange={(e) => onChange({ ...l, value: e.target.value })}>
          {src.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : <input aria-label="Valor" className="input !w-32 !py-1 !text-xs" value={l.value ?? ""} onChange={(e) => onChange({ ...l, value: e.target.value })} placeholder="valor" />)}
      <button type="button" className="ml-auto text-violet-700 underline" onClick={() => onChange(null)}>Quitar condición</button>
    </div>
  );
}
