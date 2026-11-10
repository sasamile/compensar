import { Lock as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { requireUser, requirePerm } from "@/lib/auth";
import { PageHeader, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";

export default async function Auditoria({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "audit.view");
  const sp = await searchParams;
  const where = ["1=1"]; const p: any[] = [];
  if (sp.usuario) { where.push("user_email LIKE ?"); p.push(`%${sp.usuario}%`); }
  if (sp.accion) { where.push("action LIKE ?"); p.push(`%${sp.accion}%`); }
  if (sp.entidad) { where.push("entity=?"); p.push(sp.entidad); }
  if (sp.desde) { where.push("ts>=?"); p.push(new Date(sp.desde + "T00:00:00-05:00").toISOString()); }
  if (sp.hasta) { where.push("ts<=?"); p.push(new Date(sp.hasta + "T23:59:59-05:00").toISOString()); }
  const rows = all<any>(`SELECT * FROM audit_log WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 200`, ...p);
  const entities = all<any>("SELECT DISTINCT entity FROM audit_log ORDER BY entity");
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as any)).toString();
  return (
    <>
      <PageHeader icon={PageIcon} title="Registro de auditoría" subtitle="Inalterable: ningún rol ni el proveedor puede editar o borrar registros" actions={<a className="btn" href={`/api/reportes/R-12?${qs}`}>Exportar Excel</a>} />
      <form className="mb-3 flex flex-wrap gap-2 text-sm">
        <input name="usuario" defaultValue={sp.usuario} placeholder="Usuario" className="input !w-44" /><input name="accion" defaultValue={sp.accion} placeholder="Acción" className="input !w-40" />
        <select name="entidad" defaultValue={sp.entidad || ""} className="input !w-auto"><option value="">Todas las entidades</option>{entities.map((e) => <option key={e.entity}>{e.entity}</option>)}</select>
        <input type="date" name="desde" defaultValue={sp.desde} className="input !w-auto" /><input type="date" name="hasta" defaultValue={sp.hasta} className="input !w-auto" /><button className="btn-ghost">Filtrar</button>
      </form>
      <Table head={["Fecha", "Usuario", "Acción", "Entidad", "Antes → Después", "IP"]}>
        {rows.map((r) => (
          <tr key={r.id}><Td className="whitespace-nowrap">{fmtDate(r.ts)}</Td><Td className="text-xs">{r.user_email || "sistema"}</Td><Td><b>{r.action}</b></Td><Td>{r.entity} <span className="text-slate-400">#{r.entity_id}</span></Td>
            <Td className="max-w-md text-xs text-slate-500"><div className="line-clamp-2 break-all">{r.before ? `${r.before.slice(0, 120)} → ` : ""}{(r.after || "").slice(0, 160)}</div></Td><Td className="text-xs">{r.ip}</Td></tr>))}
      </Table>
    </>
  );
}
