"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Refresco automático de la página de estado (RNF-OBS-07). */
export default function Refresh({ everyMs = 15000 }: { everyMs?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(Math.round(everyMs / 1000));
  useEffect(() => {
    const r = setInterval(() => { router.refresh(); setLeft(Math.round(everyMs / 1000)); }, everyMs);
    const t = setInterval(() => setLeft((s) => Math.max(1, s - 1)), 1000);
    return () => { clearInterval(r); clearInterval(t); };
  }, [router, everyMs]);
  return (
    <button type="button" onClick={() => { router.refresh(); setLeft(Math.round(everyMs / 1000)); }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />Actualizar <span className="text-slate-400">(automático en {left} s)</span>
    </button>
  );
}
