import { Field } from "@/components/ui";
import { recordValue } from "@/app/(app)/indicadores/actions";

/**
 * Formulario para registrar un avance de indicador (FUN-84). Si recibe `sessionId`, la sesión es el soporte
 * y el archivo es opcional; si no, la evidencia es obligatoria.
 */
export function SegAvanceForm({ indicators, back, sessionId, sessions }: {
  indicators: { id: number; name: string; unit?: string | null; razon_social?: string }[];
  back: string; sessionId?: number | null; sessions?: { id: number; title: string; scheduled_at: string }[];
}) {
  if (!indicators.length) return null;
  return (
    <form action={recordValue} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="back" value={back} />
      {sessionId ? <input type="hidden" name="session_id" value={sessionId} /> : null}
      {indicators.length === 1 ? <input type="hidden" name="indicator_id" value={indicators[0].id} /> : (
        <Field label="Indicador *">
          <select name="indicator_id" required className="input">
            {indicators.map((i) => <option key={i.id} value={i.id}>{i.name}{i.unit ? ` (${i.unit})` : ""}</option>)}
          </select>
        </Field>)}
      <Field label={`Nuevo valor *${indicators.length === 1 && indicators[0].unit ? ` (${indicators[0].unit})` : ""}`}>
        <input name="value" required inputMode="decimal" pattern="-?[0-9]+([.,][0-9]+)?" className="input" placeholder="p. ej. 23.5" />
      </Field>
      <div className="md:col-span-2"><Field label="Nota / soporte *" hint="Fuente del dato, periodo y observaciones"><textarea name="note" required minLength={3} rows={2} className="input" /></Field></div>
      {!sessionId && sessions && sessions.length > 0 && (
        <Field label="Sesión de mentoría o consultoría (opcional)">
          <select name="session_id" className="input"><option value="">—</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.title} · {new Date(s.scheduled_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</option>)}</select>
        </Field>)}
      <Field label={sessionId ? "Evidencia (opcional; la sesión es el soporte)" : "Evidencia * (pdf, xlsx, docx, pptx, jpg, png · ≤20 MB)"} hint={sessionId ? undefined : "Obligatoria si no eliges una sesión"}>
        <input type="file" name="file" accept=".pdf,.xlsx,.xls,.doc,.docx,.pptx,.jpg,.jpeg,.png" className="block w-full text-xs" />
      </Field>
      <div className="flex items-end"><button className="btn">Registrar avance</button></div>
    </form>
  );
}
