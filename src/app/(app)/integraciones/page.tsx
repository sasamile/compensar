import { headers } from "next/headers";
import { Notice, PageHeader, Flash, Tabs } from "@/components/ui";
import { can, isAdmin, requirePerm, requireUser } from "@/lib/auth";
import { originFrom } from "@/lib/oidc";
import * as T from "./tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integraciones y API" };

const TABS: [string, string][] = [
  ["clientes", "Clientes API"], ["webhooks", "Webhooks"], ["colas", "Colas e integraciones"], ["procesos", "Procesos por lotes"],
  ["seguridad", "Seguridad"], ["errores", "Errores técnicos"], ["exportacion", "Exportación total"], ["datos", "Datos personales"],
];

export default async function Integraciones({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  requirePerm(u, "api.manage");
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "clientes";
  const origin = originFrom(await headers());
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Integraciones, API y seguridad"
        subtitle="Clientes OAuth de la API REST, webhooks firmados, colas de reintento, procesos por lotes, seguridad de acceso, errores técnicos y datos."
        actions={<><a href="/api-docs" target="_blank" rel="noopener" className="btn-ghost btn-sm">Documentación API</a><a href="/api/health" target="_blank" rel="noopener" className="btn-ghost btn-sm">/api/health</a><a href="/api/metrics" target="_blank" rel="noopener" className="btn-ghost btn-sm">/api/metrics</a></>} />
      <Flash sp={sp} />
      <Tabs tabs={TABS} active={tab} base="/integraciones" />
      {tab === "clientes" && <T.Clientes userId={u.id} sp={sp} origin={origin} />}
      {tab === "webhooks" && <T.Webhooks userId={u.id} sp={sp} origin={origin} />}
      {tab === "colas" && <T.Colas />}
      {tab === "procesos" && <T.Procesos />}
      {tab === "seguridad" && (can(u, "security.manage") ? <T.Seguridad origin={origin} /> : <Notice kind="warn">Necesitas el permiso «Configurar seguridad» para ver esta pestaña.</Notice>)}
      {tab === "errores" && <T.Errores />}
      {tab === "exportacion" && <T.Exportacion admin={isAdmin(u)} />}
      {tab === "datos" && <T.DatosPersonales />}
    </>
  );
}
