# Módulo técnico: seguridad, integraciones y observabilidad

Guía técnica de los requisitos técnicos implementables en código (TEC-1..106 del Anexo 07, ERS §3 RN-07/08/09, §6 RF-INT-01..07, §7 RNF).
Todo lo que el código hace queda auditado en `audit_log` (inalterable).

## 1. Arquitectura de capas (TEC-87, RF-INT-01)

```
Presentación   src/app/**/page.tsx (React Server Components)   — nunca habla con sistemas externos
     │ server actions / route handlers
Lógica         src/app/**/actions.ts, src/app/api/**/route.ts — validación, permisos y alcance, auditoría
     │
Servicios      src/lib/*  (auth, oidc, totp, ratelimit, webhooks, api-auth, notify, onbase, resilience, jobs)
     │ adaptadores
Datos/integración  SQLite (node:sqlite) · OnBase · IAM (OIDC) · correo/SMS/WhatsApp · webhooks · API REST
```

- Ninguna credencial de integración llega al navegador: secretos OIDC, de API y de webhooks viven solo en el servidor.
- Cada integración externa pasa por un adaptador con *circuit breaker*, tiempo de espera, cola de reintentos y registro del intercambio (`src/lib/resilience.ts`).

## 2. Autenticación

### 2.1 Clave + segundo factor TOTP (TEC-1, TEC-6, RN-08, RF-ACC-05)
- `src/lib/totp.ts`: RFC 6238 con `node:crypto` (HMAC-SHA1, 6 dígitos, 30 s, ventana ±1), anti‑repetición (`mfa_state.last_step`), secreto cifrado en reposo (AES-256-GCM), 8 códigos de recuperación de un solo uso (hash SHA-256).
- Setting `mfa_required_internal` (por defecto `1`): usuarios internos (`internal=1`) o de aliado (`aliado_id`) **no reciben sesión** hasta verificar el código; si no lo han configurado, el enrolamiento es obligatorio en ese momento.
- Flujo: `/login` (clave) → `loginPassword` crea un flujo pendiente (`auth_flows` kind `mfa`, cookie `mfa_flow` httpOnly, 10 min) → `/login/mfa` (código, código de recuperación o enrolamiento con QR `otpauth://`) → sesión → `/login/mfa/listo` muestra una vez los códigos de recuperación.
- Empresas: siguen con código de un solo uso al correo (`requestOtp`/`verifyOtp`), sin cambios para el usuario.
- **MODO DEMO** (`DEMO_MODE`, activo salvo `DEMO_MODE=0`): `/login/mfa` y `/cuenta` muestran el código TOTP vigente en un recuadro «MODO DEMO» para no depender de un celular.
- Bloqueos: 5 claves erradas → 15 min de bloqueo; 5 códigos 2FA errados → se anula el flujo.
- `/cuenta`: activar, reconfigurar (nuevo celular), regenerar códigos y desactivar (no permitido si el rol lo exige).

### 2.2 SSO corporativo OIDC (TEC-2, TEC-3, TEC-4, RN-07, RF-ACC-02)
- `src/lib/oidc.ts`: Authorization Code + PKCE (S256), discovery `/.well-known/openid-configuration`, `state` (ligado al navegador por cookie) y `nonce`, canje con `client_secret_post` o `basic`, **verificación RS256 del id_token contra el JWKS con node:crypto** (rechaza `none`/HS256; valida `iss`, `aud`, `azp`, `exp`, `iat`, `nbf`, `nonce`; refresca el JWKS ante rotación de llaves).
- Rutas: `GET /api/auth/oidc/start` → IdP → `GET /api/auth/oidc/callback`. Enlazar con `<a href="/api/auth/oidc/start">` (no `<Link>`, para que no haya *prefetch*).
- Mapeo de grupos a roles: setting `sso_group_map` (JSON `[{group, role, scope_type, scope_id}]`), claim configurable (`groups` en Entra ID). Los roles que da el IAM se marcan `user_roles.granted_by = 0` y se sincronizan en cada ingreso (alta/baja auditadas con antes y después, RN-10).
- Aprovisionamiento JIT (`sso_jit`). Desactivación: si el IdP niega (cuenta deshabilitada) o el usuario ya no está en un grupo mapeado, **no hay acceso**, se retiran los roles del IAM y, si no le queda ningún rol, se cierran sus sesiones. Un usuario inactivo localmente tampoco entra. Las sesiones SSO duran como máximo `sso_session_max_h` (8 h) y luego el IAM debe volver a autorizar.
- MFA en SSO: por defecto se confía en el MFA del IAM (acceso condicional de Entra ID; `sso_trust_idp_mfa`); desmarcándolo, tras el SSO también se pide el TOTP de la plataforma.
- **Entra ID**: registrar una aplicación web, URI de redirección `https://<host>/api/auth/oidc/callback`, emitir el claim `groups` (o *app roles* → claim `roles`), issuer `https://login.microsoftonline.com/<tenant>/v2.0`. Configurar en Integraciones → Seguridad (issuer, client_id, client_secret, claim y mapeo).
- **SAML 2.0**: se federa a través de Entra ID o un *broker* (Keycloak/AD FS) que hable OIDC con la plataforma; la app no procesa aserciones SAML directamente.
- **LDAP/LDAPS**: no se implementa por diseño (TEC-5, ERS §6): obligaría a recibir contraseñas corporativas. El directorio se federa vía IdP.
- **IdP de prueba** (`/mock-idp`, solo demo, setting `sso_mock_enabled`): discovery, `authorize` con selector de funcionarios ficticios y grupos editables, `token` con PKCE, `jwks` con par RSA 2048 generado una vez y persistido en `settings.mock_idp_jwk`. Casos: admin existente, funcionaria nueva (JIT), sin grupo autorizado (negado), cuenta deshabilitada (el IdP niega).

