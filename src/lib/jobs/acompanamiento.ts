import type { Job } from "./types";
import { all, now, run } from "../db";
import { processQueue } from "../resilience";
import { QUEUE_KIND } from "../integrations/m365";
import { notifyParties } from "@/app/(app)/agenda/agenda-lib";

/**
 * Recordatorios de sesiones (RF-ACO-11): 24 h y 1 h antes de cada sesión programada, a mentor y empresa,
 * con la plantilla aprobada «recordatorio_sesion». session_reminder_log (UNIQUE session_id+kind) evita duplicados
 * aunque el job corra varias veces o en varias instancias; al reprogramar se borra el registro de la sesión.
 */
export function runSessionReminders(at = Date.now()) {
  const H = 3600000;
  const rows = all<any>("SELECT * FROM mentoring_sessions WHERE status='programada' AND scheduled_at>? AND scheduled_at<=?",
    new Date(at).toISOString(), new Date(at + 24 * H).toISOString());
  let sent = 0, msgs = 0;
  for (const s of rows) {
    const left = +new Date(s.scheduled_at) - at;
    const kind = left <= H ? "1h" : "24h";
    // se reclama el envío antes de notificar: si otra ejecución ya lo hizo, no se repite
    if (!run("INSERT OR IGNORE INTO session_reminder_log(session_id,kind,sent_at) VALUES(?,?,?)", s.id, kind, now()).changes) continue;
    if (kind === "1h") run("INSERT OR IGNORE INTO session_reminder_log(session_id,kind,sent_at) VALUES(?,?,?)", s.id, "24h", now()); // ya no aplica el de 24 h
    const faltan = kind === "1h" ? (left >= 50 * 60000 ? "1 hora" : `${Math.max(1, Math.round(left / 60000))} minutos`) : `${Math.round(left / H)} horas`;
    msgs += notifyParties("recordatorio_sesion", s, { faltan });
    sent++;
  }
  return { revisadas: rows.length, recordatorios: sent, mensajes: msgs };
}

export const jobs: Job[] = [
  {
    name: "acompanamiento.recordatorios",
    everyMs: 5 * 60 * 1000,
    run: () => {
      const r = runSessionReminders();
      return `${r.revisadas} sesiones en las próximas 24 h · ${r.recordatorios} recordatorios (${r.mensajes} mensajes)`;
    },
  },
  { name: "acompanamiento.m365_reintentos", everyMs: 60_000, run: () => processQueue(QUEUE_KIND) },
];
