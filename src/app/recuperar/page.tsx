import Link from "next/link";
import { requestOtp, verifyOtp } from "../login/actions";
import { Flash } from "@/components/ui";
import { BotFields } from "@/components/bot-fields";
import { AuthLayout } from "@/components/auth-layout";

export default async function Recuperar({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un código al correo verificado de tu cuenta.">
      <div>
        <Flash sp={sp} />
        {sp.step === "code" ? (
          <form action={verifyOtp} className="space-y-4">
            <input type="hidden" name="email" value={sp.email} /><input type="hidden" name="purpose" value="reset" />
            <p className="text-sm text-slate-600">Si el correo existe, enviamos un código a <b>{sp.email}</b>.</p>
            {sp.demo && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">MODO DEMO — código: <b>{sp.demo}</b></div>}
            <div><label className="label">Código</label><input name="code" required className="input" /></div>
            <div><label className="label">Nueva contraseña</label><input name="password" type="password" autoComplete="new-password" required className="input" /><span className="mt-1 block text-xs text-slate-400">Mínimo 10 caracteres con mayúscula, minúscula y número.</span></div>
            <button className="btn w-full">Cambiar contraseña</button>
          </form>
        ) : (
          <form action={requestOtp} className="space-y-4"><BotFields />
            <input type="hidden" name="purpose" value="reset" />
            <div><label className="label">Correo</label><input name="email" type="email" required className="input" /></div>
            <button className="btn w-full">Enviar código</button>
          </form>
        )}
        <Link href="/login" className="mt-5 block text-center text-sm text-slate-500 hover:text-brand">← Volver al ingreso</Link>
      </div>
    </AuthLayout>
  );
}
