import Link from "next/link";
import { redirect } from "next/navigation";
import { Trash2, Clock3 as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import * as L from "../agenda/agenda-lib";
import { addSlot, removeSlot } from "./actions";

/** Disponibilidad semanal del mentor (RF-ACO-04): franjas por día, hora y modalidad. */
export default async function Disponibilidad({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const managed = L.manageableMentors(u);
  if (!managed.length) redirect("/sin-acceso");
  const mentor = managed.find((m) => m.id === Number(sp.mentor)) ?? managed.find((m) => m.id === u.id) ?? managed[0];
  if (sp.mentor && mentor.id !== Number(sp.mentor)) redirect("/sin-acceso"); // un mentor ajeno no se abre ni por enlace
  const own = mentor.id === u.id;
  const slots = L.availability(mentor.id);
  const free = L.freeSlots(mentor.id, { days: 14 });
  const upcoming = all<any>(`SELECT s.id, s.title, s.scheduled_at, s.duration_min, c.razon_social FROM mentoring_sessions s JOIN companies c ON c.id=s.company_id
    WHERE s.mentor_id=? AND s.status='programada' AND s.scheduled_at>=? ORDER BY s.scheduled_at LIMIT 8`, mentor.id, new Date().toISOString());
  const hours = slots.reduce((a, x) => a + (L.toMin(x.end_time) - L.toMin(x.start_time)) / 60, 0);
  const MOD_CLS: Record<string, string> = { virtual: "border-blue-300 bg-blue-50 text-blue-800", presencial: "border-violet-300 bg-violet-50 text-violet-800", ambas: "border-teal-300 bg-teal-50 text-teal-800" };

  return (
    <>
      <PageHeader icon={PageIcon} title={own ? "Mi disponibilidad" : `Disponibilidad de ${mentor.name}`} subtitle="Franjas semanales en que las empresas pueden agendar sesiones (hora Colombia)"
        actions={<Link href={`/agenda?tab=calendario&mentor=${mentor.id}`} className="btn-ghost btn-sm">Ver en el calendario</Link>} />
      <Flash sp={sp} />
      {managed.length > 1 && (
        <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
          <Field label="Mentor"><select name="mentor" defaultValue={mentor.id} className="input !w-auto">{managed.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === u.id ? " (yo)" : ""}</option>)}</select></Field>
          <button className="btn-ghost">Ver</button>
        </form>)}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2" aria-label="Disponibilidad semanal">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold text-ink">Semana tipo</h2><span className="text-xs text-slate-500">{slots.length} franjas · {hours.toLocaleString("es-CO")} h por semana</span></div>
          {!slots.length ? <EmptyState title="Sin disponibilidad registrada">Agrega tus franjas para que las empresas puedan programar sesiones contigo eligiendo un horario libre.</EmptyState> : (
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <div key={d} className="rounded-lg border border-slate-200 p-2">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{L.WEEKDAYS[d]}</div>
                  {slots.filter((x) => x.weekday === d).map((x) => (
                    <div key={x.id} className={`mb-1 flex items-center justify-between gap-1 rounded border px-1.5 py-1 text-xs ${MOD_CLS[x.modality] ?? ""}`}>
                      <span><b>{x.start_time}–{x.end_time}</b><br />{x.modality}</span>
                      <form action={removeSlot}><input type="hidden" name="id" value={x.id} /><button className="rounded p-1 hover:bg-white/70" aria-label={`Eliminar franja ${L.WEEKDAYS[d]} ${x.start_time}–${x.end_time}`} title="Eliminar"><Trash2 size={13} /></button></form>
                    </div>))}
                  {!slots.some((x) => x.weekday === d) && <div className="text-xs text-slate-300">—</div>}
                </div>))}
            </div>)}

          <form action={addSlot} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-4">
            <input type="hidden" name="mentor_id" value={mentor.id} />
            <fieldset className="md:col-span-4"><legend className="label">Días</legend>
              <div className="flex flex-wrap gap-3 text-sm">{[1, 2, 3, 4, 5, 6, 7].map((d) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name="weekday" value={d} />{L.WEEKDAYS[d]}</label>)}</div>
            </fieldset>
            <Field label="Desde"><input type="time" name="start_time" required defaultValue="08:00" step={900} className="input" /></Field>
            <Field label="Hasta"><input type="time" name="end_time" required defaultValue="12:00" step={900} className="input" /></Field>
            <Field label="Modalidad"><select name="modality" className="input"><option value="virtual">Virtual</option><option value="presencial">Presencial</option><option value="ambas">Virtual o presencial</option></select></Field>
            <div className="self-end"><button className="btn">Agregar franja</button></div>
          </form>
        </section>

        <div className="space-y-5">
          <section className="card"><h2 className="mb-2 font-semibold text-ink">Próximas franjas libres</h2>
            {!free.length ? <p className="text-sm text-slate-400">Sin franjas libres en las próximas dos semanas.</p> : (
              <ul className="space-y-1 text-sm">{free.slice(0, 10).map((x) => <li key={x.start} className="flex justify-between"><span>{new Date(x.start).toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short" })}</span><span className="tabular-nums text-slate-500">{x.hm} · {x.modality}</span></li>)}
                {free.length > 10 && <li className="text-xs text-slate-400">y {free.length - 10} más</li>}</ul>)}
            <p className="mt-2 text-xs text-slate-400">Bloques de 60 min sin sesiones programadas.</p>
          </section>
          <section className="card"><h2 className="mb-2 font-semibold text-ink">Sesiones programadas</h2>
            {!upcoming.length ? <p className="text-sm text-slate-400">No hay sesiones próximas.</p> :
              <ul className="space-y-1 text-sm">{upcoming.map((x) => <li key={x.id}><Link className="text-brand" href={`/agenda/${x.id}`}>{x.title}</Link><div className="text-xs text-slate-500">{fmtDate(x.scheduled_at)} · {x.razon_social}</div></li>)}</ul>}
          </section>
        </div>
      </div>
    </>
  );
}
