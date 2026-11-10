/**
 * Utilidades de prueba. Cada archivo *.test.ts corre en su propio proceso (node --test), con una base SQLite
 * temporal (DB_FILE) sembrada con la semilla demo y con `next/headers` / `next/cache` simulados para poder
 * ejecutar funciones de servidor y server actions fuera de Next.
 * IMPORTANTE: los módulos de src/ se importan DESPUÉS de setupDb() (import dinámico), para que tomen la base
 * temporal y las simulaciones.
 */
import { mock } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ctx = { token: "", headers: new Headers({ "user-agent": "pruebas-automaticas", "x-forwarded-for": "127.0.0.1" }) };

const cookieStore = {
  get: (k: string) => (k === "sid" && ctx.token ? { name: "sid", value: ctx.token } : undefined),
  set: (k: string, v: string) => { if (k === "sid") ctx.token = v; },
  delete: (k: string) => { if (k === "sid") ctx.token = ""; },
  has: (k: string) => k === "sid" && !!ctx.token,
  getAll: () => (ctx.token ? [{ name: "sid", value: ctx.token }] : []),
};

let dir = "";
export async function setupDb() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "fomento-test-"));
  process.env.DB_FILE = path.join(dir, "prueba.db");
  process.env.JOBS_DISABLED = "1";
  process.env.DEMO_HISTORY = "0"; // las pruebas usan solo la semilla base, sin el historial de demostración
  process.env.DEMO_MODE = "1";
  mock.module("next/headers", { exports: { cookies: async () => cookieStore, headers: async () => ctx.headers } });
  mock.module("next/cache", { exports: { revalidatePath: () => {}, revalidateTag: () => {} } });
  const { ensureSeed } = await import("@/lib/seed");
  ensureSeed();
}

export function cleanupDb() {
  try { (globalThis as any).__db?.close(); } catch {}
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

/** Usuario demo (con sus permisos) por correo. */
export async function demoUser(email: string) {
  const { get } = await import("@/lib/db");
  const { loadUser } = await import("@/lib/auth");
  const row = get<any>("SELECT id FROM users WHERE email=?", email);
  if (!row) throw new Error(`No existe el usuario demo ${email}`);
  return loadUser(row.id)!;
}

/** Abre una sesión web para el usuario (como si hubiera ingresado) y la deja activa en la cookie simulada. */
export async function loginAs(email: string) {
  const { get, run, now } = await import("@/lib/db");
  const u = get<any>("SELECT id FROM users WHERE email=?", email);
  const token = "prueba-" + Math.random().toString(36).slice(2);
  run("INSERT INTO sessions(token,user_id,created_at,last_seen) VALUES(?,?,?,?)", token, u.id, now(), now());
  ctx.token = token;
  return token;
}

/** Ejecuta una server action y devuelve la URL a la que redirige (redirect() de Next lanza NEXT_REDIRECT). */
export async function redirectOf(fn: () => Promise<any>): Promise<string> {
  try {
    await fn();
  } catch (e: any) {
    const d = String(e?.digest || "");
    if (d.startsWith("NEXT_REDIRECT")) return decodeURIComponent(d.split(";")[2] || "");
    throw e;
  }
  throw new Error("La acción no redirigió");
}

export const form = (o: Record<string, any>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x as any);
  return fd;
};
