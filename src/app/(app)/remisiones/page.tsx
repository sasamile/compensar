import { Share2 as PageIcon } from "lucide-react";
import { ExportButtons } from "@/components/ana-export";
import { all } from "@/lib/db";
import { can, companyFilter, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import * as A from "./actions";
import { redirect } from "next/navigation";

export default async function Remisiones({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const isCompany = !!u.company_id;
  if (!isCompany && !can(u, "referrals.create") && !can(u, "referrals.assign")) redirect("/sin-acceso");
  const cf = companyFilter(u);
  let where = `${cf.sql}`; const p = [...cf.params];
  if (u.aliado_id) { where += " AND r.aliado_id=?"; p.push(u.aliado_id); }
  const rows = all<any>(`SELECT r.*, c.razon_social, sv.name service, a.name aliado, m.name mentor FROM referrals r JOIN companies c ON c.id=r.company_id JOIN servicios sv ON sv.id=r.servicio_id
    JOIN aliados a ON a.id=r.aliado_id LEFT JOIN users m ON m.id=r.mentor_id WHERE ${where} ORDER BY r.id DESC`, ...p);
  const canAssign = can(u, "referrals.assign");
  const mentors = canAssign ? all<any>(`SELECT u2.id,u2.name,u2.aliado_id FROM users u2 JOIN user_roles ur ON ur.user_id=u2.id JOIN roles r ON r.id=ur.role_id WHERE r.key='mentor' AND u2.status='activo' AND ${u.aliado_id ? "u2.aliado_id=?" : "u2.aliado_id IS NOT NULL"}`, ...(u.aliado_id ? [u.aliado_id] : [])) : [];
  const companies = can(u, "referrals.create") ? all<any>(`SELECT c.id,c.razon_social FROM companies c WHERE c.status='activa' AND ${cf.sql}`, ...cf.params) : [];
  const services = can(u, "referrals.create") ? all<any>("SELECT s.id,s.name,a.name aliado FROM servicios s JOIN aliados a ON a.id=s.aliado_id WHERE s.active=1") : [];
  return (
    <>
      <PageHeader icon={PageIcon} title="Remisiones a servicios de aliados" subtitle="Estados: enviada → aceptada → en curso → cerrada (o rechazada)" actions={<>{can(u, "analytics.view") && <ExportButtons compact href="/api/analitica/consulta?fuente=remisiones" />}</>} />
      <Flash sp={sp} />
      <Table head={["Empresa", "Servicio", "Aliado", "Mentor asignado", "Estado", "Aceptación", "Acciones"]} empty="Sin remisiones">
        {rows.map((r) => (
          <tr key={r.id}>
            <Td>{r.razon_social}</Td><Td>{r.service}</Td><Td>{r.aliado}</Td><Td>{r.mentor || <span className="text-slate-300">sin asignar</span>}</Td>
            <Td><Badge>{r.status}</Badge></Td><Td className="text-xs">{r.accepted_at ? `${fmtDate(r.accepted_at)} · IP ${r.accepted_ip}` : "—"}</Td>
            <Td>
              {isCompany && r.status === "enviada" && can(u, "sessions.accept") && (
                <form action={A.respondReferral} className="flex gap-1"><input type="hidden" name="id" value={r.id} />
                  <button name="decision" value="aceptar" className="btn btn-sm">Aceptar</button><button name="decision" value="rechazar" className="btn-ghost btn-sm">Rechazar</button></form>)}
              {canAssign && ["enviada", "aceptada", "en curso"].includes(r.status) && (
                <form action={A.assignReferral} className="flex gap-1"><input type="hidden" name="id" value={r.id} />
                  <select name="mentor_id" defaultValue={r.mentor_id || ""} className="input !w-auto !py-1 text-xs"><option value="">Mentor…</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <button className="btn btn-sm">Asignar</button></form>)}
            </Td>
          </tr>))}
      </Table>
      {companies.length > 0 && (
        <form action={A.createReferral} className="card mt-6 flex flex-wrap items-end gap-3">
          <div className="w-full font-semibold text-ink">Remitir empresa a un servicio especializado</div>
          <Field label="Empresa"><select name="company_id" className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></Field>
          <Field label="Servicio (catálogo)"><select name="servicio_id" className="input">{services.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.aliado}</option>)}</select></Field>
          <button className="btn">Remitir</button>
        </form>)}
    </>
  );
}
