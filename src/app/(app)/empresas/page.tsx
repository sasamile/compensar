import { Building2 as PageIcon } from "lucide-react";
import { ExportButtons } from "@/components/ana-export";
import Link from "next/link";
import { all, get } from "@/lib/db";
import { can, companyFilter, programScope, requireUser, requirePerm } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import * as A from "./actions";
import { SOURCES, sourceLabel } from "@/lib/jobs/plataforma";

export default async function Empresas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "companies.view");
  const sp = await searchParams;
  const f = companyFilter(u);
  const where = [f.sql]; const p = [...f.params];
  for (const [k, col] of [["estado", "c.status"], ["programa", "c.program_id"], ["origen", "c.source"]] as const) if (sp[k]) { where.push(`${col}=?`); p.push(sp[k]); }
  if (sp.origen === "otro") { where.pop(); p.pop(); where.push("(c.source='otro' OR c.source LIKE 'otro:%')"); }
  if (sp.q) { where.push("(c.razon_social LIKE ? OR c.nit LIKE ?)"); p.push(`%${sp.q}%`, `%${sp.q}%`); }
  const rows = all<any>(`SELECT c.*, p.name program, (SELECT u.name FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=c.id AND a.active=1) mentor
    FROM companies c JOIN programs p ON p.id=c.program_id WHERE ${where.join(" AND ")} ORDER BY c.status, c.id DESC`, ...p);
  const act = can(u, "companies.activate"), asg = can(u, "mentors.assign");
  const scope = programScope(u, "companies.activate");
  const programs = all<any>("SELECT * FROM programs").filter((x) => scope === null || scope.includes(x.id));
  const mentors = asg ? all<any>(`SELECT u.id,u.name FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.key IN ('mentor','evaluador') AND u.status='activo' AND u.aliado_id IS NULL`) : [];
  return (
    <>
      <PageHeader icon={PageIcon} title="Empresas" subtitle="Activación, mentores y perfil — solo ves las que tu rol permite"
        actions={<>{can(u, "analytics.view") && <ExportButtons compact href="/api/analitica/consulta?fuente=empresas" />}{act && <Link href="/empresas/cargue" className="btn">⬆ Cargue masivo (Excel, CSV, JSON)</Link>}</>} />
      <Flash sp={sp} />
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Buscar razón social o NIT" className="input !w-64" />
        <select name="estado" defaultValue={sp.estado || ""} className="input !w-auto"><option value="">Todos los estados</option><option>pendiente</option><option>activa</option><option>suspendida</option></select>
        <select name="origen" defaultValue={sp.origen || ""} className="input !w-auto" aria-label="Origen"><option value="">Todos los orígenes</option>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="manual">Creación individual</option><option value="autorregistro">Autorregistro</option></select>
        <button className="btn-ghost">Filtrar</button>
      </form>
      <form>
        <input type="hidden" name="back" value="/empresas" />
        <Table head={[...(act || asg ? [""] : []), "Empresa", "NIT", "Programa", "Estado", "Mentor", "Origen", ""]}>
          {rows.map((c) => (
            <tr key={c.id}>
              {(act || asg) && <Td><input type="checkbox" name="id" value={c.id} /></Td>}
              <Td><b>{c.razon_social}</b><div className="text-xs text-slate-400">{c.sector} · {c.city}</div></Td><Td>{c.nit}-{c.dv}</Td><Td>{c.program}</Td>
              <Td><Badge>{c.status}</Badge></Td><Td>{c.mentor || <span className="text-slate-300">—</span>}</Td><Td className="text-xs">{sourceLabel(c.source)}</Td>
              <Td><Link className="text-brand" href={`/empresas/${c.id}`}>Ver</Link></Td>
            </tr>))}
        </Table>
        {(act || asg) && rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <span className="text-slate-500">Con las seleccionadas:</span>
            {act && <>
              <button formAction={A.activateCompanies} className="btn btn-sm">Activar</button>
              <button formAction={A.suspendCompanies} className="btn-ghost btn-sm">Suspender</button></>}
            {asg && <>
              <select name="mentor_id" className="input !w-auto !py-1 text-xs"><option value="">Mentor…</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <button formAction={A.assignMentor} className="btn btn-sm">Asignar / reasignar mentor</button></>}
          </div>)}
      </form>
      {act && (
        <form action={A.createCompany} className="card mt-6 grid gap-3 md:grid-cols-4">
          <div className="font-semibold text-ink md:col-span-4">Crear empresa y representante (individual)</div>
          <Field label="Razón social *"><input name="razon_social" required className="input" /></Field>
          <Field label="NIT (sin DV) *"><input name="nit" required className="input" /></Field>
          <Field label="DV *"><input name="dv" required maxLength={1} className="input" /></Field>
          <Field label="Programa"><select name="program_id" className="input">{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Sector"><input name="sector" className="input" /></Field>
          <Field label="Tamaño"><select name="size" className="input"><option>Micro</option><option>Pequeña</option><option>Mediana</option></select></Field>
          <Field label="Ciudad"><input name="city" className="input" /></Field>
          <div />
          <Field label="Representante *"><input name="rep" required className="input" /></Field>
          <Field label="Correo *"><input name="email" type="email" required className="input" /></Field>
          <Field label="Celular"><input name="phone" className="input" /></Field>
          <div className="self-end"><button className="btn">Crear</button></div>
        </form>)}
    </>
  );
}
