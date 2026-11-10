import { apiRoute } from "@/lib/api-auth";
import { Q } from "../q";

export const dynamic = "force-dynamic";

/** GET /api/v1/empresas — filtros: estado, programa, nit, q, sector, ciudad, desde, hasta (creación). */
export const GET = apiRoute("empresas.read", (req, c) => {
  const q = new Q(new URL(req.url)).eq("estado", "c.status").eq("programa", "c.program_id", true).eq("nit", "c.nit").like("q", "c.razon_social")
    .eq("sector", "c.sector").eq("ciudad", "c.city").gte("desde", "c.created_at").lte("hasta", "c.created_at");
  if (c.program_id) q.add("c.program_id=?", c.program_id);
  return q.page(
    "c.id, c.razon_social, c.nit, c.dv, c.sector, c.size tamano, c.city ciudad, c.program_id programa_id, p.name programa, c.status estado, c.source origen, c.onboarding_done primer_ingreso_completo, c.consent_at autorizacion_datos_at, c.created_at creada_at",
    "FROM companies c LEFT JOIN programs p ON p.id=c.program_id", "c.id");
});
