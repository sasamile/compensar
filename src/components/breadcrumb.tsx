"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/** Ruta de navegación del encabezado: sección del menú › opción activa (la de prefijo más largo). */
export default function Breadcrumb({ items }: { items: { href: string; label: string; section: string }[] }) {
  const p = usePathname();
  const hit = items.filter((i) => (i.href === "/" ? p === "/" : p === i.href || p.startsWith(i.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0];
  const deeper = hit && hit.href !== "/" && p !== hit.href;
  return (
    <nav aria-label="Ruta" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <span className="text-muted-foreground">{hit?.section ?? "General"}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      {deeper
        ? <><Link href={hit.href} className="truncate text-muted-foreground no-underline hover:text-foreground">{hit.label}</Link><ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden /><span className="truncate font-medium text-foreground">Detalle</span></>
        : <span className="truncate font-medium text-foreground">{hit?.label ?? "Inicio"}</span>}
    </nav>
  );
}
