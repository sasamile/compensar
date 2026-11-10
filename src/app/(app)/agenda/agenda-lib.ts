/**
 * Lógica compartida de la agenda de mentorías (RF-ACO-04/05/10/11): disponibilidad semanal del mentor,
 * franjas libres, choques de horario, alcance de mentores y notificación a los participantes.
 * Todas las horas se manejan en hora de Colombia (UTC-5 fijo, sin horario de verano).
 * Archivo SIN "use server": lo usan páginas, acciones, el adaptador M365 y el job de recordatorios.
 */
import { all, get } from "@/lib/db";
import { can, isAdmin, programScope, type User } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { fmtDate } from "@/lib/util";

export const WEEKDAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const MODALITIES = ["virtual", "presencial", "ambas"] as const;
const OFFSET = 5 * 3600 * 1000;

export const toMin = (hm: string) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
export const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Partes de una fecha en hora de Colombia. wd: 1=lunes … 7=domingo. */
export function bog(iso: string | number | Date) {
  const d = new Date(+new Date(iso) - OFFSET);
  return { date: d.toISOString().slice(0, 10), wd: ((d.getUTCDay() + 6) % 7) + 1, min: d.getUTCHours() * 60 + d.getUTCMinutes(), hm: d.toISOString().slice(11, 16) };
}
/** "YYYY-MM-DD" + "HH:MM" (Colombia) → ISO UTC. */
export const bogIso = (date: string, hm: string) => new Date(`${date}T${hm}:00-05:00`).toISOString();
export const addDays = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const todayBog = () => bog(Date.now()).date;
export const endIso = (startIso: string, durationMin: number) => new Date(+new Date(startIso) + durationMin * 60000).toISOString();

export type Slot = { id: number; mentor_id: number; weekday: number; start_time: string; end_time: string; modality: string };
export const availability = (mentorId: number): Slot[] =>
  all<Slot>("SELECT * FROM mentor_availability WHERE mentor_id=? AND active=1 ORDER BY weekday, start_time", mentorId);

/** ¿La sesión cae completa dentro de una franja de disponibilidad del mentor? */
export function withinAvailability(mentorId: number, startIso: string, durationMin: number, modality?: string) {
  const slots = availability(mentorId);
  if (!slots.length) return { ok: false, reason: "El mentor no tiene disponibilidad registrada" };
  const b = bog(startIso);
  const s = b.min, e = s + durationMin;
  const hit = slots.find((x) => x.weekday === b.wd && toMin(x.start_time) <= s && e <= toMin(x.end_time) && (!modality || x.modality === "ambas" || x.modality === modality));
  return hit ? { ok: true, slot: hit } : { ok: false, reason: `Fuera de la disponibilidad registrada del mentor (${WEEKDAYS[b.wd]} ${b.hm})` };
}

/** Sesiones no canceladas del mentor que se cruzan con [start, start+duración). */
export function conflicts(mentorId: number, startIso: string, durationMin: number, excludeId?: number | null) {
  const s = +new Date(startIso), e = s + durationMin * 60000;
  const from = new Date(s - 24 * 3600000).toISOString(), to = new Date(e).toISOString();
  return all<any>(`SELECT s.id, s.title, s.scheduled_at, s.duration_min, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id
    WHERE s.mentor_id=? AND s.status!='cancelada' AND s.id!=? AND s.scheduled_at>=? AND s.scheduled_at<?`, mentorId, excludeId ?? 0, from, to)
    .filter((x) => { const xs = +new Date(x.scheduled_at), xe = xs + (x.duration_min || 60) * 60000; return xs < e && s < xe; });
}

/** Franjas libres del mentor (bloques de `duration` minutos) en los próximos `days` días, sin sesiones cruzadas. */
export function freeSlots(mentorId: number, opts: { days?: number; duration?: number; from?: string; excludeId?: number | null } = {}) {
  const days = opts.days ?? 14, dur = opts.duration ?? 60;
  const slots = availability(mentorId);
  if (!slots.length) return [];
  const start = opts.from ?? todayBog();
  const nowMs = Date.now();
  const sessions = all<any>("SELECT id, scheduled_at, duration_min FROM mentoring_sessions WHERE mentor_id=? AND status!='cancelada' AND id!=? AND scheduled_at>=? AND scheduled_at<?",
    mentorId, opts.excludeId ?? 0, bogIso(addDays(start, -1), "00:00"), bogIso(addDays(start, days + 1), "00:00"))
    .map((x) => [+new Date(x.scheduled_at), +new Date(x.scheduled_at) + (x.duration_min || 60) * 60000]);
  const out: { start: string; end: string; date: string; hm: string; modality: string; weekday: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const wd = bog(bogIso(date, "12:00")).wd;
    for (const sl of slots.filter((x) => x.weekday === wd)) {
      for (let m = toMin(sl.start_time); m + dur <= toMin(sl.end_time); m += dur) {
        const iso = bogIso(date, minToHm(m));
        const s = +new Date(iso), e = s + dur * 60000;
        if (s <= nowMs) continue; // no hay antelación mínima, pero no se agenda en el pasado
        if (sessions.some(([a, b]) => a < e && s < b)) continue;
        out.push({ start: iso, end: new Date(e).toISOString(), date, hm: minToHm(m), modality: sl.modality, weekday: wd });
      }
    }
  }
  return out;
}

