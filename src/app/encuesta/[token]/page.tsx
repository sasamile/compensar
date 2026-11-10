import type { Metadata } from "next";
import { get, setting } from "@/lib/db";
import { ASPECTS } from "@/lib/surveys";
import { answerSurvey } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Encuesta de satisfacción", robots: { index: false } };

function Scale({ name, from, to, low, high, required }: { name: string; from: number; to: number; low: string; high: string; required?: boolean }) {
  const opts = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div>
      <div className={`grid gap-1.5 ${to - from > 5 ? "grid-cols-6 sm:grid-cols-11" : "grid-cols-5"}`}>
        {opts.map((n) => (
          <label key={n} className="relative">
            <input type="radio" name={name} value={n} required={required} className="peer sr-only" />
            <span className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-brand peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand/30">{n}</span>
          </label>))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

export default async function EncuestaPublica({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<any> }) {
  const { token } = await params;
  const sp = await searchParams;
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff");
  const s = get<any>(`SELECT s.*, sv.name service, al.name aliado, ev.title event, c.razon_social FROM surveys s LEFT JOIN servicios sv ON sv.id=s.servicio_id
    LEFT JOIN aliados al ON al.id=COALESCE(s.aliado_id, sv.aliado_id) LEFT JOIN events ev ON ev.id=s.event_id LEFT JOIN companies c ON c.id=s.company_id WHERE s.token=?`, token);
  const subject = s ? (s.event || s.service || "el acompañamiento empresarial") : "";
  const who = s?.kind === "evento" ? "Facilitador / conferencista" : "Mentor / consultor";
  const done = s && s.status !== "enviada";
  return (
    <div className="min-h-screen bg-slate-50" style={{ ["--color-brand" as any]: color }}>
      <header className="px-4 py-4 text-white" style={{ background: color }}>
        <div className="mx-auto flex max-w-xl items-center justify-between"><b>{brand}</b><span className="text-sm opacity-80">Encuesta de satisfacción</span></div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">
        {!s ? (
          <div className="card text-center"><h1 className="text-lg font-semibold text-ink">Encuesta no encontrada</h1><p className="mt-1 text-sm text-slate-500">El enlace no es válido. Revisa el mensaje que recibiste.</p></div>
        ) : sp.ok || done ? (
          <div className="card text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-2xl text-emerald-600" aria-hidden>✓</div>
            <h1 className="text-lg font-semibold text-ink">¡Gracias por tu respuesta!</h1>
            <p className="mt-1 text-sm text-slate-500">{sp.ok ? "Tu opinión nos ayuda a mejorar los servicios de fomento empresarial." : "Esta encuesta ya fue respondida; solo se puede responder una vez."}</p>
          </div>
        ) : (
          <form action={answerSurvey} className="space-y-5">
            <input type="hidden" name="token" value={token} />
            <div>
              <h1 className="text-xl font-semibold text-ink">¿Cómo te fue con {subject}?</h1>
              <p className="mt-1 text-sm text-slate-500">{s.razon_social ? `${s.razon_social} · ` : ""}{s.aliado ? `Prestado por ${s.aliado} · ` : ""}Toma menos de 2 minutos.</p>
            </div>
            {sp.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</div>}
            <fieldset className="card"><legend className="sr-only">Recomendación</legend>
              <p className="mb-3 text-sm font-medium text-ink">1. ¿Qué tan probable es que recomiendes este servicio a otro empresario? *</p>
              <Scale name="nps" from={0} to={10} low="Nada probable" high="Muy probable" required />
            </fieldset>
            <fieldset className="card"><legend className="sr-only">Satisfacción general</legend>
              <p className="mb-3 text-sm font-medium text-ink">2. ¿Qué tan satisfecho/a estás en general? *</p>
              <Scale name="satisfaction" from={1} to={5} low="Muy insatisfecho" high="Muy satisfecho" required />
            </fieldset>
            <fieldset className="card space-y-4"><legend className="sr-only">Calificación por aspecto</legend>
              <p className="text-sm font-medium text-ink">3. Califica cada aspecto (1 = muy malo, 5 = excelente)</p>
              {ASPECTS.map(([k, l]) => (
                <div key={k}><p className="mb-1.5 text-sm text-slate-600">{k === "mentor" ? who : l}</p><Scale name={`a_${k}`} from={1} to={5} low="Muy malo" high="Excelente" /></div>))}
            </fieldset>
            <div className="card">
              <label htmlFor="comment" className="mb-2 block text-sm font-medium text-ink">4. ¿Qué fue lo más útil y qué deberíamos mejorar?</label>
              <textarea id="comment" name="comment" rows={4} maxLength={2000} className="input" placeholder="Escribe tu comentario (opcional)" />
            </div>
            <button className="btn w-full py-3 text-base">Enviar respuesta</button>
            <p className="text-center text-xs text-slate-400">Tus respuestas se usan solo para mejorar los servicios, conforme a la política de tratamiento de datos de {brand}.</p>
          </form>)}
      </main>
    </div>
  );
}

