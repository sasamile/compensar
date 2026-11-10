import Link from "next/link";
import { setting } from "@/lib/db";
import { fmtDate } from "@/lib/util";
import { certPdfPath, loadCertificate, verifyPath } from "@/lib/certificates";

export const dynamic = "force-dynamic";

/** Vista HTML del certificado (la descarga oficial es el PDF firmado: /api/certificados/<código>.pdf). */
export default async function Certificado({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = loadCertificate(code);
  if (!c) return <div className="grid min-h-screen place-items-center p-6"><p className="text-slate-500">Certificado no encontrado.</p></div>;
  const d = c.data;
  const color = setting("brand_color", "#0a6cff"), brand = setting("brand_name", "Compensar"), logo = !!setting("brand_logo_doc");
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2 print:hidden">
        <span className="text-sm text-slate-500">Certificado <b>{c.code}</b></span>
        <div className="flex gap-2">
          <a href={`${certPdfPath(c.code)}?descargar=1`} className="btn btn-sm">Descargar PDF</a>
          <Link href={verifyPath(c.code)} className="btn-ghost btn-sm">Verificar firma</Link>
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl border-8 bg-white px-6 py-10 text-center shadow-xl sm:px-12 print:shadow-none" style={{ borderColor: color }}>
        {logo ? <img src="/api/marca/logo" alt={brand} className="mx-auto h-12 object-contain" />
          : <div className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color }}>{brand}</div>}
        <h1 className="mt-6 text-3xl font-bold text-ink sm:text-4xl">Certificado de asistencia</h1>
        <p className="mt-8 text-slate-500">Se certifica que</p>
        <p className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color }}>{d?.nombre ?? c.name}</p>
        <p className="text-slate-500">de {d?.empresa ?? c.razon_social}{d?.nit ? ` (NIT ${d.nit})` : ""}</p>
        <p className="mt-6 text-slate-600">asistió y cumplió la asistencia mínima requerida en</p>
        <p className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{d?.evento ?? c.title}</p>
        <p className="mt-2 text-sm text-slate-500">
          {fmtDate(d?.fecha_inicio ?? c.start_at, false)}
          {d?.horas ? ` · Intensidad: ${d.horas} horas` : ""}
          {d?.sesiones ? ` · Asistencia: ${d.sesiones} sesiones (${d.asistencia_pct} %)` : ""}
        </p>
        <div className="mt-10 border-t pt-4 text-xs text-slate-500">
          Emitido {fmtDate(c.issued_at)} · Código de verificación <b>{c.code}</b><br />
          {c.signed ? <>Firma electrónica Ed25519 · llave <code>{c.key_id}</code> · {c.valid ? "firma válida" : "FIRMA NO VÁLIDA"}</> : "Emitido sin firma electrónica"}
        </div>
      </div>
    </div>
  );
}
