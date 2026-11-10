import { Stethoscope as PageIcon } from "lucide-react";
/** RF-DIA-08: comparación del diagnóstico inicial con el final por empresa (insumo de impacto RF-RES-02). */
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, setting } from "@/lib/db";
import { can, companyFilter, requireUser } from "@/lib/auth";
import { EmptyState, PageHeader, Stat, Table, Td } from "@/components/ui";
import PrintButton from "@/components/print-button";
import { fmtDate, jparse } from "@/lib/util";
import type { Result } from "@/lib/forms";

const STAGE: Record<string, string> = { inicial: "Inicial", seguimiento: "Seguimiento", final: "Final" };

export default async function Comparacion({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "diagnostics.manage") && !can(u, "diagnostics.view") && !can(u, "diagnostics.self")) redirect("/sin-acceso");
  const sp = await searchParams;
  const cf = u.company_id && !can(u, "diagnostics.manage") ? { sql: "c.id=?", params: [u.company_id] } : companyFilter(u, "c");
  const all_ = all<any>(`SELECT d.*, c.razon_social company, f.name form, r.result FROM diagnostics d JOIN companies c ON c.id=d.company_id JOIN forms f ON f.id=d.form_id
    LEFT JOIN form_responses r ON r.id=d.response_id WHERE ${cf.sql} AND d.score IS NOT NULL ORDER BY d.company_id, d.form_id, d.id`, ...cf.params);
  // pares por empresa + instrumento: inicial (o el primero) vs final (o el último)
  const groups = new Map<string, any[]>();
  for (const d of all_) { const k = `${d.company_id}:${d.form_id}`; groups.set(k, [...(groups.get(k) || []), d]); }
  const pairs = [...groups.values()].filter((g) => g.length > 1).map((g) => {
    const a = g.find((x) => x.stage === "inicial") || g[0];
    const b = [...g].reverse().find((x) => x.stage === "final") || g[g.length - 1];
    return { a, b, delta: Math.round((b.score - a.score) * 10) / 10 };
  }).filter((p) => p.a.id !== p.b.id);
  const companyId = Number(sp.empresa) || (u.company_id ?? pairs[0]?.a.company_id);
  const sel = pairs.find((p) => p.a.company_id === companyId && (!sp.instrumento || p.a.form_id === Number(sp.instrumento))) || null;
  const color = setting("brand_color", "#0a6cff");
  const avg = pairs.length ? Math.round((pairs.reduce((s, p) => s + p.delta, 0) / pairs.length) * 10) / 10 : null;
  const companies = [...new Map(all_.map((d) => [d.company_id, d.company])).entries()];
  const ra = sel ? jparse<Result | null>(sel.a.result, null) : null, rb = sel ? jparse<Result | null>(sel.b.result, null) : null;

  return (
    <>
      <div className="mb-4 hidden items-center justify-between border-b-4 pb-3 print:flex" style={{ borderColor: color }}>
        <b className="text-xl">{setting("brand_name", "Compensar")}</b><span className="text-sm">Comparación de diagnósticos</span>
      </div>
      <PageHeader icon={PageIcon} title="Comparación inicial vs. final" subtitle="Mide el avance de la empresa entre diagnósticos del mismo instrumento"
        actions={<><Link href="/diagnosticos" className="btn-ghost print:hidden">Volver</Link>{sel && <PrintButton label="Descargar PDF" />}</>} />
      {!u.company_id && (
        <div className="mb-5 grid gap-3 md:grid-cols-3 print:hidden">
          <Stat label="Empresas con dos o más diagnósticos" value={pairs.length} />
          <Stat label="Cambio promedio" value={avg == null ? "—" : `${avg > 0 ? "+" : ""}${avg}`} hint="puntos sobre 100" />
          <Stat label="Empresas que mejoraron" value={pairs.filter((p) => p.delta > 0).length} />
        </div>)}
      {companies.length > 1 && (
        <form className="mb-4 flex flex-wrap gap-2 text-sm print:hidden">
          <select name="empresa" defaultValue={companyId || ""} className="input !w-auto" aria-label="Empresa">
            {companies.map(([id, n]) => <option key={id} value={id}>{n}{pairs.some((p) => p.a.company_id === id) ? "" : " (un solo diagnóstico)"}</option>)}
          </select>
          <button className="btn-ghost">Ver</button>
        </form>)}

      {!sel || !ra || !rb ? (
        <EmptyState title="Aún no hay dos diagnósticos para comparar">
          La comparación aparece cuando la empresa tiene un diagnóstico inicial y uno final (o de seguimiento) del mismo instrumento con resultado.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card text-center"><div className="label">{STAGE[sel.a.stage]} · {fmtDate(sel.a.completed_at || sel.a.created_at, false)}</div><div className="text-3xl font-bold text-slate-600">{ra.total}</div><div className="text-sm">{ra.level}</div></div>
            <div className="card text-center"><div className="label">{STAGE[sel.b.stage]} · {fmtDate(sel.b.completed_at || sel.b.created_at, false)}</div><div className="text-3xl font-bold" style={{ color }}>{rb.total}</div><div className="text-sm">{rb.level}</div></div>
            <div className="card text-center"><div className="label">Cambio</div>
              <div className={`text-3xl font-bold ${sel.delta > 0 ? "text-emerald-600" : sel.delta < 0 ? "text-red-600" : "text-slate-500"}`}>{sel.delta > 0 ? "+" : ""}{sel.delta}</div>
              <div className="text-sm">{ra.level !== rb.level ? `${ra.level} → ${rb.level}` : "Mismo nivel"}</div></div>
          </div>
          <div className="card break-inside-avoid">
            <h2 className="mb-1 font-semibold text-ink">{sel.a.company} · {sel.a.form}</h2>
            <div className="mb-4 flex gap-4 text-xs"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />{STAGE[sel.a.stage]}</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{STAGE[sel.b.stage]}</span></div>
            <div className="space-y-4" role="img" aria-label={rb.sections.map((s) => `${s.name}: ${ra.sections.find((x) => x.id === s.id)?.score ?? "—"} → ${s.score}`).join("; ")}>
              {rb.sections.map((s) => {
                const before = ra.sections.find((x) => x.id === s.id || x.name === s.name)?.score ?? 0;
                const dd = Math.round((s.score - before) * 10) / 10;
                return (
                  <div key={s.id}>
                    <div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span className={`font-medium ${dd > 0 ? "text-emerald-700" : dd < 0 ? "text-red-700" : "text-slate-500"}`}>{dd > 0 ? "+" : ""}{dd}</span></div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2"><div className="h-2.5 rounded-full bg-slate-400" style={{ width: `${before}%` }} /><span className="text-[11px] text-slate-500">{before}</span></div>
                      <div className="flex items-center gap-2"><div className="h-2.5 rounded-full" style={{ width: `${s.score}%`, background: color }} /><span className="text-[11px] text-slate-700">{s.score}</span></div>
                    </div>
                  </div>);
              })}
            </div>
          </div>
          <div className="flex gap-2 print:hidden"><Link className="btn-ghost btn-sm" href={`/diagnosticos/${sel.a.id}`}>Ver diagnóstico {STAGE[sel.a.stage].toLowerCase()}</Link><Link className="btn-ghost btn-sm" href={`/diagnosticos/${sel.b.id}`}>Ver diagnóstico {STAGE[sel.b.stage].toLowerCase()}</Link></div>
        </div>)}

      {!u.company_id && pairs.length > 0 && (
        <div className="mt-8 print:hidden">
          <h2 className="mb-3 font-semibold text-ink">Impacto por empresa</h2>
          <Table head={["Empresa", "Instrumento", "Inicial", "Final", "Cambio", "Nivel", ""]}>
            {pairs.map((p) => (
              <tr key={p.a.id}><Td><b>{p.a.company}</b></Td><Td className="text-xs">{p.a.form}</Td><Td>{p.a.score}</Td><Td>{p.b.score}</Td>
                <Td className={p.delta > 0 ? "font-medium text-emerald-700" : p.delta < 0 ? "font-medium text-red-700" : ""}>{p.delta > 0 ? "+" : ""}{p.delta}</Td>
                <Td className="text-xs">{p.a.level} → {p.b.level}</Td>
                <Td><Link className="text-brand" href={`/diagnosticos/comparacion?empresa=${p.a.company_id}&instrumento=${p.a.form_id}`}>Comparar</Link></Td></tr>))}
          </Table>
        </div>)}
    </>
  );
}
