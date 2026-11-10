export const TZ = "America/Bogota";

export function nitDv(nit: string): string {
  const w = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const d = nit.replace(/\D/g, "").split("").reverse();
  let s = 0;
  d.forEach((c, i) => (s += Number(c) * w[i]));
  const r = s % 11;
  return String(r > 1 ? 11 - r : r);
}
export const validNit = (nit: string, dv: string) => /^\d{6,15}$/.test(nit.replace(/\D/g, "")) && nitDv(nit) === String(dv).trim();

export function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleString("es-CO", {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
// <input type="datetime-local"> (hora Colombia, UTC-5) -> ISO UTC
export function localToIso(v: string) {
  if (!v) return null;
  return new Date(v + ":00-05:00").toISOString();
}
export function isoToLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
export const rand = (n = 8) => {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};
export const money = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
export const jparse = <T,>(s: any, def: T): T => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
