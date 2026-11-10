/** Confirmación de envío (RF-FRM-09): folio y próximos pasos. */
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { get } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import FormPublicFrame from "@/components/form-public-frame";
import { folio, getFormBySlug, versionOf } from "../../../(app)/formularios/server";

export const dynamic = "force-dynamic";

export default async function Gracias({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<any> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const u = await currentUser();
  const f = getFormBySlug(slug);
  const r = f ? get<any>("SELECT id, form_id, user_id, company_id, status FROM form_responses WHERE id=? AND form_id=? AND status<>'borrador'", Number(sp.r), f.id) : null;
  const mine = !!(u && r && (r.user_id === u.id || (u.company_id && r.company_id === u.company_id)));
  const msg = f ? versionOf(f.id)?.schema.settings?.confirmation : "";
  return (
    <FormPublicFrame userName={u?.name}>
      <div className="card text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h1 className="mt-2 text-xl font-semibold text-ink">¡Gracias! Recibimos tu respuesta</h1>
        {f && <p className="mt-1 text-sm text-slate-600">{f.name}</p>}
        {r && <p className="mt-3 text-sm">Número de radicado: <code className="rounded bg-slate-100 px-2 py-0.5 font-semibold">{folio(r)}</code></p>}
        <p className="mx-auto mt-3 max-w-md whitespace-pre-line text-sm text-slate-600">
          {msg || (f?.kind === "inscripcion"
            ? "Tu inscripción quedó en revisión. Te notificaremos por correo cada cambio de estado; también puedes consultarlo en «Mis formularios»."
            : "Te enviamos una confirmación por correo.")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {mine ? <Link href={`/mis-formularios/${r!.id}`} className="btn">Ver el estado de mi respuesta</Link> : u ? <Link href="/mis-formularios" className="btn">Mis formularios</Link> : null}
          <Link href="/" className="btn-ghost">Ir al inicio</Link>
        </div>
      </div>
    </FormPublicFrame>
  );
}
