# Formularios sin código y Diagnóstico empresarial

Módulo de la Plataforma de Fomento Empresarial que cubre FUN-50 a FUN-63 y FUN-69 a FUN-71 (ERS 5.1 RF-FRM-01..10 y 5.2 RF-DIA-01..08).

## 1. Manual de usuario por pantalla

### Formularios — `/formularios` (Gestor de Contenidos, Administrador; lectura de respuestas: Auxiliar, Gestor de Cursos, Gestor de Mentorías)
- Lista los formularios de tus programas con su tipo (inscripción, diagnóstico, encuesta o general), estado, versión y número de respuestas. Puedes filtrar por nombre, tipo, estado y programa.
- **Nuevo formulario**: escribe el nombre, elige el tipo y el programa, y pulsa «Crear y abrir el constructor». También puedes copiar un formulario que ya exista.

### Constructor — `/formularios/{id}` (permiso `forms.manage`)
- **Diseño y vista previa**
  - Las preguntas se agrupan en secciones (en los diagnósticos se llaman dimensiones). Usa «Agregar pregunta» y elige uno de los 10 tipos: texto corto, párrafo, número, fecha, selección única, selección múltiple, escala (1–5 o 1–10), archivo (se guarda en OnBase), NIT (valida el dígito de verificación) y ubicación DIVIPOLA (departamento → municipio).
  - Al hacer clic en una pregunta se abre su editor: enunciado, ayuda, obligatoriedad, mínimos y máximos (valor, caracteres, número de opciones o fechas), formato (correo o teléfono) y «no permitir valores repetidos» (por ejemplo, un NIT).
  - Las opciones se escriben una por una (Enter crea la siguiente) o se pegan todas juntas con «Pegar varias opciones».
  - **Condición**: «Mostrar / Omitir esta pregunta (o sección) si [pregunta anterior] [es igual a / es diferente de / incluye / ≥ / ≤ / fue respondida / no fue respondida] [valor]».
  - Puedes subir, bajar, duplicar o eliminar preguntas y secciones. Los «Bloques listos» agregan de una vez los datos de la empresa, los datos de contacto o la autorización de datos.
  - En los diagnósticos cada opción tiene un puntaje, cada pregunta un peso y cada dimensión un peso.
  - El índice de la izquierda permite saltar a cualquier pregunta y lista lo que falta antes de publicar.
  - Todo se guarda solo (también con Ctrl+S). «Vista previa» muestra el formulario tal como lo verá el participante, con las validaciones y la lógica funcionando, sin guardar nada.
- **Configuración y publicación**
  - Nombre, descripción, tipo y programa.
  - Asociación a una convocatoria o evento: actualiza `events.form_id`.
  - Enlace público `/f/{enlace}`.
  - Acceso: con inicio de sesión o público con correo.
  - Si se permiten varias respuestas por empresa o usuario.
  - Mensaje de confirmación.
  - Botones para archivar o restaurar.
- **Clasificación y niveles** (solo diagnósticos)
  - Niveles por rango (desde–hasta), cada uno con color y recomendaciones (una por línea).
  - Segmentos por regla: total o dimensión ≥ / < valor; se aplica la primera que se cumpla y, si ninguna se cumple, el segmento por defecto.
  - Si «revisión del mentor» está marcada, al enviar el diagnóstico queda «en revisión».
  - «Guardar y recalcular» reclasifica todos los diagnósticos ya enviados.
- **Versiones**: historial de publicaciones con la cantidad de respuestas recibidas en cada versión.
- **Publicar**: congela el borrador como versión *n+1*. Si editas un formulario publicado trabajas sobre el borrador (aparece «Hay cambios sin publicar»); las respuestas recibidas conservan la versión con la que se diligenciaron. «Descartar cambios» vuelve a la última versión publicada.

### Respuestas — `/formularios/{id}/respuestas` (permiso `forms.responses` o `forms.manage`, con alcance por programa)
- Filtros: estado, versión, empresa/NIT/correo, texto en las respuestas, nivel (diagnóstico) y rango de fechas.
- Indicadores y gráfico por estado.
- Exportación a **Excel** o **CSV** con los filtros aplicados (`/api/formularios/{id}/export`): una columna por pregunta, que reúne las preguntas de todas las versiones; en los diagnósticos incluye además puntaje, nivel, segmento y una columna por dimensión.
- **Detalle** (`…/respuestas/{rid}`):
  - Muestra las respuestas con *su* versión, el resultado (si es diagnóstico), los adjuntos con descarga protegida y el historial auditado.
  - En formularios generales y encuestas puedes cambiar el estado (en revisión / ajustes / aprobado / rechazado) con un motivo; el participante recibe una notificación.
  - Las inscripciones se deciden en la bandeja de **Validación**: cada envío crea un registro en `validation_cases` («pendiente»).

