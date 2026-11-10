import { certificatePdf } from "@/lib/certificates";
import { logError } from "@/lib/resilience";

/**
 * Descarga pública del certificado en PDF (RF-CON-15): /api/certificados/CERT-XXXXXXXXXX.pdf
 * El código es aleatorio (10 caracteres) y no permite adivinar otros certificados.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code || "").replace(/\.pdf$/i, "").toUpperCase();
  if (!/^CERT-[A-Z0-9]{6,20}$/.test(code)) return new Response("Certificado no encontrado", { status: 404 });
  try {
    const origin = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const pdf = await certificatePdf(code, origin);
    if (!pdf) return new Response("Certificado no encontrado", { status: 404 });
    const dl = new URL(req.url).searchParams.get("descargar") === "1";
    return new Response(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="certificado-${pdf.code}.pdf"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const trace = logError("api/certificados", e);
    return new Response(`No fue posible generar el certificado (traza ${trace})`, { status: 500 });
  }
}
