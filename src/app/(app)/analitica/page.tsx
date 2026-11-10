import Link from "next/link";
import { BarChart3, Database, FileSpreadsheet, LayoutDashboard, MessageSquareText, PlugZap, BarChart3 as PageIcon } from "lucide-react";
import { can, requirePerm, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { filterOptions, lastSnapshot, overview } from "@/lib/analytics";
import { globalFromParams, globalToParams, isOrgWide } from "@/lib/datasets";
import { fmtDate } from "@/lib/util";
import { BarChart, Donut, HBarChart, LineChart, chartColor } from "@/components/charts";
import { Badge, PageHeader, Stat, Table, Td } from "@/components/ui";
import PrintButton from "@/components/print-button";
import AutoRefresh from "@/components/ana-autorefresh";
import { FilterBar, activeFilters } from "@/components/ana-filters";

export const dynamic = "force-dynamic";

function Card({ title, children, data, className = "", hint }: { title: string; children: React.ReactNode; data?: string; className?: string; hint?: string }) {
  return (
    <section className={`card min-w-0 break-inside-avoid ${className}`} aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><h2 className="font-semibold text-ink">{title}</h2>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
        {data && <Link href={data} className="shrink-0 text-xs text-brand hover:underline print:hidden">Ver datos y exportar →</Link>}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default async function Analitica({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const sp = await searchParams;
  const g = globalFromParams(sp);
  const opts = filterOptions(u);
  const o = overview(u, g);
  const gq = new URLSearchParams(globalToParams(g)).toString();
  const data = (fuente: string, extra = "") => `/analitica/consultas?fuente=${fuente}${gq ? "&" + gq : ""}${extra}`;
  const chips = activeFilters(g, opts);
  const f0 = o.funnel[0].value;
  const org = isOrgWide(u);
  const hist = org ? all<any>("SELECT day, metric, value FROM ana_snapshots WHERE metric IN ('empresas_activas','sesiones_realizadas') ORDER BY day DESC LIMIT 60") : [];
  const snap = org ? lastSnapshot() : null;
  return (
    <>
      <PageHeader icon={PageIcon} title="Analítica" subtitle="Indicadores operativos en tiempo real, según el alcance de tu rol"
        actions={<><AutoRefresh seconds={60} /><PrintButton /></>} />
      <nav className="mb-4 flex flex-wrap gap-2 print:hidden" aria-label="Herramientas de analítica">
        <Link href="/analitica/tableros" className="btn-ghost btn-sm"><LayoutDashboard className="h-4 w-4" />Tableros configurables</Link>
        <Link href="/analitica/consultas" className="btn-ghost btn-sm"><Database className="h-4 w-4" />Constructor de consultas</Link>
        <Link href="/reportes" className="btn-ghost btn-sm"><FileSpreadsheet className="h-4 w-4" />Reportes</Link>
        <Link href="/analitica/bi" className="btn-ghost btn-sm"><PlugZap className="h-4 w-4" />Conexión Power BI</Link>
        {can(u, "surveys.view") && <Link href="/encuestas" className="btn-ghost btn-sm"><MessageSquareText className="h-4 w-4" />Análisis de comentarios</Link>}
      </nav>
      <FilterBar opts={opts} g={g} action="/analitica" />
      {chips.length > 0 && <div className="mb-4 flex flex-wrap gap-2 text-xs">{chips.map((c) => <Badge key={c} tone="blue">{c}</Badge>)}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Empresas registradas" value={f0} hint={`${o.funnel[1].value} activas`} />
        <Stat label="Sesiones realizadas" value={o.realizadas} hint={`${Math.round(o.horas * 10) / 10} horas`} />
        <Stat label="Aceptación de sesiones" value={`${pct(o.aceptadas, o.realizadas)}%`} hint={`${o.aceptadas} de ${o.realizadas} aceptadas`} />
        <Stat label="Asistencia a eventos" value={`${pct(o.totAsis, o.totInsc)}%`} hint={`${o.totAsis} de ${o.totInsc} inscritos`} />
        <Stat label="NPS" value={o.nps ? (o.nps.score ?? "—") : "—"} hint={o.nps ? `${o.nps.respuestas} respuestas` : "Sin permiso de encuestas"} />
        <Stat label="Alertas abiertas" value={o.alertas ? o.alertas.severidad.reduce((a, b) => a + b.value, 0) : "—"} hint={o.alertas ? `${o.alertas.severidad.find((s) => s.label === "roja")?.value ?? 0} rojas` : "Sin permiso de alertas"} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Embudo de empresas" hint="Registradas → activas → con mentor → con servicio → cerradas" data={data("empresas")}>
          {f0 ? (
            <div className="space-y-2">
              {o.funnel.map((s, i) => (
                <div key={s.label}>
                  <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-600">{s.label}</span><span className="font-medium text-slate-800">{s.value} <span className="text-slate-400">({pct(s.value, f0)}%)</span></span></div>
                  <div className="h-5 rounded bg-slate-100"><div className="h-5 rounded" style={{ width: `${Math.max(2, pct(s.value, f0))}%`, background: chartColor(i) }} /></div>
                </div>))}
            </div>) : <Empty>No hay empresas para los filtros elegidos.</Empty>}
        </Card>
        <Card title="Sesiones por estado" data={data("sesiones", "&agrupar=estado")}>
          {o.sesEstado.length ? <Donut data={o.sesEstado.map((s) => ({ ...s, color: s.label === "realizada" ? "#16a34a" : s.label === "cancelada" ? "#dc2626" : s.label === "programada" ? "#0a6cff" : undefined }))} label="Sesiones por estado" /> : <Empty>Sin sesiones registradas.</Empty>}
        </Card>
        <Card title="Sesiones por mes" hint="Programadas (no canceladas), realizadas y aceptadas por la empresa" className="lg:col-span-2" data={data("sesiones", "&agrupar=mes")}>
          {o.mesProg.length ? <LineChart width={960} height={220} series={[
            { label: "Programadas", points: o.mesProg.map((p) => ({ x: p.label, y: p.value })) },
            { label: "Realizadas", points: o.mesReal.map((p) => ({ x: p.label, y: p.value })), color: "#16a34a" },
            { label: "Aceptadas", points: o.mesAcc.map((p) => ({ x: p.label, y: p.value })), color: "#f59e0b" },
          ]} /> : <Empty>Sin sesiones en el periodo.</Empty>}
        </Card>
        <Card title="Asistencia a eventos" hint="Inscritos (sin lista de espera) frente a asistentes" data={data("inscripciones", "&agrupar=evento")}>
          {o.attendance.length ? (
            <div className="space-y-3">
              {o.attendance.map((e) => (
                <div key={e.label}>
                  <div className="mb-0.5 flex justify-between gap-2 text-xs"><span className="truncate text-slate-600" title={e.label}>{e.label}</span><span className="shrink-0 font-medium">{e.asistentes}/{e.inscritos} · {pct(e.asistentes, e.inscritos)}%</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct(e.asistentes, e.inscritos)}%` }} /></div>
                </div>))}
            </div>) : <Empty>Sin inscripciones a eventos.</Empty>}
        </Card>
        <Card title="Servicios por aliado" hint="Remisiones y sesiones realizadas por organización aliada" data={data("remisiones", "&agrupar=aliado")}>
          {o.remAliado.length || o.sesAliado.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><div className="label">Remisiones</div><HBarChart data={o.remAliado} /></div>
              <div><div className="label">Sesiones realizadas</div>{o.sesAliado.length ? <HBarChart data={o.sesAliado} /> : <p className="text-xs text-slate-400">Sin sesiones vinculadas a remisiones.</p>}</div>
            </div>) : <Empty>Aún no hay remisiones a aliados.</Empty>}
        </Card>
        <Card title="Impacto: línea base frente a resultado" className="lg:col-span-2" data={data("indicadores")}
          hint={`${o.impacto.total} indicador(es) · ${o.impacto.conResultado} con resultado · ${o.impacto.cumplen} de ${o.impacto.conMeta} cumplen la meta`}>
          {o.impacto.porIndicador.length ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-3">
                {o.impacto.porIndicador.map((i) => {
                  const mx = Math.max(i.base, i.res, 1);
                  return (
                    <div key={i.label}>
                      <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">{i.label}</span><span className="text-slate-500">{i.n} empresa(s) · {i.base ? `${i.res >= i.base ? "+" : ""}${Math.round(((i.res - i.base) / Math.abs(i.base)) * 100)}%` : "—"}</span></div>
                      <div className="flex items-center gap-2 text-[11px]"><span className="w-16 text-slate-500">Base</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-slate-400" style={{ width: `${(i.base / mx) * 100}%` }} /></div><span className="w-14 text-right">{Math.round(i.base * 10) / 10}</span></div>
                      <div className="flex items-center gap-2 text-[11px]"><span className="w-16 text-slate-500">Resultado</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-brand" style={{ width: `${(i.res / mx) * 100}%` }} /></div><span className="w-14 text-right">{Math.round(i.res * 10) / 10}</span></div>
                    </div>);
                })}
              </div>
              <Table head={["Empresa", "Indicador", "Base", "Resultado", "Meta"]}>
                {o.impacto.filas.map((r) => <tr key={r.indicador_id}><Td className="text-xs">{r.empresa}</Td><Td className="text-xs">{r.indicador}</Td><Td>{r.linea_base ?? "—"}</Td><Td>{r.resultado ?? r.ultimo_valor ?? "—"}</Td><Td>{r.meta ?? "—"}</Td></tr>)}
              </Table>
            </div>) : <Empty>Aún no hay indicadores con línea base y resultado.</Empty>}
        </Card>
        {o.diag && (
          <Card title="Diagnósticos por nivel" hint={o.diag.prom != null && o.diag.etapa.length ? `Puntaje promedio ${Math.round(o.diag.prom * 10) / 10}` : undefined} data={data("diagnosticos", "&agrupar=nivel")}>
            {o.diag.nivel.length ? <Donut data={o.diag.nivel} label="Diagnósticos por nivel" /> : o.diag.etapa.length ? <BarChart data={o.diag.etapa} /> : <Empty>Aún no hay diagnósticos (módulo de diagnóstico).</Empty>}
          </Card>)}
        {o.valid && (
          <Card title="Validación de requisitos por estado" hint={o.valid.estado.length && o.valid.dias != null ? `Promedio ${Math.round(o.valid.dias * 10) / 10} días en trámite` : undefined} data={data("validacion", "&agrupar=estado")}>
            {o.valid.estado.length ? <Donut data={o.valid.estado.map((s) => ({ ...s, color: ({ aprobado: "#16a34a", rechazado: "#dc2626", pendiente: "#f59e0b", en_revision: "#0a6cff", ajustes: "#7c3aed" } as Record<string, string>)[s.label] }))} label="Validación por estado" /> : <Empty>Aún no hay casos de validación.</Empty>}
          </Card>)}
        {o.alertas && (
          <Card title="Alertas abiertas" data={data("alertas", "&f1=estado&op1=eq&v1=abierta&agrupar=nombre_regla")}>
            {o.alertas.severidad.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Donut data={o.alertas.severidad.map((s) => ({ ...s, color: s.label === "roja" ? "#dc2626" : "#f59e0b" }))} label="Alertas por severidad" />
                <HBarChart data={o.alertas.regla} />
              </div>) : <Empty>No hay alertas abiertas.</Empty>}
          </Card>)}
        {o.nps && (
          <Card title="Satisfacción (NPS)" data={data("encuestas", "&agrupar=categoria_nps")}
            hint={o.nps.satisf != null && o.nps.respuestas ? `Satisfacción promedio ${Math.round(o.nps.satisf * 10) / 10}` : undefined}>
            {o.nps.respuestas ? (
              <div className="flex flex-wrap items-center gap-6">
                <div className="text-center"><div className={`text-4xl font-bold ${(o.nps.score ?? 0) >= 50 ? "text-emerald-600" : (o.nps.score ?? 0) >= 0 ? "text-amber-600" : "text-red-600"}`}>{o.nps.score}</div><div className="text-xs text-slate-500">NPS</div></div>
                <Donut data={o.nps.cat.map((c) => ({ ...c, color: c.label === "promotor" ? "#16a34a" : c.label === "detractor" ? "#dc2626" : "#f59e0b" }))} size={120} label="Categorías NPS" />
              </div>) : <Empty>Aún no hay encuestas respondidas.</Empty>}
            {o.nps.comentarios > 0 && <p className="mt-3 text-xs text-slate-600">{o.nps.comentarios} comentario(s) abiertos. El análisis de temas (minería de texto) está en <Link href="/encuestas" className="text-brand underline">Encuestas de satisfacción</Link>.</p>}
          </Card>)}
        {org && (
          <Card title="Histórico de la organización" hint={snap ? `Instantánea cada 15 minutos · última ${fmtDate(snap)}` : "Las instantáneas se toman cada 15 minutos"} data="/analitica/consultas?fuente=historico">
            {hist.length ? (
              <LineChart width={700} height={220} series={["empresas_activas", "sesiones_realizadas"].map((m, i) => ({
                label: m === "empresas_activas" ? "Empresas activas" : "Sesiones realizadas", color: chartColor(i),
                points: hist.filter((h) => h.metric === m).reverse().map((h) => ({ x: h.day.slice(5), y: h.value })) }))} />
            ) : <Empty>Aún no hay instantáneas.</Empty>}
          </Card>)}
      </div>
      <p className="mt-6 flex items-center gap-1 text-xs text-slate-400"><BarChart3 className="h-3.5 w-3.5" aria-hidden />Datos consultados directamente sobre la base transaccional al cargar (latencia ≈ 0 s). Cada cifra respeta el alcance de tu rol.</p>
    </>
  );
}
