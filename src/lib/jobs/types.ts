/** Proceso por lotes (TEC-36). `run` devuelve un resumen corto que queda en job_runs. */
export type Job = { name: string; everyMs: number; run: () => Promise<string | void> | string | void };
