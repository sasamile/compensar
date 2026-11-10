import { Contact as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, requireUser, requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { jparse } from "@/lib/util";

export default async function Directorio({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "directory.view");
  const sp = await searchParams;
  const q = String(sp.q || "").toLowerCase();
  // Los campos ocultos no aparecen ni en las búsquedas (RF-EMP-08): se filtra sobre los campos visibles.
  const cos = all<any>("SELECT * FROM companies WHERE status='activa' ORDER BY razon_social").map((c) => {
    const vis = jparse<string[]>(c.visible_fields, []);
    const pub: any = {}; for (const k of ["razon_social", "sector", "city", "value_prop", "social"]) if (vis.includes(k)) pub[k] = c[k];
    return { id: c.id, ...pub };
  }).filter((c) => !q || Object.values(c).join(" ").toLowerCase().includes(q));
  const consultants = all<any>(`SELECT DISTINCT u.name, a.name aliado FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id LEFT JOIN aliados a ON a.id=u.aliado_id WHERE r.key='mentor' AND u.status='activo'`)
    .filter((m) => !q || (m.name + (m.aliado || "")).toLowerCase().includes(q));
  return (
    <>
      <PageHeader icon={PageIcon} title="Directorio de perfiles" subtitle="Empresas y consultores activos" />
      <form className="mb-4"><input name="q" defaultValue={sp.q} placeholder="Buscar…" className="input max-w-sm" /></form>
      <h2 className="mb-2 font-semibold text-ink">Empresas</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {cos.map((c: any) => (
          <div key={c.id} className="card !p-4">
            <b className="text-ink">{c.razon_social || "Empresa (nombre oculto)"}</b>
            <div className="text-xs text-slate-400">{[c.sector, c.city].filter(Boolean).join(" · ")}</div>
            {c.value_prop && <p className="mt-1 text-sm text-slate-600">{c.value_prop}</p>}
            {c.social && <a href={c.social} target="_blank" className="mt-1 block text-xs text-brand">{c.social}</a>}
          </div>))}
      </div>
      <h2 className="mb-2 mt-6 font-semibold text-ink">Consultores y mentores</h2>
      <div className="grid gap-3 md:grid-cols-3">{consultants.map((m, i) => <div key={i} className="card !p-3 text-sm"><b>{m.name}</b><div className="text-xs text-slate-400">{m.aliado || "Compensar"}</div></div>)}</div>
    </>
  );
}
