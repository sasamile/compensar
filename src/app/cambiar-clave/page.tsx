import { changePassword } from "../login/actions";
import { Flash } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";

export default async function Cambiar({ searchParams }: { searchParams: Promise<any> }) {
  if (!(await currentUser())) redirect("/login");
  const sp = await searchParams;
  return (
    <AuthLayout title="Cambia tu contraseña" subtitle="Estás usando una contraseña temporal. Debes cambiarla para continuar.">
      <form action={changePassword} className="space-y-4">
        <Flash sp={sp} />
        <div><label className="label">Nueva contraseña</label><input name="password" type="password" required className="input" /></div>
        <div><label className="label">Repetir contraseña</label><input name="password2" type="password" required className="input" /></div>
        <button className="btn w-full">Guardar y continuar</button>
        <p className="text-xs text-slate-400">Mínimo 10 caracteres con mayúscula, minúscula y número.</p>
      </form>
    </AuthLayout>
  );
}
