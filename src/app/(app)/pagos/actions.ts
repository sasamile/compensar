"use server";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { aliadoReport, saved } from "@/lib/payments";

export async function approvePayment(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "payments.approve");
  const aliadoId = Number(fd.get("aliado_id")), period = String(fd.get("period"));
  const url = (k: string, m: string) => redirect(`/pagos?aliado=${aliadoId}&period=${period}&${k}=${encodeURIComponent(m)}`);
  const rep = aliadoReport(aliadoId, period);
  if (!rep.totalSessions) url("error", "No hay sesiones aceptadas en el periodo");
  // RN-05: quien registró las horas no aprueba el pago
  if (rep.registrars.includes(u.id)) url("error", "Separación de funciones: registraste horas de este reporte, no puedes aprobar su pago");
  // RN-05: quien aprobó el cierre de ese servicio no aprueba el pago del mismo servicio
  for (const rid of rep.referralIds) {
    const cl = get<any>("SELECT 1 x FROM closures WHERE referral_id=? AND approved_by=?", rid, u.id);
    if (cl) url("error", "Separación de funciones: aprobaste el cierre de uno de estos servicios, no puedes aprobar su pago");
  }
  if (saved(aliadoId, period)?.status === "aprobado") url("error", "El reporte de este periodo ya fue aprobado");
  const id = insert(`INSERT INTO payment_reports(aliado_id,period,status,total_sessions,total_hours,total_cost,approved_by,approved_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(aliado_id,period) DO UPDATE SET status='aprobado', total_sessions=excluded.total_sessions, total_hours=excluded.total_hours, total_cost=excluded.total_cost, approved_by=excluded.approved_by, approved_at=excluded.approved_at`,
    aliadoId, period, "aprobado", rep.totalSessions, rep.totalHours, rep.totalCost, u.id, now(), u.id, now());
  await audit(u, "aprobar_pago", "payment_report", id, null, { aliadoId, period, sesiones: rep.totalSessions, horas: rep.totalHours, costo: rep.totalCost });
  url("ok", "Reporte aprobado como soporte de pago al proveedor");
}
