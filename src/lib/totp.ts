import crypto from "node:crypto";
import { decryptBuffer, encryptBuffer } from "./onbase";
import { get as dbGet, insert as dbInsert, now as dbNow, run as dbRun } from "./db";

/**
 * Segundo factor TOTP nativo (RFC 6238 / RFC 4226) con node:crypto: HMAC-SHA1, 6 dígitos, paso de 30 s,
 * ventana de tolerancia ±1 paso. Compatible con Microsoft Authenticator, Google Authenticator, Authy, 1Password, etc.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP = 30;
export const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Secreto base32 inválido");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Secreto de 160 bits (recomendado por RFC 4226). */
export const generateSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
export const totp = (secret: string, ms = Date.now()) => hotp(secret, stepAt(ms));
/** Segundos que le quedan al código vigente. */
export const secondsLeft = (ms = Date.now()) => STEP - (Math.floor(ms / 1000) % STEP);

/**
 * Verifica un código con ventana ±`window` pasos. Devuelve el paso que coincidió (para impedir reutilizarlo)
 * o null. Comparación en tiempo constante.
 */
export function verifyTotp(secret: string, code: string, window = 1, ms = Date.now()): number | null {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c) || !secret) return null;
  const now = stepAt(ms);
  for (let w = -window; w <= window; w++) {
    const exp = hotp(secret, now + w);
    if (crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(c))) return now + w;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "Compensar Fomento"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

/** Códigos de recuperación de un solo uso (formato XXXX-XXXX). */
export function recoveryCodes(n = 8): string[] {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, (x) => alpha[x % alpha.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const hashRecovery = (code: string) => crypto.createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

/* ---------- secreto TOTP cifrado en reposo (AES-256-GCM con la llave de almacenamiento) ---------- */
export const sealSecret = (secret: string) => "enc:" + encryptBuffer(Buffer.from(secret)).toString("base64");
export const openSecret = (stored?: string | null) =>
  !stored ? "" : stored.startsWith("enc:") ? decryptBuffer(Buffer.from(stored.slice(4), "base64")).toString() : stored;

/* ---------- operaciones de usuario (anti-repetición, recuperación) ---------- */

const lastStep = (userId: number) => dbGet<any>("SELECT last_step FROM mfa_state WHERE user_id=?", userId)?.last_step ?? 0;

/** Código que se muestra en MODO DEMO: el vigente o, si ya se usó, el siguiente (aceptado por la ventana +1). */
export function demoCode(secret: string, userId?: number) {
  const step = stepAt();
  const s = userId && lastStep(userId) >= step ? step + 1 : step;
  return { code: hotp(secret, s), seconds: secondsLeft() + (s > step ? STEP : 0) };
}

/** Verifica el código TOTP del usuario e impide reutilizar un código ya aceptado. */
export function verifyUserTotp(userId: number, secret: string, code: string): boolean {
  const step = verifyTotp(secret, code, 1);
  if (step === null || step <= lastStep(userId)) return false;
  dbRun("INSERT INTO mfa_state(user_id,last_step) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_step=excluded.last_step", userId, step);
  return true;
}

export function consumeRecoveryCode(userId: number, code: string): boolean {
  const r = dbGet<any>("SELECT id FROM mfa_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL", userId, hashRecovery(code));
  if (!r) return false;
  dbRun("UPDATE mfa_recovery_codes SET used_at=? WHERE id=?", dbNow(), r.id);
  return true;
}

export function newRecoveryCodes(userId: number): string[] {
  const codes = recoveryCodes(8);
  dbRun("DELETE FROM mfa_recovery_codes WHERE user_id=?", userId);
  for (const c of codes) dbInsert("INSERT INTO mfa_recovery_codes(user_id,code_hash,created_at) VALUES(?,?,?)", userId, hashRecovery(c), dbNow());
  return codes;
}

/** Activa el segundo factor (el secreto se guarda cifrado) y devuelve códigos de recuperación nuevos. */
export function enableMfa(userId: number, secret: string): string[] {
  dbRun("UPDATE users SET mfa_secret=?, mfa_enabled=1 WHERE id=?", sealSecret(secret), userId);
  dbRun("INSERT INTO mfa_state(user_id,last_step,enrolled_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET enrolled_at=excluded.enrolled_at", userId, stepAt(), dbNow());
  return newRecoveryCodes(userId);
}

export function disableMfa(userId: number) {
  dbRun("UPDATE users SET mfa_secret=NULL, mfa_enabled=0 WHERE id=?", userId);
  dbRun("DELETE FROM mfa_recovery_codes WHERE user_id=?", userId);
}

/** Guarda un secreto para mostrarlo una sola vez (códigos de recuperación, secreto de cliente API). */
export function stashOnce(userId: number, kind: string, data: any): string {
  const id = crypto.randomBytes(16).toString("hex");
  dbInsert("INSERT INTO auth_flows(id,kind,user_id,data,created_at,expires_at) VALUES(?,?,?,?,?,?)", id, kind, userId, JSON.stringify(data), dbNow(), new Date(Date.now() + 10 * 60000).toISOString());
  return id;
}
export function takeOnce(userId: number, kind: string, id?: string | null): any | null {
  if (!id) return null;
  const r = dbGet<any>("SELECT * FROM auth_flows WHERE id=? AND kind=? AND user_id=?", id, kind, userId);
  if (!r) return null;
  dbRun("DELETE FROM auth_flows WHERE id=?", id);
  return new Date(r.expires_at) < new Date() ? null : JSON.parse(r.data);
}
