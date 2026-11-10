import { all, get } from "@/lib/db";
import { pageBody, paging } from "@/lib/api-auth";

/** Constructor de consultas filtradas y paginadas para la API v1 (siempre parametrizadas). */
export class Q {
  where: string[] = [];
  params: any[] = [];
  constructor(public url: URL) {}
  p(name: string) { const v = this.url.searchParams.get(name); return v === null || v === "" ? null : v; }
  eq(param: string, col: string, num = false) {
    const v = this.p(param);
    if (v !== null) { this.where.push(`${col}=?`); this.params.push(num ? Number(v) : v); }
    return this;
  }
  gte(param: string, col: string) { const v = this.p(param); if (v !== null) { this.where.push(`${col}>=?`); this.params.push(v); } return this; }
  lte(param: string, col: string) { const v = this.p(param); if (v !== null) { this.where.push(`${col}<=?`); this.params.push(v.length === 10 ? v + "T23:59:59.999Z" : v); } return this; }
  like(param: string, col: string) { const v = this.p(param); if (v !== null) { this.where.push(`${col} LIKE ?`); this.params.push(`%${v}%`); } return this; }
  add(sql: string, ...p: any[]) { this.where.push(sql); this.params.push(...p); return this; }
  sql() { return this.where.length ? "WHERE " + this.where.join(" AND ") : ""; }
  /** Ejecuta SELECT {cols} {from} con filtros, orden y página; devuelve el cuerpo JSON estándar. */
  page(cols: string, from: string, order: string, map: (r: any) => any = (r) => r) {
    const { page, perPage, offset } = paging(this.url);
    const total = get<any>(`SELECT COUNT(*) n ${from} ${this.sql()}`, ...this.params).n;
    const rows = all<any>(`SELECT ${cols} ${from} ${this.sql()} ORDER BY ${order} LIMIT ? OFFSET ?`, ...this.params, perPage, offset);
    return Response.json(pageBody(this.url, rows.map(map), total, page, perPage), { headers: { "Cache-Control": "no-store" } });
  }
}
