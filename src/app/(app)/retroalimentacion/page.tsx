import { all, get } from "@/lib/db";
import { can, requireUser, requirePerm } from "@/lib/auth";
import { Badge, Flash, PageHeader, Stat, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import { MessageSquare, AlertCircle, Lightbulb, CheckCircle2, MessageSquarePlus as PageIcon } from "lucide-react";
import { updateFeedback } from "./actions";
import { FEEDBACK_KINDS_PUBLIC as FEEDBACK_KINDS } from "@/lib/feedback-kinds";

const TONE: Record<string, string> = { error: "red", mejora: "blue", duda: "amber", positivo: "green", requisito: "violet" };

export default async function Retroalimentacion({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "config.manage");
  const sp = await searchParams;
  const where = ["1=1"]; const p: any[] = [];
  if (sp.tipo) { where.push("kind=?"); p.push(sp.tipo); }
  if (sp.estado) { where.push("status=?"); p.push(sp.estado); }
  if (sp.q) { where.push("(message LIKE ? OR page LIKE ? OR user_name LIKE ?)"); p.push(`%${sp.q}%`, `%${sp.q}%`, `%${sp.q}%`); }
  const rows = all<any>(`SELECT * FROM feedback WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 300`, ...p);
  const n = (sql: string) => get<any>(sql)?.n ?? 0;
  const avg = get<any>("SELECT ROUND(AVG(rating),1) a FROM feedback WHERE rating IS NOT NULL")?.a;
  const byPage = all<any>("SELECT page, COUNT(*) n FROM feedback GROUP BY page ORDER BY n DESC LIMIT 5");
  return (
    <>
      <PageHeader icon={PageIcon} title="Retroalimentación de los probadores" subtitle="Comentarios escritos desde el botón «Comentarios» de cada pantalla"
        actions={<a href={`/api/retroalimentacion/export?${new URLSearchParams(sp as any).toString()}`} className="btn-ghost">Descargar Excel</a>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={MessageSquare} label="Comentarios" value={n("SELECT COUNT(*) n FROM feedback")} hint={`${n("SELECT COUNT(*) n FROM feedback WHERE status='nuevo'")} sin revisar`} />
        <Stat icon={AlertCircle} tone="red" label="Algo no funciona" value={n("SELECT COUNT(*) n FROM feedback WHERE kind='error' AND status!='resuelto'")} hint="abiertos" />
        <Stat icon={Lightbulb} tone="amber" label="Sugerencias y requisitos" value={n("SELECT COUNT(*) n FROM feedback WHERE kind IN ('mejora','requisito')")} />
        <Stat icon={CheckCircle2} tone="green" label="Facilidad promedio" value={avg ? `${avg} / 5` : "—"} hint="calificación de las pantallas" />
      </div>
      {byPage.length > 0 && <p className="mt-4 text-sm text-slate-500">Pantallas con más comentarios: {byPage.map((x) => <code key={x.page} className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{x.page} ({x.n})</code>)}</p>}
      <form className="my-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Buscar en comentarios, pantalla o persona" className="input !w-72" />
        <select name="tipo" defaultValue={sp.tipo || ""} className="input !w-auto"><option value="">Todos los tipos</option>{Object.entries(FEEDBACK_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="estado" defaultValue={sp.estado || ""} className="input !w-auto"><option value="">Todos los estados</option><option value="nuevo">nuevo</option><option value="en_revision">en revisión</option><option value="resuelto">resuelto</option><option value="descartado">descartado</option></select>
        <button className="btn-ghost">Filtrar</button>
      </form>
      <Table head={["Fecha", "Quién", "Pantalla", "Comentario", "Estado y notas"]} empty="Aún no hay comentarios. Pídele a los probadores que usen el botón «Comentarios» de la barra superior.">
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</Td>
            <Td><b className="text-sm">{r.user_name}</b><div className="text-xs text-slate-400">{r.roles}</div></Td>
            <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.page}</code></Td>
            <Td className="max-w-md"><div className="mb-1 flex items-center gap-2"><Badge tone={TONE[r.kind]}>{FEEDBACK_KINDS[r.kind] || r.kind}</Badge>{r.rating ? <span className="text-xs text-amber-600">{"★".repeat(r.rating)}<span className="text-slate-300">{"★".repeat(5 - r.rating)}</span></span> : null}</div><p className="whitespace-pre-line text-sm">{r.message}</p></Td>
            <Td>
              <form action={updateFeedback} className="space-y-1.5"><input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className="input !py-1 text-xs"><option value="nuevo">nuevo</option><option value="en_revision">en revisión</option><option value="resuelto">resuelto</option><option value="descartado">descartado</option></select>
                <input name="note" defaultValue={r.note || ""} placeholder="Nota interna" className="input !py-1 text-xs" />
                <button className="btn-ghost btn-sm">Guardar</button></form>
            </Td>
          </tr>))}
      </Table>
    </>
  );
}
