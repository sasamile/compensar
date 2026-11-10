import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { get, setting } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Flash } from "@/components/ui";
import { RichText, plainText } from "@/components/rich-text";
import { fmtDate } from "@/lib/util";
import { sessionsCount } from "@/lib/certificates";
import { register } from "../../(app)/eventos/actions";
import { BotFields } from "@/components/bot-fields";

export const dynamic = "force-dynamic";

/**
 * Landing pública por evento (RF-CON-07) con tres plantillas parametrizables: «clasica», «destacada» y «minimal»
 * (campo events.landing_template). Todas mantienen la marca (nombre, color y logo), el enlace corto, el QR,
 * los cupos en tiempo real, el formulario externo/propio y la inscripción. Solo eventos publicados y activos.
 */
const load = (slug: string) => get<any>("SELECT e.*, p.name program FROM events e JOIN programs p ON p.id=e.program_id WHERE e.slug=? AND e.status='publicado' AND e.active=1", slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const ev = load((await params).slug);
  const brand = setting("brand_name", "Compensar");
  return ev ? { title: `${ev.title} · ${brand}`, description: ev.summary || plainText(ev.description, 160) } : { title: brand };
}

const MOD: Record<string, string> = { presencial: "Presencial", virtual: "Virtual", hibrido: "Híbrida" };

