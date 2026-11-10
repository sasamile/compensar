/**
 * Alertas automáticas por reglas (RF-ALE-02/03/04 · FUN-88, 89, 90).
 * Cada regla (alert_rules) tiene umbral en días, rol responsable y canal. El proceso `runAlerts`
 * evalúa las condiciones, crea alertas nuevas sin duplicar (regla + entidad), actualiza severidad,
 * cierra las que dejaron de cumplirse y notifica al responsable.
 */
import { all, get, insert, now, run } from "./db";
import { notify } from "./notify";
import { audit } from "./audit";
import { fmtDate } from "./util";
import { compliance, periodDays } from "./indicators";

export const RULES: Record<string, { name: string; description: string; threshold: number; owner: string; channel: string; entity: string }> = {
  sesion_sin_seguimiento: { name: "Sesión realizada sin seguimiento", description: "La última sesión realizada de la empresa tiene más de N días y no hay una nueva sesión programada.", threshold: 15, owner: "mentor", channel: "correo", entity: "session" },
  sesion_vencida: { name: "Sesión vencida sin cerrar", description: "Sesión programada cuya fecha pasó hace más de N días sin registrar seguimiento ni cancelarla.", threshold: 2, owner: "mentor", channel: "correo", entity: "session" },
  sesion_sin_aceptacion: { name: "Sesión realizada sin aceptación", description: "Sesión con seguimiento registrado que la empresa no ha aceptado después de N días (no cuenta para pagos).", threshold: 5, owner: "mentor", channel: "whatsapp", entity: "session" },
  empresa_inactiva: { name: "Empresa sin actividad", description: "Empresa activa en acompañamiento sin sesiones, avances, mensajes ni tareas en más de N días.", threshold: 30, owner: "gestor_mentorias", channel: "correo", entity: "company" },
  etapa_vencida: { name: "Meta o etapa de ruta vencida", description: "Etapa de una ruta activa no completada N días después de su fecha límite.", threshold: 0, owner: "mentor", channel: "correo", entity: "route_step" },
  indicador_desactualizado: { name: "Indicador atrasado", description: "Indicador sin avance registrado en su periodicidad + N días de gracia y sin alcanzar la meta.", threshold: 15, owner: "mentor", channel: "correo", entity: "indicator" },
  tarea_vencida: { name: "Tarea vencida", description: "Tarea operativa no terminada N días después de su vencimiento.", threshold: 0, owner: "responsable", channel: "correo", entity: "task" },
  solicitud_vencida: { name: "Solicitud de información vencida", description: "Solicitud de información a la empresa sin respuesta N días después de su vencimiento.", threshold: 0, owner: "responsable", channel: "correo", entity: "info_request" },
};

export const OWNER_ROLES: [string, string][] = [
  ["mentor", "Mentor de la empresa o sesión"], ["responsable", "Responsable del registro (tarea / solicitud)"],
  ["gestor_mentorias", "Gestor de mentorías del programa"], ["coord_aliado", "Coordinador del aliado"], ["admin", "Administrador"],
];
export const ALERT_CHANNELS: [string, string][] = [
  ["correo", "Correo"], ["sms", "SMS"], ["whatsapp", "WhatsApp"], ["todos", "Correo, SMS y WhatsApp"], ["plataforma", "Solo en la plataforma"],
];
export const channelsOf = (c: string) => (c === "todos" ? ["correo", "sms", "whatsapp"] : c === "plataforma" ? [] : [c]);
export const ENTITY_LABEL: Record<string, string> = { session: "Sesión", company: "Empresa", route_step: "Etapa de ruta", indicator: "Indicador", task: "Tarea", info_request: "Solicitud" };

const DAY = 86400000;
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
const cutoff = (days: number) => new Date(Date.now() - days * DAY).toISOString();
/** Amarilla al superar el umbral; roja cuando el retraso duplica el umbral (mínimo 7 días adicionales). */
const severity = (days: number, th: number) => (days >= Math.max(th * 2, th + 7) ? "roja" : "amarilla");

type Finding = { company_id: number | null; program_id: number | null; entity: string; entity_id: number; days: number; message: string; mentor_id?: number | null; responsible_id?: number | null };