### 2.3 Sesión (RN-09, TEC-104)
- Cookie `sid` httpOnly, SameSite=Lax, `Secure` en producción. Cierre por inactividad `session_timeout_min` (30 min por defecto).
- `/cuenta` → Sesiones activas: dispositivo, método de ingreso, IP, cierre remoto de una o de todas las demás. Cambiar o recuperar la contraseña cierra las demás sesiones.

### 2.4 Protección contra bots (TEC-7, RNF-SEG-03)
- `src/lib/ratelimit.ts`: límites por IP y por cuenta en `rate_limits` (ventana fija, configurables en Integraciones → Seguridad): ingreso 20/15 min por IP y 10/15 min por cuenta; solicitudes de código 10 por IP y 5 por correo; autorregistro 5/h; inscripción 30/10 min; token OAuth 30/5 min; API 600/min por cliente.
- Campo trampa (`website`, componente `src/components/bot-fields.tsx`) en ingreso, código, recuperación, autorregistro e inscripción.
- Cloudflare Turnstile (invisible) si existen `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET` (verificación *fail-closed* en el servidor).
- En producción, AWS WAF Bot Control en el perímetro (fuera del código).

## 3. API REST (TEC-33, TEC-34, RF-INT-02)

1. El administrador crea un cliente en **Integraciones → Clientes API** (scopes y alcance opcional por programa). El `client_secret` se muestra una sola vez y se guarda con scrypt.
2. Token (OAuth 2.0 *client credentials*, 1 h; en la base solo se guarda el SHA-256 del token):
   ```bash
   curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -d grant_type=client_credentials https://<host>/api/oauth/token
   ```
3. Consumo: `curl -H "Authorization: Bearer $TOKEN" "https://<host>/api/v1/empresas?estado=activa&page=1&per_page=50"`.

| Endpoint | Scope | Filtros |
|---|---|---|
| `GET /api/v1/empresas`, `/empresas/{id}` | `empresas.read` | estado, programa, nit, q, sector, ciudad, desde, hasta |
| `GET /api/v1/eventos` | `eventos.read` | estado, programa, tipo, modalidad, desde, hasta |
| `GET /api/v1/inscripciones` | `inscripciones.read` | evento_id, empresa_id, estado, asistio, desde, hasta |
| `GET /api/v1/servicios` | `servicios.read` | programa, aliado_id, tipo, activo |
| `GET /api/v1/sesiones` | `sesiones.read` | empresa_id, mentor_id, estado, aceptada, desde, hasta |
| `GET /api/v1/remisiones` | `remisiones.read` | estado, aliado_id, empresa_id, servicio_id, desde, hasta |
| `GET /api/v1/auditoria` | `auditoria.read` | desde, hasta, desde_id (cursor), accion, entidad, limite, formato=jsonl\|json |