export default async function Landing({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<any> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ev = load(slug);
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff"), tagline = setting("brand_tagline");
  const hasLogo = !!setting("brand_logo_doc");
  if (!ev) return <div className="grid min-h-screen place-items-center p-6"><p className="text-slate-500">Este evento no está disponible.</p></div>;
  const u = await currentUser();
  const taken = get<any>("SELECT COUNT(*) n FROM registrations WHERE event_id=? AND waitlist=0", ev.id).n;
  const left = Math.max(0, ev.capacity - taken);
  const mine = u?.company_id ? get<any>("SELECT * FROM registrations WHERE event_id=? AND company_id=?", ev.id, u.company_id) : null;
  const form = ev.form_id ? get<any>("SELECT name, slug FROM forms WHERE id=? AND status='publicado'", ev.form_id) : null;
  const banner: string | null = ev.banner_doc_id ? `/api/eventos/${ev.id}/banner` : ev.banner_url || null;
  const n = sessionsCount(ev);
  const h = await headers();
  const origin = (process.env.APP_URL || (h.get("host") ? `${h.get("x-forwarded-proto") || "http"}://${h.get("x-forwarded-host") || h.get("host")}` : "")).replace(/\/$/, "");
  const shortPath = `/e/${ev.slug}`;
  const tpl = ["destacada", "minimal"].includes(ev.landing_template) ? ev.landing_template : "clasica";
  const vars = { ["--ev" as any]: color } as React.CSSProperties;
  const when = ev.end_at && fmtDate(ev.end_at, false) !== fmtDate(ev.start_at, false) ? `${fmtDate(ev.start_at)} → ${fmtDate(ev.end_at, false)}` : fmtDate(ev.start_at);
  const pctTaken = ev.capacity ? Math.min(100, Math.round((taken * 100) / ev.capacity)) : 100;

  /* ---------------- piezas comunes ---------------- */
  const BrandMark = ({ light }: { light?: boolean }) => (
    <div className="flex items-center gap-2">
      {hasLogo ? <img src="/api/marca/logo" alt={brand} className={`h-8 w-auto max-w-40 object-contain ${light ? "rounded bg-white/90 p-1" : ""}`} />
        : <span className={`grid h-8 w-8 place-items-center rounded-lg font-bold ${light ? "bg-white/15 text-white" : "text-white"}`} style={light ? undefined : { background: color }}>{brand[0]}</span>}
      <b className={light ? "text-white" : "text-ink"}>{brand}</b>
    </div>
  );
  const facts: [string, React.ReactNode][] = [
    ["Fecha y hora (Colombia)", when],
    ["Modalidad", <>{MOD[ev.modality] || ev.modality}{ev.place && <span className="block break-words text-sm text-slate-500">{ev.place}</span>}</>],
    ...(n > 1 ? [["Sesiones", <>{n} sesiones · certifica con {ev.min_attendance ?? 80} % de asistencia</>] as [string, React.ReactNode]] : []),
    ["Cupos disponibles", <><b className="text-xl" aria-live="polite">{left}</b> <span className="text-slate-400">de {ev.capacity}</span></>],
    ["Dirigido a", ev.audience || "Empresas del programa"],
    ...(ev.requirements ? [["Requisitos", ev.requirements] as [string, React.ReactNode]] : []),
  ];
  const Links = () => (
    <>
      {ev.external_form_url && /^https?:\/\//i.test(ev.external_form_url) && (
        <p className="mt-4"><a href={ev.external_form_url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color }}>Completar formulario adicional (Microsoft Forms) →</a></p>)}
      {form && <p className="mt-2"><a href={`/f/${form.slug}`} className="font-medium underline underline-offset-2" style={{ color }}>Diligenciar formulario: {form.name} →</a></p>}
    </>
  );
  const Description = ({ className = "" }: { className?: string }) =>
    <RichText text={ev.description} className={`text-slate-700 ${className}`} linkClass="font-medium underline underline-offset-2 text-[var(--ev)]" />;
  const Register = () => (
    <div id="inscripcion" className="scroll-mt-6">
      <Flash sp={sp} />
      {mine ? (
        <div className="text-center"><div className="text-3xl" aria-hidden>🎟️</div><b>Tu empresa está inscrita</b>
          <p className="text-sm text-slate-500">Código: <code>{mine.code}</code> {mine.waitlist ? "· En lista de espera" : ""}</p>
          {!mine.waitlist && <><img className="mx-auto mt-2" src={`/api/qr?t=${mine.code}`} width={140} height={140} alt={`QR de asistencia ${mine.code}`} />
            <p className="mt-1 text-xs text-slate-400">Presenta este QR {n > 1 ? "en cada sesión" : "el día del evento"} para registrar tu asistencia.</p></>}
        </div>
      ) : !u ? (
        <div className="text-center"><p className="mb-3 text-sm text-slate-600">Para inscribirte ingresa con la cuenta de tu empresa.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={`/login?mode=codigo&next=${shortPath}`} className="btn" style={{ background: color }}>Ingresar para inscribirme</Link>
            <Link href="/registro" className="btn-ghost">Registrar mi empresa</Link></div></div>
      ) : (
        <form action={register} className="space-y-3"><BotFields />
          <input type="hidden" name="slug" value={ev.slug} /><input type="hidden" name="consent_version" value={setting("consent_version")} />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1" required /><span>{setting("consent_text")} <i className="text-xs text-slate-400">({setting("consent_version")})</i></span></label>
          {left === 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="waitlist" />El cupo está lleno: unirme a la lista de espera</label>}
          <button className="btn w-full" style={{ background: color }}>{left === 0 ? "Unirme a la lista de espera" : "Inscribir a mi empresa"}</button>
          <p className="text-center text-xs text-slate-400">Inscrito como {u.name}</p>
        </form>)}
    </div>
  );
  const Share = ({ compact }: { compact?: boolean }) => (
    <div className={`flex items-center gap-3 ${compact ? "" : "rounded-xl border border-slate-200 bg-white p-3"}`}>
      <img src={`/api/qr?t=${encodeURIComponent(origin + shortPath)}`} alt="Código QR de esta página" width={84} height={84} className="shrink-0" />
      <div className="min-w-0 text-xs text-slate-500"><div className="font-semibold text-slate-700">Comparte este evento</div>
        <code className="mt-1 block break-all text-[11px] text-slate-600">{origin + shortPath}</code></div>
    </div>
  );
  const Bar = () => (
    <div className="mt-2" aria-hidden><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full" style={{ width: `${pctTaken}%`, background: color }} /></div></div>
  );

  /* ---------------- plantilla Destacada ---------------- */
  if (tpl === "destacada") return (
    <div className="min-h-screen bg-slate-50" style={vars}>
      <header className="relative isolate overflow-hidden text-white">
        {banner ? <img src={banner} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          : <div className="absolute inset-0 -z-10" style={{ background: `linear-gradient(135deg, ${color}, #0b2a66)` }} />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-slate-900/30" />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><BrandMark light /><span className="hidden text-sm opacity-80 sm:block">{tagline}</span></div>
        <div className="mx-auto flex min-h-[52vh] max-w-6xl flex-col justify-end px-4 pb-10 pt-16 sm:px-6 sm:pb-14">
          <span className="w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]" style={{ background: color }}>{ev.type} · {ev.program}</span>
          <h1 className="mt-4 max-w-4xl text-3xl font-bold leading-tight sm:text-5xl">{ev.title}</h1>
          {ev.summary && <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{ev.summary}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <a href="#inscripcion" className="btn" style={{ background: color }}>{mine ? "Ver mi inscripción" : left ? "Inscribirme" : "Lista de espera"}</a>
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{when}</span>
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{left} cupos de {ev.capacity}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <dl className="grid gap-3 sm:grid-cols-2">
            {facts.map(([k, v]) => <div key={k} className="card !p-4"><dt className="label">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {ev.description && <section className="card"><h2 className="mb-3 text-lg font-semibold text-ink">Acerca de</h2><Description /><Links /></section>}
          {!ev.description && <Links />}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card"><h2 className="text-base font-semibold text-ink">Inscripción</h2>
            <p className="text-sm text-slate-500">{left} de {ev.capacity} cupos disponibles</p><Bar />
            <div className="mt-4"><Register /></div></div>
          <Share />
        </aside>
      </main>
      <footer className="py-6 text-center text-xs text-slate-400">{brand} · {tagline}</footer>
    </div>
  );

  /* ---------------- plantilla Minimal ---------------- */
  if (tpl === "minimal") return (
    <div className="min-h-screen bg-white" style={vars}>
      <div className="h-1.5" style={{ background: color }} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <BrandMark />
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color }}>{ev.type} · {ev.program}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{ev.title}</h1>
        {ev.summary && <p className="mt-3 text-lg text-slate-600">{ev.summary}</p>}
        {banner && <img src={banner} alt={`Imagen de ${ev.title}`} className="mt-6 aspect-[3/1] w-full rounded-xl object-cover" />}
        <dl className="mt-8 divide-y divide-slate-100 border-y border-slate-100 text-sm">
          {facts.map(([k, v]) => <div key={k} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-slate-500">{k}</dt><dd className="text-slate-800">{v}</dd></div>)}
        </dl>
        <Description className="mt-8" />
        <Links />
        <section className="mt-10 border-t border-slate-200 pt-8">
          <h2 className="mb-1 text-lg font-semibold text-ink">Inscripción</h2>
          <p className="mb-4 text-sm text-slate-500">{left} de {ev.capacity} cupos disponibles</p>
          <Register />
        </section>
        <div className="mt-10 border-t border-slate-100 pt-6"><Share compact /></div>
      </main>
    </div>
  );

  /* ---------------- plantilla Clásica ---------------- */
  return (
    <div className="min-h-screen bg-slate-50" style={vars}>
      <header className="relative overflow-hidden text-white" style={{ background: `linear-gradient(135deg, ${color}, #0b2a66)` }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <BrandMark light /><span className="hidden text-sm opacity-80 sm:block">{tagline}</span>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-12 pt-6 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/75">{ev.type} · {ev.program}</div>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-tight md:text-4xl">{ev.title}</h1>
          {ev.summary && <p className="mt-3 max-w-2xl text-white/85">{ev.summary}</p>}
        </div>
      </header>
      <main className="mx-auto -mt-6 max-w-4xl px-4 pb-10 sm:px-6">
        {banner && <img src={banner} alt={`Imagen de ${ev.title}`} className="mb-5 max-h-72 w-full rounded-2xl object-cover shadow-lg" />}
        <dl className={`relative my-5 grid gap-3 sm:grid-cols-2 ${facts.length > 4 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {facts.map(([k, v]) => <div key={k} className="card !p-4"><dt className="label">{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <Description />
        <Links />
        <div className="card mt-6"><Register /></div>
        <div className="mt-6"><Share /></div>
      </main>
    </div>
  );
}
