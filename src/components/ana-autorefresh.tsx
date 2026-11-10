"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Actualización en tiempo real de tableros (TEC-97): vuelve a consultar los datos transaccionales
 * en el servidor cada `seconds` segundos sin recargar la página. El usuario puede pausarla.
 */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [at, setAt] = useState<string>("");
  useEffect(() => {
    setAt(new Date().toLocaleTimeString("es-CO"));
    if (!on) return;
    const t = setInterval(() => { router.refresh(); setAt(new Date().toLocaleTimeString("es-CO")); }, seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-500 print:hidden" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${on ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} aria-hidden />
      {on ? `En vivo · cada ${seconds} s` : "Pausado"}{at && ` · ${at}`}
      <button type="button" className="underline" onClick={() => setOn(!on)}>{on ? "Pausar" : "Reanudar"}</button>
    </span>
  );
}
