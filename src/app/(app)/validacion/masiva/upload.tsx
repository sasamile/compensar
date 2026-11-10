"use client";
import { useState } from "react";

type Row = { fila: number; nit: string; programa: string; razon_social: string; resultado: string; motivo: string; empresa: string; accion: string };
type Res = { ok: boolean; error?: string; summary?: { total: number; cumple: number; no_cumple: number; errores: number; aplicadas: number }; rows?: Row[]; file?: string; name?: string };

const tone = (r: string) => (r === "Cumple" ? "bg-emerald-100 text-emerald-800" : r === "No cumple" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800");

export default function Upload() {
  const [res, setRes] = useState<Res | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true); setRes(null);
    try {
      const r = await fetch("/api/validacion/masiva?formato=json", { method: "POST", body: new FormData(e.currentTarget) });
      setRes(r.headers.get("content-type")?.includes("json") ? await r.json() : { ok: false, error: await r.text() });
    } catch {
      setRes({ ok: false, error: "No fue posible enviar el archivo. Intenta de nuevo." });
    } finally { setPending(false); }
  }

  function download() {
    if (!res?.file) return;
    const bin = atob(res.file); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = res.name || "resultado-validacion.xlsx"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Sin JavaScript el formulario descarga directamente el Excel de resultado */}
      <form onSubmit={submit} action="/api/validacion/masiva" method="post" encType="multipart/form-data" className="card grid gap-4 md:grid-cols-3">
        <label className="block"><span className="label">Archivo Excel (.xlsx)</span><input type="file" name="file" accept=".xlsx" required className="block w-full text-sm" /></label>
        <label className="block"><span className="label">Qué hacer con el resultado</span>
          <select name="modo" className="input" defaultValue="validar">
            <option value="validar">Solo validar (no cambia decisiones)</option>
            <option value="aprobar">Aprobar las que cumplen (activa la empresa)</option>
            <option value="aprobar_rechazar">Aprobar las que cumplen y rechazar las que no</option>
          </select>
        </label>
        <div className="self-end"><button className="btn w-full md:w-auto" disabled={pending}>{pending ? "Validando…" : "Validar archivo"}</button></div>
        <p className="text-xs text-slate-500 md:col-span-3">Las decisiones solo se aplican a empresas registradas con una solicitud abierta en tu alcance; cada una notifica al solicitante y queda en auditoría.</p>
      </form>
      {res && !res.ok && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{res.error}</div>}
      {res?.ok && res.summary && (
        <section aria-live="polite" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <span><b>{res.summary.total}</b> filas</span>
            <span className="text-emerald-700"><b>{res.summary.cumple}</b> cumplen</span>
            <span className="text-red-700"><b>{res.summary.no_cumple}</b> no cumplen</span>
            <span className="text-amber-700"><b>{res.summary.errores}</b> con error</span>
            <span><b>{res.summary.aplicadas}</b> decisiones aplicadas</span>
            <button onClick={download} className="btn btn-sm ml-auto">⬇ Descargar resultado (Excel)</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px]">
              <thead><tr>{["Fila", "NIT", "Programa", "Razón social", "Resultado", "Motivo", "Acción"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {res.rows!.map((r) => (
                  <tr key={r.fila}>
                    <td className="td">{r.fila}</td><td className="td">{r.nit}</td><td className="td">{r.programa}</td><td className="td">{r.razon_social}</td>
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone(r.resultado)}`}>{r.resultado}</span></td>
                    <td className="td text-xs">{r.motivo}</td><td className="td text-xs">{r.accion}<div className="text-slate-400">{r.empresa}</div></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </section>)}
    </div>
  );
}
