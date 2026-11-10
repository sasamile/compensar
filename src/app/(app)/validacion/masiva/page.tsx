import { ShieldCheck as PageIcon } from "lucide-react";
import { requirePerm, requireUser } from "@/lib/auth";
import { PageHeader, Notice } from "@/components/ui";
import { ValNav } from "../nav";
import Upload from "./upload";

export default async function Masiva() {
  const u = await requireUser();
  requirePerm(u, "validation.manage");
  return (
    <>
      <PageHeader icon={PageIcon} title="Validación de requisitos" subtitle="Validación masiva por archivo Excel, con resultado fila por fila" />
      <ValNav u={u} active="masiva" />
      <Notice>
        Sube un Excel con las columnas <b>NIT</b> y <b>Programa</b> (opcional: razón social). Cada fila se valida con las reglas activas del programa
        consultando Gestión de Clientes, y descargas el resultado con el motivo de cada fila. <a className="underline" href="/api/validacion/plantilla">Descargar plantilla</a>
      </Notice>
      <Upload />
    </>
  );
}
