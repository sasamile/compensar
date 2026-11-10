import { Building2, Check, ChevronDown } from "lucide-react";
import { userCompanies, type User } from "@/lib/auth";
import { get } from "@/lib/db";
import { switchCompany } from "@/app/login/actions";

/**
 * Selector de empresa activa del encabezado (RF-EMP-03). Un contacto vinculado a varias empresas elige con cuál
 * trabaja; la elección queda en la sesión (sessions.active_company_id) y en auditoría. Funciona sin JavaScript.
 */
export function CompanySwitcher({ user }: { user: User }) {
  if (!user.company_id) return null;
  const list = userCompanies(user.id);
  const activeName = list.find((c) => c.id === user.company_id)?.razon_social
    ?? get<any>("SELECT razon_social FROM companies WHERE id=?", user.company_id)?.razon_social ?? "";
  if (list.length <= 1)
    return <span className="block truncate"><Building2 className="mr-1 inline h-4 w-4" aria-hidden />{activeName}</span>;
  return (
    <details className="relative inline-block max-w-full">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        aria-label={`Empresa activa: ${activeName}. Cambiar de empresa`}>
        <Building2 className="h-4 w-4 shrink-0" aria-hidden />
        <span className="max-w-[45vw] truncate font-medium sm:max-w-xs">{activeName}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </summary>
      <div className="absolute left-0 z-40 mt-2 w-72 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trabajar con la empresa</div>
        {list.map((c) => (
          <form key={c.id} action={switchCompany.bind(null, c.id)}>
            <button className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100 ${c.id === user.company_id ? "font-semibold text-brand" : "text-slate-700"}`}
              aria-current={c.id === user.company_id ? "true" : undefined}>
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${c.id === user.company_id ? "" : "invisible"}`} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate">{c.razon_social}</span>
                <span className="block text-[11px] font-normal text-slate-400">NIT {c.nit} · {c.role === "representante" ? "Representante" : "Colaborador"} · {c.status}</span>
              </span>
            </button>
          </form>))}
      </div>
    </details>
  );
}
