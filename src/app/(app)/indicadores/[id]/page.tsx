import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Section, Stat, Table, Td } from "@/components/ui";
import { LineChart, Progress } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { canRecord, canViewIndicators, dailyPoints, fmtNum, indicatorForUser, periodLabel, valuesOf } from "@/lib/indicators";
import { SegAvanceForm } from "@/components/seg-avance-form";
import * as A from "../actions";

export default async function IndicadorDetalle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!canViewIndicators(u)) redirect("/sin-acceso");
  const sp = await searchParams;
  const ind = indicatorForUser(u, Number((await params).id));
  if (!ind) redirect("/sin-acceso");
  const vals = valuesOf(ind.id);
  const pts = dailyPoints(vals);
  const series = pts.length ? [
    { label: "Valor registrado", points: [{ x: "Línea base", y: Number(ind.baseline ?? 0) }, ...pts] },
    { label: "Meta", points: [{ x: "Línea base", y: Number(ind.goal ?? 0) }, ...pts.map((p) => ({ x: p.x, y: Number(ind.goal ?? 0) }))], color: "#16a34a" },
  ] : [];
  // sesiones de la empresa que se pueden usar como soporte (el mentor solo las suyas)
  const mentorOnly = !can(u, "indicators.manage") && !u.company_id;
  const sessions = all<any>(`SELECT id, title, scheduled_at FROM mentoring_sessions WHERE company_id=? AND status!='cancelada' ${mentorOnly ? "AND mentor_id=?" : ""} ORDER BY scheduled_at DESC LIMIT 20`,
    ...(mentorOnly ? [ind.company_id, u.id] : [ind.company_id]));
  return (
    <>
      <PageHeader eyebrow={`${ind.razon_social} · ${ind.program ?? ""}${ind.service ? ` · ${ind.service}` : ""}`} title={ind.name}
        subtitle={`${ind.kind === "gestion" ? "Indicador de gestión" : "Indicador de impacto"} · medición ${periodLabel(ind.periodicity).toLowerCase()}${ind.formula ? ` · ${ind.formula}` : ""}`}
        actions={<><Link className="btn-ghost btn-sm" href={`/hoja-de-ruta/${ind.company_id}`}>Hoja de ruta</Link><Link className="btn-ghost btn-sm" href="/indicadores">← Indicadores</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Línea base" value={fmtNum(ind.baseline, ind.unit)} tone="slate" />
        <Stat label="Valor actual" value={fmtNum(ind.final, ind.unit)} hint={ind.last_at ? `al ${fmtDate(ind.last_at, false)}` : "sin avances"} />
        <Stat label="Meta" value={fmtNum(ind.goal, ind.unit)} tone="green" />
        <div className="card"><div className="text-[12px] font-medium text-slate-500">Cumplimiento</div><div className="mt-0.5 text-2xl font-semibold text-ink">{ind.pct == null ? "—" : `${ind.pct}%`}</div><div className="mt-2"><Progress value={ind.pct ?? 0} /></div></div>
      </div>

      <div className="card mt-5">
        <h2 className="mb-2 font-semibold text-ink">Evolución en el tiempo</h2>
        {series.length ? <LineChart series={series} height={220} /> : <p className="text-sm text-slate-400">Aún no hay avances registrados.</p>}
      </div>

      {canRecord(u) && (
        <Section title="Registrar avance" subtitle="Cada actualización lleva su soporte: evidencia adjunta o la sesión de mentoría/consultoría en que se midió.">
          <div className="card"><SegAvanceForm indicators={[ind]} back={`/indicadores/${ind.id}`} sessions={sessions} /></div>
        </Section>)}

      <Section title="Historial de avances" subtitle="Trazabilidad completa: quién, cuándo, valor, soporte">
        <Table head={["Fecha", "Valor", "Nota", "Soporte", "Registrado por"]} empty="Sin avances">
          {[...vals].reverse().map((v) => (
            <tr key={v.id}>
              <Td className="whitespace-nowrap">{fmtDate(v.recorded_at)}</Td><Td className="font-medium">{fmtNum(v.value, ind.unit)}</Td><Td className="max-w-sm text-xs">{v.note}</Td>
              <Td className="text-xs">
                {v.doc_id && <div><a className="text-brand" href={`/api/docs/${v.doc_id}`}>📎 {v.doc_name}</a></div>}
                {v.session_id && <div><Link className="text-brand" href={`/agenda/${v.session_id}`}>Sesión: {v.session_title}</Link></div>}
                {!v.doc_id && !v.session_id && <span className="text-slate-400">histórico</span>}
              </Td>
              <Td className="text-xs">{v.recorder ?? "—"} {v.recorder_company ? <Badge tone="violet">empresa</Badge> : null}</Td>
            </tr>))}
        </Table>
      </Section>

      {can(u, "indicators.manage") && (
        <Section title="Ajustar línea base y meta">
          <form action={A.updateTargets} className="card flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={ind.id} />
            <Field label="Línea base"><input name="baseline" inputMode="decimal" defaultValue={ind.baseline ?? ""} className="input" /></Field>
            <Field label="Meta *"><input name="goal" required inputMode="decimal" defaultValue={ind.goal ?? ""} className="input" /></Field>
            <Field label="Motivo"><input name="reason" className="input" placeholder="p. ej. acuerdo en comité" /></Field>
            <button className="btn-ghost">Guardar</button>
          </form>
          {ind.n_values === 0 && (
            <form action={A.removeIndicator} className="mt-2"><input type="hidden" name="id" value={ind.id} /><button className="btn-danger btn-sm">Retirar indicador de la empresa</button></form>)}
        </Section>)}
    </>
  );
}