- `bi.read` da lectura a todos los recursos de negocio (no auditoría). `bi.program:<id>` / `bi.aliado:<id>` acotan (los usa también `/api/bi/[dataset]`). `pii.read` habilita correo y celular; sin él se enmascaran (Ley 1581).
- Respuestas paginadas `{data, meta:{page, per_page, total, next}}`; errores RFC 6750 (`401 invalid_token`, `403 insufficient_scope` con `WWW-Authenticate`), `429` con `Retry-After`. Cada llamada queda en `api_log`.
- Contrato **OpenAPI 3.1**: `/api/openapi.json`. Documentación navegable: `/api-docs` (Swagger UI 5.17.14 desde jsDelivr con SRI; botón *Authorize* con client credentials).
- SIEM (TEC-75): `/api/v1/auditoria` entrega JSON Lines (`application/x-ndjson`); lectura incremental con `desde_id` y la cabecera `X-Next-Cursor` (Sentinel, Splunk HEC o QRadar pueden sondearlo).
- SOAP/GraphQL: no nativos; vía adaptador o API Manager (TEC-33/35).

## 4. Webhooks firmados (RF-INT-05)
- `src/lib/webhooks.ts` → `emit(evento, datos)`; eventos: `inscripcion.creada`, `asistencia.registrada`, `certificado.emitido`, `empresa.activada`, `sesion.aceptada`, `cierre.aprobado` (llamadas en las acciones de eventos, empresas, agenda y cierres).
- Sobre: `{id, event, created_at, data}`. Cabeceras: `X-Signature: t=<unix>,v1=<hex>`, `X-Event`, `X-Delivery-Id` (idempotencia).
- Firma: `HMAC-SHA256(secreto, t + "." + cuerpo)`. Verificación en el receptor (Node):
  ```js
  const { t, v1 } = Object.fromEntries(req.headers["x-signature"].split(",").map(p => p.split("=")));
  const exp = crypto.createHmac("sha256", SECRETO).update(`${t}.${rawBody}`).digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(v1)) && Math.abs(Date.now()/1000 - t) < 300;
  ```
- Reintentos: espera creciente `base·2^(n-1)` (base `webhook_backoff_base_s`=30 s, tope 6 h), hasta 10 intentos → `fallido`. Botones «Probar» y «Reintentar»; historial de entregas en Integraciones → Webhooks.
- Receptor de demostración (solo demo): `POST /api/webhooks/demo?id=<webhook>` verifica la firma; `&fallar=1` responde 503 para ver los reintentos.

## 5. Resiliencia e integraciones (TEC-35, TEC-37, RF-INT-03, RF-INT-04)
- `src/lib/resilience.ts`: `callExternal(nombre, operación, ref, fn, timeout)` con circuit breaker persistente (`circuit_breakers`: 3 fallas → abierto 60 s → semiabierto), cola `integration_jobs` idempotente (tipo + referencia) con espera exponencial (`retry_base_s`, hasta 12 intentos), registro `integration_log` sin datos sensibles.
- OnBase (`src/lib/onbase.ts`): el archivo se valida, se escanea (EICAR), se **cifra** y se guarda primero en el almacén temporal `storage/.cola`; luego se envía a OnBase. Si falla, queda `en_cola` y el job `reintentos_onbase` lo reenvía: **nunca se pierde**. Simulación: `ONBASE_DOWN=1` o el botón «Simular caída de OnBase». Lectura: `readDocument(doc)` (descifra; sirve también si sigue en cola).
- Estado de adaptadores (OnBase, Gestión de Clientes, Microsoft 365, correo/SMS/WhatsApp) en Integraciones → Colas e integraciones.

## 6. Cifrado en reposo (TEC-58)
- Archivos: AES-256-GCM (IV aleatorio de 96 bits, etiqueta de autenticación), formato `FEENC1 | iv | tag | datos`. Archivos heredados sin cabecera se leen tal cual.
- Llave: `STORAGE_KEY` (32 bytes en base64 o 64 hex; en producción desde AWS Secrets Manager/KMS). Sin ella se usa una **llave de desarrollo derivada con scrypt de un valor fijo** — no apta para producción (se advierte en Integraciones → Seguridad).
- Secretos TOTP cifrados con la misma llave; contraseñas y secretos de clientes API con scrypt; tokens API y códigos de recuperación con SHA-256.
- Base de datos y respaldos: cifrado de volumen/RDS con KMS (infraestructura).

