"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, now, run } from "@/lib/db";
import { can, canSeeCompany, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { callExternal, logError } from "@/lib/resilience";
import { FUENTE, consultarEmpresa } from "@/lib/integrations/gestion-clientes";
import { jparse } from "@/lib/util";

const flash = (id: number, kind: "ok" | "error", m: string) => { revalidatePath(`/empresas/${id}`); redirect(`/empresas/${id}?${kind}=${encodeURIComponent(m)}#gestion-clientes`); };
const FIELDS = ["afiliado", "meses_afiliacion", "al_dia_parafiscales", "aportes_meses_3a", "ventas_brutas", "inscrito_agencia", "cesante"] as const;

function save(cid: number, nit: string, status: string, data: any, userId: number, error: string | null) {
  run(`INSERT INTO company_client_sync(company_id,nit,status,data,source,synced_at,synced_by,error) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(company_id) DO UPDATE SET nit=excluded.nit, status=excluded.status, data=COALESCE(excluded.data, company_client_sync.data), source=excluded.source,
      synced_at=excluded.synced_at, synced_by=excluded.synced_by, error=excluded.error`, cid, nit, status, data ? JSON.stringify(data) : null, FUENTE(), now(), userId, error);
}

/** Consulta y sincroniza los datos de la empresa en Gestión de Clientes (ERS §6): afiliación, meses, aportes. Queda en auditoría. */
export async function syncClientData(fd: FormData) {
  const u = await requireUser();
  const cid = Number(fd.get("company_id"));
  if (!can(u, "companies.activate") && !can(u, "config.manage")) redirect("/sin-acceso");
  if (!canSeeCompany(u, cid)) redirect("/sin-acceso");
  const c = get<any>("SELECT * FROM companies WHERE id=?", cid);
  const prev = get<any>("SELECT * FROM company_client_sync WHERE company_id=?", cid);
  const before = { razon_social: c.razon_social, ...jparse<any>(prev?.data, {}) };
  let reg;
  try {
    reg = await callExternal("gestion_clientes", "consultar_empresa", c.nit, () => consultarEmpresa(c.nit), 10000);
  } catch (e: any) {
    const trace = logError("gestion_clientes", e, u.id);
    save(cid, c.nit, "error", null, u.id, `${e?.message ?? e} (traza ${trace})`);
    await audit(u, "sincronizar_gestion_clientes", "company", cid, null, { resultado: "error", error: String(e?.message ?? e).slice(0, 200) });
    flash(cid, "error", `Gestión de Clientes no respondió: ${e?.message ?? e}. Intenta más tarde (traza ${trace}).`);
  }
  if (!reg) {
    save(cid, c.nit, "no_encontrada", null, u.id, "El NIT no existe en Gestión de Clientes");
    await audit(u, "sincronizar_gestion_clientes", "company", cid, null, { resultado: "no encontrada", nit: c.nit });
    flash(cid, "error", `El NIT ${c.nit} no aparece en Gestión de Clientes`);
  }
  const data: any = Object.fromEntries(FIELDS.map((k) => [k, (reg as any)[k] ?? null]));
  save(cid, c.nit, "ok", data, u.id, null);
  const newName = String(reg!.razon_social || "").trim();
  if (newName && newName !== c.razon_social) run("UPDATE companies SET razon_social=? WHERE id=?", newName, cid);
  const after = { razon_social: newName || c.razon_social, ...data };
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k] ?? null) !== JSON.stringify(before[k] ?? null));
  await audit(u, "sincronizar_gestion_clientes", "company", cid, before, { ...after, fuente: FUENTE() });
  flash(cid, "ok", changed.length ? `Datos sincronizados con Gestión de Clientes: ${changed.length} campo(s) actualizado(s)` : "Datos sincronizados: sin cambios frente a la última consulta");
}