### Diligenciar — `/f/{enlace}` (público o con inicio de sesión)
- El formulario avanza por secciones, con barra de avance y validación en tiempo real (formatos, obligatorios, NIT con DV, municipio que corresponda al departamento, mínimos y máximos).
- **Guardado automático** del borrador mientras escribes, más el botón «Guardar y continuar después». Al volver, el formulario abre en la sección donde quedaste. Sin inicio de sesión, el borrador se guarda en el navegador.
- Al enviar, el servidor vuelve a validar todo, revisa los duplicados (una respuesta por empresa, usuario o correo, salvo que se permitan varias, y los valores marcados como únicos) y muestra el número de radicado. También envía la confirmación por correo, SMS y WhatsApp (`formulario_recibido`).
- Si la respuesta está en «requiere ajustes», el enlace la abre con el motivo y permite corregir y **reenviar**. El reenvío devuelve el caso de validación a «pendiente».

### Mis formularios — `/mis-formularios` (cualquier usuario con sesión; empresas y colaboradores)
- Lista las respuestas propias y las de la empresa con radicado, versión, estado (borrador, enviado, en revisión, requiere ajustes, aprobado, rechazado), motivo y una barra de avance.
- Muestra avisos destacados para continuar un borrador o corregir una respuesta en «ajustes», y la lista de formularios disponibles.
- El detalle (`/mis-formularios/{id}`) muestra las respuestas, la línea de tiempo, las solicitudes de información abiertas y permite descargar el PDF.
- Los estados que decide la bandeja de Validación se sincronizan al abrir la página y mediante el proceso `formularios.sincronizar_estados`, que notifica cada cambio (`formulario_estado`, `formulario_ajustes`).

### Diagnósticos — `/diagnosticos`
- **Equipo** (Gestor de Mentorías y Mentor con `diagnostics.manage`; Evaluador y Auditor con `diagnostics.view`). El mentor solo ve sus empresas asignadas.
  - Lista con filtros por estado, etapa, nivel, segmento, instrumento y empresa; indicadores; gráfico por nivel y por segmento.
  - **Asignar diagnóstico**: empresa del alcance, instrumento, etapa (inicial / seguimiento / final, o automática) y responsable. La empresa recibe la notificación `diagnostico_asignado`.
  - **Registrar empresa**: razón social y NIT + DV validados. Si el NIT ya existe no se crea un duplicado: se usa el registro existente o, si está fuera de tu alcance, se avisa. Opcionalmente asigna el diagnóstico de inmediato. Un mentor que registra una empresa queda asignado a ella.
  - **Instrumentos y clasificación**: muestra los niveles de cada instrumento y ofrece «Recalcular clasificación».
- **Empresa** («Mi diagnóstico», `diagnostics.self`): ve sus diagnósticos pendientes y puede **iniciar un autodiagnóstico** (elige la etapa) sin ayuda del mentor. También ve sus resultados y la comparación.
- **Detalle** (`/diagnosticos/{id}`)
  - Línea de estados asignado → en curso → en revisión → completado. Cada cambio queda en la auditoría y en el historial lateral.
  - Si el diagnóstico está pendiente, se diligencia aquí: la empresa lo hace en autodiagnóstico y el equipo en modo asistido.
  - Al enviar, el resultado aparece de inmediato:
    - puntaje 0–100, nivel con su escala de colores y segmento;
    - radar y barras por dimensión, con una tabla de puntos, pesos y porcentajes;
    - hallazgos automáticos (fortaleza, mayor brecha, dimensiones críticas, desarrollo desigual) y las recomendaciones del nivel;
    - comparación con el diagnóstico anterior.
  - «Descargar PDF» imprime el informe con el encabezado de la marca (nombre, color y lema configurados).
  - El equipo puede marcar el diagnóstico como completado, devolverlo a la empresa con un motivo, reabrirlo, y cambiar la etapa o el responsable.