## 7. Procesos por lotes (TEC-36, RNF-REN-07)
- `src/instrumentation.ts` → `src/instrumentation-node.ts` → `startRunner()` (`src/lib/jobs/runner.ts`): solo en runtime Node, nunca en `next build`, una instancia por proceso (guarda global) y una ejecución simultánea por job entre instancias (candado `job_locks`). Corre `ALL_JOBS` según `everyMs`; cada ejecución queda en `job_runs`. `JOBS_DISABLED=1` lo apaga.
- Jobs del módulo (`src/lib/jobs/tecnico.ts`):

| Job | Frecuencia | Qué hace |
|---|---|---|
| `recordatorios_eventos` | 1 min | Recordatorios configurables por evento (`events.reminders`, p. ej. `7d,1d,1h`, campo «Recordatorios» del formulario) por correo/SMS/WhatsApp; sin duplicar (`reminder_log` UNIQUE); los recordatorios ya vencidos no se envían tarde |
| `reintentos_onbase` | 30 s | Reenvía documentos en cola |
| `entregas_webhooks` | 15 s | Reintenta entregas pendientes |
| `deteccion_anomalias` | 1 min | Picos de ingresos fallidos por IP y de errores técnicos → evento `anomalia`, auditoría y alerta a administradores |
| `limpieza_sesiones_tokens` | 10 min | Sesiones vencidas, tokens API, flujos, códigos, límites y registros técnicos antiguos |
| `anonimizar_invitaciones` | 6 h | Invitaciones no aceptadas tras 90 días (`invite_anonymize_days`) se anonimizan (RNF-PRI-05) |

- Integraciones → Procesos por lotes: estado, historial y «Ejecutar ahora».

## 8. Observabilidad (TEC-41, TEC-73, TEC-77, TEC-78, TEC-80)
- `GET /api/health`: BD (latencia), ejecutor y jobs (última ejecución, atrasos), colas, breakers y errores de la última hora. 200 `ok`/`degradado`, 503 si la BD no responde.
- `GET /api/metrics`: formato Prometheus 0.0.4 (usuarios, sesiones activas, 2FA, colas, entregas, documentos por estado, breakers, errores, ingresos fallidos, eventos de seguridad, notificaciones, API y latencia, duración/éxito de jobs). Opcional `METRICS_TOKEN`. Dynatrace/New Relic/Datadog lo recogen directamente o vía OpenTelemetry Collector (receiver Prometheus → OTLP).
- Errores técnicos: `onRequestError` de Next y `logError()` → `error_log` con identificador de traza, sin datos personales (correos, números y tokens se enmascaran); salida JSON en consola para CloudWatch. Consulta en Integraciones → Errores técnicos.
- Alertas automáticas: `deteccion_anomalias` notifica a quienes tienen `*` o `security.manage` (plantilla `alerta_seguridad`, mensaje de seguridad no desactivable).

## 9. Seguridad web (TEC-22, TEC-55 parcial, TEC-59)
- `next.config.mjs`: CSP (`default-src 'self'`; scripts propios + jsDelivr + Turnstile; `object-src 'none'`; `frame-ancestors 'self'`; `form-action 'self'`), HSTS 2 años con `preload`, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, sin `X-Powered-By`. App Router requiere `'unsafe-inline'` en scripts (y `'unsafe-eval'` solo en desarrollo).
- `src/lib/sanitize.ts`: normalización NFC, sin caracteres de control/bidi ni etiquetas, longitudes máximas, correo/celular/URL/enteros; aplicado en login, registro, cuenta, integraciones e IdP de prueba. Además: consultas siempre parametrizadas y React escapa las salidas.

## 10. Notificaciones: preferencias (RF-NOT-05)
- `/cuenta` → Notificaciones: canales (correo/SMS/WhatsApp) y baja de mensajes no esenciales (recordatorios, encuestas, boletines, novedades; ampliable con `notif_non_essential_keys`).
- `notify()` las respeta y deja constancia `omitido`; los mensajes de seguridad (`otp`, `invitacion`, recuperación, `alerta_seguridad`, o `security: true`) se envían siempre.

## 11. Exportación total y datos personales
- `GET /api/export/total?formato=xlsx|json` (solo Administrador, auditado): todas las tablas — un `.xlsx` con una hoja por tabla (+ índice) y un `.json`. Se omiten solo credenciales (hashes, secretos, tokens). Adjuntos: desde OnBase por su referencia.
- Integraciones → Datos personales: inventario Ley 1581 **generado del esquema vivo** (tabla, campos, registros, finalidad, retención, medidas).

## 12. Variables de entorno

