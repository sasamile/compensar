# Módulo plataforma (brechas transversales del ERS)

Cierra requisitos que atraviesan toda la aplicación: pruebas automáticas de permisos y aislamiento, bloqueo por códigos errados, contactos multiempresa, importación en varios formatos y en segundo plano, edición del catálogo, marca y página de estado.

## 1. Pruebas automáticas (`npm test`)

```
npm test                  # todas las pruebas (node --test + tsx; alias @/ resuelto con los paths de tsconfig)
npm run aprobar-permisos  # regenera docs/matriz-permisos-aprobada.json (acto de aprobación)
```

- Cada archivo `tests/*.test.ts` corre en su propio proceso con una **base SQLite temporal** (`DB_FILE` en el directorio temporal del sistema). La base se siembra con la semilla demo y se borra al terminar.
- `next/headers` y `next/cache` se simulan con `mock.module` de `node:test` (flag `--experimental-test-module-mocks`). Así se ejecutan las funciones de `src/lib` **y las server actions reales**, con sesiones simuladas (`loginAs(correo)`). `redirect()` de Next lanza `NEXT_REDIRECT`; `redirectOf()` devuelve la URL.
- Utilidades: `tests/helpers.ts`. Matriz: `tests/matriz.ts`.

| Archivo | Qué verifica |
|---|---|
| `tests/permisos.test.ts` | RF-ACC-07 / §9: recorre **todas** las combinaciones rol × permiso (12 roles × 71 permisos = 852) y falla mostrando cada diferencia si alguna cambió sin aprobación. Incluye una autoverificación (cambiar un permiso hace fallar la comparación) e invariantes de mínimos privilegios. |
| `tests/aislamiento.test.ts` | §9 «ningún rol ve datos fuera de su alcance»: para **cada usuario demo** compara `companyFilter`, `canSeeCompany` (enlace directo a registros ajenos) y `sessionFilter` con el alcance esperado: mentor2 nada; mentor1 La Espiga; coordinador solo empresas remitidas a su aliado; empresa y colaborador solo la suya; gestor y auxiliar su programa; admin y auditor todo. También RN-04 (roles combinados = unión) y el contacto multiempresa. |
| `tests/separacion-funciones.test.ts` | RN-05 con las server actions reales de pagos y cierres: quien registró horas no aprueba el pago ni el cierre; quien aprobó el cierre no aprueba el pago del mismo servicio; sin conflicto, el aprobador sí aprueba. |
| `tests/plataforma.test.ts` | RF-ACC-03, RF-EMP-03, RF-INT-06, RNF-REN-07 (300 filas), RF-PAR-02 y RF-NOT-04 (ver abajo). |

### Cómo aprobar un cambio de permisos
1. Cambia los permisos del rol en `src/lib/seed.ts` (o agrega un permiso al catálogo `src/lib/perms.ts`).
2. `npm test` falla y lista cada combinación cambiada, p. ej. `Rol mentor (Mentor) · permiso payments.approve: aprobado «no» → actual «sí»`.
3. Si el cambio es correcto: `npm run aprobar-permisos` actualiza `docs/matriz-permisos-aprobada.json` (imprime lo aprobado) y se confirma en Git; el commit con su revisor es la aprobación.

La matriz se calcula desde los roles del sistema sembrados por `src/lib/seed.ts` y se evalúa con el mismo `can()` de `src/lib/auth.ts`, de modo que los comodines (`*`, `report:*`) también quedan cubiertos. Incluye `report:R-01…R-15` y permisos usados por roles fuera del catálogo (`company.manage_profile`).

## 2. Bloqueo por códigos errados (RF-ACC-03)
- Ingreso con código al correo y recuperación de clave (`verifyOtp`): al **5.º código errado por cuenta** la cuenta queda bloqueada **15 minutos** para códigos; el código vigente se invalida, no se emiten códigos nuevos y queda `bloqueo_codigo` en auditoría y en `security_events`.
- Antes del bloqueo se avisa cuántos intentos quedan. La respuesta es igual exista o no el correo.
- Configurable: settings `codigo_max_fallidos` (5) y `codigo_bloqueo_min` (15). Lógica en `src/lib/ratelimit.ts` (`codeLockStatus`, `registerCodeFailure`, `clearCodeFailures`).

