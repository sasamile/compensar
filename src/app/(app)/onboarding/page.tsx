import { redirect } from "next/navigation";
import { get, run, now, setting } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Field, Flash, PageHeader } from "@/components/ui";
import { jparse } from "@/lib/util";

async function finish(fd: FormData) {
  "use server";
  const u = await requireUser();
  if (!u.company_id) redirect("/");
  if (fd.get("consent") !== "on" || !String(fd.get("value_prop") || "").trim() || !String(fd.get("sector") || "").trim())
    redirect("/onboarding?error=" + encodeURIComponent("Debes autorizar el tratamiento de datos y completar el perfil"));
  const before = get<any>("SELECT * FROM companies WHERE id=?", u.company_id);
  const g = (k: string) => String(fd.get(k) || "").trim();
  run("UPDATE companies SET sector=?, size=?, city=?, value_prop=?, social=?, onboarding_done=1, consent_at=? WHERE id=?",
    g("sector"), g("size"), g("city"), g("value_prop"), g("social"), now(), u.company_id);
  await audit(u, "onboarding_completado", "company", u.company_id, before, { consent: setting("consent_version") });
  redirect("/");
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const steps = jparse<string[]>(setting("onboarding_steps"), []);
  const c = get<any>("SELECT * FROM companies WHERE id=?", u.company_id);
  return (
    <>
      <PageHeader title="Primer ingreso" subtitle="Completa estos pasos para continuar" />
      <Flash sp={sp} />
      <ol className="mb-4 list-decimal pl-5 text-sm text-slate-600">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <form action={finish} className="card max-w-2xl space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Sector *"><input name="sector" defaultValue={c?.sector || ""} className="input" /></Field>
          <Field label="Tamaño"><select name="size" defaultValue={c?.size || "Micro"} className="input"><option>Micro</option><option>Pequeña</option><option>Mediana</option></select></Field>
          <Field label="Ciudad"><input name="city" defaultValue={c?.city || ""} className="input" /></Field>
        </div>
        <Field label="Propuesta de valor *"><textarea name="value_prop" defaultValue={c?.value_prop || ""} rows={3} className="input" /></Field>
        <Field label="Red social / sitio web"><input name="social" defaultValue={c?.social || ""} className="input" /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1" />
          <span>{setting("consent_text")} <i className="text-xs text-slate-400">({setting("consent_version")})</i></span></label>
        <button className="btn">Guardar y continuar</button>
      </form>
    </>
  );
}