| Variable | Uso |
|---|---|
| `DEMO_MODE` | `0` desactiva el modo demo (códigos en pantalla, IdP de prueba, cliente API demo, receptor de webhooks) |
| `STORAGE_KEY` | Llave AES-256 de archivos y secretos (base64 32 bytes o hex 64) — obligatoria en producción |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Cloudflare Turnstile |
| `PUBLIC_BASE_URL` | Origen público (redirect_uri OIDC, servidores OpenAPI) detrás de proxy |
| `SSO_FORM_ORIGIN` | Origen del IdP si se debe permitir en `form-action` |
| `METRICS_TOKEN` | Protege `/api/metrics` |
| `JOBS_DISABLED`, `JOBS_TICK_MS` | Apagar el ejecutor / periodo del ciclo (5 s) |
| `ONBASE_DOWN` | `1` simula la caída de OnBase |
| `INSECURE_COOKIES` | `1` quita `Secure` a las cookies en producción sin HTTPS (solo pruebas) |

Settings principales (tabla `settings`, editables en Integraciones → Seguridad): `mfa_required_internal`, `session_timeout_min`, `sso_*`, `rl_<acción>`, `anomaly_login_threshold`, `anomaly_error_threshold`, `invite_anonymize_days`, `webhook_backoff_base_s`, `retry_base_s`, `breaker_threshold`, `breaker_open_s`.

Credenciales demo: cliente API `fe_demo_bi` / `fes_demo_PowerBI_2026_solo_para_demostracion` (scopes de lectura sin datos personales ni auditoría; revocar en producción).

## 13. Trazabilidad TEC → implementación

Estados: **Cumple** (en código), **Parcial** (código + parte de infraestructura/proceso), **Fuera del código** (compromiso del proveedor / documento / infraestructura).

