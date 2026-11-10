"use client";
/**
 * Diligenciamiento de formularios (RF-FRM-03/07/08): validación en tiempo real con las mismas reglas del servidor
 * (src/lib/forms.ts), avance por secciones, guardado automático del borrador y reanudación donde quedó.
 * mode="preview" sirve para la vista previa del constructor (no guarda ni envía).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CloudOff, Loader2, Paperclip, Save, Send, X } from "lucide-react";
import { DIVIPOLA, departamento } from "@/lib/divipola";
import { nitDv } from "@/lib/util";
import {
  isEmpty, splitNit, validateAll, validateAnswer, visibility, type Answers, type Question, type Schema,
} from "@/lib/forms";

const DEPS = [...DIVIPOLA].sort((a, b) => a.name.localeCompare(b.name, "es"));

type SaveFn = (i: { formId: number; responseId?: number | null; diagnosticId?: number | null; answers: Answers }) => Promise<{ ok: boolean; responseId?: number; savedAt?: string; error?: string }>;
type SubmitFn = (i: { formId: number; responseId?: number | null; diagnosticId?: number | null; answers: Answers; email?: string }) => Promise<{ ok: boolean; errors?: Record<string, string>; error?: string; redirect?: string }>;
type UploadFn = (fd: FormData) => Promise<{ ok: boolean; docId?: number; name?: string; error?: string }>;

export default function FormRenderer(props: {
  schema: Schema; mode?: "fill" | "preview"; kind?: string;
  formId?: number; responseId?: number | null; diagnosticId?: number | null;
  initialAnswers?: Answers; anonymous?: boolean; submitLabel?: string; notice?: string;
  saveAction?: SaveFn; submitAction?: SubmitFn; uploadAction?: UploadFn;
}) {
  const { schema, mode = "fill", formId = 0, anonymous } = props;
  const preview = mode === "preview";
  const storageKey = `frm_${formId}_${props.diagnosticId || ""}`;
  const [answers, setAnswers] = useState<Answers>(() => props.initialAnswers || {});
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [responseId, setResponseId] = useState<number | null>(props.responseId ?? null);
  const [save, setSave] = useState<{ state: "idle" | "dirty" | "saving" | "saved" | "error" | "local"; at?: string; msg?: string }>({ state: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string>("");
  const [restored, setRestored] = useState(false);

  const vis = useMemo(() => visibility(schema, answers), [schema, answers]);
  const sections = schema.sections.filter((s) => vis.s[s.id]);
  const [step, setStep] = useState<number>(() => Math.max(0, Number(props.initialAnswers?._step) || 0));
  const cur = Math.min(step, Math.max(0, sections.length - 1));
  const sec = sections[cur];
  const total = schema.sections.reduce((a, s) => a + s.questions.length, 0);
  const answered = schema.sections.flatMap((s) => s.questions).filter((q) => vis.q[q.id] && !isEmpty(answers[q.id])).length;
  const visibleCount = schema.sections.flatMap((s) => s.questions).filter((q) => vis.q[q.id]).length;

  // Formularios sin sesión: el borrador vive en este navegador
  useEffect(() => {
    if (preview || !anonymous) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const o = JSON.parse(raw); setAnswers(o.answers || {}); setEmail(o.email || ""); setStep(Number(o.answers?._step) || 0); setRestored(true); }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- guardado automático (debounce) ---------- */
  const timer = useRef<any>(null);
  const saving = useRef(false);
  const pending = useRef<Answers | null>(null);
  const ridRef = useRef<number | null>(responseId);
  ridRef.current = responseId;
  const emailRef = useRef(email);
  emailRef.current = email;

  async function flush(data: Answers) {
    if (preview) return;
    if (anonymous || !props.saveAction) {
      try { localStorage.setItem(storageKey, JSON.stringify({ answers: data, email: emailRef.current })); setSave({ state: "local", at: new Date().toISOString() }); } catch {}
      return;
    }
    if (saving.current) { pending.current = data; return; }
    saving.current = true;
    setSave((s) => ({ ...s, state: "saving" }));
    try {
      const r = await props.saveAction({ formId, responseId: ridRef.current, diagnosticId: props.diagnosticId, answers: data });
      if (r.ok) { if (r.responseId) setResponseId(r.responseId); setSave({ state: "saved", at: r.savedAt }); }
      else setSave({ state: "error", msg: r.error });
    } catch { setSave({ state: "error", msg: "Sin conexión. Reintentaremos al siguiente cambio." }); }
    saving.current = false;
    if (pending.current) { const p = pending.current; pending.current = null; flush(p); }
  }
  function schedule(next: Answers, delay = 1200) {
    if (preview) return;
    setSave((s) => ({ ...s, state: "dirty" }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), delay);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (save.state === "dirty" || save.state === "saving") { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save.state]);

  /* ---------- cambios y validación en tiempo real ---------- */
  function setValue(q: Question, v: any, validateNow = false) {
    const next = { ...answers, [q.id]: v, _step: cur };
    setAnswers(next);
    if (touched[q.id] || validateNow || errors[q.id]) {
      const e = validateAnswer(q, v);
      setErrors((x) => { const y = { ...x }; if (e) y[q.id] = e; else delete y[q.id]; return y; });
    }
    schedule(next);
  }
  function blur(q: Question) {
    setTouched((t) => ({ ...t, [q.id]: true }));
    const e = validateAnswer(q, answers[q.id]);
    setErrors((x) => { const y = { ...x }; if (e) y[q.id] = e; else delete y[q.id]; return y; });
  }
  const focusFirst = (errs: Record<string, string>) => setTimeout(() => {
    const id = Object.keys(errs)[0];
    const el = id && (document.getElementById(`q-${id}`) as HTMLElement | null);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    (el?.querySelector("input,select,textarea,button") as HTMLElement | null)?.focus();
  }, 50);

  function go(to: number) {
    const n = Math.max(0, Math.min(sections.length - 1, to));
    setStep(n);
    const next = { ...answers, _step: n };
    setAnswers(next);
    if (!preview) { clearTimeout(timer.current); flush(next); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function nextStep() {
    const errs = validateAll(schema, answers, sec.id);
    setTouched((t) => ({ ...t, ...Object.fromEntries(sec.questions.map((q) => [q.id, true])) }));
    setErrors(errs);
    if (Object.keys(errs).length) { setBanner("Completa los campos marcados para continuar."); focusFirst(errs); return; }
    setBanner("");
    go(cur + 1);
  }

  async function submit() {
    const errs = validateAll(schema, answers);
    setErrors(errs);
    setTouched(Object.fromEntries(schema.sections.flatMap((s) => s.questions).map((q) => [q.id, true])));
    if (Object.keys(errs).length) {
      const idx = sections.findIndex((s) => s.questions.some((q) => errs[q.id]));
      if (idx >= 0 && idx !== cur) setStep(idx);
      setBanner(`Hay ${Object.keys(errs).length} campo(s) por corregir.`);
      focusFirst(errs);
      return;
    }
    if (preview) { setBanner(""); alert("Vista previa: el formulario es válido. (En la vista previa no se envían respuestas.)"); return; }
    if (anonymous && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setBanner("Escribe tu correo de contacto."); return; }
    setSubmitting(true); setBanner("");
    clearTimeout(timer.current);
    try {
      const r = await props.submitAction!({ formId, responseId: ridRef.current, diagnosticId: props.diagnosticId, answers, email });
      if (r.ok) {
        try { localStorage.removeItem(storageKey); } catch {}
        setSave({ state: "idle" });
        window.location.href = r.redirect || "/mis-formularios";
        return;
      }
      if (r.errors && Object.keys(r.errors).length) {
        setErrors(r.errors);
        const idx = sections.findIndex((s) => s.questions.some((q) => r.errors![q.id]));
        if (idx >= 0) setStep(idx);
        focusFirst(r.errors);
      }
      setBanner(r.error || "No se pudo enviar.");
    } catch { setBanner("No se pudo enviar. Revisa tu conexión e intenta de nuevo."); }
    setSubmitting(false);
  }

  if (!sections.length) return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Este formulario todavía no tiene preguntas.</p>;
  const last = cur === sections.length - 1;
  const pct = visibleCount ? Math.round((answered / visibleCount) * 100) : 0;

  return (
    <div>
      {props.notice && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{props.notice}</div>}
      {restored && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Recuperamos tu borrador guardado en este navegador.</div>}
      {/* progreso */}
      <div className="mb-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{sections.length > 1 ? <>Sección <b className="text-slate-700">{cur + 1}</b> de {sections.length}</> : "Formulario"} · {answered} de {visibleCount} respondidas</span>
          {!preview && <SaveState s={save} />}
        </div>
        <div className="h-1.5 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
          <div className="h-1.5 rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        {sections.length > 1 && (
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Secciones">
            {sections.map((s, i) => {
              const bad = s.questions.some((q) => errors[q.id]);
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => (i < cur ? go(i) : i > cur ? (Object.keys(validateAll(schema, answers, sec.id)).length ? nextStep() : go(i)) : null)}
                    aria-current={i === cur ? "step" : undefined}
                    className={`rounded-full border px-2.5 py-1 text-xs ${i === cur ? "border-brand bg-brand text-white" : bad ? "border-red-300 bg-red-50 text-red-700" : i < cur ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                    {i + 1}. {s.title}
                  </button>
                </li>);
            })}
          </ol>)}
      </div>

      <section aria-labelledby={`sec-${sec.id}`}>
        <h2 id={`sec-${sec.id}`} className="text-lg font-semibold text-ink">{sec.title}</h2>
        {sec.description && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-500">{sec.description}</p>}
        <div className="mt-4 space-y-5">
          {sec.questions.filter((q) => vis.q[q.id]).map((q) => (
            <QuestionField key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} preview={preview}
              onChange={(v, now) => setValue(q, v, now)} onBlur={() => blur(q)}
              upload={async (file) => {
                if (preview) return { ok: true, docId: 1, name: file.name };
                const fd = new FormData();
                fd.set("file", file); fd.set("formId", String(formId)); fd.set("email", email);
                if (props.diagnosticId) fd.set("diagnosticId", String(props.diagnosticId));
                if (ridRef.current) fd.set("responseId", String(ridRef.current));
                return props.uploadAction ? props.uploadAction(fd) : { ok: false, error: "Carga no disponible" };
              }} />))}
        </div>
      </section>

      {anonymous && last && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-medium text-slate-800" htmlFor="frm-email">Correo de contacto <span className="text-red-600">*</span></label>
          <p className="text-xs text-slate-500">Te enviaremos la confirmación y el número de radicado.</p>
          <input id="frm-email" type="email" className="input mt-1" value={email} onChange={(e) => { setEmail(e.target.value); schedule(answers); }} autoComplete="email" />
        </div>)}

      {banner && <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{banner}</div>}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {cur > 0 && <button type="button" className="btn-ghost" onClick={() => go(cur - 1)}><ChevronLeft className="h-4 w-4" />Anterior</button>}
        {!preview && !anonymous && props.saveAction && (
          <button type="button" className="btn-ghost" onClick={() => { clearTimeout(timer.current); flush({ ...answers, _step: cur }); }}>
            <Save className="h-4 w-4" />Guardar y continuar después
          </button>)}
        <div className="flex-1" />
        {!last ? <button type="button" className="btn" onClick={nextStep}>Siguiente<ChevronRight className="h-4 w-4" /></button>
          : <button type="button" className="btn" disabled={submitting} onClick={submit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{props.submitLabel || "Enviar"}
            </button>}
      </div>
      {!preview && <p className="mt-2 text-right text-[11px] text-slate-400">{total} preguntas · los campos con <span className="text-red-600">*</span> son obligatorios</p>}
    </div>
  );
}

function SaveState({ s }: { s: { state: string; at?: string; msg?: string } }) {
  const t = s.at ? new Date(s.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "";
  if (s.state === "saving") return <span className="flex items-center gap-1" aria-live="polite"><Loader2 className="h-3 w-3 animate-spin" />Guardando…</span>;
  if (s.state === "dirty") return <span aria-live="polite">Cambios sin guardar…</span>;
  if (s.state === "saved") return <span className="flex items-center gap-1 text-emerald-700" aria-live="polite"><CheckCircle2 className="h-3 w-3" />Borrador guardado {t}</span>;
  if (s.state === "local") return <span className="flex items-center gap-1 text-emerald-700" aria-live="polite"><CheckCircle2 className="h-3 w-3" />Guardado en este navegador {t}</span>;
  if (s.state === "error") return <span className="flex items-center gap-1 text-red-700" aria-live="polite"><CloudOff className="h-3 w-3" />{s.msg || "No se pudo guardar"}</span>;
  return <span>El borrador se guarda automáticamente</span>;
}

/* ===================== Campo por tipo ===================== */
export function QuestionField({ q, value, error, onChange, onBlur, upload, preview }: {
  q: Question; value: any; error?: string; preview?: boolean;
  onChange: (v: any, validateNow?: boolean) => void; onBlur: () => void;
  upload: (f: File) => Promise<{ ok: boolean; docId?: number; name?: string; error?: string }>;
}) {
  const id = `in-${q.id}`, hid = `h-${q.id}`, eid = `e-${q.id}`;
  const desc = [q.help ? hid : "", error ? eid : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": !!error || undefined, "aria-describedby": desc, onBlur };
  const cls = `input ${error ? "!border-red-400 focus:!ring-red-200" : ""}`;
  const group = q.type === "single" || q.type === "multi" || q.type === "scale" || q.type === "nit" || q.type === "location";
  const Label = group ? "legend" : "label";
  const body = (() => {
    switch (q.type) {
      case "text":
        return <input {...common} className={cls} type={q.format === "email" ? "email" : q.format === "phone" ? "tel" : "text"} inputMode={q.format === "phone" ? "tel" : undefined}
          value={value ?? ""} placeholder={q.placeholder} maxLength={q.max ? Number(q.max) : 500} onChange={(e) => onChange(e.target.value)} />;
      case "paragraph":
        return <textarea {...common} className={cls} rows={4} value={value ?? ""} placeholder={q.placeholder} maxLength={q.max ? Number(q.max) : 5000} onChange={(e) => onChange(e.target.value)} />;
      case "number":
        return <input {...common} className={`${cls} sm:max-w-xs`} type="number" inputMode="decimal" step="any" value={value ?? ""} min={q.min ?? undefined} max={q.max ?? undefined}
          placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
      case "date":
        return <input {...common} className={`${cls} sm:max-w-xs`} type="date" value={value ?? ""} min={q.min ? String(q.min) : undefined} max={q.max ? String(q.max) : undefined} onChange={(e) => onChange(e.target.value, true)} />;
      case "single":
        return (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {q.options?.map((o) => (
              <label key={o.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${value === o.value ? "border-brand bg-brand/5" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name={id} className="mt-0.5" checked={value === o.value} onChange={() => onChange(o.value, true)} onBlur={onBlur} aria-describedby={desc} />{o.label}
              </label>))}
            {!q.required && value && <button type="button" className="justify-self-start text-xs text-slate-500 underline" onClick={() => onChange("", true)}>Quitar selección</button>}
          </div>);
      case "multi": {
        const arr: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {q.options?.map((o) => (
              <label key={o.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${arr.includes(o.value) ? "border-brand bg-brand/5" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" className="mt-0.5" checked={arr.includes(o.value)} onBlur={onBlur} aria-describedby={desc}
                  onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value), true)} />{o.label}
              </label>))}
          </div>);
      }
      case "scale": {
        const top = q.scaleMax || 5;
        return (
          <div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {Array.from({ length: top }, (_, i) => i + 1).map((n) => (
                <label key={n} className={`grid h-10 min-w-10 cursor-pointer place-items-center rounded-lg border text-sm font-medium focus-within:ring-2 focus-within:ring-brand/30 ${Number(value) === n ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                  <input type="radio" name={id} className="sr-only" checked={Number(value) === n} onChange={() => onChange(n, true)} onBlur={onBlur} aria-label={String(n)} />{n}
                </label>))}
            </div>
            {(q.scaleMinLabel || q.scaleMaxLabel) && <div className="mt-1 flex max-w-md justify-between text-xs text-slate-400"><span>1 = {q.scaleMinLabel}</span><span>{top} = {q.scaleMaxLabel}</span></div>}
          </div>);
      }
      case "nit": {
        const { nit, dv } = splitNit(value);
        const ok = /^\d{6,15}$/.test(nit) && /^\d$/.test(dv) && nitDv(nit) === dv;
        const set = (n: string, d: string) => onChange(n || d ? `${n}-${d}` : "", !!(n && d));
        return (
          <div className="flex flex-wrap items-center gap-2">
            <input {...common} className={`${cls} !w-48`} inputMode="numeric" placeholder="900111222" aria-label="NIT sin dígito de verificación" value={nit} maxLength={15}
              onChange={(e) => set(e.target.value.replace(/\D/g, ""), dv)} />
            <span className="text-slate-400">–</span>
            <input className={`${cls} !w-16 text-center`} inputMode="numeric" placeholder="DV" aria-label="Dígito de verificación" value={dv} maxLength={1} onBlur={onBlur}
              aria-invalid={!!error || undefined} aria-describedby={desc} onChange={(e) => set(nit, e.target.value.replace(/\D/g, ""))} />
            {ok && <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />NIT válido</span>}
          </div>);
      }
      case "location": {
        const v = value || {};
        const d = departamento(v.dep);
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            <select className={cls} aria-label="Departamento" value={v.dep || ""} onBlur={onBlur} aria-describedby={desc} aria-invalid={!!error || undefined}
              onChange={(e) => { const dep = DIVIPOLA.find((x) => x.code === e.target.value); onChange({ dep: e.target.value, mun: dep?.municipios.length === 1 ? dep.municipios[0].code : "" }, false); }}>
              <option value="">Departamento…</option>
              {DEPS.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            <select className={cls} aria-label="Municipio" value={v.mun || ""} disabled={!d} onBlur={onBlur} aria-describedby={desc} aria-invalid={!!error || undefined}
              onChange={(e) => onChange({ dep: v.dep, mun: e.target.value }, true)}>
              <option value="">{d ? "Municipio…" : "Elige primero el departamento"}</option>
              {d?.municipios.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
            </select>
          </div>);
      }
      case "file":
        return <FileField value={value} onChange={onChange} upload={upload} preview={preview} describedBy={desc} id={id} />;
    }
  })();
  return (
    <fieldset id={`q-${q.id}`} className="scroll-mt-24">
      <Label {...(group ? {} : { htmlFor: id })} className="mb-1 block text-sm font-medium text-slate-800">
        {q.label || <i className="text-slate-400">Pregunta sin enunciado</i>}{q.required && <span className="ml-0.5 text-red-600" aria-label="obligatoria">*</span>}
      </Label>
      {q.help && <p id={hid} className="mb-1.5 text-xs text-slate-500">{q.help}</p>}
      {body}
      {error && <p id={eid} className="mt-1 text-xs font-medium text-red-700" role="alert">{error}</p>}
    </fieldset>
  );
}

