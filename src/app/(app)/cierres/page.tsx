import { CheckCircle2 as PageIcon } from "lucide-react";
import { ExportButtons } from "@/components/ana-export";
import { all } from "@/lib/db";
import { can, companyFilter, requireUser, requirePerm } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import * as A from "./actions";

export default async function Cierres({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "closure.manage");
  const sp = await searchParams;
  const f = companyFilter(u);
  const cls = all<any>(`SELECT cl.*, c.razon_social, a.name approver, sv.name service FROM closures cl JOIN companies c ON c.id=cl.company_id LEFT JOIN users a ON a.id=cl.approved_by
    LEFT JOIN referrals r ON r.id=cl.referral_id LEFT JOIN servicios sv ON sv.id=r.servicio_id WHERE ${f.sql} ORDER BY cl.id DESC`, ...f.params);
  const refs = all<any>(`SELECT r.id, c.id cid, c.razon_social, sv.name service FROM referrals r JOIN companies c ON c.id=r.company_id JOIN servicios sv ON sv.id=r.servicio_id
    WHERE r.status IN ('aceptada','en curso') AND ${f.sql}`, ...f.params);
  const companies = all<any>(`SELECT c.id,c.razon_social FROM companies c WHERE c.status='activa' AND ${f.sql}`, ...f.params);
  return (
    <>
      <PageHeader icon={PageIcon} title="Resultados y cierres" subtitle="Consolida resultados e indicadores (inicio vs. fin) y aprueba el cierre" actions={<>{can(u, "analytics.view") && <ExportButtons compact href="/api/analitica/consulta?fuente=cierres" />}</>} />
      <Flash sp={sp} />
      <Table head={["Empresa", "Servicio", "Resultado consolidado", "Estado", "Aprobado por", ""]} empty="Sin cierres">
        {cls.map((c) => (
          <tr key={c.id}><Td>{c.razon_social}</Td><Td>{c.service || "Acompañamiento"}</Td><Td className="max-w-md text-xs">{c.result}</Td><Td><Badge>{c.status}</Badge></Td>
            <Td>{c.approver ? `${c.approver} · ${fmtDate(c.approved_at)}` : "—"}</Td>
            <Td>{c.status !== "aprobado" && can(u, "closure.approve") && <form action={A.approveClosure}><input type="hidden" name="id" value={c.id} /><button className="btn btn-sm">Aprobar cierre</button></form>}</Td></tr>))}
      </Table>
      <form action={A.proposeClosure} className="card mt-6 flex flex-wrap items-end gap-3">
        <div className="w-full font-semibold text-ink">Consolidar resultados de una empresa</div>
        <Field label="Empresa"><select name="company_id" className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></Field>
        <Field label="Servicio remitido (opcional)"><select name="referral_id" className="input"><option value="">Acompañamiento general</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.razon_social} · {r.service}</option>)}</select></Field>
        <button className="btn">Consolidar</button>
      </form>
    </>
  );
}
