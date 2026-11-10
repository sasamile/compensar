/**
 * Adaptador de «Gestión de Clientes» de Compensar (RF-VAL-02, FUN-73).
 *
 * Hoy lee la réplica local `client_registry` (sembrada en src/lib/seeds/validacion.ts).
 * Para conectarlo al sistema real basta con definir GESTION_CLIENTES_URL (y opcionalmente
 * GESTION_CLIENTES_TOKEN): `consultarEmpresa` hará GET {URL}/empresas/{nit} y espera un JSON con los
 * mismos campos de `RegistroCliente`. El resto del módulo no cambia.
 */
import { get } from "@/lib/db";

export type RegistroCliente = {
  nit: string;
  razon_social: string | null;
  afiliado: number | null;            // 1 = afiliada a Compensar
  meses_afiliacion: number | null;
  al_dia_parafiscales: number | null; // 1 = al día en parafiscales y seguridad social
  ventas_brutas: number | null;       // COP último año
  inscrito_agencia: number | null;    // 1 = inscrita en la Agencia de Empleo y Fomento con asesor
  aportes_meses_3a: number | null;    // meses con aportes a caja en los últimos 3 años
  cesante: number | null;             // 1 = desempleado e inactivo en EPS
};

/** Campos disponibles para las reglas de validación (editor de reglas). */
export const CAMPOS: { key: keyof RegistroCliente; label: string; tipo: "numero" | "booleano" | "texto" }[] = [
  { key: "afiliado", label: "Afiliada a Compensar", tipo: "booleano" },
  { key: "meses_afiliacion", label: "Meses de afiliación", tipo: "numero" },
  { key: "al_dia_parafiscales", label: "Al día en parafiscales y seguridad social", tipo: "booleano" },
  { key: "ventas_brutas", label: "Ventas brutas (COP)", tipo: "numero" },
  { key: "inscrito_agencia", label: "Inscrita en la Agencia de Empleo y Fomento", tipo: "booleano" },
  { key: "aportes_meses_3a", label: "Meses de aportes en los últimos 3 años", tipo: "numero" },
  { key: "cesante", label: "Cesante (desempleado e inactivo en EPS)", tipo: "booleano" },
  { key: "razon_social", label: "Razón social", tipo: "texto" },
];
export const campoLabel = (k: string) => CAMPOS.find((c) => c.key === k)?.label ?? k;

export const FUENTE = () => (process.env.GESTION_CLIENTES_URL ? "Gestión de Clientes (API)" : "Gestión de Clientes (réplica local)");

const clean = (nit: string) => String(nit || "").replace(/\D/g, "");

/** Consulta síncrona a la réplica local (semillas, pruebas). */
export function consultarLocal(nit: string): RegistroCliente | null {
  return get<RegistroCliente>("SELECT * FROM client_registry WHERE nit=?", clean(nit)) ?? null;
}

/**
 * Consulta los datos de una empresa por NIT. Devuelve null si el NIT no existe en Gestión de Clientes.
 * Lanza error si el servicio externo no responde (el llamador lo muestra como «sin consulta»).
 */
export async function consultarEmpresa(nit: string): Promise<RegistroCliente | null> {
  const url = process.env.GESTION_CLIENTES_URL;
  if (!url) return consultarLocal(nit);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/empresas/${clean(nit)}`, {
      headers: { Accept: "application/json", ...(process.env.GESTION_CLIENTES_TOKEN ? { Authorization: `Bearer ${process.env.GESTION_CLIENTES_TOKEN}` } : {}) },
      signal: ctrl.signal, cache: "no-store",
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Gestión de Clientes respondió ${r.status}`);
    const j = await r.json();
    return { nit: clean(nit), ...j } as RegistroCliente;
  } finally {
    clearTimeout(t);
  }
}
