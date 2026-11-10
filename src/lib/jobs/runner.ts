import os from "node:os";
import crypto from "node:crypto";
import { get, insert, now, run } from "../db";
import { logError } from "../resilience";
import { ALL_JOBS } from "./index";
import type { Job } from "./types";

/**
 * Ejecutor de procesos por lotes (TEC-36). Lo arranca src/instrumentation.ts una sola vez por proceso.
 * Cada job se ejecuta según su everyMs; un candado en la base (job_locks) garantiza una sola ejecución
 * simultánea aunque haya varias instancias del servidor. Cada ejecución queda en job_runs.
 */
const g = globalThis as any;
type State = { started: string; owner: string; timer: any; running: Set<string> };

export function runnerInfo() {
  const s: State | undefined = g.__feRunner;
  return { started: !!s, since: s?.started ?? null, owner: s?.owner ?? null, jobs: ALL_JOBS.length, running: s ? [...s.running] : [] };
}

function acquire(name: string, owner: string, ttlMs: number): boolean {
  const t = Date.now();
  return run(`INSERT INTO job_locks(name,owner,until) VALUES(?,?,?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, until=excluded.until WHERE job_locks.until<? OR job_locks.owner=excluded.owner`,
    name, owner, t + ttlMs, t).changes > 0;
}
const release = (name: string, owner: string) => run("UPDATE job_locks SET until=0 WHERE name=? AND owner=?", name, owner);

/** Ejecuta un job y registra la ejecución. `manual` = botón «Ejecutar ahora». */
export async function runJob(job: Job, manual = false): Promise<{ ok: boolean; detail: string }> {
  const owner = g.__feRunner?.owner ?? `manual:${process.pid}`;
  if (!acquire(job.name, owner, Math.max(60000, job.everyMs * 2))) return { ok: false, detail: "Ya se está ejecutando en otra instancia" };
  g.__feRunner?.running.add(job.name);
  const id = insert("INSERT INTO job_runs(job,started_at) VALUES(?,?)", job.name, now());
  let ok = true, detail = "";
  try {
    detail = String((await job.run()) ?? "ok");
  } catch (e: any) {
    ok = false;
    detail = `Error (traza ${logError(`job ${job.name}`, e)}): ${String(e?.message || e).slice(0, 300)}`;
  } finally {
    g.__feRunner?.running.delete(job.name);
    release(job.name, owner);
  }
  run("UPDATE job_runs SET finished_at=?, ok=?, detail=? WHERE id=?", now(), ok ? 1 : 0, ((manual ? "[manual] " : "") + detail).slice(0, 500), id);
  return { ok, detail };
}

export async function runJobNow(name: string) {
  const job = ALL_JOBS.find((j) => j.name === name);
  if (!job) return { ok: false, detail: "Proceso no encontrado" };
  return runJob(job, true);
}

async function tick() {
  const s: State = g.__feRunner;
  for (const job of ALL_JOBS) {
    if (s.running.has(job.name)) continue;
    try {
      const last = get<any>("SELECT started_at FROM job_runs WHERE job=? ORDER BY id DESC LIMIT 1", job.name);
      if (last && Date.now() - new Date(last.started_at).getTime() < job.everyMs) continue;
      await runJob(job);
    } catch (e) {
      logError(`runner ${job.name}`, e);
    }
  }
}

export function startRunner() {
  if (g.__feRunner) return;
  const s: State = { started: now(), owner: `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString("hex")}`, timer: null, running: new Set() };
  g.__feRunner = s;
  let busy = false;
  const loop = async () => { if (busy) return; busy = true; try { await tick(); } finally { busy = false; } };
  s.timer = setInterval(loop, Number(process.env.JOBS_TICK_MS || 5000));
  s.timer.unref?.();
  setTimeout(loop, 4000).unref?.();
  console.log(`[jobs] ejecutor iniciado (${ALL_JOBS.length} procesos) — ${s.owner}`);
}
