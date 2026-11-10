import Link from "next/link";
import { LayoutDashboard, Share2, BarChart3 as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, requirePerm, requireUser } from "@/lib/auth";
import { DASHBOARD_PRESETS, type Widget } from "@/lib/analytics";
import { fmtDate, jparse } from "@/lib/util";
import { Badge, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import * as A from "./actions";

export default async function Tableros({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "analytics.view");
  const sp = await searchParams;
  const mine = all<any>("SELECT * FROM dashboards WHERE user_id=? ORDER BY updated_at DESC", u.id);
  const shared = all<any>("SELECT d.*, u.name owner FROM dashboards d LEFT JOIN users u ON u.id=d.user_id WHERE d.shared=1 AND d.user_id<>? ORDER BY d.updated_at DESC", u.id);
  const manage = can(u, "dashboards.manage");
  const CardD = ({ d, owner }: { d: any; owner?: string }) => {
    const n = jparse<Widget[]>(d.widgets, []).length;
    return (
      <li className="card flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/analitica/tableros/${d.id}`} className="font-semibold text-brand hover:underline">{d.name}</Link>
          {d.shared ? <Badge tone="blue">compartido</Badge> : <Badge tone="slate">privado</Badge>}
        </div>
        <div className="text-xs text-slate-500">{n} widget(s){owner ? ` · de ${owner}` : ""} · actualizado {fmtDate(d.updated_at)}</div>
        <div className="mt-auto flex flex-wrap gap-2">
          <Link href={`/analitica/tableros/${d.id}`} className="btn-ghost btn-sm">Abrir</Link>
          {!owner && manage && <Link href={`/analitica/tableros/${d.id}?editar=1`} className="btn-ghost btn-sm">Editar</Link>}
          {owner && manage && <form action={A.duplicateDashboard}><input type="hidden" name="id" value={d.id} /><button className="btn-ghost btn-sm">Copiar a mis tableros</button></form>}
        </div>
      </li>);
  };
  return (
    <>
      <PageHeader icon={PageIcon} title="Tableros configurables" subtitle="Arma tu tablero con indicadores, gráficos y tablas sobre datos en tiempo real"
        actions={<><Link href="/analitica" className="btn-ghost btn-sm">← Analítica</Link><Link href="/analitica/consultas" className="btn-ghost btn-sm">Constructor de consultas</Link></>} />
      <Flash sp={sp} />
      {manage && (
        <form action={A.createDashboard} className="card mb-6 grid gap-3 md:grid-cols-4 md:items-end" aria-label="Nuevo tablero">
          <Field label="Nombre del tablero"><input name="name" maxLength={100} className="input" placeholder="Ej.: Seguimiento semanal de mentorías" /></Field>
          <Field label="Comenzar desde">
            <select name="preset" className="input" defaultValue="">
              <option value="">Tablero vacío</option>
              {Object.entries(DASHBOARD_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.name} — {p.description}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shared" />Compartir con usuarios de analítica</label>
          <button className="btn"><LayoutDashboard className="h-4 w-4" />Crear tablero</button>
        </form>)}
      <h2 className="mb-2 font-semibold text-ink">Mis tableros</h2>
      {mine.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.map((d) => <CardD key={d.id} d={d} />)}</ul>
        : <EmptyState title="Aún no tienes tableros">{manage ? "Crea uno vacío o parte de la plantilla operativa o estratégica." : "Tu rol puede consultar los tableros compartidos; para crear los tuyos se requiere el permiso «Crear tableros configurables»."}</EmptyState>}
      <h2 className="mb-2 mt-8 flex items-center gap-2 font-semibold text-ink"><Share2 className="h-4 w-4" aria-hidden />Compartidos conmigo</h2>
      {shared.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shared.map((d) => <CardD key={d.id} d={d} owner={d.owner} />)}</ul>
        : <p className="text-sm text-slate-500">No hay tableros compartidos.</p>}
      <p className="mt-6 text-xs text-slate-400">Un tablero compartido muestra a cada persona solo los datos de su alcance (seguridad a nivel de fila).</p>
    </>
  );
}
