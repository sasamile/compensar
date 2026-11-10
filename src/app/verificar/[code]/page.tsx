import Link from "next/link";
import { setting } from "@/lib/db";
import { fmtDate } from "@/lib/util";
import { certPdfPath, loadCertificate, signingKeys } from "@/lib/certificates";

export const dynamic = "force-dynamic";

/** Página pública de verificación (RF-CON-15): valida el código y la firma electrónica Ed25519 del certificado. */
export default async function Verificar({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = loadCertificate(decodeURIComponent(code));
  const brand = setting("brand_name", "Compensar");
  const d = c?.data;
  const tone = !c ? "red" : c.valid ? "green" : c.signed ? "red" : "amber";
  const box = { green: "border-emerald-200 bg-emerald-50 text-emerald-800", red: "border-red-200 bg-red-50 text-red-800", amber: "border-amber-200 bg-amber-50 text-amber-900" }[tone];
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="card w-full max-w-lg">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{brand} · Verificación de certificados</div>
        <div className={`mt-4 rounded-xl border px-4 py-3 ${box}`} role="status">
          <h1 className="text-lg font-semibold">
            {!c ? "Código no válido" : c.valid ? "Certificado válido · Firma válida" : c.signed ? "Firma NO válida" : "Certificado válido (emitido sin firma electrónica)"}
          </h1>
          <p className="text-sm">
            {!c ? "No encontramos un certificado con ese código. Revisa que esté bien escrito."
              : c.valid ? "La firma electrónica corresponde a la plataforma y los datos no han sido alterados."
              : c.signed ? "Los datos del certificado no coinciden con su firma. No lo aceptes." : "Fue emitido antes de activar la firma electrónica; el código sí existe."}
          </p>
        </div>
        {c && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Participante</dt><dd className="font-medium text-ink">{d?.nombre ?? c.name}</dd>
            <dt className="text-slate-500">Empresa</dt><dd>{d?.empresa ?? c.razon_social}{d?.nit ? ` · NIT ${d.nit}` : ""}</dd>
            <dt className="text-slate-500">Evento</dt><dd>{d?.evento ?? c.title}</dd>
            <dt className="text-slate-500">Fecha</dt><dd>{fmtDate(d?.fecha_inicio ?? c.start_at, false)}</dd>
            {d?.horas ? <><dt className="text-slate-500">Intensidad</dt><dd>{d.horas} horas</dd></> : null}
            {d?.sesiones ? <><dt className="text-slate-500">Asistencia</dt><dd>{d.sesiones} sesiones ({d.asistencia_pct} %)</dd></> : null}
            <dt className="text-slate-500">Emitido</dt><dd>{fmtDate(c.issued_at)}</dd>
            <dt className="text-slate-500">Código</dt><dd><code>{c.code}</code></dd>
          </dl>)}
        {c && <a href={certPdfPath(c.code)} className="btn btn-sm mt-4">Ver certificado PDF</a>}
        {c?.signed && (
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600">Detalle técnico de la firma</summary>
            <p className="mt-2">Algoritmo: {c.alg} · Llave: <code>{c.key_id}</code></p>
            <p className="mt-1 break-all">Firma: <code>{c.signature}</code></p>
            <p className="mt-1 break-all">Datos firmados: <code>{c.payload}</code></p>
            <p className="mt-2">Llave pública de la plataforma:</p>
            <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2">{signingKeys().publicPem}</pre>
            <p className="mt-2">Es una firma electrónica verificable de la plataforma (Ed25519). No es una firma digital emitida por una entidad de certificación abierta (ECD) acreditada.</p>
          </details>)}
        <form action="/verificar" className="mt-6 flex gap-2 border-t pt-4">
          <label className="sr-only" htmlFor="code">Otro código</label>
          <input id="code" name="code" placeholder="CERT-XXXXXXXXXX" className="input" required />
          <button className="btn-ghost">Verificar</button>
        </form>
      </div>
    </main>
  );
}
