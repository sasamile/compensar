import { Settings as PageIcon } from "lucide-react";
import Link from "next/link";
import { all, get, setting } from "@/lib/db";
import { requireUser, requirePerm } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import { PERM_CATALOG } from "@/lib/perms";
import { jparse, money } from "@/lib/util";
import * as A from "./actions";

const TABS: [string, string][] = [["programas", "Programas y rutas"], ["servicios", "Catálogo de servicios"], ["aliados", "Aliados"], ["plantillas", "Plantillas de mensajes"], ["marca", "Marca y canales"], ["roles", "Roles y permisos"]];

function Toggle({ kind, id, active, tab }: any) {
  return (<form action={A.toggleNode}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="tab" value={tab} />
    <button className="btn-ghost btn-sm">{active ? "Inactivar" : "Activar"}</button></form>);
}
/** Edición en línea del nombre (RF-PAR-02): conserva el id y el historial; el cambio queda auditado. */
function Rename({ kind, id, name, desc, strong, small }: { kind: string; id: number; name: string; desc?: string; strong?: boolean; small?: boolean }) {
  const label = { eje: "del eje", linea: "de la línea", ruta: "de la ruta" }[kind];
  return (<form action={A.renameNode} className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <input name="name" defaultValue={name} required maxLength={150} aria-label={`Nombre ${label}`} title="Haz clic para editar el nombre"
      className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 hover:border-slate-200 focus:border-brand focus:bg-white focus:outline-none ${strong ? "font-semibold" : ""} ${small ? "text-xs text-slate-600" : "text-sm"}`} />
    {kind === "ruta" && <input name="description" defaultValue={desc || ""} maxLength={500} aria-label="Descripción de la ruta" placeholder="Descripción"
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-400 hover:border-slate-200 focus:border-brand focus:bg-white focus:outline-none" />}
    <button className="btn-ghost btn-sm" title={`Guardar el nombre ${label}`}>Guardar</button>
  </form>);
}
function AddNode({ kind, parent, ph, desc }: any) {
  return (<form action={A.addNode} className="flex gap-1">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="parent" value={parent} />
    <input name="name" placeholder={ph} className="input !py-1 text-xs" required />{desc && <input name="description" placeholder="Descripción" className="input !py-1 text-xs" />}
    <button className="btn btn-sm">+</button></form>);
}

export default async function Config({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "config.manage");
  const sp = await searchParams;
  const tab = sp.tab || "programas";
  const programs = all<any>("SELECT * FROM programs ORDER BY id");
  const aliados = all<any>("SELECT * FROM aliados ORDER BY id");
  return (
    <>
      <PageHeader icon={PageIcon} title="Configuración" subtitle="Todo se parametriza sin desarrollo y cada cambio queda en auditoría" />
      <Flash sp={sp} />
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => <Link key={k} href={`/configuracion?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand font-medium text-brand" : "border-transparent text-slate-500"}`}>{l}</Link>)}
      </div>

      {tab === "programas" && (
        <div className="space-y-6">
          {programs.map((p) => {
            const ejes = all<any>("SELECT * FROM ejes WHERE program_id=?", p.id);
            return (
              <div key={p.id} className="card space-y-4">
                <form action={A.saveProgram} className="grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="id" value={p.id} />
                  <Field label="Programa"><input name="name" defaultValue={p.name} className="input" /></Field>
                  <Field label="Responsable"><input name="owner" defaultValue={p.owner} className="input" /></Field>
                  <Field label="Vigencia desde"><input name="valid_from" type="date" defaultValue={p.valid_from} className="input" /></Field>
                  <Field label="Hasta"><input name="valid_to" type="date" defaultValue={p.valid_to} className="input" /></Field>
                  <div className="md:col-span-3"><Field label="Requisitos de acceso (descriptivos)"><textarea name="requirements" defaultValue={p.requirements} rows={2} className="input" /></Field></div>
                  <Field label="Estado"><select name="status" defaultValue={p.status} className="input"><option>activo</option><option>inactivo</option></select></Field>
                  <div><button className="btn">Guardar programa</button></div>
                </form>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Ejes → Líneas → Rutas <span className="font-normal normal-case text-slate-400">· haz clic en un nombre para editarlo; inactivar no borra el historial</span></div>
                  <div className="space-y-3">
                    {ejes.map((e) => (
                      <div key={e.id} className={`rounded-lg border p-3 ${e.active ? "border-slate-200" : "border-dashed bg-slate-50 opacity-70"}`}>
                        <div className="flex items-center justify-between gap-2"><Rename kind="eje" id={e.id} name={e.name} strong /><Toggle kind="eje" id={e.id} active={e.active} tab="programas" /></div>
                        {all<any>("SELECT * FROM lineas WHERE eje_id=?", e.id).map((l) => (
                          <div key={l.id} className="ml-4 mt-2 border-l-2 border-slate-200 pl-3">
                            <div className="flex items-center justify-between gap-2 text-sm"><Rename kind="linea" id={l.id} name={l.name} />{!l.active && <Badge>inactiva</Badge>}<Toggle kind="linea" id={l.id} active={l.active} tab="programas" /></div>
                            {all<any>("SELECT * FROM rutas WHERE linea_id=?", l.id).map((r) => (
                              <div key={r.id} className="ml-4 flex items-center justify-between gap-2 text-xs text-slate-600"><span aria-hidden>↳</span><Rename kind="ruta" id={r.id} name={r.name} desc={r.description} small />{!r.active && <Badge>inactiva</Badge>}<Toggle kind="ruta" id={r.id} active={r.active} tab="programas" /></div>))}
                            <div className="ml-4 mt-1"><AddNode kind="ruta" parent={l.id} ph="Nueva ruta" /></div>
                          </div>))}
                        <div className="ml-4 mt-2"><AddNode kind="linea" parent={e.id} ph="Nueva línea" /></div>
                      </div>))}
                    <AddNode kind="eje" parent={p.id} ph="Nuevo eje" />
                  </div>
                </div>
              </div>);
          })}
          <form action={A.saveProgram} className="card grid gap-3 md:grid-cols-4">
            <div className="md:col-span-4 font-semibold text-ink">Nuevo programa</div>
            <Field label="Nombre"><input name="name" required className="input" /></Field>
            <Field label="Responsable"><input name="owner" className="input" /></Field>
            <Field label="Desde"><input name="valid_from" type="date" className="input" /></Field>
            <Field label="Hasta"><input name="valid_to" type="date" className="input" /></Field>
            <div className="md:col-span-3"><Field label="Requisitos de acceso"><textarea name="requirements" rows={2} className="input" /></Field></div>
            <div className="self-end"><button className="btn">Crear programa</button></div>
          </form>
        </div>
      )}

      {tab === "servicios" && (<>
        <Table head={["Servicio", "Programa", "Aliado", "Tipo", "Horas", "Sesiones", "Costo interno", "Estado", ""]}>
          {all<any>(`SELECT s.*, p.name program, a.name aliado FROM servicios s LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN aliados a ON a.id=s.aliado_id ORDER BY s.id`).map((s) => (
            <tr key={s.id}><Td><b>{s.name}</b><div className="text-xs text-slate-400">{s.indicators}</div></Td><Td>{s.program}</Td><Td>{s.aliado || "Interno"}</Td><Td>{s.kind}</Td><Td>{s.hours}</Td><Td>{s.sessions}</Td><Td>{money(s.internal_cost)}</Td>
              <Td><Badge>{s.active ? "activo" : "inactivo"}</Badge></Td><Td><Toggle kind="servicio" id={s.id} active={s.active} tab="servicios" /></Td></tr>))}
        </Table>
        <form action={A.saveServicio} className="card mt-5 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-4 font-semibold text-ink">Nuevo servicio</div>
          <Field label="Nombre"><input name="name" required className="input" /></Field>
          <Field label="Programa"><select name="program_id" className="input">{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Línea"><select name="linea_id" className="input"><option value="">—</option>{all<any>("SELECT id,name FROM lineas WHERE active=1").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Aliado"><select name="aliado_id" className="input"><option value="">Interno</option>{aliados.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Tipo"><select name="kind" className="input"><option value="mentoria">Mentoría</option><option value="capacitacion">Capacitación</option></select></Field>
          <Field label="Horas"><input name="hours" type="number" step="0.5" className="input" /></Field>
          <Field label="Sesiones"><input name="sessions" type="number" className="input" /></Field>
          <Field label="Costo interno (informativo)"><input name="internal_cost" type="number" className="input" /></Field>
          <div className="md:col-span-3"><Field label="Indicadores"><input name="indicators" className="input" /></Field></div>
          <div className="self-end"><button className="btn">Crear servicio</button></div>
        </form></>)}

      {tab === "aliados" && (<>
        <Table head={["Aliado", "NIT", "Usuarios", "Estado", ""]}>
          {aliados.map((a) => (<tr key={a.id}><Td><b>{a.name}</b></Td><Td>{a.nit}</Td>
            <Td>{all<any>("SELECT name FROM users WHERE aliado_id=?", a.id).map((x) => x.name).join(", ") || "—"}</Td>
            <Td><Badge>{a.active ? "activo" : "inactivo"}</Badge></Td><Td><Toggle kind="aliado" id={a.id} active={a.active} tab="aliados" /></Td></tr>))}
        </Table>
        <form action={A.saveAliado} className="card mt-5 flex flex-wrap items-end gap-3">
          <Field label="Razón social"><input name="name" required className="input" /></Field>
          <Field label="NIT"><input name="nit" className="input" /></Field>
          <button className="btn">Crear aliado</button>
          <p className="w-full text-xs text-slate-400">Luego invita al coordinador y sus mentores desde «Usuarios».</p>
        </form></>)}

      {tab === "plantillas" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Una plantilla no aprobada no se puede enviar. Al editar, vuelve a quedar pendiente de aprobación de Compensar. Variables: <code>{"{{name}} {{company}} {{when}} {{code}}"}</code>…</p>
          {all<any>("SELECT * FROM templates ORDER BY key, channel").map((t) => (
            <details key={t.id} className="card !p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm"><b>{t.key}</b><Badge tone="slate">{t.channel}</Badge>{t.approved ? <Badge tone="green">aprobada</Badge> : <Badge tone="amber">pendiente</Badge>}</summary>
              <form action={A.saveTemplate} className="mt-3 space-y-2"><input type="hidden" name="id" value={t.id} />
                {t.channel === "correo" && <input name="subject" defaultValue={t.subject} className="input" />}
                <textarea name="body" defaultValue={t.body} rows={2} className="input" />
                <div className="flex gap-2"><button className="btn btn-sm">Guardar</button></div></form>
              {!t.approved && <form action={A.approveTemplate} className="mt-2"><input type="hidden" name="id" value={t.id} /><button className="btn-ghost btn-sm">Aprobar (Compensar)</button></form>}
            </details>))}
        </div>
      )}

      {tab === "marca" && (<div className="max-w-3xl space-y-5">
        <section className="card space-y-3" aria-labelledby="logo-marca">
          <h2 id="logo-marca" className="font-semibold text-ink">Logo</h2>
          <div className="flex flex-wrap items-center gap-5">
            {setting("brand_logo_doc")
              ? <img src={`/api/marca/logo?v=${setting("brand_logo_doc")}`} alt={`Logo de ${setting("brand_name", "la organización")}`} className="h-20 w-20 rounded-xl border border-slate-200 bg-white object-contain p-1" />
              : <div className="grid h-20 w-20 place-items-center rounded-xl text-2xl font-bold text-white" style={{ background: setting("brand_color", "#0a6cff") }} aria-label="Sin logo: se usa la inicial">{setting("brand_name", "C")[0]}</div>}
            <form action={A.uploadLogo} className="flex flex-wrap items-end gap-3">
              <label className="block"><span className="label">Imagen PNG o JPG (máx. 2 MB, idealmente cuadrada)</span>
                <input type="file" name="logo" accept=".png,.jpg,.jpeg,image/png,image/jpeg" required className="block text-sm" /></label>
              <button className="btn">Subir logo</button>
            </form>
            {setting("brand_logo_doc") && <form action={A.removeLogo}><button className="btn-ghost btn-sm">Quitar logo</button></form>}
          </div>
          <p className="text-xs text-slate-500">Pasa por el antivirus y queda en el repositorio documental. Se muestra en el menú, las pantallas de ingreso, las landings y los certificados.</p>
        </section>
        <form action={A.saveBrand} className="card grid gap-3 md:grid-cols-2">
          <Field label="Nombre de la organización"><input name="brand_name" defaultValue={setting("brand_name")} className="input" /></Field>
          <Field label="Color principal"><input name="brand_color" type="color" defaultValue={setting("brand_color", "#0a6cff")} className="input !p-1 h-10" /></Field>
          <Field label="Subtítulo"><input name="brand_tagline" defaultValue={setting("brand_tagline")} className="input" /></Field>
          <Field label="Cierre por inactividad (min)"><input name="session_timeout_min" type="number" defaultValue={setting("session_timeout_min", "30")} className="input" /></Field>
          <div className="md:col-span-2"><Field label="Texto de bienvenida de empresas"><textarea name="welcome_text" defaultValue={setting("welcome_text")} rows={2} className="input" /></Field></div>
          <Field label="Versión del texto de datos personales"><input name="consent_version" defaultValue={setting("consent_version")} className="input" /></Field>
          <Field label="Texto de autorización (Ley 1581)"><textarea name="consent_text" defaultValue={setting("consent_text")} rows={2} className="input" /></Field>
          <div className="md:col-span-2"><Field label="Pasos obligatorios del primer ingreso (uno por línea)"><textarea name="onboarding_steps" defaultValue={jparse<string[]>(setting("onboarding_steps"), []).join("\n")} rows={3} className="input" /></Field></div>
          <div className="md:col-span-2 flex gap-5 text-sm">
            {["correo", "sms", "whatsapp"].map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" name={`channel_${c}`} defaultChecked={setting(`channel_${c}`, "1") === "1"} />Canal {c}</label>)}
          </div>
          <Field label="Prefijo de SMS y WhatsApp" hint="Si lo dejas vacío se usa el nombre de la organización"><input name="brand_sms_prefix" defaultValue={setting("brand_sms_prefix")} maxLength={30} placeholder={setting("brand_name", "Compensar")} className="input" /></Field>
          <Field label="Pie de los correos" hint="Opcional; por defecto: nombre de la organización y subtítulo"><input name="brand_email_footer" defaultValue={setting("brand_email_footer")} maxLength={200} className="input" /></Field>
          <div><button className="btn">Guardar</button></div>
        </form>
      </div>)}

      {tab === "roles" && (
        <div className="space-y-3">
          <form action={A.cloneRole} className="card flex flex-wrap items-end gap-3">
            <Field label="Nuevo rol (nombre)"><input name="name" required placeholder="Evaluador senior" className="input" /></Field>
            <Field label="Copiar permisos de"><select name="from" className="input">{all<any>("SELECT id,name FROM roles").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <button className="btn">Crear a partir de otro</button>
          </form>
          {all<any>("SELECT * FROM roles ORDER BY id").map((r) => {
            const perms = jparse<string[]>(r.perms, []);
            return (
              <details key={r.id} className="card !p-3">
                <summary className="cursor-pointer text-sm"><b>{r.name}</b> <span className="text-slate-400">· {perms.includes("*") ? "todos los permisos" : `${perms.length} permisos`}</span></summary>
                <form action={A.saveRole} className="mt-3 space-y-3"><input type="hidden" name="id" value={r.id} />
                  <input name="name" defaultValue={r.name} className="input max-w-sm" />
                  <div className="grid gap-1 md:grid-cols-3">
                    {PERM_CATALOG.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" name="perm" value={k} defaultChecked={perms.includes(k) || perms.includes("*")} />{l}</label>)}
                  </div>
                  {perms.some((p) => p.startsWith("report:") && p !== "report:*") && <p className="text-xs text-slate-400">Reportes puntuales actuales: {perms.filter((p) => p.startsWith("report:")).join(", ")} (al guardar se conservan solo los marcados arriba).</p>}
                  <button className="btn btn-sm">Guardar permisos</button></form>
              </details>);
          })}
        </div>
      )}
    </>
  );
}
