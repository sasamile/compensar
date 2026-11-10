"use client";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X, Star } from "lucide-react";
import { submitFeedback, type FeedbackState } from "@/app/(app)/retroalimentacion/actions";

const KINDS: [string, string][] = [["error", "Algo no funciona"], ["mejora", "Sugerencia de mejora"], ["duda", "No entendí algo"], ["requisito", "Falta un requisito"], ["positivo", "Me gustó"]];

/** Botón del encabezado: abre un panel para dejar un comentario sobre la pantalla actual. */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm hover:border-brand hover:text-brand print:hidden" aria-haspopup="dialog">
        <MessageSquarePlus className="h-4 w-4" /><span className="hidden sm:inline">Comentarios</span>
      </button>
      {open && <Panel onClose={() => setOpen(false)} />}
    </>
  );
}

/** El panel se monta solo al abrirlo, así cada comentario empieza con el formulario vacío. */
function Panel({ onClose }: { onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const path = usePathname();
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitFeedback, null);
  const setOpen = (v: boolean) => { if (!v) onClose(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center print:hidden" role="dialog" aria-modal="true" aria-labelledby="fb-title">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            <h2 id="fb-title" className="text-lg font-semibold text-ink">Cuéntanos qué piensas</h2>
            <p className="mt-0.5 text-sm text-slate-500">Tu comentario queda ligado a esta pantalla: <code className="rounded bg-slate-100 px-1 text-xs">{path}</code></p>
            {state?.ok ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                {state.message}
                <div className="mt-3 flex gap-2"><button type="button" className="btn btn-sm" onClick={() => { setOpen(false); }}>Cerrar</button></div>
              </div>
            ) : (
              <form action={action} className="mt-4 space-y-3">
                <input type="hidden" name="page" value={path} /><input type="hidden" name="rating" value={rating} />
                <div>
                  <label className="label" htmlFor="fb-kind">Tipo de comentario</label>
                  <select id="fb-kind" name="kind" defaultValue="mejora" className="input">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>
                <div>
                  <span className="label">¿Qué tan fácil fue esta pantalla? (opcional)</span>
                  <div className="flex gap-1" role="radiogroup" aria-label="Calificación">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} de 5`} onClick={() => setRating(rating === n ? 0 : n)} className="rounded p-0.5">
                        <Star className={`h-6 w-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                      </button>))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="fb-msg">Tu comentario</label>
                  <textarea id="fb-msg" name="message" rows={4} required minLength={5} maxLength={2000} className="input" placeholder="Qué hiciste, qué esperabas y qué pasó." autoFocus />
                </div>
                {state && !state.ok && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
                <button className="btn w-full" disabled={pending}>{pending ? "Enviando…" : "Enviar comentario"}</button>
              </form>)}
          </div>
        </div>, document.body)}
    </>
  );
}
