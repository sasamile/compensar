import { all, get } from "@/lib/db";
import { apiError, apiRoute, hasPii, maskEmail, maskPhone } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** GET /api/v1/empresas/{id} — detalle con contactos, mentores y totales. */
export const GET = apiRoute("empresas.read", (_req, c, params) => {
  const id = Number(params.id);
  const e = get<any>(`SELECT c.id, c.razon_social, c.nit, c.dv, c.sector, c.size tamano, c.city ciudad, c.program_id programa_id, p.name programa, c.status estado,
    c.value_prop propuesta_valor, c.source origen, c.onboarding_done primer_ingreso_completo, c.consent_at autorizacion_datos_at, c.created_at creada_at
    FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?`, id);
  if (!e || (c.program_id && e.programa_id !== c.program_id)) return apiError(404, "not_found", "Empresa no encontrada");
  const pii = hasPii(c);
  const contactos = all<any>("SELECT id, name nombre, email, phone celular, is_principal principal, status estado FROM users WHERE company_id=?", id)
    .map((u) => ({ ...u, email: pii ? u.email : maskEmail(u.email), celular: pii ? u.celular : maskPhone(u.celular) }));
  const mentores = all<any>("SELECT u.id, u.name nombre, a.from_at desde, a.active activo FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=?", id);
  const n = (sql: string) => get<any>(sql, id).n;
  return Response.json({
    data: {
      ...e, contactos, mentores,
      totales: {
        inscripciones: n("SELECT COUNT(*) n FROM registrations WHERE company_id=?"),
        asistencias: n("SELECT COUNT(*) n FROM registrations WHERE company_id=? AND attended=1"),
        sesiones: n("SELECT COUNT(*) n FROM mentoring_sessions WHERE company_id=?"),
        sesiones_aceptadas: n("SELECT COUNT(*) n FROM mentoring_sessions WHERE company_id=? AND accepted_at IS NOT NULL"),
        remisiones: n("SELECT COUNT(*) n FROM referrals WHERE company_id=?"),
      },
    },
  }, { headers: { "Cache-Control": "no-store" } });
});
