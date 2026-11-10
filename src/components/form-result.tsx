/** Resultado de un diagnóstico (RF-DIA-07): puntaje, nivel, segmento, gráfico por dimensión, hallazgos y recomendaciones. Apto para imprimir. */
import { HBarChart, Radar } from "@/components/charts";
import type { Level, Result } from "@/lib/forms";

export default function FormResult({ result, levels }: { result: Result; levels?: Level[] }) {
  const color = result.color || "#0a6cff";
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
        <div className="card break-inside-avoid text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Puntaje total</div>
          <div className="mt-1 text-4xl font-bold" style={{ color }}>{result.total}<span className="text-lg text-slate-400">/100</span></div>
          <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, result.total)}%`, background: color }} /></div>
        </div>
        <div className="card break-inside-avoid text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Nivel de madurez</div>
          <div className="mt-2 inline-block max-w-full break-words rounded-full px-3 py-1 text-base font-semibold leading-snug text-white" style={{ background: color }}>{result.level}</div>
          {levels && levels.length > 0 && (
            <div className="mt-3 flex overflow-hidden rounded text-[10px] text-white">
              {[...levels].sort((a, b) => a.min - b.min).map((l) => (
                <div key={l.name} className={`truncate px-1 py-0.5 ${l.name === result.level ? "font-bold" : "opacity-50"}`} style={{ width: `${l.max - l.min}%`, background: l.color || "#64748b" }} title={`${l.min}–${l.max}`}>{l.name}</div>))}
            </div>)}
        </div>
        <div className="card break-inside-avoid text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Segmento</div>
          <div className="mt-2 text-lg font-semibold text-ink">{result.segment || "—"}</div>
          <div className="mt-1 text-xs text-slate-400">{result.sections.length} dimensiones evaluadas</div>
        </div>
      </div>
      {result.sections.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2 print:grid-cols-2">
          <div className="card grid break-inside-avoid place-items-center px-10 [&_svg]:h-auto [&_svg]:max-w-full [&_svg]:overflow-visible">
            <h3 className="mb-2 self-start text-sm font-semibold text-ink">Resultado por dimensión</h3>
            <Radar data={result.sections.map((s) => ({ label: s.name, value: s.score }))} max={100} size={300} />
          </div>
          <div className="card break-inside-avoid">
            <h3 className="mb-3 text-sm font-semibold text-ink">Puntaje por dimensión (0–100)</h3>
            <HBarChart data={result.sections.map((s) => ({ label: `${s.name}${s.level ? " · " + s.level : ""}`, value: s.score, color: levels?.find((l) => l.name === s.level)?.color }))} max={100} />
            <table className="mt-4 w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="py-1">Dimensión</th><th>Puntos</th><th>Peso</th><th className="text-right">%</th></tr></thead>
              <tbody>{result.sections.map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="py-1">{s.name}</td><td>{s.raw} / {s.rawMax}</td><td>{s.weight}</td><td className="text-right font-medium">{s.score}</td></tr>)}</tbody>
            </table>
          </div>
        </div>)}
      <div className="grid gap-4 xl:grid-cols-2 print:grid-cols-2">
        <div className="card break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold text-ink">Hallazgos</h3>
          {result.findings.length ? <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700">{result.findings.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="text-sm text-slate-400">Sin hallazgos.</p>}
        </div>
        <div className="card break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold text-ink">Recomendaciones</h3>
          {result.recommendations.length ? <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-700">{result.recommendations.map((f, i) => <li key={i}>{f}</li>)}</ol> : <p className="text-sm text-slate-400">No hay recomendaciones configuradas para este nivel.</p>}
        </div>
      </div>
    </div>
  );
}