function companyMentor(companyId: number | null): number | null {
  if (!companyId) return null;
  return get<any>("SELECT mentor_id FROM mentor_assignments WHERE company_id=? AND active=1 ORDER BY id DESC LIMIT 1", companyId)?.mentor_id
    ?? get<any>("SELECT mentor_id FROM referrals WHERE company_id=? AND mentor_id IS NOT NULL AND status NOT IN ('rechazada','cerrada') ORDER BY id DESC LIMIT 1", companyId)?.mentor_id ?? null;
}

function roleUser(roleKey: string, programId: number | null, companyId: number | null): number | null {
  if (roleKey === "coord_aliado") {
    return get<any>(`SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
      WHERE r.key='coord_aliado' AND u.status='activo' AND ur.scope_id IN (SELECT aliado_id FROM referrals WHERE company_id=?) LIMIT 1`, companyId)?.user_id ?? null;
  }
  return get<any>(`SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
    WHERE r.key=? AND u.status='activo' AND (ur.scope_type='org' OR (ur.scope_type='program' AND ur.scope_id=?))
    ORDER BY ur.scope_type='program' DESC LIMIT 1`, roleKey, programId)?.user_id ?? null;
}

export function resolveOwner(ownerRole: string, f: Finding): number | null {
  let id: number | null = null;
  if (ownerRole === "mentor") id = f.mentor_id ?? companyMentor(f.company_id);
  else if (ownerRole === "responsable") id = f.responsible_id ?? f.mentor_id ?? null;
  else id = roleUser(ownerRole, f.program_id, f.company_id);
  return id ?? roleUser("gestor_mentorias", f.program_id, f.company_id) ?? roleUser("admin", null, null);
}

