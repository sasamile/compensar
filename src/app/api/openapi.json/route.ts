import { API_SCOPES, TOKEN_TTL_S } from "@/lib/api-auth";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { originFrom } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/** Contrato OpenAPI 3.1 de la API REST (TEC-34, TEC-102). Se sirve en /api/openapi.json y se navega en /api-docs. */
const page = { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 }, description: "Página" };
const perPage = { name: "per_page", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }, description: "Registros por página (máx. 200)" };
const qp = (name: string, description: string, type = "string", extra: any = {}) => ({ name, in: "query", required: false, schema: { type, ...extra }, description });
const meta = { type: "object", properties: { page: { type: "integer" }, per_page: { type: "integer" }, total: { type: "integer" }, next: { type: ["string", "null"], description: "Ruta de la siguiente página o null" } } };
const list = (ref: string) => ({ type: "object", properties: { data: { type: "array", items: { $ref: `#/components/schemas/${ref}` } }, meta } });
const errs = {
  "401": { description: "Token ausente, inválido o vencido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "403": { description: "El token no tiene el scope requerido (insufficient_scope)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "429": { description: "Límite de peticiones excedido (ver Retry-After)" },
};
const op = (summary: string, scope: string, params: any[], schema: any, description = "") => ({
  get: {
    summary, description, tags: [summary.split(" ")[0]], security: [{ oauth2: [scope] }], parameters: params,
    responses: { "200": { description: "OK", content: { "application/json": { schema } } }, ...errs },
  },
});
const S = (props: Record<string, any>) => ({ type: "object", properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, typeof t === "string" ? { type: t } : t])) });
const n = { type: ["string", "null"] };

