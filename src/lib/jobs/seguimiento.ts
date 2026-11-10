import type { Job } from "./types";
import { runAlerts } from "../alerts";
import { runSurveys } from "../surveys";

/** Procesos por lotes del módulo seguimiento: alertas por reglas (FUN-88/90) y encuestas automáticas (FUN-85). */
export const jobs: Job[] = [
  {
    name: "seguimiento.alertas",
    everyMs: 60 * 60 * 1000,
    run: async () => {
      const r = await runAlerts();
      return `alertas: ${r.created} nuevas, ${r.updated} actualizadas, ${r.closed} cerradas, ${r.notified} avisos`;
    },
  },
  {
    name: "seguimiento.encuestas",
    everyMs: 30 * 60 * 1000,
    run: async () => {
      const r = await runSurveys();
      return `encuestas enviadas: ${r.cierres} por cierre, ${r.remisiones} por remisión cerrada, ${r.eventos} por evento`;
    },
  },
];