/** Evalúa una regla y devuelve las condiciones que se cumplen ahora. */
export function evaluate(key: string, th: number): Finding[] {
  const out: Finding[] = [];
  const cut = cutoff(th);
  if (key === "sesion_vencida") {
    for (const s of all<any>(`SELECT s.*, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id WHERE s.status='programada' AND s.scheduled_at < ?`, cut)) {
      const d = daysSince(s.scheduled_at);
      out.push({ company_id: s.company_id, program_id: s.program_id, entity: "session", entity_id: s.id, days: d, mentor_id: s.mentor_id,
        message: `La sesión «${s.title}» de ${s.razon_social} (${fmtDate(s.scheduled_at)}) sigue programada sin cerrar hace ${d} día(s).` });
    }
  } else if (key === "sesion_sin_aceptacion") {
    for (const s of all<any>(`SELECT s.*, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id
        WHERE s.status='realizada' AND s.topics IS NOT NULL AND s.accepted_at IS NULL AND s.scheduled_at < ?`, cut)) {
      const d = daysSince(s.scheduled_at);
      out.push({ company_id: s.company_id, program_id: s.program_id, entity: "session", entity_id: s.id, days: d, mentor_id: s.mentor_id,
        message: `La sesión «${s.title}» con ${s.razon_social} lleva ${d} día(s) realizada sin aceptación de la empresa.` });
    }
  } else if (key === "sesion_sin_seguimiento") {
    for (const s of all<any>(`SELECT s.*, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id
        WHERE s.status='realizada' AND c.status='activa'
          AND s.id=(SELECT x.id FROM mentoring_sessions x WHERE x.company_id=s.company_id AND x.status='realizada' ORDER BY x.scheduled_at DESC, x.id DESC LIMIT 1)
          AND s.scheduled_at < ?
          AND NOT EXISTS (SELECT 1 FROM mentoring_sessions y WHERE y.company_id=s.company_id AND y.status='programada' AND y.scheduled_at > s.scheduled_at)
          AND (s.referral_id IS NULL OR s.referral_id NOT IN (SELECT id FROM referrals WHERE status='cerrada'))`, cut)) {
      const d = daysSince(s.scheduled_at);
      out.push({ company_id: s.company_id, program_id: s.program_id, entity: "session", entity_id: s.id, days: d, mentor_id: s.mentor_id,
        message: `${s.razon_social}: la última sesión («${s.title}») fue hace ${d} día(s) y no hay una siguiente sesión programada.` });
    }
  } else if (key === "empresa_inactiva") {
    const cs = all<any>(`SELECT c.* FROM companies c WHERE c.status='activa' AND (
        c.id IN (SELECT company_id FROM mentor_assignments WHERE active=1)
        OR c.id IN (SELECT company_id FROM referrals WHERE status IN ('enviada','aceptada','en curso')))`);
    for (const c of cs) {
      const last = get<any>(`SELECT MAX(t) t FROM (
          SELECT MAX(scheduled_at) t FROM mentoring_sessions WHERE company_id=? AND scheduled_at <= ?
          UNION ALL SELECT MAX(v.recorded_at) FROM indicator_values v JOIN indicators i ON i.id=v.indicator_id WHERE i.company_id=?
          UNION ALL SELECT MAX(sent_at) FROM messages WHERE company_id=?
          UNION ALL SELECT MAX(COALESCE(done_at, created_at)) FROM tasks WHERE company_id=?
          UNION ALL SELECT MAX(from_at) FROM mentor_assignments WHERE company_id=?
          UNION ALL SELECT MAX(COALESCE(accepted_at, created_at)) FROM referrals WHERE company_id=?
          UNION ALL SELECT MAX(created_at) FROM company_routes WHERE company_id=?)`, c.id, now(), c.id, c.id, c.id, c.id, c.id, c.id)?.t ?? c.created_at;
      if (!last || last >= cut) continue;
      const d = daysSince(last);
      out.push({ company_id: c.id, program_id: c.program_id, entity: "company", entity_id: c.id, days: d,
        message: `${c.razon_social} no registra actividad (sesiones, avances, mensajes o tareas) hace ${d} día(s).` });
    }
  } else if (key === "etapa_vencida") {
    for (const st of all<any>(`SELECT st.*, cr.company_id, cr.name route, c.program_id, c.razon_social FROM company_route_steps st
        JOIN company_routes cr ON cr.id=st.company_route_id JOIN companies c ON c.id=cr.company_id
        WHERE cr.status='activa' AND COALESCE(st.status,'pendiente')!='completado' AND st.due_at IS NOT NULL AND st.due_at < ?`, cut)) {
      const d = daysSince(st.due_at);
      out.push({ company_id: st.company_id, program_id: st.program_id, entity: "route_step", entity_id: st.id, days: d,
        message: `${st.razon_social}: la etapa «${st.name}» de la ruta «${st.route || "ruta"}» venció hace ${d} día(s) sin completarse.` });
    }
  } else if (key === "indicador_desactualizado") {
    for (const i of all<any>(`SELECT i.*, c.razon_social, d.periodicity,
        COALESCE((SELECT MAX(recorded_at) FROM indicator_values v WHERE v.indicator_id=i.id), i.updated_at) last_at
        FROM indicators i JOIN companies c ON c.id=i.company_id LEFT JOIN indicator_defs d ON d.id=i.def_id WHERE c.status='activa'`)) {
      if (!i.last_at) continue;
      const p = compliance(i.baseline, i.goal, i.final);
      if (p != null && p >= 100) continue;
      const d = daysSince(i.last_at);
      const lim = periodDays(i.periodicity) + th;
      if (d <= lim) continue;
      out.push({ company_id: i.company_id, program_id: i.program_id, entity: "indicator", entity_id: i.id, days: d - periodDays(i.periodicity),
        message: `${i.razon_social}: el indicador «${i.name}» no se actualiza hace ${d} día(s) (periodicidad ${i.periodicity || "mensual"}) y va en ${p ?? 0}% de la meta.` });
    }
  } else if (key === "tarea_vencida") {
    for (const t of all<any>(`SELECT t.*, c.razon_social, c.program_id cprog FROM tasks t LEFT JOIN companies c ON c.id=t.company_id
        WHERE t.status!='hecha' AND t.due_at IS NOT NULL AND t.due_at < ?`, cut)) {
      const d = daysSince(t.due_at);
      out.push({ company_id: t.company_id, program_id: t.program_id ?? t.cprog, entity: "task", entity_id: t.id, days: d, responsible_id: t.assignee_id ?? t.created_by,
        message: `Tarea «${t.title}»${t.razon_social ? ` (${t.razon_social})` : ""} vencida hace ${d} día(s).` });
    }
  } else if (key === "solicitud_vencida") {
    for (const r of all<any>(`SELECT r.*, vc.company_id, COALESCE(vc.program_id, c.program_id) program_id, vc.assigned_to, c.razon_social FROM info_requests r
        LEFT JOIN validation_cases vc ON vc.id=r.case_id LEFT JOIN companies c ON c.id=vc.company_id
        WHERE r.status IN ('abierta','vencida') AND r.due_at IS NOT NULL AND r.due_at < ?`, cut)) {
      const d = daysSince(r.due_at);
      out.push({ company_id: r.company_id, program_id: r.program_id, entity: "info_request", entity_id: r.id, days: d, responsible_id: r.created_by ?? r.assigned_to,
        message: `Solicitud de información${r.razon_social ? ` a ${r.razon_social}` : ""} sin respuesta, vencida hace ${d} día(s).` });
    }
  }
  return out;
}

