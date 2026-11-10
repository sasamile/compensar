import { CalendarDays as PageIcon } from "lucide-react";
import { ExportButtons } from "@/components/ana-export";
import Link from "next/link";
import { all, get } from "@/lib/db";
import { can, programScope, requireUser, requirePerm } from "@/lib/auth";
import { Badge, EmptyState, Flash, PageHeader, Table, Td } from "@/components/ui";
import { Calendar, calendarRange, readCalendarParams } from "@/components/calendar";
import { fmtDate, localToIso } from "@/lib/util";
import { saveEvent } from "./actions";
import { EventFields } from "./event-form";

export const dynamic = "force-dynamic";
const PAGE = 50;
const STATUS_COLOR: Record<string, string> = { publicado: "#0a6cff", borrador: "#d97706", cerrado: "#64748b", inactivo: "#94a3b8" };

/** Listado y calendario de eventos (RF-CON-08) con buscador (RF-CON-12) y filtros por programa, tipo, modalidad, fecha y estado. */
export default async function Eventos({ searchParams }: { searchParams: Promise<any> }) {
  const t0 = performance.now();
  const u = await requireUser();
  if (!can(u, "events.manage") && !can(u, "attendance.manage") && !can(u, "registrations.view")) requirePerm(u, "events.manage");
  const sp = await searchParams;
  const scope = programScope(u, can(u, "events.manage") ? "events.manage" : can(u, "attendance.manage") ? "attendance.manage" : "registrations.view");
  const programs = all<any>("SELECT * FROM programs WHERE status='activo' ORDER BY name").filter((p) => scope === null || scope.includes(p.id));
  const createScope = programScope(u, "events.manage");
  const createPrograms = can(u, "events.manage") ? programs.filter((p) => createScope === null || createScope.includes(p.id)) : [];
  const vista = sp.vista === "calendario" ? "calendario" : "lista";
  const q = String(sp.q || "").trim().slice(0, 80);

  // filtros comunes a la lista y al calendario
  const where = ["1=1"]; const p: any[] = [];
  if (scope !== null) { where.push(`e.program_id IN (${scope.map(() => "?").join(",") || "NULL"})`); p.push(...scope); }
  for (const [k, col] of [["programa", "e.program_id"], ["modalidad", "e.modality"], ["tipo", "e.type"]] as const) if (sp[k]) { where.push(`${col}=?`); p.push(sp[k]); }
  if (sp.estado === "inactivo") where.push("e.active=0");
  else if (sp.estado) { where.push("e.status=? AND e.active=1"); p.push(sp.estado); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.desde || "")) { where.push("e.start_at>=?"); p.push(localToIso(sp.desde + "T00:00")); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.hasta || "")) { where.push("e.start_at<?"); p.push(new Date(new Date(localToIso(sp.hasta + "T00:00")!).getTime() + 86400000).toISOString()); }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push("(lower(e.title) LIKE ? OR lower(IFNULL(e.summary,'')) LIKE ? OR lower(IFNULL(e.description,'')) LIKE ? OR lower(IFNULL(e.place,'')) LIKE ? OR lower(IFNULL(e.owner,'')) LIKE ?)");
    p.push(like, like, like, like, like);
  }
  const cal = readCalendarParams(sp);
  const SELECT = `SELECT e.id, e.title, e.type, e.status, e.active, e.modality, e.start_at, e.end_at, e.capacity, e.sessions_count, e.slug, p.name program,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.waitlist=0) inscritos
    FROM events e JOIN programs p ON p.id=e.program_id`;
  let events: any[] = [], total = 0;
  const page = Math.max(1, Number(sp.pag) || 1);
  if (vista === "calendario") {
    const r = calendarRange(cal.view, cal.date);
    events = all<any>(`${SELECT} WHERE ${where.join(" AND ")} AND e.start_at<? AND IFNULL(e.end_at,e.start_at)>=? ORDER BY e.start_at`, ...p, r.to, r.from);
    total = events.length;
  } else {
    total = get<any>(`SELECT COUNT(*) n FROM events e WHERE ${where.join(" AND ")}`, ...p).n;
    events = all<any>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY e.start_at DESC LIMIT ? OFFSET ?`, ...p, PAGE, (page - 1) * PAGE);
  }
  const ms = Math.round(performance.now() - t0);

  const filters = { q, programa: sp.programa, tipo: sp.tipo, modalidad: sp.modalidad, estado: sp.estado, desde: sp.desde, hasta: sp.hasta };
  const qs = (extra: Record<string, any>) => {
    const u2 = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) u2.set(k, String(v));
    return `/eventos?${u2.toString()}`;
  };
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader icon={PageIcon} title="Eventos, charlas y cursos" subtitle="Convocatorias con landing pública, cupos, asistencia por sesión y certificados"
        actions={<>
          {can(u, "analytics.view") && <ExportButtons compact href="/api/analitica/consulta?fuente=eventos" />}
          {createPrograms.length > 0 && <a href={qs({ vista, nuevo: 1 }) + "#nuevo"} className="btn btn-sm">+ Nuevo evento o curso</a>}
        </>} />
      <Flash sp={sp} />

      <form className="card mb-4 grid gap-2 !p-3 text-sm sm:grid-cols-2 xl:grid-cols-6" role="search" aria-label="Buscar y filtrar eventos">
        <input type="hidden" name="vista" value={vista} />
        {vista === "calendario" && <><input type="hidden" name="cal" value={cal.view} /><input type="hidden" name="fecha" value={cal.date} /></>}
        <label className="sm:col-span-2"><span className="sr-only">Buscar</span>
          <input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre, descripción, lugar…" className="input" /></label>
        <label><span className="sr-only">Programa</span><select name="programa" defaultValue={sp.programa || ""} className="input"><option value="">Todos los programas</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span className="sr-only">Tipo</span><select name="tipo" defaultValue={sp.tipo || ""} className="input"><option value="">Todos los tipos</option><option value="evento">Evento</option><option value="charla">Charla</option><option value="curso">Curso</option><option value="convocatoria">Convocatoria</option></select></label>
        <label><span className="sr-only">Modalidad</span><select name="modalidad" defaultValue={sp.modalidad || ""} className="input"><option value="">Toda modalidad</option><option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="hibrido">Híbrida</option></select></label>
        <label><span className="sr-only">Estado</span><select name="estado" defaultValue={sp.estado || ""} className="input"><option value="">Todo estado</option><option value="borrador">Borrador</option><option value="publicado">Publicado</option><option value="cerrado">Cerrado</option><option value="inactivo">Inactivo</option></select></label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-6">
          <label className="flex items-center gap-2"><span className="text-xs text-slate-500">Desde</span><input type="date" name="desde" defaultValue={sp.desde} className="input !w-auto" /></label>
          <label className="flex items-center gap-2"><span className="text-xs text-slate-500">Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta} className="input !w-auto" /></label>
          <button className="btn btn-sm">Buscar</button>
          {anyFilter && <Link href={`/eventos?vista=${vista}`} className="btn-ghost btn-sm">Limpiar filtros</Link>}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="tablist" aria-label="Vista">
          <Link href={qs({ vista: "lista" })} role="tab" aria-selected={vista === "lista"} className={`px-3 py-1.5 ${vista === "lista" ? "bg-brand font-semibold text-white" : "bg-white text-slate-600"}`}>Lista</Link>
          <Link href={qs({ vista: "calendario", cal: cal.view, fecha: cal.date })} role="tab" aria-selected={vista === "calendario"} className={`border-l border-slate-300 px-3 py-1.5 ${vista === "calendario" ? "bg-brand font-semibold text-white" : "bg-white text-slate-600"}`}>Calendario</Link>
        </div>
        <p className="text-xs text-slate-500" aria-live="polite">{total} {total === 1 ? "evento" : "eventos"}{vista === "calendario" ? " en la vista" : ""} · respuesta en {ms} ms</p>
      </div>

      {vista === "calendario" ? (
        <Calendar view={cal.view} date={cal.date} baseHref={qs({ vista: "calendario" })}
          items={events.map((e) => ({
            id: e.id, title: e.title, start: e.start_at, end: e.end_at, href: `/eventos/${e.id}`,
            color: STATUS_COLOR[e.active ? e.status : "inactivo"], subtitle: `${e.program} · ${e.modality} · ${e.inscritos}/${e.capacity}`,
          }))} />
      ) : events.length ? (
        <>
          <Table head={["Evento", "Programa", "Fecha (hora Colombia)", "Modalidad", "Inscritos", "Estado", ""]}>
            {events.map((e) => (
              <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                <Td><Link href={`/eventos/${e.id}`} className="font-semibold text-ink hover:text-brand">{e.title}</Link>
                  <div className="text-xs text-slate-400">{e.type}{e.sessions_count > 1 ? ` · ${e.sessions_count} sesiones` : ""}</div></Td>
                <Td>{e.program}</Td><Td>{fmtDate(e.start_at)}</Td><Td>{e.modality}</Td>
                <Td>{e.inscritos}/{e.capacity}</Td><Td><Badge>{e.active ? e.status : "inactivo"}</Badge></Td>
                <Td><Link className="text-brand" href={`/eventos/${e.id}`}>Gestionar</Link></Td>
              </tr>))}
          </Table>
          {total > PAGE && (
            <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginación">
              <span className="text-slate-500">Página {page} de {Math.ceil(total / PAGE)}</span>
              <span className="flex gap-2">
                {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ vista: "lista", pag: page - 1 })}>‹ Anterior</Link>}
                {page * PAGE < total && <Link className="btn-ghost btn-sm" href={qs({ vista: "lista", pag: page + 1 })}>Siguiente ›</Link>}
              </span>
            </nav>)}
        </>
      ) : (
        <EmptyState title={anyFilter ? "Ningún evento coincide con la búsqueda" : "Aún no hay eventos"}>
          {anyFilter ? "Prueba con otras palabras o quita algunos filtros." : "Crea el primero con el formulario de abajo."}
        </EmptyState>
      )}

      {createPrograms.length > 0 && (
        <details id="nuevo" className="card mt-8 scroll-mt-20" open={!!sp.nuevo || (!total && !anyFilter)}>
          <summary className="cursor-pointer font-semibold text-ink">Crear convocatoria, evento, charla o curso</summary>
          <p className="mt-1 text-xs text-slate-500">Solo el nombre y la fecha de inicio son obligatorios. Marca «Publicar de inmediato» para abrir inscripciones al guardar.</p>
          <form action={saveEvent} className="mt-4 grid gap-3 md:grid-cols-4">
            <EventFields programs={createPrograms} />
            <div className="md:col-span-4"><button className="btn">Crear</button></div>
          </form>
        </details>)}
    </>
  );
}
