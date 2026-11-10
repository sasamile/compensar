"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { importCompanies, type ImportResult } from "../actions";

export default function Upload({ sources, threshold }: { sources: [string, string][]; threshold: number }) {
  const [res, action, pending] = useActionState<ImportResult | null, FormData>(importCompanies, null);
  const [source, setSource] = useState("");
  return (
    <div className="space-y-4">
      <form action={action} className="card grid gap-4 sm:grid-cols-2">
        <div className="font-semibold text-ink sm:col-span-2">Cargar archivo</div>
        <label className="block">
          <span className="label">Origen del cargue *</span>
          <select name="source" required className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="" disabled>Selecciona…</option>
            {sources.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {source === "otro" ? (
          <label className="block"><span className="label">¿Cuál?</span><input name="source_detail" maxLength={60} className="input" placeholder="Nombre del programa o sistema de origen" /></label>
        ) : <div className="hidden sm:block" />}
        <label className="block sm:col-span-2">
          <span className="label">Archivo (.xlsx, .csv o .json) *</span>
          <input type="file" name="file" accept=".xlsx,.csv,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="block w-full text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="activate" defaultChecked />Activar las empresas al cargarlas</label>
        <div className="sm:col-span-2"><button className="btn" disabled={pending}>{pending ? "Validando…" : "Validar y cargar"}</button></div>
      </form>
      <div aria-live="polite">
        {res && !res.ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <b className="text-red-800">No se guardó nada: corrige {res.errors.length} error(es) y vuelve a cargar</b>
            <ul className="mt-2 max-h-72 list-disc overflow-y-auto pl-5 text-sm text-red-700">{res.errors.slice(0, 200).map((e, i) => <li key={i}>{e.row ? `Fila ${e.row}: ` : ""}{e.msg}</li>)}</ul>
            {res.jobId ? <p className="mt-2 text-sm"><a className="text-red-800 underline" href={`/empresas/cargue/${res.jobId}/errores?formato=xlsx`}>Descargar los errores por fila (Excel)</a> · <a className="text-red-800 underline" href={`/empresas/cargue/${res.jobId}/errores?formato=csv`}>CSV</a></p> : null}
          </div>)}
        {res?.ok && res.background && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <b>Tu archivo tiene {res.total} filas (más de {threshold}): se procesa en segundo plano.</b> Puedes seguir trabajando; te avisaremos con una notificación y un correo al terminar.
            {" "}<Link className="underline" href={`/empresas/cargue?job=${res.jobId}`}>Ver el estado del cargue #{res.jobId}</Link>
          </div>)}
        {res?.ok && !res.background && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <b className="text-emerald-800">✓ {res.created} empresa(s) creadas</b> — cada representante recibió su invitación{res.linked ? `; ${res.linked} contacto(s) que ya tenían cuenta quedaron vinculados a la nueva empresa` : ""}.
            {res.creds && res.creds.length > 0 && <>
              <p className="mt-2 text-xs text-emerald-700">(MODO DEMO) credenciales temporales:</p>
              <ul className="mt-1 text-xs text-emerald-900">{res.creds.map((c) => <li key={c.email}><code>{c.email}</code> · <code>{c.pw}</code></li>)}</ul></>}
            {res.linkedEmails && res.linkedEmails.length > 0 && <p className="mt-2 text-xs text-emerald-800">Vinculados: {res.linkedEmails.join(", ")}</p>}
          </div>)}
      </div>
    </div>
  );
}