function spec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Plataforma de Fomento Empresarial — Compensar",
      version: "1.0.0",
      description:
        "API REST de solo lectura para integración, BI y SIEM. Autenticación OAuth 2.0 *client credentials*: " +
        "solicite un token en `/api/oauth/token` con el `client_id` y `client_secret` que entrega el administrador (Integraciones → Clientes API) " +
        `y envíelo como \`Authorization: Bearer <token>\`. Los tokens vencen en ${TOKEN_TTL_S / 60} minutos. Paginación con \`page\` y \`per_page\`. ` +
        "Los datos personales (correo y celular) se enmascaran salvo que el cliente tenga el scope `pii.read` (Ley 1581). " +
        "Eventos salientes por webhooks firmados con HMAC-SHA256 (cabecera `X-Signature: t=<unix>,v1=<hex>` sobre `t + \".\" + cuerpo`): " +
        WEBHOOK_EVENTS.map(([e]) => `\`${e}\``).join(", ") + ".",
    },
    servers: [{ url: origin, description: "Este ambiente" }],
    components: {
      securitySchemes: {
        oauth2: { type: "oauth2", flows: { clientCredentials: { tokenUrl: `${origin}/api/oauth/token`, scopes: Object.fromEntries(API_SCOPES) } } },
      },
      schemas: {
        Error: S({ error: "string", message: "string" }),
        Token: S({ access_token: "string", token_type: { type: "string", enum: ["Bearer"] }, expires_in: "integer", scope: "string" }),
        Empresa: S({ id: "integer", razon_social: "string", nit: "string", dv: "string", sector: n, tamano: n, ciudad: n, programa_id: "integer", programa: "string", estado: { type: "string", enum: ["pendiente", "activa", "suspendida", "rechazada"] }, origen: n, primer_ingreso_completo: "integer", autorizacion_datos_at: n, creada_at: "string" }),
        EmpresaDetalle: { allOf: [{ $ref: "#/components/schemas/Empresa" }, S({ propuesta_valor: n, contactos: { type: "array", items: S({ id: "integer", nombre: "string", email: "string", celular: n, principal: "integer", estado: "string" }) }, mentores: { type: "array", items: S({ id: "integer", nombre: "string", desde: n, activo: "integer" }) }, totales: S({ inscripciones: "integer", asistencias: "integer", sesiones: "integer", sesiones_aceptadas: "integer", remisiones: "integer" }) })] },
        Evento: S({ id: "integer", titulo: "string", tipo: "string", modalidad: n, estado: "string", activo: "integer", programa_id: "integer", lugar: n, inicio: n, fin: n, cupo: "integer", asistencia_minima: "integer", recordatorios: "string", slug: "string", inscritos: "integer", lista_espera: "integer", asistentes: "integer" }),
        Inscripcion: S({ id: "integer", evento_id: "integer", evento: "string", empresa_id: "integer", empresa: "string", nit: "string", nombre: "string", email: { type: "string", description: "Enmascarado sin pii.read" }, celular: n, codigo: "string", estado: "string", lista_espera: "integer", asistio: "integer", minutos: "integer", fuente_asistencia: n, autorizacion_version: n, autorizacion_at: n, inscrito_at: "string", certificado: n, certificado_at: n }),
        Servicio: S({ id: "integer", nombre: "string", tipo: "string", programa_id: "integer", programa: n, aliado_id: "integer", aliado: n, horas: "number", sesiones: "integer", indicadores: n, costo_interno: "number", activo: "integer", remisiones: "integer" }),
        Sesion: S({ id: "integer", empresa_id: "integer", empresa: n, mentor_id: "integer", mentor: n, remision_id: { type: ["integer", "null"] }, programa_id: { type: ["integer", "null"] }, titulo: n, programada_at: n, duracion_min: "integer", modalidad: n, estado: "string", horas: "number", aceptada_at: n, creada_at: n }),
        Remision: S({ id: "integer", empresa_id: "integer", empresa: n, servicio_id: "integer", servicio: n, aliado_id: "integer", aliado: n, mentor_id: { type: ["integer", "null"] }, estado: "string", aceptada_at: n, creada_at: n, cerrada_at: n, sesiones: "integer", horas_aceptadas: "number" }),
        EventoAuditoria: S({ id: "integer", ts: "string", user_id: { type: ["integer", "null"] }, user_email: n, action: "string", entity: "string", entity_id: n, before: {}, after: {}, ip: n, ua: n, source: "string", schema: "string" }),
        WebhookEnvelope: S({ id: "string", event: { type: "string", enum: WEBHOOK_EVENTS.map(([e]) => e) }, created_at: "string", data: { type: "object" } }),
      },
    },
    paths: {
      "/api/oauth/token": {
        post: {
          summary: "Obtener token (client credentials)", tags: ["OAuth"], security: [],
          description: "Credenciales por HTTP Basic (recomendado) o en el cuerpo. `scope` opcional: subconjunto de los autorizados al cliente.",
          requestBody: { required: true, content: { "application/x-www-form-urlencoded": { schema: S({ grant_type: { type: "string", enum: ["client_credentials"] }, client_id: "string", client_secret: "string", scope: "string" }) } } },
          responses: { "200": { description: "Token emitido", content: { "application/json": { schema: { $ref: "#/components/schemas/Token" } } } }, "400": { description: "invalid_scope / unsupported_grant_type" }, "401": { description: "invalid_client" }, "429": { description: "Demasiadas solicitudes" } },
        },
      },
      "/api/v1/empresas": op("Empresas — listado", "empresas.read",
        [page, perPage, qp("estado", "pendiente | activa | suspendida"), qp("programa", "Id de programa", "integer"), qp("nit", "NIT sin DV"), qp("q", "Texto en la razón social"), qp("sector", "Sector"), qp("ciudad", "Ciudad"), qp("desde", "Creadas desde (ISO 8601)"), qp("hasta", "Creadas hasta")],
        list("Empresa")),
      "/api/v1/empresas/{id}": {
        get: {
          summary: "Empresas — detalle", tags: ["Empresas"], security: [{ oauth2: ["empresas.read"] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "OK", content: { "application/json": { schema: S({ data: { $ref: "#/components/schemas/EmpresaDetalle" } }) } } }, "404": { description: "No existe o fuera del alcance del cliente" }, ...errs },
        },
      },
      "/api/v1/eventos": op("Eventos — listado", "eventos.read",
        [page, perPage, qp("estado", "borrador | publicado | cerrado"), qp("programa", "Id de programa", "integer"), qp("tipo", "evento | charla | curso | convocatoria"), qp("modalidad", "presencial | virtual | hibrido"), qp("desde", "Inicio desde (ISO)"), qp("hasta", "Inicio hasta (ISO o AAAA-MM-DD)")],
        list("Evento")),
      "/api/v1/inscripciones": op("Inscripciones — listado", "inscripciones.read",
        [page, perPage, qp("evento_id", "Evento", "integer"), qp("empresa_id", "Empresa", "integer"), qp("estado", "inscrito | lista_espera"), qp("asistio", "0 o 1", "integer"), qp("desde", "Inscritas desde"), qp("hasta", "Inscritas hasta")],
        list("Inscripcion"), "Correo y celular se enmascaran sin el scope `pii.read`."),
      "/api/v1/servicios": op("Servicios — catálogo", "servicios.read",
        [page, perPage, qp("programa", "Id de programa", "integer"), qp("aliado_id", "Aliado", "integer"), qp("tipo", "mentoria | capacitacion | ..."), qp("activo", "0 o 1", "integer")],
        list("Servicio")),
      "/api/v1/sesiones": op("Sesiones — mentorías", "sesiones.read",
        [page, perPage, qp("empresa_id", "Empresa", "integer"), qp("mentor_id", "Mentor", "integer"), qp("estado", "programada | realizada | cancelada"), qp("aceptada", "0 o 1", "integer"), qp("desde", "Programadas desde"), qp("hasta", "Programadas hasta")],
        list("Sesion")),
      "/api/v1/remisiones": op("Remisiones — a aliados", "remisiones.read",
        [page, perPage, qp("estado", "enviada | asignada | aceptada | cerrada | rechazada"), qp("aliado_id", "Aliado", "integer"), qp("empresa_id", "Empresa", "integer"), qp("servicio_id", "Servicio", "integer"), qp("desde", "Creadas desde"), qp("hasta", "Creadas hasta")],
        list("Remision")),
      "/api/v1/auditoria": {
        get: {
          summary: "Auditoría — exportación a SIEM (JSON Lines)", tags: ["Auditoría"], security: [{ oauth2: ["auditoria.read"] }],
          description: "Registro inalterable de auditoría en JSON Lines para Microsoft Sentinel, Splunk o QRadar. Lectura incremental con `desde_id` y la cabecera `X-Next-Cursor`.",
          parameters: [qp("desde", "Desde (ISO 8601). Por defecto, últimas 24 h"), qp("hasta", "Hasta (ISO 8601)"), qp("desde_id", "Cursor: id posterior a este", "integer"), qp("accion", "Acción (p. ej. login, activar)"), qp("entidad", "Entidad (p. ej. company, user)"), qp("limite", "Máximo de líneas (≤ 5000)", "integer"), qp("formato", "jsonl (por defecto) o json", "string", { enum: ["jsonl", "json"] })],
          responses: { "200": { description: "Una línea JSON por evento", headers: { "X-Next-Cursor": { schema: { type: "integer" } } }, content: { "application/x-ndjson": { schema: { $ref: "#/components/schemas/EventoAuditoria" } } } }, ...errs },
        },
      },
      "/api/health": { get: { summary: "Salud del servicio (BD, jobs, colas, breakers)", tags: ["Observabilidad"], security: [], responses: { "200": { description: "ok o degradado" }, "503": { description: "Caído" } } } },
      "/api/metrics": { get: { summary: "Métricas en formato Prometheus / OpenMetrics", tags: ["Observabilidad"], security: [], responses: { "200": { description: "text/plain; version=0.0.4" } } } },
    },
    webhooks: Object.fromEntries(WEBHOOK_EVENTS.map(([e, d]) => [e, {
      post: {
        summary: d, description: "Firmado con HMAC-SHA256: `X-Signature: t=<unix>,v1=<hex(HMAC(secreto, t + \".\" + cuerpo))>`. Idempotencia: `X-Delivery-Id`. Responder 2xx; si no, se reintenta con espera creciente.",
        parameters: [{ name: "X-Signature", in: "header", required: true, schema: { type: "string" } }, { name: "X-Event", in: "header", schema: { type: "string" } }, { name: "X-Delivery-Id", in: "header", schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookEnvelope" } } } },
        responses: { "200": { description: "Recibido" } },
      },
    }])),
  };
}

export async function GET(req: Request) {
  return Response.json(spec(originFrom(req.headers, req.url)), { headers: { "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" } });
}
