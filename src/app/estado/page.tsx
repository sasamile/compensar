import type { Metadata } from "next";
import { Activity, CheckCircle2, Clock3, Database, Gauge, Layers, Plug, Server, TriangleAlert, XCircle } from "lucide-react";
import { all, get, setting } from "@/lib/db";
import { GET as health } from "@/app/api/health/route";
import { fmtDate } from "@/lib/util";
import Refresh from "./refresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estado de la plataforma · Fomento Empresarial", description: "Disponibilidad y desempeño en tiempo real" };

/**
 * Página pública de estado (RNF-OBS-07): disponibilidad y desempeño en tiempo real para Compensar.
 * Se alimenta de /api/health (misma función) y de agregados sin datos personales: nunca muestra correos, IPs,
 * mensajes de error ni identificadores de registros.
 */
const INTEGRATIONS: Record<string, string> = {
  onbase: "OnBase (repositorio documental)", gestion_clientes: "Gestión de Clientes Compensar", sso: "IAM corporativo (SSO)",
  correo: "Correo", sms: "SMS", whatsapp: "WhatsApp", webhooks: "Webhooks salientes",
};
const label = (n: string) => INTEGRATIONS[n] || n.replace(/_/g, " ");
const safe = <T,>(fn: () => T, def: T): T => { try { return fn(); } catch { return def; } };
const pct = (ok: number, total: number) => (total ? Math.round((ok / total) * 1000) / 10 : null);

