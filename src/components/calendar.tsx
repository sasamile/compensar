import Link from "next/link";

/**
 * Calendario mensual y semanal reutilizable (RF-CON-08). Componente de SERVIDOR, sin JavaScript en el cliente.
 *
 *   <Calendar view="month" | "week" date="2026-10-30" items={[{ id, title, start, end, href, color, subtitle }]} baseHref="/eventos?vista=calendario&programa=1" />
 *
 * - Hora de Colombia (UTC-5, sin horario de verano). `start`/`end` en ISO (o Date).
 * - La navegación (anterior / hoy / siguiente / Mes-Semana) son enlaces: conservan los parámetros de `baseHref`
 *   y cambian `cal` (vista) y `fecha` (YYYY-MM-DD). Se pueden renombrar con `viewParam` y `dateParam`.
 * - `calendarRange(view, date)` da el rango [from, to) en ISO para filtrar la consulta a lo visible.
 * - `readCalendarParams(sp)` lee la vista y la fecha de los searchParams (con valores por defecto).
 * - En celular se muestra como lista por día; en escritorio como cuadrícula.
 */
export type CalendarItem = {
  id: string | number; title: string; start: string | Date; end?: string | Date | null;
  href?: string; color?: string; subtitle?: string;
};
export type CalendarView = "month" | "week";

const DAY = 86400000, OFFSET = 5 * 3600000; // Colombia = UTC-5
const keyOf = (d: string | Date) => new Date(new Date(d).getTime() - OFFSET).toISOString().slice(0, 10);
const utcOf = (k: string) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (k: string, n: number) => new Date(utcOf(k) + n * DAY).toISOString().slice(0, 10);
const dow = (k: string) => (new Date(utcOf(k)).getUTCDay() + 6) % 7; // 0 = lunes
const validKey = (k?: string | null) => !!k && /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(utcOf(k));
const todayKey = () => keyOf(new Date());
const fmt = (k: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-CO", { ...o, timeZone: "UTC" }).format(new Date(utcOf(k)));
const timeOf = (d: string | Date, short = false) => new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", ...(short ? { hourCycle: "h23" as const } : {}) });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function bounds(view: CalendarView, date: string) {
  if (view === "week") { const s = addDays(date, -dow(date)); return { first: s, last: addDays(s, 6) }; }
  const mStart = date.slice(0, 8) + "01";
  const [y, m] = mStart.split("-").map(Number);
  const mEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first: addDays(mStart, -dow(mStart)), last: addDays(mEnd, 6 - dow(mEnd)), mStart, mEnd };
}

export function readCalendarParams(sp: Record<string, any>, viewParam = "cal", dateParam = "fecha"): { view: CalendarView; date: string } {
  return { view: sp?.[viewParam] === "week" ? "week" : "month", date: validKey(sp?.[dateParam]) ? sp[dateParam] : todayKey() };
}

/** Rango visible en ISO (UTC) para filtrar la consulta: [from, to). */
export function calendarRange(view: CalendarView, date: string | Date) {
  const k = typeof date === "string" && validKey(date) ? date : keyOf(date);
  const b = bounds(view, k);
  return { from: new Date(utcOf(b.first) + OFFSET).toISOString(), to: new Date(utcOf(b.last) + DAY + OFFSET).toISOString() };
}

function hrefWith(baseHref: string, params: Record<string, string>) {
  const u = new URL(baseHref || "?", "http://x");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.pathname + "?" + u.searchParams.toString();
}

