import { all, get } from "./db";

/** Servicios prestados por aliado en un periodo (YYYY-MM). Solo cuentan las sesiones ACEPTADAS por la empresa. */
export function aliadoReport(aliadoId: number, period: string) {
  const from = new Date(`${period}-01T00:00:00-05:00`);
  const to = new Date(from); to.setMonth(to.getMonth() + 1);
  const rows = all<any>(
    `SELECT s.id, s.title, s.scheduled_at, s.hours, s.accepted_at, s.accepted_ip, s.registered_by, c.razon_social, c.nit, sv.name service, sv.internal_cost, sv.hours planned_hours,
            m.name mentor, a.name aliado, ab.name accepter, r.id referral_id
     FROM mentoring_sessions s JOIN referrals r ON r.id=s.referral_id JOIN servicios sv ON sv.id=r.servicio_id JOIN companies c ON c.id=s.company_id
       JOIN aliados a ON a.id=r.aliado_id LEFT JOIN users m ON m.id=s.mentor_id LEFT JOIN users ab ON ab.id=s.accepted_by
     WHERE r.aliado_id=? AND s.status='realizada' AND s.scheduled_at>=? AND s.scheduled_at<? ORDER BY s.scheduled_at`,
    aliadoId, from.toISOString(), to.toISOString());
  const accepted = rows.filter((r) => r.accepted_at);
  const cost = (r: any) => (r.planned_hours ? (r.internal_cost / r.planned_hours) * r.hours : 0);
  return {
    rows: rows.map((r) => ({ ...r, cuenta: r.accepted_at ? "Sí" : "No (sin aceptación)", costo: r.accepted_at ? Math.round(cost(r)) : 0 })),
    totalSessions: accepted.length,
    totalHours: accepted.reduce((a, r) => a + (r.hours || 0), 0),
    totalCost: Math.round(accepted.reduce((a, r) => a + cost(r), 0)),
    registrars: Array.from(new Set(rows.map((r) => r.registered_by))).filter(Boolean) as number[],
    referralIds: Array.from(new Set(rows.map((r) => r.referral_id))),
  };
}
export const saved = (aliadoId: number, period: string) => get<any>("SELECT * FROM payment_reports WHERE aliado_id=? AND period=?", aliadoId, period);
