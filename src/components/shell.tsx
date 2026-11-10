import Link from "next/link";
import {
  Home, Activity, BarChart3, ListChecks, CalendarDays, Ticket, FileText, Building2, ShieldCheck, Stethoscope, Route, Contact,
  CalendarClock, MessagesSquare, Share2, CheckCircle2, Star, Library, FolderOpen, Wallet, FileSpreadsheet, Gauge, Lock, Users,
  Settings, Plug, Bell, MessageSquarePlus, ChevronsUpDown, ClipboardList, Clock3, LogOut, UserCircle2,
} from "lucide-react";
import { can, type User } from "@/lib/auth";
import { get, setting } from "@/lib/db";
import { logout } from "@/app/login/actions";
import NavLink from "./nav-link";
import MobileNav from "./mobile-nav";
import FeedbackButton from "./feedback-button";
import Breadcrumb from "./breadcrumb";
import { CompanySwitcher } from "./company-switcher";

type Item = { href: string; label: string; perm?: string | string[]; icon: any; companyLabel?: string };
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "General", items: [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/seguimiento", label: "Seguimiento y alertas", perm: "alerts.view", icon: Activity },
    { href: "/analitica", label: "Analítica y tableros", perm: "analytics.view", icon: BarChart3 },
    { href: "/trazabilidad", label: "Trazabilidad", perm: ["analytics.view", "closure.manage"], icon: Route },
    { href: "/tareas", label: "Tareas", perm: "tasks.manage", icon: ListChecks },
  ]},
  { title: "Convocatorias", items: [
    { href: "/eventos", label: "Eventos y cursos", perm: ["events.manage", "attendance.manage", "registrations.view"], icon: CalendarDays },
    { href: "/catalogo", label: "Oferta y eventos", perm: "events.register", icon: Ticket },
    { href: "/formularios", label: "Formularios", perm: ["forms.manage", "forms.responses"], icon: FileText },
    { href: "/mis-formularios", label: "Mis formularios", perm: ["forms.fill", "events.register"], icon: ClipboardList },
  ]},
  { title: "Empresas", items: [
    { href: "/empresas", label: "Empresas", perm: "companies.view", icon: Building2, companyLabel: "Mi empresa" },
    { href: "/validacion", label: "Validación de requisitos", perm: ["validation.manage", "validation.view"], icon: ShieldCheck },
    { href: "/validacion/solicitudes", label: "Mis solicitudes", perm: "company:", icon: ShieldCheck },
    { href: "/diagnosticos", label: "Diagnósticos", perm: ["diagnostics.manage", "diagnostics.view", "diagnostics.self"], icon: Stethoscope, companyLabel: "Mi diagnóstico" },
    { href: "/rutas", label: "Rutas de acompañamiento", perm: ["routes.manage", "routes.view"], icon: Route, companyLabel: "Mi ruta" },
    { href: "/directorio", label: "Directorio", perm: "directory.view", icon: Contact },
  ]},
  { title: "Acompañamiento", items: [
    { href: "/agenda", label: "Agenda y mentorías", perm: "sessions.view", icon: CalendarClock },
    { href: "/disponibilidad", label: "Mi disponibilidad", perm: ["sessions.followup", "users.manage.mentors", "users.manage.aliado"], icon: Clock3 },
    { href: "/mensajes", label: "Mensajes", perm: "messages.use", icon: MessagesSquare },
    { href: "/remisiones", label: "Remisiones a aliados", perm: ["referrals.create", "referrals.assign", "sessions.accept"], icon: Share2 },
    { href: "/cierres", label: "Resultados y cierres", perm: "closure.manage", icon: CheckCircle2 },
    { href: "/encuestas", label: "Encuestas de satisfacción", perm: "surveys.view", icon: Star },
    { href: "/biblioteca", label: "Biblioteca", perm: ["library.view", "library.manage"], icon: Library },
    { href: "/documentos", label: "Centro documental", perm: ["documents.view", "docs.upload"], icon: FolderOpen, companyLabel: "Mis documentos" },
    { href: "/informe-final", label: "Informes finales", perm: ["closure.manage", "analytics.view", "docs.upload"], icon: FileText, companyLabel: "Mi informe final" },
  ]},
  { title: "Control", items: [
    { href: "/pagos", label: "Soporte de pagos", perm: "payments.view", icon: Wallet },
    { href: "/reportes", label: "Reportes", perm: "report:", icon: FileSpreadsheet },
    { href: "/indicadores", label: "Indicadores", perm: ["indicators.manage", "indicators.update"], icon: Gauge },
    { href: "/auditoria", label: "Auditoría", perm: "audit.view", icon: Lock },
  ]},
  { title: "Administración", items: [
    { href: "/usuarios", label: "Usuarios", perm: ["users.manage", "users.manage.mentors", "users.manage.aliado", "company.manage_collab"], icon: Users, companyLabel: "Mis colaboradores" },
    { href: "/configuracion", label: "Configuración", perm: "config.manage", icon: Settings },
    { href: "/integraciones", label: "Integraciones y API", perm: "api.manage", icon: Plug },
    { href: "/retroalimentacion", label: "Retroalimentación", perm: "config.manage", icon: MessageSquarePlus },
  ]},
];

