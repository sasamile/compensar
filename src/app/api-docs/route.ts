export const dynamic = "force-static";

/**
 * Documentación navegable de la API (Swagger UI 5.17.14 desde jsDelivr, versión fija con integridad SRI).
 * Lee el contrato en /api/openapi.json. Botón «Authorize» → client credentials con el client_id/secret del cliente API.
 */
const V = "5.17.14";
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${V}`;
const HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>API — Plataforma de Fomento Empresarial</title>
<link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn" crossorigin="anonymous" />
<style>
  body { margin: 0; background: #fafafa; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { background: #0a2540; color: #fff; padding: 14px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  header b { font-size: 16px; } header a { color: #9cc7ff; font-size: 13px; }
  .topbar { display: none; }
</style>
</head>
<body>
<header><b>API REST · Fomento Empresarial</b><a href="/api/openapi.json">openapi.json</a><a href="/integraciones?tab=clientes">Obtener credenciales (administrador)</a><a href="/">Volver a la plataforma</a></header>
<div id="swagger-ui"><noscript>Activa JavaScript para ver la documentación interactiva, o descarga <a href="/api/openapi.json">openapi.json</a>.</noscript></div>
<script src="${CDN}/swagger-ui-bundle.js" integrity="sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep" crossorigin="anonymous"></script>
<script src="/api-docs/init.js"></script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
