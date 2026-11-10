import { apiRoute } from "@/lib/api-auth";
import { Q } from "../q";

export const dynamic = "force-dynamic";

/** GET /api/v1/servicios — filtros: programa, aliado_id, tipo, activo (0/1). */
export const GET = apiRoute("servicios.read", (req, c) => {
  const q = new Q(new URL(req.url)).eq("programa", "s.program_id", true).eq("aliado_id", "s.aliado_id", true).eq("tipo", "s.kind").eq("activo", "s.active", true);
  if (c.program_id) q.add("s.program_id=?", c.program_id);
  return q.page(
    `s.id, s.name nombre, s.kind tipo, s.program_id programa_id, p.name programa, s.aliado_id, a.name aliado, s.hours horas, s.sessions sesiones, s.indicators indicadores,
     s.internal_cost costo_interno, s.active activo,
     (SELECT COUNT(*) FROM referrals r WHERE r.servicio_id=s.id) remisiones`,
    "FROM servicios s LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN aliados a ON a.id=s.aliado_id", "s.id");
});