- **Comparación** (`/diagnosticos/comparacion`)
  - Para cada empresa compara el diagnóstico inicial (o el primero) con el final (o el último): puntaje y nivel antes y después, y el cambio por dimensión.
  - El equipo ve además la tabla «Impacto por empresa» y el cambio promedio; esta comparación es el insumo de RF-RES-02.
  - Se puede descargar en PDF.

### Cómputo del diagnóstico (RF-DIA-05)
- Puntos de una pregunta:
  - selección única: el puntaje de la opción elegida;
  - selección múltiple: la suma de los puntajes elegidos, con tope en la suma de los positivos;
  - escala: el valor elegido.
- Máximo de una pregunta:
  - selección única: el mayor puntaje entre sus opciones;
  - selección múltiple: la suma de los puntajes positivos;
  - escala: 5 o 10.
- `dimensión % = Σ(peso_pregunta × puntos) / Σ(peso_pregunta × máximo) × 100`. Solo cuentan las preguntas visibles y con puntaje; las que quedan sin responder suman 0.
- `total = Σ(peso_dimensión × dimensión %) / Σ(peso_dimensión)`, redondeado a un decimal.
- Nivel: el rango [desde, hasta) que contiene el total; el último rango incluye 100. Segmento: la primera regla que se cumpla.
- La implementación está en `src/lib/forms.ts → computeResult()`. Es la misma función que usan la pantalla, el envío y el recálculo, y se puede contrastar con la hoja de cálculo de Compensar cargando sus puntajes y pesos en el constructor.

### Datos de demostración (`src/lib/seeds/formularios.ts`)
- **«Diagnóstico de madurez empresarial»** (publicado, Territorio MIPYME, enlace `/f/diagnostico-madurez`):
  - 4 dimensiones × 3 preguntas con puntaje, más una pregunta condicional;
  - niveles Inicial 0–40, En desarrollo 40–70 y Consolidado 70–100, con recomendaciones;
  - segmentos: Prioridad financiera, Prioridad digital y Lista para escalar.
- **«Inscripción Territorio MIPYME»** (publicado, `/f/inscripcion-territorio-mipyme`): 21 preguntas con NIT único, DIVIPOLA, archivo y 3 preguntas condicionales.
- La Espiga: diagnóstico inicial completado (26,7, Inicial) y autodiagnóstico final completado (68,4, En desarrollo), para ver la comparación.
- Textiles: diagnóstico inicial asignado y pendiente.
- Tecnosoft: inscripción enviada, con su caso de validación «pendiente».
- Plantillas de notificación: `formulario_recibido`, `formulario_estado`, `formulario_ajustes`, `formulario_borrador`, `diagnostico_asignado` y `diagnostico_resultado`.

## 2. Trazabilidad

