import { BarChart3 as PageIcon } from "lucide-react";
import Link from "next/link";
import { all } from "@/lib/db";
import { can, requirePerm, requireUser } from "@/lib/auth";
import { AGGS, OPS, dataset, datasetsFor, runSpec, specFromParams, specToParams, visibleCols } from "@/lib/datasets";
import { WIDGET_TYPES, filterOptions, savedSpec } from "@/lib/analytics";
import { fmtDate } from "@/lib/util";
import { EmptyState, Flash, PageHeader, Table, Td, Notice } from "@/components/ui";
import { ExportButtons } from "@/components/ana-export";
import { WidgetView } from "@/components/ana-widget";
import * as A from "./actions";

export const dynamic = "force-dynamic";

export default async function Consultas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const sp = await searchParams;
  const sources = datasetsFor(u);
  const spec = specFromParams(sp);
  const ds = dataset(spec.source);
  const valid = !!ds && ds.allow(u);
  const opts = filterOptions(u);
  const saved = all<any>("SELECT * FROM saved_reports WHERE user_id=? ORDER BY id DESC", u.id);
  const t0 = Date.now();
  const res = valid ? runSpec(u, { ...spec, limit: spec.limit || 1000 }) : null;
  const ms = Date.now() - t0;
  const q = valid ? specToParams(spec).toString() : "";
  const cols = valid ? visibleCols(ds!) : [];
  const chosen = new Set(spec.columns || []);
  const myDash = can(u, "dashboards.manage") ? all<any>("SELECT id,name FROM dashboards WHERE user_id=? ORDER BY name", u.id) : [];
  const filters = [...(spec.filters || []), { col: "", op: "eq", value: "" }, { col: "", op: "eq", value: "" }].slice(0, Math.max(3, (spec.filters || []).length + 1));
  const g = spec.global || {};
  const sel = (name: string, label: string, list: { id: number; name: string }[], v?: number | null) => (
    <label><span className="label">{label}</span><select name={name} defaultValue={v ? String(v) : ""} className="input"><option value="">Todos</option>{list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>);

  return (
    <>
      <PageHeader icon={PageIcon} title="Constructor de consultas" subtitle="Arma tus propios reportes sin depender de TI: fuente, columnas, filtros y agrupación"
        actions={<><Link href="/analitica" className="btn-ghost btn-sm">← Analítica</Link><Link href="/analitica/tableros" className="btn-ghost btn-sm">Tableros</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-5 lg:grid-cols-4">
        <aside className="min-w-0 space-y-4 lg:col-span-1">
          <div className="card">
            <h2 className="mb-2 font-semibold text-ink">Mis consultas guardadas</h2>
            {saved.length ? (
              <ul className="space-y-3">
                {saved.map((s) => {
                  const p = specToParams(savedSpec(s)).toString();
                  return (
                    <li key={s.id} className={`rounded-lg border p-2 ${String(s.id) === sp.guardada ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                      <Link href={`/analitica/consultas?${p}&guardada=${s.id}`} className="text-sm font-medium text-brand hover:underline">{s.name}</Link>
                      <div className="text-[11px] text-slate-500">{dataset(s.source)?.name || s.source} · {fmtDate(s.created_at, false)}</div>
                      <div className="mt-1"><ExportButtons href={`/api/analitica/consulta?id=${s.id}`} compact /></div>
                      <form action={A.deleteQuery} className="mt-1"><input type="hidden" name="id" value={s.id} /><button className="text-[11px] text-red-700 hover:underline">Eliminar</button></form>
                    </li>);
                })}
              </ul>) : <p className="text-sm text-slate-500">Aún no has guardado consultas.</p>}
          </div>
          <div className="card text-xs text-slate-600">
            <h2 className="mb-1 text-sm font-semibold text-ink">¿Cómo funciona?</h2>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Elige la fuente de datos.</li><li>Marca las columnas (o agrupa para obtener totales).</li><li>Agrega filtros y el periodo.</li>
              <li>Revisa la vista previa, guárdala o expórtala en Excel, CSV, JSON o PDF.</li>
            </ol>
            <p className="mt-2">Solo verás la información de tu alcance (programa, aliado o registros asignados).</p>
          </div>
        </aside>

        <div className="min-w-0 space-y-5 lg:col-span-3">
          <form action="/analitica/consultas" className="card space-y-4" aria-label="Definición de la consulta">
            {sp.guardada && <input type="hidden" name="guardada" value={sp.guardada} />}
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-64 flex-1"><span className="label">1. Fuente de datos</span>
                <select name="fuente" defaultValue={valid ? spec.source : ""} className="input" required>
                  <option value="" disabled>Elige una fuente…</option>
                  {sources.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
                </select></label>
              <button className="btn-ghost">{valid ? "Cambiar fuente" : "Usar esta fuente"}</button>
            </div>
            {valid && <p className="-mt-2 text-xs text-slate-500">{ds!.description}</p>}
            {valid && (<>
              <fieldset>
                <legend className="label">2. Columnas (si no marcas ninguna se incluyen todas)</legend>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
                  {cols.map((c) => <label key={c.key} className="flex items-center gap-1.5"><input type="checkbox" name="col" value={c.key} defaultChecked={chosen.has(c.key)} />{c.label}</label>)}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">3. Filtros</legend>
                <div className="space-y-2">
                  {filters.map((f, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-3">
                      <select name={`f${i + 1}`} defaultValue={f.col} className="input" aria-label={`Columna del filtro ${i + 1}`}><option value="">— columna —</option>{cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                      <select name={`op${i + 1}`} defaultValue={f.op} className="input" aria-label={`Condición del filtro ${i + 1}`}>{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                      <input name={`v${i + 1}`} defaultValue={f.value} className="input" placeholder="Valor (fechas AAAA-MM-DD; Sí=1, No=0)" aria-label={`Valor del filtro ${i + 1}`} />
                    </div>))}
                </div>
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <legend className="label sm:col-span-2 xl:col-span-3">4. Programa, convocatoria, mentor, aliado y periodo</legend>
                {sel("programa", "Programa", opts.programs, g.program)}{sel("evento", "Convocatoria / evento", opts.events, g.event)}
                {sel("mentor", "Mentor / asesor", opts.mentors, g.mentor)}{sel("aliado", "Aliado", opts.aliados, g.aliado)}
                <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={g.from || ""} className="input" /></label>
                <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={g.to || ""} className="input" /></label>
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <legend className="label sm:col-span-2 xl:col-span-5">5. Agrupación y orden (opcional)</legend>
                <label><span className="label">Agrupar por</span><select name="agrupar" defaultValue={spec.groupBy || ""} className="input"><option value="">Sin agrupar (detalle)</option>{cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
                <label><span className="label">Cálculo</span><select name="agg" defaultValue={spec.agg || ""} className="input"><option value="">Conteo (por defecto)</option>{AGGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label><span className="label">Columna a medir</span><select name="medida" defaultValue={spec.measure || ""} className="input"><option value="">—</option>{cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
                <label><span className="label">Ordenar por</span><select name="orden" defaultValue={spec.order || ""} className="input"><option value="">Predeterminado</option><option value="label">Etiqueta (agrupado)</option>{cols.flatMap((c) => [<option key={c.key} value={c.key}>{c.label} ↑</option>, <option key={"-" + c.key} value={"-" + c.key}>{c.label} ↓</option>])}</select></label>
                <label><span className="label">Máx. filas</span><input type="number" name="limite" min={1} max={100000} defaultValue={spec.limit || ""} placeholder="1000" className="input" /></label>
              </fieldset>
              <div className="flex flex-wrap gap-2"><button className="btn">Ver vista previa</button><Link href={`/analitica/consultas?fuente=${spec.source}`} className="btn-ghost">Reiniciar</Link></div>
            </>)}
          </form>

          {!valid && <EmptyState title="Elige una fuente de datos para empezar">Fuentes disponibles para tu rol: {sources.map((d) => d.name).join(", ")}.</EmptyState>}

          {valid && res && (
            <section className="card" aria-label="Vista previa">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-ink">Vista previa <span className="text-sm font-normal text-slate-500">({res.rows.length} fila(s) · {ms} ms)</span></h2>
                {res.ok && <ExportButtons href={`/api/analitica/consulta?${q}`} />}
              </div>
              {res.notes.map((n) => <Notice key={n}>{n}</Notice>)}
              {!res.ok ? <Notice kind="error">{res.error}</Notice> : (<>
                {res.grouped && res.rows.length > 1 && <div className="mb-4"><WidgetView type={spec.groupBy === "mes" ? "line" : "bar"} r={{ ...res, rows: res.rows.slice(0, 24) }} /></div>}
                {res.rows.length ? (
                  <Table head={res.cols.map((c) => c.header)}>
                    {res.rows.slice(0, 200).map((r, i) => <tr key={i}>{res.cols.map((c) => <Td key={c.key} className="text-xs">{res.types[c.key] === "date" && r[c.key] ? fmtDate(r[c.key]) : String(r[c.key] ?? "")}</Td>)}</tr>)}
                  </Table>) : <EmptyState title="Sin resultados">Ajusta los filtros o el periodo.</EmptyState>}
                {res.rows.length > 200 && <p className="mt-2 text-xs text-slate-500">Se muestran 200 filas; la exportación incluye todas.</p>}
              </>)}
              {res.ok && (
                <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 print:hidden">
                  <form action={A.saveQuery} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="q" value={q} />
                    <label className="flex-1"><span className="label">Guardar como</span><input name="name" required maxLength={120} className="input" placeholder="Ej.: Empresas activas por sector" /></label>
                    <button className="btn">Guardar consulta</button>
                  </form>
                  {myDash.length > 0 && (
                    <form action={A.addToDashboard} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="q" value={q} />
                      <label><span className="label">Llevar a tablero</span><select name="dashboard_id" className="input">{myDash.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
                      <label><span className="label">Como</span><select name="type" defaultValue={spec.groupBy ? "bar" : "table"} className="input">{WIDGET_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                      <button className="btn-ghost">Agregar</button>
                    </form>)}
                </div>)}
            </section>)}
        </div>
      </div>
    </>
  );
}
