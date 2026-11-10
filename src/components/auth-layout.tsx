import { BadgeCheck, CalendarCheck2, FileCheck2, ShieldCheck, TrendingUp } from "lucide-react";
import { setting } from "@/lib/db";

/**
 * Pantallas de acceso a pantalla completa, al estilo del bloque «login-02» de shadcn: la mitad izquierda
 * con el formulario y la derecha con una vista previa del trabajo diario en la plataforma.
 * La vista previa es ilustrativa y no muestra datos reales (la página es pública).
 */
export function AuthLayout({ children, title, subtitle, wide, footer }: { children: React.ReactNode; title: string; subtitle?: string; wide?: boolean; footer?: React.ReactNode }) {
  const brand = setting("brand_name", "Compensar");
  const color = setting("brand_color", "#2563eb");
  const tagline = setting("brand_tagline", "Plataforma de Fomento Empresarial");
  const logo = setting("brand_logo_doc", ""); // RF-PAR-06: logo cargado en Configuración → Marca
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2" style={{ ["--color-brand" as any]: color }}>
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2.5">
          {logo
            ? <img src={`/api/marca/logo?v=${logo}`} alt="" className="size-8 rounded-lg object-contain" />
            : <div className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">{brand[0]}</div>}
          <div className="leading-tight"><div className="text-sm font-semibold text-foreground">{brand}</div><div className="text-xs text-muted-foreground">{tagline}</div></div>
        </div>
        <div className="flex flex-1 items-center justify-center py-6">
          <div className={`w-full ${wide ? "max-w-xl 2xl:max-w-2xl" : "max-w-sm xl:max-w-md"}`}>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground 2xl:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6">{footer}</div>}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Al ingresar aceptas el tratamiento de datos conforme a la Ley 1581 de 2012.
        </p>
      </div>
      <Preview />
    </div>
  );
}

/** Vista previa del trabajo diario: indicadores, sesiones aceptadas, certificados y validación. */
function Preview() {
  return (
    <div className="relative hidden border-l bg-muted/50 lg:flex lg:items-center lg:justify-center"
      style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "20px 20px" }} aria-hidden>
      <div className="flex w-full max-w-xl flex-col gap-4 p-10 2xl:max-w-2xl 2xl:gap-5">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground">Tu operación en un solo lugar</p>
          <p className="mt-1 text-sm text-muted-foreground">Convocatorias, mentorías, servicios de aliados y resultados de cada empresa.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[["Empresas activas", "Validadas"], ["Sesiones", "Aceptadas por clic"], ["Reportes", "En Excel y PDF"]].map(([t, d]) => (
            <div key={t} className="rounded-xl border bg-card p-3.5 shadow-xs">
              <div className="text-xs text-muted-foreground">{t}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{d}</div>
            </div>))}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Sesiones aceptadas por las empresas</div>
              <div className="text-xs text-muted-foreground">Últimos 6 meses</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium text-foreground"><TrendingUp className="size-3" />En aumento</span>
          </div>
          <svg viewBox="0 0 300 100" className="mt-4 h-[clamp(9rem,22vh,15rem)] w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lg-prev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[25, 50, 75].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path d="M0,78 C30,72 50,64 75,66 C100,68 120,52 150,48 C180,44 200,38 225,30 C250,22 275,17 300,12 L300,100 L0,100 Z" fill="url(#lg-prev)" />
            <path d="M0,78 C30,72 50,64 75,66 C100,68 120,52 150,48 C180,44 200,38 225,30 C250,22 275,17 300,12" fill="none" stroke="var(--chart-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">{["jun", "jul", "ago", "sep", "oct", "nov"].map((m) => <span key={m}>{m}</span>)}</div>
        </div>

        <div className="rounded-xl border bg-card p-1.5 shadow-sm">
          {[
            [CalendarCheck2, "Sesión aceptada por la empresa", "Usuario, fecha, hora e IP registrados"],
            [FileCheck2, "Certificado emitido", "PDF con firma electrónica verificable"],
            [ShieldCheck, "Requisitos validados", "Consulta automática a Gestión de Clientes"],
          ].map(([I, t, d]: any) => (
            <div key={t} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background"><I className="size-4 text-muted-foreground" /></span>
              <span className="min-w-0 leading-tight"><span className="block text-sm font-medium text-foreground">{t}</span><span className="block truncate text-xs text-muted-foreground">{d}</span></span>
            </div>))}
        </div>

        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs">
          <BadgeCheck className="size-5 shrink-0 text-emerald-600" />
          <span className="text-sm text-foreground">Trazabilidad de punta a punta de cada empresa</span>
        </div>
      </div>
    </div>
  );
}
