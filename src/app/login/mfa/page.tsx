import { AuthLayout } from "@/components/auth-layout";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { Flash } from "@/components/ui";
import { run, setting } from "@/lib/db";
import { demoMode, pendingMfa } from "@/lib/auth";
import { demoCode, generateSecret, openSecret, otpauthUrl } from "@/lib/totp";
import { cancelMfa, enrollMfaLogin, verifyMfa } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificación en dos pasos" };

/** Segundo paso del ingreso (RN-08): código TOTP o enrolamiento obligatorio de la app autenticadora. */
export default async function MfaPage({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const p = await pendingMfa();
  if (!p) redirect("/login?error=" + encodeURIComponent("La verificación venció o no hay un ingreso en curso. Ingresa de nuevo."));
  const { flow, data, user } = p;
  const brand = setting("brand_name", "Compensar");
  const enrolled = !!user.mfa_enabled;
  let secret = enrolled ? openSecret(user.mfa_secret) : String(data.secret || "");
  if (!enrolled && !secret) {
    secret = generateSecret();
    run("UPDATE auth_flows SET data=? WHERE id=?", JSON.stringify({ ...data, secret }), flow.id);
  }
  const qr = enrolled ? "" : await QRCode.toDataURL(otpauthUrl(secret, user.email, `${brand} Fomento`), { margin: 1, width: 200 });
  const demo = demoMode() && secret ? demoCode(secret, user.id) : null;
  const recovery = sp.modo === "recuperacion" && enrolled;
  return (
    <AuthLayout title="Verificación en dos pasos" subtitle="Protegemos tu cuenta con un segundo factor.">
      <div className="card">
        <h1 className="text-lg font-semibold text-ink">{enrolled ? "Verificación en dos pasos" : "Configura la verificación en dos pasos"}</h1>
        <p className="mt-1 text-sm text-slate-500">{user.name} · {user.email}</p>
        <div className="mt-4"><Flash sp={sp} /></div>
        {!enrolled && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Tu rol requiere un segundo factor. Instala una aplicación autenticadora (Microsoft Authenticator, Google Authenticator u otra compatible) y escanea este código:</p>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Código QR para configurar la aplicación autenticadora" width={200} height={200} />
              <div className="text-center text-xs text-slate-500">¿No puedes escanear? Ingresa esta clave manualmente:<br />
                <code className="select-all break-all font-mono text-[13px] text-ink">{secret.replace(/(.{4})/g, "$1 ").trim()}</code></div>
            </div>
          </div>
        )}
        {demo && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
            MODO DEMO — código vigente de la aplicación autenticadora: <b className="text-base tracking-widest">{demo.code}</b>
            <span className="block text-amber-700">Cambia en {demo.seconds} s. En producción solo lo ve el usuario en su celular.</span>
          </div>
        )}
        <form action={enrolled ? verifyMfa : enrollMfaLogin} className="mt-4 space-y-3">
          {recovery && <input type="hidden" name="recovery" value="1" />}
          <div>
            <label className="label" htmlFor="code">{recovery ? "Código de recuperación" : "Código de 6 dígitos"}</label>
            <input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"}
              maxLength={recovery ? 9 : 6} pattern={recovery ? undefined : "\\d{6}"} className="input text-center text-lg tracking-[0.4em]" />
          </div>
          <button className="btn w-full">{enrolled ? "Verificar e ingresar" : "Activar y entrar"}</button>
        </form>
        <div className="mt-3 flex items-center justify-between text-xs">
          {enrolled ? (recovery
            ? <a href="/login/mfa" className="text-brand">Usar la aplicación autenticadora</a>
            : <a href="/login/mfa?modo=recuperacion" className="text-brand">Usar un código de recuperación</a>) : <span />}
          <form action={cancelMfa}><button className="text-slate-500 hover:text-slate-800">Cancelar</button></form>
        </div>
      </div>
    </AuthLayout>
  );
}
