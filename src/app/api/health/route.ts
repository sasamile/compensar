import { all, get } from "@/lib/db";
import { ALL_JOBS } from "@/lib/jobs";
import { runnerInfo } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — salud para herramientas de monitoreo (TEC-41). Sin datos personales.
 * 200 = ok o degradado (ver "checks"), 503 = base de datos no disponible.
 */
export async function GET() {
  const t0 = performance.now();
  let dbOk = true, dbMs = 0;
  try { get("SELECT 1"); dbMs = Math.round((performance.now() - t0) * 100) / 100; } catch { dbOk = false; }
  if (!dbOk) return Response.json({ status: "caido", checks: { db: { ok: false } } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const jobs = ALL_JOBS.map((j) => {
    const r = get<any>("SELECT started_at, finished_at, ok, detail FROM job_runs WHERE job=? ORDER BY id DESC LIMIT 1", j.name);
    const late = !r || Date.now() - new Date(r.started_at).getTime() > Math.max(j.everyMs * 3, 5 * 60000);
    return { name: j.name, every_s: j.everyMs / 1000, last_run: r?.started_at ?? null, ok: r ? !!r.ok : null, late };
  });
  const q = get<any>("SELECT SUM(status='pendiente') pending, SUM(status='fallido') failed, MIN(CASE WHEN status='pendiente' THEN created_at END) oldest FROM integration_jobs");
  const w = get<any>("SELECT SUM(status='pendiente') pending, SUM(status='fallido') failed FROM webhook_deliveries");
  const breakers = all<any>("SELECT name, state, failures, opened_at FROM circuit_breakers");
  const errors1h = get<any>("SELECT COUNT(*) n FROM error_log WHERE ts>=?", new Date(Date.now() - 3600000).toISOString()).n;
  const runner = runnerInfo();
  const problems: string[] = [];
  if (breakers.some((b) => b.state !== "cerrado")) problems.push("integración con circuit breaker abierto");
  if (jobs.some((j) => j.ok === false)) problems.push("proceso por lotes con falla");
  if (runner.started && jobs.some((j) => j.late)) problems.push("proceso por lotes atrasado");
  if ((q?.failed || 0) > 0) problems.push("trabajos de integración fallidos");
  if (errors1h > 50) problems.push("muchos errores técnicos en la última hora");
  return Response.json({
    status: problems.length ? "degradado" : "ok",
    problems,
    time: new Date().toISOString(),
    version: process.env.APP_VERSION || "2.0.0-mvp",
    uptime_s: Math.round(process.uptime()),
    checks: {
      db: { ok: true, latency_ms: dbMs },
      runner,
      jobs,
      queues: {
        integration_jobs: { pending: q?.pending || 0, failed: q?.failed || 0, oldest_pending: q?.oldest ?? null },
        webhook_deliveries: { pending: w?.pending || 0, failed: w?.failed || 0 },
      },
      breakers,
      errors_last_hour: errors1h,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