export function Calendar({ view = "month", date, items, baseHref, viewParam = "cal", dateParam = "fecha", maxPerDay = 3, emptyText = "No hay actividades en este periodo." }: {
  view?: CalendarView; date?: string | Date; items: CalendarItem[]; baseHref: string;
  viewParam?: string; dateParam?: string; maxPerDay?: number; emptyText?: string;
}) {
  const ref = typeof date === "string" && validKey(date) ? date : keyOf(date ?? new Date());
  const b = bounds(view, ref);
  const today = todayKey();
  const link = (v: CalendarView, k: string) => hrefWith(baseHref, { [viewParam]: v, [dateParam]: k });

  // agrupar por día (eventos de varios días: se muestran cada día si duran ≤ 7 días; si no, solo el día de inicio)
  const byDay = new Map<string, (CalendarItem & { multi?: boolean })[]>();
  for (const it of items) {
    if (!it.start || isNaN(+new Date(it.start))) continue;
    const s = keyOf(it.start), e = it.end && !isNaN(+new Date(it.end)) ? keyOf(it.end) : s;
    const span = Math.round((utcOf(e) - utcOf(s)) / DAY);
    const days = span > 0 && span <= 7 ? Array.from({ length: span + 1 }, (_, i) => addDays(s, i)) : [s];
    for (const k of days) {
      if (k < b.first || k > b.last) continue;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push({ ...it, multi: days.length > 1 && k !== s });
    }
  }
  for (const list of byDay.values()) list.sort((x, y) => +new Date(x.start) - +new Date(y.start));

  const days: string[] = [];
  for (let k = b.first; k <= b.last; k = addDays(k, 1)) days.push(k);
  const prev = view === "month" ? addDays(b.mStart!, -1).slice(0, 8) + "01" : addDays(b.first, -7);
  const next = view === "month" ? addDays(b.mEnd!, 1) : addDays(b.first, 7);
  const title = view === "month" ? cap(fmt(b.mStart!, { month: "long", year: "numeric" }))
    : `${fmt(b.first, { day: "numeric", month: "short" })} – ${fmt(b.last, { day: "numeric", month: "short", year: "numeric" })}`;
  const inRange = days.filter((k) => view === "week" || (k >= b.mStart! && k <= b.mEnd!));
  const total = new Set(inRange.flatMap((k) => (byDay.get(k) ?? []).map((i) => i.id))).size;

  const Chip = ({ it, compact }: { it: CalendarItem & { multi?: boolean }; compact?: boolean }) => {
    const color = it.color || "var(--color-brand)";
    const body = (
      <>
        <span className="font-medium text-slate-800">{!it.multi && <span className="mr-1 tabular-nums text-slate-500">{timeOf(it.start, compact)}</span>}{it.title}</span>
        {it.subtitle && !compact && <span className="block truncate text-[11px] text-slate-500">{it.subtitle}</span>}
      </>
    );
    const cls = `block rounded-md border-l-[3px] px-1.5 py-1 text-xs leading-snug ${compact ? "truncate" : ""} ${it.href ? "hover:brightness-95 focus-visible:brightness-95" : ""}`;
    const style = { borderLeftColor: color, background: `color-mix(in srgb, ${color} 9%, white)` };
    return it.href
      ? <Link href={it.href} className={cls} style={style} title={`${timeOf(it.start)} · ${it.title}${it.subtitle ? " · " + it.subtitle : ""}`}>{body}</Link>
      : <div className={cls} style={style} title={it.title}>{body}</div>;
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,27,51,0.04)]" aria-label={`Calendario ${view === "month" ? "mensual" : "semanal"}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="text-xs text-slate-500">{total} {total === 1 ? "actividad" : "actividades"} · hora Colombia</p>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Navegación del calendario">
          <Link href={link(view, prev)} className="btn-ghost btn-sm" aria-label={view === "month" ? "Mes anterior" : "Semana anterior"}>‹ Anterior</Link>
          <Link href={link(view, today)} className="btn-ghost btn-sm">Hoy</Link>
          <Link href={link(view, next)} className="btn-ghost btn-sm" aria-label={view === "month" ? "Mes siguiente" : "Semana siguiente"}>Siguiente ›</Link>
          <span className="ml-1 inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs" role="group" aria-label="Vista">
            <Link href={link("month", ref)} aria-current={view === "month" ? "true" : undefined} className={`px-2.5 py-1 ${view === "month" ? "bg-brand font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Mes</Link>
            <Link href={link("week", ref)} aria-current={view === "week" ? "true" : undefined} className={`border-l border-slate-300 px-2.5 py-1 ${view === "week" ? "bg-brand font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Semana</Link>
          </span>
        </nav>
      </header>

      {/* escritorio: cuadrícula */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((k, i) => {
            const list = byDay.get(k) ?? [];
            const out = view === "month" && (k < b.mStart! || k > b.mEnd!);
            const shown = view === "month" ? list.slice(0, maxPerDay) : list;
            return (
              <div key={k} className={`${view === "month" ? "min-h-28" : "min-h-64"} border-b border-slate-100 p-1.5 ${i % 7 ? "border-l" : ""} ${out ? "bg-slate-50/70" : ""}`}>
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <Link href={link("week", k)} aria-current={k === today ? "date" : undefined} aria-label={fmt(k, { weekday: "long", day: "numeric", month: "long" })}
                    className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${k === today ? "bg-brand font-semibold text-white" : out ? "text-slate-300" : "text-slate-600 hover:bg-slate-100"}`}>
                    {Number(k.slice(8))}
                  </Link>
                  {view === "week" && <span className="text-[11px] text-slate-400">{fmt(k, { month: "short" })}</span>}
                </div>
                <div className="space-y-1">
                  {shown.map((it) => <Chip key={`${it.id}-${k}`} it={it} compact={view === "month"} />)}
                  {list.length > shown.length && <Link href={link("week", k)} className="block px-1 text-[11px] font-medium text-brand">+{list.length - shown.length} más</Link>}
                </div>
              </div>);
          })}
        </div>
      </div>

      {/* celular: lista por día */}
      <ol className="divide-y divide-slate-100 md:hidden">
        {inRange.filter((k) => view === "week" || byDay.has(k)).map((k) => (
          <li key={k} className="flex gap-3 px-4 py-3">
            <div className={`w-12 shrink-0 text-center ${k === today ? "text-brand" : "text-slate-500"}`}>
              <div className="text-[11px] uppercase">{fmt(k, { weekday: "short" })}</div>
              <div className="text-lg font-semibold tabular-nums">{Number(k.slice(8))}</div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {(byDay.get(k) ?? []).map((it) => <Chip key={`${it.id}-${k}`} it={it} />)}
              {!byDay.has(k) && <p className="pt-2 text-xs text-slate-400">Sin actividades</p>}
            </div>
          </li>))}
        {!total && view === "month" && <li className="px-4 py-8 text-center text-sm text-slate-400">{emptyText}</li>}
      </ol>
      {!total && <p className="hidden border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-400 md:block">{emptyText}</p>}
    </section>
  );
}
