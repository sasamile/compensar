import { Building2 as PageIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { all, get } from "@/lib/db";
import { can, canSeeCompany, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Table, Td } from "@/components/ui";
import PrintButton from "@/components/print-button";
import { fmtDate, jparse } from "@/lib/util";
import * as A from "../actions";
import { syncClientData } from "./actions";
import { HistorialCambios } from "./historial";
import { CAMPOS, FUENTE } from "@/lib/integrations/gestion-clientes";

export default async function Perfil({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const id = Number((await params).id);
  if (!canSeeCompany(u, id)) redirect("/sin-acceso"); // un mentor no asignado no abre la empresa ni por enlace directo
  const c = get<any>("SELECT c.*, p.name program FROM companies c JOIN programs p ON p.id=c.program_id WHERE c.id=?", id);
  const mentor = get<any>("SELECT u.name, a.from_at FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=? AND a.active=1", id);
  const history = all<any>("SELECT a.*, u.name FROM mentor_assignments a JOIN users u ON u.id=a.mentor_id WHERE a.company_id=? ORDER BY a.id DESC", id);
  const contacts = all<any>("SELECT u.*, CASE WHEN u.company_id=? THEN u.is_principal ELSE 0 END is_principal FROM users u WHERE u.company_id=? OR u.id IN (SELECT user_id FROM company_contacts WHERE company_id=?)", id, id, id);
  const items = all<any>("SELECT * FROM company_items WHERE company_id=? ORDER BY id DESC", id);
  const sessions = all<any>("SELECT s.*, m.name mentor FROM mentoring_sessions s LEFT JOIN users m ON m.id=s.mentor_id WHERE s.company_id=? ORDER BY s.scheduled_at DESC", id);
  const refs = all<any>("SELECT r.*, sv.name service, a.name aliado FROM referrals r JOIN servicios sv ON sv.id=r.servicio_id JOIN aliados a ON a.id=r.aliado_id WHERE r.company_id=? ORDER BY r.id DESC", id);
  const inds = all<any>("SELECT * FROM indicators WHERE company_id=?", id);
  const vis = jparse<string[]>(c.visible_fields, []);
  const mentorOf = !!get("SELECT 1 FROM mentor_assignments WHERE company_id=? AND mentor_id=? AND active=1", id, u.id);
  const repOf = u.company_id === id && !!u.is_principal;
  const canEdit = repOf || mentorOf || can(u, "config.manage");

  // Línea de tiempo: sesiones, seguimientos, documentos, remisiones y cambios
  const tl: { at: string; what: string; who?: string }[] = [];
  sessions.forEach((s) => { tl.push({ at: s.scheduled_at, what: `Sesión «${s.title}» (${s.status})` }); if (s.accepted_at) tl.push({ at: s.accepted_at, what: `Empresa aceptó la sesión «${s.title}» (IP ${s.accepted_ip})` }); });
  all<any>("SELECT d.*, u.name FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.company_id=?", id).forEach((d) => tl.push({ at: d.created_at, what: `Documento ${d.name} → OnBase ${d.onbase_ref}`, who: d.name }));
  refs.forEach((r) => tl.push({ at: r.created_at, what: `Remisión a «${r.service}» (${r.aliado}) — ${r.status}` }));
  all<any>("SELECT * FROM audit_log WHERE entity='company' AND entity_id=? ORDER BY id DESC LIMIT 30", String(id)).forEach((a) => tl.push({ at: a.ts, what: `${a.action.replace(/_/g, " ")}`, who: a.user_email }));
  tl.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const canAssignItems = can(u, "items.assign");
  const canSync = can(u, "companies.activate") || can(u, "config.manage");
  const internal = !u.company_id && !u.aliado_id;
  const gc = internal ? get<any>("SELECT s.*, u.name syncer FROM company_client_sync s LEFT JOIN users u ON u.id=s.synced_by WHERE s.company_id=?", id) : null;
  const gcData = jparse<any>(gc?.data, null);
  const gcShow = (k: string, v: any) => v == null ? "—" : CAMPOS.find((x) => x.key === k)?.tipo === "booleano" ? (Number(v) ? "Sí" : "No") : k === "ventas_brutas" ? Number(v).toLocaleString("es-CO") : String(v);
  const rutas = canAssignItems ? all<any>("SELECT id,name FROM rutas WHERE active=1") : [];
  const servicios = canAssignItems ? all<any>("SELECT id,name FROM servicios WHERE active=1 AND program_id=?", c.program_id) : [];
  const cursos = canAssignItems ? all<any>("SELECT id,title FROM events WHERE type='curso' AND active=1") : [];

  return (
    <>
      <PageHeader icon={PageIcon} title={c.razon_social} subtitle={`NIT ${c.nit}-${c.dv} · ${c.program}`}
        actions={<><Badge>{c.status}</Badge>
          <Link className="btn-ghost btn-sm print:hidden" href={`/trazabilidad/${id}`}>Trazabilidad completa</Link>
          <Link className="btn-ghost btn-sm print:hidden" href={`/hoja-de-ruta/${id}`}>Hoja de ruta</Link>
          <Link className="btn-ghost btn-sm print:hidden" href={`/informe-final/${id}`}>Informe final</Link>
          <PrintButton label="Línea de tiempo → PDF" /><Link className="btn-ghost btn-sm print:hidden" href="/empresas">← Empresas</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold text-ink">Perfil</h2>
          {canEdit ? (
            <form action={A.saveProfile} className="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Sector"><input name="sector" defaultValue={c.sector} className="input" /></Field>
              <Field label="Tamaño"><select name="size" defaultValue={c.size || "Micro"} className="input"><option>Micro</option><option>Pequeña</option><option>Mediana</option></select></Field>
              <Field label="Ciudad"><input name="city" defaultValue={c.city} className="input" /></Field>
              <div className="md:col-span-3"><Field label="Propuesta de valor"><textarea name="value_prop" defaultValue={c.value_prop} rows={2} className="input" /></Field></div>
              <div className="md:col-span-3"><Field label="Redes sociales / sitio"><input name="social" defaultValue={c.social} className="input" /></Field></div>
              {repOf && <div className="md:col-span-3"><span className="label">Campos visibles en el directorio</span>
                <div className="flex flex-wrap gap-4 text-sm">{[["razon_social", "Nombre"], ["sector", "Sector"], ["city", "Ciudad"], ["value_prop", "Propuesta de valor"], ["social", "Redes"]].map(([k, l]) =>
                  <label key={k} className="flex items-center gap-1"><input type="checkbox" name="visible" value={k} defaultChecked={vis.includes(k)} />{l}</label>)}</div></div>}
              <div><button className="btn">Guardar perfil</button></div>
            </form>
          ) : (
            <dl className="grid gap-2 text-sm md:grid-cols-3"><div><dt className="label">Sector</dt>{c.sector}</div><div><dt className="label">Tamaño</dt>{c.size}</div><div><dt className="label">Ciudad</dt>{c.city}</div>
              <div className="md:col-span-3"><dt className="label">Propuesta de valor</dt>{c.value_prop}</div></dl>)}
          <p className="mt-3 text-xs text-slate-400">Cada cambio queda con quién, cuándo, valor anterior y nuevo (ver <a href="#historial-cambios" className="underline">Historial de cambios del perfil</a>).</p>
        </div>
        <div className="space-y-5">
          <div className="card"><h2 className="mb-2 font-semibold text-ink">Mentor</h2>
            <div className="text-sm">{mentor ? <><b>{mentor.name}</b><div className="text-xs text-slate-400">desde {fmtDate(mentor.from_at, false)}</div></> : <span className="text-slate-400">Sin mentor asignado</span>}</div>
            {history.length > 1 && <div className="mt-2 text-xs text-slate-500">Historial: {history.map((h) => `${h.name}${h.active ? "" : " (anterior)"}`).join(" → ")}</div>}
          </div>
          {internal && (
            <div id="gestion-clientes" className="card">
              <h2 className="mb-1 font-semibold text-ink">Gestión de Clientes</h2>
              <p className="mb-2 text-xs text-slate-500">{FUENTE()} · {gc ? <>última sincronización {fmtDate(gc.synced_at)}{gc.syncer ? ` por ${gc.syncer}` : ""}</> : "sin sincronizar"}</p>
              {gc?.status === "no_encontrada" && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">El NIT no aparece en Gestión de Clientes.</p>}
              {gc?.status === "error" && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">Última consulta fallida: {gc.error}</p>}
              {gcData ? (
                <dl className="divide-y divide-slate-100 text-xs">
                  {["afiliado", "meses_afiliacion", "al_dia_parafiscales", "aportes_meses_3a", "ventas_brutas", "inscrito_agencia"].map((k) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 py-1"><dt className="text-slate-500">{CAMPOS.find((x) => x.key === k)?.label}</dt><dd className="whitespace-nowrap font-medium tabular-nums text-slate-800">{gcShow(k, gcData[k])}</dd></div>))}
                </dl>) : !gc && <p className="text-xs text-slate-400">Consulta la afiliación, los meses y el estado de aportes de la empresa.</p>}
              {canSync && <form action={syncClientData} className="mt-3"><input type="hidden" name="company_id" value={id} /><button className="btn-ghost btn-sm">Sincronizar con Gestión de Clientes</button></form>}
            </div>)}
          <div className="card"><h2 className="mb-2 font-semibold text-ink">Contactos</h2>
            {contacts.map((x) => <div key={x.id} className="text-sm">{x.name} {x.is_principal ? <Badge tone="blue">representante</Badge> : null}<div className="text-xs text-slate-400">{x.email}</div></div>)}</div>
        </div>
      </div>

      <h2 className="mb-2 mt-6 font-semibold text-ink">Rutas, cursos y servicios asignados</h2>
      <Table head={["Tipo", "Asignado", "Estado", "Fecha"]} empty="Nada asignado aún">
        {items.map((i) => <tr key={i.id}><Td>{i.kind}</Td><Td>{i.label}</Td><Td><Badge>{i.status}</Badge></Td><Td>{fmtDate(i.created_at, false)}</Td></tr>)}
      </Table>
      {canAssignItems && c.status === "activa" && (
        <form action={A.assignItem} className="mt-2 flex gap-2"><input type="hidden" name="company_id" value={id} />
          <select name="item" className="input !w-auto">
            <optgroup label="Rutas">{rutas.map((r) => <option key={r.id} value={`ruta:${r.id}`}>{r.name}</option>)}</optgroup>
            <optgroup label="Servicios">{servicios.map((r) => <option key={r.id} value={`servicio:${r.id}`}>{r.name}</option>)}</optgroup>
            <optgroup label="Cursos">{cursos.map((r) => <option key={r.id} value={`curso:${r.id}`}>{r.title}</option>)}</optgroup></select>
          <button className="btn btn-sm">Asignar</button></form>)}

      <h2 className="mb-2 mt-6 font-semibold text-ink">Sesiones</h2>
      <Table head={["Fecha", "Sesión", "Mentor", "Estado", "Aceptación"]} empty="Sin sesiones">
        {sessions.map((s) => <tr key={s.id}><Td>{fmtDate(s.scheduled_at)}</Td><Td><Link className="text-brand" href={`/agenda/${s.id}`}>{s.title}</Link></Td><Td>{s.mentor}</Td><Td><Badge>{s.status}</Badge></Td><Td>{s.accepted_at ? <Badge tone="green">aceptada</Badge> : "—"}</Td></tr>)}
      </Table>

      {refs.length > 0 && (<><h2 className="mb-2 mt-6 font-semibold text-ink">Remisiones a aliados</h2>
        <Table head={["Servicio", "Aliado", "Estado", "Aceptación de la empresa"]}>
          {refs.map((r) => <tr key={r.id}><Td>{r.service}</Td><Td>{r.aliado}</Td><Td><Badge>{r.status}</Badge></Td><Td>{r.accepted_at ? `${fmtDate(r.accepted_at)} · IP ${r.accepted_ip}` : "—"}</Td></tr>)}</Table></>)}

      <h2 className="mb-2 mt-6 font-semibold text-ink">Indicadores (línea base vs. resultado)</h2>
      <Table head={["Indicador", "Línea base", "Meta", "Resultado final", "Variación"]} empty="Sin indicadores">
        {inds.map((i) => <tr key={i.id}><Td>{i.name}</Td><Td>{i.baseline ?? "—"}</Td><Td>{i.goal ?? "—"}</Td><Td>{i.final ?? "—"}</Td><Td>{i.final != null && i.baseline != null ? (i.final - i.baseline).toFixed(1) : "—"}</Td></tr>)}
      </Table>
      {(can(u, "sessions.followup") || can(u, "closure.manage")) && (
        <form action={A.saveIndicator} className="card mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="company_id" value={id} />
          <Field label="Indicador"><input name="name" className="input" placeholder="Ventas mensuales" required /></Field>
          <Field label="Línea base"><input name="baseline" type="number" step="any" className="input" /></Field>
          <Field label="Meta"><input name="goal" type="number" step="any" className="input" /></Field>
          <Field label="Resultado"><input name="final" type="number" step="any" className="input" /></Field>
          <button className="btn btn-sm">Agregar</button></form>)}
      {can(u, "companies.evaluate") && (
        <form action={A.evaluateCompany} className="card mt-4 flex flex-wrap items-end gap-2"><input type="hidden" name="company_id" value={id} />
          <Field label="Evaluación"><select name="resultado" className="input"><option>Cumple</option><option>Cumple parcialmente</option><option>No cumple</option></select></Field>
          <div className="flex-1"><Field label="Observaciones"><input name="obs" className="input" /></Field></div><button className="btn btn-sm">Registrar evaluación</button></form>)}

      <section id="exportar" className="card mt-6 print:hidden">
        <h2 className="font-semibold text-ink">Exportar resultados e historial de servicios</h2>
        <p className="mb-3 text-xs text-slate-500">Servicios y remisiones, sesiones (con horas y aceptación), indicadores, mediciones y cierres de la empresa en el periodo. Excel incluye todo en hojas; CSV, la sección elegida.</p>
        <form method="get" action={`/api/empresas/${id}/exportar`} className="flex flex-wrap items-end gap-2">
          <Field label="Desde"><input type="date" name="desde" defaultValue={`${new Date().getFullYear()}-01-01`} className="input" /></Field>
          <Field label="Hasta"><input type="date" name="hasta" className="input" /></Field>
          <Field label="Formato"><select name="format" className="input"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></select></Field>
          <Field label="Sección (solo CSV)"><select name="seccion" className="input" defaultValue="sesiones"><option value="servicios">Servicios</option><option value="sesiones">Sesiones</option><option value="indicadores">Indicadores</option><option value="mediciones">Mediciones</option><option value="cierres">Cierres</option></select></Field>
          <button className="btn">Descargar</button>
        </form>
      </section>

      <h2 id="historial-cambios" className="mb-2 mt-6 font-semibold text-ink">Historial de cambios del perfil</h2>
      <p className="mb-2 text-xs text-slate-500">Quién, cuándo, el valor anterior y el nuevo de cada cambio (RF-EMP-07).</p>
      <HistorialCambios companyId={id} />

      <h2 className="mb-2 mt-6 font-semibold text-ink">Línea de tiempo del acompañamiento</h2>
      <div className="card">
        <ul className="space-y-2 border-l-2 border-slate-200 pl-4">
          {tl.slice(0, 40).map((t, i) => <li key={i} className="text-sm"><span className="text-xs text-slate-400">{fmtDate(t.at)}</span> — {t.what} {t.who && <span className="text-xs text-slate-400">({t.who})</span>}</li>)}
        </ul>
      </div>
    </>
  );
}
