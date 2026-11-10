import { seed as formularios } from "./formularios";
import { seed as validacion } from "./validacion";
import { seed as seguimiento } from "./seguimiento";
import { seed as analitica } from "./analitica";
import { seed as tecnico } from "./tecnico";
import { seed as convocatorias } from "./convocatorias";
import { seed as acompanamiento } from "./acompanamiento";
import { seed as plataforma } from "./plataforma";

/** Se llama después de la semilla base, en cada arranque. Cada módulo protege su propia idempotencia. */
export function seedModules() {
  for (const fn of [formularios, validacion, seguimiento, analitica, tecnico, convocatorias, acompanamiento, plataforma]) {
    try { fn(); } catch (e) { console.error("[seed]", e); }
  }
}
