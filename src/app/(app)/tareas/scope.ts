import { all, get } from "@/lib/db";
import { companyFilter, programScope, type User } from "@/lib/auth";

/** Tareas visibles: las propias (creadas o asignadas), las de empresas del alcance y las del programa del usuario. */
export function taskFilter(u: User, alias = "t"): { sql: string; params: any[] } {
  const ps = programScope(u, "tasks.manage");
  if (ps === null) return { sql: "1=1", params: [] };
  const cf = companyFilter(u, "c");
  const parts = [`${alias}.created_by=?`, `${alias}.assignee_id=?`, `${alias}.company_id IN (SELECT c.id FROM companies c WHERE ${cf.sql})`];
  const params: any[] = [u.id, u.id, ...cf.params];
  if (ps.length) { parts.push(`(${alias}.company_id IS NULL AND ${alias}.program_id IN (${ps.map(() => "?").join(",")}))`); params.push(...ps); }
  return { sql: "(" + parts.join(" OR ") + ")", params };
}

export function visibleTask(u: User, id: number) {
  const f = taskFilter(u);
  return get<any>(`SELECT t.* FROM tasks t WHERE t.id=? AND ${f.sql}`, id, ...f.params);
}

/** Posibles responsables: usuarios activos con permiso de tareas (el coordinador de aliado, solo los de su aliado). */
export function assignees(u: User) {
  const rows = all<any>(`SELECT DISTINCT us.id, us.name, us.aliado_id, r.name role FROM users us JOIN user_roles ur ON ur.user_id=us.id JOIN roles r ON r.id=ur.role_id
    WHERE us.status='activo' AND us.company_id IS NULL AND (r.perms LIKE '%"tasks.manage"%' OR r.perms LIKE '%"*"%') ORDER BY us.name`);
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return !u.aliado_id || r.aliado_id === u.aliado_id || r.id === u.id;
  });
}
