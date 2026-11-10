import crypto from "node:crypto";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { all, get, insert, now, run, setting, tx } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { emit } from "./webhooks";
import { decryptBuffer, encryptBuffer, readDocument } from "./onbase";
import { fmtDate, jparse, rand } from "./util";

/**
 * Módulo convocatorias: asistencia por sesión (RF-PAR-04, RF-CON-14), filtros de inscritos (RF-CON-13) y
 * certificados PDF con firma electrónica Ed25519 y código de verificación (RF-CON-15).
 *
 * Sobre la firma: es una FIRMA ELECTRÓNICA VERIFICABLE (Ed25519 sobre los datos del certificado, con un par de
 * llaves propio de la plataforma generado la primera vez y guardado en settings; la llave privada se guarda
 * cifrada con AES-256-GCM). La página pública /verificar/<código> comprueba la firma. NO es una firma digital
 * certificada por una entidad de certificación abierta (ECD) acreditada por la ONAC; si Compensar lo exige,
 * basta reemplazar signPayload()/verifyPayload() por el servicio de la ECD (el resto del flujo no cambia).
 */

/** Plantillas de landing (RF-CON-07). */
export const LANDING_TEMPLATES: [string, string, string][] = [
  ["clasica", "Clásica", "Encabezado con el color de marca, banner y datos en tarjetas"],
  ["destacada", "Destacada", "Banner grande a todo lo ancho y formulario de inscripción fijo al lado"],
  ["minimal", "Minimal", "Columna única, sobria, centrada en el texto"],
];

/* ============================== asistencia por sesión ============================== */

export const sessionsCount = (ev: { sessions_count?: number | null }) => Math.max(1, Math.min(60, Number(ev?.sessions_count) || 1));
export const minAttendance = (ev: { min_attendance?: number | null }) => {
  const m = Number(ev?.min_attendance);
  return Number.isFinite(m) && ev?.min_attendance != null ? Math.max(0, Math.min(100, m)) : 80;
};

/** Sesiones asistidas (1..n). Compatibilidad: registros antiguos con attended=1 y sin detalle cuentan todas las sesiones. */
export function sessionsOf(r: { sessions_attended?: string | null; attended?: number | null }, n: number): number[] {
  const arr = [...new Set(jparse<any[]>(r?.sessions_attended, []).map(Number))].filter((x) => Number.isInteger(x) && x >= 1 && x <= n).sort((a, b) => a - b);
  if (!arr.length && r?.attended) return Array.from({ length: n }, (_, i) => i + 1);
  return arr;
}

export type Attendance = { n: number; sessions: number[]; count: number; pct: number; min: number; meets: boolean; label: string };
export function attendanceOf(r: any, ev: any): Attendance {
  const n = sessionsCount(ev), min = minAttendance(ev);
  const sessions = sessionsOf(r, n);
  const pct = Math.round((sessions.length * 100) / n);
  const meets = sessions.length > 0 && (sessions.length * 100) / n >= min;
  return { n, sessions, count: sessions.length, pct, min, meets, label: `${sessions.length}/${n} ${n === 1 ? "sesión" : "sesiones"} (${pct} %)` };
}

/** Marca (o desmarca) la asistencia de una inscripción a una sesión y recalcula `attended` = cumple el % mínimo. */
export function markSession(r: any, ev: any, session: number, present: boolean, source: string, by: number | null, minutes: number | null = null) {
  const n = sessionsCount(ev);
  if (!Number.isInteger(session) || session < 1 || session > n) throw new Error(`Sesión fuera de rango (1 a ${n})`);
  const set = new Set(sessionsOf(r, n));
  if (present) {
    set.add(session);
    run(`INSERT INTO attendance_sessions(registration_id,session_no,source,minutes,recorded_by,recorded_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(registration_id,session_no) DO UPDATE SET source=excluded.source, minutes=excluded.minutes, recorded_by=excluded.recorded_by, recorded_at=excluded.recorded_at`,
      r.id, session, source, minutes, by, now());
  } else {
    set.delete(session);
    run("DELETE FROM attendance_sessions WHERE registration_id=? AND session_no=?", r.id, session);
  }
  const sessions = [...set].sort((a, b) => a - b);
  const a = attendanceOf({ sessions_attended: JSON.stringify(sessions), attended: 0 }, ev);
  const mins = get<any>("SELECT SUM(minutes) m FROM attendance_sessions WHERE registration_id=?", r.id)?.m ?? 0;
  run("UPDATE registrations SET sessions_attended=?, attended=?, minutes=?, attendance_source=? WHERE id=?",
    JSON.stringify(sessions), a.meets ? 1 : 0, mins, sessions.length ? source : null, r.id);
  return a;
}

