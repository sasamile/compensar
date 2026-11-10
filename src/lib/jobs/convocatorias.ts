import type { Job } from "./types";
import { all } from "../db";
import { issueForEvent } from "../certificates";

/**
 * Emisión AUTOMÁTICA de certificados (RF-CON-15): cuando un evento con «Certificados automáticos» (certs_auto=1)
 * ya terminó (end_at pasado), emite el certificado PDF firmado a cada inscrito que cumple la asistencia mínima y
 * le envía el correo (plantilla «certificado») con el enlace de descarga. Revisa los eventos terminados en los
 * últimos 60 días, para que la asistencia cargada después del evento (p. ej. el reporte de Teams) también genere
 * su certificado. Es idempotente: nunca emite dos certificados para la misma inscripción.
 */
export async function autoCertificates(): Promise<string> {
  const t = Date.now();
  const events = all<any>(`SELECT id FROM events WHERE certs_auto=1 AND active=1 AND status IN ('publicado','cerrado')
    AND end_at IS NOT NULL AND end_at<? AND end_at>? ORDER BY end_at`, new Date(t).toISOString(), new Date(t - 60 * 86400000).toISOString());
  let issued = 0, pending = 0, withCerts = 0;
  for (const ev of events) {
    const r = await issueForEvent(ev.id, null);
    issued += r.issued; pending += r.pending;
    if (r.issued) withCerts++;
  }
  return `${events.length} evento(s) terminados revisados · ${issued} certificado(s) emitidos en ${withCerts} evento(s) · ${pending} inscrito(s) sin asistencia mínima`;
}

export const jobs: Job[] = [
  { name: "certificados_automaticos", everyMs: 10 * 60 * 1000, run: autoCertificates },
];