| TEC | Tema | Estado | Implementación / nota |
|---|---|---|---|
| 1 | Identidad propia | Cumple | Login, recuperación por código, clave temporal, cambio de clave en `/cuenta`, política robusta, bloqueo, 2FA. (Cognito ofertado = despliegue) |
| 2 | SSO con IAM | Cumple | OIDC + mapeo de grupos; IdP de prueba de punta a punta |
| 3 | SAML/OAuth/OIDC | Parcial | OIDC y OAuth 2.0 nativos; SAML 2.0 vía Entra ID/broker |
| 4 | Entra ID | Cumple | OIDC estándar, claim `groups`/`roles` mapeable |
| 5 | LDAP | Fuera del código | No se implementa por diseño; federación vía IdP |
| 6 | MFA/OTP nativo | Parcial | TOTP + código al correo; *passkeys* no implementadas aún |
| 7 | Anti-bots | Parcial | Límites IP/cuenta, honeypot, Turnstile opcional, bloqueo; AWS WAF Bot Control = infraestructura |
| 8, 9 | Administración autónoma/delegada | Cumple | Módulo de usuarios (otro equipo) + auditoría |
| 10, 11, 15, 16 | Navegadores, responsive, WCAG, sin plugins | Parcial | Interfaz web estándar; pruebas Playwright/axe = proceso |
| 12 | Notificaciones propias o de Compensar | Cumple | `notify()` (adaptador) + webhooks/API para canales de Compensar |
| 13 | App móvil | Fuera del código | Web responsive/PWA |
| 14 | Offline/conflictos | Fuera del código | No opera offline |
| 17–20 | Roadmap, mantenimiento, versión | Fuera del código | Documentos del proveedor |
| 21 | IPv4/IPv6 | Fuera del código | Balanceador dual-stack |
| 22 | TLS/HTTPS/HSTS | Parcial | HSTS, cookies `Secure`, `upgrade-insecure-requests`; TLS y redirección en ALB/CDN |
| 23–31 | Ambientes, nube, tenancy, HA, autoescalado, umbrales, prerrequisitos | Fuera del código | Infraestructura AWS / contrato |
| 32 | ETL | Parcial | API REST, exportaciones Excel/CSV/JSON, `/api/bi`; vistas de réplica = infraestructura |
| 33 | API REST | Cumple | `/api/v1/*`, OAuth 2.0, scopes; SOAP por adaptador |
| 34 | Catálogo OpenAPI | Cumple | `/api/openapi.json` (3.1) + `/api-docs` |
| 35 | ESB/API Manager | Parcial | Expone/consume REST estándar con resiliencia; la conexión al API Manager es despliegue |
| 36 | Batch | Cumple | Ejecutor + `job_runs` + «Ejecutar ahora» (SQS/EventBridge en producción) |
| 37 | Circuit breakers | Cumple | `callExternal` + cola de reintentos |
| 38 | Modalidad de integración | Fuera del código | SaaS/VPN |
| 39, 40 | Desempeño, acceso a datos | Parcial | Paginación, índices propios, procesos en segundo plano; pruebas de carga = proceso |
| 41 | API/tablero de disponibilidad | Cumple | `/api/health`, `/api/metrics` (tablero CloudWatch = infraestructura) |
| 42–54 | SLA, ticketing, DR, RTO/RPO, BCP, RCA, backups | Fuera del código | Compromisos del proveedor / infraestructura |
| 55 | WAF | Parcial | Cabeceras/CSP, sanitización y consultas parametrizadas; AWS WAF = infraestructura |
| 56 | Anti-DDoS | Parcial | Límites de peticiones en la app; Shield/CloudFront = infraestructura |
| 57 | Antivirus | Parcial | Escaneo antes de guardar (firma EICAR simulada); GuardDuty Malware Protection en producción |
| 58 | Cifrado en reposo | Parcial | AES-256-GCM de archivos y secretos TOTP; KMS de BD/respaldos = infraestructura |
| 59 | Sanitización | Cumple | `src/lib/sanitize.ts`, validación en servidor, índices únicos (NIT) |
| 60 | Adjuntos separados de la BD | Cumple | Archivos cifrados fuera de la BD (OnBase/almacén); la BD guarda la referencia |
| 61–71 | Controles en QA, revisión de privilegiados, hardening, auditorías, pentest, vulnerabilidades | Fuera del código | Proceso/contrato (el reporte de usuarios y roles existe en la app) |
| 72 | Logs administrativos | Cumple | `audit_log` inalterable (triggers) — módulo base |
| 73 | Logs técnicos | Cumple | `error_log` con traza, sin datos personales; JSON en consola |
| 74 | Consulta en consola | Cumple | Auditoría (módulo base) + Integraciones → Errores |
| 75 | SIEM | Cumple | `/api/v1/auditoria` JSON Lines con cursor (Firehose = infraestructura opcional) |
| 76, 77 | Observabilidad corporativa | Parcial | Métricas Prometheus (`/api/metrics`), recogibles por OTel → OTLP; trazas OTel = pendiente |
| 78 | Anomalías | Parcial | Picos de ingresos fallidos y de errores → alerta; GuardDuty/CloudWatch AD = infraestructura |
| 79 | Acceso a componentes | Fuera del código | SSM/CloudTrail |
| 80 | Alertas automáticas | Parcial | Alertas de seguridad y errores a administradores; guardia 7x24 = proceso |
| 81, 82 | IA | Fuera de este módulo | — |
| 83–86, 88 | Stack, BD, Git, SO, modelo de datos | Fuera del código | Documentación |
| 87 | Capas separadas | Cumple | Ver §1 |
| 89 | Exportación total | Cumple | `/api/export/total` xlsx/json, auditada |
| 90 | Borrado seguro | Fuera del código | Procedimiento contractual |
| 91 | Inventario de datos personales | Cumple | Integraciones → Datos personales (generado del esquema) |
| 92–98 | BI y reportes | Fuera de este módulo | Módulo de analítica (`/api/bi`), scopes `bi.*` aquí |
| 99–103, 105, 106 | Manuales, políticas, catálogos, ISO, SDLC, SAST | Fuera del código | Documentos/proceso (catálogo de interfaces = OpenAPI) |
| 104 | Timeout configurable | Cumple | `session_timeout_min` en Integraciones → Seguridad (el aviso previo de 2 min corresponde a la interfaz) |

Requisitos del ERS: RN-07 Cumple (SSO, retiro de roles y corte de sesiones, sesión SSO máxima) · RN-08 Cumple (TOTP obligatorio por rol; llaves de acceso pendientes) · RN-09 Cumple · RF-ACC-02 Cumple · RF-ACC-05 Cumple · RF-INT-01 Cumple · RF-INT-02 Cumple · RF-INT-03 Cumple · RF-INT-04 Cumple · RF-INT-05 Cumple · RF-INT-06 Parcial (otros módulos) · RF-INT-07 Fuera del código · RNF-SEG-03 Cumple (en app) · RNF-PRI-05 Cumple · RNF-PRI-06 Parcial (exportación sí; borrado = contrato) · RF-NOT-05 Cumple · RF-CON-05 Cumple.