function FileField({ value, onChange, upload, preview, describedBy, id }: {
  value: any; id: string; describedBy?: string; preview?: boolean; onChange: (v: any, now?: boolean) => void;
  upload: (f: File) => Promise<{ ok: boolean; docId?: number; name?: string; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (value?.docId) return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <Paperclip className="h-4 w-4 text-slate-500" />
      {preview || value.docId < 0 ? <span>{value.name}</span> : <a className="text-brand underline" href={`/api/docs/${value.docId}`} target="_blank" rel="noreferrer">{value.name}</a>}
      <button type="button" className="ml-auto flex items-center gap-1 text-xs text-red-600" onClick={() => onChange(null, true)}><X className="h-3.5 w-3.5" />Quitar</button>
    </div>);
  return (
    <div>
      <input id={id} type="file" aria-describedby={describedBy} disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.jpg,.jpeg,.png"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setErr("");
          if (f.size > 20 * 1024 * 1024) { setErr("El archivo supera 20 MB"); return; }
          setBusy(true);
          const r = await upload(f).catch(() => ({ ok: false, error: "No se pudo cargar el archivo" } as any));
          setBusy(false);
          if (r.ok) onChange({ docId: r.docId, name: r.name }, true); else setErr(r.error || "No se pudo cargar");
          e.target.value = "";
        }} />
      <p className="mt-1 text-xs text-slate-400">{busy ? "Cargando y verificando el archivo…" : "PDF, Word, Excel, PowerPoint o imagen · máx. 20 MB"}</p>
      {err && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{err}</p>}
    </div>
  );
}
