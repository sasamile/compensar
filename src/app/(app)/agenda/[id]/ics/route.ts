import { get } from "@/lib/db";
import { currentUser, sessionFilter } from "@/lib/auth";
import { buildIcs, calendarStatus } from "@/lib/integrations/m365";

/** Invitación de calendario (.ics) de la sesión, con el mismo UID y secuencia que el adaptador M365 (RF-ACO-04/05). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("No autenticado", { status: 401 });
  const id = Number((await params).id);
  const f = sessionFilter(u);
  const s = get<any>(`SELECT s.id, s.status FROM mentoring_sessions s WHERE s.id=? AND ${f.sql}`, id, ...f.params);
  if (!s) return new Response("Sin acceso", { status: 403 });
  const st = calendarStatus(id);
  const ics = buildIcs(id, { cancel: s.status === "cancelada", sequence: st?.sequence ?? 0 });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8; method=" + (s.status === "cancelada" ? "CANCEL" : "REQUEST"), "Content-Disposition": `attachment; filename="sesion-${id}.ics"`, "Cache-Control": "no-store" } });
}
