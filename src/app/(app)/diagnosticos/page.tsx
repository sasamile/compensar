import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Building2, ClipboardList, Plus, Stethoscope, Stethoscope as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, companyFilter, requireUser, type User } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader, Stat, Table, Tabs, Td } from "@/components/ui";
import { Donut, HBarChart } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { DIAG_STAGES, DIAG_STATUS, parseScoring } from "@/lib/forms";
import { assignDiagnostic, registerCompany } from "./actions";
import { recalcFormAction } from "../formularios/actions";
import { startSelfDiagnostic } from "../../f/actions";
import { canManageForm, canRecalc, nextStage } from "../formularios/server";

const stLabel = Object.fromEntries(DIAG_STATUS), stgLabel = Object.fromEntries(DIAG_STAGES);

export default async function Diagnosticos({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  if (!can(u, "diagnostics.manage") && !can(u, "diagnostics.view") && !can(u, "diagnostics.self")) redirect("/sin-acceso");
  const sp = await searchParams;
  const instruments = all<any>("SELECT * FROM forms WHERE kind='diagnostico' AND status='publicado' ORDER BY name");
  if (u.company_id && !can(u, "diagnostics.manage")) return <CompanyView u={u} sp={sp} instruments={instruments} />;

  const cf = companyFilter(u, "c");
  const where = [cf.sql]; const p: any[] = [...cf.params];
  for (const [k, col] of [["estado", "d.status"], ["etapa", "d.stage"], ["nivel", "d.level"], ["segmento", "d.segment"], ["instrumento", "d.form_id"]] as const)
    if (sp[k]) { where.push(`${col}=?`); p.push(sp[k]); }
  if (sp.empresa) { where.push("(c.razon_social LIKE ? OR c.nit LIKE ?)"); p.push(`%${sp.empresa}%`, `%${sp.empresa}%`); }
  const rows = all<any>(`SELECT d.*, c.razon_social company, c.nit, f.name form, a.name assignee
    FROM diagnostics d JOIN companies c ON c.id=d.company_id JOIN forms f ON f.id=d.form_id LEFT JOIN users a ON a.id=d.assigned_to
    WHERE ${where.join(" AND ")} ORDER BY d.id DESC LIMIT 1000`, ...p);
  const companies = all<any>(`SELECT c.id, c.razon_social, c.nit FROM companies c WHERE ${cf.sql} ORDER BY c.razon_social`, ...cf.params);
  const levels = Array.from(new Set(all<any>("SELECT scoring FROM forms WHERE kind='diagnostico'").flatMap((f) => parseScoring(f.scoring).levels.map((l) => l.name))));
  const levelColors = Object.fromEntries(all<any>("SELECT scoring FROM forms WHERE kind='diagnostico'").flatMap((f) => parseScoring(f.scoring).levels.map((l) => [l.name, l.color])));
  const segments = Array.from(new Set(rows.map((r) => r.segment).filter(Boolean)));
  const tab = ["lista", "asignar", "registrar", "instrumentos"].includes(sp.tab) ? sp.tab : "lista";
  const manage = can(u, "diagnostics.manage");
  const done = rows.filter((r) => r.score != null);
  const avg = done.length ? Math.round((done.reduce((a, r) => a + r.score, 0) / done.length) * 10) / 10 : null;
  const mentors = all<any>(`SELECT DISTINCT us.id, us.name FROM users us JOIN user_roles ur ON ur.user_id=us.id JOIN roles r ON r.id=ur.role_id
    WHERE us.status='activo' AND us.internal=1 AND (r.perms LIKE '%diagnostics.manage%' OR r.perms LIKE '%"*"%') ORDER BY us.name`);
  const tabs: [string, string][] = [["lista", "Diagnósticos"], ...(manage ? [["asignar", "Asignar diagnóstico"], ["registrar", "Registrar empresa"]] as [string, string][] : []), ["instrumentos", "Instrumentos y clasificación"]];

  return (
    <>
      <PageHeader icon={PageIcon} title="Diagnóstico empresarial" subtitle="Asignación, autodiagnóstico, resultados automáticos por dimensión y comparación inicial vs. final"
        actions={<><Link href="/diagnosticos/comparacion" className="btn-ghost"><BarChart3 className="h-4 w-4" />Comparar inicial vs. final</Link>
          {manage && <Link href="/diagnosticos?tab=asignar" className="btn"><Plus className="h-4 w-4" />Asignar diagnóstico</Link>}</>} />
      <Flash sp={sp} />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Stat label="Diagnósticos" value={rows.length} hint={`${rows.filter((r) => r.status === "completado").length} completados`} />
        <Stat label="Pendientes" value={rows.filter((r) => r.status === "asignado" || r.status === "en_curso").length} hint="asignados o en curso" />
        <Stat label="Puntaje promedio" value={avg ?? "—"} hint="0 a 100" />
        <div className="card">
          {done.length ? <Donut size={110} label="Empresas por nivel" data={levels.map((l) => ({ label: l, value: done.filter((r) => r.level === l).length, color: levelColors[l] })).filter((x) => x.value)} /> : <span className="text-sm text-slate-400">Sin resultados aún</span>}
        </div>
      </div>
      <Tabs tabs={tabs} active={tab} base="/diagnosticos" />

      {tab === "lista" && (
        <>
          <form className="mb-3 flex flex-wrap gap-2 text-sm" role="search">
            <input type="hidden" name="tab" value="lista" />
            <input name="empresa" defaultValue={sp.empresa} placeholder="Empresa o NIT" className="input !w-48" aria-label="Empresa o NIT" />
            <select name="estado" defaultValue={sp.estado || ""} className="input !w-auto" aria-label="Estado"><option value="">Todos los estados</option>{DIAG_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select name="etapa" defaultValue={sp.etapa || ""} className="input !w-auto" aria-label="Etapa"><option value="">Todas las etapas</option>{DIAG_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select name="nivel" defaultValue={sp.nivel || ""} className="input !w-auto" aria-label="Nivel"><option value="">Todos los niveles</option>{levels.map((l) => <option key={l}>{l}</option>)}</select>
            {segments.length > 0 && <select name="segmento" defaultValue={sp.segmento || ""} className="input !w-auto" aria-label="Segmento"><option value="">Todos los segmentos</option>{segments.map((l) => <option key={l}>{l}</option>)}</select>}
            {instruments.length > 1 && <select name="instrumento" defaultValue={sp.instrumento || ""} className="input !w-auto" aria-label="Instrumento"><option value="">Todos los instrumentos</option>{instruments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
            <button className="btn-ghost">Filtrar</button>
          </form>
          {rows.length === 0 ? <EmptyState title="No hay diagnósticos en tu alcance" action={manage && <Link className="btn" href="/diagnosticos?tab=asignar">Asignar el primero</Link>}>Asigna un diagnóstico a una empresa o registra una empresa nueva para iniciarlo.</EmptyState> : (
            <Table head={["Empresa", "Instrumento", "Etapa", "Estado", "Puntaje", "Nivel", "Segmento", "Responsable", "Actualizado", ""]}>
              {rows.map((d) => (
                <tr key={d.id}>
                  <Td><b>{d.company}</b><div className="text-xs text-slate-400">NIT {d.nit}</div></Td>
                  <Td className="text-xs">{d.form}</Td>
                  <Td>{stgLabel[d.stage] || d.stage}</Td>
                  <Td><Badge>{d.status}</Badge></Td>
                  <Td><b>{d.score ?? "—"}</b></Td>
                  <Td>{d.level ? <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: levelColors[d.level] || "#64748b" }}>{d.level}</span> : "—"}</Td>
                  <Td className="text-xs">{d.segment || "—"}</Td>
                  <Td className="text-xs">{d.assignee || "Autodiagnóstico"}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(d.completed_at || d.created_at, false)}</Td>
                  <Td><Link className="text-brand" href={`/diagnosticos/${d.id}`}>{d.status === "asignado" || d.status === "en_curso" ? "Abrir" : "Ver resultado"}</Link></Td>
                </tr>))}
            </Table>)}
          {done.length > 0 && (
            <div className="card mt-6">
              <h2 className="mb-3 text-sm font-semibold text-ink">Clasificación por segmento</h2>
              <HBarChart data={Array.from(new Set(done.map((r) => r.segment || "Sin segmento"))).map((sg) => ({ label: sg, value: done.filter((r) => (r.segment || "Sin segmento") === sg).length }))} />
            </div>)}
        </>)}

      {tab === "asignar" && manage && (
        instruments.length === 0 ? <EmptyState title="No hay instrumentos publicados">Un Gestor de Contenidos debe crear y publicar un formulario de tipo «Diagnóstico» en Formularios.</EmptyState> : (
          <form action={assignDiagnostic} className="card grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><h2 className="font-semibold text-ink">Asignar diagnóstico a una empresa</h2>
              <p className="text-sm text-slate-500">La empresa recibe una notificación y puede diligenciarlo desde su cuenta. También puedes diligenciarlo con ella (asistido).</p></div>
            <div className="md:col-span-2"><Field label="Empresa *"><select name="company_id" required className="input"><option value="">Selecciona…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social} · NIT {c.nit}</option>)}</select></Field></div>
            <Field label="Instrumento *"><select name="form_id" className="input">{instruments.map((f) => <option key={f.id} value={f.id}>{f.name} (v{f.version})</option>)}</select></Field>
            <Field label="Etapa"><select name="stage" className="input"><option value="">Automática (inicial → final → seguimiento)</option>{DIAG_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Responsable"><select name="assigned_to" className="input" defaultValue={u.id}>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <div className="flex items-end"><button className="btn"><ClipboardList className="h-4 w-4" />Asignar</button></div>
            {companies.length === 0 && <p className="text-sm text-amber-700 md:col-span-2">No tienes empresas en tu alcance. Usa «Registrar empresa».</p>}
          </form>))}

      {tab === "registrar" && manage && (
        <form action={registerCompany} className="card grid max-w-3xl gap-4 md:grid-cols-6">
          <div className="md:col-span-6"><h2 className="font-semibold text-ink"><Building2 className="mr-1 inline h-4 w-4" />Registrar empresa para iniciar diagnóstico</h2>
            <p className="text-sm text-slate-500">Se valida el NIT con su dígito de verificación. Si el NIT ya existe no se crea un duplicado: se usa el registro existente.</p></div>
          <div className="md:col-span-6"><Field label="Razón social *"><input name="razon_social" required minLength={3} className="input" /></Field></div>
          <div className="md:col-span-3"><Field label="NIT (sin DV) *"><input name="nit" required inputMode="numeric" pattern="\d{6,15}" className="input" placeholder="900111222" /></Field></div>
          <div className="md:col-span-1"><Field label="DV *"><input name="dv" required inputMode="numeric" pattern="\d" maxLength={1} className="input" /></Field></div>
          <div className="md:col-span-2"><Field label="Sector"><input name="sector" className="input" /></Field></div>
          <div className="md:col-span-2"><Field label="Tamaño"><select name="size" className="input"><option value="">—</option><option>Micro</option><option>Pequeña</option><option>Mediana</option><option>Grande</option></select></Field></div>
          <div className="md:col-span-2"><Field label="Ciudad"><input name="city" className="input" /></Field></div>
          <div className="md:col-span-2"><Field label="Programa"><select name="program_id" className="input">{all<any>("SELECT id,name FROM programs WHERE status='activo'").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
          <div className="md:col-span-3"><Field label="Iniciar diagnóstico con"><select name="form_id" className="input"><option value="">Solo registrar la empresa</option>{instruments.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field></div>
          <div className="md:col-span-3"><Field label="Etapa"><select name="stage" className="input">{DIAG_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
          <div className="md:col-span-6"><button className="btn">Registrar y continuar</button></div>
        </form>)}

      {tab === "instrumentos" && <Instruments u={u} />}
    </>
  );
}

function Instruments({ u }: { u: User }) {
  const forms = all<any>(`SELECT f.*, (SELECT COUNT(*) FROM diagnostics d WHERE d.form_id=f.id) n,
    (SELECT COUNT(*) FROM form_responses r WHERE r.form_id=f.id AND r.status<>'borrador') enviados FROM forms f WHERE f.kind='diagnostico' ORDER BY f.status, f.name`);
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">Los instrumentos se crean en <Link className="text-brand underline" href="/formularios">Formularios</Link> (tipo «Diagnóstico»): preguntas con puntaje por opción, pesos por pregunta y por dimensión, niveles y segmentos. Si cambian las reglas de clasificación, recalcula para reclasificar a las empresas.</p>
      <Table head={["Instrumento", "Estado", "Versión", "Niveles", "Diagnósticos", ""]} empty="No hay instrumentos de diagnóstico">
        {forms.map((f) => (
          <tr key={f.id}>
            <Td><Stethoscope className="mr-1 inline h-4 w-4 text-slate-400" /><b>{f.name}</b></Td>
            <Td><Badge>{f.status}</Badge></Td><Td>{f.version ? `v${f.version}` : "—"}</Td>
            <Td className="text-xs">{parseScoring(f.scoring).levels.map((l) => `${l.name} (${l.min}–${l.max})`).join(" · ")}</Td>
            <Td>{f.n}</Td>
            <Td className="whitespace-nowrap">
              {canManageForm(u, f) && <Link className="text-brand" href={`/formularios/${f.id}?tab=clasificacion`}>Editar reglas</Link>}
              {canRecalc(u, f) && f.enviados > 0 && (
                <form action={recalcFormAction} className="ml-2 inline"><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value="/diagnosticos?tab=instrumentos" />
                  <button className="text-brand underline">Recalcular clasificación</button></form>)}
            </Td>
          </tr>))}
      </Table>
    </>
  );
}

/** Vista de la empresa: su diagnóstico, autodiagnóstico y comparación (RF-DIA-04/08). */
function CompanyView({ u, sp, instruments }: { u: User; sp: any; instruments: any[] }) {
  const rows = all<any>(`SELECT d.*, f.name form FROM diagnostics d JOIN forms f ON f.id=d.form_id WHERE d.company_id=? ORDER BY d.id DESC`, u.company_id);
  const pending = rows.filter((r) => r.status === "asignado" || r.status === "en_curso");
  return (
    <>
      <PageHeader title="Mi diagnóstico" subtitle="Conoce el nivel de madurez de tu empresa por dimensión y recibe recomendaciones"
        actions={<><Link href="/diagnosticos/comparacion" className="btn-ghost"><BarChart3 className="h-4 w-4" />Comparar resultados</Link><Link href="/mis-formularios" className="btn-ghost">Mis formularios</Link></>} />
      <Flash sp={sp} />
      {pending.map((d) => (
        <div key={d.id} className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <div className="flex-1"><b>{d.form}</b> · etapa {stgLabel[d.stage]} · {d.status === "en_curso" ? "en curso (tu avance está guardado)" : "pendiente por diligenciar"}</div>
          <Link href={`/diagnosticos/${d.id}`} className="btn btn-sm">{d.status === "en_curso" ? "Continuar" : "Empezar"}</Link>
        </div>))}
      {can(u, "diagnostics.self") && instruments.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-ink">Hacer un autodiagnóstico</h2>
          <p className="mb-3 text-sm text-slate-500">Respóndelo a tu ritmo: se guarda automáticamente y al enviarlo verás tu puntaje, nivel y recomendaciones.</p>
          <div className="flex flex-wrap gap-3">
            {instruments.map((f) => (
              <form key={f.id} action={startSelfDiagnostic} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
                <input type="hidden" name="form_id" value={f.id} />
                <div><div className="text-sm font-medium">{f.name}</div>
                  <select name="stage" aria-label="Etapa" className="input mt-1 !py-1 text-sm" defaultValue={nextStage(u.company_id!, f.id)}>{DIAG_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <button className="btn btn-sm">Iniciar</button>
              </form>))}
          </div>
        </div>)}
      <Table head={["Instrumento", "Etapa", "Estado", "Puntaje", "Nivel", "Fecha", ""]} empty="Aún no tienes diagnósticos">
        {rows.map((d) => (
          <tr key={d.id}><Td>{d.form}</Td><Td>{stgLabel[d.stage]}</Td><Td><Badge>{d.status}</Badge></Td><Td><b>{d.score ?? "—"}</b></Td><Td>{d.level || "—"}</Td>
            <Td className="text-xs">{fmtDate(d.completed_at || d.created_at, false)}</Td>
            <Td><Link className="text-brand" href={`/diagnosticos/${d.id}`}>{d.score != null ? "Ver resultado" : "Abrir"}</Link></Td></tr>))}
      </Table>
    </>
  );
}
