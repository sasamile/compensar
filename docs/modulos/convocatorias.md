# Módulo Convocatorias, eventos, cursos y certificados

Cubre la creación y publicación de convocatorias, eventos, charlas y cursos (con varias sesiones), la landing pública con plantillas, el calendario, las inscripciones con cupo y lista de espera, la asistencia por sesión (QR, masiva y reporte de Teams/Zoom) y los certificados PDF con firma electrónica y verificación pública.

## Manual breve por rol

### Gestor de Contenidos / Gestor de Cursos / Administrador (`events.manage`, en sus programas)
- **Eventos** (`/eventos`)
  - **Buscador** (nombre, resumen, descripción, lugar, responsable) y **filtros** por programa, tipo, modalidad, estado (borrador, publicado, cerrado, inactivo) y rango de fechas. Muestra cuántos eventos hay y el tiempo de respuesta.
  - **Lista | Calendario**: el calendario tiene vista **Mes** y **Semana**, botones *Anterior*, *Hoy* y *Siguiente* y respeta los mismos filtros. En el celular se ve como lista por día. Colores: azul publicado, ámbar borrador, gris cerrado o inactivo.
  - **+ Nuevo evento o curso**: solo el nombre y la fecha de inicio son obligatorios. Campos: programa (solo los tuyos), tipo, modalidad, inicio y fin (hora Colombia), lugar o enlace, cupo, costo interno, público, responsable, requisitos, formulario externo (Microsoft Forms), **número de sesiones**, **asistencia mínima %** (80 % por defecto), **intensidad horaria** (sale en el certificado), minutos mínimos de conexión virtual por sesión, recordatorios (`7d,1d,1h`), **Certificados automáticos**, **plantilla de la landing** (Clásica, Destacada o Minimal), resumen, **banner como archivo JPG/PNG** (pasa antivirus y queda en OnBase) o por URL, y **descripción con formato** (`**negrita**`, `*cursiva*`, `- viñetas`, `1. numeradas`, `## subtítulo`, `[texto](https://enlace)`; no se admite HTML). Marca **Publicar de inmediato** y el curso queda abierto a inscripciones al guardar (un curso nuevo queda listo en uno o dos minutos).
- **Detalle del evento** (`/eventos/<id>`): publicar, cerrar, volver a borrador, **duplicar como plantilla** (copia todo menos fechas e inscritos, incluidas sesiones, plantilla, banner y recordatorios), **inactivar/activar** (no borra historial), enviar recordatorios, ver la landing, QR y enlace corto, vista previa de banner y descripción, y **Editar datos del evento** (mismos campos; «Quitar la imagen subida actual»).

### Auxiliar Administrativo / Gestor de Cursos (`attendance.manage`, en sus programas)
- **Inscritos** (sección del detalle): totales (inscritos, lista de espera, cumplen asistencia, certificados) y **filtros** por búsqueda (empresa, NIT, código y, con permiso de datos personales, nombre y correo), estado, asistencia (cumple, parcial, sin asistencia, no cumple), lista de espera y certificado. **Exportar Excel / CSV** aplica los mismos filtros e incluye sesiones asistidas, % y si cumple.
- **Asistencia por sesión**: en cursos de varias sesiones, elige *Sesión 1, 2, 3…* arriba de la tabla. La columna «Asistió Sn» marca la sesión elegida y **Guardar asistencia de la sesión n** solo cambia las filas que se están mostrando (respeta los filtros). Cada inscrito muestra «2/3 sesiones (67 %)» y si **cumple**.
  - **QR / código**: elige la sesión y escanea (lector) o escribe el código del inscrito (el QR que ve la empresa en la landing). Si ya estaba registrado lo avisa.
  - **Reporte de Teams / Zoom (CSV)**: elige la sesión y carga el CSV; se reconocen las columnas de correo y duración (minutos, `1h 5m 30s` o `01:05:30`); las reconexiones del mismo correo se suman. Se marca presente si alcanza los minutos mínimos.
  - Con 1 sesión todo funciona igual que antes (no hay selector de sesión).
- **Certificados**: botón **Emitir certificados ahora** (emisión manual) además de la emisión automática. Cancelar una inscripción promueve al primero de la lista de espera y le avisa.

### Empresa (representante y colaboradores)
- **Oferta disponible** (`/catalogo`): buscador y filtros por programa, tipo y modalidad; tarjetas con banner, resumen, cupos reales y botón de inscripción; vista **Calendario** (mes/semana).
- **Landing** (`/e/<enlace>`): inscribe a la empresa con autorización de datos; muestra el **QR de asistencia** que se presenta en cada sesión.
- **Certificado**: llega por correo, SMS y WhatsApp con el enlace de descarga del PDF.

