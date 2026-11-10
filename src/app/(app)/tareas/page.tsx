import Link from "next/link";
import { ListChecks, AlarmClock, UserRound, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { all } from "@/lib/db";
import { companyFilter, programScope, requirePerm, requireUser } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Section, Stat, Table, Td } from "@/components/ui";
import { fmtDate, isoToLocal } from "@/lib/util";
import { assignees, taskFilter } from "./scope";
import * as A from "./actions";

const LABEL: Record<string, string> = { pendiente: "pendiente", en_curso: "en curso", hecha: "hecha" };

export default async function Tareas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "tasks.manage");
  const sp = await searchParams;
  const f = taskFilter(u);
  const ts = new Date().toISOString();
  const all_ = all<any>(`SELECT t.*, c.razon_social, a.name assignee, cb.name creator, d.name doc_name FROM tasks t LEFT JOIN companies c ON c.id=t.company_id
    LEFT JOIN users a ON a.id=t.assignee_id LEFT JOIN users cb ON cb.id=t.created_by LEFT JOIN documents d ON d.id=t.evidence_doc_id
    WHERE ${f.sql} ORDER BY t.status='hecha', t.due_at`, ...f.params);
  const overdue = (t: any) => t.status !== "hecha" && t.due_at && t.due_at < ts;
  const view = ["vencidas", "hechas", "todas", "mias"].includes(sp.ver) ? sp.ver : "abiertas";
  const list = all_.filter((t) => view === "todas" ? true : view === "hechas" ? t.status === "hecha" : view === "vencidas" ? overdue(t) : view === "mias" ? t.assignee_id === u.id && t.status !== "hecha" : t.status !== "hecha")
    .filter((t) => !Number(sp.company) || t.company_id === Number(sp.company));
  const cf = companyFilter(u, "c");
  const companies = all<any>(`SELECT c.id, c.razon_social FROM companies c WHERE c.status='activa' AND ${cf.sql} ORDER BY c.razon_social`, ...cf.params);
  const ps = programScope(u, "tasks.manage");
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name").filter((p) => ps === null || ps.includes(p.id));
  const people = assignees(u);
  const month = ts.slice(0, 7);
  return (
    <>
      <PageHeader eyebrow="Operación" title="Tareas y actividades" subtitle="Registra tareas operativas con responsable, vencimiento y evidencias. Las tareas vencidas generan una alerta en el tablero de seguimiento."
        actions={<a className="btn-ghost btn-sm" href="/api/operacion/tareas"><FileSpreadsheet className="h-4 w-4" />Exportar Excel</a>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Abiertas" value={all_.filter((t) => t.status !== "hecha").length} icon={ListChecks} />
        <Stat label="Vencidas" value={all_.filter(overdue).length} icon={AlarmClock} tone="red" hint="generan alerta" />
        <Stat label="Asignadas a mí" value={all_.filter((t) => t.assignee_id === u.id && t.status !== "hecha").length} icon={UserRound} tone="violet" />
        <Stat label="Terminadas este mes" value={all_.filter((t) => t.status === "hecha" && (t.done_at ?? "").startsWith(month)).length} icon={CheckCircle2} tone="green" />
      </div>
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        {[["abiertas", "Abiertas"], ["mias", "Mías"], ["vencidas", "Vencidas"], ["hechas", "Terminadas"], ["todas", "Todas"]].map(([k, l]) => (
          <Link key={k} href={`/tareas?ver=${k}${sp.company ? `&company=${sp.company}` : ""}`} aria-current={view === k ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm no-underline ${view === k ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>))}
        <form method="get" className="ml-auto flex items-center gap-2"><input type="hidden" name="ver" value={view} />
          <label className="sr-only" htmlFor="fcompany">Empresa</label>
          <select id="fcompany" name="company" defaultValue={sp.company ?? ""} className="input !w-auto"><option value="">Todas las empresas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select>
          <button className="btn-ghost btn-sm">Filtrar</button></form>
      </div>
      <Table head={["Tarea", "Empresa", "Responsable", "Vence", "Estado", "Evidencia", "Acciones"]} empty="No hay tareas en esta vista">
        {list.map((t) => (
          <tr key={t.id} className={overdue(t) ? "bg-red-50/40" : ""}>
            <Td><span className="font-medium">{t.title}</span>{t.description && <div className="max-w-xs text-xs text-slate-500">{t.description}</div>}<div className="text-[11px] text-slate-400">creada por {t.creator}</div></Td>
            <Td>{t.razon_social ?? <span className="text-slate-400">General</span>}</Td><Td>{t.assignee}</Td>
            <Td className="whitespace-nowrap text-xs">{fmtDate(t.due_at)}{overdue(t) && <div><Badge tone="red">vencida</Badge></div>}</Td>
            <Td><Badge tone={t.status === "hecha" ? "green" : t.status === "en_curso" ? "blue" : "amber"}>{LABEL[t.status] ?? t.status}</Badge>{t.done_at && <div className="text-[11px] text-slate-400">{fmtDate(t.done_at, false)}</div>}</Td>
            <Td className="text-xs">
              {t.evidence_doc_id ? <a className="text-brand" href={`/api/operacion/doc/${t.evidence_doc_id}`}>📎 {t.doc_name}</a> : <span className="text-slate-300">—</span>}
              <form action={A.uploadTaskEvidence} className="mt-1 flex items-center gap-1"><input type="hidden" name="id" value={t.id} />
                <label className="sr-only" htmlFor={`ev${t.id}`}>Archivo de evidencia</label><input id={`ev${t.id}`} type="file" name="file" required className="w-36 text-[11px]" /><button className="btn-ghost btn-sm">Subir</button></form>
            </Td>
            <Td>
              <form action={A.setTaskStatus} className="flex items-center gap-1"><input type="hidden" name="id" value={t.id} />
                <label className="sr-only" htmlFor={`st${t.id}`}>Estado</label>
                <select id={`st${t.id}`} name="status" defaultValue={t.status} className="input !w-auto !py-1 text-xs">{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <button className="btn-ghost btn-sm">Guardar</button></form>
            </Td>
          </tr>))}
      </Table>

      <Section title="Nueva tarea o actividad">
        <form action={A.createTask} className="card grid gap-3 md:grid-cols-3">
          <Field label="Título *"><input name="title" required minLength={3} className="input" placeholder="p. ej. Enviar plantilla de costos" /></Field>
          <Field label="Responsable"><select name="assignee_id" defaultValue={u.id} className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></Field>
          <Field label="Vence *"><input type="datetime-local" name="due_at" required defaultValue={isoToLocal(new Date(Date.now() + 7 * 86400000).toISOString())} className="input" /></Field>
          <Field label="Empresa (opcional)"><select name="company_id" className="input"><option value="">Tarea general</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}</select></Field>
          <Field label="Programa (si es general)"><select name="program_id" className="input"><option value="">—</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Descripción"><input name="description" className="input" /></Field>
          <div><button className="btn">Registrar tarea</button></div>
        </form>
      </Section>
    </>
  );
}