## 3. Contactos multiempresa (RF-EMP-03)
- Al crear una empresa (individual o por cargue) con un correo que **ya es usuario de una empresa**, no se rechaza: se vincula como contacto (`company_contacts`, rol `representante`) con su rol `empresa` de alcance `company` sobre la nueva empresa, y recibe la notificación `vinculacion_empresa`. Si el correo es de un **usuario interno o de aliado**, se rechaza con un mensaje claro.
- **Empresa activa**: el selector del encabezado (`src/components/company-switcher.tsx`) aparece cuando el usuario tiene más de una empresa. Guarda `sessions.active_company_id` (acción `switchCompany` en `src/app/login/actions.ts`) y registra `cambiar_empresa_activa` en auditoría.
- `currentUser()` devuelve `company_id` = empresa activa **solo si es suya** (principal o vinculada); si no, la principal. Los permisos de alcance `company` se limitan a los de la empresa activa, y `is_principal` sale del vínculo. Todo lo que filtra por `user.company_id` (`companyFilter`, `sessionFilter`…) funciona sin cambios.
- Funciones nuevas en `src/lib/auth.ts`: `userCompanies`, `isContactOf`, `withActiveCompany`, `loadUser`, `hashPasswordAsync`.

## 4. Importación de empresas (RF-INT-06, Anexo 05 #118, RNF-REN-07)
- `/empresas/cargue` acepta **Excel (.xlsx), CSV (coma o punto y coma, UTF-8) y JSON** (arreglo de objetos o `{"empresas": [...]}`), con la **misma validación fila por fila** y **todo o nada**: NIT y DV (módulo 11), obligatorios, correo y celular, programa existente y con permiso del usuario, duplicados dentro del archivo, NIT ya en el programa / en la organización, contacto interno.
- Columnas por encabezado (con alias) o, si no hay encabezados reconocibles, por el orden de la plantilla. Plantilla descargable en los tres formatos: `/api/empresas/plantilla?formato=xlsx|csv|json`.
- **Origen del cargue** obligatorio, guardado en `companies.source`: `cargue_masivo` (Cargue directo), `propulsor_empresarial`, `universidad_empresa`, `dei`, `otro` / `otro:<detalle>`. El listado de empresas muestra y filtra por origen.
- **Segundo plano**: más de 50 filas se encolan en `import_jobs` (payload = filas) y las procesa el job `cargue_empresas` (cada 5 s) con la misma validación; al terminar avisa al usuario con la plantilla `cargue_terminado` (notificación en la plataforma + correo) y borra el payload. Las claves temporales se calculan con scrypt asíncrono en lotes para no bloquear el servidor (300 filas ≈ 8 s).
- Cada cargue, inmediato o en segundo plano, queda en `import_jobs`; `/empresas/cargue` lista **mis cargues** con estado, resultado y errores por fila (descarga en Excel/CSV: `/empresas/cargue/<id>/errores?formato=xlsx|csv`), y se refresca solo mientras haya cargues en cola.
- Motor compartido: `src/lib/jobs/plataforma.ts` (`parseCompanyFile`, `validateCompanyRows`, `importCompanyRows`, `linkContact`, `processImportJob`).
- Para que el enlace del correo sea absoluto define `APP_URL` (o el setting `app_url`).

## 5. Catálogo editable (RF-PAR-02)
Configuración → Programas y rutas: el nombre de cada eje, línea y ruta (y la descripción de la ruta) se edita en línea. Conserva el id, por lo que el historial y las asignaciones no se pierden; queda `renombrar` en auditoría con valor anterior y nuevo. Inactivar sigue sin borrar.

