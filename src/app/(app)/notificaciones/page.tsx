import { Bell as PageIcon } from "lucide-react";
import { all } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { markRead } from "@/lib/notify";
import { Badge, PageHeader, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/util";

export default async function Notificaciones() {
  const u = await requireUser();
  const admin = can(u, "config.manage") || can(u, "audit.view");
  const rows = all<any>(`SELECT * FROM notifications ${admin ? "" : "WHERE user_id=?"} ORDER BY id DESC LIMIT 150`, ...(admin ? [] : [u.id]));
  const mineUnread = rows.filter((r) => r.user_id === u.id && r.channel === "correo" && r.status === "entregado").length;
  if (mineUnread) markRead(u.id); // abrir la bandeja marca el correo como leído (trazabilidad de lectura)
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <>
      <PageHeader icon={PageIcon} title="Notificaciones" subtitle="Correo, SMS y WhatsApp con estado de entrega y lectura" />
      <div className="mb-3 flex gap-2 text-sm"><Badge tone="green">entregado {count("entregado")}</Badge><Badge tone="blue">leído {count("leido") + mineUnread}</Badge><Badge tone="red">fallido {count("fallido")}</Badge></div>
      <Table head={["Fecha", "Canal", "Destinatario", "Mensaje", "Estado"]} empty="Sin notificaciones">
        {rows.map((r) => (
          <tr key={r.id}><Td className="whitespace-nowrap">{fmtDate(r.sent_at)}</Td><Td>{r.channel}</Td><Td className="text-xs">{r.to_addr || "—"}</Td>
            <Td className="max-w-md whitespace-pre-line text-xs">{r.subject && <b>{r.subject} · </b>}{r.body}</Td>
            <Td><Badge>{r.status}</Badge>{r.error && <div className="text-xs text-red-500">{r.error}</div>}</Td></tr>))}
      </Table>
    </>
  );
}
