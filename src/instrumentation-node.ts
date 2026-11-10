/** Parte de la instrumentación que solo corre en Node.js (ver src/instrumentation.ts). */
import { startRunner } from "./lib/jobs/runner";
import { logError } from "./lib/resilience";
import { ensureSeed } from "./lib/seed";

export function startNode() {
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.JOBS_DISABLED === "1") return;
  try { ensureSeed(); } catch (e) { logError("seed", e); } // los procesos por lotes necesitan los datos base desde el primer ciclo
  startRunner();
}

export function captureRequestError(err: unknown, request: { path: string; method: string }, context: { routeType: string; routePath?: string }) {
  // NEXT_REDIRECT / NEXT_NOT_FOUND son control de flujo, no errores
  const digest = String((err as any)?.digest || "");
  if (/^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest)) return;
  logError(`${context.routeType} ${request.method} ${context.routePath || request.path.split("?")[0]}`, err);
}
