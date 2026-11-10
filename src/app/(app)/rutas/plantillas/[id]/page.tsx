import { Route as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Field, Flash, Notice, PageHeader, Table, Td } from "@/components/ui";
import { canEditTemplate, isInternalRouteUser, STEP_KIND, template, templateSteps } from "@/lib/routes";
import * as A from "../../actions";

function StepFields({ s, servicios, events }: { s?: any; servicios: any[]; events: any[] }) {
  return (
    <>
      <div className="sm:col-span-2"><Field label="Nombre del paso *"><input name="name" required defaultValue={s?.name} className="input" /></Field></div>
      <Field label="Tipo"><select name="kind" defaultValue={s?.kind || "servicio"} className="input">{Object.entries(STEP_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Servicio del catálogo" hint="Obligatorio si el tipo es servicio"><select name="servicio_id" defaultValue={s?.servicio_id || ""} className="input"><option value="">—</option>{servicios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label="Curso / evento" hint="Si el tipo es curso"><select name="event_id" defaultValue={s?.event_id || ""} className="input"><option value="">—</option>{events.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Indicador de la etapa"><input name="indicator" defaultValue={s?.indicator || ""} className="input" placeholder="Ej.: Margen neto (%)" /></Field></div>
      <Field label="Meta *"><input name="goal" required inputMode="decimal" defaultValue={s?.goal ?? ""} className="input" /></Field>
    </>
  );
}

export default async function Plantilla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  if (u.company_id || !isInternalRouteUser(u)) redirect("/sin-acceso");
  const t = template(Number((await params).id));
  if (!t) redirect("/rutas/plantillas");
  const sp = await searchParams;
  const edit = canEditTemplate(u, t.program_id);
  const steps = templateSteps(t.id);
  const servicios = all<any>("SELECT id, name FROM servicios WHERE active=1 AND (program_id=? OR program_id IS NULL) ORDER BY name", t.program_id ?? 0);
  const events = all<any>("SELECT id, title FROM events WHERE active=1 ORDER BY start_at DESC");
  return (
    <>
      <PageHeader icon={PageIcon} title={t.name} subtitle={`Plantilla · ${t.program || ""} · ${t.eje} / ${t.linea}`} actions={<Link href="/rutas/plantillas" className="btn-ghost">← Plantillas</Link>} />
      <Flash sp={sp} />
      {!edit && <Notice>Solo lectura: editar plantillas requiere configurar rutas con alcance sobre el programa.</Notice>}
      <Table head={["#", "Paso", "Tipo", "Servicio / curso", "Indicador", "Meta", ...(edit ? [""] : [])]} empty="La plantilla no tiene pasos">
        {steps.map((s, i) => (
          <tr key={s.id}>
            <Td>{i + 1}</Td><Td><b>{s.name}</b></Td><Td className="text-xs">{STEP_KIND[s.kind]}</Td>
            <Td className="text-sm">{s.servicio || s.evento || "—"}</Td><Td className="text-sm">{s.indicator || "—"}</Td><Td>{s.goal ?? "—"}</Td>
            {edit && (
              <Td>
                <div className="flex flex-wrap gap-1">
                  <form action={A.moveTemplateStep}><input type="hidden" name="ruta_id" value={t.id} /><input type="hidden" name="step_id" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="btn-ghost btn-sm" disabled={i === 0} aria-label={`Subir ${s.name}`}>↑</button></form>
                  <form action={A.moveTemplateStep}><input type="hidden" name="ruta_id" value={t.id} /><input type="hidden" name="step_id" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="btn-ghost btn-sm" disabled={i === steps.length - 1} aria-label={`Bajar ${s.name}`}>↓</button></form>
                  <form action={A.removeTemplateStep}><input type="hidden" name="ruta_id" value={t.id} /><input type="hidden" name="step_id" value={s.id} /><button className="btn-ghost btn-sm text-red-700">Quitar</button></form>
                  <details className="w-full">
                    <summary className="btn-ghost btn-sm list-none">Editar</summary>
                    <form action={A.saveTemplateStep} className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
                      <input type="hidden" name="ruta_id" value={t.id} /><input type="hidden" name="step_id" value={s.id} />
                      <StepFields s={s} servicios={servicios} events={events} />
                      <div className="sm:col-span-4"><button className="btn btn-sm">Guardar paso</button></div>
                    </form>
                  </details>
                </div>
              </Td>)}
          </tr>))}
      </Table>
      {edit && (
        <form action={A.addTemplateStep} className="card mt-5 grid gap-3 sm:grid-cols-4">
          <h2 className="font-semibold text-ink sm:col-span-4">Agregar paso</h2>
          <input type="hidden" name="ruta_id" value={t.id} />
          <StepFields servicios={servicios} events={events} />
          <div className="sm:col-span-4"><button className="btn">Agregar paso</button></div>
        </form>)}
    </>
  );
}
