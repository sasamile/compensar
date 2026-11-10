"use client";
/** Editor de reglas de clasificación del diagnóstico (RF-DIA-06): niveles por rango, recomendaciones y segmentos. */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LEVEL_COLORS, validateScoring, type Level, type Scoring, type Segment } from "@/lib/forms";

export default function FormScoring({ formId, initial, sections, action, disabled }: {
  formId: number; initial: Scoring; sections: { id: string; title: string }[]; action: (fd: FormData) => void; disabled?: boolean;
}) {
  const [levels, setLevels] = useState<Level[]>(initial.levels.length ? initial.levels : [
    { name: "Inicial", min: 0, max: 40, color: LEVEL_COLORS[0], recommendations: "" },
    { name: "En desarrollo", min: 40, max: 70, color: LEVEL_COLORS[1], recommendations: "" },
    { name: "Consolidado", min: 70, max: 100, color: LEVEL_COLORS[2], recommendations: "" },
  ]);
  const [segments, setSegments] = useState<Segment[]>(initial.segments || []);
  const [def, setDef] = useState(initial.defaultSegment || "");
  const [review, setReview] = useState(initial.review !== false);
  const scoring: Scoring = { levels, segments, defaultSegment: def, review };
  const problems = validateScoring(scoring);
  const updL = (i: number, p: Partial<Level>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const updG = (i: number, p: Partial<Segment>) => setSegments((gs) => gs.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={formId} />
      <input type="hidden" name="recalc" defaultValue="0" />
      <input type="hidden" name="scoring" value={JSON.stringify(scoring)} />
      <fieldset disabled={disabled} className="space-y-6">
        <div className="card">
          <h2 className="font-semibold text-ink">Niveles de madurez</h2>
          <p className="mb-3 text-sm text-slate-500">El puntaje total (0–100) se ubica en un rango «desde» (incluido) – «hasta» (excluido; el último incluye 100). Cada nivel tiene sus recomendaciones, una por línea.</p>
          <div className="space-y-3">
            {levels.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_90px_90px_60px_auto]">
                <div><label className="label" htmlFor={`ln${i}`}>Nombre del nivel</label><input id={`ln${i}`} className="input" value={l.name} onChange={(e) => updL(i, { name: e.target.value })} /></div>
                <div><label className="label" htmlFor={`lmin${i}`}>Desde</label><input id={`lmin${i}`} type="number" min={0} max={100} step="any" className="input" value={l.min} onChange={(e) => updL(i, { min: Number(e.target.value) })} /></div>
                <div><label className="label" htmlFor={`lmax${i}`}>Hasta</label><input id={`lmax${i}`} type="number" min={0} max={100} step="any" className="input" value={l.max} onChange={(e) => updL(i, { max: Number(e.target.value) })} /></div>
                <div><label className="label" htmlFor={`lc${i}`}>Color</label><input id={`lc${i}`} type="color" className="h-9 w-full cursor-pointer rounded border border-slate-300" value={l.color || "#64748b"} onChange={(e) => updL(i, { color: e.target.value })} /></div>
                <div className="flex items-end"><button type="button" aria-label="Eliminar nivel" className="btn-ghost btn-sm !text-red-600" onClick={() => setLevels(levels.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></div>
                <div className="md:col-span-5"><label className="label" htmlFor={`lr${i}`}>Recomendaciones (una por línea)</label>
                  <textarea id={`lr${i}`} rows={3} className="input" value={l.recommendations || ""} onChange={(e) => updL(i, { recommendations: e.target.value })} /></div>
              </div>))}
          </div>
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setLevels([...levels, { name: "", min: levels.at(-1)?.max ?? 0, max: 100, color: LEVEL_COLORS[levels.length % LEVEL_COLORS.length] }])}><Plus className="h-4 w-4" />Agregar nivel</button>
        </div>

        <div className="card">
          <h2 className="font-semibold text-ink">Segmentos</h2>
          <p className="mb-3 text-sm text-slate-500">Se asigna el primer segmento cuya regla se cumpla (en orden). Si ninguna se cumple, se usa el segmento por defecto.</p>
          {segments.length === 0 && <p className="mb-2 text-sm text-slate-400">Sin reglas de segmento.</p>}
          <div className="space-y-2">
            {segments.map((s, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                <div className="min-w-40 flex-1"><label className="label" htmlFor={`sn${i}`}>Segmento</label><input id={`sn${i}`} className="input" value={s.name} onChange={(e) => updG(i, { name: e.target.value })} /></div>
                <div><label className="label" htmlFor={`st${i}`}>Si el puntaje de</label>
                  <select id={`st${i}`} className="input" value={s.target} onChange={(e) => updG(i, { target: e.target.value })}>
                    <option value="total">Total</option>{sections.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                  </select></div>
                <div><label className="label" htmlFor={`so${i}`}>es</label>
                  <select id={`so${i}`} className="input" value={s.op} onChange={(e) => updG(i, { op: e.target.value as any })}><option value="gte">mayor o igual a</option><option value="lt">menor que</option></select></div>
                <div><label className="label" htmlFor={`sv${i}`}>Valor</label><input id={`sv${i}`} type="number" className="input !w-24" value={s.value} onChange={(e) => updG(i, { value: Number(e.target.value) })} /></div>
                <button type="button" aria-label="Eliminar segmento" className="btn-ghost btn-sm !text-red-600" onClick={() => setSegments(segments.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSegments([...segments, { name: "", target: "total", op: "lt", value: 40 }])}><Plus className="h-4 w-4" />Agregar regla</button>
            <div><label className="label" htmlFor="defseg">Segmento por defecto</label><input id="defseg" className="input" value={def} onChange={(e) => setDef(e.target.value)} placeholder="Ej.: General" /></div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-ink">Flujo</h2>
          <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={review} onChange={(e) => setReview(e.target.checked)} />
            <span>El mentor o gestor revisa el diagnóstico antes de completarlo (al enviar queda «en revisión»). Si se desmarca, queda «completado» de inmediato. El resultado se muestra al enviar en ambos casos.</span></label>
        </div>
      </fieldset>
      {problems.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><ul className="ml-4 list-disc">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={problems.length > 0} onClick={(e) => { (e.currentTarget.form!.elements.namedItem("recalc") as HTMLInputElement).value = "0"; }}>Guardar reglas</button>
          <button className="btn-ghost" disabled={problems.length > 0} onClick={(e) => { (e.currentTarget.form!.elements.namedItem("recalc") as HTMLInputElement).value = "1"; }}>Guardar y recalcular diagnósticos enviados</button>
        </div>)}
    </form>
  );
}
