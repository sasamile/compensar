import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Video, Link2, Wrench, Search, Download, ExternalLink } from "lucide-react";
import { all, get } from "@/lib/db";
import { can, programScope, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Field, Flash, PageHeader, Section } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import * as A from "./actions";

const KIND: Record<string, { label: string; icon: any; tone: string }> = {
  documento: { label: "Documento / guía", icon: FileText, tone: "blue" }, video: { label: "Video", icon: Video, tone: "red" },
  enlace: { label: "Enlace / base de conocimiento", icon: Link2, tone: "violet" }, herramienta: { label: "Herramienta / plantilla", icon: Wrench, tone: "green" },
};

export default async function Biblioteca({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  const manage = can(u, "library.manage");
  if (!manage && !can(u, "library.view")) redirect("/sin-acceso");
  const sp = await searchParams;
  const where: string[] = [];
  const params: any[] = [];
  if (!(manage && sp.inactivos === "1")) where.push("ct.active=1");
  // la empresa ve los contenidos generales y los de su programa
  if (u.company_id) { where.push("(ct.program_id IS NULL OR ct.program_id=(SELECT program_id FROM companies WHERE id=?))"); params.push(u.company_id); }
  if (Number(sp.program)) { where.push("ct.program_id=?"); params.push(Number(sp.program)); }
  if (Number(sp.servicio)) { where.push("ct.servicio_id=?"); params.push(Number(sp.servicio)); }
  if (KIND[sp.kind]) { where.push("ct.kind=?"); params.push(sp.kind); }
  const q = String(sp.q ?? "").trim();
  if (q) {
    for (const w of q.toLowerCase().split(/\s+/).slice(0, 5)) {
      where.push("LOWER(ct.title || ' ' || COALESCE(ct.description,'') || ' ' || COALESCE(ct.tags,'') || ' ' || COALESCE(sv.name,'')) LIKE ?");
      params.push(`%${w}%`);
    }
  }
  const items = all<any>(`SELECT ct.*, p.name program, sv.name service, d.name doc_name, us.name author FROM contents ct LEFT JOIN programs p ON p.id=ct.program_id
    LEFT JOIN servicios sv ON sv.id=ct.servicio_id LEFT JOIN documents d ON d.id=ct.doc_id LEFT JOIN users us ON us.id=ct.created_by
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ct.active DESC, ct.created_at DESC`, ...params);
  const programs = all<any>("SELECT id, name FROM programs ORDER BY name");
  const servicios = all<any>("SELECT sv.id, sv.name, p.name program, sv.program_id FROM servicios sv LEFT JOIN programs p ON p.id=sv.program_id ORDER BY p.name, sv.name");
  const editing = manage && Number(sp.edit) ? get<any>("SELECT * FROM contents WHERE id=?", Number(sp.edit)) : null;
  const scope = programScope(u, "library.manage");
  const progOpts = programs.filter((p) => scope === null || scope.includes(p.id));
  const servOpts = servicios.filter((s) => scope === null || scope.includes(s.program_id));
  return (
    <>
      <PageHeader eyebrow="Gestión de servicios" title="Biblioteca de contenidos"
        subtitle="Guías, herramientas, videos y base de conocimiento para empresarios, mentores y consultores, organizados por programa y servicio." />
      <Flash sp={sp} />
      <form method="get" className="card mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2"><Field label="Buscar"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="Título, tema o etiqueta (p. ej. flujo de caja)" /></div></Field></div>
        <Field label="Programa"><select name="program" defaultValue={sp.program ?? ""} className="input"><option value="">Todos</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Servicio"><select name="servicio" defaultValue={sp.servicio ?? ""} className="input"><option value="">Todos</option>{servicios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Tipo"><select name="kind" defaultValue={sp.kind ?? ""} className="input"><option value="">Todos</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
          <button className="btn">Buscar</button><Link className="btn-ghost" href="/biblioteca">Limpiar</Link>
          {manage && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="inactivos" value="1" defaultChecked={sp.inactivos === "1"} />Incluir retirados</label>}
          <span className="ml-auto text-sm text-slate-500">{items.length} resultado(s)</span>
        </div>
      </form>

      {!items.length ? <EmptyState title="No encontramos contenidos">Prueba con otra palabra o quita filtros.</EmptyState> : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => { const K = KIND[c.kind] ?? KIND.documento; return (
            <li key={c.id} className={`card flex flex-col ${c.active ? "" : "opacity-60"}`}>
              <div className="mb-2 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><K.icon className="h-5 w-5" aria-hidden /></div>
                <div className="min-w-0"><h2 className="font-semibold leading-snug text-ink">{c.title}</h2><div className="mt-0.5 flex flex-wrap gap-1"><Badge tone={K.tone} dot={false}>{K.label}</Badge>{!c.active && <Badge tone="slate">retirado</Badge>}</div></div>
              </div>
              {c.description && <p className="text-sm text-slate-600">{c.description}</p>}
              <div className="mt-2 text-xs text-slate-500">{c.program ?? "Todos los programas"}{c.service ? ` · ${c.service}` : ""}</div>
              {c.tags && <div className="mt-2 flex flex-wrap gap-1">{String(c.tags).split(",").map((t: string) => t.trim()).filter(Boolean).map((t: string) => <Link key={t} href={`/biblioteca?q=${encodeURIComponent(t)}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 no-underline hover:bg-slate-200">#{t}</Link>)}</div>}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                {c.doc_id ? <a className="btn btn-sm" href={`/api/operacion/doc/${c.doc_id}`}><Download className="h-3.5 w-3.5" />Descargar</a>
                  : c.url ? <a className="btn btn-sm" href={c.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />{c.kind === "video" ? "Ver video" : "Abrir"}</a> : null}
                {manage && <>
                  <Link className="btn-ghost btn-sm" href={`/biblioteca?edit=${c.id}#editar`}>Editar</Link>
                  <form action={A.toggleContent}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost btn-sm">{c.active ? "Retirar" : "Publicar"}</button></form>
                </>}
                <span className="ml-auto text-[11px] text-slate-400">{fmtDate(c.created_at, false)}</span>
              </div>
            </li>); })}
        </ul>)}

      {manage && (
        <Section title={editing ? `Editar «${editing.title}»` : "Publicar contenido"} subtitle="Sube un archivo (se guarda en OnBase) o indica un enlace o video. Los contenidos se filtran por programa y servicio.">
          <form id="editar" action={editing ? A.updateContent : A.createContent} className="card grid gap-3 md:grid-cols-3" key={editing?.id ?? "nuevo"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Título *"><input name="title" required minLength={3} defaultValue={editing?.title} className="input" /></Field>
            <Field label="Tipo"><select name="kind" defaultValue={editing?.kind ?? "documento"} className="input">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            <Field label="Etiquetas" hint="Separadas por coma"><input name="tags" defaultValue={editing?.tags ?? ""} className="input" placeholder="ventas, costos, base de conocimiento" /></Field>
            <Field label="Programa">{/* vacío = todos */}<select name="program_id" defaultValue={editing?.program_id ?? ""} className="input">{scope === null && <option value="">Todos los programas</option>}{progOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Servicio (opcional)"><select name="servicio_id" defaultValue={editing?.servicio_id ?? ""} className="input"><option value="">—</option>{servOpts.map((s) => <option key={s.id} value={s.id}>{s.program} · {s.name}</option>)}</select></Field>
            <Field label="Enlace o video (https://…)"><input name="url" type="url" defaultValue={editing?.url ?? ""} className="input" placeholder="https://" /></Field>
            <div className="md:col-span-2"><Field label="Descripción"><textarea name="description" rows={2} defaultValue={editing?.description ?? ""} className="input" /></Field></div>
            <Field label={editing?.doc_id ? "Reemplazar archivo" : "Archivo (pdf, docx, xlsx, pptx, jpg, png · ≤20 MB)"}><input type="file" name="file" accept=".pdf,.xlsx,.xls,.doc,.docx,.pptx,.jpg,.jpeg,.png" className="block w-full text-xs" /></Field>
            <div className="flex gap-2 md:col-span-3"><button className="btn">{editing ? "Guardar cambios" : "Publicar"}</button>{editing && <Link className="btn-ghost" href="/biblioteca">Cancelar</Link>}</div>
          </form>
        </Section>)}
    </>
  );
}
