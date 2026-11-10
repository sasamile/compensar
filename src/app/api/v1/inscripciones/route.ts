import { apiRoute, hasPii, maskEmail, maskPhone } from "@/lib/api-auth";
import { Q } from "../q";

export const dynamic = "force-dynamic";

/** GET /api/v1/inscripciones — filtros: evento_id, empresa_id, estado, asistio (0/1), desde, hasta. Datos personales solo con pii.read. */
export const GET = apiRoute("inscripciones.read", (req, c) => {
  const pii = hasPii(c);
  const q = new Q(new URL(req.url)).eq("evento_id", "r.event_id", true).eq("empresa_id", "r.company_id", true).eq("estado", "r.status").eq("asistio", "r.attended", true)
    .gte("desde", "r.created_at").lte("hasta", "r.created_at");
  if (c.program_id) q.add("e.program_id=?", c.program_id);
  return q.page(
    `r.id, r.event_id evento_id, e.title evento, r.company_id empresa_id, co.razon_social empresa, co.nit, r.name nombre, r.email, r.phone celular, r.code codigo,
     r.status estado, r.waitlist lista_espera, r.attended asistio, r.minutes minutos, r.attendance_source fuente_asistencia, r.consent_version autorizacion_version,
     r.consent_at autorizacion_at, r.created_at inscrito_at, ce.code certificado, ce.issued_at certificado_at`,
    "FROM registrations r JOIN events e ON e.id=r.event_id LEFT JOIN companies co ON co.id=r.company_id LEFT JOIN certificates ce ON ce.registration_id=r.id",
    "r.id", (r) => (pii ? r : { ...r, email: maskEmail(r.email), celular: maskPhone(r.celular) }));
});
