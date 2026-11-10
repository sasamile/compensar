import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, MessageSquare, Smartphone, Eye, Check } from "lucide-react";
import { all } from "@/lib/db";
import { requirePerm, requireUser } from "@/lib/auth";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/util";
import { markThreadRead, threadsFor } from "./threads";
import * as A from "./actions";

const CH: Record<string, { icon: any; label: string }> = { correo: { icon: Mail, label: "Correo" }, sms: { icon: Smartphone, label: "SMS" }, whatsapp: { icon: MessageSquare, label: "WhatsApp" } };

export default async function Mensajes({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requireUser();
  requirePerm(u, "messages.use");
  const sp = await searchParams;
  const threads = threadsFor(u);
  const cur = threads.find((t) => t.company_id === Number(sp.c) && t.mentor_id === Number(sp.m)) ?? (sp.c ? null : threads[0]);
  if (sp.c && !cur) redirect("/sin-acceso");
  if (cur && cur.role !== "supervisor") await markThreadRead(u, cur.company_id, cur.mentor_id);
  const msgs = cur ? all<any>(`SELECT m.*, us.name author, us.company_id author_company FROM messages m LEFT JOIN users us ON us.id=m.from_user_id
    WHERE m.company_id=? AND m.mentor_id=? ORDER BY m.sent_at, m.id`, cur.company_id, cur.mentor_id) : [];
  const notifs = msgs.length ? all<any>(`SELECT mn.message_id, n.channel, n.status, n.error FROM message_notifications mn JOIN notifications n ON n.id=mn.notification_id
    WHERE mn.message_id IN (${msgs.map(() => "?").join(",")})`, ...msgs.map((m) => m.id)) : [];
  const mineSide = (m: any) => (u.company_id ? m.from_user_id !== m.mentor_id : m.from_user_id === m.mentor_id);
  return (
    <>
      <PageHeader eyebrow="Comunicación" title="Mensajes" subtitle={u.company_id ? "Conversa con tu mentor. Cada mensaje avisa por correo, SMS y WhatsApp, y muestra si fue leído." : "Conversaciones con las empresas que acompañas. Cada mensaje avisa por correo, SMS y WhatsApp y registra su lectura."} />
      <Flash sp={sp} />
      {!threads.length ? (
        <EmptyState title="Aún no tienes conversaciones">{u.company_id ? "Cuando te asignen un mentor podrás escribirle desde aquí." : "Las conversaciones aparecen cuando tienes empresas asignadas o remitidas."}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <nav aria-label="Conversaciones" className="card !p-2">
            <ul className="space-y-1">
              {threads.map((t) => {
                const active = cur && t.company_id === cur.company_id && t.mentor_id === cur.mentor_id;
                return (
                  <li key={`${t.company_id}-${t.mentor_id}`}>
                    <Link href={`/mensajes?c=${t.company_id}&m=${t.mentor_id}`} aria-current={active ? "page" : undefined}
                      className={`block rounded-xl px-3 py-2.5 no-underline ${active ? "bg-brand/10" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{u.company_id ? t.mentor : t.razon_social}</span>
                        {t.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white" aria-label={`${t.unread} sin leer`}>{t.unread}</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">{u.company_id ? "Mentor" : t.role === "supervisor" ? `Mentor: ${t.mentor}` : "Empresa"}{t.last_body ? ` · ${t.last_body}` : " · sin mensajes"}</div>
                      {t.role === "supervisor" && <Badge tone="slate" dot={false}>supervisión</Badge>}
                    </Link>
                  </li>);
              })}
            </ul>
          </nav>
          {cur && (
            <section className="card flex min-h-[420px] flex-col !p-0" aria-label="Conversación">
              <header className="border-b border-slate-100 px-5 py-3">
                <div className="font-semibold text-ink">{cur.razon_social} ↔ {cur.mentor}</div>
                <div className="text-xs text-slate-500">{cur.role === "supervisor" ? "Vista de supervisión (solo lectura)" : "Los mensajes quedan en la auditoría de la plataforma"}</div>
              </header>
              <ol className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {msgs.map((m, i) => {
                  const mine = mineSide(m);
                  const ns = notifs.filter((n) => n.message_id === m.id);
                  return (
                    <li key={m.id} id={i === msgs.length - 1 ? "ultimo" : undefined} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%] ${mine ? "bg-brand text-white" : "bg-slate-100 text-slate-800"}`}>
                        <div className={`mb-0.5 text-[11px] font-semibold ${mine ? "text-white/80" : "text-slate-500"}`}>{m.author}{m.author_company ? "" : " · mentor"}</div>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${mine ? "text-white/80" : "text-slate-500"}`}>
                          <span>{fmtDate(m.sent_at)}</span>
                          {ns.map((n, j) => { const C = CH[n.channel]; return C ? <span key={j} title={`${C.label}: ${n.status}${n.error ? ` (${n.error})` : ""}`} className="inline-flex items-center gap-0.5"><C.icon className="h-3 w-3" aria-hidden />{n.status === "fallido" ? "✕" : <Check className="h-3 w-3" aria-hidden />}<span className="sr-only">{C.label} {n.status}</span></span> : null; })}
                          {m.read_at ? <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" aria-hidden />Leído {fmtDate(m.read_at)}</span> : <span>No leído</span>}
                        </div>
                      </div>
                    </li>);
                })}
                {!msgs.length && <li className="py-10 text-center text-sm text-slate-400">Escribe el primer mensaje de esta conversación.</li>}
              </ol>
              {cur.role !== "supervisor" && (
                <form action={A.sendMessage} className="flex items-end gap-2 border-t border-slate-100 p-3">
                  <input type="hidden" name="company_id" value={cur.company_id} /><input type="hidden" name="mentor_id" value={cur.mentor_id} />
                  <label htmlFor="body" className="sr-only">Mensaje</label>
                  <textarea id="body" name="body" required maxLength={4000} rows={2} className="input flex-1" placeholder="Escribe tu mensaje…" />
                  <button className="btn">Enviar</button>
                </form>)}
            </section>)}
        </div>)}
    </>
  );
}
