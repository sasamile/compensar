import { Ticket as PageIcon } from "lucide-react";
import Link from "next/link";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Calendar, calendarRange, readCalendarParams } from "@/components/calendar";
import { plainText } from "@/components/rich-text";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";
const TYPE_COLOR: Record<string, string> = { curso: "#7c3aed", charla: "#0891b2", evento: "#0a6cff", convocatoria: "#d97706" };

/** Catálogo de convocatorias abiertas para empresas (RF-CON-09) con buscador, filtros y calendario (RF-CON-08). */
export default async function Catalogo({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const q = String(sp.q || "").trim().slice(0, 80);
  const vista = sp.vista === "calendario" ? "calendario" : "lista";
  const cal = readCalendarParams(sp);
  const programs = all<any>("SELECT DISTINCT p.id, p.name FROM programs p JOIN events e ON e.program_id=p.id WHERE e.status='publicado' AND e.active=1 ORDER BY p.name");
  const where = ["e.status='publicado'", "e.active=1"]; const p: any[] = [];
  for (const [k, col] of [["programa", "e.program_id"], ["modalidad", "e.modality"], ["tipo", "e.type"]] as const) if (sp[k]) { where.push(`${col}=?`); p.push(sp[k]); }
  if (q) { const like = `%${q.toLowerCase()}%`; where.push("(lower(e.title) LIKE ? OR lower(IFNULL(e.summary,'')) LIKE ? OR lower(IFNULL(e.description,'')) LIKE ?)"); p.push(like, like, like); }
  if (vista === "calendario") { const r = calendarRange(cal.view, cal.date); where.push("e.start_at<? AND IFNULL(e.end_at,e.start_at)>=?"); p.push(r.to, r.from); }
  else { where.push("IFNULL(e.end_at,e.start_at)>?"); p.push(new Date().toISOString()); } // abiertas: aún no terminan
  // el cupo se calcula en la misma consulta, siempre contra las inscripciones reales (RF-CON-09)
  const evs = all<any>(`SELECT e.id, e.title, e.type, e.modality, e.start_at, e.end_at, e.capacity, e.slug, e.summary, e.description, e.sessions_count, e.banner_doc_id, e.banner_url, p.name program,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.waitlist=0) taken,
      (SELECT 1 FROM registrations r WHERE r.event_id=e.id AND r.company_id=?) mine
    FROM events e JOIN programs p ON p.id=e.program_id WHERE ${where.join(" AND ")} ORDER BY e.start_at LIMIT 500`, u.company_id ?? -1, ...p);
  const filters = { q, programa: sp.programa, tipo: sp.tipo, modalidad: sp.modalidad };
  const qs = (extra: Record<string, any>) => { const x = new URLSearchParams(); for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) x.set(k, String(v)); return `/catalogo?${x}`; };
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader icon={PageIcon} title="Oferta disponible" subtitle="Convocatorias, eventos, charlas y cursos abiertos para tu empresa" />
      <form className="card mb-4 grid gap-2 !p-3 text-sm sm:grid-cols-2 lg:grid-cols-5" role="search" aria-label="Buscar en la oferta">
        <input type="hidden" name="vista" value={vista} />
        {vista === "calendario" && <><input type="hidden" name="cal" value={cal.view} /><input type="hidden" name="fecha" value={cal.date} /></>}
        <label className="lg:col-span-2"><span className="sr-only">Buscar</span><input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre o tema…" className="input" /></label>
        <label><span className="sr-only">Programa</span><select name="programa" defaultValue={sp.programa || ""} className="input"><option value="">Todos los programas</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label><span className="sr-only">Tipo</span><select name="tipo" defaultValue={sp.tipo || ""} className="input"><option value="">Todos los tipos</option><option value="evento">Evento</option><option value="charla">Charla</option><option value="curso">Curso</option><option value="convocatoria">Convocatoria</option></select></label>
        <label><span className="sr-only">Modalidad</span><select name="modalidad" defaultValue={sp.modalidad || ""} className="input"><option value="">Toda modalidad</option><option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="hibrido">Híbrida</option></select></label>
        <div className="flex gap-2 lg:col-span-5"><button className="btn btn-sm">Buscar</button>{anyFilter && <Link href={`/catalogo?vista=${vista}`} className="btn-ghost btn-sm">Limpiar</Link>}</div>
      </form>

      <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="tablist" aria-label="Vista">
        <Link href={qs({ vista: "lista" })} role="tab" aria-selected={vista === "lista"} className={`px-3 py-1.5 ${vista === "lista" ? "bg-brand font-semibold text-white" : "bg-white text-slate-600"}`}>Lista</Link>
        <Link href={qs({ vista: "calendario", cal: cal.view, fecha: cal.date })} role="tab" aria-selected={vista === "calendario"} className={`border-l border-slate-300 px-3 py-1.5 ${vista === "calendario" ? "bg-brand font-semibold text-white" : "bg-white text-slate-600"}`}>Calendario</Link>
      </div>

      {vista === "calendario" ? (
        <Calendar view={cal.view} date={cal.date} baseHref={qs({ vista: "calendario" })} emptyText="No hay oferta publicada en este periodo."
          items={evs.map((e) => ({ id: e.id, title: e.title, start: e.start_at, end: e.end_at, href: `/e/${e.slug}`, color: TYPE_COLOR[e.type] || "#0a6cff",
            subtitle: `${e.modality} · ${Math.max(0, e.capacity - e.taken)} cupos${e.mine ? " · inscrita" : ""}` }))} />
      ) : evs.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evs.map((e) => {
            const banner = e.banner_doc_id ? `/api/eventos/${e.id}/banner` : e.banner_url;
            const left = Math.max(0, e.capacity - e.taken);
            return (
              <article key={e.id} className="card flex flex-col overflow-hidden !p-0">
                {banner ? <img src={banner} alt="" className="h-32 w-full object-cover" /> : <div className="h-2" style={{ background: TYPE_COLOR[e.type] || "#0a6cff" }} />}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2"><Badge tone="blue">{e.type}</Badge>{e.mine ? <Badge tone="green">Inscrita</Badge> : null}</div>
                  <h3 className="mt-2 font-semibold text-ink">{e.title}</h3>
                  <p className="text-sm text-slate-500">{fmtDate(e.start_at)} · {e.modality}{e.sessions_count > 1 ? ` · ${e.sessions_count} sesiones` : ""}</p>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">{e.summary || plainText(e.description, 180)}</p>
                  <p className="mt-2 text-sm">Cupos: <b>{left}</b> de {e.capacity}{!left && <span className="text-amber-700"> · lista de espera</span>}</p>
                  <div className="mt-auto pt-3"><Link href={`/e/${e.slug}`} className="btn btn-sm">Ver detalle / inscribirme</Link></div>
                </div>
              </article>);
          })}
        </div>
      ) : (
        <EmptyState title={anyFilter ? "Nada coincide con tu búsqueda" : "No hay oferta abierta por ahora"}>{anyFilter ? "Prueba con otras palabras o quita filtros." : "Vuelve pronto: aquí verás las nuevas convocatorias."}</EmptyState>
      )}
    </>
  );
}
