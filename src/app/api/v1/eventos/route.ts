import { apiRoute } from "@/lib/api-auth";
import { Q } from "../q";

export const dynamic = "force-dynamic";

/** GET /api/v1/eventos — filtros: estado, programa, tipo, modalidad, desde, hasta (fecha de inicio). */
export const GET = apiRoute("eventos.read", (req, c) => {
  const q = new Q(new URL(req.url)).eq("estado", "e.status").eq("programa", "e.program_id", true).eq("tipo", "e.type").eq("modalidad", "e.modality")
    .gte("desde", "e.start_at").lte("hasta", "e.start_at");
  if (c.program_id) q.add("e.program_id=?", c.program_id);
  return q.page(
    `e.id, e.title titulo, e.type tipo, e.modality modalidad, e.status estado, e.active activo, e.program_id programa_id, e.place lugar, e.start_at inicio, e.end_at fin,
     e.capacity cupo, e.min_attendance asistencia_minima, e.reminders recordatorios, e.slug,
     (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.waitlist=0) inscritos,
     (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.waitlist=1) lista_espera,
     (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.attended=1) asistentes`,
    "FROM events e", "e.start_at DESC, e.id DESC");
});
