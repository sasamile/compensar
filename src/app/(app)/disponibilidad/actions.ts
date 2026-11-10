"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, insert, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MODALITIES, WEEKDAYS, canManageAvailability, toMin } from "../agenda/agenda-lib";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (mentorId: number, kind: "ok" | "error", m: string) => { revalidatePath("/disponibilidad"); redirect(`/disponibilidad?mentor=${mentorId}&${kind}=${encodeURIComponent(m)}`); };
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Agrega una franja semanal (RF-ACO-04). La administra el mentor o, para los mentores de su alcance, el Gestor de Mentorías / Administrador. */
export async function addSlot(fd: FormData) {
  const u = await requireUser();
  const mentorId = Number(fd.get("mentor_id"));
  if (!canManageAvailability(u, mentorId)) redirect("/sin-acceso");
  const days = fd.getAll("weekday").map(Number).filter((d) => d >= 1 && d <= 7);
  const a = s(fd, "start_time"), b = s(fd, "end_time"), mod = s(fd, "modality");
  if (!days.length) go(mentorId, "error", "Elige al menos un día");
  if (!HM.test(a) || !HM.test(b)) go(mentorId, "error", "Usa horas válidas (HH:MM)");
  if (toMin(b) - toMin(a) < 30) go(mentorId, "error", "La franja debe durar al menos 30 minutos y terminar después de empezar");
  if (!(MODALITIES as readonly string[]).includes(mod)) go(mentorId, "error", "Modalidad no válida");
  const clash = days.filter((d) => get("SELECT 1 FROM mentor_availability WHERE mentor_id=? AND weekday=? AND active=1 AND start_time<? AND end_time>?", mentorId, d, b, a));
  if (clash.length) go(mentorId, "error", `La franja se cruza con otra ya registrada el ${clash.map((d) => WEEKDAYS[d].toLowerCase()).join(", ")}`);
  for (const d of days) {
    const id = insert("INSERT INTO mentor_availability(mentor_id,weekday,start_time,end_time,modality,active) VALUES(?,?,?,?,?,1)", mentorId, d, a, b, mod);
    await audit(u, "crear_disponibilidad", "mentor_availability", id, null, { mentor_id: mentorId, dia: WEEKDAYS[d], inicio: a, fin: b, modalidad: mod });
  }
  go(mentorId, "ok", days.length > 1 ? `Se agregaron ${days.length} franjas` : "Franja agregada");
}

export async function removeSlot(fd: FormData) {
  const u = await requireUser();
  const slot = get<any>("SELECT * FROM mentor_availability WHERE id=? AND active=1", Number(fd.get("id")));
  if (!slot || !canManageAvailability(u, slot.mentor_id)) redirect("/sin-acceso");
  run("UPDATE mentor_availability SET active=0 WHERE id=?", slot.id);
  await audit(u, "eliminar_disponibilidad", "mentor_availability", slot.id, { dia: WEEKDAYS[slot.weekday], inicio: slot.start_time, fin: slot.end_time, modalidad: slot.modality }, { active: 0 });
  go(slot.mentor_id, "ok", `Franja del ${WEEKDAYS[slot.weekday].toLowerCase()} ${slot.start_time}–${slot.end_time} eliminada. Las sesiones ya programadas no cambian.`);
}