/** Recalcula `attended` de todo el evento (al cambiar el número de sesiones o el % mínimo). */
export function recomputeEvent(ev: any) {
  const n = sessionsCount(ev);
  for (const r of all<any>("SELECT id, sessions_attended, attended FROM registrations WHERE event_id=?", ev.id)) {
    const s = sessionsOf(r, n);
    const a = attendanceOf({ sessions_attended: JSON.stringify(s), attended: 0 }, ev);
    run("UPDATE registrations SET sessions_attended=?, attended=? WHERE id=?", JSON.stringify(s), a.meets ? 1 : 0, r.id);
  }
}

/** Intensidad horaria: la configurada; si no, duración inicio→fin × sesiones (solo si cada sesión dura ≤ 12 h). */
export function eventHours(ev: any): number | null {
  const h = get<any>("SELECT hours FROM event_meta WHERE event_id=?", ev.id)?.hours;
  if (h) return Number(h);
  const dur = (new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime()) / 3600000;
  return dur > 0 && dur <= 12 ? Math.round(dur * sessionsCount(ev) * 10) / 10 : null;
}
export function setEventHours(eventId: number, hours: number | null) {
  if (hours && hours > 0) run("INSERT INTO event_meta(event_id,hours) VALUES(?,?) ON CONFLICT(event_id) DO UPDATE SET hours=excluded.hours", eventId, hours);
  else run("DELETE FROM event_meta WHERE event_id=?", eventId);
}
export const storedHours = (eventId: number): number | null => get<any>("SELECT hours FROM event_meta WHERE event_id=?", eventId)?.hours ?? null;

/* ============================== filtros de inscritos (RF-CON-13) ============================== */

export type RegFilter = { estado?: string; asistencia?: string; espera?: string; cert?: string; q?: string };
export const regFilterFrom = (sp: Record<string, any>): RegFilter =>
  ({ estado: sp.estado || "", asistencia: sp.asistencia || "", espera: sp.espera || "", cert: sp.cert || "", q: String(sp.q || "").trim().slice(0, 80) });
export const regFilterQuery = (f: RegFilter) =>
  Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

/** Inscritos del evento con su resumen de asistencia, aplicando los filtros. Sin permiso de datos personales
 *  la búsqueda solo mira empresa, NIT y código (no permite averiguar nombres ni correos). */
export function registrationsOf(ev: any, f: RegFilter, pii: boolean) {
  const where = ["r.event_id=?"]; const p: any[] = [ev.id];
  if (f.estado) { where.push("r.status=?"); p.push(f.estado); }
  if (f.espera === "si") where.push("r.waitlist=1");
  if (f.espera === "no") where.push("r.waitlist=0");
  if (f.cert === "si") where.push("cert.code IS NOT NULL");
  if (f.cert === "no") where.push("cert.code IS NULL");
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    const cols = ["lower(c.razon_social)", "lower(IFNULL(c.nit,''))", "lower(r.code)", ...(pii ? ["lower(IFNULL(r.name,''))", "lower(IFNULL(r.email,''))"] : [])];
    where.push(`(${cols.map((c) => `${c} LIKE ?`).join(" OR ")})`); p.push(...cols.map(() => like));
  }
  const rows = all<any>(`SELECT r.*, c.razon_social, c.nit, cert.code cert FROM registrations r JOIN companies c ON c.id=r.company_id
    LEFT JOIN certificates cert ON cert.registration_id=r.id WHERE ${where.join(" AND ")} ORDER BY r.waitlist, r.id`, ...p)
    .map((r) => ({ ...r, att: attendanceOf(r, ev) }));
  return rows.filter((r) =>
    !f.asistencia ||
    (f.asistencia === "cumple" && r.att.meets) ||
    (f.asistencia === "parcial" && r.att.count > 0 && !r.att.meets) ||
    (f.asistencia === "sin" && r.att.count === 0) ||
    (f.asistencia === "no_cumple" && !r.att.meets));
}

/* ============================== firma electrónica Ed25519 ============================== */

type Keys = { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject; publicPem: string; keyId: string };
let KEYS: Keys | null = null;

