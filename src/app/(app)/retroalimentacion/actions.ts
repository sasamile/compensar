"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { insert, run, now } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { FEEDBACK_KINDS_PUBLIC as FEEDBACK_KINDS } from "@/lib/feedback-kinds";

export type FeedbackState = { ok: boolean; message: string } | null;

/** Guarda un comentario de un probador. Devuelve el resultado (no redirige) para mostrarlo en el mismo panel. */
export async function submitFeedback(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const u = await requireUser();
  const message = String(fd.get("message") || "").trim().slice(0, 2000);
  const kind = String(fd.get("kind") || "mejora");
  if (message.length < 5) return { ok: false, message: "Escribe al menos una frase para que podamos entender tu comentario." };
  if (!FEEDBACK_KINDS[kind]) return { ok: false, message: "Elige el tipo de comentario." };
  const rating = Math.max(0, Math.min(5, Number(fd.get("rating")) || 0)) || null;
  const page = String(fd.get("page") || "").slice(0, 200);
  const id = insert(
    "INSERT INTO feedback(user_id,user_name,user_email,roles,page,kind,rating,message,user_agent,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    u.id, u.name, u.email, Array.from(new Set(u.grants.map((g) => g.role_name))).join(" · "), page, kind, rating, message,
    ((await headers()).get("user-agent") || "").slice(0, 200), now());
  await audit(u, "enviar_comentario", "feedback", id, null, { kind, page });
  revalidatePath("/retroalimentacion");
  return { ok: true, message: "¡Gracias! Tu comentario quedó registrado." };
}

export async function updateFeedback(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "config.manage")) return;
  const id = Number(fd.get("id"));
  const status = ["nuevo", "en_revision", "resuelto", "descartado"].includes(String(fd.get("status"))) ? String(fd.get("status")) : "nuevo";
  run("UPDATE feedback SET status=?, note=?, handled_by=?, handled_at=? WHERE id=?", status, String(fd.get("note") || "").slice(0, 500), u.id, now(), id);
  await audit(u, "actualizar_comentario", "feedback", id, null, { status });
  revalidatePath("/retroalimentacion");
}
