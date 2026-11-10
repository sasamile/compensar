import { Download } from "lucide-react";

/**
 * Botones de exportación en Excel, CSV, JSON y PDF (FUN-100).
 * `href` es la URL base de exportación (con su querystring); se le agrega `format=`.
 * Reutilizable por cualquier tabla: p. ej. href={`/api/analitica/consulta?fuente=empresas`}.
 */
export function ExportButtons({ href, label = "Exportar", compact = false, param = "format" }: { href: string; label?: string; compact?: boolean; param?: string }) {
  const sep = href.includes("?") ? "&" : "?";
  const f: [string, string][] = [["xlsx", "Excel"], ["csv", "CSV"], ["json", "JSON"], ["pdf", "PDF"]];
  return (
    <div className="flex flex-wrap items-center gap-1 print:hidden" role="group" aria-label={label}>
      {!compact && <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Download className="h-3.5 w-3.5" aria-hidden />{label}</span>}
      {f.map(([k, l]) => (
        <a key={k} className="btn-ghost btn-sm" href={`${href}${sep}${param}=${k}`} target={k === "pdf" ? "_blank" : undefined} rel="noopener"
          title={k === "pdf" ? "Abre una vista imprimible: use «Guardar como PDF»" : `Descargar en ${l}`}>{l}</a>))}
    </div>
  );
}