function allowed(u: User, perm?: string | string[]) {
  if (!perm) return true;
  if (perm === "company:") return !!u.company_id;
  const ps = Array.isArray(perm) ? perm : [perm];
  return ps.some((p) => (p.endsWith(":") ? u.grants.some((g) => g.perms.includes("*") || g.perms.some((x) => x.startsWith(p))) : can(u, p)));
}

function Nav({ user }: { user: User }) {
  return (
    <nav className="-mx-1 flex-1 space-y-5 overflow-y-auto px-1 pb-4" aria-label="Navegación principal">
      {SECTIONS.map((s) => {
        const items = s.items.filter((i) => allowed(user, i.perm));
        if (!items.length) return null;
        return (
          <div key={s.title}>
            <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">{s.title}</div>
            <div className="space-y-0.5">
              {items.map((i) => <NavLink key={i.href} href={i.href}><i.icon aria-hidden />{user.company_id && i.companyLabel ? i.companyLabel : i.label}</NavLink>)}
            </div>
          </div>);
      })}
    </nav>
  );
}

export function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  const brand = setting("brand_name", "Compensar");
  const color = setting("brand_color", "#0a6cff");
  const tagline = setting("brand_tagline", "Fomento Empresarial");
  const logo = setting("brand_logo_doc", ""); // RF-PAR-06: logo de marca (Configuración → Marca)
  const roles = Array.from(new Set(user.grants.map((g) => g.role_name))).join(" · ");
  const unread = get<any>("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND channel='correo' AND status='entregado'", user.id)?.n ?? 0;
  const initials = user.name.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const company = user.company_id ? get<any>("SELECT razon_social FROM companies WHERE id=?", user.company_id)?.razon_social : null;
  const Brand = (
    <Link href="/" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 no-underline hover:bg-accent">
      {logo
        ? <img src={`/api/marca/logo?v=${logo}`} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
        : <div className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">{brand[0]}</div>}
      <div className="min-w-0 leading-tight"><div className="truncate text-sm font-semibold text-foreground">{brand}</div><div className="truncate text-xs text-muted-foreground">{tagline}</div></div>
    </Link>
  );
  // Opciones visibles para este usuario (alimentan la ruta de navegación del encabezado)
  const crumbs = SECTIONS.flatMap((s) => s.items.filter((i) => allowed(user, i.perm)).map((i) => ({ href: i.href, section: s.title, label: user.company_id && i.companyLabel ? i.companyLabel : i.label })));
  const UserMenu = (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md p-2 hover:bg-accent">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-xs font-medium text-foreground">{initials}</span>
        <span className="min-w-0 flex-1 text-left leading-tight"><span className="block truncate text-sm font-medium text-foreground">{user.name}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </summary>
      <div className="absolute bottom-full left-0 z-40 mb-2 w-full min-w-56 rounded-lg border bg-background p-1 shadow-md">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{roles}</div>
        <div className="my-1 h-px bg-border" />
        <Link href="/cuenta" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground no-underline hover:bg-accent"><UserCircle2 className="size-4" />Mi cuenta y seguridad</Link>
        <Link href="/notificaciones" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground no-underline hover:bg-accent"><Bell className="size-4" />Notificaciones</Link>
        <div className="my-1 h-px bg-border" />
        <form action={logout}><button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"><LogOut className="size-4" />Cerrar sesión</button></form>
      </div>
    </details>
  );
  return (
    <div className="flex min-h-screen bg-canvas" style={{ ["--color-brand" as any]: color }}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Saltar al contenido</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col px-2 pb-2 pt-2 lg:flex print:hidden">
        <div className="mb-3">{Brand}</div>
        <Nav user={user} />
        <div className="border-t pt-2">{UserMenu}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex flex-1 flex-col bg-background lg:rounded-xl lg:border lg:shadow-xs">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:top-2 lg:rounded-t-xl md:px-6 print:hidden">
            <MobileNav><div className="mb-3">{Brand}</div><Nav user={user} /><div className="border-t pt-2">{UserMenu}</div></MobileNav>
            <Breadcrumb items={crumbs} />
            <div className="min-w-0 flex-1 text-sm text-muted-foreground">{company ? <CompanySwitcher user={user} /> : null}</div>
            <FeedbackButton />
            <Link href="/notificaciones" className="relative grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ""}`}>
              <Bell className="size-4" />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          </header>
          <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
