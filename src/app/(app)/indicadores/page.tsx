import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge, Target, TrendingUp, Building2, FileSpreadsheet } from "lucide-react";
import { all, get } from "@/lib/db";
import { can, companyFilter, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader, Section, Stat, Table, Tabs, Td } from "@/components/ui";
import { HBarChart, LineChart, Progress } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import {
  canViewIndicators, complianceTimeline, dailyPoints, defScope, fmtNum, groupCompliance, KINDS, PERIODICITIES, periodLabel, visibleDefs, visibleIndicators,
} from "@/lib/indicators";
import * as A from "./actions";

export default async function Indicadores({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!canViewIndicators(u)) redirect("/sin-acceso");
  const sp = await searchParams;
  const manage = can(u, "indicators.manage");
  const tab = manage && ["definiciones", "aplicar"].includes(sp.tab) ? sp.tab : sp.tab === "empresas" ? "empresas" : "tablero";
  const tabs: [string, string][] = [["tablero", "Tablero de avances"], ["empresas", u.company_id ? "Mis indicadores" : "Indicadores por empresa"]];
  if (manage) tabs.push(["definiciones", "Definiciones"], ["aplicar", "Aplicar a empresas"]);
  return (
    <>
      <PageHeader eyebrow="Seguimiento y medición" title={u.company_id ? "Mis indicadores" : "Indicadores de gestión e impacto"}
        subtitle="Línea base, meta y avances de cada empresa por programa y servicio. El tablero se actualiza con cada avance que registran mentores, administrativos o la empresa."
        actions={!u.company_id && <a className="btn-ghost btn-sm" href="/api/operacion/indicadores"><FileSpreadsheet className="h-4 w-4" />Exportar Excel</a>} />
      <Flash sp={sp} />
      <Tabs tabs={tabs} active={tab} base="/indicadores" />
      {tab === "tablero" && <Tablero u={u} sp={sp} />}
      {tab === "empresas" && <PorEmpresa u={u} sp={sp} />}
      {tab === "definiciones" && <Definiciones u={u} sp={sp} />}
      {tab === "aplicar" && <Aplicar u={u} />}
    </>
  );
}

function filtersFrom(sp: any) {
  return { program: Number(sp.program) || undefined, servicio: Number(sp.servicio) || undefined, company: Number(sp.company) || undefined, kind: ["impacto", "gestion"].includes(sp.kind) ? sp.kind : undefined };
}

function Filters({ u, sp, tab }: { u: any; sp: any; tab: string }) {
  const cf = companyFilter(u, "c");
  const companies = all<any>(`SELECT c.id, c.razon_social FROM companies c WHERE c.id IN (SELECT company_id FROM indicators) AND ${cf.sql} ORDER BY c.razon_social`, ...cf.params);
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  const servicios = all<any>("SELECT id, name FROM servicios ORDER BY name");
  if (u.company_id) return null;
  return (
    <form className="card mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
      <input type="hidden" name="tab" value={tab} />
      <Field label="Programa"><select name="program" defaultValue={sp.program ?? ""} className="input"><option value="">Todos</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Servicio"><select name="servicio" defaultValue={sp.servicio ?? ""} className="input"><option value="">Todos</option>{servicios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Empresa"><select name="company" defaultValue={sp.company ?? ""} className="input"><option value="">Todas</option>{companies.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}</select></Field>
      <Field label="Tipo"><select name="kind" defaultValue={sp.kind ?? ""} className="input"><option value="">Gestión e impacto</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <div className="flex items-end gap-2"><button className="btn">Filtrar</button><a className="btn-ghost" href={`/indicadores?tab=${tab}`}>Limpiar</a></div>
    </form>
  );
}

