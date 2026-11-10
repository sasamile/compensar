import { ClipboardList as PageIcon } from "lucide-react";
/** FUN-71 / RF-FRM-10: el participante consulta el estado de sus formularios sin llamar a Compensar. */
import Link from "next/link";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, EmptyState, Flash, PageHeader, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import { FORM_KINDS, statusLabel } from "@/lib/forms";
import { folio, syncValidationStatuses } from "../formularios/server";

const STEPS = ["borrador", "enviado", "en_revision", "aprobado"];
const HELP: Record<string, string> = {
  borrador: "Aún no lo envías. Tu avance está guardado.",
  enviado: "Recibido. Pronto iniciará la revisión.",
  en_revision: "El equipo de Compensar está revisando tu información.",
  ajustes: "Debes corregir o completar información y reenviar.",
  aprobado: "¡Aprobado!",
  rechazado: "No fue aprobado. Revisa el motivo.",
};

export default async function MisFormularios({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  syncValidationStatuses(u.id); // trae los cambios de la bandeja de validación aunque el job aún no haya corrido
  const rows = all<any>(`SELECT r.*, f.name form, f.slug, f.kind, f.status form_status, c.razon_social company, us.name user_name
    FROM form_responses r JOIN forms f ON f.id=r.form_id LEFT JOIN companies c ON c.id=r.company_id LEFT JOIN users us ON us.id=r.user_id
    WHERE f.kind<>'diagnostico' AND (r.user_id=? ${u.company_id ? "OR r.company_id=?" : ""}) ORDER BY COALESCE(r.updated_at, r.created_at) DESC`,
    u.id, ...(u.company_id ? [u.company_id] : []));
  const companyProgram = u.company_id ? all<any>("SELECT program_id FROM companies WHERE id=?", u.company_id)[0]?.program_id : null;
  const available = all<any>(`SELECT f.* FROM forms f WHERE f.status='publicado' AND f.version>0 AND f.kind IN ('inscripcion','encuesta','general')
      AND (f.program_id IS NULL OR f.program_id=? OR ? IS NULL)
      AND f.id NOT IN (SELECT form_id FROM form_responses WHERE (user_id=? ${u.company_id ? "OR company_id=?" : ""}))
    ORDER BY f.updated_at DESC LIMIT 20`, companyProgram, u.internal ? null : companyProgram, u.id, ...(u.company_id ? [u.company_id] : []));
  const kinds = Object.fromEntries(FORM_KINDS);
  const attention = rows.filter((r) => r.status === "ajustes" || r.status === "borrador");
  return (
    <>
      <PageHeader icon={PageIcon} title="Mis formularios" subtitle="Inscripciones y formularios que has diligenciado, con su estado y los motivos de cada decisión" />
      <Flash sp={sp} />
      {attention.length > 0 && (
        <div className="mb-5 space-y-2">
          {attention.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${r.status === "ajustes" ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
              <div className="min-w-0 flex-1"><b>{r.form}</b> · {r.status === "ajustes" ? <>requiere ajustes: <i>{r.decision_reason || "revisa la información"}</i></> : <>borrador guardado {fmtDate(r.updated_at)}</>}</div>
              {r.form_status === "publicado" ? <Link className="btn btn-sm" href={`/f/${r.slug}?r=${r.id}`}>{r.status === "ajustes" ? "Corregir y reenviar" : "Continuar donde quedé"}</Link> : <span className="text-xs text-slate-500">El formulario ya no recibe respuestas</span>}
            </div>))}
        </div>)}
      {rows.length === 0 ? (
        <EmptyState title="Aún no has diligenciado formularios">Cuando te inscribas a un programa o respondas un formulario, verás aquí su estado.</EmptyState>
      ) : (
        <Table head={["Formulario", "Radicado", "Estado", "Avance", "Última actualización", ""]}>
          {rows.map((r) => {
            const idx = STEPS.indexOf(r.status);
            return (
              <tr key={r.id}>
                <Td><b>{r.form}</b><div className="text-xs text-slate-400">{kinds[r.kind]}{r.company ? ` · ${r.company}` : ""}{r.user_id !== u.id && r.user_name ? ` · por ${r.user_name}` : ""}</div></Td>
                <Td><code className="text-xs">{folio(r)}</code><div className="text-[11px] text-slate-400">versión {r.form_version}</div></Td>
                <Td><Badge tone={r.status === "ajustes" ? "amber" : r.status === "rechazado" ? "red" : r.status === "aprobado" ? "green" : undefined}>{statusLabel(r.status)}</Badge>
                  <div className="mt-0.5 max-w-xs text-xs text-slate-500">{r.decision_reason && ["ajustes", "rechazado", "aprobado"].includes(r.status) ? `Motivo: ${r.decision_reason}` : HELP[r.status]}</div></Td>
                <Td>
                  <ol className="flex items-center gap-1" aria-label={`Avance: ${statusLabel(r.status)}`}>
                    {STEPS.map((s, i) => <li key={s} title={statusLabel(s)} className={`h-1.5 w-6 rounded-full ${r.status === "rechazado" ? (i <= 2 ? "bg-red-400" : "bg-slate-200") : r.status === "ajustes" ? (i <= 2 ? "bg-amber-400" : "bg-slate-200") : i <= idx ? "bg-brand" : "bg-slate-200"}`} />)}
                  </ol>
                </Td>
                <Td className="whitespace-nowrap text-xs">{fmtDate(r.updated_at || r.created_at)}</Td>
                <Td className="whitespace-nowrap">
                  {["borrador", "ajustes"].includes(r.status) && r.form_status === "publicado"
                    ? <Link className="text-brand" href={`/f/${r.slug}?r=${r.id}`}>{r.status === "ajustes" ? "Editar y reenviar" : "Continuar"}</Link>
                    : <Link className="text-brand" href={`/mis-formularios/${r.id}`}>Ver</Link>}
                </Td>
              </tr>);
          })}
        </Table>)}
      {available.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-semibold text-ink">Formularios disponibles para ti</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((f) => (
              <Link key={f.id} href={`/f/${f.slug}`} className="card block hover:border-brand">
                <div className="text-xs uppercase tracking-wide text-slate-400">{kinds[f.kind]}</div>
                <div className="font-medium text-ink">{f.name}</div>
                {f.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{f.description}</p>}
              </Link>))}
          </div>
        </div>)}
    </>
  );
}
