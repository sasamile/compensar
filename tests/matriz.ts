/**
 * Matriz rol × permiso (RF-ACC-07 y criterio global §9).
 * Se calcula desde la semilla (src/lib/seed.ts → tabla roles de una base recién sembrada) evaluando cada permiso
 * del catálogo (src/lib/perms.ts, más cada reporte report:R-xx y cualquier permiso que un rol use fuera del
 * catálogo) con la misma función can() que usa la aplicación. Así cubre también los comodines (`*`, `report:*`).
 */
import fs from "node:fs";
import path from "node:path";

export const APPROVED_FILE = path.join(process.cwd(), "docs", "matriz-permisos-aprobada.json");

export type Matrix = { permisos: string[]; roles: Record<string, { nombre: string; permisos: Record<string, "sí" | "no"> }> };

export async function computeMatrix(): Promise<Matrix> {
  const { all } = await import("@/lib/db");
  const { can } = await import("@/lib/auth");
  const { PERM_CATALOG, REPORTS } = await import("@/lib/perms");
  const { jparse } = await import("@/lib/util");
  const roles = all<any>("SELECT key, name, perms, internal FROM roles WHERE system=1 ORDER BY id");
  const base = [...PERM_CATALOG.map(([k]) => k), ...REPORTS.map(([id]) => `report:${id}`)];
  const extra = new Set<string>();
  for (const r of roles) for (const p of jparse<string[]>(r.perms, [])) if (p !== "*" && !base.includes(p)) extra.add(p);
  const permisos = [...base, ...[...extra].sort()];
  const out: Matrix = { permisos, roles: {} };
  for (const r of roles) {
    const u: any = { id: 0, grants: [{ role_key: r.key, role_name: r.name, perms: jparse<string[]>(r.perms, []), scope_type: "org", scope_id: null }] };
    out.roles[r.key] = { nombre: r.name, permisos: Object.fromEntries(permisos.map((p) => [p, can(u, p) ? "sí" : "no"])) as any };
  }
  return out;
}

/** Diferencias legibles entre la matriz aprobada y la actual (vacío = idénticas). */
export function diffMatrix(aprobada: Matrix, actual: Matrix): string[] {
  const d: string[] = [];
  for (const p of actual.permisos) if (!aprobada.permisos.includes(p)) d.push(`Permiso nuevo sin aprobar en el catálogo: ${p}`);
  for (const p of aprobada.permisos) if (!actual.permisos.includes(p)) d.push(`Permiso aprobado que ya no existe: ${p}`);
  for (const k of Object.keys(actual.roles)) if (!aprobada.roles[k]) d.push(`Rol nuevo sin aprobar: ${k} (${actual.roles[k].nombre})`);
  for (const k of Object.keys(aprobada.roles)) if (!actual.roles[k]) d.push(`Rol aprobado que ya no existe: ${k} (${aprobada.roles[k].nombre})`);
  for (const [k, r] of Object.entries(actual.roles)) {
    const a = aprobada.roles[k];
    if (!a) continue;
    for (const p of actual.permisos) {
      if (!aprobada.permisos.includes(p)) continue;
      const was = a.permisos[p] ?? "no", now = r.permisos[p];
      if (was !== now) d.push(`Rol ${k} (${r.nombre}) · permiso ${p}: aprobado «${was}» → actual «${now}»`);
    }
  }
  return d;
}

export function readApproved(): (Matrix & { aprobado_en?: string }) | null {
  if (!fs.existsSync(APPROVED_FILE)) return null;
  return JSON.parse(fs.readFileSync(APPROVED_FILE, "utf8"));
}

export function writeApproved(m: Matrix) {
  const prev = readApproved();
  const same = prev && diffMatrix(prev, m).length === 0;
  const doc = {
    requisito: "RF-ACC-07 y ERS §9: una prueba automática recorre todas las combinaciones rol-permiso y falla si alguna cambia sin aprobación",
    fuente: "Roles del sistema sembrados por src/lib/seed.ts, evaluados con can() de src/lib/auth.ts sobre el catálogo de src/lib/perms.ts (incluye report:R-xx)",
    como_aprobar: "Revisar el cambio, ejecutar `npm run aprobar-permisos` y confirmar este archivo en Git (el commit es la aprobación)",
    aprobado_en: same && prev?.aprobado_en ? prev.aprobado_en : new Date().toISOString(),
    total_combinaciones: Object.keys(m.roles).length * m.permisos.length,
    permisos: m.permisos,
    roles: m.roles,
  };
  fs.writeFileSync(APPROVED_FILE, JSON.stringify(doc, null, 2) + "\n");
  return { changed: !same, diff: prev ? diffMatrix(prev, m) : ["(no existía matriz aprobada)"] };
}
