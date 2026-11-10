"use client";
export default function PrintButton({ label = "Exportar a PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-ghost btn-sm print:hidden">{label}</button>;
}
