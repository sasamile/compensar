/**
 * Encuestas de experiencia y satisfacción (RF-GSV-03, RF-ANA-03 · FUN-85, FUN-95).
 * Se crean automáticamente al aprobar un cierre, al cerrar una remisión y al terminar un evento
 * (a quienes asistieron). Cada encuesta tiene un enlace público de un solo uso: /encuesta/<token>.
 */
import crypto from "node:crypto";
import { all, get, insert, now } from "./db";
import { notify } from "./notify";
import { audit } from "./audit";
import { can, type User } from "./auth";

export const ASPECTS: [string, string][] = [
  ["contenido", "Contenido y utilidad"], ["mentor", "Mentor / consultor / facilitador"], ["puntualidad", "Puntualidad y cumplimiento"],
];
export const KIND_LABEL: Record<string, string> = { servicio: "Servicio", cierre: "Cierre de servicio", evento: "Evento / curso" };

export const surveyUrl = (token: string) => `${process.env.APP_URL ?? ""}/encuesta/${token}`;

/** JOINs que necesita surveyFilter: sv (servicios), ev (events), c (companies). */
export const SURVEY_JOINS = `LEFT JOIN servicios sv ON sv.id=s.servicio_id LEFT JOIN events ev ON ev.id=s.event_id LEFT JOIN companies c ON c.id=s.company_id
  LEFT JOIN aliados al ON al.id=COALESCE(s.aliado_id, sv.aliado_id)`;

/** Alcance: organización = todo; programa = encuestas de servicios/eventos/empresas del programa; aliado = solo su aliado. */
export function surveyFilter(u: User): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const g of u.grants) {
    if (!(g.perms.includes("*") || g.perms.includes("surveys.view"))) continue;
    if (g.scope_type === "org") return { sql: "1=1", params: [] };
    if (g.scope_type === "program" && g.scope_id) { parts.push("COALESCE(sv.program_id, ev.program_id, c.program_id)=?"); params.push(g.scope_id); }
    if (g.scope_type === "aliado" && g.scope_id) { parts.push("COALESCE(s.aliado_id, sv.aliado_id)=?"); params.push(g.scope_id); }
  }
  return parts.length ? { sql: "(" + parts.join(" OR ") + ")", params } : { sql: "1=0", params: [] };
}
export const canRunSurveyJob = (u: User) => can(u, "alerts.manage") || can(u, "closure.approve");

const token = () => crypto.randomBytes(18).toString("base64url");

function createSurvey(f: { kind: string; referral_id?: number | null; closure_id?: number | null; event_id?: number | null; company_id?: number | null;
  servicio_id?: number | null; aliado_id?: number | null; user_id?: number | null; email?: string | null; phone?: string | null; name: string }) {
  const t = token();
  const id = insert(`INSERT INTO surveys(kind,referral_id,closure_id,event_id,company_id,servicio_id,aliado_id,user_id,token,status,sent_at) VALUES(?,?,?,?,?,?,?,?,?,'enviada',?)`,
    f.kind, f.referral_id ?? null, f.closure_id ?? null, f.event_id ?? null, f.company_id ?? null, f.servicio_id ?? null, f.aliado_id ?? null, f.user_id ?? null, t, now());
  notify({ key: "encuesta", vars: { name: f.name, url: surveyUrl(t) }, email: f.email, phone: f.phone, userId: f.user_id ?? null });
  return id;
}

const principal = (companyId: number) =>
  get<any>("SELECT * FROM users WHERE company_id=? AND status IN ('activo','invitado') ORDER BY is_principal DESC, id LIMIT 1", companyId);

