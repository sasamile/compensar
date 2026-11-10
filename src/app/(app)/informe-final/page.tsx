import { FileText as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { companiesList } from "@/lib/analytics";
import { fmtDate } from "@/lib/util";
import { Badge, PageHeader, Table, Td } from "@/components/ui";

/** Índice de informes finales (FUN-93). La empresa va directo al suyo. */
export default async function InformesFinales({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (u.company_id) redirect(`/informe-final/${u.company_id}`);
  const sp = await searchParams;
  const list = companiesList(u, sp.q);
  return (
    <>
      <PageHeader icon={PageIcon} title="Informes finales por empresa" subtitle="Resultados, indicadores antes/después, servicios, sesiones aceptadas y recomendaciones, descargables en PDF" />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q} className="input max-w-md" placeholder="Buscar por razón social o NIT" aria-label="Buscar empresa" /><button className="btn-ghost">Buscar</button></form>
      <Table head={["Empresa", "NIT", "Programa", "Estado", "Sesiones realizadas", "Cierre aprobado", ""]} empty="No hay empresas en tu alcance">
        {list.map((c) => (
          <tr key={c.id}><Td className="font-medium">{c.razon_social}</Td><Td className="text-xs">{c.nit}</Td><Td className="text-xs">{c.program}</Td><Td><Badge>{c.status}</Badge></Td>
            <Td>{c.sesiones}</Td><Td className="text-xs">{c.cierre ? fmtDate(c.cierre, false) : "—"}</Td>
            <Td><Link className="btn-ghost btn-sm" href={`/informe-final/${c.id}`}>Ver informe</Link></Td></tr>))}
      </Table>
    </>
  );
}