/** Par de llaves de la plataforma: se genera la primera vez y se guarda en settings (privada cifrada AES-256-GCM). */
export function signingKeys(): Keys {
  if (KEYS && setting("cert_sign_key_id") === KEYS.keyId) return KEYS;
  if (!setting("cert_sign_public")) {
    const kp = crypto.generateKeyPairSync("ed25519");
    const pub = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
    const priv = encryptBuffer(Buffer.from(kp.privateKey.export({ type: "pkcs8", format: "pem" }).toString())).toString("base64");
    const kid = "ed25519:" + crypto.createHash("sha256").update(kp.publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
    // si otra instancia la generó al mismo tiempo, gana la primera (no se sobrescribe)
    tx(() => {
      if (setting("cert_sign_public")) return;
      for (const [k, v] of [["cert_sign_public", pub], ["cert_sign_private", priv], ["cert_sign_key_id", kid], ["cert_sign_created_at", now()]])
        run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING", k, v);
    });
  }
  const publicPem = setting("cert_sign_public");
  const privatePem = decryptBuffer(Buffer.from(setting("cert_sign_private"), "base64")).toString();
  KEYS = { privateKey: crypto.createPrivateKey(privatePem), publicKey: crypto.createPublicKey(publicPem), publicPem, keyId: setting("cert_sign_key_id") };
  return KEYS;
}

export const signPayload = (payload: string) => crypto.sign(null, Buffer.from(payload, "utf8"), signingKeys().privateKey).toString("base64");
export function verifyPayload(payload: string, signature: string, keyId: string): boolean {
  try {
    const k = signingKeys();
    if (keyId !== k.keyId) return false;
    return crypto.verify(null, Buffer.from(payload, "utf8"), k.publicKey, Buffer.from(signature, "base64"));
  } catch { return false; }
}

/* ============================== emisión ============================== */

export const appUrl = () => (process.env.APP_URL || "").replace(/\/$/, "");
export const certPdfPath = (code: string) => `/api/certificados/${code}.pdf`;
export const verifyPath = (code: string) => `/verificar/${code}`;

export type CertData = {
  v: number; code: string; nombre: string; empresa: string; nit: string; evento: string; evento_id: number; tipo: string; programa: string;
  fecha_inicio: string; fecha_fin: string; horas: number | null; sesiones: string; asistencia_pct: number; emitido: string; emisor: string;
};

/** Emite los certificados pendientes de un evento a quienes cumplen la asistencia mínima. Idempotente. */
export async function issueForEvent(eventId: number, by: { id: number; email: string } | null, origin = appUrl()) {
  const ev = get<any>("SELECT e.*, p.name program FROM events e LEFT JOIN programs p ON p.id=e.program_id WHERE e.id=?", eventId);
  if (!ev) return { issued: 0, pending: 0 };
  const regs = all<any>(`SELECT r.*, c.razon_social, c.nit FROM registrations r JOIN companies c ON c.id=r.company_id
    WHERE r.event_id=? AND r.waitlist=0 AND NOT EXISTS (SELECT 1 FROM certificates x WHERE x.registration_id=r.id)`, eventId);
  const hours = eventHours(ev);
  let issued = 0, pending = 0;
  for (const r of regs) {
    const a = attendanceOf(r, ev);
    if (!a.meets) { pending++; continue; }
    const code = "CERT-" + rand(10).toUpperCase();
    const data: CertData = {
      v: 1, code, nombre: r.name || "", empresa: r.razon_social || "", nit: r.nit || "", evento: ev.title, evento_id: ev.id, tipo: ev.type || "evento",
      programa: ev.program || "", fecha_inicio: ev.start_at || "", fecha_fin: ev.end_at || ev.start_at || "", horas: hours,
      sesiones: `${a.count}/${a.n}`, asistencia_pct: a.pct, emitido: now(), emisor: setting("brand_name", "Compensar"),
    };
    const payload = JSON.stringify(data);
    const signature = signPayload(payload);
    const ok = tx(() => {
      if (get("SELECT 1 FROM certificates WHERE registration_id=?", r.id)) return false; // otra ejecución ya lo emitió
      const cid = insert("INSERT INTO certificates(registration_id,code,issued_at) VALUES(?,?,?)", r.id, code, data.emitido);
      insert("INSERT INTO certificate_signatures(certificate_id,payload,signature,key_id,alg,created_at) VALUES(?,?,?,?,?,?)", cid, payload, signature, signingKeys().keyId, "Ed25519", data.emitido);
      return true;
    });
    if (!ok) continue;
    notify({ key: "certificado", vars: { event: ev.title, url: origin + certPdfPath(code), cert: code, verify: origin + verifyPath(code), name: r.name }, email: r.email, phone: r.phone, userId: r.user_id });
    emit("certificado.emitido", { certificado: code, evento_id: eventId, evento: ev.title, inscripcion_id: r.id, empresa_id: r.company_id, asistencia: data.sesiones, porcentaje: a.pct });
    issued++;
  }
  if (issued) await audit(by, by ? "emitir_certificados" : "emitir_certificados_auto", "event", eventId, null, { emitidos: issued, sin_asistencia_minima: pending });
  return { issued, pending };
}

/* ============================== verificación ============================== */

export function loadCertificate(code: string) {
  const c = get<any>(`SELECT c.*, s.payload, s.signature, s.key_id, s.alg, r.name, r.event_id, co.razon_social, e.title, e.start_at, e.end_at
    FROM certificates c LEFT JOIN certificate_signatures s ON s.certificate_id=c.id
    JOIN registrations r ON r.id=c.registration_id JOIN events e ON e.id=r.event_id JOIN companies co ON co.id=r.company_id WHERE c.code=?`,
    String(code || "").toUpperCase().replace(/\.PDF$/, "").slice(0, 40));
  if (!c) return null;
  const data: CertData | null = c.payload ? jparse<CertData | null>(c.payload, null) : null;
  const valid = !!(c.payload && c.signature && verifyPayload(c.payload, c.signature, c.key_id) && data?.code === c.code);
  // certificados emitidos antes de la firma electrónica: válidos por código, sin firma
  return { ...c, data, valid, signed: !!c.payload };
}

/* ============================== PDF (pdf-lib) ============================== */

const hexRgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  const n = m ? parseInt(m[1], 16) : 0x0a6cff;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Deja solo caracteres que la fuente estándar (WinAnsi) puede dibujar: tildes y ñ sí; lo demás se aproxima. */
function safeText(font: PDFFont, s: string): string {
  const set = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of String(s ?? "")) {
    if (set.has(ch.codePointAt(0)!)) { out += ch; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += base && [...base].every((b) => set.has(b.codePointAt(0)!)) ? base : ch === "\n" || ch === "\t" ? " " : "?";
  }
  return out;
}
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = safeText(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxWidth || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function brandLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const id = setting("brand_logo_doc");
    if (!id) return null;
    const d = get<any>("SELECT * FROM documents WHERE id=?", Number(id));
    const buf = d ? readDocument(d) : null;
    if (!buf) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) return await pdf.embedPng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return await pdf.embedJpg(buf);
  } catch {}
  return null;
}