/** Proceso automático: cierres aprobados, remisiones cerradas y eventos terminados sin encuesta. */
export async function runSurveys(actor?: { id: number; email: string }) {
  const res = { cierres: 0, remisiones: 0, eventos: 0 };
  // 1) Cierres aprobados sin encuesta
  for (const cl of all<any>(`SELECT cl.*, r.servicio_id, r.aliado_id, sv.name service FROM closures cl LEFT JOIN referrals r ON r.id=cl.referral_id
      LEFT JOIN servicios sv ON sv.id=r.servicio_id
      WHERE cl.status='aprobado' AND NOT EXISTS (SELECT 1 FROM surveys s WHERE s.closure_id=cl.id)
        AND (cl.referral_id IS NULL OR NOT EXISTS (SELECT 1 FROM surveys s WHERE s.referral_id=cl.referral_id))`)) {
    const p = principal(cl.company_id);
    createSurvey({ kind: "cierre", closure_id: cl.id, referral_id: cl.referral_id, company_id: cl.company_id, servicio_id: cl.servicio_id, aliado_id: cl.aliado_id,
      user_id: p?.id, email: p?.email, phone: p?.phone, name: cl.service || "acompañamiento empresarial" });
    res.cierres++;
  }
  // 2) Remisiones cerradas sin encuesta
  for (const r of all<any>(`SELECT r.*, sv.name service FROM referrals r LEFT JOIN servicios sv ON sv.id=r.servicio_id
      WHERE r.status='cerrada' AND NOT EXISTS (SELECT 1 FROM surveys s WHERE s.referral_id=r.id)`)) {
    const p = principal(r.company_id);
    createSurvey({ kind: "servicio", referral_id: r.id, company_id: r.company_id, servicio_id: r.servicio_id, aliado_id: r.aliado_id,
      user_id: p?.id, email: p?.email, phone: p?.phone, name: r.service || "servicio" });
    res.remisiones++;
  }
  // 3) Eventos terminados: asistentes sin encuesta
  for (const g of all<any>(`SELECT g.*, e.title FROM registrations g JOIN events e ON e.id=g.event_id
      WHERE g.attended=1 AND COALESCE(e.end_at, e.start_at) < ?
        AND NOT EXISTS (SELECT 1 FROM surveys s WHERE s.event_id=g.event_id AND ((g.user_id IS NOT NULL AND s.user_id=g.user_id) OR (s.company_id=g.company_id AND s.user_id IS NULL AND g.user_id IS NULL)))`, now())) {
    createSurvey({ kind: "evento", event_id: g.event_id, company_id: g.company_id, user_id: g.user_id, email: g.email, phone: g.phone, name: g.title });
    res.eventos++;
  }
  if (res.cierres + res.remisiones + res.eventos > 0 || actor) await audit(actor ?? { email: "sistema@encuestas" }, "enviar_encuestas", "survey_job", null, null, res);
  return res;
}

/** NPS = % promotores (9-10) − % detractores (0-6). */
export function nps(values: number[]) {
  const v = values.filter((x) => x != null);
  if (!v.length) return null;
  const pro = v.filter((x) => x >= 9).length, det = v.filter((x) => x <= 6).length;
  return Math.round(((pro - det) / v.length) * 100);
}
export const avg = (values: number[]) => {
  const v = values.filter((x) => x != null && !isNaN(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export function summarize(rows: any[], key: (r: any) => string) {
  const m = new Map<string, any[]>();
  for (const r of rows) { const k = key(r) || "Sin clasificar"; m.set(k, [...(m.get(k) ?? []), r]); }
  return Array.from(m.entries()).map(([label, rs]) => {
    const ans = rs.filter((r) => r.status === "respondida");
    return {
      label, sent: rs.length, answered: ans.length, rate: rs.length ? Math.round((ans.length / rs.length) * 100) : 0,
      nps: nps(ans.map((r) => r.nps)), sat: avg(ans.map((r) => r.satisfaction)),
      promoters: ans.filter((r) => r.nps >= 9).length, passives: ans.filter((r) => r.nps >= 7 && r.nps <= 8).length, detractors: ans.filter((r) => r.nps <= 6).length,
    };
  }).sort((a, b) => b.answered - a.answered);
}
