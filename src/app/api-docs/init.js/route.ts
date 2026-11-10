export const dynamic = "force-static";

const JS = `window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle({
    url: "/api/openapi.json", dom_id: "#swagger-ui", deepLinking: true, docExpansion: "list",
    defaultModelsExpandDepth: 0, persistAuthorization: false, tryItOutEnabled: true,
  });
});`;

/** Inicialización de Swagger UI como archivo externo (sin scripts en línea). */
export function GET() {
  return new Response(JS, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
