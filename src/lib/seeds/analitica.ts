import { get, insert, now } from "../db";
import { DASHBOARD_PRESETS, specToSaved } from "../analytics";

/** Datos de demostración del módulo analítica (idempotente): un tablero de ejemplo y una consulta guardada para admin. */
export function seed() {
  const admin = get<any>("SELECT id FROM users WHERE email='admin@compensar.test'");
  if (!admin) return;
  const ts = now();
  if (!get("SELECT 1 FROM dashboards WHERE user_id=? AND name=?", admin.id, "Tablero operativo (ejemplo)"))
    insert("INSERT INTO dashboards(user_id,name,widgets,shared,created_at,updated_at) VALUES(?,?,?,1,?,?)",
      admin.id, "Tablero operativo (ejemplo)", JSON.stringify(DASHBOARD_PRESETS.operativo.widgets()), ts, ts);
  if (!get("SELECT 1 FROM saved_reports WHERE user_id=? AND name=?", admin.id, "Empresas activas por sector")) {
    const s = specToSaved({ source: "empresas", filters: [{ col: "estado", op: "eq", value: "activa" }], groupBy: "sector", agg: "count" });
    insert("INSERT INTO saved_reports(user_id,name,source,columns,filters,created_at) VALUES(?,?,?,?,?,?)", admin.id, "Empresas activas por sector", s.source, s.columns, s.filters, ts);
  }
}
