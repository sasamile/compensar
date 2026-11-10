import Link from "next/link";
import { Download, FileJson, FileSpreadsheet, FileText, Building2 as PageIcon } from "lucide-react";
import { all, get } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Notice, PageHeader, Table, Td } from "@/components/ui";
import { BACKGROUND_THRESHOLD, IMPORT_COLUMNS, SOURCES, sourceLabel } from "@/lib/jobs/plataforma";
import { fmtDate, jparse } from "@/lib/util";
import Upload from "./upload";
import AutoRefresh from "./auto-refresh";

const STATUS_LABEL: Record<string, string> = { pendiente: "en cola", procesando: "procesando", ok: "ok", con_errores: "con errores", fallido: "fallido" };
const STATUS_TONE: Record<string, string> = { pendiente: "amber", procesando: "blue", ok: "green", con_errores: "red", fallido: "red" };

export default async function Cargue({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "companies.activate");
  const sp = await searchParams;
  const jobs = all<any>("SELECT id,filename,format,status,total,created_count,errors,options,created_at,finished_at FROM import_jobs WHERE kind='empresas' AND created_by=? ORDER BY id DESC LIMIT 50", u.id);
  const sel = sp.job ? get<any>("SELECT * FROM import_jobs WHERE id=? AND kind='empresas' AND created_by=?", Number(sp.job), u.id) : null;
  const running = jobs.some((j) => j.status === "pendiente" || j.status === "procesando");
  const selErrors = sel ? jparse<{ row: number; msg: string }[]>(sel.errors, []) : [];
  const selOpts = sel ? jparse<any>(sel.options, {}) : {};
  return (
    <>
      <PageHeader icon={PageIcon} title="Cargue masivo de empresas"
        subtitle="Excel, CSV o JSON con la misma validación fila por fila: NIT y dígito de verificación (módulo 11), duplicados, obligatorios y contactos existentes"
        actions={<Link href="/empresas" className="btn-ghost">← Empresas</Link>} />
      {running && <AutoRefresh everyMs={4000} />}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><Upload sources={SOURCES} threshold={BACKGROUND_THRESHOLD} /></div>
        <div className="card space-y-3 text-sm">
          <div className="font-semibold text-ink">Plantilla</div>
          <p className="text-slate-500">Descárgala en el formato que uses. Columnas: {IMPORT_COLUMNS.map((c) => c.header).join(", ")}.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/empresas/plantilla?formato=xlsx" className="btn-ghost btn-sm"><FileSpreadsheet className="h-4 w-4" aria-hidden />Excel</a>
            <a href="/api/empresas/plantilla?formato=csv" className="btn-ghost btn-sm"><FileText className="h-4 w-4" aria-hidden />CSV</a>
            <a href="/api/empresas/plantilla?formato=json" className="btn-ghost btn-sm"><FileJson className="h-4 w-4" aria-hidden />JSON</a>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Si una fila tiene errores no se guarda ninguna: corrige y vuelve a cargar.</li>
            <li>Más de {BACKGROUND_THRESHOLD} filas se procesan en segundo plano; te avisamos por notificación y correo al terminar.</li>
            <li>Si el correo del representante ya es usuario de otra empresa, queda vinculado también a la nueva.</li>
            <li>JSON: un arreglo de objetos con las claves {IMPORT_COLUMNS.map((c) => c.json).join(", ")}.</li>
          </ul>
        </div>
      </div>

      {sel && (
        <section className="card mb-5 space-y-3" aria-labelledby="detalle-cargue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="detalle-cargue" className="font-semibold text-ink">Cargue #{sel.id} · {sel.filename}</h2>
            <Badge tone={STATUS_TONE[sel.status]}>{STATUS_LABEL[sel.status] || sel.status}</Badge>
          </div>
          <p className="text-sm text-slate-600">
            {sel.total} fila(s) · formato {String(sel.format).toUpperCase()} · origen {sourceLabel(selOpts.source)} · {selOpts.activate ? "activando al cargar" : "quedan pendientes de activación"} ·
            iniciado {fmtDate(sel.created_at)}{sel.finished_at ? ` · terminado ${fmtDate(sel.finished_at)}` : ""}
          </p>
          {sel.status === "ok" && <Notice kind="ok">{sel.created_count} empresa(s) creada(s){selOpts.linked ? `; ${selOpts.linked} con un contacto existente vinculado` : ""}. Cada representante recibió su invitación.</Notice>}
          {(sel.status === "pendiente" || sel.status === "procesando") && <Notice kind="info">Se está procesando en segundo plano. Esta página se actualiza sola y recibirás un aviso al terminar.</Notice>}
          {selErrors.length > 0 && (<>
            <Notice kind="error">No se guardó nada: corrige {selErrors.length} error(es) y vuelve a cargar el archivo.</Notice>
            <div className="flex gap-2">
              <a className="btn-ghost btn-sm" href={`/empresas/cargue/${sel.id}/errores?formato=xlsx`}><Download className="h-4 w-4" aria-hidden />Errores en Excel</a>
              <a className="btn-ghost btn-sm" href={`/empresas/cargue/${sel.id}/errores?formato=csv`}><Download className="h-4 w-4" aria-hidden />Errores en CSV</a>
            </div>
            <Table head={["Fila", "Error"]} dense>
              {selErrors.slice(0, 200).map((e, i) => <tr key={i}><Td>{e.row || "Archivo"}</Td><Td>{e.msg}</Td></tr>)}
            </Table>
            {selErrors.length > 200 && <p className="text-xs text-slate-500">Se muestran 200 de {selErrors.length}; descarga el archivo para verlos todos.</p>}
          </>)}
        </section>)}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Mis cargues</h2>
      {jobs.length === 0 ? <EmptyState title="Aún no has hecho cargues">Cuando cargues un archivo verás aquí su estado, resultado y errores por fila.</EmptyState> : (
        <Table head={["#", "Fecha", "Archivo", "Origen", "Filas", "Estado", "Resultado", ""]}>
          {jobs.map((j) => {
            const errs = jparse<any[]>(j.errors, []).length;
            const o = jparse<any>(j.options, {});
            return (
              <tr key={j.id}>
                <Td>{j.id}</Td><Td className="whitespace-nowrap text-xs">{fmtDate(j.created_at)}</Td>
                <Td><span className="break-all">{j.filename}</span><div className="text-xs text-slate-400">{String(j.format).toUpperCase()}</div></Td>
                <Td className="text-xs">{sourceLabel(o.source)}</Td><Td>{j.total}</Td>
                <Td><Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status] || j.status}</Badge></Td>
                <Td className="text-xs">{j.status === "ok" ? `${j.created_count} creada(s)` : errs ? `${errs} error(es)` : "—"}
                  {errs > 0 && <> · <a className="text-brand underline" href={`/empresas/cargue/${j.id}/errores?formato=xlsx`}>descargar</a></>}</Td>
                <Td><Link className="text-brand" href={`/empresas/cargue?job=${j.id}`}>Ver</Link></Td>
              </tr>);
          })}
        </Table>)}
    </>
  );
}
