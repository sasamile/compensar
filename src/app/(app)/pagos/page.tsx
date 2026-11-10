import { Wallet as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, requireUser, requirePerm } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Stat, Table, Td } from "@/components/ui";
import { fmtDate, money } from "@/lib/util";
import { aliadoReport, saved } from "@/lib/payments";
import { approvePayment } from "./actions";

export default async function Pagos({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "payments.view");
  const sp = await searchParams;
  const aliados = all<any>("SELECT * FROM aliados WHERE active=1");
  const aliadoId = Number(sp.aliado || aliados[0]?.id || 0);
  const period = sp.period || new Date().toISOString().slice(0, 7);
  const rep = aliadoId ? aliadoReport(aliadoId, period) : null;
  const sv = aliadoId ? saved(aliadoId, period) : null;
  return (
    <>
      <PageHeader icon={PageIcon} title="Soporte de pagos a aliados" subtitle="Servicios prestados y aceptados por periodo. No emite facturas ni se integra con ERP." />
      <Flash sp={sp} />
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Aliado"><select name="aliado" defaultValue={aliadoId} className="input">{aliados.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Periodo"><input type="month" name="period" defaultValue={period} className="input" /></Field>
        <button className="btn">Ver reporte</button>
        {rep && <a className="btn-ghost" href={`/api/reportes/R-09?aliado=${aliadoId}&period=${period}`}>Descargar Excel</a>}
      </form>
      {rep && (<>
        <div className="mb-4 grid gap-4 sm:grid-cols-4">
          <Stat label="Sesiones aceptadas" value={rep.totalSessions} hint={`de ${rep.rows.length} realizadas`} /><Stat label="Horas aceptadas" value={rep.totalHours} />
          <Stat label="Costo interno (informativo)" value={money(rep.totalCost)} /><Stat label="Estado" value={sv?.status === "aprobado" ? <Badge tone="green">aprobado</Badge> : <Badge tone="amber">pendiente</Badge>} />
        </div>
        <Table head={["Fecha", "Empresa", "Servicio", "Mentor", "Horas", "Aceptación de la empresa", "¿Cuenta?"]} empty="Sin sesiones realizadas en el periodo">
          {rep.rows.map((r) => <tr key={r.id} className={r.accepted_at ? "" : "bg-amber-50/60"}><Td>{fmtDate(r.scheduled_at)}</Td><Td>{r.razon_social}</Td><Td>{r.service}</Td><Td>{r.mentor}</Td><Td>{r.hours}</Td>
            <Td className="text-xs">{r.accepted_at ? `${r.accepter} · ${fmtDate(r.accepted_at)} · IP ${r.accepted_ip}` : "—"}</Td><Td>{r.cuenta}</Td></tr>)}
        </Table>
        {can(u, "payments.approve") && sv?.status !== "aprobado" && (
          <form action={approvePayment} className="mt-4"><input type="hidden" name="aliado_id" value={aliadoId} /><input type="hidden" name="period" value={period} />
            <button className="btn">Aprobar reporte como soporte de pago</button></form>)}
        {sv?.status === "aprobado" && <p className="mt-3 text-sm text-emerald-700">✓ Aprobado {fmtDate(sv.approved_at)}: {sv.total_sessions} sesiones, {sv.total_hours} h.</p>}
      </>)}
    </>
  );
}
