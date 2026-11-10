import { redirect } from "next/navigation";
import { setting } from "@/lib/db";

/** Formulario público para verificar un certificado por su código. */
export default async function VerificarIndex({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const code = String(sp.code || "").trim().toUpperCase();
  if (/^CERT-[A-Z0-9]{6,20}$/.test(code)) redirect(`/verificar/${code}`);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <form className="card w-full max-w-md space-y-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{setting("brand_name", "Compensar")}</div>
        <h1 className="text-lg font-semibold text-ink">Verificar un certificado</h1>
        {code && <p className="text-sm text-red-700" role="alert">El código «{code.slice(0, 30)}» no tiene el formato CERT-XXXXXXXXXX.</p>}
        <label className="block"><span className="label">Código de verificación</span>
          <input name="code" placeholder="CERT-XXXXXXXXXX" className="input" required /></label>
        <button className="btn w-full">Verificar</button>
      </form>
    </main>
  );
}