function Tablero({ u, sp }: { u: any; sp: any }) {
  const f = filtersFrom(sp);
  const inds = visibleIndicators(u, f);
  const withData = inds.filter((i) => i.pct != null);
  const avg = withData.length ? Math.round(withData.reduce((a, i) => a + i.pct, 0) / withData.length) : 0;
  const met = inds.filter((i) => i.pct != null && i.pct >= 100).length;
  const ids = inds.map((i) => i.id);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = ids.length ? all<any>(`SELECT v.*, i.name, i.unit, i.company_id, c.razon_social, us.name recorder, us.company_id rc,
      (SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=v.recorded_by LIMIT 1) role
      FROM indicator_values v JOIN indicators i ON i.id=v.indicator_id JOIN companies c ON c.id=i.company_id LEFT JOIN users us ON us.id=v.recorded_by
      WHERE v.indicator_id IN (${ids.map(() => "?").join(",")}) ORDER BY v.recorded_at DESC, v.id DESC LIMIT 10`, ...ids) : [];
  const n30 = recent.filter((r) => r.recorded_at >= since).length;
  const timeline = complianceTimeline(inds);
  const companies = new Set(inds.map((i) => i.company_id)).size;
  const perIndicator = f.company || u.company_id ? inds.slice(0, 6) : [];
  return (
    <>
      <Filters u={u} sp={sp} tab="tablero" />
      {!inds.length ? (
        <EmptyState title="Aún no hay indicadores aplicados">
          {can(u, "indicators.manage") ? <>Define un indicador en <Link className="text-brand" href="/indicadores?tab=definiciones">Definiciones</Link> y aplícalo a las empresas.</> : "Cuando tu programa aplique indicadores a las empresas verás aquí su avance."}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Indicadores aplicados" value={inds.length} hint={`${companies} empresa(s)`} icon={Gauge} />
            <Stat label="Cumplimiento promedio" value={`${avg}%`} hint="avance hacia la meta desde la línea base" icon={TrendingUp} tone={avg >= 80 ? "green" : avg >= 40 ? "blue" : "amber"} />
            <Stat label="Metas alcanzadas" value={met} hint={`de ${inds.length}`} icon={Target} tone="green" />
            <Stat label="Avances en 30 días" value={n30} hint="mentor, administrativo o empresa" icon={Building2} tone="violet" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h2 className="font-semibold text-ink">Evolución del cumplimiento</h2>
              <p className="mb-3 text-xs text-slate-500">Promedio mensual del % de avance hacia la meta (último valor conocido de cada indicador).</p>
              {timeline.length ? <LineChart series={[{ label: "% de cumplimiento", points: timeline }]} /> : <p className="text-sm text-slate-400">Sin avances registrados.</p>}
            </div>
            <div className="card">
              <h2 className="mb-3 font-semibold text-ink">Últimos avances</h2>
              <ul className="space-y-2.5 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex justify-between gap-2"><Link className="font-medium text-ink hover:text-brand" href={`/indicadores/${r.indicator_id}`}>{r.name}</Link><b>{fmtNum(r.value, r.unit)}</b></div>
                    <div className="text-xs text-slate-500">{r.razon_social} · {r.recorder} ({r.rc ? "empresa" : r.role || "equipo"}) · {fmtDate(r.recorded_at, false)}</div>
                  </li>))}
                {!recent.length && <li className="text-slate-400">Sin avances.</li>}
              </ul>
            </div>
          </div>
          {perIndicator.length > 0 && (
            <Section title="Evolución por indicador" subtitle="Valor registrado mes a mes frente a la meta">
              <div className="grid gap-4 md:grid-cols-2">
                {perIndicator.map((i) => <MiniSeries key={i.id} ind={i} />)}
              </div>
            </Section>)}
          {!u.company_id && (
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              {[["Por programa", groupCompliance(inds, (i) => i.program)], ["Por servicio", groupCompliance(inds.filter((i) => i.service), (i) => i.service)], ["Por empresa", groupCompliance(inds, (i) => i.razon_social)]].map(([t, g]: any) => (
                <div key={t} className="card"><h3 className="mb-3 font-semibold text-ink">Cumplimiento {String(t).toLowerCase()}</h3>
                  {g.length ? <HBarChart data={g.map((x: any) => ({ label: `${x.label} (${x.n})`, value: x.avg }))} max={100} format={(v) => `${v}%`} /> : <p className="text-sm text-slate-400">Sin datos</p>}</div>))}
            </div>)}
          <Section title="Detalle" subtitle="Cumplimiento = (valor actual − línea base) / (meta − línea base)">
            <IndTable inds={inds} />
          </Section>
        </>)}
    </>
  );
}

function MiniSeries({ ind }: { ind: any }) {
  const vals = all<any>("SELECT value, recorded_at FROM indicator_values WHERE indicator_id=? ORDER BY recorded_at, id", ind.id);
  const pts = dailyPoints(vals);
  return (
    <div className="card">
      <div className="mb-1 flex items-start justify-between gap-2"><Link href={`/indicadores/${ind.id}`} className="font-medium text-ink hover:text-brand">{ind.name}</Link><Badge tone={ind.pct >= 80 ? "green" : ind.pct >= 40 ? "blue" : "amber"}>{ind.pct ?? 0}%</Badge></div>
      <div className="mb-2 text-xs text-slate-500">{ind.razon_social} · base {fmtNum(ind.baseline, ind.unit)} · meta {fmtNum(ind.goal, ind.unit)}</div>
      {pts.length ? <LineChart height={150} series={[{ label: ind.name, points: pts }, { label: "Meta", points: pts.map((p) => ({ x: p.x, y: Number(ind.goal) })), color: "#16a34a" }]} /> : <p className="text-sm text-slate-400">Sin avances</p>}
    </div>
  );
}

