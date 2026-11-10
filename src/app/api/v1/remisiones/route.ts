import { apiRoute } from "@/lib/api-auth";
import { Q } from "../q";

export const dynamic = "force-dynamic";

/** GET /api/v1/remisiones — filtros: estado, aliado_id, empresa_id, servicio_id, desde, hasta. */
export const GET = apiRoute("remisiones.read", (req, c) => {
  const q = new Q(new URL(req.url)).eq("estado", "r.status").eq("aliado_id", "r.aliado_id", true).eq("empresa_id", "r.company_id", true)
    .eq("servicio_id", "r.servicio_id", true).gte("desde", "r.created_at").lte("hasta", "r.created_at");
  if (c.program_id) q.add("co.program_id=?", c.program_id);
  return q.page(
    `r.id, r.company_id empresa_id, co.razon_social empresa, r.servicio_id, s.name servicio, r.aliado_id, a.name aliado, r.mentor_id, r.status estado,
     r.accepted_at aceptada_at, r.created_at creada_at, r.closed_at cerrada_at,
     (SELECT COUNT(*) FROM mentoring_sessions m WHERE m.referral_id=r.id) sesiones,
     (SELECT COALESCE(SUM(m.hours),0) FROM mentoring_sessions m WHERE m.referral_id=r.id AND m.accepted_at IS NOT NULL) horas_aceptadas`,
    "FROM referrals r LEFT JOIN companies co ON co.id=r.company_id LEFT JOIN servicios s ON s.id=r.servicio_id LEFT JOIN aliados a ON a.id=r.aliado_id", "r.id");
});
