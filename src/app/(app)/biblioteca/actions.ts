"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, now, run } from "@/lib/db";
import { programScope, requirePerm, requireUser, type User } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeDocument } from "@/lib/onbase";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (kind: "ok" | "error", m: string, extra = ""): never => {
  revalidatePath("/biblioteca");
  redirect(`/biblioteca?${extra}${kind}=${encodeURIComponent(m)}`);
};
const KINDS = ["documento", "video", "enlace", "herramienta"];

function canManageProgram(u: User, programId: number | null) {
  const sc = programScope(u, "library.manage");
  return sc === null || (programId != null && sc.includes(programId));
}

async function readContent(u: User, fd: FormData, old?: any) {
  const title = s(fd, "title"), kind = KINDS.includes(s(fd, "kind")) ? s(fd, "kind") : "documento";
  let url = s(fd, "url");
  const servicio_id = Number(fd.get("servicio_id")) || null;
  let program_id = Number(fd.get("program_id")) || null;
  if (servicio_id) program_id = get<any>("SELECT program_id FROM servicios WHERE id=?", servicio_id)?.program_id ?? program_id;
  const back = old ? `edit=${old.id}&` : "";
  if (title.length < 3) go("error", "El título es obligatorio", back);
  if (!canManageProgram(u, program_id)) go("error", "No puedes publicar contenidos para ese programa", back);
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) go("error", "El enlace debe empezar por http:// o https://", back);
  const file = fd.get("file") as File | null;
  let doc_id = old?.doc_id ?? null;
  if (file && typeof file === "object" && file.size > 0) {
    const r = await storeDocument(u, file, { kind: "biblioteca" });
    if (!r.ok) go("error", r.error || "No se pudo guardar el archivo", back);
    doc_id = r.id;
  }
  if (!url && !doc_id) go("error", "Sube un archivo o indica el enlace / video", back);
  if (doc_id && url && file && file.size > 0) url = ""; // si sube archivo nuevo, prevalece el archivo
  return { title, description: s(fd, "description"), kind, url: url || null, doc_id, program_id, servicio_id, tags: s(fd, "tags") };
}

export async function createContent(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "library.manage");
  const c = await readContent(u, fd);
  const id = insert("INSERT INTO contents(title,description,kind,url,doc_id,program_id,servicio_id,tags,active,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)",
    c.title, c.description, c.kind, c.url, c.doc_id, c.program_id, c.servicio_id, c.tags, u.id, now());
  await audit(u, "publicar_contenido", "content", id, null, c);
  go("ok", `«${c.title}» publicado en la biblioteca`);
}

export async function updateContent(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "library.manage");
  const old = get<any>("SELECT * FROM contents WHERE id=?", Number(fd.get("id")));
  if (!old || !canManageProgram(u, old.program_id)) redirect("/sin-acceso");
  const c = await readContent(u, fd, old);
  run("UPDATE contents SET title=?, description=?, kind=?, url=?, doc_id=?, program_id=?, servicio_id=?, tags=? WHERE id=?",
    c.title, c.description, c.kind, c.url, c.doc_id, c.program_id, c.servicio_id, c.tags, old.id);
  await audit(u, "editar_contenido", "content", old.id, old, c);
  go("ok", "Contenido actualizado");
}

export async function toggleContent(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "library.manage");
  const old = get<any>("SELECT * FROM contents WHERE id=?", Number(fd.get("id")));
  if (!old || !canManageProgram(u, old.program_id)) redirect("/sin-acceso");
  const active = old.active ? 0 : 1;
  run("UPDATE contents SET active=? WHERE id=?", active, old.id);
  await audit(u, active ? "publicar_contenido" : "retirar_contenido", "content", old.id, { active: old.active }, { active });
  go("ok", active ? "Contenido visible de nuevo" : "Contenido retirado (ya no lo ven los usuarios)");
}
