import { headers } from "next/headers";
import { run, now } from "./db";

export async function reqInfo() {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "127.0.0.1").split(",")[0].trim();
    return { ip, ua: h.get("user-agent") || "" };
  } catch {
    return { ip: "sistema", ua: "" };
  }
}

export async function audit(
  user: { id?: number; email?: string } | null,
  action: string, entity: string, entityId: string | number | null,
  before: any = null, after: any = null,
) {
  const { ip, ua } = await reqInfo();
  run(
    "INSERT INTO audit_log(ts,user_id,user_email,action,entity,entity_id,before,after,ip,ua) VALUES(?,?,?,?,?,?,?,?,?,?)",
    now(), user?.id ?? null, user?.email ?? null, action, entity, entityId == null ? null : String(entityId),
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), ip, ua,
  );
}
