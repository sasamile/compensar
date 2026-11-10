import { DATASETS } from "@/lib/datasets";
import { biAuth } from "./_auth";

export const dynamic = "force-dynamic";

/** Catálogo de conjuntos de datos disponibles para BI (TEC-94). */
export async function GET(req: Request) {
  const who = await biAuth(req);
  if ("error" in who) return Response.json({ error: who.error }, { status: who.status });
  const origin = new URL(req.url).origin;
  const list = DATASETS.filter((d) => (who.kind === "token" ? d.bi !== false : d.allow(who.u)));
  return Response.json({
    descripcion: "Vistas de solo lectura de la Plataforma de Fomento Empresarial para Power BI / Tableau",
    autenticacion: who.kind === "token" ? "token" : "sesion",
    value: list.map((d) => ({ conjunto: d.key, nombre: d.name, descripcion: d.description, vista: d.view,
      json: `${origin}/api/bi/${d.key}?format=json`, csv: `${origin}/api/bi/${d.key}?format=csv`,
      columnas: d.cols.map((c) => ({ clave: c.key, nombre: c.label, tipo: c.type })) })),
  });
}
