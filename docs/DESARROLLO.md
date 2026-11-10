# Guía de desarrollo (léela antes de tocar código)

Plataforma de Fomento Empresarial (Compensar). Requisitos: `docs/fuentes/ERS.txt`, `docs/fuentes/FUN.txt` (98 funcionalidades del Anexo 07) y `docs/fuentes/TEC.txt` (106 técnicos).

## Stack
Next.js 15 App Router (server components + server actions) · TypeScript (strict off) · Tailwind 4 · SQLite con `node:sqlite` (síncrono) · ExcelJS · qrcode · lucide-react.
Todo en español (es-CO), fechas en hora de Colombia (`America/Bogota`).

## Estructura
- `src/app/(app)/<ruta>/page.tsx` páginas autenticadas (el layout exige sesión y dibuja el menú). `src/app/<ruta>` páginas públicas.
- `src/app/(app)/<ruta>/actions.ts` server actions. **Un archivo con `"use server"` solo puede exportar funciones `async`.** Las funciones síncronas compartidas van en `src/lib/...`.
- Next 15: `params` y `searchParams` son `Promise` → `const sp = await searchParams`.
- Patrón de formularios: `<form action={accion}>` + `redirect("/ruta?ok=" + encodeURIComponent(msg))` o `?error=`; la página muestra `<Flash sp={sp} />`.
- Componentes interactivos: archivo aparte con `"use client"` (p. ej. un constructor). Pueden recibir server actions como props o usar `useActionState`.

## Librerías compartidas (úsalas, no las dupliques)
- `@/lib/db`: `all(sql,...p)`, `get(sql,...p)`, `run(sql,...p)`, `insert(sql,...p)→id`, `tx(fn)`, `now()`, `setting(k,def)`, `setSetting(k,v)`.
- `@/lib/auth`: `requireUser()`, `currentUser()`, `can(u, perm)`, `requirePerm(u, perm)`, `programScope(u, perm)` (null = toda la org), `canInProgram(u, perm, programId)`, `companyFilter(u, alias)` → `{sql, params}` (empresas visibles según alcance del rol), `canSeeCompany(u, id)`, `sessionFilter(u, alias)`, `clientIp()`. `User` tiene `id, email, name, company_id, is_principal, aliado_id, grants[]`.
- `@/lib/audit`: `audit(user, accion, entidad, id, antes, despues)` — **toda escritura se audita**.
- `@/lib/notify`: `notify({ key, vars, email, phone, userId, channels? })` usa plantillas de la tabla `templates` (por canal correo/sms/whatsapp; solo envía si `approved=1`).
- `@/lib/onbase`: `storeDocument(user, file, {company_id, session_id, event_id, kind})` → `{ok, id, error}` (valida formato/tamaño, antivirus, guarda referencia ONB-*). Descarga: `/api/docs/<id>`.
- `@/lib/xlsx`: `toXlsx(nombreHoja, cols, rows)`, `toCsv(cols, rows)`, `fileResponse(buf, nombre, tipo)`, `XLSX_TYPE`.
- `@/lib/util`: `fmtDate(iso, conHora?)`, `localToIso(datetime-local)`, `isoToLocal(iso)`, `rand(n)`, `slugify`, `money`, `jparse(json, def)`, `validNit(nit, dv)`, `nitDv(nit)`.
- `@/components/ui`: `PageHeader {title, subtitle, actions}`, `Badge {tone?}` (color automático por estado), `Table {head[], empty}` + `Td`, `Field {label, hint}`, `Stat {label, value, hint}`, `Notice {kind}`, `Flash {sp}`, `Tabs`, `EmptyState`.
- `@/components/charts`: `BarChart`, `HBarChart`, `Donut`, `LineChart`, `Progress`, `Semaforo`, `Radar`.
- `@/components/print-button`: botón «Exportar a PDF» (imprimir). Las páginas imprimibles usan clases `print:hidden`.
- Clases CSS: `.input .btn .btn-ghost .btn-danger .btn-sm .label .card .th .td`; color de marca `text-brand`, `bg-brand`.
- Iconos: `lucide-react`.

## Datos
- Esquema base: `src/lib/db.ts`. Esquema de los módulos nuevos: `src/lib/schema2.ts` (**no lo edites**; si te falta una tabla o columna propia, decláralas en `src/lib/schemas/<tu-modulo>.ts`, con `CREATE TABLE IF NOT EXISTS`).
- Semilla demo: `src/lib/seeds/<tu-modulo>.ts`, función `seed()` **idempotente** (si ya existe, no insertes). Corre en cada arranque después de la semilla base.
- Plantillas nuevas de notificación: en tu seed, `INSERT OR IGNORE INTO templates(key,channel,name,subject,body,approved) VALUES(...)` para `correo`, `sms` y `whatsapp`, con `approved=1`.
- Procesos por lotes: `src/lib/jobs/<tu-modulo>.ts` exporta `jobs: Job[]` (`{name, everyMs, run}`); el ejecutor los corre periódicamente.
- Si cambias esquema, la base de prueba se recrea borrando el archivo de base.