const SYSTEM = { id: undefined as any, email: "sistema@alertas" };

/** Ejecuta todas las reglas activas. Idempotente: no duplica alertas abiertas/atendidas de la misma regla y entidad. */
export async function runAlerts(actor?: { id: number; email: string }) {
  const res = { created: 0, updated: 0, closed: 0, notified: 0 };
  const rules = all<any>("SELECT * FROM alert_rules");
  const ts = now();
  for (const rule of rules) {
    if (!RULES[rule.key]) continue;
    const findings = rule.active ? evaluate(rule.key, Number(rule.threshold ?? RULES[rule.key].threshold)) : [];
    const keep = new Set<string>();
    for (const f of findings) {
      keep.add(`${f.entity}:${f.entity_id}`);
      const sev = severity(f.days, Number(rule.threshold ?? 0));
      const ex = get<any>("SELECT * FROM alerts WHERE rule_key=? AND entity=? AND entity_id=? AND status IN ('abierta','atendida') ORDER BY id DESC LIMIT 1", rule.key, f.entity, f.entity_id);
      if (!ex) {
        const owner = resolveOwner(rule.owner_role || RULES[rule.key].owner, f);
        const id = insert("INSERT INTO alerts(rule_key,company_id,program_id,entity,entity_id,severity,message,status,owner_id,created_at) VALUES(?,?,?,?,?,?,?,'abierta',?,?)",
          rule.key, f.company_id, f.program_id, f.entity, f.entity_id, sev, f.message, owner, ts);
        res.created++;
        if (owner) res.notified += sendAlert(rule, { id, severity: sev, message: f.message, company_id: f.company_id }, owner);
      } else if (ex.status === "abierta" && (ex.severity !== sev || ex.message !== f.message)) {
        run("UPDATE alerts SET severity=?, message=? WHERE id=?", sev, f.message, ex.id);
        res.updated++;
        if (ex.severity !== "roja" && sev === "roja" && ex.owner_id) res.notified += sendAlert(rule, { ...ex, severity: sev, message: f.message }, ex.owner_id);
      }
    }
    for (const a of all<any>("SELECT id, entity, entity_id FROM alerts WHERE rule_key=? AND status IN ('abierta','atendida')", rule.key)) {
      if (keep.has(`${a.entity}:${a.entity_id}`)) continue;
      run("UPDATE alerts SET status='cerrada', resolved_at=COALESCE(resolved_at, ?) WHERE id=?", ts, a.id);
      res.closed++;
    }
  }
  await audit(actor ?? SYSTEM, "ejecutar_alertas", "alert_job", null, null, res);
  return res;
}

function sendAlert(rule: any, a: { id: number; severity: string; message: string; company_id: number | null }, ownerId: number) {
  const chans = channelsOf(rule.channel || "correo");
  if (!chans.length) return 0;
  const o = get<any>("SELECT * FROM users WHERE id=?", ownerId);
  if (!o) return 0;
  const company = a.company_id ? get<any>("SELECT razon_social FROM companies WHERE id=?", a.company_id)?.razon_social : "";
  notify({ key: "alerta", channels: chans, email: o.email, phone: o.phone, userId: o.id,
    vars: { rule: rule.name, severity: a.severity, message: a.message, company: company || "—", url: `${process.env.APP_URL ?? ""}/seguimiento?tab=alertas` } });
  return 1;
}

/** Color de semáforo por empresa a partir de las alertas abiertas (roja > amarilla > verde). */
export function companyLights(): Map<number, "roja" | "amarilla"> {
  const m = new Map<number, "roja" | "amarilla">();
  for (const r of all<any>("SELECT company_id, MAX(CASE severity WHEN 'roja' THEN 2 ELSE 1 END) lvl FROM alerts WHERE status='abierta' AND company_id IS NOT NULL GROUP BY company_id"))
    m.set(r.company_id, r.lvl === 2 ? "roja" : "amarilla");
  return m;
}
