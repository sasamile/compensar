"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresca la página mientras haya cargues en cola o procesando (RNF-REN-07). */
export default function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return <p className="sr-only" aria-live="polite">Actualizando el estado de los cargues automáticamente.</p>;
}
