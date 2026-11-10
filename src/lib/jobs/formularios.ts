import type { Job } from "./types";
import { all, get, now, run } from "../db";
import { notify } from "../notify";
import { syncValidationStatuses } from "@/app/(app)/formularios/server";

/** Procesos por lotes del módulo formularios. */
export const jobs: Job[] = [
  {
    // FUN-70/71: refleja en la respuesta (y notifica) los cambios de estado que hace la bandeja de Validación
    name: "formularios.sincronizar_estados",
    everyMs: 60_000,
    run: () => `${syncValidationStatuses()} respuestas actualizadas`,
  },
  {
    // FUN-69: recordatorio único de borradores sin terminar (3 días sin cambios) en formularios publicados
    name: "formularios.recordar_borradores",
    everyMs: 3_600_000,
    run: () => {
      const limit = new Date(Date.now() - 3 * 86400000).toISOString();
      const rows = all<any>(`SELECT r.*, f.name form, f.slug FROM form_responses r JOIN forms f ON f.id=r.form_id
        WHERE r.status='borrador' AND f.status='publicado' AND f.kind<>'diagnostico' AND r.user_id IS NOT NULL AND r.updated_at<?
          AND NOT EXISTS (SELECT 1 FROM form_notices n WHERE n.response_id=r.id AND n.kind='recordatorio_borrador') LIMIT 200`, limit);
      for (const r of rows) {
        const u = get<any>("SELECT * FROM users WHERE id=? AND status='activo'", r.user_id);
        run("INSERT OR IGNORE INTO form_notices(response_id,kind,sent_at) VALUES(?,?,?)", r.id, "recordatorio_borrador", now());
        if (u) notify({ key: "formulario_borrador", vars: { name: u.name, form: r.form, url: `/f/${r.slug}?r=${r.id}` }, email: u.email, phone: u.phone, userId: u.id });
      }
      return `${rows.length} recordatorios`;
    },
  },
];