### Público (sin iniciar sesión)
- `/e/<enlace>`: landing del evento publicado (borradores e inactivos no se ven).
- `/api/certificados/<código>.pdf`: descarga del certificado. `/certificado/<código>`: vista HTML con botón de descarga.
- `/verificar` y `/verificar/<código>`: valida el código **y la firma** («Certificado válido · Firma válida»), muestra los datos firmados, la llave pública y el detalle técnico.

## Certificados: cómo funcionan
- **Quién**: inscritos con cupo cuyo % de asistencia = sesiones asistidas / número de sesiones ≥ asistencia mínima del evento (80 % por defecto). Ej.: 3 sesiones con 80 % exige 3/3; 5 sesiones exige 4/5.
- **Automático**: el proceso por lotes `certificados_automaticos` (cada 10 min, `src/lib/jobs/convocatorias.ts`) revisa los eventos con *Certificados automáticos* que ya terminaron (fin pasado, hasta 60 días atrás, publicados o cerrados) y emite a quien cumpla; queda en `job_runs` y en auditoría (`emitir_certificados_auto`). Nunca emite dos veces la misma inscripción. Se puede ejecutar a mano con «Ejecutar ahora» en la pantalla de procesos por lotes (Integraciones).
- **PDF real** (pdf-lib 1.17.1), A4 horizontal: marca (nombre, color y logo si `brand_logo_doc` está configurado), participante, empresa y NIT, evento, tipo y programa, fechas, intensidad horaria, asistencia (n/m sesiones y %), fecha de emisión, código, **firma impresa** (algoritmo, llave y firma en base64) y **QR al enlace de verificación**. Los metadatos del PDF llevan los datos firmados y la firma.
- **Correo**: plantilla `certificado` con `{{url}}` = enlace de descarga del PDF (también `{{verify}}` con el enlace de verificación).
- **Firma**: es una **firma electrónica verificable** Ed25519 (node:crypto) sobre los datos del certificado. El par de llaves se genera la primera vez y se guarda en `settings` (`cert_sign_public`, `cert_sign_key_id`; la privada `cert_sign_private` cifrada con AES-256-GCM con la llave de almacenamiento). Cualquier alteración de los datos hace que la verificación diga «Firma NO válida». **No es una firma digital certificada por una entidad de certificación abierta (ECD) acreditada por la ONAC**; si Compensar la exige, basta reemplazar `signPayload`/`verifyPayload` en `src/lib/certificates.ts` por el servicio de la ECD.
- Certificados emitidos antes de esta versión (sin firma) se validan por código y se marcan «emitido sin firma electrónica».

## Trazabilidad RF → pantalla

