import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, History, Inbox, Send, FileText as PageIcon } from "lucide-react";
import { all, get } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, Notice, PageHeader, Table, Tabs, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import { FORM_KINDS, parseSchema, parseScoring, validateSchema } from "@/lib/forms";
import FormBuilder from "@/components/form-builder";
import FormScoring from "@/components/form-scoring";
import { discardDraft, publishForm, recalcFormAction, saveFormSchema, saveFormSettings, saveScoring, setFormStatus } from "../actions";
import { canManageForm, canSeeResponses, getForm, manageablePrograms, versionOf } from "../server";
import { programScope } from "@/lib/auth";

export default async function FormEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const f = getForm(Number(id));
  if (!f) redirect("/formularios?error=" + encodeURIComponent("Formulario no encontrado"));
  if (!canManageForm(u, f)) { if (canSeeResponses(u, f)) redirect(`/formularios/${f.id}/respuestas`); redirect("/sin-acceso"); }
  const schema = parseSchema(f.schema);
  const scoring = parseScoring(f.scoring);
  const last = versionOf(f.id);
  const dirty = !last || JSON.stringify({ sections: last.schema.sections }) !== JSON.stringify({ sections: schema.sections }) || JSON.stringify(last.scoring) !== JSON.stringify(scoring);
  const diag = f.kind === "diagnostico";
  const tab = ["diseno", "config", "clasificacion", "versiones"].includes(sp.tab) ? sp.tab : "diseno";
  const counts = get<any>("SELECT SUM(status<>'borrador') enviados, SUM(status='borrador') borradores FROM form_responses WHERE form_id=?", f.id);
  const problems = validateSchema(schema, f.kind);
  const link = f.slug ? `/f/${f.slug}` : null;
  const kinds = Object.fromEntries(FORM_KINDS);
  const base = `/formularios/${f.id}`;
  const tabs: [string, string][] = [["diseno", "Diseño y vista previa"], ["config", "Configuración y publicación"], ...(diag ? [["clasificacion", "Clasificación y niveles"] as [string, string]] : []), ["versiones", `Versiones (${f.version})`]];

  return (
    <>
      <PageHeader icon={PageIcon} title={f.name}
        subtitle={`${kinds[f.kind] || f.kind} · ${f.program_id ? get<any>("SELECT name FROM programs WHERE id=?", f.program_id)?.name : "Toda la organización"}`}
        actions={<>
          {f.version > 0 && <Link href={`${base}/respuestas`} className="btn-ghost"><Inbox className="h-4 w-4" />Respuestas ({counts?.enviados || 0})</Link>}
          {f.version > 0 && f.status === "publicado" && link && !diag && <a href={link} target="_blank" className="btn-ghost"><ExternalLink className="h-4 w-4" />Abrir enlace</a>}
          {f.status !== "archivado" && (
            <form action={publishForm}><input type="hidden" name="id" value={f.id} />
              <button className="btn" disabled={problems.length > 0} title={problems.length ? problems.join("\n") : ""}><Send className="h-4 w-4" />{f.version ? (dirty ? `Publicar versión ${f.version + 1}` : "Publicado") : "Publicar"}</button>
            </form>)}
        </>} />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge>{f.status}</Badge>
        {f.version > 0 ? <span className="text-slate-600">Versión publicada: <b>v{f.version}</b> ({fmtDate(last?.published_at)})</span> : <span className="text-slate-500">Aún no se ha publicado</span>}
        {f.version > 0 && dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Hay cambios sin publicar en el borrador</span>}
        {f.version > 0 && dirty && f.status !== "archivado" && (
          <form action={discardDraft}><input type="hidden" name="id" value={f.id} /><button className="text-xs text-slate-500 underline">Descartar cambios</button></form>)}
        {problems.length > 0 && <span className="text-xs text-amber-700">· {problems.length} pendiente(s) antes de publicar (ver índice)</span>}
      </div>
      {f.status === "archivado" && <Notice>Este formulario está archivado: no recibe respuestas y no se puede editar. Las respuestas recibidas se conservan.</Notice>}
      {f.version > 0 && f.status === "publicado" && !dirty && <Notice kind="ok">Puedes seguir editando: los cambios quedan en borrador y al publicar se crea una versión nueva. Las respuestas ya recibidas no cambian.</Notice>}
      <Tabs tabs={tabs} active={tab} base={base} />

      {tab === "diseno" && <FormBuilder formId={f.id} kind={f.kind} initial={schema} save={saveFormSchema} readOnly={f.status === "archivado"} />}

      {tab === "config" && <Config f={f} u={u} schema={schema} counts={counts} />}

      {tab === "clasificacion" && diag && (
        <>
          <p className="mb-4 text-sm text-slate-600">Puntaje por opción y pesos por pregunta y dimensión se definen en <Link href={base} className="text-brand underline">Diseño</Link>. Aquí defines cómo se clasifica el total. Al cambiar estas reglas puedes recalcular los diagnósticos ya enviados (RF-DIA-06).</p>
          <FormScoring formId={f.id} initial={scoring} sections={schema.sections.map((s) => ({ id: s.id, title: s.title }))} action={saveScoring} disabled={f.status === "archivado"} />
          <form action={recalcFormAction} className="mt-4"><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={`${base}?tab=clasificacion`} />
            <button className="btn-ghost btn-sm">Recalcular ahora con las reglas guardadas</button></form>
        </>)}

      {tab === "versiones" && <Versions formId={f.id} />}
    </>
  );
}

