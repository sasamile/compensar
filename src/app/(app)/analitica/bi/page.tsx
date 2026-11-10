import { BarChart3 as PageIcon } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { can, requirePerm, requireUser } from "@/lib/auth";
import { DATASETS } from "@/lib/datasets";
import { PageHeader, Table, Td, Notice } from "@/components/ui";

export default async function ConexionBI() {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "http"}://${h.get("host") || "localhost"}`;
  const list = DATASETS.filter((d) => d.bi !== false);
  const m = `let
    Origen = Web.Contents("${origin}/api/bi/empresas", [
        Query = [format = "csv"],
        Headers = [Authorization = "Bearer " & TokenBI]
    ]),
    Tabla = Csv.Document(Origen, [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    ConEncabezados = Table.PromoteHeaders(Tabla, [PromoteAllScalars = true])
in
    ConEncabezados`;
  const mj = `let
    Origen = Json.Document(Web.Contents("${origin}/api/bi/sesiones", [
        Query = [format = "json"], Headers = [Authorization = "Bearer " & TokenBI]
    ])),
    Filas = Table.FromRecords(Origen[value])
in
    Filas`;
  return (
    <>
      <PageHeader icon={PageIcon} title="Conexión con Power BI" subtitle="Vistas de datos de solo lectura para herramientas de BI externas (Power BI, Tableau, Excel)"
        actions={<Link href="/analitica" className="btn-ghost btn-sm">← Analítica</Link>} />
      <Notice>Las herramientas de BI se conectan con un <b>token de solo lectura</b> (alcance <code>bi.read</code>) emitido en
        {can(u, "api.manage") ? <> <Link href="/integraciones" className="underline">Integraciones y API</Link></> : " Integraciones y API (rol con permiso de API)"}. El token puede acotarse
        a un programa (<code>bi.program:&lt;id&gt;</code>) o a un aliado (<code>bi.aliado:&lt;id&gt;</code>). Con tu sesión iniciada también puedes abrir las URL en el navegador:
        verás solo los datos de tu alcance.</Notice>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold text-ink">Pasos en Power BI Desktop</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-slate-700">
            <li>Inicio → <b>Obtener datos</b> → <b>Web</b> → <b>Avanzado</b>.</li>
            <li>Partes de la URL: <code>{origin}/api/bi/empresas?format=csv</code> (o <code>format=json</code>).</li>
            <li>Encabezado de solicitud HTTP: <code>Authorization</code> = <code>Bearer &lt;su token&gt;</code>.</li>
            <li>Autenticación: <b>Anónimo</b> (el token va en el encabezado). Aceptar.</li>
            <li>Repita para cada conjunto y relacione las tablas por <code>company_id</code>, <code>program_id</code>, <code>aliado_id</code>, <code>mentor_id</code>, <code>event_id</code>.</li>
            <li>En el servicio de Power BI, programe la actualización (p. ej. cada 15 min o 8 veces al día) con la misma credencial anónima + encabezado.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">Parámetros opcionales: <code>limit</code> (máx. 200 000), <code>offset</code>, <code>programa</code>, <code>aliado</code>, <code>mentor</code>, <code>evento</code>, <code>desde</code>/<code>hasta</code> (AAAA-MM-DD). Catálogo completo: <a className="text-brand underline" href="/api/bi">/api/bi</a>.</p>
        </section>
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold text-ink">Consulta M (Editor avanzado)</h2>
          <p className="mb-2 text-xs text-slate-500">Cree un parámetro de texto <code>TokenBI</code> y pegue:</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{m}</pre>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{mj}</pre>
        </section>
      </div>
      <h2 className="mb-2 mt-6 font-semibold text-ink">Conjuntos publicados</h2>
      <Table head={["Conjunto", "Vista de BD", "Contenido", "URL"]}>
        {list.map((d) => (
          <tr key={d.key}><Td><b>{d.name}</b></Td><Td><code className="text-xs">{d.view}</code></Td><Td className="text-xs text-slate-500">{d.description}</Td>
            <Td><div className="flex gap-1"><a className="btn-ghost btn-sm" href={`/api/bi/${d.key}?format=json&limit=100`} target="_blank" rel="noopener">JSON</a><a className="btn-ghost btn-sm" href={`/api/bi/${d.key}?format=csv`}>CSV</a></div></Td></tr>))}
      </Table>
      <p className="mt-3 text-xs text-slate-500">La auditoría no se publica a BI. Cada lectura queda registrada en la auditoría (acción «bi_lectura»). En producción las vistas se sirven desde una réplica de solo lectura.</p>
    </>
  );
}
