"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get, now, run } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ALERT_CHANNELS, OWNER_ROLES, RULES, runAlerts } from "@/lib/alerts";
import { alertFilter } from "./scope";

const go = (tab: string, kind: "ok" | "error", m: string): never => {
  revalidatePath("/seguimiento");
  redirect(`/seguimiento?tab=${tab}&${kind}=${encodeURIComponent(m)}`);
};

/** «Ejecutar ahora»: corre el mismo proceso que el job programado. */
export async function runAlertsNow(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "alerts.manage");
  const r = await runAlerts(u);
  go(String(fd.get("tab") || "semaforo"), "ok", `Alertas evaluadas: ${r.created} nueva(s), ${r.updated} actualizada(s), ${r.closed} cerrada(s) y ${r.notified} aviso(s) al responsable`);
}

export async function attendAlert(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "alerts.view");
  const f = alertFilter(u);
  const a = get<any>(`SELECT a.* FROM alerts a WHERE a.id=? AND ${f.sql}`, Number(fd.get("id")), ...f.params);
  if (!a) redirect("/sin-acceso");
  if (a.status !== "abierta") go("alertas", "error", "La alerta ya no está abierta");
  const note = String(fd.get("note") ?? "").trim();
  if (note.length < 3) go("alertas", "error", "Describe la acción tomada para atender la alerta");
  run("UPDATE alerts SET status='atendida', resolved_at=?, resolved_by=? WHERE id=?", now(), u.id, a.id);
  await audit(u, "atender_alerta", "alert", a.id, { status: a.status }, { status: "atendida", accion: note });
  go("alertas", "ok", "Alerta marcada como atendida. Si la condición persiste no se duplicará; se cerrará sola cuando se resuelva.");
}

export async function saveRule(fd: FormData) {
  const u = await requireUser();
  requirePerm(u, "alerts.manage");
  const r = get<any>("SELECT * FROM alert_rules WHERE id=?", Number(fd.get("id")));
  if (!r || !RULES[r.key]) go("reglas", "error", "Regla no válida");
  const threshold = Number(fd.get("threshold"));
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 365) go("reglas", "error", "El umbral debe ser un número entero de días entre 0 y 365");
  const owner = String(fd.get("owner_role"));
  const channel = String(fd.get("channel"));
  if (!OWNER_ROLES.some(([k]) => k === owner) || !ALERT_CHANNELS.some(([k]) => k === channel)) go("reglas", "error", "Responsable o canal no válido");
  const active = fd.get("active") === "1" ? 1 : 0;
  run("UPDATE alert_rules SET threshold=?, owner_role=?, channel=?, active=? WHERE id=?", threshold, owner, channel, active, r.id);
  await audit(u, "configurar_regla_alerta", "alert_rule", r.key, { threshold: r.threshold, owner_role: r.owner_role, channel: r.channel, active: r.active }, { threshold, owner_role: owner, channel, active });
  go("reglas", "ok", `Regla «${r.name}» guardada. Se aplica en la próxima ejecución.`);
}
