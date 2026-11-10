"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, run, setSetting, setting, now } from "@/lib/db";
import { requireUser, requirePerm } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storeDocument } from "@/lib/onbase";
import { PERM_CATALOG } from "@/lib/perms";

async function admin() {
  const u = await requireUser();
  requirePerm(u, "config.manage");
  return u;
}
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (tab: string, msg?: string) => { revalidatePath("/configuracion"); redirect(`/configuracion?tab=${tab}${msg ? `&ok=${encodeURIComponent(msg)}` : ""}`); };

export async function saveProgram(fd: FormData) {
  const u = await admin();
  const id = Number(fd.get("id") || 0);
  const v = [s(fd, "name"), s(fd, "requirements"), s(fd, "valid_from"), s(fd, "valid_to"), s(fd, "owner"), s(fd, "status") || "activo"];
  if (id) {
    const before = get("SELECT * FROM programs WHERE id=?", id);
    run("UPDATE programs SET name=?,requirements=?,valid_from=?,valid_to=?,owner=?,status=? WHERE id=?", ...v, id);
    await audit(u, "editar", "program", id, before, Object.fromEntries(fd));
  } else {
    const nid = insert("INSERT INTO programs(name,requirements,valid_from,valid_to,owner,status) VALUES(?,?,?,?,?,?)", ...v);
    await audit(u, "crear", "program", nid, null, Object.fromEntries(fd));
  }
  back("programas", "Programa guardado");
}

export async function addNode(fd: FormData) {
  const u = await admin();
  const kind = s(fd, "kind"), name = s(fd, "name"), parent = Number(fd.get("parent"));
  if (!name) back("programas");
  let id = 0;
  if (kind === "eje") id = insert("INSERT INTO ejes(program_id,name) VALUES(?,?)", parent, name);
  if (kind === "linea") id = insert("INSERT INTO lineas(eje_id,name) VALUES(?,?)", parent, name);
  if (kind === "ruta") id = insert("INSERT INTO rutas(linea_id,name,description) VALUES(?,?,?)", parent, name, s(fd, "description"));
  await audit(u, "crear", kind, id, null, { name, parent });
  back("programas", `${kind} creado`);
}

/** RF-PAR-02: renombrar ejes, líneas y rutas sin perder el historial (los registros conservan su id). */
export async function renameNode(fd: FormData) {
  const u = await admin();
  const kind = s(fd, "kind");
  const t = ({ eje: "ejes", linea: "lineas", ruta: "rutas" } as Record<string, string>)[kind];
  const id = Number(fd.get("id"));
  const name = s(fd, "name").slice(0, 150);
  const label = { eje: "Eje renombrado", linea: "Línea renombrada", ruta: "Ruta renombrada" }[kind as "eje"] ?? "Elemento renombrado";
  if (!t || !id) back("programas");
  if (!name) redirect(`/configuracion?tab=programas&error=${encodeURIComponent("El nombre no puede quedar vacío")}`);
  const before = get<any>(`SELECT * FROM ${t} WHERE id=?`, id);
  if (!before) back("programas");
  const desc = kind === "ruta" && fd.has("description") ? s(fd, "description").slice(0, 500) : before.description;
  if (before.name === name && (kind !== "ruta" || before.description === desc)) back("programas", "Sin cambios");
  if (kind === "ruta") run("UPDATE rutas SET name=?, description=? WHERE id=?", name, desc, id);
  else run(`UPDATE ${t} SET name=? WHERE id=?`, name, id);
  await audit(u, "renombrar", kind, id, kind === "ruta" ? { name: before.name, description: before.description } : { name: before.name }, kind === "ruta" ? { name, description: desc } : { name });
  back("programas", `${label}: «${before.name}» → «${name}» (el historial se conserva)`);
}

export async function toggleNode(fd: FormData) {
  const u = await admin();
  const kind = s(fd, "kind"); const t = { eje: "ejes", linea: "lineas", ruta: "rutas", servicio: "servicios", aliado: "aliados" }[kind];
  const id = Number(fd.get("id"));
  const before = get<any>(`SELECT active FROM ${t} WHERE id=?`, id);
  run(`UPDATE ${t} SET active=? WHERE id=?`, before.active ? 0 : 1, id); // inactivar no borra el historial
  await audit(u, before.active ? "inactivar" : "activar", kind, id, before, { active: before.active ? 0 : 1 });
  back(s(fd, "tab") || "programas", `${kind[0].toUpperCase() + kind.slice(1)} ${before.active ? "inactivado" : "activado"} (el historial se conserva)`);
}

export async function saveServicio(fd: FormData) {
  const u = await admin();
  const v = [Number(fd.get("program_id")), Number(fd.get("linea_id")) || null, Number(fd.get("aliado_id")) || null, s(fd, "name"), s(fd, "kind"),
    Number(fd.get("hours") || 0), Number(fd.get("sessions") || 0), s(fd, "indicators"), Number(fd.get("internal_cost") || 0)];
  const id = insert("INSERT INTO servicios(program_id,linea_id,aliado_id,name,kind,hours,sessions,indicators,internal_cost) VALUES(?,?,?,?,?,?,?,?,?)", ...v);
  await audit(u, "crear", "servicio", id, null, Object.fromEntries(fd));
  back("servicios", "Servicio creado");
}

export async function saveAliado(fd: FormData) {
  const u = await admin();
  const id = insert("INSERT INTO aliados(name,nit) VALUES(?,?)", s(fd, "name"), s(fd, "nit"));
  await audit(u, "crear", "aliado", id, null, Object.fromEntries(fd));
  back("aliados", "Aliado creado");
}