## 6. Marca (RF-PAR-06, RF-NOT-04)
- Configuración → Marca → **Logo**: PNG o JPG hasta 2 MB; se valida que el contenido coincida con la extensión y pasa por `storeDocument` (antivirus, cifrado, OnBase). Guarda el setting `brand_logo_doc` (id del documento) y queda `cambiar_logo` / `quitar_logo` en auditoría.
- `/api/marca/logo` lo sirve públicamente (solo el documento configurado, tipo `marca_logo`). Se muestra en el menú lateral, en las pantallas de acceso (`AuthLayout`) y en `/estado`; si no hay logo se usa la inicial.
- Mensajes: `notify()` aplica `brandMessage()` a todo lo que envía: el correo lleva encabezado con el nombre y subtítulo, asunto «Compensar | …» y pie (setting `brand_email_footer`); SMS y WhatsApp llevan el prefijo «Compensar:» (setting `brand_sms_prefix`, por defecto el nombre). No cambia el control de plantillas aprobadas ni las preferencias del usuario. Ambos campos se editan en Configuración → Marca.

## 7. Página de estado (RNF-OBS-07)
`/estado` es pública y sin datos sensibles: estado general, plataforma web (tiempo en servicio, versión, errores técnicos de la última hora), base de datos (latencia), procesos por lotes (ejecutor, fallas, atrasos, éxito 24 h), colas (integraciones, webhooks, cargues), desempeño de la API (llamadas, latencia, 5xx) e integraciones (circuit breaker y disponibilidad 24 h). Usa la misma función de `/api/health` y se refresca cada 15 s.

## Trazabilidad RF → archivos

| Requisito | Archivos |
|---|---|
| RF-ACC-07, §9 matriz rol-permiso | `tests/permisos.test.ts`, `tests/matriz.ts`, `tests/aprobar-permisos.ts`, `docs/matriz-permisos-aprobada.json`, `package.json` (scripts `test`, `aprobar-permisos`; `tsx` fijo) |
| §9 aislamiento, RN-01/02/04 | `tests/aislamiento.test.ts`, `tests/helpers.ts` |
| RN-05 separación de funciones | `tests/separacion-funciones.test.ts` (prueba `src/app/(app)/pagos/actions.ts` y `src/app/(app)/cierres/actions.ts`) |
| RF-ACC-03 bloqueo de códigos | `src/lib/ratelimit.ts`, `src/app/login/actions.ts`, `tests/plataforma.test.ts` |
| RF-EMP-03 contactos multiempresa | `src/lib/auth.ts`, `src/app/login/actions.ts` (`switchCompany`), `src/components/company-switcher.tsx`, `src/components/shell.tsx` (encabezado), `src/app/(app)/empresas/actions.ts`, `src/lib/jobs/plataforma.ts`, `src/lib/seeds/plataforma.ts` (`vinculacion_empresa`) |
| RF-INT-06, Anexo 05 #118 | `src/lib/jobs/plataforma.ts`, `src/app/(app)/empresas/actions.ts`, `src/app/(app)/empresas/cargue/*`, `src/app/api/empresas/plantilla/route.ts`, `src/app/(app)/empresas/page.tsx` |
| RNF-REN-07 segundo plano | `src/lib/jobs/plataforma.ts` (job `cargue_empresas`), `src/app/(app)/empresas/cargue/page.tsx`, `auto-refresh.tsx`, `[id]/errores/route.ts`, `src/lib/seeds/plataforma.ts` (`cargue_terminado`) |
| RF-PAR-02 editar catálogo | `src/app/(app)/configuracion/actions.ts` (`renameNode`), `src/app/(app)/configuracion/page.tsx` |
| RF-PAR-06 marca y logo | `src/app/(app)/configuracion/*` (`uploadLogo`, `removeLogo`), `src/app/api/marca/logo/route.ts`, `src/components/shell.tsx` (bloque de marca), `src/components/auth-layout.tsx` |
| RF-NOT-04 mensajes con la marca | `src/lib/notify.ts` (`brandMessage`) |
| RNF-OBS-07 página de estado | `src/app/estado/page.tsx`, `src/app/estado/refresh.tsx` |
