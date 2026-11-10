import { all, get, setting } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — métricas en formato de exposición Prometheus 0.0.4 (TEC-77): lo recogen Prometheus/Grafana,
 * Dynatrace, New Relic, Datadog o el OpenTelemetry Collector (receiver prometheus) para enviarlas por OTLP.
 * Si existe METRICS_TOKEN se exige «Authorization: Bearer <METRICS_TOKEN>».
 */
export async function GET(req: Request) {
  const tok = process.env.METRICS_TOKEN;
  if (tok && req.headers.get("authorization") !== `Bearer ${tok}`) return new Response("No autorizado", { status: 401 });
  const out: string[] = [];
  const esc = (v: any) => String(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
  const metric = (name: string, type: string, help: string, rows: [Record<string, any>, number][]) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const [labels, v] of rows) {
      const l = Object.entries(labels).map(([k, x]) => `${k}="${esc(x)}"`).join(",");
      out.push(`${name}${l ? `{${l}}` : ""} ${Number.isFinite(v) ? v : 0}`);
    }
  };
  const n = (sql: string, ...p: any[]) => Number(get<any>(sql, ...p)?.n ?? 0);
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const timeoutMs = Number(setting("session_timeout_min", "30")) * 60000;

  metric("fe_up", "gauge", "La aplicación responde", [[{}, 1]]);
  metric("fe_process_uptime_seconds", "gauge", "Tiempo desde el arranque del proceso", [[{}, Math.round(process.uptime())]]);
  metric("fe_process_resident_memory_bytes", "gauge", "Memoria residente del proceso", [[{}, process.memoryUsage().rss]]);
  metric("fe_users", "gauge", "Usuarios por estado y tipo", all<any>("SELECT status, internal, COUNT(*) n FROM users GROUP BY status, internal").map((r) => [{ estado: r.status, interno: r.internal ? "si" : "no" }, r.n]));
  metric("fe_users_active_24h", "gauge", "Usuarios con ingreso en las últimas 24 h", [[{}, n("SELECT COUNT(*) n FROM users WHERE last_login_at>=?", ago(86400000))]]);
  metric("fe_sessions_active", "gauge", "Sesiones web activas (no vencidas por inactividad)", [[{}, n("SELECT COUNT(*) n FROM sessions WHERE last_seen>=?", ago(timeoutMs))]]);
  metric("fe_users_mfa_enabled", "gauge", "Usuarios con segundo factor activo", [[{}, n("SELECT COUNT(*) n FROM users WHERE mfa_enabled=1")]]);
  metric("fe_integration_jobs", "gauge", "Trabajos de integración por tipo y estado", all<any>("SELECT kind, status, COUNT(*) n FROM integration_jobs GROUP BY kind, status").map((r) => [{ tipo: r.kind, estado: r.status }, r.n]));
  metric("fe_webhook_deliveries", "gauge", "Entregas de webhooks por estado", all<any>("SELECT status, COUNT(*) n FROM webhook_deliveries GROUP BY status").map((r) => [{ estado: r.status }, r.n]));
  metric("fe_documents", "gauge", "Documentos por estado de OnBase", all<any>("SELECT onbase_status, COUNT(*) n FROM documents GROUP BY onbase_status").map((r) => [{ estado: r.onbase_status }, r.n]));
  metric("fe_circuit_breaker_open", "gauge", "1 si el circuit breaker está abierto o semiabierto", all<any>("SELECT name, state FROM circuit_breakers").map((r) => [{ integracion: r.name }, r.state === "cerrado" ? 0 : 1]));
  metric("fe_errors_total", "counter", "Errores técnicos registrados", [[{}, n("SELECT COUNT(*) n FROM error_log")]]);
  metric("fe_errors_last_hour", "gauge", "Errores técnicos en la última hora", [[{}, n("SELECT COUNT(*) n FROM error_log WHERE ts>=?", ago(3600000))]]);
  metric("fe_login_failures_last_hour", "gauge", "Ingresos fallidos en la última hora", [[{}, n("SELECT COUNT(*) n FROM security_events WHERE kind IN ('login_fallido','otp_fallido','mfa_fallido','sso_fallido','sso_denegado') AND ts>=?", ago(3600000))]]);
  metric("fe_security_events_last_hour", "gauge", "Eventos de seguridad por tipo en la última hora", all<any>("SELECT kind, COUNT(*) n FROM security_events WHERE ts>=? GROUP BY kind", ago(3600000)).map((r) => [{ tipo: r.kind }, r.n]));
  metric("fe_notifications_total", "counter", "Notificaciones por canal y estado", all<any>("SELECT channel, status, COUNT(*) n FROM notifications GROUP BY channel, status").map((r) => [{ canal: r.channel, estado: r.status }, r.n]));
  metric("fe_api_requests_last_hour", "gauge", "Llamadas a la API en la última hora por código de estado", all<any>("SELECT status, COUNT(*) n FROM api_log WHERE ts>=? GROUP BY status", ago(3600000)).map((r) => [{ codigo: r.status }, r.n]));
  metric("fe_api_latency_avg_ms", "gauge", "Latencia promedio de la API en la última hora (ms)", [[{}, Number(get<any>("SELECT AVG(ms) n FROM api_log WHERE ts>=?", ago(3600000))?.n ?? 0)]]);
  const jobs = all<any>(`SELECT j.job, j.ok, (julianday(j.finished_at)-julianday(j.started_at))*86400 dur, strftime('%s', j.started_at) st
    FROM job_runs j JOIN (SELECT job, MAX(id) id FROM job_runs GROUP BY job) m ON m.id=j.id`);
  metric("fe_job_last_duration_seconds", "gauge", "Duración de la última ejecución de cada proceso por lotes", jobs.map((r) => [{ job: r.job }, Math.round((r.dur || 0) * 1000) / 1000]));
  metric("fe_job_last_success", "gauge", "1 si la última ejecución terminó bien", jobs.map((r) => [{ job: r.job }, r.ok ? 1 : 0]));
  metric("fe_job_last_run_timestamp_seconds", "gauge", "Hora (unix) de la última ejecución", jobs.map((r) => [{ job: r.job }, Number(r.st || 0)]));
  metric("fe_job_runs_total", "counter", "Ejecuciones registradas por proceso y resultado", all<any>("SELECT job, ok, COUNT(*) n FROM job_runs GROUP BY job, ok").map((r) => [{ job: r.job, resultado: r.ok ? "ok" : "falla" }, r.n]));
  return new Response(out.join("\n") + "\n", { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
