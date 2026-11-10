import crypto from "node:crypto";
import QRCode from "qrcode";
import { KeyRound, ShieldCheck, Smartphone, Bell, MonitorSmartphone, UserRound } from "lucide-react";
import { Badge, Field, Flash, Notice, PageHeader, Table, Td, Tabs } from "@/components/ui";
import { all, get, setting } from "@/lib/db";
import { currentSessionToken, demoMode, mfaRequired, requireUser } from "@/lib/auth";
import { userPrefs } from "@/lib/notify";
import { demoCode, otpauthUrl, takeOnce } from "@/lib/totp";
import { fmtDate, jparse } from "@/lib/util";
import * as A from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta y seguridad" };

const TABS: [string, string][] = [["datos", "Mis datos"], ["clave", "Contraseña"], ["seguridad", "Verificación en dos pasos"], ["notificaciones", "Notificaciones"], ["sesiones", "Sesiones activas"]];
const METHOD: Record<string, string> = { clave: "Contraseña", mfa: "Contraseña + 2FA", otp: "Código al correo", sso: "Cuenta corporativa (SSO)" };
const handle = (t: string) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 20);
function device(ua?: string | null) {
  if (!ua) return "Desconocido";
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl/i.test(ua) ? "curl" : "Navegador";
  const o = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b} en ${o}` : b;
}

export default async function Cuenta({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "datos";
  const me = get<any>("SELECT * FROM users WHERE id=?", u.id);
  const required = mfaRequired(u);
  return (
    <>
      <PageHeader eyebrow="Cuenta" title="Mi cuenta y seguridad" subtitle="Tus datos, contraseña, verificación en dos pasos, preferencias de mensajes y sesiones abiertas." />
      <Flash sp={sp} />
      <Tabs tabs={TABS} active={tab} base="/cuenta" />
      {tab === "datos" && <Datos me={me} u={u} />}
      {tab === "clave" && <Clave me={me} />}
      {tab === "seguridad" && <Seguridad me={me} required={required} codesId={sp.codigos} />}
      {tab === "notificaciones" && <Prefs me={me} />}
      {tab === "sesiones" && <Sesiones userId={u.id} />}
    </>
  );
}

function Datos({ me, u }: { me: any; u: any }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form action={A.saveMyProfile} className="card space-y-4 lg:col-span-2">
        <h2 className="flex items-center gap-2 font-semibold text-ink"><UserRound className="h-4 w-4" aria-hidden />Datos personales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo *"><input name="name" required defaultValue={me.name} maxLength={120} className="input" /></Field>
          <Field label="Correo" hint="Lo cambia el administrador (es tu usuario de ingreso)."><input value={me.email} readOnly className="input bg-slate-50" /></Field>
          <Field label="Celular" hint="Para SMS y WhatsApp."><input name="phone" defaultValue={me.phone || ""} inputMode="tel" maxLength={20} className="input" /></Field>
          <Field label="Cargo"><input name="title" defaultValue={me.title || ""} maxLength={120} className="input" /></Field>
        </div>
        <button className="btn">Guardar</button>
      </form>
      <div className="card space-y-2 text-sm">
        <h2 className="font-semibold text-ink">Roles y alcance</h2>
        <ul className="space-y-1.5">{u.grants.map((g: any, i: number) => <li key={i} className="flex flex-wrap items-center gap-2"><Badge tone="blue">{g.role_name}</Badge><span className="text-xs text-slate-500">{g.scope_type}{g.scope_id ? ` #${g.scope_id}` : ""}</span></li>)}</ul>
        <p className="pt-2 text-xs text-slate-500">Último ingreso: {fmtDate(me.last_login_at)}{me.sso_subject ? " · cuenta vinculada al IAM corporativo" : ""}</p>
      </div>
    </div>
  );
}

function Clave({ me }: { me: any }) {
  return (
    <form action={A.changeMyPassword} className="card max-w-lg space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-ink"><KeyRound className="h-4 w-4" aria-hidden />Cambiar contraseña</h2>
      {me.sso_subject && !me.password_hash && <Notice kind="info">Ingresas con tu cuenta corporativa (SSO); la contraseña se administra en el IAM de Compensar.</Notice>}
      {me.password_hash && <Field label="Contraseña actual"><input name="current" type="password" required autoComplete="current-password" className="input" /></Field>}
      <Field label="Nueva contraseña" hint="Mínimo 10 caracteres, con mayúscula, minúscula y número."><input name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></Field>
      <Field label="Confirmar nueva contraseña"><input name="password2" type="password" required minLength={10} autoComplete="new-password" className="input" /></Field>
      <p className="text-xs text-slate-500">Al cambiarla se cierran tus sesiones abiertas en otros dispositivos.</p>
      <button className="btn">Cambiar contraseña</button>
    </form>
  );
}

