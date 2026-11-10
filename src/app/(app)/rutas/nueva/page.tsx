import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { all, get, setting } from "@/lib/db";
import { can, canSeeCompany, companyFilter, requirePerm, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader } from "@/components/ui";
import { HBarChart } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { recommend, ROUTE_STATUS, routeTone, STEP_KIND, templates, templateSteps } from "@/lib/routes";
import { RutasNav } from "../view";
import * as A from "../actions";

export default async function Nueva({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "routes.manage");
  const sp = await searchParams;
  const f = companyFilter(u);
  const companies = all<any>(`SELECT c.id, c.razon_social, c.nit FROM companies c WHERE c.status='activa' AND ${f.sql} ORDER BY c.razon_social`, ...f.params);
  const cid = Number(sp.empresa) || 0;
  const company = cid && canSeeCompany(u, cid) ? get<any>("SELECT c.*, p.name program FROM companies c LEFT JOIN programs p ON p.id=c.program_id WHERE c.id=?", cid) : null;
  const tpls = company ? templates().filter((t) => !t.program_id || t.program_id === company.program_id) : [];
  const rec = company ? recommend(company.id) : null;
  const existing = company ? all<any>("SELECT id, name, status FROM company_routes WHERE company_id=? ORDER BY id DESC", company.id) : [];
  const approve = can(u, "routes.approve");

  return (
    <>
      <PageHeader icon={PageIcon} title="Rutas de acompañamiento" subtitle="Nueva ruta personalizada: desde una plantilla o desde el diagnóstico" />
      <RutasNav u={u} active="nueva" />
      <Flash sp={sp} />
      <form className="card mb-5 flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1"><span className="label">1. Empresa</span>
          <select name="empresa" defaultValue={cid || ""} required className="input">
            <option value="">Elige una empresa activa…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social} — NIT {c.nit}</option>)}
          </select></label>
        <button className="btn-ghost">Continuar</button>
      </form>

      {!company && <Notice>Elige la empresa para ver las plantillas de su programa y la recomendación a partir de su diagnóstico.</Notice>}

      {company && (
        <>
          {existing.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">Rutas de {company.razon_social}:
              {existing.map((r) => <Link key={r.id} href={`/rutas/${r.id}`} className="underline">{r.name} <Badge tone={routeTone(r.status)}>{ROUTE_STATUS[r.status]}</Badge></Link>)}
            </div>)}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Desde el diagnóstico (RF-RUT-05) */}
            <section className="card" aria-labelledby="reco">
              <h2 id="reco" className="mb-1 font-semibold text-ink">2a. Recomendación desde el diagnóstico</h2>
              <p className="mb-3 text-xs text-slate-500">
                Motor de reglas: la dimensión más débil define el eje y el nivel define la línea (Básico/Avanzado).
                {setting("ai_enabled", "0") === "1" ? " IA habilitada." : " Apoyo de IA desactivado (opcional)."} La propuesta nunca se asigna sin la aprobación del mentor.
              </p>
              {!rec?.diagnostic ? (
                <Notice>{company.razon_social} aún no tiene un diagnóstico completado. Usa una plantilla o asígnale el diagnóstico.</Notice>
              ) : (
                <>
                  <p className="mb-2 text-sm">Diagnóstico {rec.diagnostic.form_name ? `«${rec.diagnostic.form_name}» ` : ""}del {fmtDate(rec.diagnostic.completed_at || rec.diagnostic.created_at, false)} · nivel <b>{rec.level || "—"}</b>{rec.diagnostic.score != null ? ` · puntaje ${rec.diagnostic.score}` : ""}</p>
                  {rec.sections.length > 0 && <div className="mb-3"><HBarChart data={rec.sections.map((s) => ({ label: s.name, value: s.pct, color: s.name === rec.weakest?.name ? "#dc2626" : undefined }))} max={100} format={(v) => v + "%"} /></div>}
                  <p className="mb-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{rec.reason}</p>
                  {rec.ruta && (
                    <form action={A.proposeRoute}>
                      <input type="hidden" name="company_id" value={company.id} />
                      <button className="btn">Crear propuesta «{rec.ruta.name}»</button>
                    </form>)}
                </>)}
            </section>

            {/* Desde plantilla (RF-RUT-01) */}
            <section className="card" aria-labelledby="tpl">
              <h2 id="tpl" className="mb-1 font-semibold text-ink">2b. Desde una plantilla</h2>
              <p className="mb-3 text-xs text-slate-500">Elige la plantilla, revisa sus etapas y crea la ruta. Luego ajusta línea base y metas de cada etapa.</p>
              {tpls.length === 0 ? <Notice>No hay plantillas activas para el programa {company.program}.</Notice> : (
                <form action={A.createRoute} className="space-y-3">
                  <input type="hidden" name="company_id" value={company.id} />
                  <input type="hidden" name="started_at" value={Date.now()} />
                  <fieldset className="space-y-2">
                    <legend className="label">Plantilla</legend>
                    {tpls.map((t, i) => (
                      <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                        <label className="flex items-start gap-2 text-sm">
                          <input type="radio" name="ruta_id" value={t.id} required defaultChecked={rec?.ruta?.id ? rec.ruta.id === t.id : i === 0} className="mt-1" />
                          <span><b>{t.name}</b> <span className="text-slate-500">· {t.eje} / {t.linea} · {t.steps} etapa(s)</span></span>
                        </label>
                        <details className="ml-6 mt-1">
                          <summary className="cursor-pointer text-xs text-brand">Ver etapas</summary>
                          <ol className="mt-1 list-decimal pl-5 text-xs text-slate-600">
                            {templateSteps(t.id).map((s) => <li key={s.id}>{s.name} <span className="text-slate-400">({STEP_KIND[s.kind]}{s.servicio ? `: ${s.servicio}` : s.evento ? `: ${s.evento}` : ""}{s.indicator ? ` · ${s.indicator}, meta ${s.goal}` : ""})</span></li>)}
                          </ol>
                        </details>
                      </div>))}
                  </fieldset>
                  <Field label="Nombre de la ruta" hint="Si lo dejas vacío se usa el de la plantilla"><input name="name" className="input" placeholder={`Ej.: Ruta de ventas — ${company.razon_social}`} /></Field>
                  {rec?.diagnostic && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="link_diagnostic" defaultChecked /> Vincular al diagnóstico del {fmtDate(rec.diagnostic.completed_at || rec.diagnostic.created_at, false)}<input type="hidden" name="diagnostic_id" value={rec.diagnostic.id} /></label>}
                  {approve && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activate" /> Aprobar y activar de inmediato</label>}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="show_home" defaultChecked /> Mostrar en el inicio de la empresa al activarla</label>
                  <button className="btn w-full sm:w-auto">Crear ruta</button>
                </form>)}
            </section>
          </div>
        </>)}
    </>
  );
}
