import { get, run, setSetting, setting } from "../db";

/**
 * Datos de demostración del módulo convocatorias (idempotente): un curso de 3 sesiones con descripción
 * enriquecida y una plantilla de landing distinta para cada evento demo.
 */
export function seed() {
  if (setting("seed_convocatorias_v1")) return;
  const byTitle = (t: string) => get<any>("SELECT id FROM events WHERE title=? ORDER BY id LIMIT 1", t);
  const curso = byTitle("Curso de costos y precios");
  if (curso) {
    run(`UPDATE events SET sessions_count=3, landing_template='minimal', summary=?, description=? WHERE id=?`,
      "Tres sesiones prácticas para calcular tus costos y fijar precios rentables.",
      [
        "## ¿Qué aprenderás?",
        "- Separar **costos fijos** y **costos variables**",
        "- Calcular tu *punto de equilibrio*",
        "- Fijar precios con margen y revisar a la competencia",
        "",
        "1. Sesión 1: estructura de costos",
        "2. Sesión 2: punto de equilibrio",
        "3. Sesión 3: estrategia de precios",
        "",
        "Para certificarte debes asistir al menos al 80 % de las sesiones. Más información en [compensar.com](https://www.compensar.com).",
      ].join("\n"), curso.id);
    run("INSERT OR IGNORE INTO event_meta(event_id,hours) VALUES(?,?)", curso.id, 12);
  }
  const taller = byTitle("Taller de finanzas para mipymes");
  if (taller) run("UPDATE events SET landing_template='destacada' WHERE id=?", taller.id);
  setSetting("seed_convocatorias_v1", new Date().toISOString());
}
