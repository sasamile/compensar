import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Flash, Notice, PageHeader, Stat, Table, Td } from "@/components/ui";
import { Progress } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { isInternalRouteUser, ORIGIN, progress, ROUTE_SELECT, ROUTE_STATUS, routeFilter, routeLog, routeSteps, routeTone } from "@/lib/routes";
import { myOpenRequests } from "@/lib/validation";
import { RutasNav, StepCard, Timeline } from "./view";

/** Vista de la empresa (FUN-81): su ruta, etapas, servicios y avance; pensada para el celular. */
async function CompanyView({ u, sp }: { u: any; sp: any }) {
  const f = routeFilter(u);
  const routes = all<any>(`${ROUTE_SELECT} WHERE ${f.sql} ORDER BY CASE cr.status WHEN 'activa' THEN 0 ELSE 1 END, cr.id DESC`, ...f.params);
  const reqs = myOpenRequests(u);
  const main = routes.find((r) => r.status === "activa") || routes[0];
  const steps = main ? routeSteps(main.id) : [];
  const pg = progress(steps);
  const company = get<any>("SELECT razon_social FROM companies WHERE id=?", u.company_id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader icon={PageIcon} title="Mi ruta de acompañamiento" subtitle={company?.razon_social} />
      <Flash sp={sp} />
      {reqs.length > 0 && <Notice>Compensar te pidió información adicional ({reqs.length}). <Link className="font-medium underline" href="/validacion/solicitudes">Responder</Link></Notice>}
      {!main ? (
        <EmptyState title="Aún no tienes una ruta asignada">Tu mentor arma la ruta a partir de tu diagnóstico. Te avisaremos por correo, SMS y WhatsApp cuando esté lista.</EmptyState>
      ) : (
        <>
          <section className="card mb-5" aria-labelledby="ruta-actual">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="ruta-actual" className="text-lg font-semibold text-ink">{main.name}</h2>
                <p className="text-sm text-slate-500">{main.program}{main.mentor ? ` · Mentor: ${main.mentor}` : ""}</p>
              </div>
              <Badge tone={routeTone(main.status)}>{ROUTE_STATUS[main.status]}</Badge>
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-sm"><span>Avance</span><b>{pg.pct}%</b></div>
              <Progress value={pg.pct} />
              <p className="mt-1 text-xs text-slate-500">{pg.done} de {pg.total} etapas completadas{pg.inCourse ? ` · ${pg.inCourse} en curso` : ""}</p>
            </div>
            {main.close_result && <p className="mt-3 rounded bg-slate-50 p-2 text-sm">Resultado del cierre: {main.close_result}</p>}
          </section>
          <h2 className="mb-3 font-semibold text-ink">Etapas</h2>
          <ol className="mb-6 space-y-3">{steps.map((s, i) => <StepCard key={s.id} s={s} n={i + 1} />)}</ol>
          <details className="card mb-5">
            <summary className="cursor-pointer font-semibold text-ink">Historial de la ruta</summary>
            <div className="mt-4"><Timeline log={routeLog(main.id)} /></div>
          </details>
          {routes.length > 1 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">Otras rutas</h2>
              <ul className="space-y-2">{routes.filter((r) => r.id !== main.id).map((r) => (
                <li key={r.id}><Link href={`/rutas/${r.id}`} className="card flex items-center justify-between !p-3 hover:border-brand">
                  <span>{r.name}<span className="block text-xs text-slate-500">{r.done_steps}/{r.total_steps} etapas</span></span><Badge tone={routeTone(r.status)}>{ROUTE_STATUS[r.status]}</Badge></Link></li>))}
              </ul>
            </section>)}
        </>)}
    </div>
  );
}

