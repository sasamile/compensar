import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, MoveHorizontal, Trash2, BarChart3 as PageIcon } from "lucide-react";
import { get } from "@/lib/db";
import { can, requirePerm, requireUser } from "@/lib/auth";
import { AGGS, OPS, dataset, datasetsFor, globalFromParams, globalToParams, specToParams, visibleCols } from "@/lib/datasets";
import { WIDGET_TYPES, filterOptions, widgetData, widgetSpec, type Widget } from "@/lib/analytics";
import { fmtDate, jparse } from "@/lib/util";
import { Badge, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import PrintButton from "@/components/print-button";
import AutoRefresh from "@/components/ana-autorefresh";
import { FilterBar } from "@/components/ana-filters";
import { WidgetView } from "@/components/ana-widget";
import * as A from "../actions";

export const dynamic = "force-dynamic";
const SPAN = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3" } as const;

export default async function Tablero({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const sp = await searchParams;
  const d = get<any>("SELECT d.*, u.name owner FROM dashboards d LEFT JOIN users u ON u.id=d.user_id WHERE d.id=?", Number((await params).id));
  if (!d || (d.user_id !== u.id && !d.shared && !can(u, "config.manage"))) redirect("/sin-acceso");
  const owner = d.user_id === u.id || can(u, "config.manage");
  const edit = owner && can(u, "dashboards.manage") && sp.editar === "1";
  const g = globalFromParams(sp);
  const gq = globalToParams(g);
  const opts = filterOptions(u);
  const ws = jparse<Widget[]>(d.widgets, []);
  const t0 = Date.now();
  const results = ws.map((w) => ({ w, r: widgetData(u, w, g) }));
  const ms = Date.now() - t0;
  const src = edit && sp.fuente ? dataset(sp.fuente) : null;
  const srcOk = !!src && src.allow(u);
  const cols = srcOk ? visibleCols(src!) : [];
  const base = `/analitica/tableros/${d.id}`;
  return (
    <>
      <PageHeader icon={PageIcon} title={d.name} subtitle={`${d.owner ? `De ${d.owner} · ` : ""}actualizado ${fmtDate(d.updated_at)} · ${ws.length} widget(s) · consulta en ${ms} ms`}
        actions={<>
          {d.shared ? <Badge tone="blue">compartido</Badge> : <Badge tone="slate">privado</Badge>}
          <AutoRefresh seconds={30} />
          <PrintButton />
          {owner && can(u, "dashboards.manage") && (edit ? <Link href={`${base}?${new URLSearchParams(gq).toString()}`} className="btn btn-sm">Terminar edición</Link> : <Link href={`${base}?editar=1`} className="btn-ghost btn-sm">Editar tablero</Link>)}
          <Link href="/analitica/tableros" className="btn-ghost btn-sm">← Tableros</Link>
        </>} />
      <Flash sp={sp} />
      <FilterBar opts={opts} g={g} action={base} hidden={edit ? { editar: "1" } : {}} />

      {ws.length === 0 && <EmptyState title="Este tablero no tiene widgets">{edit ? "Agrégale el primero con el panel de abajo." : "El dueño aún no lo ha configurado."}</EmptyState>}
      <div className="grid gap-5 lg:grid-cols-3">
        {results.map(({ w, r }, i) => (
          <section key={w.id} id={`w-${w.id}`} className={`card min-w-0 break-inside-avoid ${SPAN[(w.span || 1) as 1 | 2 | 3]}`} aria-label={w.title}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div><h2 className="font-semibold text-ink">{w.title}</h2><p className="text-[11px] text-slate-400">{dataset(w.source)?.name || w.source}{w.filters?.length ? ` · ${w.filters.length} filtro(s)` : ""}</p></div>
              <Link href={`/analitica/consultas?${specToParams(widgetSpec(w, g)).toString()}`} className="shrink-0 text-xs text-brand hover:underline print:hidden">Datos ↗</Link>
            </div>
            <WidgetView type={w.type} r={r} />
            {r.notes.length > 0 && <p className="mt-2 text-[11px] text-amber-700">{r.notes.join(" ")}</p>}
            {edit && (
              <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 print:hidden">
                {([["up", <ArrowUp key="u" className="h-3.5 w-3.5" />, "Subir", i === 0], ["down", <ArrowDown key="d" className="h-3.5 w-3.5" />, "Bajar", i === ws.length - 1],
                  ["span", <MoveHorizontal key="s" className="h-3.5 w-3.5" />, `Ancho (${w.span || 1}/3)`, false]] as const).map(([op, icon, label, dis]) => (
                  <form key={op} action={A.widgetAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="wid" value={w.id} /><input type="hidden" name="op" value={op} />
                    <button className="btn-ghost btn-sm" disabled={dis} aria-label={`${label}: ${w.title}`} title={label}>{icon}{op === "span" ? label : ""}</button></form>))}
                <details className="text-xs"><summary className="btn-ghost btn-sm list-none">Renombrar</summary>
                  <form action={A.widgetAction} className="mt-1 flex items-center gap-1"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="wid" value={w.id} /><input type="hidden" name="op" value="rename" />
                    <input name="title" defaultValue={w.title} className="input !py-1 text-xs" aria-label="Título del widget" /><button className="btn btn-sm">OK</button></form></details>
                <form action={A.widgetAction} className="ml-auto"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="wid" value={w.id} /><input type="hidden" name="op" value="delete" />
                  <button className="btn-ghost btn-sm text-red-700" aria-label={`Quitar ${w.title}`}><Trash2 className="h-3.5 w-3.5" />Quitar</button></form>
              </div>)}
          </section>))}
      </div>

      {edit && (
        <div className="mt-8 grid gap-5 lg:grid-cols-3 print:hidden">
          <section className="card lg:col-span-2" aria-label="Agregar widget">
            <h2 className="mb-1 font-semibold text-ink">Agregar widget</h2>
            <p className="mb-3 text-xs text-slate-500">Paso 1: elige la fuente. Paso 2: el tipo de visualización, el cálculo y los filtros.</p>
            <form action={base} className="mb-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="editar" value="1" />{Object.entries(gq).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <label className="flex-1"><span className="label">Fuente de datos</span>
                <select name="fuente" defaultValue={srcOk ? src!.key : ""} className="input" required><option value="" disabled>Elige…</option>{datasetsFor(u).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
              <button className="btn-ghost">Elegir</button>
            </form>
            {srcOk && (
              <form action={A.addWidget} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="id" value={d.id} /><input type="hidden" name="source" value={src!.key} />
                <Field label="Tipo"><select name="type" className="input" defaultValue="bar">{WIDGET_TYPES.map(([k, l, h]) => <option key={k} value={k} title={h}>{l}</option>)}</select></Field>
                <Field label="Título"><input name="title" maxLength={80} className="input" placeholder={src!.name} /></Field>
                <Field label="Ancho"><select name="span" className="input" defaultValue=""><option value="">Automático</option><option value="1">1/3</option><option value="2">2/3</option><option value="3">Completo</option></select></Field>
                <Field label="Agrupar por" hint="Barras, dona y línea (línea: por mes)"><select name="groupBy" className="input" defaultValue=""><option value="">—</option>{cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
                <Field label="Cálculo"><select name="agg" className="input" defaultValue="count">{AGGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Columna a medir" hint="Para suma, promedio, etc."><select name="measure" className="input" defaultValue=""><option value="">—</option>{cols.filter((c) => c.type === "num" || c.type === "bool").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
                {[1, 2].map((i) => (
                  <div key={i} className="grid gap-2 sm:col-span-2 sm:grid-cols-3 lg:col-span-3">
                    <select name={`f${i}`} className="input" defaultValue="" aria-label={`Filtro ${i}: columna`}><option value="">Filtro {i}: columna</option>{cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                    <select name={`op${i}`} className="input" defaultValue="eq" aria-label={`Filtro ${i}: condición`}>{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <input name={`v${i}`} className="input" placeholder="Valor (Sí=1, No=0)" aria-label={`Filtro ${i}: valor`} />
                  </div>))}
                <fieldset className="sm:col-span-2 lg:col-span-3"><legend className="label">Columnas (solo tipo Tabla)</legend>
                  <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">{cols.map((c) => <label key={c.key} className="flex items-center gap-1.5"><input type="checkbox" name="columns" value={c.key} />{c.label}</label>)}</div></fieldset>
                <Field label="Máx. filas / categorías"><input type="number" name="limit" min={1} max={50} className="input" placeholder="10" /></Field>
                <div className="flex items-end"><button className="btn">Agregar al tablero</button></div>
              </form>)}
          </section>
          <section className="card space-y-4" aria-label="Configuración del tablero">
            <h2 className="font-semibold text-ink">Configuración</h2>
            <form action={A.updateDashboard} className="space-y-3">
              <input type="hidden" name="id" value={d.id} />
              <Field label="Nombre"><input name="name" defaultValue={d.name} maxLength={100} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shared" defaultChecked={!!d.shared} />Compartir con usuarios de analítica</label>
              <button className="btn w-full">Guardar tablero</button>
            </form>
            <form action={A.deleteDashboard}><input type="hidden" name="id" value={d.id} /><button className="btn-danger w-full">Eliminar tablero</button></form>
            <p className="text-xs text-slate-500">Cada cambio se guarda al instante y queda en la auditoría.</p>
          </section>
        </div>)}
      <p className="mt-6 text-xs text-slate-400">Datos en tiempo real sobre la base transaccional; se actualizan solos cada 30 s. Cada persona ve solo los datos de su alcance.</p>
    </>
  );
}