function IndTable({ inds }: { inds: any[] }) {
  return (
    <Table head={["Empresa", "Indicador", "Tipo", "Línea base", "Actual", "Meta", "Cumplimiento", "Último avance", ""]} empty="Sin indicadores">
      {inds.map((i) => (
        <tr key={i.id}>
          <Td>{i.razon_social}<div className="text-xs text-slate-400">{i.program}{i.service ? ` · ${i.service}` : ""}</div></Td>
          <Td><span className="font-medium">{i.name}</span><div className="text-xs text-slate-400">{periodLabel(i.periodicity)}</div></Td>
          <Td><Badge tone={i.kind === "gestion" ? "violet" : "blue"}>{i.kind === "gestion" ? "gestión" : "impacto"}</Badge></Td>
          <Td>{fmtNum(i.baseline, i.unit)}</Td><Td className="font-medium">{fmtNum(i.final, i.unit)}</Td><Td>{fmtNum(i.goal, i.unit)}</Td>
          <Td className="w-40"><div className="mb-1 text-xs font-medium">{i.pct == null ? "—" : `${i.pct}%`}</div><Progress value={i.pct ?? 0} /></Td>
          <Td className="text-xs">{i.last_at ? fmtDate(i.last_at, false) : "—"}<div className="text-slate-400">{i.n_values} avance(s)</div></Td>
          <Td><Link className="btn-ghost btn-sm" href={`/indicadores/${i.id}`}>Ver / registrar</Link></Td>
        </tr>))}
    </Table>
  );
}

function PorEmpresa({ u, sp }: { u: any; sp: any }) {
  const inds = visibleIndicators(u, filtersFrom(sp));
  return (<><Filters u={u} sp={sp} tab="empresas" /><IndTable inds={inds} /></>);
}