| FUN | RF | Cómo se cumple | Pantalla / archivo |
|---|---|---|---|
| FUN-50 | RF-FRM-01 | Formularios con estados borrador / publicado / archivado; publicar crea `form_versions`; editar trabaja sobre el borrador; cada respuesta guarda `form_version` y se muestra con ella | `/formularios`, `/formularios/{id}` (Versiones) · `formularios/actions.ts` (`publishForm`, `setFormStatus`, `discardDraft`) |
| FUN-51 | RF-FRM-02 | Constructor visual sin código: tipos en paleta, bloques listos, opciones pegadas, índice, autoguardado y vista previa | `src/components/form-builder.tsx` |
| FUN-52 | RF-FRM-03 | 10 tipos (incluye NIT módulo 11 y DIVIPOLA), obligatoriedad, mínimos y máximos, ayuda, formatos; misma validación en pantalla y en el servidor | `src/lib/forms.ts` (`validateAnswer`), `src/lib/divipola.ts`, `form-renderer.tsx`, `f/actions.ts` |
| FUN-53 | RF-FRM-04 | Puntaje por opción, peso por pregunta y por dimensión; lógica mostrar u omitir en preguntas y secciones | `form-builder.tsx`, `forms.ts` (`visibility`, `computeResult`) |
| FUN-54 | RF-FRM-05 | Resultado automático al enviar: puntaje, nivel, recomendaciones y resultado por dimensión en `form_responses.result` y en `diagnostics` | `f/actions.ts` (`submitResponse`), `/diagnosticos/{id}`, `form-result.tsx` |
| FUN-55 | RF-FRM-06 | Publicación por enlace `/f/{slug}` (público o con inicio de sesión), asociación a evento (`events.form_id`) y a programa; captura y exportación a Excel/CSV | `/f/[slug]`, `/formularios/{id}?tab=config`, `/api/formularios/{id}/export` |
| FUN-56 | RF-FRM-07 | Validación en tiempo real y en el servidor (formatos, obligatorios, NIT, archivo propio, duplicados por empresa/usuario/correo y por valor único) | `form-renderer.tsx`, `f/actions.ts` |
| FUN-57 | RF-DIA-01 | Instrumentos de diagnóstico con versiones, construidos sin desarrollo | `/formularios` (tipo diagnóstico), `/diagnosticos?tab=instrumentos` |
| FUN-58 | RF-DIA-02 | Registro manual de empresa con NIT + DV validados; un NIT existente no crea duplicado | `/diagnosticos?tab=registrar` · `diagnosticos/actions.ts` (`registerCompany`) |
| FUN-59 | RF-DIA-03 | Estados asignado → en curso → en revisión → completado y etapas inicial / seguimiento / final; cada cambio se audita | `/diagnosticos/{id}` · `setDiagnosticStatus`, `reassignDiagnostic`, `saveDraft`, `submitResponse` |
| FUN-60 | RF-DIA-04 | Autodiagnóstico desde la cuenta de la empresa (`diagnostics.self`) | `/diagnosticos` (vista de empresa), `/f/diagnostico-madurez` · `startSelfDiagnostic` |
| FUN-61 | RF-DIA-05 | Cálculo automático de puntaje y nivel (fórmula documentada arriba) | `forms.ts` (`computeResult`) |
| FUN-62 | RF-DIA-06 | Niveles y segmentos configurables; al cambiar las reglas, «Guardar y recalcular» o «Recalcular clasificación» reclasifica | `/formularios/{id}?tab=clasificacion`, `form-scoring.tsx`, `server.ts` (`recalcForm`) |
| FUN-63 | RF-DIA-07 | Niveles, resultados por dimensión (radar y barras), hallazgos y recomendaciones; PDF con la marca | `/diagnosticos/{id}`, `form-result.tsx`, `PrintButton` |
| — | RF-DIA-08 | Comparación del diagnóstico inicial con el final por empresa y del impacto agregado | `/diagnosticos/comparacion` |
| FUN-69 | RF-FRM-08 | Borrador guardado automáticamente (con debounce) y reanudación en la sección donde se quedó; recordatorio de borradores sin terminar | `form-renderer.tsx`, `f/actions.ts` (`saveDraft`), `jobs/formularios.ts` |
| FUN-70 | RF-FRM-09 | Confirmación al enviar y aviso de cada cambio de estado o de ajustes (correo, SMS y WhatsApp, con plantillas aprobadas) | `f/actions.ts`, `server.ts` (`notifyResponseStatus`, `syncValidationStatuses`), `seeds/formularios.ts` |
| FUN-71 | RF-FRM-10 | El participante consulta el estado y el motivo de su respuesta, y corrige y reenvía si está en «ajustes»; el equipo lo consulta en Respuestas | `/mis-formularios`, `/mis-formularios/{id}`, `/formularios/{id}/respuestas` |

## 3. Archivos del módulo

- `src/lib/forms.ts`: tipos; validación de respuestas y del instrumento; lógica condicional; puntaje y clasificación.
- `src/lib/divipola.ts`: catálogo DIVIPOLA con 33 departamentos, sus capitales, los municipios principales y los 116 municipios de Cundinamarca.
- `src/lib/schemas/formularios.ts`: tabla `form_notices` e índices.
- `src/lib/seeds/formularios.ts`: datos de demostración y plantillas de notificación.
- `src/lib/jobs/formularios.ts`: sincronización de estados con Validación y recordatorio de borradores.
- `src/components/form-builder.tsx`, `form-renderer.tsx`, `form-scoring.tsx`, `form-answers.tsx`, `form-result.tsx` y `form-public-frame.tsx`.
- `src/app/(app)/formularios/**`: `server.ts` con consultas, permisos y recálculo; `actions.ts`; páginas.
- `src/app/(app)/diagnosticos/**`, `src/app/(app)/mis-formularios/**`, `src/app/f/**` (incluye `actions.ts` del diligenciamiento) y `src/app/api/formularios/[id]/{export,archivo}`.
