import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { companiesList } from "@/lib/analytics";
import { fmtDate } from "@/lib/util";
import { Badge, PageHeader, Table, Td } from "@/components/ui";

/** Buscador de empresas para abrir su trazabilidad de punta a punta (FUN-99). */
export default async function TrazabilidadIndex({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (u.company_id) redirect(`/informe-final/${u.company_id}`);
  const sp = await searchParams;
  const list = companiesList(u, sp.q);
  return (
    <>
      <PageHeader icon={PageIcon} title="Trazabilidad de punta a punta" subtitle="Elige una empresa para ver en una sola vista su vinculación, diagnóstico, servicios, sesiones, documentos, resultados y auditoría" />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q} className="input max-w-md" placeholder="Buscar por razón social o NIT" aria-label="Buscar empresa" /><button className="btn-ghost">Buscar</button></form>
      <Table head={["Empresa", "NIT", "Programa", "Estado", "Sesiones realizadas", "Cierre", ""]} empty="No hay empresas en tu alcance">
        {list.map((c) => (
          <tr key={c.id}><Td className="font-medium">{c.razon_social}</Td><Td className="text-xs">{c.nit}</Td><Td className="text-xs">{c.program}</Td><Td><Badge>{c.status}</Badge></Td>
            <Td>{c.sesiones}</Td><Td className="text-xs">{c.cierre ? fmtDate(c.cierre, false) : "—"}</Td>
            <Td><div className="flex gap-1"><Link className="btn-ghost btn-sm" href={`/trazabilidad/${c.id}`}>Trazabilidad</Link><Link className="btn-ghost btn-sm" href={`/informe-final/${c.id}`}>Informe final</Link></div></Td></tr>))}
      </Table>
    </>
  );
}
