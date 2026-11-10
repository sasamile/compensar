import { all, get, now, run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canSeeCompany, programScope, type User } from "@/lib/auth";

/** Un hilo existe entre una empresa y su mentor asignado o el mentor de una remisión vigente. */
export function linked(companyId: number, mentorId: number) {
  return !!get(`SELECT 1 FROM mentor_assignments WHERE company_id=? AND mentor_id=? AND active=1
    UNION SELECT 1 FROM referrals WHERE company_id=? AND mentor_id=? AND status NOT IN ('rechazada')
    UNION SELECT 1 FROM messages WHERE company_id=? AND mentor_id=?`, companyId, mentorId, companyId, mentorId, companyId, mentorId);
}

export type Thread = { company_id: number; mentor_id: number; razon_social: string; mentor: string; last_body?: string; last_at?: string; unread: number; role: "empresa" | "mentor" | "supervisor" };

/** Hilos visibles: la empresa los suyos; el mentor los de sus empresas; gestor/administrador (alcance programa u organización) en solo lectura. */
export function threadsFor(u: User): Thread[] {
  let pairs: { company_id: number; mentor_id: number; role: Thread["role"] }[] = [];
  if (u.company_id) {
    pairs = all<any>(`SELECT DISTINCT company_id, mentor_id FROM (
        SELECT company_id, mentor_id FROM mentor_assignments WHERE company_id=? AND active=1
        UNION SELECT company_id, mentor_id FROM referrals WHERE company_id=? AND mentor_id IS NOT NULL AND status NOT IN ('rechazada')
        UNION SELECT company_id, mentor_id FROM messages WHERE company_id=?)`, u.company_id, u.company_id, u.company_id).map((p) => ({ ...p, role: "empresa" }));
  } else {
    pairs = all<any>(`SELECT DISTINCT company_id, mentor_id FROM (
        SELECT company_id, mentor_id FROM mentor_assignments WHERE mentor_id=? AND active=1
        UNION SELECT company_id, mentor_id FROM referrals WHERE mentor_id=? AND status NOT IN ('rechazada')
        UNION SELECT company_id, mentor_id FROM messages WHERE mentor_id=?)`, u.id, u.id, u.id).map((p) => ({ ...p, role: "mentor" }));
    const ps = programScope(u, "messages.use");
    if (ps === null || ps.length) {
      const mine = new Set(pairs.map((p) => `${p.company_id}:${p.mentor_id}`));
      for (const p of all<any>("SELECT DISTINCT company_id, mentor_id FROM messages"))
        if (!mine.has(`${p.company_id}:${p.mentor_id}`) && canSeeCompany(u, p.company_id)) pairs.push({ ...p, role: "supervisor" });
    }
  }
  return pairs.map((p) => {
    const c = get<any>("SELECT razon_social FROM companies WHERE id=?", p.company_id);
    const m = get<any>("SELECT name FROM users WHERE id=?", p.mentor_id);
    const last = get<any>("SELECT body, sent_at FROM messages WHERE company_id=? AND mentor_id=? ORDER BY sent_at DESC, id DESC LIMIT 1", p.company_id, p.mentor_id);
    const unread = p.role === "supervisor" ? 0 : get<any>(`SELECT COUNT(*) n FROM messages WHERE company_id=? AND mentor_id=? AND read_at IS NULL AND ${p.role === "empresa" ? "from_user_id=mentor_id" : "from_user_id!=mentor_id"}`, p.company_id, p.mentor_id)?.n ?? 0;
    return { company_id: p.company_id, mentor_id: p.mentor_id, razon_social: c?.razon_social ?? "—", mentor: m?.name ?? "—", last_body: last?.body, last_at: last?.sent_at, unread, role: p.role };
  }).filter((t) => t.razon_social !== "—").sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
}

/** Marca como leídos los mensajes del otro participante (se llama al abrir el hilo). */
export async function markThreadRead(u: { id: number; email: string; company_id: number | null }, companyId: number, mentorId: number) {
  const cond = u.company_id ? "from_user_id=mentor_id" : "from_user_id!=mentor_id";
  const ids = all<any>(`SELECT id FROM messages WHERE company_id=? AND mentor_id=? AND read_at IS NULL AND ${cond}`, companyId, mentorId).map((r) => r.id);
  if (!ids.length) return 0;
  const ts = now();
  run(`UPDATE messages SET read_at=? WHERE id IN (${ids.map(() => "?").join(",")})`, ts, ...ids);
  await audit(u, "leer_mensajes", "message", ids.join(","), null, { company_id: companyId, mentor_id: mentorId, leidos: ids.length });
  return ids.length;
}