function DefForm({ d, u }: { d?: any; u: any }) {
  const scope = defScope(u);
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name").filter((p) => scope === null || scope.includes(p.id));
  const servicios = all<any>("SELECT sv.id, sv.name, sv.program_id, p.name program FROM servicios sv LEFT JOIN programs p ON p.id=sv.program_id WHERE sv.active=1 ORDER BY p.name, sv.name").filter((s) => scope === null || scope.includes(s.program_id));
  const target = d?.servicio_id ? "servicio" : "programa";
  return (
    <form action={d ? A.updateDef : A.createDef} className="grid gap-3 md:grid-cols-3">
      {d && <input type="hidden" name="id" value={d.id} />}
      <Field label="Nombre del indicador *"><input name="name" required minLength={3} defaultValue={d?.name} className="input" placeholder="p. ej. Ventas mensuales" /></Field>
      <Field label="Tipo"><select name="kind" defaultValue={d?.kind ?? "impacto"} className="input">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Unidad de medida *"><input name="unit" required defaultValue={d?.unit} className="input" placeholder="%, millones COP, clientes…" /></Field>
      <Field label="Aplica a"><select name="target" defaultValue={target} className="input"><option value="programa">Todo un programa</option><option value="servicio">Un servicio del catálogo</option></select></Field>
      <Field label="Programa (si aplica a programa)"><select name="program_id" defaultValue={d?.program_id ?? ""} className="input"><option value="">—</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Servicio (si aplica a servicio)"><select name="servicio_id" defaultValue={d?.servicio_id ?? ""} className="input"><option value="">—</option>{servicios.map((s) => <option key={s.id} value={s.id}>{s.program} · {s.name}</option>)}</select></Field>
      <Field label="Línea base por defecto"><input name="baseline_default" inputMode="decimal" defaultValue={d?.baseline_default ?? ""} className="input" /></Field>
      <Field label="Meta por defecto" hint="Se puede ajustar por empresa"><input name="goal" inputMode="decimal" defaultValue={d?.goal ?? ""} className="input" /></Field>
      <Field label="Periodicidad de medición"><select name="periodicity" defaultValue={d?.periodicity ?? "mensual"} className="input">{PERIODICITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <div className="md:col-span-3"><Field label="Fórmula o forma de medición"><textarea name="formula" rows={2} defaultValue={d?.formula ?? ""} className="input" placeholder="Fuente del dato y cálculo" /></Field></div>
      <div><button className="btn">{d ? "Guardar cambios" : "Crear indicador"}</button></div>
    </form>
  );
}

function Definiciones({ u, sp }: { u: any; sp: any }) {
  const defs = visibleDefs(u);
  const editing = defs.find((d) => d.id === Number(sp.edit));
  return (
    <>
      <div className="card mb-6">
        <div className="mb-1 flex items-start justify-between gap-2"><h2 className="font-semibold text-ink">{editing ? `Editar «${editing.name}»` : "Nuevo indicador"}</h2>
          {editing && <Link className="btn-ghost btn-sm" href="/indicadores?tab=definiciones">Cancelar edición</Link>}</div>
        <p className="mb-4 text-sm text-slate-500">Se configura sin desarrollo: define unidad, línea base, meta y periodicidad, por programa o por servicio del catálogo.</p>
        <DefForm key={editing?.id ?? "new"} d={editing} u={u} />
      </div>
      <Table head={["Indicador", "Aplica a", "Tipo", "Unidad", "Base → meta", "Periodicidad", "Empresas", "Estado", ""]} empty="Sin indicadores definidos">
        {defs.map((d) => (
          <tr key={d.id}>
            <Td><span className="font-medium">{d.name}</span>{d.formula && <div className="max-w-xs text-xs text-slate-400">{d.formula}</div>}</Td>
            <Td className="text-xs">{d.service ? <><Badge tone="violet">servicio</Badge> {d.service}</> : <><Badge tone="blue">programa</Badge> {d.program}</>}</Td>
            <Td>{d.kind === "gestion" ? "Gestión" : "Impacto"}</Td><Td>{d.unit}</Td>
            <Td className="whitespace-nowrap">{fmtNum(d.baseline_default)} → {d.goal == null ? <span className="text-slate-400">por empresa</span> : fmtNum(d.goal)}</Td>
            <Td>{periodLabel(d.periodicity)}</Td><Td>{d.applied}</Td><Td><Badge>{d.active ? "activo" : "inactivo"}</Badge></Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <Link className="btn-ghost btn-sm" href={`/indicadores?tab=definiciones&edit=${d.id}`}>Editar</Link>
                <form action={A.toggleDef}><input type="hidden" name="id" value={d.id} /><button className="btn-ghost btn-sm">{d.active ? "Desactivar" : "Activar"}</button></form>
              </div>
            </Td>
          </tr>))}
      </Table>
    </>
  );
}

function Aplicar({ u }: { u: any }) {
  const defs = visibleDefs(u, true);
  const cf = companyFilter(u, "c");
  const companies = all<any>(`SELECT c.id, c.razon_social, c.program_id, p.name program,
      (SELECT GROUP_CONCAT(d.name, ', ') FROM indicators i JOIN indicator_defs d ON d.id=i.def_id WHERE i.company_id=c.id) has
    FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.status='activa' AND ${cf.sql} ORDER BY p.name, c.razon_social`, ...cf.params);
  if (!defs.length) return <EmptyState title="No hay indicadores activos">Crea uno en la pestaña Definiciones.</EmptyState>;
  return (
    <form action={A.applyDef} className="card space-y-4">
      <p className="text-sm text-slate-500">Crea el indicador en cada empresa con su línea base y meta. Las empresas que ya lo tienen se omiten. Solo se aplica a empresas del mismo programa del indicador.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Indicador *"><select name="def_id" required className="input">{defs.map((d) => <option key={d.id} value={d.id}>{d.service ? `${d.service} · ` : `${d.program} · `}{d.name} ({d.unit})</option>)}</select></Field>
        <Field label="Línea base" hint="Vacío = la de la definición"><input name="baseline" inputMode="decimal" className="input" /></Field>
        <Field label="Meta" hint="Vacío = la de la definición"><input name="goal" inputMode="decimal" className="input" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="all" value="1" /> Aplicar a todas las empresas activas del programa (o con el servicio, si el indicador es de un servicio)</label>
      <fieldset>
        <legend className="label">O selecciona empresas</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <label key={c.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <input type="checkbox" name="company_ids" value={c.id} className="mt-0.5" />
              <span><b className="font-medium">{c.razon_social}</b><span className="block text-xs text-slate-400">{c.program}{c.has ? ` · ya tiene: ${c.has}` : ""}</span></span>
            </label>))}
        </div>
      </fieldset>
      <button className="btn">Aplicar indicador</button>
    </form>
  );
}