## Permisos y alcance (obligatorio)
- Catálogo en `src/lib/perms.ts`; roles y permisos en `src/lib/seed.ts`. Ya existen los permisos de todos los módulos (forms.*, diagnostics.*, validation.*, routes.*, indicators.*, surveys.view, library.*, alerts.*, tasks.manage, messages.use, analytics.view, dashboards.manage, documents.view, api.manage, security.manage). El Administrador tiene `*`.
- Cada página: `requireUser()` + permiso + **alcance**: un mentor solo ve sus empresas (`companyFilter`), un aliado solo lo suyo, una empresa solo lo suyo. Por enlace directo a un registro ajeno → `redirect("/sin-acceso")`.
- Separación de funciones cuando aplique; todo en auditoría.
- El menú (`src/components/shell.tsx`) ya tiene las rutas de todos los módulos; no lo edites.

## Usuarios demo (clave `Demo2026!`)
admin@compensar.test (todo) · aux@ (programa Territorio MIPYME) · evaluador@ · contenidos@ · cursos@ · gestor@ (Gestor de Mentorías, programa Territorio) · mentor1@ (asignado a La Espiga, empresa id 1) · mentor2@ (sin asignaciones) · coord@crecer.test (coordinador aliado Fundación Crecer) · mentor@crecer.test · pagos@ · auditor@ — empresas: empresa1@laespiga.test (La Espiga, id 1), empresa2@textiles.test (id 2), empresa3@tecnosoft.test (id 3), colab1@laespiga.test. Programas: 1 Emprendimiento, 2 Territorio MIPYME.

## Probar sin interferir con otros
Varias personas trabajan a la vez en el mismo repositorio. Para tu servidor de prueba usa base y carpeta de compilación propias y un puerto propio:
```
DB_FILE=data/<modulo>.db NEXT_DIST_DIR=.next-<modulo> npx next dev -p <puerto>   # en segundo plano
```
- Sesión sin pasar por el login: inserta en tu base `INSERT INTO sessions(token,user_id,created_at,last_seen) VALUES('t1',<user_id>,datetime('now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))` y usa `curl -b 'sid=t1'`. (`last_seen` en ISO; se renueva sola.)
- Server actions sin JavaScript: haz `POST` multipart a la URL de la página con **todos** los campos ocultos del `<form>` (incluido el campo `$ACTION_ID_<hash>`) más tus campos, **sin** cabecera `Next-Action`. Responde 303 a la URL con `?ok=`/`?error=`.
- `npx tsc --noEmit` para tipos (ignora errores de archivos que no son tuyos).
- No corras `next build` (choca con los demás). Al terminar, detén tu servidor y borra tu base y tu carpeta `.next-<modulo>`.
- No hagas commits.

## Calidad esperada
Interfaz cuidada y consistente (tarjetas, tablas, estados vacíos, mensajes claros), responsive (funciona en celular) y accesible (labels, contraste, foco). Validación en servidor siempre. Mensajes y textos en español sin errores.

## Segunda ronda (cierre de brechas del ERS)
- Módulos nuevos registrados: `convocatorias`, `acompanamiento`, `plataforma` (archivos en `src/lib/schemas|seeds|jobs/<modulo>.ts`).
- Tablas nuevas en `schema2.ts`: `mentor_availability`, `company_contacts`, `import_jobs`, `session_reminder_log`. Columnas nuevas: `events.landing_template`, `events.banner_doc_id`, `events.certs_auto`, `registrations.sessions_attended` (JSON con los números de sesión asistidos), `sessions.active_company_id`.
- Los internos entran con 2FA. Para probar, usa sesiones insertadas en tu base (ver arriba) o el código que aparece en pantalla en MODO DEMO.
- Botones con `formAction={accion}` **no envían su name/value** (React 19): usa una acción por botón o `accion.bind(null, valor)`.
- Para leer archivos guardados usa `readDocument(doc)` de `@/lib/onbase` (están cifrados).
- Logo de marca: setting `brand_logo_doc` (id de documento) servido públicamente en `/api/marca/logo`; usa `<img src="/api/marca/logo">` solo si `setting("brand_logo_doc")` tiene valor.
