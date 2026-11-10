import { headers } from "next/headers";
import { MOCK_CLIENT_ID, originFrom } from "@/lib/oidc";
import { EMPLOYEES, mockEnabled } from "../lib";


export const dynamic = "force-dynamic";
export const metadata = { title: "IdP de prueba — Inicio de sesión corporativo" };

export default async function MockAuthorize({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const origin = originFrom(await headers());
  const problem = !mockEnabled() ? "El IdP de prueba está deshabilitado."
    : sp.response_type !== "code" ? "response_type debe ser «code»."
    : sp.client_id !== MOCK_CLIENT_ID ? "client_id desconocido."
    : sp.redirect_uri !== `${origin}/api/auth/oidc/callback` ? "redirect_uri no registrada para este cliente."
    : sp.code_challenge_method !== "S256" || !sp.code_challenge ? "PKCE obligatorio (S256)."
    : !sp.state || !sp.nonce ? "Faltan state o nonce." : "";
  return (
    <div className="min-h-screen bg-[#f3f2f1] px-4 py-10">
      <div className="mx-auto max-w-xl rounded-md bg-white p-8 shadow-lg">
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">IAM corporativo · simulado</div>
        <h1 className="text-xl font-semibold text-slate-900">Iniciar sesión con tu cuenta corporativa</h1>
        <p className="mt-1 text-sm text-slate-600">
          <b>Proveedor de identidad DE PRUEBA</b> incluido para la demostración (OpenID Connect con PKCE y firma RS256).
          En producción esta pantalla es la del IAM de Compensar / Microsoft Entra ID.
        </p>
        {problem ? (
          <div role="alert" className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">Solicitud rechazada: {problem}</div>
        ) : (
          <form method="post" action="/mock-idp/approve" className="mt-5 space-y-3">
            {["client_id", "redirect_uri", "state", "nonce", "code_challenge", "scope"].map((k) => <input key={k} type="hidden" name={k} value={sp[k] || ""} />)}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-800">Elige el funcionario ficticio</legend>
              {EMPLOYEES.map((e, i) => (
                <label key={e.sub} className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm hover:bg-slate-50 ${e.enabled ? "border-slate-200" : "border-red-200 bg-red-50/40"}`}>
                  <input type="radio" name="employee" value={e.sub} defaultChecked={i === 0} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{e.name} <span className="font-normal text-slate-500">· {e.email}</span></span>
                    <span className="block text-xs text-slate-500">{e.title}</span>
                    <span className="mt-1 block font-mono text-[11px] text-slate-600">grupos: {e.groups.join(", ") || "—"}{!e.enabled && " · DESHABILITADA"}</span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-3 rounded border border-slate-200 p-3 text-sm hover:bg-slate-50">
                <input type="radio" name="employee" value="custom" className="mt-1" />
                <span className="grid w-full gap-2">
                  <span className="font-medium text-slate-900">Otro funcionario</span>
                  <input name="c_email" type="email" placeholder="correo@compensar.test" aria-label="Correo del funcionario" className="input" />
                  <input name="c_name" placeholder="Nombre completo" aria-label="Nombre del funcionario" className="input" />
                </span>
              </label>
            </fieldset>
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Grupos a enviar (opcional)</span>
              <input name="groups" placeholder="Vacío = los del funcionario. Ej.: GRP-FOMENTO-ADMIN, GRP-FOMENTO-MENTOR" className="input mt-1" />
              <span className="mt-1 block text-xs text-slate-500">Sirve para probar el mapeo de grupos del IAM a roles.</span>
            </label>
            <div className="flex gap-2 pt-2">
              <button className="rounded bg-[#0067b8] px-5 py-2 text-sm font-medium text-white hover:bg-[#005da6]">Autorizar e ingresar</button>
              <button name="cancel" value="1" className="rounded border border-slate-300 px-5 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
