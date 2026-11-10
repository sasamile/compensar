import Link from "next/link";
import { registerCompany } from "../login/actions";
import { Flash } from "@/components/ui";
import { all } from "@/lib/db";
import { BotFields } from "@/components/bot-fields";
import { AuthLayout } from "@/components/auth-layout";

export default async function Registro({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const programs = all("SELECT id,name FROM programs WHERE status='activo'");
  return (
    <AuthLayout wide title="Registra tu empresa" subtitle="Tu empresa quedará pendiente de activación hasta que Compensar valide los requisitos del programa.">
      <form action={registerCompany} className="card space-y-4"><BotFields />
        <Flash sp={sp} />
        <div><label className="label">Razón social *</label><input name="razon_social" required className="input" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">NIT (sin DV) *</label><input name="nit" required className="input" /></div>
          <div><label className="label">DV *</label><input name="dv" required maxLength={1} className="input" /></div>
        </div>
        <div><label className="label">Programa *</label>
          <select name="program_id" className="input">{programs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Representante *</label><input name="name" required className="input" /></div>
          <div><label className="label">Celular</label><input name="phone" className="input" /></div>
        </div>
        <div><label className="label">Correo *</label><input name="email" type="email" required className="input" /></div>
        <button className="btn w-full">Enviar registro</button>
        <Link href="/login?mode=codigo" className="block text-center text-xs text-brand">Ya tengo cuenta</Link>
      </form>
    </AuthLayout>
  );
}
