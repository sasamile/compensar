/** Marco con la marca para las páginas públicas de formularios (/f/...). */
import Link from "next/link";
import { setting } from "@/lib/db";

export default function FormPublicFrame({ children, userName }: { children: React.ReactNode; userName?: string | null }) {
  const brand = setting("brand_name", "Compensar"), color = setting("brand_color", "#0a6cff");
  return (
    <div className="min-h-screen bg-slate-50" style={{ ["--color-brand" as any]: color }}>
      <header className="px-4 py-4 text-white sm:px-6" style={{ background: color }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/" className="font-bold">{brand}</Link>
          <span className="truncate text-right text-sm opacity-90">{userName ? <>Hola, {userName} · <Link href="/mis-formularios" className="underline">Mis formularios</Link></> : setting("brand_tagline")}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4 sm:p-6">{children}</main>
      <footer className="pb-8 text-center text-xs text-slate-400">{brand} · Tus datos se tratan conforme a la Ley 1581 de 2012.</footer>
    </div>
  );
}
