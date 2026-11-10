import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { TRACE_CATS, companyCases, companyTrace, companyVisible, filterTrace } from "@/lib/analytics";
import { fmtDate } from "@/lib/util";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui";
import PrintButton from "@/components/print-button";
import { ExportButtons } from "@/components/ana-export";

export const dynamic = "force-dynamic";
const COLORS: Record<string, string> = {
  vinculacion: "#0a6cff", validacion: "#7c3aed", diagnostico: "#0891b2", rutas: "#16a34a", servicios: "#f59e0b", sesiones: "#2563eb", eventos: "#db2777",
  documentos: "#64748b", resultados: "#15803d", encuestas: "#ca8a04", seguimiento: "#dc2626", auditoria: "#334155",
};

/** Trazabilidad de punta a punta de una empresa o caso (FUN-99, RF-ANA-07): una sola vista, filtrable y exportable. */
export default async function Trazabilidad({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const cid = Number((await params).companyId);
  if (u.company_id || !companyVisible(u, cid)) redirect("/sin-acceso");
  const sp = await searchParams;
  const c = get<any>("SELECT c.*, p.name program FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", cid);
  const withAudit = can(u, "audit.view") || can(u, "analytics.view");
  const all = companyTrace(cid, { audit: withAudit });
  const items = filterTrace(all, sp);
  const cases = companyCases(cid);
  const count = (k: string) => all.filter((i) => i.cat === k).length;
  const cats = TRACE_CATS.filter(([k]) => k !== "auditoria" || withAudit);
  const selected = sp.cat ? String(sp.cat).split(",") : [];
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as any)).toString();
  await audit(u, "consultar_trazabilidad", "company", cid, null, { filtros: qs || null });
  const mentor = get<any>("SELECT u.name FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=? AND a.active=1", cid);
  return (
    <>
      <PageHeader icon={PageIcon} title={`Trazabilidad · ${c.razon_social}`} subtitle={`NIT ${c.nit}-${c.dv} · ${c.program} · estado ${c.status}${mentor ? ` · mentor ${mentor.name}` : ""}`}
        actions={<><PrintButton label="Línea de tiempo → PDF" /><Link href={`/informe-final/${cid}`} className="btn-ghost btn-sm">Informe final</Link><Link href={`/empresas/${cid}`} className="btn-ghost btn-sm">Ficha de la empresa</Link></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Eventos registrados" value={all.length} hint={`${count("sesiones")} de sesiones · ${count("documentos")} de documentos`} />
        <Stat label="Servicios y remisiones" value={count("servicios")} />
        <Stat label="Resultados y cierres" value={count("resultados")} />
        <Stat label="Primer registro" value={<span className="text-base">{fmtDate(c.created_at, false)}</span>} />
      </div>
      <form className="card mb-5 space-y-3 print:hidden" aria-label="Filtros de la línea de tiempo">
        <fieldset><legend className="label">Etapas</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {cats.map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1">
                <input type="checkbox" name="cat" value={k} defaultChecked={selected.includes(k)} /><span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} aria-hidden />{l} <span className="text-xs text-slate-400">({count(k)})</span>
              </label>))}
          </div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label><span className="label">Caso</span><select name="caso" defaultValue={sp.caso || ""} className="input"><option value="">Toda la empresa</option>{cases.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label><span className="label">Buscar</span><input name="q" defaultValue={sp.q} className="input" placeholder="Texto, usuario…" /></label>
          <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={sp.desde} className="input" /></label>
          <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta} className="input" /></label>
          <div className="flex items-end gap-2"><button className="btn flex-1">Filtrar</button><Link href={`/trazabilidad/${cid}`} className="btn-ghost">Limpiar</Link></div>
        </div>
        <ExportButtons href={`/api/analitica/trazabilidad/${cid}?${qs}`} label="Exportar línea de tiempo" />
      </form>
      {items.length ? (
        <ol className="relative ml-3 border-l-2 border-slate-200" aria-label="Línea de tiempo">
          {items.map((i, n) => (
            <li key={n} className="mb-4 ml-5 break-inside-avoid">
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-slate-50" style={{ background: COLORS[i.cat] }} aria-hidden />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <time dateTime={i.at}>{fmtDate(i.at)}</time>
                <Badge tone="slate">{TRACE_CATS.find(([k]) => k === i.cat)?.[1]}</Badge>
                {i.ref && <Link href={`/trazabilidad/${cid}?caso=${i.ref}`} className="text-brand hover:underline">{i.ref.replace(":", " #")}</Link>}
              </div>
              <div className="text-sm font-medium text-ink">{i.link ? <Link href={i.link} className="hover:underline">{i.title}</Link> : i.title}</div>
              {i.detail && <div className="whitespace-pre-line break-words text-xs text-slate-600">{i.detail}</div>}
              {(i.who || i.ip) && <div className="text-[11px] text-slate-400">{i.who && <>Por {i.who}</>}{i.ip && <> · IP {i.ip}</>}</div>}
            </li>))}
        </ol>) : <EmptyState title="Sin registros">No hay eventos para los filtros elegidos.</EmptyState>}
      <p className="mt-4 text-xs text-slate-400">Generado el {fmtDate(new Date().toISOString())} por {u.name}. Fuente: datos transaccionales y registro de auditoría inalterable.</p>
    </>
  );
}
