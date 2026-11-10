import { apiRoute } from "@/lib/api-auth";
import { Q } from "../q";

export const dynamic = "force-dynamic";

/** GET /api/v1/sesiones — filtros: empresa_id, mentor_id, estado, aceptada (0/1), desde, hasta (fecha programada). */
export const GET = apiRoute("sesiones.read", (req, c) => {
  const url = new URL(req.url);
  const q = new Q(url).eq("empresa_id", "s.company_id", true).eq("mentor_id", "s.mentor_id", true).eq("estado", "s.status")
    .gte("desde", "s.scheduled_at").lte("hasta", "s.scheduled_at");
  const ac = q.p("aceptada");
  if (ac !== null) q.add(ac === "1" ? "s.accepted_at IS NOT NULL" : "s.accepted_at IS NULL");
  if (c.program_id) q.add("s.program_id=?", c.program_id);
  return q.page(
    `s.id, s.company_id empresa_id, co.razon_social empresa, s.mentor_id, u.name mentor, s.referral_id remision_id, s.program_id programa_id, s.title titulo,
     s.scheduled_at programada_at, s.duration_min duracion_min, s.modality modalidad, s.status estado, s.hours horas, s.accepted_at aceptada_at, s.created_at creada_at`,
    "FROM mentoring_sessions s LEFT JOIN companies co ON co.id=s.company_id LEFT JOIN users u ON u.id=s.mentor_id", "s.scheduled_at DESC, s.id DESC");
});
