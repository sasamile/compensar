/**
 * Arranque del servidor (Next.js instrumentation): inicia el ejecutor de procesos por lotes (TEC-36) y
 * captura los errores técnicos de las peticiones en error_log (TEC-73).
 * Solo en el runtime de Node.js, nunca durante `next build`, y una sola vez por proceso (guarda global).
 * Desactivar con JOBS_DISABLED=1 (p. ej. en réplicas que solo atienden tráfico).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNode } = await import("./instrumentation-node");
    startNode();
  }
}

export async function onRequestError(err: unknown, request: any, context: any) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { captureRequestError } = await import("./instrumentation-node");
      captureRequestError(err, request, context);
    } catch {}
  }
}
