import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus, FileText as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, programScope, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader, Stat, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import { FORM_KINDS } from "@/lib/forms";
import { createForm } from "./actions";
import { formFilter, manageablePrograms } from "./server";

export default async function Formularios({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "forms.manage") && !can(u, "forms.responses")) redirect("/sin-acceso");
  const sp = await searchParams;
  const perm = can(u, "forms.manage") ? "forms.manage" : "forms.responses";
  const f1 = formFilter(u, "forms.manage"), f2 = formFilter(u, "forms.responses");
  const where = [`(${f1.sql} OR ${f2.sql})`]; const p: any[] = [...f1.params, ...f2.params];
  if (sp.tipo) { where.push("f.kind=?"); p.push(sp.tipo); }
  if (sp.estado) { where.push("f.status=?"); p.push(sp.estado); }
  if (sp.programa) { where.push("f.program_id=?"); p.push(Number(sp.programa)); }
  if (sp.q) { where.push("f.name LIKE ?"); p.push(`%${sp.q}%`); }
  const forms = all<any>(`SELECT f.*, p.name program, e.title event,
      (SELECT COUNT(*) FROM form_responses r WHERE r.form_id=f.id AND r.status<>'borrador') enviados,
      (SELECT COUNT(*) FROM form_responses r WHERE r.form_id=f.id AND r.status='borrador') borradores,
      (SELECT MAX(published_at) FROM form_versions v WHERE v.form_id=f.id) published_at
    FROM forms f LEFT JOIN programs p ON p.id=f.program_id LEFT JOIN events e ON e.id=f.event_id
    WHERE ${where.join(" AND ")} ORDER BY f.updated_at DESC`, ...p);
  const programs = manageablePrograms(u);
  const sc = programScope(u, perm);
  const kinds = Object.fromEntries(FORM_KINDS);
  const tot = { pub: forms.filter((f) => f.status === "publicado").length, resp: forms.reduce((a, f) => a + f.enviados, 0), draft: forms.filter((f) => f.status === "borrador").length };
  return (
    <>
      <PageHeader icon={PageIcon} title="Formularios" subtitle="Constructor sin código para inscripciones, diagnósticos y encuestas, con versiones, enlace público y exportación"
        actions={can(u, "forms.manage") && <a href="#nuevo" className="btn"><Plus className="h-4 w-4" />Nuevo formulario</a>} />
      <Flash sp={sp} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Publicados" value={tot.pub} hint="Reciben respuestas" />
        <Stat label="En borrador" value={tot.draft} />
        <Stat label="Respuestas enviadas" value={tot.resp} />
      </div>
      <form className="mb-3 flex flex-wrap gap-2 text-sm" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Buscar por nombre" className="input !w-56" aria-label="Buscar por nombre" />
        <select name="tipo" defaultValue={sp.tipo || ""} className="input !w-auto" aria-label="Tipo"><option value="">Todos los tipos</option>{FORM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="estado" defaultValue={sp.estado || ""} className="input !w-auto" aria-label="Estado"><option value="">Todos los estados</option><option value="borrador">Borrador</option><option value="publicado">Publicado</option><option value="archivado">Archivado</option></select>
        <select name="programa" defaultValue={sp.programa || ""} className="input !w-auto" aria-label="Programa"><option value="">Todos los programas</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <button className="btn-ghost">Filtrar</button>
      </form>
      {forms.length === 0 ? (
        <EmptyState title="No hay formularios" action={can(u, "forms.manage") && <a href="#nuevo" className="btn">Crear el primero</a>}>
          Crea un formulario de inscripción, un diagnóstico con puntaje o una encuesta. No necesitas conocimientos técnicos.
        </EmptyState>
      ) : (
        <Table head={["Formulario", "Tipo", "Programa / evento", "Estado", "Versión", "Respuestas", "Actualizado", ""]}>
          {forms.map((f) => (
            <tr key={f.id}>
              <Td><Link href={`/formularios/${f.id}`} className="font-medium text-ink hover:text-brand"><FileText className="mr-1 inline h-4 w-4 text-slate-400" />{f.name}</Link>
                {f.description && <div className="max-w-sm truncate text-xs text-slate-400">{f.description}</div>}</Td>
              <Td>{kinds[f.kind] || f.kind}</Td>
              <Td>{f.program || <span className="text-slate-400">Toda la organización</span>}{f.event && <div className="text-xs text-slate-400">Evento: {f.event}</div>}</Td>
              <Td><Badge>{f.status}</Badge></Td>
              <Td>{f.version ? `v${f.version}` : "—"}</Td>
              <Td>{f.enviados}{f.borradores > 0 && <span className="text-xs text-slate-400"> · {f.borradores} en borrador</span>}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtDate(f.updated_at)}</Td>
              <Td className="whitespace-nowrap">
                {can(u, "forms.manage") && <Link className="text-brand" href={`/formularios/${f.id}`}>Editar</Link>}
                {f.version > 0 && <> · <Link className="text-brand" href={`/formularios/${f.id}/respuestas`}>Respuestas</Link></>}
              </Td>
            </tr>))}
        </Table>)}

      {can(u, "forms.manage") && (
        <form id="nuevo" action={createForm} className="card mt-6 grid scroll-mt-20 gap-3 md:grid-cols-4">
          <div className="md:col-span-4"><div className="font-semibold text-ink">Nuevo formulario</div>
            <p className="text-sm text-slate-500">Elige el tipo: los diagnósticos incluyen puntaje por opción, pesos por pregunta y dimensión, y niveles de madurez.</p></div>
          <div className="md:col-span-2"><Field label="Nombre *"><input name="name" required minLength={3} className="input" placeholder="Ej.: Inscripción Territorio MIPYME 2027" /></Field></div>
          <Field label="Tipo"><select name="kind" className="input">{FORM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Programa"><select name="program_id" className="input">
            {sc === null && <option value="">Toda la organización</option>}
            {programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <div className="md:col-span-3"><Field label="Descripción (la verán los participantes)"><input name="description" className="input" /></Field></div>
          <Field label="Copiar de (opcional)"><select name="copy_of" className="input"><option value="">Empezar en blanco</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          <div><button className="btn">Crear y abrir el constructor</button></div>
        </form>)}
    </>
  );
}