const dateRange = (a: string, b: string) => {
  const x = fmtDate(a, false), y = fmtDate(b, false);
  return !b || x === y ? x : `${x} al ${y}`;
};

/** Genera el PDF del certificado (A4 horizontal) con marca, datos, firma impresa y QR de verificación. */
export async function certificatePdf(code: string, origin: string): Promise<{ bytes: Uint8Array; code: string } | null> {
  const c = loadCertificate(code);
  if (!c) return null;
  const d: CertData = c.data ?? {
    v: 0, code: c.code, nombre: c.name, empresa: c.razon_social, nit: "", evento: c.title, evento_id: c.event_id, tipo: "", programa: "",
    fecha_inicio: c.start_at, fecha_fin: c.end_at, horas: null, sesiones: "", asistencia_pct: 0, emitido: c.issued_at, emisor: setting("brand_name", "Compensar"),
  };
  const brand = setting("brand_name", "Compensar"), color = hexRgb(setting("brand_color", "#0a6cff"));
  const ink = rgb(0.06, 0.11, 0.2), muted = rgb(0.4, 0.45, 0.53), light = rgb(0.93, 0.95, 0.98);
  const verifyUrl = origin + verifyPath(c.code);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado ${c.code} — ${d.evento}`);
  pdf.setAuthor(brand);
  pdf.setSubject(c.payload || `Certificado ${c.code}`);
  pdf.setKeywords([c.code, `alg:${c.alg || "ninguna"}`, `key:${c.key_id || ""}`, `sig:${c.signature || ""}`, `verificar:${verifyUrl}`]);
  pdf.setCreator("Plataforma de Fomento Empresarial");
  pdf.setProducer("pdf-lib");
  pdf.setCreationDate(new Date(c.issued_at || Date.now()));
  const W = 841.89, H = 595.28;
  const page = pdf.addPage([W, H]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const center = (text: string, y: number, size: number, font: PDFFont, col = ink) => {
    const t = safeText(font, text);
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color: col });
  };

  // marco y banda de marca
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: color, borderWidth: 6 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: light, borderWidth: 1.5 });
  page.drawRectangle({ x: 30, y: H - 40, width: W - 60, height: 10, color });

  // logo o nombre de marca
  const logo = await brandLogo(pdf);
  let y = H - 95;
  if (logo) {
    const s = Math.min(170 / logo.width, 48 / logo.height);
    page.drawImage(logo, { x: (W - logo.width * s) / 2, y: y - 6, width: logo.width * s, height: logo.height * s });
    y -= 30;
  } else center(brand.toUpperCase(), y, 14, bold, color);
  y -= 42;
  center("CERTIFICADO DE ASISTENCIA", y, 28, bold);
  y -= 38;
  center("Se certifica que", y, 12, reg, muted);
  y -= 34;
  center(d.nombre || "Participante", y, 26, bold, color);
  y -= 22;
  center(`de ${d.empresa}${d.nit ? ` (NIT ${d.nit})` : ""}`, y, 12, reg, muted);
  y -= 30;
  center("asistió y cumplió la asistencia mínima requerida en", y, 12, reg, muted);
  y -= 26;
  for (const line of wrap(bold, d.evento, 18, W - 200).slice(0, 2)) { center(line, y, 18, bold); y -= 22; }
  const facts = [
    d.tipo && d.programa ? `${d.tipo[0].toUpperCase()}${d.tipo.slice(1)} · ${d.programa}` : d.tipo || d.programa,
    dateRange(d.fecha_inicio, d.fecha_fin),
    d.horas ? `Intensidad: ${String(d.horas).replace(".", ",")} ${d.horas === 1 ? "hora" : "horas"}` : "",
    d.sesiones ? `Asistencia: ${d.sesiones} sesiones (${d.asistencia_pct} %)` : "",
  ].filter(Boolean).join("   ·   ");
  y -= 4;
  center(facts, y, 10.5, reg, muted);

  // firma electrónica (izquierda)
  const fx = 60, fy = 150;
  page.drawLine({ start: { x: fx, y: fy }, end: { x: fx + 330, y: fy }, thickness: 0.8, color: muted });
  page.drawText(safeText(bold, c.signed ? "Firma electrónica verificable (Ed25519)" : "Certificado sin firma electrónica (emitido antes de su activación)"), { x: fx, y: fy - 14, size: 9, font: bold, color: ink });
  page.drawText(safeText(reg, `${brand} · Emitido ${fmtDate(d.emitido)} (hora Colombia)`), { x: fx, y: fy - 27, size: 8, font: reg, color: muted });
  if (c.signed) {
    page.drawText(`Llave: ${c.key_id}`, { x: fx, y: fy - 40, size: 7, font: mono, color: muted });
    const sig = String(c.signature);
    for (let i = 0, yy = fy - 52; i < sig.length; i += 64, yy -= 9) page.drawText(sig.slice(i, i + 64), { x: fx, y: yy, size: 6.5, font: mono, color: muted });
  }
  page.drawText(safeText(reg, "Firma electrónica de la plataforma; no es una firma digital certificada por una ECD."), { x: fx, y: 52, size: 6.5, font: reg, color: muted });

  // QR + código (derecha)
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { width: 300, margin: 1, errorCorrectionLevel: "M" }));
  const qs = 104, qx = W - 60 - qs, qy = 60;
  page.drawImage(qr, { x: qx, y: qy, width: qs, height: qs });
  const rx = qx - 12;
  const right = (text: string, yy: number, size: number, font: PDFFont, col = ink) => {
    const t = safeText(font, text);
    page.drawText(t, { x: rx - font.widthOfTextAtSize(t, size), y: yy, size, font, color: col });
  };
  right("Código de verificación", qy + 84, 8, reg, muted);
  right(c.code, qy + 68, 13, bold, color);
  right("Escanee el QR o ingrese a", qy + 44, 8, reg, muted);
  const shown = verifyUrl.length > 60 ? verifyUrl.slice(0, 57) + "…" : verifyUrl;
  right(shown, qy + 32, 7.5, mono, ink);

  return { bytes: await pdf.save(), code: c.code };
}
