import type { Job } from "./types";
import { jobs as formularios } from "./formularios";
import { jobs as validacion } from "./validacion";
import { jobs as seguimiento } from "./seguimiento";
import { jobs as analitica } from "./analitica";
import { jobs as tecnico } from "./tecnico";
import { jobs as convocatorias } from "./convocatorias";
import { jobs as acompanamiento } from "./acompanamiento";
import { jobs as plataforma } from "./plataforma";

export const ALL_JOBS: Job[] = [...formularios, ...validacion, ...seguimiento, ...analitica, ...tecnico, ...convocatorias, ...acompanamiento, ...plataforma];
