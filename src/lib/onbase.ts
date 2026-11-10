import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { get, insert, now, run, setting } from "./db";
import { audit } from "./audit";
import { callExternal, enqueue, registerHandler } from "./resilience";

/**
 * Adaptador OnBase (RF-DOC-01..03, RF-INT-01/03/04, TEC-57, TEC-58, TEC-60).
 * Flujo: validar formato/tamaño → antivirus → cifrar (AES-256-GCM) → guardar en el almacén temporal cifrado
 * (storage/.cola) → enviar a OnBase protegido por circuit breaker. Si OnBase falla, el documento queda
 * "en_cola" y el job `reintentos_onbase` lo reenvía con espera exponencial: nunca se pierde.
 * En el MVP "OnBase" es ./storage (referencia ONB-*). Para la API real de Compensar basta reemplazar `send()`.
 * Simular caída: ONBASE_DOWN=1 o Integraciones → Colas → «Simular caída de OnBase».
 */
export const ALLOWED = [".xlsx", ".xls", ".doc", ".docx", ".pptx", ".pdf", ".jpg", ".jpeg", ".png"];
export const MAX_BYTES = 20 * 1024 * 1024;
const STORE = path.join(process.cwd(), "storage");
const QUEUE = path.join(STORE, ".cola");

export function validateFile(name: string, size: number): string | null {
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED.includes(ext)) return `Formato no permitido (${ext || "sin extensión"}). Permitidos: ${ALLOWED.join(", ")}`;
  if (size > MAX_BYTES) return "El archivo supera el máximo de 20 MB";
  if (size === 0) return "El archivo está vacío";
  return null;
}

// Antivirus simulado: detecta la firma de prueba EICAR. Producción: GuardDuty Malware Protection / ClamAV.
export function scanVirus(buf: Buffer): boolean {
  return buf.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
}

/* ---------------- cifrado en reposo (TEC-58) ---------------- */
const MAGIC = Buffer.from("FEENC1");
let KEY: Buffer | null = null;
/**
 * Llave AES-256: variable STORAGE_KEY (32 bytes en base64 o 64 caracteres hex; en producción viene de
 * AWS Secrets Manager/KMS). Sin STORAGE_KEY se deriva una llave de DESARROLLO fija con scrypt (documentado:
 * no apta para producción).
 */
export function storageKey(): Buffer {
  if (KEY) return KEY;
  const env = process.env.STORAGE_KEY || "";
  if (/^[0-9a-fA-F]{64}$/.test(env)) KEY = Buffer.from(env, "hex");
  else if (env && Buffer.from(env, "base64").length === 32) KEY = Buffer.from(env, "base64");
  else if (env) KEY = crypto.scryptSync(env, "fomento-storage-v1", 32);
  else KEY = crypto.scryptSync("fomento-empresarial-llave-de-desarrollo", "fomento-storage-v1", 32);
  return KEY;
}
export const storageKeySource = () => (process.env.STORAGE_KEY ? "STORAGE_KEY (variable de entorno)" : "llave de desarrollo derivada (configure STORAGE_KEY en producción)");

export function encryptBuffer(buf: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", storageKey(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}
export function decryptBuffer(buf: Buffer): Buffer {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) return buf; // archivo heredado sin cifrar
  const iv = buf.subarray(6, 18), tag = buf.subarray(18, 34);
  const d = crypto.createDecipheriv("aes-256-gcm", storageKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(34)), d.final()]);
}

export const docPath = (ref: string, name: string) => path.join(STORE, ref + path.extname(name).toLowerCase());
const queuePath = (ref: string) => path.join(QUEUE, ref + ".enc");

/** Contenido descifrado de un documento (desde OnBase o, si sigue en cola, desde el almacén temporal). */
export function readDocument(d: { onbase_ref: string; name: string }): Buffer | null {
  for (const p of [docPath(d.onbase_ref, d.name), queuePath(d.onbase_ref)]) if (fs.existsSync(p)) return decryptBuffer(fs.readFileSync(p));
  return null;
}

export const onbaseDown = () => process.env.ONBASE_DOWN === "1" || setting("onbase_simulate_down", "0") === "1";

/** Llamada al repositorio OnBase (simulada). Reemplazar por la API REST de OnBase. */
async function send(ref: string, name: string, data: Buffer) {
  if (onbaseDown()) throw new Error("OnBase no responde (HTTP 503 Service Unavailable)");
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(docPath(ref, name), data);
}

/** Envía (o reenvía) el documento a OnBase. Idempotente: si ya está almacenado no hace nada. */
export async function sendToOnBase(docId: number): Promise<string> {
  const d = get<any>("SELECT * FROM documents WHERE id=?", docId);
  if (!d) return "documento inexistente";
  if (d.onbase_status === "almacenado" && fs.existsSync(docPath(d.onbase_ref, d.name))) return "ya almacenado";
  const qp = queuePath(d.onbase_ref);
  if (!fs.existsSync(qp)) throw new Error("No se encontró el archivo en el almacén temporal");
  const data = fs.readFileSync(qp);
  await callExternal("onbase", "almacenar_documento", d.onbase_ref, () => send(d.onbase_ref, d.name, data), 10000);
  fs.rmSync(qp, { force: true });
  run("UPDATE documents SET onbase_status='almacenado' WHERE id=?", docId);
  return "almacenado";
}

registerHandler("onbase.store", async (job) => {
  const r = await sendToOnBase(job.ref_id);
  if (job.attempts > 0 || r === "almacenado") {
    const d = get<any>("SELECT onbase_ref FROM documents WHERE id=?", job.ref_id);
    await audit(null, "onbase_reenvio", "document", job.ref_id, { onbase_status: "en_cola" }, { onbase_status: "almacenado", onbase_ref: d?.onbase_ref, intentos: job.attempts + 1 });
  }
  return r;
});

export async function storeDocument(
  user: { id: number; email: string }, file: File,
  meta: { company_id?: number | null; session_id?: number | null; event_id?: number | null; kind: string },
): Promise<{ ok: boolean; id?: number; error?: string; queued?: boolean }> {
  const err = validateFile(file.name, file.size);
  if (err) return { ok: false, error: err };
  const buf = Buffer.from(await file.arrayBuffer());
  if (scanVirus(buf)) {
    await audit(user, "archivo_infectado_rechazado", "document", null, null, { name: file.name });
    return { ok: false, error: "El archivo fue rechazado por el antivirus" };
  }
  const ref = "ONB-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  // 1) persistencia durable y cifrada antes de llamar a OnBase: si algo falla después, el archivo no se pierde
  fs.mkdirSync(QUEUE, { recursive: true });
  fs.writeFileSync(queuePath(ref), encryptBuffer(buf));
  const id = insert(
    `INSERT INTO documents(company_id,session_id,event_id,name,kind,mime,size,onbase_ref,onbase_status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    meta.company_id ?? null, meta.session_id ?? null, meta.event_id ?? null, file.name, meta.kind, file.type, file.size, ref, "en_cola", user.id, now());
  // 2) envío a OnBase; si falla queda en la cola de reintentos
  let estado = "almacenado";
  try { await sendToOnBase(id); } catch (e: any) { enqueue("onbase.store", id, { ref }); estado = "en_cola"; }
  await audit(user, "subir_documento", "document", id, null, { name: file.name, onbase_ref: ref, kind: meta.kind, estado });
  return { ok: true, id, queued: estado === "en_cola" };
}