type Level = "ok" | "degradado" | "caido";
const LEVEL: Record<Level, { text: string; cls: string; Icon: any }> = {
  ok: { text: "Operativo", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", Icon: CheckCircle2 },
  degradado: { text: "Degradado", cls: "bg-amber-50 text-amber-900 ring-amber-200", Icon: TriangleAlert },
  caido: { text: "Fuera de servicio", cls: "bg-red-50 text-red-800 ring-red-200", Icon: XCircle },
};

function Pill({ level }: { level: Level }) {
  const L = LEVEL[level];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${L.cls}`}><L.Icon className="h-3.5 w-3.5" aria-hidden />{L.text}</span>;
}

function Card({ title, icon: Icon, level, children }: { title: string; icon: any; level: Level; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800"><Icon className="h-4 w-4 text-slate-500" aria-hidden />{title}</h2>
        <Pill level={level} />
      </div>
      <div className="space-y-1.5 text-sm text-slate-600">{children}</div>
    </section>
  );
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3"><span>{k}</span><span className="text-right font-medium text-slate-800">{v}</span></div>;

export default async function Estado() {
  const res = await health();
  const h: any = await res.json();
  const brand = setting("brand_name", "Compensar");
  const logo = setting("brand_logo_doc", "");
  const color = setting("brand_color", "#0a6cff");
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const overall: Level = res.status === 503 ? "caido" : h.status === "ok" ? "ok" : "degradado";

  const jobs: any[] = h.checks?.jobs ?? [];
  const failing = jobs.filter((j) => j.ok === false).length;
  const late = h.checks?.runner?.started ? jobs.filter((j) => j.late).length : 0;
  const jobs24 = safe(() => get<any>("SELECT COUNT(*) n, SUM(ok=1) ok FROM job_runs WHERE started_at>=?", ago(86400000)), { n: 0, ok: 0 });
  const jobLevel: Level = failing ? "degradado" : late ? "degradado" : "ok";

  const q = h.checks?.queues ?? {};
  const imports = safe(() => get<any>("SELECT SUM(status='pendiente') pend, SUM(status='procesando') proc FROM import_jobs"), { pend: 0, proc: 0 });
  const oldest = q.integration_jobs?.oldest_pending ? Math.round((Date.now() - new Date(q.integration_jobs.oldest_pending).getTime()) / 60000) : null;
  const queueLevel: Level = (q.integration_jobs?.failed || 0) + (q.webhook_deliveries?.failed || 0) > 0 || (oldest ?? 0) > 60 ? "degradado" : "ok";

  const breakers: any[] = h.checks?.breakers ?? [];
  const integ24 = safe(() => all<any>("SELECT system, COUNT(*) n, SUM(ok=1) ok, AVG(ms) ms FROM integration_log WHERE ts>=? GROUP BY system ORDER BY system", ago(86400000)), []);
  const names = Array.from(new Set([...breakers.map((b) => b.name), ...integ24.map((i) => i.system)])).sort();
  const integrations = names.map((n) => {
    const b = breakers.find((x) => x.name === n);
    const i = integ24.find((x) => x.system === n);
    const level: Level = b && b.state === "abierto" ? "caido" : b && b.state !== "cerrado" ? "degradado" : i && pct(i.ok, i.n)! < 95 ? "degradado" : "ok";
    return { n, level, avail: i ? pct(i.ok, i.n) : null, ms: i?.ms ? Math.round(i.ms) : null, calls: i?.n ?? 0 };
  });
  const integLevel: Level = integrations.some((i) => i.level === "caido") ? "degradado" : integrations.some((i) => i.level !== "ok") ? "degradado" : "ok";

  const api1h = safe(() => get<any>("SELECT COUNT(*) n, SUM(status>=500) e, AVG(ms) ms FROM api_log WHERE ts>=?", ago(3600000)), { n: 0, e: 0, ms: null });
  const dbMs = h.checks?.db?.latency_ms;
  const up = Number(h.uptime_s || 0);
  const upText = up >= 86400 ? `${Math.floor(up / 86400)} d ${Math.floor((up % 86400) / 3600)} h` : up >= 3600 ? `${Math.floor(up / 3600)} h ${Math.floor((up % 3600) / 60)} min` : `${Math.floor(up / 60)} min`;

  return (
    <div className="min-h-screen bg-[#f5f7fb]" style={{ ["--color-brand" as any]: color }}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2.5">
            {logo ? <img src={`/api/marca/logo?v=${logo}`} alt="" className="h-9 w-9 rounded-xl object-contain" />
              : <div className="grid h-9 w-9 place-items-center rounded-xl font-bold text-white" style={{ background: color }}>{brand[0]}</div>}
            <div className="leading-tight"><div className="text-sm font-semibold text-slate-900">{brand}</div><div className="text-xs text-slate-500">Estado de la Plataforma de Fomento Empresarial</div></div>
          </div>
          <Refresh everyMs={15000} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className={`flex flex-wrap items-center gap-3 rounded-2xl p-5 ring-1 ring-inset ${LEVEL[overall].cls}`} role="status">
          {(() => { const I = LEVEL[overall].Icon; return <I className="h-7 w-7" aria-hidden />; })()}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">{overall === "ok" ? "Todos los sistemas operan con normalidad" : overall === "caido" ? "La plataforma no está disponible" : "Algunos componentes presentan fallas"}</h1>
            {h.problems?.length > 0 && <p className="mt-1 text-sm">Detalle: {h.problems.join(" · ")}.</p>}
          </div>
          <div className="text-right text-xs opacity-80">Última verificación<br /><b>{fmtDate(h.time || new Date().toISOString())}</b></div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card title="Plataforma web" icon={Server} level={overall === "caido" ? "caido" : "ok"}>
            <Row k="Tiempo en servicio" v={upText} />
            <Row k="Versión" v={h.version || "—"} />
            <Row k="Errores técnicos (última hora)" v={h.checks?.errors_last_hour ?? 0} />
          </Card>
          <Card title="Base de datos" icon={Database} level={h.checks?.db?.ok ? (dbMs > 200 ? "degradado" : "ok") : "caido"}>
            <Row k="Conexión" v={h.checks?.db?.ok ? "Disponible" : "Sin conexión"} />
            <Row k="Latencia de consulta" v={dbMs != null ? `${dbMs} ms` : "—"} />
          </Card>
          <Card title="Procesos por lotes" icon={Layers} level={jobLevel}>
            <Row k="Ejecutor" v={h.checks?.runner?.started ? "En marcha" : "Detenido"} />
            <Row k="Procesos programados" v={jobs.length} />
            <Row k="Con falla en la última ejecución" v={failing} />
            <Row k="Atrasados" v={late} />
            <Row k="Éxito últimas 24 h" v={jobs24?.n ? `${pct(jobs24.ok || 0, jobs24.n)} % (${jobs24.n} ejecuciones)` : "Sin ejecuciones"} />
          </Card>
          <Card title="Colas" icon={Clock3} level={queueLevel}>
            <Row k="Integraciones pendientes" v={q.integration_jobs?.pending || 0} />
            <Row k="Integraciones fallidas" v={q.integration_jobs?.failed || 0} />
            <Row k="Pendiente más antiguo" v={oldest != null ? `${oldest} min` : "—"} />
            <Row k="Webhooks pendientes / fallidos" v={`${q.webhook_deliveries?.pending || 0} / ${q.webhook_deliveries?.failed || 0}`} />
            <Row k="Cargues masivos en cola" v={(imports?.pend || 0) + (imports?.proc || 0)} />
          </Card>
          <Card title="Desempeño de la API" icon={Gauge} level={api1h?.n && api1h.e / api1h.n > 0.05 ? "degradado" : "ok"}>
            <Row k="Llamadas (última hora)" v={api1h?.n || 0} />
            <Row k="Latencia promedio" v={api1h?.ms ? `${Math.round(api1h.ms)} ms` : "—"} />
            <Row k="Respuestas con error 5xx" v={api1h?.n ? `${pct(api1h.e || 0, api1h.n)} %` : "—"} />
          </Card>
          <Card title="Integraciones" icon={Plug} level={integLevel}>
            {integrations.length === 0 ? <p>Sin llamadas a sistemas externos en las últimas 24 h.</p> :
              integrations.map((i) => (
                <div key={i.n} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{label(i.n)}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    {i.avail != null && <span title="Disponibilidad últimas 24 h">{i.avail} %{i.ms != null ? ` · ${i.ms} ms` : ""}</span>}
                    <Pill level={i.level} />
                  </span>
                </div>))}
          </Card>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800"><Activity className="h-4 w-4" aria-hidden />Procesos por lotes</h2>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {jobs.map((j) => (
              <li key={j.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{j.name.replace(/_/g, " ")}</span>
                <span className="shrink-0 text-xs text-slate-500">{j.last_run ? fmtDate(j.last_run) : "sin ejecutar"} · <Pill level={j.ok === false ? "caido" : h.checks?.runner?.started && j.late ? "degradado" : "ok"} /></span>
              </li>))}
          </ul>
        </section>
        <p className="text-center text-xs text-slate-400">Esta página se actualiza automáticamente cada 15 segundos y no contiene datos personales. Monitoreo técnico: <code>/api/health</code> y <code>/api/metrics</code>.</p>
      </main>
    </div>
  );
}
