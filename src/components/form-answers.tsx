/** Respuestas de un formulario en modo lectura, agrupadas por sección y con la versión con la que se respondieron. */
import { answerText, isEmpty, visibility, type Answers, type Schema } from "@/lib/forms";

export default function FormAnswers({ schema, answers, showEmpty = false, fileBase }: { schema: Schema; answers: Answers; showEmpty?: boolean; fileBase?: string }) {
  /** fileBase: ruta de descarga protegida por permisos del formulario, p. ej. /api/formularios/3/archivo?r=10 */
  const href = (doc: number) => (fileBase ? `${fileBase}&doc=${doc}` : `/api/docs/${doc}`);
  const vis = visibility(schema, answers);
  return (
    <div className="space-y-5">
      {schema.sections.filter((s) => vis.s[s.id]).map((s) => {
        const qs = s.questions.filter((q) => vis.q[q.id] && (showEmpty || !isEmpty(answers[q.id])));
        if (!qs.length) return null;
        return (
          <section key={s.id} className="break-inside-avoid">
            <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{s.title}</h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {qs.map((q) => {
                const v = answers[q.id];
                return (
                  <div key={q.id} className={q.type === "paragraph" ? "sm:col-span-2" : ""}>
                    <dt className="text-xs text-slate-500">{q.label}</dt>
                    <dd className="whitespace-pre-line text-sm text-slate-800">
                      {isEmpty(v) ? <span className="text-slate-400">Sin respuesta</span>
                        : q.type === "file" ? <a className="text-brand underline" href={href(v.docId)} target="_blank" rel="noreferrer">{v.name}</a>
                        : answerText(q, v)}
                    </dd>
                  </div>);
              })}
            </dl>
          </section>);
      })}
    </div>
  );
}
