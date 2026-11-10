import { Activity, Download, KeyRound, Plug, ShieldCheck, Webhook, Workflow, Bug, Database, FileLock2 } from "lucide-react";
import { Badge, EmptyState, Field, Notice, Stat, Table, Td } from "@/components/ui";
import { all, get, setting } from "@/lib/db";
import { demoMode } from "@/lib/auth";
import { API_SCOPES } from "@/lib/api-auth";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { ALL_JOBS } from "@/lib/jobs";
import { runnerInfo } from "@/lib/jobs/runner";
import { onbaseDown, storageKeySource } from "@/lib/onbase";
import { ssoConfig } from "@/lib/oidc";
import { turnstileEnabled } from "@/lib/ratelimit";
import { takeOnce } from "@/lib/totp";
import { fmtDate, jparse } from "@/lib/util";
import * as A from "./actions";

const H = ({ icon: I, children, sub }: { icon: any; children: React.ReactNode; sub?: string }) => (
  <div className="mb-3"><h2 className="flex items-center gap-2 font-semibold text-ink"><I className="h-4 w-4 text-brand" aria-hidden />{children}</h2>{sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}</div>
);
const Secret = ({ d }: { d: any }) => d ? (
  <div className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm" role="status">
    <p className="font-semibold text-emerald-900">Copia ahora el secreto — no se volverá a mostrar</p>
    {d.clientId && <p className="mt-2">client_id: <code className="select-all rounded bg-white px-1.5 py-0.5 font-mono">{d.clientId}</code></p>}
    {d.webhook && <p className="mt-2">Webhook #{d.webhook} → <span className="font-mono text-xs">{d.url}</span></p>}
    <p className="mt-1">{d.clientId ? "client_secret" : "Secreto de firma"}: <code className="select-all break-all rounded bg-white px-1.5 py-0.5 font-mono">{d.secret}</code></p>
  </div>
) : null;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/* ===================== Clientes API ===================== */
export function Clientes({ userId, sp, origin }: { userId: number; sp: any; origin: string }) {
  const shown = takeOnce(userId, "show_secret", sp.secreto);
  const clients = all<any>(`SELECT c.*, m.program_id, m.description, m.last_used_at, p.name program,
    (SELECT COUNT(*) FROM api_tokens t WHERE t.client_id=c.client_id AND t.expires_at>?) tokens,
    (SELECT COUNT(*) FROM api_log l WHERE l.client_id=c.client_id AND l.ts>=?) calls
    FROM api_clients c LEFT JOIN api_client_meta m ON m.client_id=c.client_id LEFT JOIN programs p ON p.id=m.program_id ORDER BY c.id DESC`, new Date().toISOString(), ago(86400000));
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  const aliados = all<any>("SELECT id, name FROM aliados ORDER BY name");
  return (
    <>
      <Secret d={shown?.clientId ? shown : null} />
      <Table head={["Cliente", "client_id", "Scopes", "Alcance", "Uso 24 h", "Último uso", "Estado", ""]} empty="Aún no hay clientes API">
        {clients.map((c) => (
          <tr key={c.id}>
            <Td><div className="font-medium text-ink">{c.name}</div>{c.description && <div className="text-xs text-slate-500">{c.description}</div>}</Td>
            <Td className="font-mono text-xs">{c.client_id}</Td>
            <Td><div className="flex max-w-xs flex-wrap gap-1">{String(c.scopes).split(/\s+/).map((s: string) => <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{s}</span>)}</div></Td>
            <Td className="text-xs">{c.program || "Toda la organización"}</Td>
            <Td>{c.calls}</Td>
            <Td className="text-xs">{fmtDate(c.last_used_at)}</Td>
            <Td>{c.active ? <Badge tone="green">activo</Badge> : <Badge tone="red">revocado</Badge>}</Td>
            <Td>
              <div className="flex gap-2">
                <form action={A.toggleClient}><input type="hidden" name="id" value={c.id} /><button className={`text-xs font-medium ${c.active ? "text-red-600" : "text-brand"} hover:underline`}>{c.active ? "Revocar" : "Reactivar"}</button></form>
                {!!c.active && <form action={A.rotateClient}><input type="hidden" name="id" value={c.id} /><button className="text-xs font-medium text-slate-600 hover:underline">Rotar secreto</button></form>}
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form action={A.createClient} className="card space-y-3">
          <H icon={KeyRound} sub="OAuth 2.0 client credentials. El secreto se guarda con hash y se muestra una sola vez.">Nuevo cliente API</H>
          <Field label="Nombre del sistema *"><input name="name" required maxLength={80} placeholder="Power BI Compensar, SIEM Sentinel…" className="input" /></Field>
          <Field label="Descripción"><input name="description" maxLength={200} className="input" /></Field>
          <Field label="Alcance" hint="Igual que un rol de programa: solo verá datos de ese programa."><select name="program_id" className="input"><option value="">Toda la organización</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="BI: limitar a programa" hint="Agrega bi.read + bi.program:<id>"><select name="bi_program" className="input"><option value="">Sin límite</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="BI: limitar a aliado" hint="Agrega bi.read + bi.aliado:<id>"><select name="bi_aliado" className="input"><option value="">Sin límite</option>{aliados.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          </div>
          <fieldset><legend className="label">Scopes *</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">{API_SCOPES.map(([k, l]) => (
              <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name="scopes" value={k} className="mt-1" defaultChecked={k === "empresas.read"} /><span><code className="text-xs">{k}</code><span className="block text-xs text-slate-500">{l}</span></span></label>))}</div>
          </fieldset>
          <button className="btn">Crear cliente</button>
        </form>
        <div className="card space-y-3 text-sm">
          <H icon={Plug}>Cómo consumir la API</H>
          <p className="text-slate-600">1. Pide un token con las credenciales del cliente:</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d grant_type=client_credentials \\
  ${origin}/api/oauth/token`}</pre>
          <p className="text-slate-600">2. Llama los recursos con el token (vence en 1 hora):</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`curl -s -H "Authorization: Bearer $TOKEN" \\
  "${origin}/api/v1/empresas?estado=activa&per_page=50"`}</pre>
          <p className="text-slate-600">Contrato OpenAPI 3.1: <a className="text-brand" href="/api/openapi.json">/api/openapi.json</a> · Documentación navegable: <a className="text-brand" href="/api-docs">/api-docs</a></p>
          {demoMode() && <Notice kind="warn">MODO DEMO: existe el cliente <code>fe_demo_bi</code> con secreto <code>fes_demo_PowerBI_2026_solo_para_demostracion</code> (sin datos personales ni auditoría). Revócalo en producción.</Notice>}
        </div>
      </div>
    </>
  );
}

/* ===================== Webhooks ===================== */
export function Webhooks({ userId, sp, origin }: { userId: number; sp: any; origin: string }) {
  const shown = takeOnce(userId, "show_secret", sp.secreto);
  const hooks = all<any>(`SELECT w.*, (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id=w.id AND d.status='entregado') ok,
    (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id=w.id AND d.status='pendiente') pend,
    (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id=w.id AND d.status='fallido') fail FROM webhooks w ORDER BY w.id DESC`);
  const deliveries = all<any>("SELECT d.*, w.url FROM webhook_deliveries d LEFT JOIN webhooks w ON w.id=d.webhook_id ORDER BY d.id DESC LIMIT 40");
  return (
    <>
      <Secret d={shown?.webhook ? shown : null} />
      <Table head={["#", "URL de destino", "Eventos", "Entregados", "Pendientes", "Fallidos", "Estado", ""]} empty="Aún no hay webhooks">
        {hooks.map((w) => (
          <tr key={w.id}>
            <Td>{w.id}</Td>
            <Td className="max-w-xs break-all font-mono text-xs">{w.url}</Td>
            <Td><div className="flex max-w-xs flex-wrap gap-1">{String(w.events).split(",").map((e: string) => <span key={e} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{e}</span>)}</div></Td>
            <Td>{w.ok}</Td><Td>{w.pend}</Td><Td>{w.fail}</Td>
            <Td>{w.active ? <Badge tone="green">activo</Badge> : <Badge tone="slate">inactivo</Badge>}</Td>
            <Td><div className="flex gap-2">
              <form action={A.testWebhook}><input type="hidden" name="id" value={w.id} /><button className="text-xs font-medium text-brand hover:underline">Probar</button></form>
              <form action={A.toggleWebhook}><input type="hidden" name="id" value={w.id} /><button className="text-xs font-medium text-slate-600 hover:underline">{w.active ? "Desactivar" : "Activar"}</button></form>
            </div></Td>
          </tr>
        ))}
      </Table>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form action={A.createWebhook} className="card space-y-3">
          <H icon={Webhook} sub="Cada envío va firmado con HMAC-SHA256 y se reintenta con espera creciente si el destino falla.">Nuevo webhook</H>
          <Field label="URL de destino *" hint={demoMode() ? `Prueba: ${origin}/api/webhooks/demo?id=<id del webhook> (verifica la firma). Añade &fallar=1 para simular un destino caído.` : "Debe ser https://"}>
            <input name="url" required className="input" placeholder="https://sistema.compensar.com/webhooks/fomento" /></Field>
          <fieldset><legend className="label">Eventos *</legend>
            <div className="grid gap-1.5">{WEBHOOK_EVENTS.map(([k, l]) => (
              <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name="events" value={k} defaultChecked className="mt-1" /><span><code className="text-xs">{k}</code> <span className="text-xs text-slate-500">— {l}</span></span></label>))}</div>
          </fieldset>
          <button className="btn">Crear webhook</button>
        </form>
        <div className="card space-y-2 text-sm">
          <H icon={ShieldCheck}>Verificar la firma en el receptor</H>
          <p className="text-slate-600">Cabecera <code>X-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>. Calcula HMAC-SHA256 con el secreto sobre <code>t + "." + cuerpo</code>, compáralo en tiempo constante y rechaza firmas con más de 5 minutos. Usa <code>X-Delivery-Id</code> para no procesar dos veces.</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`const [t, v1] = sig.split(",").map(p => p.split("=")[1]);
const exp = crypto.createHmac("sha256", SECRETO)
  .update(t + "." + rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(v1))
  && Math.abs(Date.now()/1000 - Number(t)) < 300;`}</pre>
        </div>
      </div>
      <h3 className="mb-2 mt-8 text-sm font-semibold text-ink">Historial de entregas</h3>
      <Table head={["#", "Evento", "Webhook", "Estado", "Intentos", "Próximo intento", "Último error", "Creada", ""]} empty="Sin entregas todavía" dense>
        {deliveries.map((d) => (
          <tr key={d.id}>
            <Td>{d.id}</Td><Td className="font-mono">{d.event}</Td><Td>#{d.webhook_id}</Td><Td><Badge>{d.status}</Badge></Td><Td>{d.attempts}</Td>
            <Td>{d.status === "pendiente" ? fmtDate(d.next_at) : "—"}</Td><Td className="max-w-[220px] truncate text-red-600" >{d.last_error || ""}</Td><Td>{fmtDate(d.created_at)}</Td>
            <Td>{d.status !== "entregado" && <form action={A.retryDelivery}><input type="hidden" name="id" value={d.id} /><button className="text-xs font-medium text-brand hover:underline">Reintentar</button></form>}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}

/* ===================== Colas e integraciones ===================== */
export function Colas() {
  const jobs = all<any>("SELECT j.*, d.name doc, d.onbase_ref FROM integration_jobs j LEFT JOIN documents d ON d.id=j.ref_id AND j.kind='onbase.store' ORDER BY j.id DESC LIMIT 40");
  const breakers = all<any>("SELECT * FROM circuit_breakers ORDER BY name");
  const log = all<any>("SELECT * FROM integration_log ORDER BY id DESC LIMIT 40");
  const br = (n: string) => breakers.find((b) => b.name === n)?.state || "cerrado";
  const n = (sql: string, ...p: any[]) => get<any>(sql, ...p)?.n ?? 0;
  const down = onbaseDown();
  const adapters = [
    { name: "OnBase (repositorio documental)", state: down ? "simulando caída" : br("onbase"), detail: `${n("SELECT COUNT(*) n FROM documents WHERE onbase_status='en_cola'")} documento(s) en cola · ${n("SELECT COUNT(*) n FROM documents WHERE onbase_status='almacenado'")} almacenados`, impl: "src/lib/onbase.ts — circuit breaker + cola de reintentos + cifrado AES-256-GCM" },
    { name: "Gestión de Clientes (Compensar)", state: br("gestion_clientes"), detail: `${n("SELECT COUNT(*) n FROM client_registry")} registro(s) en la réplica de consulta`, impl: "Adaptador del módulo de validación (src/lib/integrations/)" },
    { name: "Microsoft 365 / Outlook", state: br("m365"), detail: `${n("SELECT COUNT(*) n FROM audit_log WHERE action='sync_outlook'")} sincronización(es) de agenda (.ics)`, impl: "src/lib/integrations/m365.ts (Graph o simulado + .ics, cola m365.sync) — API de calendario detrás del adaptador" },
    { name: "Correo / SMS / WhatsApp", state: ["correo", "sms", "whatsapp"].map((c) => `${c} ${setting(`channel_${c}`, "1") === "1" ? "activo" : "inactivo"}`).join(" · "), detail: `${n("SELECT COUNT(*) n FROM notifications WHERE sent_at>=?", ago(86400000))} mensaje(s) en 24 h · ${n("SELECT COUNT(*) n FROM notifications WHERE status='fallido' AND sent_at>=?", ago(86400000))} fallidos`, impl: "src/lib/notify.ts — SES / proveedor SMS / WhatsApp Business" },
  ];
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adapters.map((a) => (
          <div key={a.name} className="card space-y-1.5">
            <div className="text-sm font-semibold text-ink">{a.name}</div>
            <Badge tone={/abierto|caída|semiabierto/.test(a.state) ? "red" : "green"}>{a.state}</Badge>
            <p className="text-xs text-slate-600">{a.detail}</p>
            <p className="text-[11px] text-slate-400">{a.impl}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={A.retryQueue}><button className="btn btn-sm">Reintentar cola ahora</button></form>
        <form action={A.toggleOnbaseDown}><button className={down ? "btn btn-sm" : "btn-ghost btn-sm"}>{down ? "Restablecer OnBase" : "Simular caída de OnBase"}</button></form>
      </div>
      {down && <div className="mt-3"><Notice kind="warn">OnBase simulado como caído{process.env.ONBASE_DOWN === "1" ? " (variable ONBASE_DOWN=1)" : ""}: los documentos nuevos quedan cifrados en el almacén temporal y en cola; no se pierden.</Notice></div>}
      <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold text-ink"><Workflow className="h-4 w-4" aria-hidden />Cola de reintentos</h3>
      <Table head={["#", "Tipo", "Referencia", "Estado", "Intentos", "Próximo intento", "Último error", "Creado", "Terminado"]} empty="La cola está vacía" dense>
        {jobs.map((j) => (
          <tr key={j.id}><Td>{j.id}</Td><Td className="font-mono">{j.kind}</Td><Td>{j.onbase_ref ? `${j.onbase_ref} · ${j.doc}` : j.ref_id}</Td><Td><Badge>{j.status}</Badge></Td>
            <Td>{j.attempts}</Td><Td>{j.status === "pendiente" ? fmtDate(j.next_at) : "—"}</Td><Td className="max-w-[240px] truncate text-red-600">{j.last_error || ""}</Td><Td>{fmtDate(j.created_at)}</Td><Td>{fmtDate(j.done_at)}</Td></tr>
        ))}
      </Table>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Circuit breakers</h3>
      <Table head={["Integración", "Estado", "Fallas seguidas", "Abierto desde", ""]} empty="Ninguna integración ha fallado" dense>
        {breakers.map((b) => (
          <tr key={b.name}><Td className="font-mono">{b.name}</Td><Td><Badge tone={b.state === "cerrado" ? "green" : "red"}>{b.state}</Badge></Td><Td>{b.failures}</Td><Td>{fmtDate(b.opened_at)}</Td>
            <Td>{b.state !== "cerrado" && <form action={A.resetBreakerAction}><input type="hidden" name="name" value={b.name} /><button className="text-xs font-medium text-brand hover:underline">Restablecer</button></form>}</Td></tr>
        ))}
      </Table>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Registro de intercambios (sin datos sensibles)</h3>
      <Table head={["Fecha", "Sistema", "Operación", "Referencia", "Resultado", "ms", "Detalle"]} empty="Sin intercambios registrados" dense>
        {log.map((l) => <tr key={l.id}><Td>{fmtDate(l.ts)}</Td><Td>{l.system}</Td><Td className="font-mono">{l.operation}</Td><Td className="font-mono">{l.ref}</Td><Td>{l.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red">falla</Badge>}</Td><Td>{l.ms}</Td><Td className="max-w-[260px] truncate">{l.detail}</Td></tr>)}
      </Table>
    </>
  );
}

/* ===================== Procesos por lotes ===================== */
export function Procesos() {
  const info = runnerInfo();
  const runs = all<any>("SELECT * FROM job_runs ORDER BY id DESC LIMIT 50");
  return (
    <>
      <Notice kind={info.started ? "ok" : "warn"}>{info.started ? <>Ejecutor activo desde {fmtDate(info.since)} · instancia <code>{info.owner}</code> · {info.jobs} procesos registrados. Un candado en la base garantiza una sola ejecución simultánea.</> : "El ejecutor no está activo en este proceso (JOBS_DISABLED=1 o arranque en curso). Puedes ejecutar los procesos manualmente."}</Notice>
      <Table head={["Proceso", "Frecuencia", "Última ejecución", "Resultado", "Detalle", ""]} empty="Sin procesos">
        {ALL_JOBS.map((j) => {
          const r = get<any>("SELECT * FROM job_runs WHERE job=? ORDER BY id DESC LIMIT 1", j.name);
          const every = j.everyMs >= 3600000 ? `${j.everyMs / 3600000} h` : j.everyMs >= 60000 ? `${j.everyMs / 60000} min` : `${j.everyMs / 1000} s`;
          return (
            <tr key={j.name}><Td className="font-mono text-xs">{j.name}</Td><Td>cada {every}</Td><Td>{fmtDate(r?.started_at)}</Td>
              <Td>{!r ? "—" : !r.finished_at ? <Badge tone="blue">en curso</Badge> : r.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red">falla</Badge>}</Td>
              <Td className="max-w-md text-xs text-slate-600">{r?.detail}</Td>
              <Td><form action={A.runJobAction}><input type="hidden" name="name" value={j.name} /><button className="text-xs font-medium text-brand hover:underline">Ejecutar ahora</button></form></Td></tr>
          );
        })}
      </Table>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Últimas ejecuciones</h3>
      <Table head={["#", "Proceso", "Inicio", "Duración", "Resultado", "Detalle"]} empty="Sin ejecuciones" dense>
        {runs.map((r) => <tr key={r.id}><Td>{r.id}</Td><Td className="font-mono">{r.job}</Td><Td>{fmtDate(r.started_at)}</Td>
          <Td>{r.finished_at ? `${Math.max(0, new Date(r.finished_at).getTime() - new Date(r.started_at).getTime())} ms` : "—"}</Td>
          <Td>{r.finished_at ? (r.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red">falla</Badge>) : <Badge tone="blue">en curso</Badge>}</Td><Td className="max-w-lg truncate">{r.detail}</Td></tr>)}
      </Table>
    </>
  );
}

/* ===================== Seguridad ===================== */
export function Seguridad({ origin }: { origin: string }) {
  const cfg = ssoConfig(origin);
  const events = all<any>("SELECT * FROM security_events ORDER BY id DESC LIMIT 40");
  const n = (sql: string, ...p: any[]) => get<any>(sql, ...p)?.n ?? 0;
  const internals = n("SELECT COUNT(*) n FROM users WHERE status='activo' AND company_id IS NULL AND (internal=1 OR aliado_id IS NOT NULL)");
  const withMfa = n("SELECT COUNT(*) n FROM users WHERE status='activo' AND company_id IS NULL AND (internal=1 OR aliado_id IS NOT NULL) AND mfa_enabled=1");
  const chk = (name: string, on: boolean, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={on} className="mt-1" /><span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
  );
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={ShieldCheck} label="Internos/aliados con 2FA" value={`${withMfa}/${internals}`} hint={setting("mfa_required_internal", "1") === "1" ? "2FA obligatorio activo" : "2FA obligatorio desactivado"} tone="green" />
        <Stat icon={KeyRound} label="SSO corporativo" value={cfg.enabled ? "Activo" : "Inactivo"} hint={cfg.label} tone="blue" />
        <Stat icon={Activity} label="Ingresos fallidos (1 h)" value={n("SELECT COUNT(*) n FROM security_events WHERE kind IN ('login_fallido','otp_fallido','mfa_fallido') AND ts>=?", ago(3600000))} hint={`${n("SELECT COUNT(*) n FROM security_events WHERE kind='anomalia' AND ts>=?", ago(86400000))} anomalía(s) en 24 h`} tone="amber" />
        <Stat icon={FileLock2} label="Cifrado de archivos" value="AES-256-GCM" hint={storageKeySource()} tone="violet" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <form action={A.saveSecurity} className="card space-y-3">
          <H icon={ShieldCheck} sub="RN-08, RN-09, TEC-7, TEC-104">Acceso y protección</H>
          {chk("mfa_required_internal", setting("mfa_required_internal", "1") === "1", "Exigir verificación en dos pasos (TOTP) a roles internos y de aliado", "Sin 2FA configurado no reciben sesión: se enrolan al ingresar. Las empresas siguen con código al correo.")}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cierre por inactividad (minutos)"><input type="number" name="session_timeout_min" min={5} max={480} defaultValue={setting("session_timeout_min", "30")} className="input" /></Field>
            <Field label="Anonimizar invitaciones no aceptadas tras (días)"><input type="number" name="invite_anonymize_days" min={7} defaultValue={setting("invite_anonymize_days", "90")} className="input" /></Field>
            <Field label="Intentos de ingreso por IP / 15 min"><input type="number" name="rl_login" min={3} defaultValue={setting("rl_login", "20")} className="input" /></Field>
            <Field label="Intentos por cuenta / 15 min" hint="Además, bloqueo de 15 min tras 5 claves erradas."><input type="number" name="rl_login_cuenta" min={3} defaultValue={setting("rl_login_cuenta", "10")} className="input" /></Field>
            <Field label="Alerta: ingresos fallidos por IP en 10 min"><input type="number" name="anomaly_login_threshold" min={3} defaultValue={setting("anomaly_login_threshold", "10")} className="input" /></Field>
          </div>
          {chk("turnstile_enabled", setting("turnstile_enabled", "1") === "1", "Usar Cloudflare Turnstile (verificación invisible) en ingreso, recuperación, registro e inscripción",
            turnstileEnabled() ? "Configurado (TURNSTILE_SITE_KEY / TURNSTILE_SECRET)." : "No configurado: defina TURNSTILE_SITE_KEY y TURNSTILE_SECRET. Mientras tanto aplican campo trampa y límites por IP y cuenta.")}
          <button className="btn">Guardar</button>
        </form>
        <form action={A.saveSso} className="card space-y-3">
          <H icon={KeyRound} sub="OpenID Connect (Authorization Code + PKCE). Microsoft Entra ID, Keycloak, Okta, AD FS o el IAM de Compensar. SAML 2.0: vía Entra ID o un broker.">SSO corporativo (IdP)</H>
          {chk("sso_enabled", cfg.enabled, "Permitir «Ingresar con cuenta corporativa (SSO)»")}
          <Field label="Proveedor"><select name="sso_provider" defaultValue={cfg.provider} className="input">
            <option value="mock">IdP de prueba incluido (demostración)</option><option value="externo">IdP corporativo (Entra ID / IAM Compensar)</option></select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Issuer (https)" hint="Entra ID: https://login.microsoftonline.com/<tenant>/v2.0"><input name="sso_issuer" defaultValue={setting("sso_issuer")} className="input" /></Field>
            <Field label="Nombre visible"><input name="sso_label" defaultValue={setting("sso_label", "IAM corporativo")} className="input" /></Field>
            <Field label="client_id"><input name="sso_client_id" defaultValue={setting("sso_client_id")} className="input" /></Field>
            <Field label="client_secret" hint={setting("sso_client_secret") ? "Guardado. Déjalo vacío para conservarlo." : "No configurado"}><input name="sso_client_secret" type="password" autoComplete="new-password" className="input" /></Field>
            <Field label="Claim de grupos" hint="groups (Entra ID) o roles"><input name="sso_group_claim" defaultValue={setting("sso_group_claim", "groups")} className="input" /></Field>
            <Field label="Duración máxima de la sesión SSO (h)"><input type="number" name="sso_session_max_h" min={1} max={72} defaultValue={setting("sso_session_max_h", "8")} className="input" /></Field>
          </div>
          <Field label="Mapeo de grupos del IAM a roles (JSON)" hint='[{"group":"<id o nombre del grupo>","role":"<clave del rol>","scope_type":"org|program|assigned|aliado","scope_id":2}]'>
            <textarea name="sso_group_map" rows={7} defaultValue={JSON.stringify(cfg.map, null, 1)} className="input font-mono text-xs" /></Field>
          {chk("sso_jit", cfg.jit, "Aprovisionamiento automático (JIT): crear al funcionario en su primer ingreso si su grupo está mapeado")}
          {chk("sso_trust_idp_mfa", setting("sso_trust_idp_mfa", "1") === "1", "Confiar en el MFA del IAM corporativo (acceso condicional)", "Si se desmarca, tras el SSO también se pide el TOTP de la plataforma.")}
          {demoMode() && chk("sso_mock_enabled", setting("sso_mock_enabled", "1") === "1", "Publicar el IdP de prueba en /mock-idp (solo demostración)")}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            URI de redirección para registrar en el IdP: <code className="select-all">{origin}/api/auth/oidc/callback</code><br />
            Issuer efectivo: <code>{cfg.issuer || "—"}</code> · <a className="text-brand" href="/api/auth/oidc/start" target="_blank" rel="noopener">Probar ingreso SSO</a> (abre una sesión nueva en este navegador)
          </div>
          <button className="btn">Guardar SSO</button>
        </form>
      </div>
      <div className="mt-4"><Notice kind="info">LDAP/LDAPS directo no se implementa por diseño (TEC-5): obligaría a la plataforma a recibir contraseñas corporativas. El directorio se federa mediante un IdP OIDC/SAML (Entra ID, AD FS, Keycloak) y los atributos se sincronizan en cada ingreso.</Notice></div>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Eventos de seguridad recientes</h3>
      <Table head={["Fecha", "Tipo", "IP", "Cuenta", "Detalle"]} empty="Sin eventos de seguridad" dense>
        {events.map((e) => <tr key={e.id}><Td>{fmtDate(e.ts)}</Td><Td><Badge tone={e.kind === "anomalia" ? "red" : e.kind.includes("fallido") ? "amber" : "slate"}>{e.kind}</Badge></Td><Td className="font-mono">{e.ip}</Td><Td>{e.email}</Td><Td className="max-w-md truncate">{e.detail}</Td></tr>)}
      </Table>
    </>
  );
}

/* ===================== Errores técnicos ===================== */
export function Errores() {
  const rows = all<any>("SELECT e.*, u.email FROM error_log e LEFT JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 100");
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Errores técnicos con identificador de traza (TEC-73). Correos, números y tokens se enmascaran antes de guardarse.</p>
        <form action={A.testError}><button className="btn-ghost btn-sm">Registrar error de prueba</button></form>
      </div>
      {rows.length ? (
        <div className="space-y-2">{rows.map((e) => (
          <details key={e.id} className="card !p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm"><Bug className="h-4 w-4 text-red-500" aria-hidden /><span className="text-xs text-slate-500">{fmtDate(e.ts)}</span>
              <code className="text-xs">{e.source}</code><span className="min-w-0 flex-1 truncate text-ink">{e.message}</span>{e.email && <span className="text-xs text-slate-400">{e.email}</span>}</summary>
            {e.stack && <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{e.stack}</pre>}
          </details>))}</div>
      ) : <EmptyState title="Sin errores técnicos registrados">Los errores de las páginas, acciones, API y procesos por lotes aparecerán aquí.</EmptyState>}
    </>
  );
}

/* ===================== Exportación total ===================== */
export function Exportacion({ admin }: { admin: boolean }) {
  const tables = all<any>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const hist = all<any>("SELECT * FROM audit_log WHERE action='exportacion_total' ORDER BY id DESC LIMIT 20");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-3 text-sm">
        <H icon={Download} sub="TEC-89 · RNF-PRI-06">Exportación total en formatos abiertos</H>
        <p className="text-slate-600">Descarga <b>toda</b> la información de la plataforma ({tables.length} tablas, incluidos auditoría y registros técnicos): un libro Excel con una hoja por tabla y un archivo JSON con el mismo contenido. Se omiten solo las credenciales (hashes de contraseña, secretos 2FA, API y webhooks, tokens). Los adjuntos se entregan desde OnBase según su referencia.</p>
        {admin ? (
          <div className="flex flex-wrap gap-2">
            <a className="btn" href="/api/export/total?formato=xlsx">Descargar .xlsx</a>
            <a className="btn-ghost" href="/api/export/total?formato=json">Descargar .json</a>
          </div>
        ) : <Notice kind="warn">Solo el Administrador puede descargar la exportación total.</Notice>}
        <p className="text-xs text-slate-500">Cada descarga queda registrada en la auditoría.</p>
      </div>
      <div className="card">
        <h3 className="mb-2 text-sm font-semibold text-ink">Exportaciones realizadas</h3>
        <Table head={["Fecha", "Usuario", "Detalle"]} empty="Aún no se ha exportado" dense>
          {hist.map((h) => { const a = jparse<any>(h.after, {}); return <tr key={h.id}><Td>{fmtDate(h.ts)}</Td><Td>{h.user_email}</Td><Td>{a.formato} · {a.tablas} tablas · {a.filas} filas</Td></tr>; })}
        </Table>
      </div>
    </div>
  );
}

/* ===================== Datos personales (TEC-91) ===================== */
const COMMON: Record<string, string> = {
  email: "Correo (identificación y contacto)", user_email: "Correo del usuario", to_addr: "Destinatario (correo o celular)", phone: "Celular",
  ip: "Dirección IP", accepted_ip: "IP de aceptación", ua: "Navegador/dispositivo", password_hash: "Contraseña (hash scrypt)", mfa_secret: "Secreto 2FA (cifrado)",
  sso_subject: "Identificador del IAM corporativo", consent_at: "Fecha de autorización de tratamiento", consent_version: "Versión de la autorización", title: "Cargo",
  notif_prefs: "Preferencias de contacto", user_id: "Referencia a la persona", uploaded_by: "Referencia a la persona", accepted_by: "Referencia a la persona",
};
const SPECIFIC: Record<string, Record<string, string>> = {
  users: { name: "Nombre completo" }, registrations: { name: "Nombre del inscrito", code: "Código de asistencia" },
  companies: { nit: "NIT (puede ser de persona natural)", social: "Redes de contacto" }, client_registry: { nit: "NIT", cesante: "Condición laboral" },
  audit_log: { before: "Valores anteriores (pueden incluir datos personales)", after: "Valores nuevos (pueden incluir datos personales)" },
  form_responses: { answers: "Respuestas (pueden incluir datos personales)" }, surveys: { comment: "Comentario libre" },
  messages: { body: "Contenido de mensajes" }, notifications: { body: "Contenido del mensaje enviado" }, security_events: { email: "Cuenta afectada" },
};
const PURPOSE: Record<string, [string, string]> = {
  users: ["Gestión de identidad, acceso y contacto de usuarios internos, aliados y empresas", "Mientras la cuenta esté activa; invitaciones no aceptadas se anonimizan a los 90 días"],
  registrations: ["Inscripción, asistencia y certificación a eventos y cursos", "Vigencia del programa + 5 años (soporte de la Superintendencia)"],
  companies: ["Gestión de empresas beneficiarias de los programas", "Vigencia del programa + 5 años"],
  audit_log: ["Trazabilidad y control (Ley 1581, entes de control)", "Inalterable; según política de retención de Compensar"],
  notifications: ["Trazabilidad de entrega y lectura de mensajes", "2 años"], sessions: ["Sesión web segura", "Hasta el cierre o 30 min de inactividad"],
  session_meta: ["Sesiones activas y cierre remoto", "Igual que la sesión"], security_events: ["Detección de abusos y anomalías", "180 días"],
  api_log: ["Trazabilidad de accesos por API", "90 días"], otp_codes: ["Ingreso y recuperación con código", "Se borran 1 día después de vencer"],
  messages: ["Mensajería mentor–empresa", "Vigencia del acompañamiento + 5 años"], form_responses: ["Formularios e inscripciones", "Vigencia del programa + 5 años"],
  surveys: ["Encuestas de satisfacción", "3 años"], mentoring_sessions: ["Aceptación de sesiones (usuario, fecha, IP)", "Vigencia del programa + 5 años"],
  documents: ["Evidencias y aceptación de documentos", "Según tabla de retención documental en OnBase"],
};
export function DatosPersonales() {
  const tables = all<any>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name as string);
  const inv = tables.map((t) => {
    const cols = all<any>(`PRAGMA table_info("${t.replace(/"/g, "")}")`).map((c) => c.name as string);
    const pii = cols.map((c) => [c, SPECIFIC[t]?.[c] ?? COMMON[c]] as [string, string | undefined]).filter(([, d]) => d) as [string, string][];
    const rows = pii.length ? get<any>(`SELECT COUNT(*) n FROM "${t.replace(/"/g, "")}"`).n : 0;
    return { t, pii, rows };
  }).filter((x) => x.pii.length);
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">Inventario de objetos con datos personales (Ley 1581 de 2012, TEC-91), <b>generado a partir del esquema actual de la base</b>: cualquier tabla o campo nuevo de un módulo aparece aquí automáticamente. Compensar es responsable del tratamiento; el proveedor actúa como encargado.</p>
      <Table head={["Objeto (tabla)", "Campos con datos personales", "Registros", "Finalidad", "Retención", "Medidas"]} empty="Sin objetos con datos personales">
        {inv.map((x) => (
          <tr key={x.t}>
            <Td className="font-mono text-xs">{x.t}</Td>
            <Td><ul className="space-y-0.5 text-xs">{x.pii.map(([c, d]) => <li key={c}><code>{c}</code> — {d}</li>)}</ul></Td>
            <Td>{x.rows}</Td>
            <Td className="text-xs">{PURPOSE[x.t]?.[0] ?? "Operación del módulo correspondiente"}</Td>
            <Td className="text-xs">{PURPOSE[x.t]?.[1] ?? "Según política de retención de Compensar"}</Td>
            <Td className="text-xs">Acceso por rol y alcance · auditoría · HTTPS{x.pii.some(([c]) => ["password_hash", "mfa_secret"].includes(c)) ? " · hash/cifrado" : ""}{x.t === "users" ? " · anonimización" : ""}{["registrations", "users"].includes(x.t) ? " · exportación con permiso de datos personales" : ""}</Td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Database className="h-3.5 w-3.5" aria-hidden />{inv.length} objetos con datos personales de {tables.length} tablas. La API enmascara correos y celulares salvo el scope <code>pii.read</code>.</p>
    </>
  );
}
