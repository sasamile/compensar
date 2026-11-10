import Link from "next/link";
import { can, currentUser } from "@/lib/auth";
import { Progress } from "@/components/charts";
import { fmtNum, visibleIndicators } from "@/lib/indicators";
import { SegAvanceForm } from "@/components/seg-avance-form";

/**
 * Sección «Indicadores de la empresa» en el detalle de una sesión (FUN-84): el mentor de la sesión
 * registra el avance y queda enlazado a la sesión (indicator_values.session_id) como soporte.
 */
export async function SegIndicadoresSesion({ session }: { session: { id: number; company_id: number; mentor_id: number; status: string } }) {
  const u = await currentUser();
  if (!u) return null;
  const inds = visibleIndicators(u, { company: session.company_id });
  const canRegister = session.status !== "cancelada" && session.mentor_id === u.id && (can(u, "indicators.update") || can(u, "indicators.manage"));
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">Indicadores de la empresa</h2>
          <p className="text-xs text-slate-500">Avance hacia la meta. El mentor de la sesión registra aquí la medición; la sesión queda como soporte.</p>
        </div>
        {inds.length > 0 && <Link className="btn-ghost btn-sm" href={`/indicadores?tab=tablero&company=${session.company_id}`}>Ver tablero</Link>}
      </div>
      {!inds.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">La empresa aún no tiene indicadores aplicados.</p>
      ) : (
        <div className="card">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inds.map((i) => (
              <li key={i.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2 text-sm"><Link href={`/indicadores/${i.id}`} className="font-medium text-ink hover:text-brand">{i.name}</Link><span className="text-xs font-semibold">{i.pct == null ? "—" : `${i.pct}%`}</span></div>
                <div className="mb-2 text-xs text-slate-500">{fmtNum(i.baseline, i.unit)} → <b>{fmtNum(i.final, i.unit)}</b> · meta {fmtNum(i.goal, i.unit)}</div>
                <Progress value={i.pct ?? 0} />
              </li>))}
          </ul>
          {canRegister && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Registrar avance en esta sesión</h3>
              <SegAvanceForm indicators={inds} back={`/agenda/${session.id}`} sessionId={session.id} />
            </div>)}
        </div>)}
    </section>
  );
}
