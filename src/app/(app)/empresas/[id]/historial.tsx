import { all } from "@/lib/db";
import { fmtDate, jparse } from "@/lib/util";

/**
 * Historial de cambios del perfil (RF-EMP-07): cada entrada de auditoría de la empresa con quién, cuándo,
 * y el diff campo por campo (valor anterior → nuevo).
 */
const LABEL: Record<string, string> = {
  razon_social: "Razón social", nit: "NIT", dv: "DV", sector: "Sector", size: "Tamaño", city: "Ciudad", program_id: "Programa", status: "Estado",
  value_prop: "Propuesta de valor", social: "Redes sociales / sitio", visible_fields: "Campos visibles en el directorio", onboarding_done: "Primer ingreso completado",
  consent_at: "Autorización de datos", mentor_id: "Mentor", label: "Asignado", resultado: "Resultado", observaciones: "Observaciones", estado: "Estado",
  afiliado: "Afiliada a Compensar", meses_afiliacion: "Meses de afiliación", al_dia_parafiscales: "Al día en parafiscales", aportes_meses_3a: "Meses de aportes (3 años)",
  ventas_brutas: "Ventas brutas (COP)", inscrito_agencia: "Inscrita en la Agencia de Empleo", cesante: "Cesante", fuente: "Fuente", motivo: "Motivo",
};
const ACTION: Record<string, string> = {
  editar_perfil: "Editó el perfil", crear: "Creó la empresa", crear_cargue_masivo: "Creó la empresa (cargue masivo)", activar: "Activó la empresa", suspender: "Suspendió la empresa",
  cambiar_estado: "Cambió el estado", asignar_mentor: "Asignó mentor", reasignar_mentor: "Reasignó mentor", evaluar: "Registró evaluación",
  sincronizar_gestion_clientes: "Sincronizó con Gestión de Clientes",
};
const SKIP = new Set(["id", "created_at", "updated_at", "fuente"]);
const BOOL = new Set(["afiliado", "al_dia_parafiscales", "inscrito_agencia", "cesante", "onboarding_done"]);
const NOT_CHANGES = new Set(["exportar_historial"]);

export function diffOf(before: any, after: any, names: Record<number, string> = {}) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const show = (k: string, v: any): string => {
    if (v == null || v === "") return "—";
    if (k === "visible_fields") return jparse<string[]>(v, []).map((x) => LABEL[x] ?? x).join(", ") || "ninguno";
    if (k === "mentor_id") return names[v] ?? `#${v}`;
    if (BOOL.has(k)) return Number(v) ? "Sí" : "No";
    if (k === "ventas_brutas" && !isNaN(Number(v))) return Number(v).toLocaleString("es-CO");
    if (/_at$/.test(k)) return fmtDate(String(v));
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => !SKIP.has(k) && JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null) && (k in a || before))
    .map((k) => ({ field: LABEL[k] ?? k.replace(/_/g, " "), before: k in b ? show(k, b[k]) : "—", after: k in a ? show(k, a[k]) : "—" }));
}

export function HistorialCambios({ companyId }: { companyId: number }) {
  const rows = all<any>("SELECT * FROM audit_log WHERE entity='company' AND entity_id=? ORDER BY id DESC LIMIT 100", String(companyId))
    .filter((r) => !NOT_CHANGES.has(r.action));
  const ids = new Set<number>();
  rows.forEach((r) => [jparse<any>(r.before, {})?.mentor_id, jparse<any>(r.after, {})?.mentor_id].forEach((x) => x && ids.add(Number(x))));
  const names: Record<number, string> = Object.fromEntries(ids.size ? all<any>(`SELECT id, name FROM users WHERE id IN (${[...ids].map(() => "?").join(",")})`, ...ids).map((x) => [x.id, x.name]) : []);
  const entries = rows.map((r) => ({ ...r, diff: diffOf(jparse(r.before, null), jparse(r.after, null), names) })).filter((r) => r.diff.length || r.action !== "editar_perfil");

  if (!entries.length) return <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">Aún no hay cambios registrados en el perfil.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="card !py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-ink">{ACTION[e.action] ?? e.action.replace(/_/g, " ")}</span>
            <span className="text-xs text-slate-500">{fmtDate(e.ts)} · {e.user_email ?? "sistema"}{e.ip ? ` · IP ${e.ip}` : ""}</span>
          </div>
          {e.diff.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3 font-medium">Campo</th><th className="py-1 pr-3 font-medium">Antes</th><th className="py-1 font-medium">Después</th></tr></thead>
                <tbody>{e.diff.map((d: any) => (
                  <tr key={d.field} className="border-t border-slate-100 align-top">
                    <td className="py-1 pr-3 font-medium text-slate-700">{d.field}</td>
                    <td className="py-1 pr-3 text-red-700"><del className="decoration-red-300">{d.before}</del></td>
                    <td className="py-1 text-emerald-700">{d.after}</td>
                  </tr>))}</tbody>
              </table>
            </div>) : <p className="mt-1 text-xs text-slate-400">Sin cambios de valores.</p>}
        </li>))}
    </ol>
  );
}
