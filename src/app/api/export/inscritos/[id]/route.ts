import { get } from "@/lib/db";
import { can, canInProgram, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fileResponse, toCsv, toXlsx, XLSX_TYPE } from "@/lib/xlsx";
import { fmtDate } from "@/lib/util";
import { regFilterFrom, regFilterQuery, registrationsOf } from "@/lib/certificates";

/** Exportación de inscritos a Excel/CSV (RF-CON-13): respeta los filtros de la pantalla y el permiso de datos personales. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !(can(u, "registrations.view") || can(u, "events.manage"))) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const ev = get<any>("SELECT * FROM events WHERE id=?", Number(id));
  if (!ev) return new Response("No existe", { status: 404 });
  if (!["registrations.view", "events.manage", "attendance.manage"].some((p) => canInProgram(u, p, ev.program_id))) return new Response("Sin acceso", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const fmt = sp.fmt === "csv" ? "csv" : "xlsx";
  const pii = can(u, "registrations.export_pii"); // sin permiso se exporta sin datos personales (RF-CON-13)
  const f = regFilterFrom(sp);
  const rows = registrationsOf(ev, f, pii).map((r) => ({
    ...r, asistio: r.att.meets ? "Sí" : "No", espera: r.waitlist ? "Sí" : "No", fecha: fmtDate(r.created_at),
    sesiones: r.waitlist ? "" : `${r.att.count}/${r.att.n}`, detalle: r.att.sessions.join(" "), pct: r.waitlist ? "" : r.att.pct,
  }));
  const cols = [
    { header: "Empresa", key: "razon_social" }, { header: "NIT", key: "nit" },
    ...(pii ? [{ header: "Participante", key: "name" }, { header: "Correo", key: "email" }, { header: "Celular", key: "phone" }] : []),
    { header: "Código", key: "code" }, { header: "Estado", key: "status" }, { header: "Lista de espera", key: "espera" },
    { header: "Sesiones asistidas", key: "sesiones" }, { header: "Sesiones (n.º)", key: "detalle" }, { header: "% asistencia", key: "pct" },
    { header: "Cumple asistencia mínima", key: "asistio" }, { header: "Minutos", key: "minutes" }, { header: "Certificado", key: "cert" }, { header: "Inscrito", key: "fecha" },
  ];
  await audit(u, "exportar_inscritos", "event", ev.id, null, { fmt, pii, filtros: regFilterQuery(f) || "ninguno", filas: rows.length });
  return fmt === "csv"
    ? fileResponse(toCsv(cols, rows), `inscritos-${ev.id}.csv`, "text/csv; charset=utf-8")
    : fileResponse(await toXlsx("Inscritos", cols, rows), `inscritos-${ev.id}.xlsx`, XLSX_TYPE);
}
