"use server";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { can, requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dataset, specFromParams, specToParams } from "@/lib/datasets";
import { newWidgetId, specToSaved, type Widget } from "@/lib/analytics";
import { jparse } from "@/lib/util";

const go = (q: string, kind: "ok" | "error", m: string) => redirect(`/analitica/consultas?${q ? q + "&" : ""}${kind}=${encodeURIComponent(m)}`);

export async function saveQuery(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const q = String(fd.get("q") || "");
  const name = String(fd.get("name") || "").trim().slice(0, 120);
  const spec = specFromParams(new URLSearchParams(q));
  const ds = dataset(spec.source);
  if (!ds || !ds.allow(u)) go(q, "error", "Elige una fuente de datos válida");
  if (!name) go(q, "error", "Escribe un nombre para la consulta");
  const s = specToSaved(spec);
  const id = insert("INSERT INTO saved_reports(user_id,name,source,columns,filters,created_at) VALUES(?,?,?,?,?,?)", u.id, name, s.source, s.columns, s.filters, now());
  await audit(u, "guardar_consulta", "saved_report", id, null, { name, ...s });
  redirect(`/analitica/consultas?${specToParams(spec).toString()}&guardada=${id}&ok=${encodeURIComponent(`Consulta «${name}» guardada`)}`);
}

export async function deleteQuery(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const id = Number(fd.get("id"));
  const r = get<any>("SELECT * FROM saved_reports WHERE id=?", id);
  if (!r || (r.user_id !== u.id && !can(u, "config.manage"))) go("", "error", "Consulta no disponible");
  run("DELETE FROM saved_reports WHERE id=?", id);
  await audit(u, "eliminar_consulta", "saved_report", id, r, null);
  go("", "ok", "Consulta eliminada");
}

/** Lleva la consulta actual como widget a un tablero propio (FUN-97). */
export async function addToDashboard(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "dashboards.manage");
  const q = String(fd.get("q") || "");
  const spec = specFromParams(new URLSearchParams(q));
  const d = get<any>("SELECT * FROM dashboards WHERE id=?", Number(fd.get("dashboard_id")));
  if (!d || d.user_id !== u.id) go(q, "error", "Elige uno de tus tableros");
  const ds = dataset(spec.source);
  if (!ds || !ds.allow(u)) go(q, "error", "Fuente no válida");
  const type = String(fd.get("type") || (spec.groupBy ? "bar" : "table")) as Widget["type"];
  const w: Widget = {
    id: newWidgetId(), type, title: String(fd.get("title") || "").trim().slice(0, 80) || ds!.name, source: spec.source, filters: spec.filters,
    ...(type === "table" ? { columns: spec.columns, limit: Math.min(spec.limit || 10, 50) } : { agg: spec.agg || "count", measure: spec.measure, groupBy: spec.groupBy }),
    span: type === "kpi" ? 1 : type === "table" ? 3 : 1,
  };
  const widgets = jparse<Widget[]>(d.widgets, []);
  widgets.push(w);
  run("UPDATE dashboards SET widgets=?, updated_at=? WHERE id=?", JSON.stringify(widgets), now(), d.id);
  await audit(u, "agregar_widget", "dashboard", d.id, null, w);
  redirect(`/analitica/tableros/${d.id}?ok=${encodeURIComponent("Widget agregado al tablero")}`);
}
