import { AuthLayout } from "@/components/auth-layout";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { takeOnce } from "@/lib/totp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificación en dos pasos activada" };

/** Muestra una sola vez los códigos de recuperación generados al activar el 2FA. */
export default async function MfaReady({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await currentUser();
  if (!u) redirect("/login");
  const d = takeOnce(u.id, "show_codes", sp.c);
  const next = d?.next && String(d.next).startsWith("/") ? d.next : "/";
  return (
    <AuthLayout title="Verificación configurada" subtitle="Protegemos tu cuenta con un segundo factor.">
      <div className="card">
        <h1 className="text-lg font-semibold text-ink">Verificación en dos pasos activada</h1>
        {d ? (
          <>
            <p className="mt-2 text-sm text-slate-600">Guarda estos <b>códigos de recuperación</b> en un lugar seguro. Cada uno sirve una sola vez si pierdes el celular. No se volverán a mostrar.</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm">
              {d.codes.map((c: string) => <li key={c} className="select-all text-center">{c}</li>)}
            </ul>
          </>
        ) : <p className="mt-2 text-sm text-slate-600">Puedes generar nuevos códigos de recuperación en Mi cuenta → Seguridad.</p>}
        <a href={next} className="btn mt-4 w-full justify-center">Continuar</a>
      </div>
    </AuthLayout>
  );
}
