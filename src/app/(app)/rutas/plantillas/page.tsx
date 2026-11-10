import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Badge, PageHeader, Table, Td } from "@/components/ui";
import { canEditTemplate, isInternalRouteUser, templates } from "@/lib/routes";
import { RutasNav } from "../view";

export default async function Plantillas() {
  const u = await requireUser();
  if (u.company_id || !isInternalRouteUser(u)) redirect("/sin-acceso");
  const rows = templates(false);
  return (
    <>
      <PageHeader icon={PageIcon} title="Rutas de acompañamiento" subtitle="Plantillas: pasos con servicio del catálogo, curso o actividad, indicador y meta por etapa" />
      <RutasNav u={u} active="plantillas" />
      <p className="mb-3 text-sm text-slate-500">Las plantillas (rutas del catálogo) se crean en <Link className="underline" href="/configuracion?tab=programas">Configuración › Programas y rutas</Link>; aquí se definen sus pasos.</p>
      <Table head={["Plantilla", "Programa", "Eje / línea", "Etapas", "Estado", ""]} empty="No hay plantillas">
        {rows.map((t) => (
          <tr key={t.id}>
            <Td><b>{t.name}</b><div className="text-xs text-slate-400">{t.description}</div></Td>
            <Td>{t.program || "—"}</Td>
            <Td className="text-xs">{t.eje} / {t.linea}</Td>
            <Td>{t.steps}</Td>
            <Td><Badge tone={t.active ? "green" : "slate"}>{t.active ? "Activa" : "Inactiva"}</Badge></Td>
            <Td><Link className="text-brand" href={`/rutas/plantillas/${t.id}`}>{canEditTemplate(u, t.program_id) ? "Editar pasos" : "Ver pasos"}</Link></Td>
          </tr>))}
      </Table>
    </>
  );
}
