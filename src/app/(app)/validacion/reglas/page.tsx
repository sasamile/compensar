import { ShieldCheck as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader, Table, Td } from "@/components/ui";
import { CAMPOS, campoLabel, FUENTE } from "@/lib/integrations/gestion-clientes";
import { autoSummary, autoTone, evaluateNit, managePrograms, opLabel, OPERATORS, type Rule } from "@/lib/validation";
import { ValNav } from "../nav";
import * as A from "../actions";

function RuleFields({ r, programs }: { r?: Rule; programs: any[] }) {
  return (
    <>
      <Field label="Programa"><select name="program_id" defaultValue={r?.program_id} className="input">{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Nombre (motivo visible) *"><input name="name" required defaultValue={r?.name} className="input" placeholder="Ej.: Afiliación a Compensar ≥ 6 meses" /></Field></div>
      <Field label="Campo de Gestión de Clientes"><select name="field" defaultValue={r?.field} className="input">{CAMPOS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
      <Field label="Operador"><select name="operator" defaultValue={r?.operator || ">="} className="input">{OPERATORS.map(([k, l]) => <option key={k} value={k}>{l} ({k})</option>)}</select></Field>
      <Field label="Valor" hint="Sí/No: 1 o 0"><input name="value" defaultValue={r?.value} className="input" /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={r ? !!r.active : true} /> Activa</label>
    </>
  );
}

export default async function Reglas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "validation.view") && !can(u, "validation.manage")) redirect("/sin-acceso");
  const sp = await searchParams;
  const scope = can(u, "validation.manage") ? managePrograms(u) : [];
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  const editable = programs.filter((p) => scope === null || scope.includes(p.id));
  const pid = Number(sp.programa) || editable[0]?.id || programs[0]?.id;
  const canEdit = editable.some((p) => p.id === pid);
  const rules = all<Rule>("SELECT * FROM validation_rules WHERE program_id=? ORDER BY active DESC, id", pid);
  const test = sp.probar ? await evaluateNit(String(sp.probar), pid) : null;

  return (
    <>
      <PageHeader icon={PageIcon} title="Validación de requisitos" subtitle="Reglas automáticas por programa (consultan Gestión de Clientes)" />
      <ValNav u={u} active="reglas" />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Programa">
        {programs.map((p) => (
          <Link key={p.id} href={`/validacion/reglas?programa=${p.id}`} role="tab" aria-selected={p.id === pid}
            className={`rounded-full border px-3 py-1 text-sm ${p.id === pid ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>{p.name}</Link>))}
      </div>
      <Notice>Una solicitud <b>cumple</b> si pasa todas las reglas activas de su programa. Fuente de datos: {FUENTE()}.</Notice>

      <Table head={["Regla", "Condición", "Estado", ...(canEdit ? [""] : [])]} empty="Este programa no tiene reglas">
        {rules.map((r) => (
          <tr key={r.id}>
            <Td><b>{r.name}</b><div className="text-xs text-slate-400">{r.key}</div></Td>
            <Td className="text-sm">{campoLabel(r.field)} <b>{opLabel(r.operator)}</b> {r.operator === "existe" ? "" : r.value}</Td>
            <Td><Badge tone={r.active ? "green" : "slate"}>{r.active ? "Activa" : "Inactiva"}</Badge></Td>
            {canEdit && (
              <Td>
                <div className="flex flex-wrap items-start gap-2">
                  <form action={A.toggleRule}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost btn-sm">{r.active ? "Desactivar" : "Activar"}</button></form>
                  <details className="w-full sm:w-auto">
                    <summary className="btn-ghost btn-sm list-none">Editar</summary>
                    <form action={A.saveRule} className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
                      <input type="hidden" name="id" value={r.id} />
                      <RuleFields r={r} programs={editable} />
                      <div className="sm:col-span-4"><button className="btn btn-sm">Guardar cambios</button></div>
                    </form>
                  </details>
                </div>
              </Td>)}
          </tr>))}
      </Table>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {canEdit && (
          <form action={A.saveRule} className="card grid gap-3 sm:grid-cols-4">
            <h2 className="font-semibold text-ink sm:col-span-4">Nueva regla</h2>
            <RuleFields programs={editable.map((p) => p).sort((a, b) => (a.id === pid ? -1 : b.id === pid ? 1 : 0))} />
            <div className="sm:col-span-4"><button className="btn">Crear regla</button></div>
          </form>)}
        <section className="card">
          <h2 className="mb-2 font-semibold text-ink">Probar las reglas con un NIT</h2>
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="programa" value={pid} />
            <input name="probar" defaultValue={sp.probar} required placeholder="NIT sin DV" aria-label="NIT a probar" className="input !w-48" />
            <button className="btn-ghost">Probar</button>
          </form>
          {test && (
            <div className="mt-3 text-sm">
              <div className="mb-2">Resultado: <Badge tone={autoTone(test)}>{autoSummary(test)}</Badge></div>
              {test.error && <p className="text-red-700">{test.error}</p>}
              <ul className="space-y-1">{test.results.map((r, i) => <li key={i} className={r.ok ? "text-emerald-700" : "text-red-700"}>{r.ok ? "✓" : "✗"} {r.msg}</li>)}</ul>
            </div>)}
        </section>
      </div>
    </>
  );
}
