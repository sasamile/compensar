import Link from "next/link";
import { can, type User } from "@/lib/auth";

/** Navegación interna del módulo de validación. */
export function ValNav({ u, active }: { u: User; active: string }) {
  const manage = can(u, "validation.manage");
  const tabs: [string, string, string, boolean][] = [
    ["bandeja", "Bandeja", "/validacion", true],
    ["tablero", "Tablero de avance", "/validacion/tablero", true],
    ["reglas", "Reglas", "/validacion/reglas", true],
    ["masiva", "Validación masiva", "/validacion/masiva", manage],
    ["reportes", "Reportes", "/validacion/reportes", true],
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden" aria-label="Secciones de validación">
      {tabs.filter((t) => t[3]).map(([k, l, href]) => (
        <Link key={k} href={href} aria-current={active === k ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active === k ? "border-brand font-medium text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>))}
    </nav>
  );
}
