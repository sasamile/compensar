import { can, type User } from "./auth";

/** RN-03: quién puede asignar qué rol. Devuelve el alcance permitido o null. */
export function delegation(u: User, roleKey: string): { scope_type: string; scope_id: number | null; aliado_id?: number | null; company_id?: number | null } | "admin" | null {
  if (can(u, "users.manage")) return "admin";
  if (can(u, "users.manage.mentors") && roleKey === "mentor") return { scope_type: "assigned", scope_id: null };
  if (can(u, "users.manage.aliado") && roleKey === "mentor" && u.aliado_id) return { scope_type: "assigned", scope_id: null, aliado_id: u.aliado_id };
  if (can(u, "company.manage_collab") && u.is_principal && roleKey === "colaborador" && u.company_id) return { scope_type: "company", scope_id: u.company_id, company_id: u.company_id };
  return null;
}