| RF | Requisito (resumen) | Dónde | Cómo se cumple el criterio |
|---|---|---|---|
| RF-PAR-04 | Cursos con sesiones, cupos y asistencia mínima | `/eventos` (crear) y `/eventos/<id>` | Campo «Número de sesiones»; asistencia por sesión (`registrations.sessions_attended`, tabla `attendance_sessions`); `attended` = cumple el %. Crear con «Publicar de inmediato» deja el curso abierto en un solo paso (≪ 10 min). |
| RF-PAR-06 | Marca en landings, certificados y correos | `/e/<enlace>`, PDF, `/certificado/<código>` | Nombre, color y logo (`brand_logo_doc`, `/api/marca/logo`) en las 3 plantillas y en el PDF. |
| RF-CON-01 | Crear dentro de los programas del usuario | `/eventos` | El selector solo lista sus programas y el servidor rechaza otro programa. |
| RF-CON-02 | Datos básicos y estados | `/eventos`, `/eventos/<id>` | Un borrador no aparece en el catálogo ni en la landing. |
| RF-CON-03 | Fechas, modalidad, lugar, cupo, costo | Formulario de evento | Al llenarse el cupo la inscripción pasa a lista de espera. |
| RF-CON-04 | Formulario externo | Landing | Enlace a Microsoft Forms y la inscripción propia sigue funcionando. |
| RF-CON-05 | Recordatorios configurables | Formulario de evento | Sin cambios (job de recordatorios de técnico). |
| RF-CON-06 | Imagen/banner, resumen y descripción enriquecida | Formulario de evento; `/api/eventos/<id>/banner` | Banner subido con `storeDocument` (formato, **antivirus**, cifrado, OnBase) guardado en `events.banner_doc_id`; la ruta lo sirve solo si el evento está publicado y activo (el gestor lo ve en borrador). Se mantiene la opción URL. Descripción con formato seguro (`src/components/rich-text.tsx`). |
| RF-CON-07 | Landing con plantillas, marca, enlace corto y QR | `/e/<enlace>` | `events.landing_template`: Clásica, Destacada (banner grande y formulario fijo) y Minimal; todas con marca, enlace corto, QR, cupos, formularios e inscripción; aptas para celular. Enlace con sufijo aleatorio (no deja adivinar otros). |
| RF-CON-08 | Calendario mensual/semanal y listado filtrable | `/eventos` y `/catalogo` (Lista / Calendario) | `src/components/calendar.tsx`. Probado con 154 eventos: lista, filtros y calendario responden en 0,1–0,5 s (consulta ≈ 12–50 ms). Índices en `events(start_at)`, `events(program_id,status,active)`. |
| RF-CON-09 | Catálogo con buscador, detalle, cupos y botón | `/catalogo` | Cupo calculado en la misma consulta contra las inscripciones reales. |
| RF-CON-10/11 | Inscripción con consentimiento; una por empresa | Landing | Sin cambios (versión y fecha del texto aceptado; segunda inscripción rechazada). |
| RF-CON-12 | Buscar, editar, activar/inactivar, duplicar | `/eventos`, `/eventos/<id>` | Buscador de texto; duplicar copia todo menos fechas e inscritos; inactivar no borra historial. |
| RF-CON-13 | Inscritos con filtros y exportación Excel/CSV según permisos | `/eventos/<id>` → Inscritos; `/api/export/inscritos/<id>` | Filtros por estado, asistencia, lista de espera, certificado y búsqueda; la exportación respeta los filtros; sin `registrations.export_pii` se exporta sin nombre/correo/celular y la búsqueda no mira esos datos. |
| RF-CON-14 | Asistencia individual, masiva, QR y Teams/Zoom con tiempo mínimo | `/eventos/<id>` | Por sesión; el CSV valida los minutos mínimos configurables. |
| RF-CON-15 | Certificados PDF automáticos, firma, código, correo y verificación pública | Job `certificados_automaticos`; `/api/certificados/<código>.pdf`; `/verificar/<código>` | PDF real con firma Ed25519 y QR; correo con enlace de descarga; la página pública muestra «Firma válida» y detecta alteraciones. |
| RF-CON-16 | Evidencias en OnBase con trazabilidad | `/eventos/<id>` → Evidencias | Sin cambios (el banner no se lista como evidencia). |
| RF-CON-17 | Lista de espera | Landing / Inscritos | Al cancelar una inscripción se promueve y notifica al primero. |

## Archivos
- Pantallas: `src/app/(app)/eventos/page.tsx`, `src/app/(app)/eventos/[id]/page.tsx`, `src/app/(app)/eventos/event-form.tsx`, `src/app/(app)/eventos/actions.ts`, `src/app/(app)/catalogo/page.tsx`, `src/app/e/[slug]/page.tsx`, `src/app/certificado/[code]/page.tsx`, `src/app/verificar/page.tsx`, `src/app/verificar/[code]/page.tsx`.
- API: `src/app/api/eventos/[id]/banner/route.ts`, `src/app/api/certificados/[code]/route.ts`, `src/app/api/export/inscritos/[id]/route.ts`.
- Componentes: `src/components/calendar.tsx` (reutilizable: `<Calendar view="month"|"week" date items baseHref />`, `calendarRange()`, `readCalendarParams()`), `src/components/rich-text.tsx` (`<RichText text />`, `plainText()`).
- Lógica: `src/lib/certificates.ts` (asistencia por sesión, filtros de inscritos, firma, emisión, verificación y PDF), `src/lib/jobs/convocatorias.ts`, `src/lib/schemas/convocatorias.ts` (`attendance_sessions`, `event_meta`, `certificate_signatures`, índices), `src/lib/seeds/convocatorias.ts` (curso demo de 3 sesiones y plantillas).

## Configuración
- `APP_URL` (p. ej. `https://fomento.compensar.com`): obligatoria en producción para que los enlaces de los correos enviados por el proceso automático sean absolutos (la emisión manual usa el host de la petición si falta).
- Dependencia: `pdf-lib` 1.17.1 (versión fija).
