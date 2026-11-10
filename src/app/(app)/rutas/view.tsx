import Link from "next/link";
import React from "react";
import { CheckCircle2, Circle, CircleDot, FileText } from "lucide-react";
import { Badge } from "@/components/ui";
import { Progress } from "@/components/charts";
import { fmtDate } from "@/lib/util";
import { indicatorPct, routeTone, STEP_KIND, STEP_STATUS } from "@/lib/routes";
import { can, type User } from "@/lib/auth";

export function RutasNav({ u, active }: { u: User; active: string }) {
  const tabs: [string, string, string, boolean][] = [
    ["rutas", "Rutas de empresas", "/rutas", true],
    ["nueva", "Nueva ruta", "/rutas/nueva", can(u, "routes.manage")],
    ["plantillas", "Plantillas", "/rutas/plantillas", true],
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden" aria-label="Secciones de rutas">
      {tabs.filter((t) => t[3]).map(([k, l, href]) => (
        <Link key={k} href={href} aria-current={active === k ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active === k ? "border-brand font-medium text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</Link>))}
    </nav>
  );
}

const fmtN = (v: number | null | undefined) => (v == null ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(v));

/** Tarjeta de una etapa (vista de empresa y de mentor). */
export function StepCard({ s, n, children }: { s: any; n: number; children?: React.ReactNode }) {
  const Icon = s.status === "completado" ? CheckCircle2 : s.status === "en_curso" ? CircleDot : Circle;
  const color = s.status === "completado" ? "text-emerald-600" : s.status === "en_curso" ? "text-brand" : "text-slate-300";
  const pct = indicatorPct(s);
  const late = s.status !== "completado" && s.due_at && new Date(s.due_at).getTime() < Date.now();
  return (
    <li className="relative pl-9">
      <Icon className={`absolute left-0 top-0.5 h-6 w-6 ${color}`} aria-hidden />
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">Etapa {n} · {STEP_KIND[s.kind] || s.kind}</div>
            <div className="font-medium text-ink">{s.name}</div>
            {(s.servicio || s.evento) && (s.servicio || s.evento) !== s.name && <div className="text-sm text-slate-600">{s.servicio ? `Servicio: ${s.servicio}` : `Curso/evento: ${s.evento}`}</div>}
          </div>
          <Badge tone={routeTone(s.status)}>{STEP_STATUS[s.status] || s.status}</Badge>
        </div>
        {s.indicator && (
          <div className="mt-3">
            <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-600">
              <span>{s.indicator}</span>
              <span>Línea base <b>{fmtN(s.baseline)}</b> · Actual <b>{fmtN(s.current)}</b> · Meta <b>{fmtN(s.goal)}</b></span>
            </div>
            <Progress value={pct ?? 0} />
          </div>)}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {s.due_at && <span className={late ? "font-semibold text-red-600" : ""}>Fecha objetivo: {fmtDate(s.due_at, false)}{late ? " (vencida)" : ""}</span>}
          {s.completed_at && <span>Completada: {fmtDate(s.completed_at)}</span>}
          {s.evidence_doc_id && <a href={`/api/docs/${s.evidence_doc_id}`} className="inline-flex items-center gap-1 text-brand underline"><FileText className="h-3.5 w-3.5" aria-hidden />{s.doc_name || "Evidencia"}</a>}
        </div>
        {children}
      </div>
    </li>
  );
}

const LOG_LABEL: Record<string, string> = {
  creada: "Ruta creada", activada: "Ruta activada", recomendacion: "Recomendación", en_curso: "Etapa iniciada", completado: "Etapa completada",
  reabierto: "Etapa reabierta", evidencia: "Avance / evidencia", editado: "Ajuste de etapas", cierre_solicitado: "Cierre solicitado",
  cierre_rechazado: "Solicitud de cierre rechazada", cerrada: "Ruta cerrada", escalada: "Ruta escalada", pendiente: "Etapa reabierta",
};

/** Línea de tiempo: qué se hizo, cuándo, quién y con qué evidencia (FUN-82). */
export function Timeline({ log }: { log: any[] }) {
  if (!log.length) return <p className="text-sm text-slate-500">Sin movimientos todavía.</p>;
  return (
    <ol className="space-y-4 border-l-2 border-slate-200 pl-4">
      {log.map((l) => (
        <li key={l.id} className="relative text-sm">
          <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand" aria-hidden />
          <div className="font-medium text-ink">{LOG_LABEL[l.action] || l.action}{l.step_name ? <span className="font-normal text-slate-600"> · {l.step_name}</span> : null}</div>
          <div className="text-xs text-slate-500"><time dateTime={l.at}>{fmtDate(l.at)}</time> · {l.user_name || "Sistema"}</div>
          {l.note && <p className="mt-0.5 whitespace-pre-line text-slate-700">{l.note}</p>}
          {l.value != null && <div className="text-xs text-slate-600">Valor del indicador: <b>{fmtN(l.value)}</b></div>}
          {l.doc_id && <a href={`/api/docs/${l.doc_id}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand underline"><FileText className="h-3.5 w-3.5" aria-hidden />{l.doc_name || "Evidencia"}</a>}
        </li>))}
    </ol>
  );
}
