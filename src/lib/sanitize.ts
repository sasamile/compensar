/**
 * Sanitización y normalización de entradas (TEC-59, RNF-SEG-09).
 * Complementa (no reemplaza) las consultas parametrizadas y la codificación de salidas de React:
 * normaliza Unicode (NFC), quita caracteres de control y etiquetas, recorta espacios y limita longitudes.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const TAGS = /<\/?[a-zA-Z][^>]*>/g;

/** Texto de una línea: NFC, sin control, sin etiquetas HTML, espacios colapsados, longitud máxima. */
export function clean(v: unknown, max = 300): string {
  if (v == null) return "";
  return String(v).normalize("NFC").replace(CONTROL, "").replace(/[\r\n\t]+/g, " ").replace(TAGS, "").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/** Texto multilínea (descripciones): conserva saltos de línea. */
export function cleanText(v: unknown, max = 5000): string {
  if (v == null) return "";
  return String(v).normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(TAGS, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

export function cleanEmail(v: unknown): string {
  const e = clean(v, 254).toLowerCase().replace(/\s/g, "");
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : "";
}

/** Celular colombiano u otro número: solo dígitos y + inicial. */
export function cleanPhone(v: unknown): string {
  const s = clean(v, 30).replace(/[^\d+]/g, "");
  return s.replace(/(?!^)\+/g, "").slice(0, 16);
}

/** URL absoluta http(s). `httpsOnly` rechaza http salvo localhost. */
export function cleanUrl(v: unknown, httpsOnly = true): string {
  const s = clean(v, 2000);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol === "https:") return u.toString();
    if (u.protocol === "http:" && (!httpsOnly || ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) return u.toString();
  } catch {}
  return "";
}

export const cleanInt = (v: unknown, def = 0, min = -Infinity, max = Infinity) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Lee un campo de un FormData ya sanitizado. */
export const formStr = (fd: FormData, k: string, max = 300) => clean(fd.get(k), max);

/** Quita datos personales evidentes de un texto técnico (logs): correos, cédulas/NIT/celulares, tokens largos. */
export function redactPii(s: string): string {
  return String(s || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_\-]{32,}\b/g, "[token]")
    .replace(/\b\d{7,}\b/g, "[número]");
}
