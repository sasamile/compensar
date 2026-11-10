import React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, Inbox, TrendingUp, TrendingDown } from "lucide-react";

/* Primitivas visuales compartidas por todas las vistas (estilo shadcn/ui). Mantienen la misma API. */

export function PageHeader({ title, subtitle, actions, eyebrow, icon: Icon }: { title: string; subtitle?: string; actions?: React.ReactNode; eyebrow?: string; icon?: any }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm text-muted-foreground">{eyebrow}</p>}
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground text-balance">
          {Icon && <Icon className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />}{title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, { dot: string; text: string }> = {
  green: { dot: "bg-emerald-500", text: "text-emerald-700" }, red: { dot: "bg-red-500", text: "text-red-700" },
  amber: { dot: "bg-amber-500", text: "text-amber-700" }, blue: { dot: "bg-blue-500", text: "text-blue-700" },
  slate: { dot: "bg-zinc-400", text: "text-zinc-600" }, violet: { dot: "bg-violet-500", text: "text-violet-700" },
};
const TONE_OF: Record<string, string> = {
  activa: "green", activo: "green", publicado: "green", realizada: "green", aceptada: "green", aprobado: "green", aprobada: "green", cerrada: "green", entregado: "green",
  completado: "green", completada: "green", hecha: "green", respondida: "green", almacenado: "green", ok: "green", cumple: "green", verde: "green", atendida: "green", resuelto: "green",
  leido: "blue", inscrito: "blue", programada: "blue", "en curso": "blue", en_curso: "blue", asignado: "blue", en_revision: "blue", enviado: "blue", propuesta: "violet", escalada: "violet",
  pendiente: "amber", borrador: "amber", enviada: "amber", en_cola: "amber", lista_espera: "amber", ajustes: "amber", abierta: "amber", amarilla: "amber", parcial: "amber", nuevo: "amber",
  cancelada: "red", rechazada: "red", rechazado: "red", fallido: "red", suspendida: "red", revocada: "red", vencida: "red", roja: "red", "no cumple": "red",
  inactivo: "slate", cerrado: "slate", archivado: "slate", descartado: "slate", invitado: "violet",
};
export const toneOf = (s: string) => TONE_OF[String(s).toLowerCase()] || "slate";

/** Insignia con contorno; el color va solo en el punto, el texto se mantiene sobrio. */
export function Badge({ children, tone, dot = true }: { children: React.ReactNode; tone?: string; dot?: boolean }) {
  const t = TONES[tone || toneOf(String(children))] || TONES.slate;
  const label = typeof children === "string" ? children.charAt(0).toUpperCase() + children.slice(1).replace(/_/g, " ") : children;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />}{label}
    </span>
  );
}

export function Table({ head, children, empty, dense }: { head: string[]; children: React.ReactNode; empty?: string; dense?: boolean }) {
  const rows = React.Children.toArray(children);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className={`w-full min-w-[640px] caption-bottom ${dense ? "text-xs" : "text-sm"}`}>
        <thead><tr>{head.map((h, i) => <th key={i} scope="col" className="th">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows : (
            <tr><td className="px-3 py-12 text-center" colSpan={head.length}>
              <Inbox className="mx-auto mb-2 size-6 text-muted-foreground/70" strokeWidth={1.5} aria-hidden />
              <span className="text-sm text-muted-foreground">{empty || "Sin registros"}</span>
            </td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={`td ${className}`}>{children}</td>;

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="label !mb-0">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Tarjeta de indicador: etiqueta, cifra grande y pie con contexto (patrón «section cards» de shadcn). */
export function Stat({ label, value, hint, icon: Icon, trend }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: any; tone?: string; trend?: number | null }) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-gradient-to-t from-muted/40 to-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {trend != null && Number.isFinite(trend)
          ? <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
              {up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}{up ? "+" : ""}{Math.round(trend)}%
            </span>
          : Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const NOTICE = {
  info: { icon: Info, cls: "border bg-card text-foreground", ic: "text-foreground" },
  ok: { icon: CircleCheck, cls: "border-emerald-200 bg-emerald-50/60 text-emerald-900", ic: "text-emerald-600" },
  warn: { icon: TriangleAlert, cls: "border-amber-200 bg-amber-50/70 text-amber-900", ic: "text-amber-600" },
  error: { icon: CircleAlert, cls: "border-red-200 bg-red-50/60 text-red-900", ic: "text-red-600" },
};
/** Alerta al estilo shadcn: icono, texto y borde, sin fondos saturados. */
export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok" | "warn"; children: React.ReactNode }) {
  const n = NOTICE[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${n.cls}`}>
      <n.icon className={`mt-0.5 size-4 shrink-0 ${n.ic}`} aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

export function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  return (<>{sp?.ok && <Notice kind="ok">{sp.ok}</Notice>}{sp?.error && <Notice kind="error">{sp.error}</Notice>}</>);
}

export function Section({ title, subtitle, actions, icon: Icon, children }: { title: string; subtitle?: string; actions?: React.ReactNode; icon?: any; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">{Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Pestañas tipo «segmented control» (shadcn Tabs). */
export function Tabs({ tabs, active, base }: { tabs: [string, string][]; active: string; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mb-6 max-w-full overflow-x-auto">
      <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground" role="tablist">
        {tabs.map(([k, l]) => (
          <a key={k} href={`${base}${sep}tab=${k}`} role="tab" aria-selected={active === k}
            className={`inline-flex h-full items-center whitespace-nowrap rounded-md px-3 text-sm font-medium no-underline transition-colors ${active === k ? "bg-background text-foreground shadow-xs" : "hover:text-foreground"}`}>{l}</a>))}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, icon: Icon = Inbox }: { title: string; children?: React.ReactNode; action?: React.ReactNode; icon?: any }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="mb-3 grid size-10 place-items-center rounded-lg border bg-background shadow-xs"><Icon className="size-5 text-muted-foreground" aria-hidden /></span>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Esqueleto de carga con la forma de una vista: encabezado, tarjetas y tabla. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Cargando…</span>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2.5"><div className="skeleton h-7 w-64" /><div className="skeleton h-4 w-96 max-w-full" /></div>
        <div className="skeleton h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3 rounded-xl border bg-card p-5"><div className="skeleton h-4 w-24" /><div className="skeleton h-7 w-16" /><div className="skeleton h-3 w-32" /></div>)}
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/40 px-4 py-3"><div className="skeleton h-3 w-full max-w-xl" /></div>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0"><div className="skeleton h-4 flex-1" /><div className="skeleton h-4 w-24" /><div className="skeleton h-5 w-16" /></div>)}
      </div>
    </div>
  );
}