/** Mentores con los que la empresa puede agendar: asignado activo y mentores de remisiones aceptadas/en curso. */
export function companyMentors(companyId: number) {
  const rows = all<any>(`SELECT u.id, u.name, u.email, NULL referral_id, 'Mentor asignado' via FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id
      WHERE a.company_id=? AND a.active=1 AND u.status='activo'
    UNION ALL
    SELECT u.id, u.name, u.email, r.id referral_id, 'Servicio: ' || sv.name via FROM referrals r JOIN users u ON u.id=r.mentor_id JOIN servicios sv ON sv.id=r.servicio_id
      WHERE r.company_id=? AND r.status IN ('aceptada','en curso') AND u.status='activo'`, companyId, companyId);
  return rows.filter((r) => !r.referral_id || !get("SELECT 1 FROM closures WHERE referral_id=? AND status='aprobado'", r.referral_id));
}

const MENTOR_ROLE_SQL = "SELECT DISTINCT u.id, u.name, u.email, u.aliado_id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.key='mentor' AND u.status='activo'";

/**
 * Mentores cuya disponibilidad puede administrar el usuario: el propio mentor; el Administrador todos;
 * el Gestor de Mentorías los que acompañan empresas de su programa (o sin asignaciones aún);
 * el coordinador de aliado los mentores de su organización.
 */
export function manageableMentors(u: User): { id: number; name: string; email: string }[] {
  const out = new Map<number, any>();
  const isMentor = !!get("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.key='mentor'", u.id);
  if (isMentor) out.set(u.id, { id: u.id, name: u.name, email: u.email });
  if (isAdmin(u) || can(u, "config.manage")) {
    all<any>(MENTOR_ROLE_SQL + " ORDER BY u.name").forEach((m) => out.set(m.id, m));
  } else if (can(u, "mentors.assign") || can(u, "users.manage.mentors")) {
    const sc = programScope(u, "mentors.assign") ?? programScope(u, "users.manage.mentors");
    const mentors = all<any>(MENTOR_ROLE_SQL + " ORDER BY u.name");
    if (sc === null) mentors.forEach((m) => out.set(m.id, m));
    else for (const m of mentors) {
      const ph = sc.map(() => "?").join(",") || "NULL";
      const inProgram = get(`SELECT 1 FROM mentor_assignments WHERE mentor_id=? AND program_id IN (${ph})
        UNION SELECT 1 FROM referrals r JOIN companies c ON c.id=r.company_id WHERE r.mentor_id=? AND c.program_id IN (${ph})
        UNION SELECT 1 FROM mentoring_sessions WHERE mentor_id=? AND program_id IN (${ph})`, m.id, ...sc, m.id, ...sc, m.id, ...sc);
      const unassigned = !get("SELECT 1 FROM mentor_assignments WHERE mentor_id=? UNION SELECT 1 FROM referrals WHERE mentor_id=?", m.id, m.id);
      if (!m.aliado_id && (inProgram || unassigned)) out.set(m.id, m);
      else if (inProgram) out.set(m.id, m);
    }
  }
  if (u.aliado_id && can(u, "users.manage.aliado")) all<any>(MENTOR_ROLE_SQL + " AND u.aliado_id=? ORDER BY u.name", u.aliado_id).forEach((m) => out.set(m.id, m));
  return [...out.values()];
}
export const canManageAvailability = (u: User, mentorId: number) => manageableMentors(u).some((m) => m.id === mentorId);

export const icsUrl = (id: number) => `${process.env.APP_URL ?? ""}/agenda/${id}/ics`;

/** Notifica a mentor y usuarios de la empresa con una plantilla aprobada (RF-ACO-11). */
export function notifyParties(key: string, sess: any, extra: Record<string, string> = {}) {
  const c = get<any>("SELECT razon_social FROM companies WHERE id=?", sess.company_id);
  const m = get<any>("SELECT * FROM users WHERE id=?", sess.mentor_id);
  const vars = { title: sess.title, when: fmtDate(sess.scheduled_at), mentor: m?.name, company: c?.razon_social, modality: sess.modality, ics: icsUrl(sess.id), ...extra };
  let n = 0;
  if (m) n += notify({ key, vars, email: m.email, phone: m.phone, userId: m.id }).length;
  for (const r of all<any>("SELECT * FROM users WHERE company_id=? AND status IN ('activo','invitado')", sess.company_id))
    n += notify({ key, vars, email: r.email, phone: r.phone, userId: r.id }).length;
  return n;
}

/** Participantes de la sesión para la invitación de calendario. */
export function participants(sess: any) {
  const mentor = get<any>("SELECT id, name, email FROM users WHERE id=?", sess.mentor_id);
  const company = get<any>("SELECT id, razon_social FROM companies WHERE id=?", sess.company_id);
  const attendees = all<any>("SELECT id, name, email FROM users WHERE company_id=? AND status IN ('activo','invitado') AND email IS NOT NULL", sess.company_id);
  return { mentor, company, attendees };
}

/** Advertencia al mentor cuando otra persona le programa una sesión fuera de su disponibilidad (no bloquea). */
export function warnMentor(sess: any, reason: string) {
  const m = get<any>("SELECT * FROM users WHERE id=?", sess.mentor_id);
  const c = get<any>("SELECT razon_social FROM companies WHERE id=?", sess.company_id);
  if (!m) return;
  notify({ key: "sesion_fuera_disponibilidad", vars: { title: sess.title, when: fmtDate(sess.scheduled_at), company: c?.razon_social, mentor: m.name, reason, ics: icsUrl(sess.id) },
    email: m.email, phone: m.phone, userId: m.id, channels: ["correo"] });
}
