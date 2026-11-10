import Link from "next/link";
import { Building2, KeyRound, Mail, ArrowRight } from "lucide-react";
import { loginPassword, requestOtp, verifyOtp } from "./actions";
import { Flash } from "@/components/ui";
import { BotFields } from "@/components/bot-fields";
import { AuthLayout } from "@/components/auth-layout";

export const metadata = { title: "Ingresar · Fomento Empresarial" };

const DEMO = [
  ["admin@compensar.test", "Administrador"], ["aux@compensar.test", "Auxiliar Administrativo"], ["contenidos@compensar.test", "Gestor de Contenidos"],
  ["cursos@compensar.test", "Gestor de Cursos"], ["gestor@compensar.test", "Gestor de Mentorías"], ["evaluador@compensar.test", "Evaluador"],
  ["mentor1@compensar.test", "Mentor (asignado a La Espiga)"], ["mentor2@compensar.test", "Mentor sin asignaciones"], ["coord@crecer.test", "Coordinador de aliado"],
  ["mentor@crecer.test", "Mentor de aliado"], ["pagos@compensar.test", "Aprobador de pagos"], ["auditor@compensar.test", "Auditor"],
];

export default async function Login({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const nx = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "";
  const Next = () => (nx ? <input type="hidden" name="next" value={nx} /> : null);
  const mode = sp.mode === "codigo" || sp.step === "code" ? "codigo" : "clave";
  const tab = (m: string, href: string, Icon: any, label: string) => (
    <Link href={href} replace className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] transition ${mode === m ? "bg-white font-semibold text-ink shadow-sm" : "text-slate-500 hover:text-slate-800"}`} aria-current={mode === m ? "page" : undefined}>
      <Icon className="h-4 w-4" />{label}</Link>);
  const DemoUsers = (
      <details className="rounded-xl border bg-card p-3.5 text-left text-xs text-muted-foreground shadow-xs">
        <summary className="cursor-pointer font-semibold text-slate-700">Usuarios de demostración</summary>
        <p className="mt-2">Clave para todos: <code className="rounded bg-slate-100 px-1.5 py-0.5">Demo2026!</code>. El código de verificación aparece en pantalla en modo demo.</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">{DEMO.map(([e, r]) => <li key={e}><code className="text-[11px] text-slate-800">{e}</code><div className="text-[11px] text-slate-400">{r}</div></li>)}</ul>
        <p className="mt-2">Empresas (pestaña «Empresas»): <code>empresa1@laespiga.test</code>, <code>empresa2@textiles.test</code>, <code>empresa3@tecnosoft.test</code>.</p>
      </details>
  );
  return (
    <AuthLayout footer={DemoUsers} title={mode === "codigo" ? "Ingreso de empresas" : "Bienvenido/a"} subtitle={mode === "codigo" ? "Te enviaremos un código de un solo uso a tu correo." : "Ingresa para continuar con la operación de Fomento Empresarial."}>
      <Flash sp={sp} />
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {tab("clave", `/login${nx ? `?next=${encodeURIComponent(nx)}` : ""}`, KeyRound, "Funcionarios y aliados")}
        {tab("codigo", `/login?mode=codigo${nx ? `&next=${encodeURIComponent(nx)}` : ""}`, Building2, "Empresas")}
      </div>

      {mode === "clave" ? (
        <div className="space-y-5">
          <a href="/api/auth/oidc/start" className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-brand hover:text-brand">
            <span className="grid h-5 w-5 place-items-center rounded bg-brand text-[10px] font-bold text-white">C</span>Ingresar con cuenta corporativa (SSO)
          </a>
          <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />o con correo y contraseña<span className="h-px flex-1 bg-slate-200" /></div>
          <form action={loginPassword} className="space-y-4"><BotFields /><Next />
            <div><label className="label" htmlFor="email">Correo</label><input id="email" name="email" type="email" autoComplete="username" required className="input !py-2.5" autoFocus /></div>
            <div>
              <div className="flex items-center justify-between"><label className="label" htmlFor="password">Contraseña</label><Link href="/recuperar" className="mb-1.5 text-xs font-medium text-brand">¿La olvidaste?</Link></div>
              <input id="password" name="password" type="password" autoComplete="current-password" required className="input !py-2.5" />
            </div>
            <button className="btn w-full !py-2.5">Ingresar<ArrowRight className="h-4 w-4" /></button>
            <p className="text-center text-xs text-slate-400">Los roles internos y de aliados confirman su ingreso con verificación en dos pasos.</p>
          </form>
        </div>
      ) : sp.step === "code" ? (
        <form action={verifyOtp} className="space-y-4"><Next />
          <input type="hidden" name="email" value={sp.email} /><input type="hidden" name="purpose" value="login" />
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-600"><Mail className="mt-0.5 h-5 w-5 text-brand" />
            <span>Si el correo está registrado, enviamos un código a <b className="text-slate-800">{sp.email}</b>. Vence en 10 minutos.</span></div>
          {sp.demo && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">MODO DEMO — tu código es <b className="ml-1 text-base tracking-[0.3em]">{sp.demo}</b></div>}
          <div><label className="label" htmlFor="code">Código de 6 dígitos</label>
            <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="input !py-3 text-center text-xl font-semibold tracking-[0.5em]" autoFocus /></div>
          <button className="btn w-full !py-2.5">Verificar y entrar</button>
          <Link href="/login?mode=codigo" className="block text-center text-xs text-slate-500 hover:text-brand">Usar otro correo o reenviar código</Link>
        </form>
      ) : (
        <form action={requestOtp} className="space-y-4"><BotFields /><Next />
          <input type="hidden" name="purpose" value="login" />
          <div><label className="label" htmlFor="oemail">Correo de la empresa</label><input id="oemail" name="email" type="email" autoComplete="email" required className="input !py-2.5" autoFocus /></div>
          <button className="btn w-full !py-2.5">Enviar código<ArrowRight className="h-4 w-4" /></button>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm">
            <div className="font-medium text-slate-800">¿Tu empresa aún no está en la plataforma?</div>
            <p className="mt-0.5 text-xs text-slate-500">Regístrala con su NIT; Compensar validará los requisitos del programa.</p>
            <Link href="/registro" className="btn-ghost btn-sm mt-3">Registrar mi empresa</Link>
          </div>
        </form>
      )}

    </AuthLayout>
  );
}
