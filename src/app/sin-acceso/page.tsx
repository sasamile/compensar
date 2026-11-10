import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function SinAcceso() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6">
      <div className="card max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600"><ShieldX className="h-7 w-7" /></div>
        <h1 className="mt-4 text-lg font-semibold text-ink">Sin acceso</h1>
        <p className="mt-1 text-sm text-slate-500">No tienes permiso para ver este registro con tu rol actual. Si crees que es un error, contacta al administrador de la plataforma.</p>
        <Link className="btn mt-5" href="/">Volver al inicio</Link>
      </div>
    </div>
  );
}
