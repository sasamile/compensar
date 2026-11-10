import { all, get, insert, now, run, setting } from "./db";
import { jparse } from "./util";

type Vars = Record<string, string | number | null | undefined>;
const render = (s: string, v: Vars) => (s || "").replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? ""));

export const CHANNELS = ["correo", "sms", "whatsapp"] as const;
export const channelOn = (c: string) => setting(`channel_${c}`, "1") === "1";

/** Mensajes de seguridad: siempre se envían, sin importar las preferencias del usuario (RF-NOT-05). */
export const SECURITY_KEYS = ["otp", "invitacion", "recuperacion", "recuperar_clave", "mfa", "alerta_seguridad", "nuevo_ingreso"];
/** Mensajes no esenciales: el usuario puede darse de baja (recordatorios, encuestas, boletines, novedades). */
export const isNonEssential = (key: string) =>
  /^(recordatorio|encuesta|boletin|novedad|promo|oferta|newsletter)/.test(key) ||
  setting("notif_non_essential_keys", "").split(",").map((s) => s.trim()).filter(Boolean).includes(key);

export type NotifPrefs = { correo: number; sms: number; whatsapp: number; no_esenciales: number };
export function userPrefs(userId?: number | null, email?: string | null): NotifPrefs {
  const def: NotifPrefs = { correo: 1, sms: 1, whatsapp: 1, no_esenciales: 1 };
  const u = userId ? get<any>("SELECT notif_prefs FROM users WHERE id=?", userId) : email ? get<any>("SELECT notif_prefs FROM users WHERE email=?", String(email).toLowerCase()) : null;
  return { ...def, ...jparse<Partial<NotifPrefs>>(u?.notif_prefs, {}) };
}

/**
 * RF-NOT-04: todos los mensajes salen con la marca configurada (Configuración → Marca).
 *  - Correo: encabezado con el nombre de la organización y pie (brand_email_footer o nombre · subtítulo).
 *  - SMS y WhatsApp: prefijo «<brand_sms_prefix o brand_name>:» (si el texto no lo trae ya).
 * Se aplica al texto ya renderizado de la plantilla aprobada; no cambia la aprobación ni las preferencias.
 */
export function brandMessage(channel: string, body: string, subject = ""): { body: string; subject: string } {
  const brand = setting("brand_name", "Compensar").trim() || "Compensar";
  if (channel === "correo") {
    const tagline = setting("brand_tagline", "Plataforma de Fomento Empresarial").trim();
    const footer = setting("brand_email_footer", "").trim() || `${brand}${tagline ? ` · ${tagline}` : ""}`;
    const head = `${brand}${tagline ? ` — ${tagline}` : ""}`;
    const text = body.startsWith(head) ? body : `${head}\n\n${body}`;
    return {
      body: text.includes(`\n— ${footer}`) ? text : `${text}\n\n— ${footer}\nMensaje automático de la plataforma; por favor no respondas a este correo.`,
      subject: subject && !subject.startsWith(brand) ? `${brand} | ${subject}` : subject,
    };
  }
  const prefix = (setting("brand_sms_prefix", "").trim() || brand).replace(/:$/, "");
  return { body: body.startsWith(prefix + ":") ? body : `${prefix}: ${body}`, subject };
}

/**
 * Envía una notificación por los canales activos. Los proveedores reales (SES, SMS, WhatsApp)
 * van detrás de este adaptador; en el MVP se simula la entrega y queda trazabilidad completa.
 * Una plantilla no aprobada no se puede enviar (RF-PAR-07).
 * Preferencias por usuario (RF-NOT-05): canales desactivados y baja de mensajes no esenciales se respetan,
 * salvo los mensajes de seguridad (SECURITY_KEYS o security: true), que siempre se envían.
 */
export function notify(opts: {
  key: string; vars?: Vars; email?: string | null; phone?: string | null; userId?: number | null;
  channels?: string[]; security?: boolean;
}) {
  const out: number[] = [];
  const chans = opts.channels ?? ["correo", "sms", "whatsapp"];
  const security = opts.security || SECURITY_KEYS.includes(opts.key);
  const prefs = security ? null : userPrefs(opts.userId, opts.email);
  const nonEssential = !security && isNonEssential(opts.key);
  for (const ch of chans) {
    if (!channelOn(ch)) continue;
    const t = get<any>("SELECT * FROM templates WHERE key=? AND channel=?", opts.key, ch);
    if (!t) continue;
    const to = ch === "correo" ? opts.email : opts.phone;
    const { body, subject } = brandMessage(ch, render(t.body, opts.vars ?? {}), render(t.subject, opts.vars ?? {}));
    const ts = now();
    if (prefs && ((prefs as any)[ch] === 0 || (nonEssential && prefs.no_esenciales === 0))) {
      // queda constancia de que no se envió por decisión del usuario (no cuenta como enviado)
      insert("INSERT INTO notifications(channel,template_key,to_addr,user_id,subject,body,status,sent_at,error) VALUES(?,?,?,?,?,?,?,?,?)",
        ch, opts.key, to ?? "", opts.userId ?? null, subject, body, "omitido", ts,
        nonEssential && prefs.no_esenciales === 0 ? "El usuario se dio de baja de mensajes no esenciales" : "El usuario desactivó este canal");
      continue;
    }
    if (!t.approved) {
      out.push(insert("INSERT INTO notifications(channel,template_key,to_addr,user_id,subject,body,status,sent_at,error) VALUES(?,?,?,?,?,?,?,?,?)",
        ch, opts.key, to ?? "", opts.userId ?? null, subject, body, "fallido", ts, "Plantilla no aprobada por Compensar"));
      continue;
    }
    if (!to) {
      out.push(insert("INSERT INTO notifications(channel,template_key,to_addr,user_id,subject,body,status,sent_at,error) VALUES(?,?,?,?,?,?,?,?,?)",
        ch, opts.key, "", opts.userId ?? null, subject, body, "fallido", ts, ch === "correo" ? "Sin correo" : "Sin número de celular"));
      continue;
    }
    out.push(insert("INSERT INTO notifications(channel,template_key,to_addr,user_id,subject,body,status,sent_at,delivered_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ch, opts.key, to, opts.userId ?? null, subject, body, "entregado", ts, ts));
  }
  return out;
}

export const markRead = (userId: number) =>
  run("UPDATE notifications SET status='leido', read_at=? WHERE user_id=? AND channel='correo' AND status='entregado'", now(), userId);

export const myNotifications = (userId: number) =>
  all("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100", userId);
