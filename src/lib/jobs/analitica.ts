import type { Job } from "./types";
import { takeSnapshot } from "../analytics";

/** Procesos por lotes del módulo analítica: instantánea de indicadores de la organización cada 15 min (TEC-97). */
export const jobs: Job[] = [
  { name: "analitica.instantaneas", everyMs: 15 * 60 * 1000, run: () => takeSnapshot() },
];