export async function saveTemplate(fd: FormData) {
  const u = await admin();
  const id = Number(fd.get("id"));
  const before = get("SELECT * FROM templates WHERE id=?", id);
  // al editar, la plantilla vuelve a requerir aprobación de Compensar
  run("UPDATE templates SET subject=?, body=?, approved=0 WHERE id=?", s(fd, "subject"), s(fd, "body"), id);
  await audit(u, "editar", "template", id, before, Object.fromEntries(fd));
  back("plantillas", "Plantilla guardada (pendiente de aprobación)");
}
export async function approveTemplate(fd: FormData) {
  const u = await admin();
  const id = Number(fd.get("id"));
  run("UPDATE templates SET approved=1, approved_by=? WHERE id=?", u.id, id);
  await audit(u, "aprobar", "template", id, { approved: 0 }, { approved: 1 });
  back("plantillas", "Plantilla aprobada");
}

export async function saveBrand(fd: FormData) {
  const u = await admin();
  const keys = ["brand_name", "brand_color", "brand_tagline", "session_timeout_min", "welcome_text", "consent_text", "consent_version", "brand_sms_prefix", "brand_email_footer"];
  const before: any = {};
  for (const k of keys) { before[k] = get<any>("SELECT value FROM settings WHERE key=?", k)?.value; setSetting(k, s(fd, k)); }
  for (const c of ["correo", "sms", "whatsapp"]) setSetting(`channel_${c}`, fd.get(`channel_${c}`) ? "1" : "0");
  setSetting("onboarding_steps", JSON.stringify(s(fd, "onboarding_steps").split("\n").map((x) => x.trim()).filter(Boolean)));
  await audit(u, "editar", "settings", "marca", before, Object.fromEntries(fd));
  back("marca", "Configuración guardada");
}

/** RF-PAR-06: logo de la marca (PNG o JPG), guardado por el adaptador documental con antivirus; se sirve en /api/marca/logo. */
export async function uploadLogo(fd: FormData) {
  const u = await admin();
  const f = fd.get("logo") as File;
  const bad = (m: string) => redirect(`/configuracion?tab=marca&error=${encodeURIComponent(m)}`);
  if (!f || typeof f === "string" || !f.size) bad("Selecciona la imagen del logo");
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (!["png", "jpg", "jpeg"].includes(ext)) bad("El logo debe ser una imagen PNG o JPG");
  if (f.size > 2 * 1024 * 1024) bad("El logo no puede superar 2 MB");
  const head = Buffer.from(await f.slice(0, 8).arrayBuffer());
  const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (!(ext === "png" ? isPng : isJpg)) bad("El archivo no es una imagen válida (el contenido no coincide con la extensión)");
  const r = await storeDocument(u, f, { kind: "marca_logo" });
  if (!r.ok) bad(r.error || "No se pudo guardar el logo");
  const before = setting("brand_logo_doc", "");
  setSetting("brand_logo_doc", String(r.id));
  await audit(u, "cambiar_logo", "settings", "brand_logo_doc", { brand_logo_doc: before || null }, { brand_logo_doc: r.id, archivo: f.name });
  back("marca", "Logo actualizado: ya se ve en el menú, el ingreso, las landings y los certificados");
}

export async function removeLogo() {
  const u = await admin();
  const before = setting("brand_logo_doc", "");
  setSetting("brand_logo_doc", "");
  await audit(u, "quitar_logo", "settings", "brand_logo_doc", { brand_logo_doc: before || null }, { brand_logo_doc: null });
  back("marca", "Logo retirado: se muestra la inicial de la organización");
}

export async function cloneRole(fd: FormData) {
  const u = await admin();
  const src = get<any>("SELECT * FROM roles WHERE id=?", Number(fd.get("from")));
  const name = s(fd, "name");
  const key = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString(36).slice(-3);
  const id = insert("INSERT INTO roles(key,name,description,internal,perms,system) VALUES(?,?,?,?,?,0)", key, name, `Copia de ${src.name}`, src.internal, src.perms);
  await audit(u, "crear", "role", id, null, { name, from: src.name });
  back("roles", `Rol «${name}» creado a partir de ${src.name}`);
}
export async function saveRole(fd: FormData) {
  const u = await admin();
  const id = Number(fd.get("id"));
  const before = get<any>("SELECT * FROM roles WHERE id=?", id);
  const prev: string[] = JSON.parse(before.perms);
  const catalog = PERM_CATALOG.map(([k]) => k);
  let perms = fd.getAll("perm").map(String).filter((p) => catalog.includes(p));
  if (!perms.includes("report:*")) perms = perms.concat(prev.filter((p: string) => p.startsWith("report:") && p !== "report:*"));
  // permisos que no se muestran en el catálogo (p. ej. company.manage_profile) no se pierden al guardar
  perms = perms.concat(prev.filter((p) => p !== "*" && !p.startsWith("report:") && !catalog.includes(p)));
  // «todos los permisos» se conserva si siguen marcados todos
  if (prev.includes("*") && catalog.every((k) => perms.includes(k))) perms = ["*"];
  run("UPDATE roles SET name=?, perms=? WHERE id=?", s(fd, "name") || before.name, JSON.stringify(perms), id);
  await audit(u, "editar", "role", id, { name: before.name, perms: JSON.parse(before.perms) }, { name: s(fd, "name"), perms });
  back("roles", "Rol actualizado");
}