async function Seguridad({ me, required, codesId }: { me: any; required: boolean; codesId?: string }) {
  const shown = takeOnce(me.id, "show_codes", codesId);
  const flow = get<any>("SELECT * FROM auth_flows WHERE kind='enroll' AND user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 1", me.id, new Date().toISOString());
  const secret = flow ? jparse<any>(flow.data, {}).secret : "";
  const qr = secret ? await QRCode.toDataURL(otpauthUrl(secret, me.email, `${setting("brand_name", "Compensar")} Fomento`), { margin: 1, width: 200 }) : "";
  const demo = demoMode() && secret ? demoCode(secret, me.id) : null;
  const left = get<any>("SELECT COUNT(*) n FROM mfa_recovery_codes WHERE user_id=? AND used_at IS NULL", me.id).n;
  const st = get<any>("SELECT enrolled_at FROM mfa_state WHERE user_id=?", me.id);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-4 w-4" aria-hidden />Verificación en dos pasos (TOTP)</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">Estado: {me.mfa_enabled ? <Badge tone="green">activa</Badge> : <Badge tone="amber">sin configurar</Badge>}
          {required && <Badge tone="violet">obligatoria para tu rol</Badge>}
          {st?.enrolled_at && <span className="text-xs text-slate-500">desde {fmtDate(st.enrolled_at)}</span>}</div>
        {shown && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-medium text-emerald-900">Códigos de recuperación — guárdalos ahora, no se volverán a mostrar:</p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-sm">{shown.codes.map((c: string) => <li key={c} className="select-all">{c}</li>)}</ul>
          </div>
        )}
        {secret ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">1. Escanea el código con Microsoft Authenticator, Google Authenticator u otra app compatible. 2. Escribe el código de 6 dígitos que aparece.</p>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} width={200} height={200} alt="Código QR de configuración de la aplicación autenticadora" />
              <code className="select-all break-all text-center font-mono text-xs">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            </div>
            {demo && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">MODO DEMO — código vigente: <b className="text-base tracking-widest">{demo.code}</b> (cambia en {demo.seconds} s)</div>}
            <form action={A.confirmEnroll} className="flex flex-wrap items-end gap-2">
              <Field label="Código de 6 dígitos"><input name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" className="input w-40 tracking-widest" /></Field>
              <button className="btn">Confirmar</button>
            </form>
            <form action={A.cancelEnroll}><button className="text-xs text-slate-500 hover:text-slate-800">Cancelar</button></form>
          </div>
        ) : (
          <form action={A.startEnroll}><button className="btn">{me.mfa_enabled ? "Reconfigurar (nuevo celular)" : "Configurar ahora"}</button></form>
        )}
      </div>
      {!!me.mfa_enabled && !secret && (
        <div className="card space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-ink"><Smartphone className="h-4 w-4" aria-hidden />Códigos de recuperación</h2>
          <p className="text-sm text-slate-600">Te quedan <b>{left}</b> código(s) sin usar. Generar nuevos invalida los anteriores.</p>
          <form action={A.regenRecovery} className="flex flex-wrap items-end gap-2">
            <Field label="Código actual de la app"><input name="code" required inputMode="numeric" maxLength={6} className="input w-40 tracking-widest" /></Field>
            <button className="btn-ghost">Generar nuevos códigos</button>
          </form>
          {!required && (
            <form action={A.disableMyMfa} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <Field label="Código para desactivar"><input name="code" required inputMode="numeric" maxLength={6} className="input w-40 tracking-widest" /></Field>
              <button className="btn-danger">Desactivar 2FA</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Prefs({ me }: { me: any }) {
  const p = userPrefs(me.id);
  const box = (name: string, label: string, hint: string, on: number) => (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
      <input type="checkbox" name={name} defaultChecked={!!on} className="mt-1 h-4 w-4" />
      <span><span className="block text-sm font-medium text-ink">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <form action={A.savePrefs} className="card max-w-2xl space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-ink"><Bell className="h-4 w-4" aria-hidden />Preferencias de notificación</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {box("correo", "Correo", me.email, p.correo)}
        {box("sms", "SMS", me.phone || "Sin celular registrado", p.sms)}
        {box("whatsapp", "WhatsApp", me.phone || "Sin celular registrado", p.whatsapp)}
      </div>
      {box("no_esenciales", "Mensajes no esenciales", "Recordatorios de eventos, encuestas y novedades. Puedes darte de baja cuando quieras.", p.no_esenciales)}
      <Notice kind="info">Los mensajes de seguridad (códigos de ingreso, invitaciones, recuperación de contraseña y alertas) se envían siempre y no se pueden desactivar.</Notice>
      <button className="btn">Guardar preferencias</button>
    </form>
  );
}

async function Sesiones({ userId }: { userId: number }) {
  const cur = await currentSessionToken();
  const timeout = Number(setting("session_timeout_min", "30"));
  const rows = all<any>("SELECT s.*, m.method, m.ua FROM sessions s LEFT JOIN session_meta m ON m.token=s.token WHERE s.user_id=? ORDER BY s.last_seen DESC", userId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-slate-600"><MonitorSmartphone className="h-4 w-4" aria-hidden />Las sesiones se cierran solas tras {timeout} minutos de inactividad.</p>
        {rows.length > 1 && <form action={A.revokeOtherSessions}><button className="btn-ghost btn-sm">Cerrar todas las demás</button></form>}
      </div>
      <Table head={["Dispositivo", "Método de ingreso", "IP", "Inicio", "Última actividad", ""]} empty="Sin sesiones">
        {rows.map((s) => (
          <tr key={s.token}>
            <Td>{device(s.ua)} {s.token === cur && <Badge tone="green">esta sesión</Badge>}</Td>
            <Td>{METHOD[s.method] || s.method || "—"}</Td>
            <Td className="font-mono text-xs">{s.ip || "—"}</Td>
            <Td>{fmtDate(s.created_at)}</Td>
            <Td>{fmtDate(s.last_seen)}</Td>
            <Td>{s.token !== cur && <form action={A.revokeSession}><input type="hidden" name="s" value={handle(s.token)} /><button className="text-xs font-medium text-red-600 hover:underline">Cerrar</button></form>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
