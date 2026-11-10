import { get } from "@/lib/db";
import { demoMode } from "@/lib/auth";
import { verifySignature } from "@/lib/webhooks";
import { logExchange } from "@/lib/resilience";

export const dynamic = "force-dynamic";

/**
 * Receptor de webhooks DE DEMOSTRACIÓN (solo MODO DEMO): simula un sistema suscrito de Compensar.
 * POST /api/webhooks/demo?id=<webhook> verifica la firma X-Signature con el secreto del webhook y responde 200 o 401.
 * Con &fallar=1 responde 503 para probar los reintentos con espera creciente.
 */
export async function POST(req: Request) {
  if (!demoMode()) return new Response("No disponible", { status: 404 });
  const url = new URL(req.url);
  const body = await req.text();
  if (url.searchParams.get("fallar") === "1") {
    logExchange("receptor_demo", req.headers.get("x-event") || "?", req.headers.get("x-delivery-id"), false, 0, "respuesta 503 simulada");
    return new Response("Destino no disponible (simulado)", { status: 503 });
  }
  const w = get<any>("SELECT secret FROM webhooks WHERE id=?", Number(url.searchParams.get("id")));
  const ok = !!w && verifySignature(w.secret, req.headers.get("x-signature") || "", body);
  logExchange("receptor_demo", req.headers.get("x-event") || "?", req.headers.get("x-delivery-id"), ok, 0, ok ? "firma válida" : "firma inválida");
  return ok ? Response.json({ recibido: true, firma: "válida" }) : Response.json({ recibido: false, firma: "inválida" }, { status: 401 });
}
