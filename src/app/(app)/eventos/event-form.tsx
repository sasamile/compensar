import { Field } from "@/components/ui";
import { RICH_HINT } from "@/components/rich-text";
import { LANDING_TEMPLATES } from "@/lib/certificates";
import { isoToLocal } from "@/lib/util";

/**
 * Campos del formulario de crear/editar evento o curso (RF-CON-02/03/06/07, RF-PAR-04).
 * Pensado para que un curso nuevo quede listo para inscripciones en pocos minutos: solo nombre y fecha son
 * obligatorios, el resto trae valores por defecto, y al crear se puede «Publicar de inmediato».
 */
export function EventFields({ ev, programs, hours }: { ev?: any; programs?: { id: number; name: string }[]; hours?: number | null }) {
  const e = ev ?? {};
  const isNew = !ev;
  return (
    <>
      <fieldset className="grid gap-3 md:col-span-4 md:grid-cols-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Datos básicos</legend>
        <div className="md:col-span-2"><Field label="Nombre *"><input name="title" required defaultValue={e.title} className="input" maxLength={160} /></Field></div>
        {isNew ? (
          <Field label="Programa *"><select name="program_id" className="input" required>{programs?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        ) : <input type="hidden" name="program_id" value={e.program_id} />}
        <Field label="Tipo"><select name="type" defaultValue={e.type || "curso"} className="input"><option value="evento">Evento</option><option value="charla">Charla</option><option value="curso">Curso</option><option value="convocatoria">Convocatoria</option></select></Field>
        <Field label="Modalidad"><select name="modality" defaultValue={e.modality || "presencial"} className="input"><option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="hibrido">Híbrida</option></select></Field>
        <Field label="Inicio (hora Colombia) *"><input type="datetime-local" name="start_at" required defaultValue={isoToLocal(e.start_at)} className="input" /></Field>
        <Field label="Fin (última sesión)"><input type="datetime-local" name="end_at" defaultValue={isoToLocal(e.end_at)} className="input" /></Field>
        <Field label="Lugar o enlace"><input name="place" defaultValue={e.place} className="input" placeholder="Sede o enlace de Teams/Zoom" /></Field>
        <Field label="Cupo"><input type="number" name="capacity" min={0} defaultValue={e.capacity ?? 30} className="input" /></Field>
        <Field label="Costo interno (COP)"><input type="number" name="internal_cost" min={0} defaultValue={e.internal_cost ?? 0} className="input" /></Field>
        <Field label="Público"><input name="audience" defaultValue={e.audience} className="input" placeholder="Mipymes afiliadas" /></Field>
        <Field label="Responsable"><input name="owner" defaultValue={e.owner} className="input" /></Field>
        <div className="md:col-span-2"><Field label="Requisitos"><input name="requirements" defaultValue={e.requirements} className="input" placeholder="Ej.: empresa activa en el programa" /></Field></div>
        <div className="md:col-span-2"><Field label="Formulario externo (Microsoft Forms)"><input name="external_form_url" type="url" defaultValue={e.external_form_url} className="input" placeholder="https://forms.office.com/..." /></Field></div>
      </fieldset>

      <fieldset className="grid gap-3 border-t border-slate-100 pt-3 md:col-span-4 md:grid-cols-4">
        <legend className="mb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Sesiones, asistencia y certificados</legend>
        <Field label="Número de sesiones" hint="La asistencia se registra por sesión"><input type="number" name="sessions_count" min={1} max={60} defaultValue={e.sessions_count ?? 1} className="input" /></Field>
        <Field label="Asistencia mínima %" hint="Para certificar (80 % por defecto)"><input type="number" name="min_attendance" min={0} max={100} defaultValue={e.min_attendance ?? 80} className="input" /></Field>
        <Field label="Intensidad horaria total (h)" hint="Se imprime en el certificado. Vacío = se calcula"><input name="hours" inputMode="decimal" defaultValue={hours ?? ""} className="input" placeholder="Ej.: 12" /></Field>
        <Field label="Min. conexión virtual" hint="Minutos por sesión (Teams/Zoom)"><input type="number" name="min_minutes" min={0} defaultValue={e.min_minutes ?? 30} className="input" /></Field>
        <Field label="Recordatorios" hint="Antes del inicio: d=días, h=horas, m=minutos. Vacío = sin recordatorios."><input name="reminders" defaultValue={e.reminders ?? "7d,1d,1h"} pattern="[0-9dhm ,]*" className="input" /></Field>
        <div className="flex items-end md:col-span-3">
          <input type="hidden" name="certs_auto_present" value="1" />
          <label className="flex items-start gap-2 pb-2 text-sm"><input type="checkbox" name="certs_auto" defaultChecked={!!(e.certs_auto ?? 1)} className="mt-0.5" />
            <span><b>Certificados automáticos</b><span className="block text-xs text-slate-500">Al terminar el evento se emite el certificado PDF firmado a quien cumpla la asistencia mínima y se envía por correo.</span></span></label>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-t border-slate-100 pt-3 md:col-span-4 md:grid-cols-4">
        <legend className="mb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Landing pública</legend>
        <div className="md:col-span-4">
          <span className="label">Plantilla de la landing</span>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plantilla de la landing">
            {LANDING_TEMPLATES.map(([k, name, desc]) => (
              <label key={k} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-blue-50/50">
                <input type="radio" name="landing_template" value={k} defaultChecked={(e.landing_template || "clasica") === k} className="mt-0.5" />
                <span><b>{name}</b><span className="block text-xs text-slate-500">{desc}</span></span>
              </label>))}
          </div>
        </div>
        <div className="md:col-span-2"><Field label="Resumen"><input name="summary" defaultValue={e.summary} className="input" maxLength={240} /></Field></div>
        <Field label="Banner (imagen JPG/PNG ≤ 5 MB)" hint="Pasa por antivirus y se guarda en OnBase">
          <input type="file" name="banner_file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5" />
        </Field>
        <Field label="…o banner por URL" hint="Se usa si no hay imagen subida"><input name="banner_url" type="url" defaultValue={e.banner_url} className="input" placeholder="https://…" /></Field>
        {e.banner_doc_id ? (
          <label className="flex items-center gap-2 text-sm md:col-span-4"><input type="checkbox" name="banner_remove" />Quitar la imagen subida actual</label>
        ) : null}
        <div className="md:col-span-4"><Field label="Descripción" hint={RICH_HINT}><textarea name="description" rows={5} defaultValue={e.description} className="input font-mono text-[13px]" /></Field></div>
      </fieldset>
      {isNew && (
        <label className="flex items-center gap-2 text-sm md:col-span-4"><input type="checkbox" name="publish_now" />Publicar de inmediato (queda abierto a inscripciones al guardar)</label>)}
    </>
  );
}
