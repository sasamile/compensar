import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, FileDown, FileText, Image as ImageIcon, FolderOpen as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { rowsOf, specToParams, visibleCompanies, type Filter } from "@/lib/datasets";
import { fmtDate } from "@/lib/util";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { ExportButtons } from "@/components/ana-export";

export const dynamic = "force-dynamic";
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);
const isPdf = (d: any) => /pdf/i.test(d.mime || "") || /\.pdf$/i.test(d.nombre);
const isImg = (d: any) => /^image\//i.test(d.mime || "") || /\.(png|jpe?g|gif|webp)$/i.test(d.nombre);

/** Centro documental (FUN-65, RF-SEG-01): consulta y descarga de documentos de cada proceso, con permisos por rol y alcance. */
export default async function Documentos({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "documents.view") && !u.company_id) redirect("/sin-acceso");
  const sp = await searchParams;
  const filters: Filter[] = [];
  if (sp.q) filters.push({ col: "nombre", op: "contains", value: sp.q });
  if (sp.empresa && /^\d+$/.test(sp.empresa)) filters.push({ col: "company_id", op: "eq", value: sp.empresa });
  if (sp.proceso) filters.push({ col: "proceso", op: "eq", value: sp.proceso });
  if (sp.tipo) filters.push({ col: "tipo", op: "eq", value: sp.tipo });
  if (sp.estado) filters.push({ col: "estado_onbase", op: "eq", value: sp.estado });
  if (sp.ref) filters.push({ col: "referencia_onbase", op: "contains", value: sp.ref });
  if (sp.aceptado === "1" || sp.aceptado === "0") filters.push({ col: "aceptado", op: "eq", value: sp.aceptado });
  const global = { from: /^\d{4}-\d{2}-\d{2}$/.test(sp.desde || "") ? sp.desde : null, to: /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta || "") ? sp.hasta : null };
  const docs = rowsOf(u, "documentos", filters, global, 500);
  const allMine = rowsOf(u, "documentos", [], {}, 5000);
  const kinds = Array.from(new Set(allMine.map((d) => d.tipo).filter(Boolean))).sort();
  const vc = visibleCompanies(u, "c", ["documents.view", "companies.view"]);
  const companies = u.company_id ? [] : all<any>(`SELECT c.id, c.razon_social FROM companies c WHERE ${vc.sql} ORDER BY c.razon_social LIMIT 500`, ...vc.params);
  const ver = sp.ver && /^\d+$/.test(sp.ver) ? rowsOf(u, "documentos", [{ col: "documento_id", op: "eq", value: sp.ver }], {}, 1)[0] : null;
  const exportHref = `/api/analitica/consulta?${specToParams({ source: "documentos", filters, global }).toString()}`;
  const qs = (extra: Record<string, string>) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "ver") as any), ...extra }).toString();
  return (
    <>
      <PageHeader icon={PageIcon} title={u.company_id ? "Mis documentos" : "Centro documental"} subtitle="Documentos de cada proceso (empresa, sesiones y eventos) con su referencia en OnBase y su aceptación"
        actions={<ExportButtons href={exportHref} />} />
      <form className="card mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros de documentos">
        <label className="lg:col-span-2"><span className="label">Buscar por nombre</span><input name="q" defaultValue={sp.q} className="input" placeholder="Ej.: acta, certificado…" /></label>
        {!u.company_id && <label><span className="label">Empresa</span><select name="empresa" defaultValue={sp.empresa || ""} className="input"><option value="">Todas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></label>}
        <label><span className="label">Proceso</span><select name="proceso" defaultValue={sp.proceso || ""} className="input"><option value="">Todos</option>{["Empresa", "Sesión", "Evento", "General"].map((p) => <option key={p}>{p}</option>)}</select></label>
        <label><span className="label">Tipo</span><select name="tipo" defaultValue={sp.tipo || ""} className="input"><option value="">Todos</option>{kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label><span className="label">Estado en OnBase</span><select name="estado" defaultValue={sp.estado || ""} className="input"><option value="">Todos</option><option value="almacenado">Almacenado</option><option value="en_cola">En cola</option></select></label>
        <label><span className="label">Aceptación</span><select name="aceptado" defaultValue={sp.aceptado || ""} className="input"><option value="">Todas</option><option value="1">Aceptados</option><option value="0">Sin aceptar</option></select></label>
        <label><span className="label">Referencia OnBase</span><input name="ref" defaultValue={sp.ref} className="input" placeholder="ONB-…" /></label>
        <label><span className="label">Desde</span><input type="date" name="desde" defaultValue={sp.desde} className="input" /></label>
        <label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta} className="input" /></label>
        <div className="flex items-end gap-2"><button className="btn flex-1">Filtrar</button><Link href="/documentos" className="btn-ghost">Limpiar</Link></div>
      </form>

      {ver && (
        <section className="card mb-5" aria-label={`Vista del documento ${ver.nombre}`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-ink">{ver.nombre}</h2>
              <p className="text-xs text-slate-500">{ver.proceso}{ver.empresa ? ` · ${ver.empresa}` : ""}{ver.sesion ? ` · sesión «${ver.sesion}»` : ""}{ver.evento ? ` · evento «${ver.evento}»` : ""} · OnBase {ver.referencia_onbase} · {fmtDate(ver.fecha)}</p>
              {ver.aceptado_en && <p className="text-xs text-emerald-700">Aceptado por {ver.aceptado_por} el {fmtDate(ver.aceptado_en)} (IP {ver.ip_aceptacion})</p>}
            </div>
            <div className="flex gap-2"><a className="btn-ghost btn-sm" href={`/api/analitica/doc/${ver.documento_id}?descargar=1`}><FileDown className="h-4 w-4" />Descargar</a><Link className="btn-ghost btn-sm" href={`/documentos${qs({})}`}>Cerrar</Link></div>
          </div>
          {ver.estado_onbase === "en_cola" ? <EmptyState title="Documento en cola de envío a OnBase">Estará disponible cuando OnBase confirme la recepción.</EmptyState>
            : isPdf(ver) ? <iframe title={`Vista previa de ${ver.nombre}`} src={`/api/analitica/doc/${ver.documento_id}`} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-50" />
              : isImg(ver) ? <img alt={ver.nombre} src={`/api/analitica/doc/${ver.documento_id}`} className="mx-auto max-h-[70vh] rounded-lg border border-slate-200" />
                : <EmptyState title="Este formato no tiene vista previa">Los documentos de Office se descargan para abrirlos. <a className="text-brand underline" href={`/api/analitica/doc/${ver.documento_id}?descargar=1`}>Descargar</a></EmptyState>}
        </section>)}

      {docs.length ? (
        <Table head={["Fecha", "Documento", "Proceso", "Tipo", "OnBase", "Aceptación", ""]}>
          {docs.map((d) => (
            <tr key={d.documento_id} className={String(d.documento_id) === sp.ver ? "bg-brand/5" : ""}>
              <Td className="whitespace-nowrap text-xs">{fmtDate(d.fecha)}</Td>
              <Td><div className="flex items-center gap-1.5 font-medium">{isImg(d) ? <ImageIcon className="h-4 w-4 text-slate-400" aria-hidden /> : <FileText className="h-4 w-4 text-slate-400" aria-hidden />}{d.nombre}</div>
                <div className="text-[11px] text-slate-400">{kb(d.tamano)} · subido por {d.subido_por || "—"}</div></Td>
              <Td className="text-xs">{d.proceso}{d.empresa && !u.company_id ? <div><Link className="text-brand hover:underline" href={`/empresas/${d.company_id}`}>{d.empresa}</Link></div> : null}
                {d.session_id ? <div><Link className="text-brand hover:underline" href={`/agenda/${d.session_id}`}>Sesión: {d.sesion}</Link></div> : null}
                {d.event_id ? <div><Link className="text-brand hover:underline" href={`/eventos/${d.event_id}`}>Evento: {d.evento}</Link></div> : null}</Td>
              <Td className="text-xs">{d.tipo || "—"}</Td>
              <Td className="text-xs"><code>{d.referencia_onbase}</code><div><Badge>{d.estado_onbase}</Badge></div></Td>
              <Td className="text-xs">{d.aceptado_en ? <><Badge tone="green">aceptado</Badge><div className="text-slate-500">{d.aceptado_por} · {fmtDate(d.aceptado_en)}</div><div className="text-slate-400">IP {d.ip_aceptacion}</div></> : <Badge tone="amber">sin aceptar</Badge>}</Td>
              <Td><div className="flex gap-1">
                <Link className="btn-ghost btn-sm" href={`/documentos${qs({ ver: String(d.documento_id) })}`} aria-label={`Ver ${d.nombre}`}><Eye className="h-3.5 w-3.5" />Ver</Link>
                <a className="btn-ghost btn-sm" href={`/api/analitica/doc/${d.documento_id}?descargar=1`} aria-label={`Descargar ${d.nombre}`}><FileDown className="h-3.5 w-3.5" /></a></div></Td>
            </tr>))}
        </Table>) : <EmptyState title="No hay documentos">No se encontraron documentos de tu alcance con estos filtros.</EmptyState>}
      {docs.length >= 500 && <p className="mt-2 text-xs text-slate-500">Se muestran los 500 más recientes; usa los filtros o exporta para ver todos.</p>}
    </>
  );
}
