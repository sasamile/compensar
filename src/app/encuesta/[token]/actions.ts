"use server";
import { redirect } from "next/navigation";
import { get, now, run } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ASPECTS } from "@/lib/surveys";

const int = (fd: FormData, k: string, min: number, max: number) => {
  const v = String(fd.get(k) ?? "");
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};

/** Respuesta pública (sin sesión) de una encuesta. Solo se responde una vez: la actualización exige status='enviada'. */
export async function answerSurvey(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const base = `/encuesta/${encodeURIComponent(token)}`;
  const sv = get<any>("SELECT * FROM surveys WHERE token=?", token);
  if (!sv) redirect(base);
  if (sv.status !== "enviada") redirect(`${base}?error=${encodeURIComponent("Esta encuesta ya fue respondida. ¡Gracias!")}`);
  const nps = int(fd, "nps", 0, 10), sat = int(fd, "satisfaction", 1, 5);
  if (nps == null || sat == null) redirect(`${base}?error=${encodeURIComponent("Responde la recomendación (0 a 10) y la satisfacción general (1 a 5)")}`);
  const answers: Record<string, number | null> = {};
  for (const [k] of ASPECTS) answers[k] = int(fd, `a_${k}`, 1, 5);
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 2000);
  const r = run("UPDATE surveys SET status='respondida', nps=?, satisfaction=?, answers=?, comment=?, answered_at=? WHERE id=? AND status='enviada'",
    nps, sat, JSON.stringify(answers), comment || null, now(), sv.id);
  if (!Number(r.changes)) redirect(`${base}?error=${encodeURIComponent("Esta encuesta ya fue respondida. ¡Gracias!")}`);
  await audit({ email: "encuesta-publica" }, "responder_encuesta", "survey", sv.id, { status: "enviada" }, { status: "respondida", nps, satisfaction: sat });
  redirect(`${base}?ok=1`);
}
