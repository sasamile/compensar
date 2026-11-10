import type { Global } from "@/lib/datasets";

type Opt = { id: number; name: string };
/**
 * Barra de filtros de consulta (FUN-98): programa, convocatoria/evento, mentor/asesor, aliado y periodo.
 * Las opciones ya vienen acotadas al alcance del rol (filterOptions).
 */
export function FilterBar({ opts, g, action, hidden = {}, children }:
  { opts: { programs: Opt[]; aliados: Opt[]; mentors: Opt[]; events: Opt[]; lock?: number[] | null }; g: Global; action: string; hidden?: Record<string, string | string[] | undefined>; children?: React.ReactNode }) {
  const sel = (name: string, label: string, list: Opt[], value?: number | null, all = "Todos") => (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value ? String(value) : ""} className="input">
        <option value="">{all}</option>
        {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
  return (
    <form action={action} className="card mb-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 print:hidden" aria-label="Filtros de consulta">
      {Object.entries(hidden).flatMap(([k, v]) => (Array.isArray(v) ? v : v ? [v] : []).map((x, i) => <input key={k + i} type="hidden" name={k} value={x} />))}
      {sel("programa", "Programa", opts.programs, g.program)}
      {sel("evento", "Convocatoria / evento", opts.events, g.event, "Todas")}
      {sel("mentor", "Mentor / asesor", opts.mentors, g.mentor)}
      {sel("aliado", "Aliado", opts.aliados, g.aliado)}
      <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={g.from || ""} className="input" /></label>
      <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={g.to || ""} className="input" /></label>
      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-1">
        <button className="btn flex-1">Consultar</button>
        <a href={action + (Object.keys(hidden).length ? "?" + new URLSearchParams(Object.entries(hidden).flatMap(([k, v]) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => [k, x]))).toString() : "")} className="btn-ghost" title="Quitar filtros">Limpiar</a>
      </div>
      {children}
      {opts.lock && <p className="text-xs text-slate-500 sm:col-span-2 md:col-span-3 xl:col-span-4">Tu información está acotada a tu organización aliada (seguridad a nivel de fila).</p>}
    </form>
  );
}

export function activeFilters(g: Global, opts: { programs: Opt[]; aliados: Opt[]; mentors: Opt[]; events: Opt[] }) {
  const n = (l: Opt[], id?: number | null) => l.find((x) => x.id === id)?.name ?? `#${id}`;
  const out: string[] = [];
  if (g.program) out.push(`Programa: ${n(opts.programs, g.program)}`);
  if (g.event) out.push(`Evento: ${n(opts.events, g.event)}`);
  if (g.mentor) out.push(`Mentor: ${n(opts.mentors, g.mentor)}`);
  if (g.aliado) out.push(`Aliado: ${n(opts.aliados, g.aliado)}`);
  if (g.from || g.to) out.push(`Periodo: ${g.from || "…"} a ${g.to || "…"}`);
  return out;
}
