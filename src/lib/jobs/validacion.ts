import type { Job } from "./types";
import { ensureCompanyCases, processDueRequests } from "@/lib/validation";
import { proposeForNewDiagnostics } from "@/lib/routes";

/** Procesos por lotes del módulo Validación de requisitos + Rutas de acompañamiento. */
export const jobs: Job[] = [
  {
    // FUN-72: toda empresa pendiente tiene su caso de validación (y su validación automática, FUN-73)
    name: "validacion.casos_empresas_pendientes", everyMs: 10 * 60 * 1000,
    run: async () => `casos creados: ${await ensureCompanyCases()}`,
  },
  {
    // FUN-76: recordatorio antes del vencimiento y paso a 'vencida' al cumplirse el plazo
    name: "validacion.plazos_solicitudes_informacion", everyMs: 30 * 60 * 1000,
    run: async () => { const r = await processDueRequests(); return `recordatorios: ${r.reminded}, vencidas: ${r.expired}`; },
  },
  {
    // RF-RUT-05: propone (no asigna) rutas para diagnósticos completados sin ruta; requiere aprobación del mentor
    name: "rutas.recomendar_desde_diagnostico", everyMs: 60 * 60 * 1000,
    run: async () => `propuestas creadas: ${await proposeForNewDiagnostics()}`,
  },
];
