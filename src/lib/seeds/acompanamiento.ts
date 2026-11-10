import { get, insert, run, tx } from "@/lib/db";

/** Plantillas del módulo (RF-ACO-11): se siembran aprobadas en correo, SMS y WhatsApp. */
const TEMPLATES: [string, string, string][] = [
  ["recordatorio_sesion", "Recordatorio: sesión «{{title}}» en {{faltan}}", "Te recordamos la sesión «{{title}}» entre {{mentor}} y {{company}} el {{when}} ({{modality}}). Faltan {{faltan}}. Invitación de calendario: {{ics}}"],
  ["sesion_reprogramada", "Sesión reprogramada", "La sesión «{{title}}» entre {{mentor}} y {{company}} pasó del {{before}} al {{when}}. Motivo: {{reason}}. Invitación actualizada: {{ics}}"],
  ["sesion_fuera_disponibilidad", "Sesión programada fuera de tu disponibilidad", "{{mentor}}: se programó «{{title}}» con {{company}} el {{when}}. {{reason}}. Revísala en tu agenda: {{ics}}"],
];

const g = globalThis as any;

/** Datos de demostración del módulo acompañamiento (idempotente). */
export function seed() {
  if (g.__seedAcompanamiento) return;
  if (!get("SELECT 1 FROM roles LIMIT 1")) return;
  g.__seedAcompanamiento = true;
  tx(() => {
    for (const [key, subject, body] of TEMPLATES)
      for (const ch of ["correo", "sms", "whatsapp"])
        run("INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(?,?,?,?,?,1)", key, ch, key, ch === "correo" ? subject : "", body);
    // La invitación de programación lleva el enlace a la invitación .ics (solo si aún no lo tiene)
    run("UPDATE templates SET body = body || ' Agrega la sesión a tu calendario: {{ics}}' WHERE key='sesion_programada' AND channel='correo' AND body NOT LIKE '%{{ics}}%'");

    // Disponibilidad semanal de ejemplo (1=lunes … 7=domingo)
    const DEMO: Record<string, [number, string, string, string][]> = {
      "mentor1@compensar.test": [[1, "08:00", "12:00", "virtual"], [2, "14:00", "17:00", "presencial"], [3, "08:00", "12:00", "ambas"], [4, "14:00", "17:00", "virtual"], [5, "08:00", "11:00", "virtual"]],
      "mentor2@compensar.test": [[2, "09:00", "12:00", "virtual"], [4, "09:00", "12:00", "virtual"]],
      "mentor@crecer.test": [[3, "09:00", "12:00", "virtual"], [5, "14:00", "16:00", "presencial"]],
    };
    for (const [email, slots] of Object.entries(DEMO)) {
      const m = get<any>("SELECT id FROM users WHERE email=?", email);
      if (!m || get("SELECT 1 FROM mentor_availability WHERE mentor_id=?", m.id)) continue;
      for (const [wd, a, b, mod] of slots)
        insert("INSERT INTO mentor_availability(mentor_id,weekday,start_time,end_time,modality,active) VALUES(?,?,?,?,?,1)", m.id, wd, a, b, mod);
    }
  });
}
