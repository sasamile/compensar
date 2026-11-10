import { companyFilter, type User } from "@/lib/auth";

/** Alertas visibles: las de empresas del alcance del usuario y las que tiene como responsable. */
export function alertFilter(u: User, alias = "a"): { sql: string; params: any[] } {
  const cf = companyFilter(u, "c");
  if (cf.sql === "1=1") return { sql: "1=1", params: [] };
  return { sql: `(${alias}.company_id IN (SELECT c.id FROM companies c WHERE ${cf.sql}) OR ${alias}.owner_id=?)`, params: [...cf.params, u.id] };
}
