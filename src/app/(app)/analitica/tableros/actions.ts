"use server";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { can, requirePerm, requireUser, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { AGGS, OPS, dataset, type Agg, type Filter, type Op } from "@/lib/datasets";
import { DASHBOARD_PRESETS, WIDGET_TYPES, newWidgetId, type Widget, type WidgetType } from "@/lib/analytics";
import { jparse } from "@/lib/util";

const back = (path: string, kind: "ok" | "error", m: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(m)}`);

async function ownDashboard(fd: FormData): Promise<{ u: User; d: any }> {
  const u = await requireUser();
  requirePerm(u, "dashboards.manage");
  const d = get<any>("SELECT * FROM dashboards WHERE id=?", Number(fd.get("id")));
  if (!d || (d.user_id !== u.id && !can(u, "config.manage"))) back("/analitica/tableros", "error", "Solo el dueño puede modificar el tablero");
  return { u, d };
}
const saveWidgets = (id: number, ws: Widget[]) => run("UPDATE dashboards SET widgets=?, updated_at=? WHERE id=?", JSON.stringify(ws), now(), id);

export async function createDashboard(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "dashboards.manage");
  const preset = DASHBOARD_PRESETS[String(fd.get("preset") || "")];
  const name = String(fd.get("name") || "").trim().slice(0, 100) || preset?.name || "";
  if (!name) back("/analitica/tableros", "error", "Escribe un nombre para el tablero");
  const widgets = preset ? preset.widgets() : [];
  const id = insert("INSERT INTO dashboards(user_id,name,widgets,shared,created_at,updated_at) VALUES(?,?,?,?,?,?)", u.id, name, JSON.stringify(widgets), fd.get("shared") ? 1 : 0, now(), now());
  await audit(u, "crear_tablero", "dashboard", id, null, { name, preset: fd.get("preset") || null, widgets: widgets.length });
  redirect(`/analitica/tableros/${id}?editar=1&ok=${encodeURIComponent("Tablero creado. Agrega o ajusta sus widgets.")}`);
}

export async function duplicateDashboard(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "dashboards.manage");
  const d = get<any>("SELECT * FROM dashboards WHERE id=?", Number(fd.get("id")));
  if (!d || (d.user_id !== u.id && !d.shared)) back("/analitica/tableros", "error", "Tablero no disponible");
  const ws = jparse<Widget[]>(d.widgets, []).map((w) => ({ ...w, id: newWidgetId() }));
  const id = insert("INSERT INTO dashboards(user_id,name,widgets,shared,created_at,updated_at) VALUES(?,?,?,0,?,?)", u.id, `${d.name} (copia)`, JSON.stringify(ws), now(), now());
  await audit(u, "duplicar_tablero", "dashboard", id, null, { from: d.id });
  redirect(`/analitica/tableros/${id}?editar=1&ok=${encodeURIComponent("Copia creada en tus tableros")}`);
}

export async function updateDashboard(fd: FormData) {
  const { u, d } = await ownDashboard(fd);
  const name = String(fd.get("name") || "").trim().slice(0, 100) || d.name;
  const shared = fd.get("shared") ? 1 : 0;
  run("UPDATE dashboards SET name=?, shared=?, updated_at=? WHERE id=?", name, shared, now(), d.id);
  await audit(u, "editar_tablero", "dashboard", d.id, { name: d.name, shared: d.shared }, { name, shared });
  back(`/analitica/tableros/${d.id}?editar=1`, "ok", shared ? "Tablero guardado y compartido con los usuarios de analítica" : "Tablero guardado (privado)");
}

export async function deleteDashboard(fd: FormData) {
  const { u, d } = await ownDashboard(fd);
  run("DELETE FROM dashboards WHERE id=?", d.id);
  await audit(u, "eliminar_tablero", "dashboard", d.id, { name: d.name, widgets: d.widgets }, null);
  back("/analitica/tableros", "ok", `Tablero «${d.name}» eliminado`);
}

export async function addWidget(fd: FormData) {
  const { u, d } = await ownDashboard(fd);
  const path = `/analitica/tableros/${d.id}?editar=1`;
  const ds = dataset(String(fd.get("source") || ""));
  if (!ds || !ds.allow(u)) back(path, "error", "Elige una fuente de datos válida");
  const type = String(fd.get("type")) as WidgetType;
  if (!WIDGET_TYPES.some(([k]) => k === type)) back(path, "error", "Tipo de widget no válido");
  const colOk = (k: any) => !!k && ds!.cols.some((c) => c.key === k);
  const agg = (AGGS.find(([a]) => a === fd.get("agg"))?.[0] || "count") as Agg;
  const measure = colOk(fd.get("measure")) ? String(fd.get("measure")) : null;
  if (agg !== "count" && !measure) back(path, "error", "Para suma, promedio, mínimo, máximo o distintos elige la columna a medir");
  const groupBy = colOk(fd.get("groupBy")) ? String(fd.get("groupBy")) : null;
  if ((type === "bar" || type === "hbar" || type === "donut") && !groupBy) back(path, "error", "Este tipo de gráfico necesita «Agrupar por»");
  const filters: Filter[] = [];
  for (const i of [1, 2]) {
    const col = fd.get(`f${i}`), op = String(fd.get(`op${i}`)) as Op;
    if (colOk(col) && OPS.some(([o]) => o === op)) filters.push({ col: String(col), op, value: String(fd.get(`v${i}`) || "") });
  }
  const columns = fd.getAll("columns").map(String).filter(colOk);
  const span = Math.min(3, Math.max(1, Number(fd.get("span")) || (type === "table" ? 3 : 1))) as 1 | 2 | 3;
  const w: Widget = { id: newWidgetId(), type, title: String(fd.get("title") || "").trim().slice(0, 80) || ds!.name, source: ds!.key, agg, measure, groupBy, filters,
    columns: type === "table" ? columns : undefined, limit: Math.min(50, Math.max(1, Number(fd.get("limit")) || (type === "table" ? 10 : 12))), span };
  const ws = jparse<Widget[]>(d.widgets, []);
  ws.push(w);
  saveWidgets(d.id, ws);
  await audit(u, "agregar_widget", "dashboard", d.id, null, w);
  back(path, "ok", `Widget «${w.title}» agregado`);
}

export async function widgetAction(fd: FormData) {
  const { u, d } = await ownDashboard(fd);
  const path = `/analitica/tableros/${d.id}?editar=1`;
  const ws = jparse<Widget[]>(d.widgets, []);
  const i = ws.findIndex((w) => w.id === fd.get("wid"));
  if (i < 0) back(path, "error", "Widget no encontrado");
  const op = String(fd.get("op"));
  const before = ws[i];
  if (op === "up" && i > 0) [ws[i - 1], ws[i]] = [ws[i], ws[i - 1]];
  else if (op === "down" && i < ws.length - 1) [ws[i + 1], ws[i]] = [ws[i], ws[i + 1]];
  else if (op === "span") ws[i] = { ...ws[i], span: (((ws[i].span || 1) % 3) + 1) as 1 | 2 | 3 };
  else if (op === "delete") ws.splice(i, 1);
  else if (op === "rename") ws[i] = { ...ws[i], title: String(fd.get("title") || "").trim().slice(0, 80) || ws[i].title };
  saveWidgets(d.id, ws);
  await audit(u, `widget_${op}`, "dashboard", d.id, before, op === "delete" ? null : ws.find((w) => w.id === before.id));
  redirect(`${path}#w-${before.id}`);
}
