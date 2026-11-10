"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const p = usePathname();
  const active = href === "/" ? p === "/" : p === href || p.startsWith(href + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm no-underline transition-colors [&_svg]:size-4 [&_svg]:shrink-0 ${active ? "bg-accent font-medium text-foreground" : "text-foreground/75 hover:bg-accent hover:text-foreground"}`}>
      {children}
    </Link>
  );
}