function Config({ f, u, schema, counts }: { f: any; u: any; schema: any; counts: any }) {
  const programs = manageablePrograms(u);
  const sc = programScope(u, "forms.manage");
  const events = all<any>(`SELECT e.id, e.title, e.start_at, e.status, p.name program FROM events e LEFT JOIN programs p ON p.id=e.program_id
    WHERE e.active=1 ${sc === null ? "" : `AND e.program_id IN (${sc.map(() => "?").join(",") || "NULL"})`} ORDER BY e.start_at DESC LIMIT 200`, ...(sc ?? []));
  const program = f.program_id ? all<any>("SELECT name FROM programs WHERE id=?", f.program_id)[0]?.name : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form action={saveFormSettings} className="card grid gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={f.id} />
        <div className="md:col-span-2"><Field label="Nombre *"><input name="name" defaultValue={f.name} required minLength={3} className="input" /></Field></div>
        <div className="md:col-span-2"><Field label="Descripción (se muestra al participante)"><textarea name="description" defaultValue={f.description || ""} rows={2} className="input" /></Field></div>
        <Field label="Tipo" hint={counts?.enviados ? "No se puede cambiar: ya hay respuestas" : undefined}>
          <select name="kind" defaultValue={f.kind} className="input" disabled={!!counts?.enviados}>{FORM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {counts?.enviados ? <input type="hidden" name="kind" value={f.kind} /> : null}
        </Field>
        <Field label="Programa">
          <select name="program_id" defaultValue={f.program_id ?? ""} className="input">
            {sc === null && <option value="">Toda la organización</option>}
            {!programs.some((p) => p.id === f.program_id) && f.program_id && <option value={f.program_id}>{program}</option>}
            {programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2"><Field label="Asociar a convocatoria o evento" hint="La landing del evento enlaza este formulario (events.form_id).">
          <select name="event_id" defaultValue={f.event_id ?? ""} className="input"><option value="">Sin evento (solo enlace)</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.program} · {fmtDate(e.start_at, false)} ({e.status})</option>)}</select>
        </Field></div>
        <Field label="Enlace público" hint="Solo letras minúsculas, números y guiones">
          <div className="flex items-center"><span className="rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-500">/f/</span>
            <input name="slug" defaultValue={f.slug || ""} className="input !rounded-l-none" pattern="[a-z0-9-]{4,60}" /></div>
        </Field>
        <Field label="Acceso">
          <select name="requires_login" defaultValue={String(f.requires_login)} className="input">
            <option value="1">Requiere iniciar sesión (empresas y usuarios registrados)</option>
            <option value="0">Público: cualquiera con el enlace (pide correo)</option>
          </select>
        </Field>
        <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" name="allow_multiple" value="1" defaultChecked={!!schema.settings?.allowMultiple} className="mt-1" disabled={f.kind === "diagnostico"} />
          <span>Permitir más de una respuesta por empresa/usuario <span className="block text-xs text-slate-400">Si no se marca, el servidor rechaza un segundo envío de la misma empresa (o usuario/correo).</span></span></label>
        <div className="md:col-span-2"><Field label="Mensaje de confirmación" hint="Se muestra al enviar. Si se deja vacío se usa un mensaje estándar.">
          <textarea name="confirmation" defaultValue={schema.settings?.confirmation || ""} rows={2} className="input" /></Field></div>
        <div><button className="btn" disabled={f.status === "archivado"}>Guardar configuración</button></div>
      </form>
      <div className="space-y-4">
        <div className="card text-sm">
          <h2 className="mb-2 font-semibold text-ink">Publicación</h2>
          {f.version ? (
            <>
              {f.kind === "diagnostico" ? <p className="text-slate-600">Los diagnósticos se asignan desde <Link className="text-brand underline" href="/diagnosticos">Diagnósticos</Link>; las empresas también pueden iniciar su autodiagnóstico desde el enlace:</p>
                : <p className="text-slate-600">Comparte este enlace:</p>}
              <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 text-xs">/f/{f.slug}</code>
            </>) : <p className="text-slate-500">Publica el formulario para obtener el enlace.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {f.status === "publicado" && <form action={setFormStatus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value="archivado" /><button className="btn-ghost btn-sm">Archivar (cerrar recepción)</button></form>}
            {f.status === "archivado" && <form action={setFormStatus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value={f.version ? "publicado" : "borrador"} /><button className="btn-ghost btn-sm">Restaurar</button></form>}
          </div>
        </div>
        <div className="card text-sm">
          <h2 className="mb-2 font-semibold text-ink">Estados</h2>
          <ul className="space-y-1 text-slate-600">
            <li><Badge>borrador</Badge> se edita sin afectar a nadie.</li>
            <li><Badge>publicado</Badge> recibe respuestas con la última versión.</li>
            <li><Badge>archivado</Badge> no recibe respuestas; se conservan.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Versions({ formId }: { formId: number }) {
  const rows = all<any>(`SELECT v.*, u.name who, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id=v.form_id AND r.form_version=v.version AND r.status<>'borrador') n
    FROM form_versions v LEFT JOIN users u ON u.id=v.published_by WHERE v.form_id=? ORDER BY v.version DESC`, formId);
  return (
    <>
      <p className="mb-3 text-sm text-slate-600"><History className="mr-1 inline h-4 w-4" />Cada publicación congela el contenido. Las respuestas guardan la versión con la que se diligenciaron y se muestran con ella.</p>
      <Table head={["Versión", "Publicada", "Por", "Secciones / preguntas", "Respuestas con esta versión"]} empty="Aún no hay versiones publicadas">
        {rows.map((v) => {
          const s = parseSchema(v.schema);
          return (
            <tr key={v.id}><Td><b>v{v.version}</b></Td><Td>{fmtDate(v.published_at)}</Td><Td>{v.who}</Td>
              <Td>{s.sections.length} / {s.sections.reduce((a, x) => a + x.questions.length, 0)}</Td>
              <Td>{v.n > 0 ? <Link className="text-brand" href={`/formularios/${formId}/respuestas?version=${v.version}`}>{v.n}</Link> : 0}</Td></tr>);
        })}
      </Table>
    </>
  );
}