export default async function Rutas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  if (u.company_id) {
    if (!can(u, "routes.view")) redirect("/sin-acceso");
    return <CompanyView u={u} sp={sp} />;
  }
  if (!isInternalRouteUser(u)) redirect("/sin-acceso");
  const f = routeFilter(u);
  const where = [f.sql]; const p: any[] = [...f.params];
  if (sp.estado) where.push("cr.status=?"), p.push(sp.estado);
  if (sp.origen) where.push("cr.origin=?"), p.push(sp.origen);
  if (sp.q) where.push("(c.razon_social LIKE ? OR c.nit LIKE ? OR cr.name LIKE ?)"), p.push(`%${sp.q}%`, `%${sp.q}%`, `%${sp.q}%`);
  if (sp.pendientes) where.push("(cr.status='propuesta' OR EXISTS (SELECT 1 FROM route_closures k WHERE k.company_route_id=cr.id AND k.status='pendiente'))");
  const rows = all<any>(`${ROUTE_SELECT} WHERE ${where.join(" AND ")} ORDER BY CASE cr.status WHEN 'propuesta' THEN 0 WHEN 'activa' THEN 1 ELSE 2 END, cr.id DESC LIMIT 500`, ...p);
  const allRows = all<any>(`SELECT cr.status, (SELECT COUNT(*) FROM route_closures k WHERE k.company_route_id=cr.id AND k.status='pendiente') pc FROM company_routes cr WHERE ${f.sql}`, ...f.params);

  return (
    <>
      <PageHeader title="Rutas de acompañamiento" subtitle="Rutas personalizadas por empresa: etapas, metas, avance y cierre"
        actions={can(u, "routes.manage") ? <Link href="/rutas/nueva" className="btn">+ Nueva ruta</Link> : null} />
      <RutasNav u={u} active="rutas" />
      <Flash sp={sp} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Activas" value={allRows.filter((r) => r.status === "activa").length} />
        <Stat label="Propuestas por aprobar" value={allRows.filter((r) => r.status === "propuesta").length} />
        <Stat label="Cierres por aprobar" value={allRows.reduce((a, r) => a + r.pc, 0)} />
        <Stat label="Cerradas / escaladas" value={allRows.filter((r) => ["cerrada", "escalada"].includes(r.status)).length} />
      </div>
      <form className="mb-3 flex flex-wrap gap-2" aria-label="Filtros">
        <input name="q" defaultValue={sp.q} placeholder="Empresa, NIT o ruta" aria-label="Buscar" className="input !w-64" />
        <select name="estado" defaultValue={sp.estado || ""} aria-label="Estado" className="input !w-auto"><option value="">Todos los estados</option>{Object.entries(ROUTE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="origen" defaultValue={sp.origen || ""} aria-label="Origen" className="input !w-auto"><option value="">Todos los orígenes</option>{Object.entries(ORIGIN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="pendientes" value="1" defaultChecked={!!sp.pendientes} /> Solo con aprobación pendiente</label>
        <button className="btn-ghost">Filtrar</button>
      </form>
      <Table head={["Empresa", "Ruta", "Origen", "Estado", "Avance", "Mentor", "Actualizada", ""]} empty="No hay rutas con estos filtros">
        {rows.map((r) => {
          const pct = r.total_steps ? Math.round((r.done_steps / r.total_steps) * 100) : 0;
          return (
            <tr key={r.id}>
              <Td><b>{r.company}</b><div className="text-xs text-slate-400">NIT {r.nit}</div></Td>
              <Td>{r.name}{r.parent_id ? <div className="text-xs text-violet-700">Escalada desde #{r.parent_id}</div> : null}</Td>
              <Td className="text-xs">{ORIGIN[r.origin] || r.origin}</Td>
              <Td><Badge tone={routeTone(r.status)}>{ROUTE_STATUS[r.status]}</Badge>
                {r.status === "propuesta" && <div className="mt-1 text-xs text-amber-700">Requiere aprobación</div>}
                {r.pending_closures > 0 && <div className="mt-1 text-xs text-violet-700">Cierre por aprobar</div>}</Td>
              <Td><div className="w-28"><Progress value={pct} /></div><div className="text-xs text-slate-500">{r.done_steps}/{r.total_steps} · {pct}%</div></Td>
              <Td>{r.mentor || "—"}</Td>
              <Td className="text-xs">{fmtDate(r.approved_at || r.created_at, false)}</Td>
              <Td><Link className="text-brand" href={`/rutas/${r.id}`}>Abrir</Link></Td>
            </tr>);
        })}
      </Table>
    </>
  );
}
