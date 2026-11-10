# Módulo Seguimiento, indicadores y operación

Cubre indicadores de gestión e impacto, gestión de servicios (encuestas y biblioteca), seguimiento/alertas/operación (tablero de coordinación, semáforo, reglas, tareas, mensajería) y descargas operativas.

## Manual breve por rol

### Administrador / Gestor de Mentorías (alcance: toda la organización o su programa)
- **Indicadores** (`/indicadores`)
  - *Definiciones*: crea indicadores de **gestión** o **impacto** para un **programa** o para un **servicio del catálogo**, con unidad, línea base, meta por defecto, periodicidad y fórmula. No requiere desarrollo. Se editan y se activan/desactivan.
  - *Aplicar a empresas*: elige el indicador y marca empresas (o «todas las del programa/servicio»); puedes fijar línea base y meta propias. No se duplica si la empresa ya lo tiene.
  - *Tablero de avances*: cumplimiento promedio, metas alcanzadas, evolución mensual (gráfico de líneas), cumplimiento por programa, servicio y empresa, últimos avances (quién los registró: mentor, administrativo o empresa). Filtros por programa, servicio, empresa y tipo.
  - *Detalle de un indicador*: evolución frente a la meta, historial con soporte (archivo OnBase o sesión), registro de avance, ajuste de línea base y meta (auditado).
- **Seguimiento y alertas** (`/seguimiento`)
  - *Estado general*: una sola vista con sesiones (realizadas, próximas, vencidas, sin aceptación), remisiones, rutas y etapas, tareas e indicadores **por programa, por mentor y por empresa**.
  - *Semáforo de empresas*: rojo/amarillo/verde según alertas abiertas; filtra por **color** y **programa**.
  - *Alertas*: listado filtrable (estado, severidad, regla, programa, «solo las mías»); **Marcar atendida** exige describir la acción y queda auditado.
  - *Reglas de alerta*: umbral en días, responsable (mentor, responsable del registro, gestor del programa, coordinador del aliado, administrador) y canal (correo, SMS, WhatsApp, todos o solo plataforma). Botón **Ejecutar alertas ahora**.
- **Encuestas** (`/encuestas`): NPS, satisfacción, promedios por aspecto y distribución; resultados **por aliado, por servicio y por evento**; *Análisis de comentarios* con los temas más mencionados; *Envíos* con estado, enlace y «Reenviar aviso». Botón **Enviar pendientes ahora**.
- **Tareas** (`/tareas`), **Biblioteca** (`/biblioteca`, administración), **Mensajes** (supervisión en solo lectura de los hilos de su alcance).
- **Hoja de ruta** (`/hoja-de-ruta/<empresa>`, desde Seguimiento): página con la marca para **Descargar PDF**.
- **Exportes Excel**: botones en Indicadores, Seguimiento, Tareas y Encuestas (`/api/operacion/<tipo>`; `?fmt=csv` para CSV).

### Mentor (solo sus empresas)
- `/indicadores`: ve los indicadores de sus empresas y registra avances con evidencia o desde una sesión.
- **Detalle de sesión** (`/agenda/<id>`) → sección **Indicadores de la empresa**: el mentor de la sesión registra el avance; la sesión queda como soporte (archivo opcional).
- `/seguimiento`: estado y semáforo de sus empresas; atiende las alertas que le llegan.
- `/tareas`: sus tareas y las de sus empresas. `/mensajes`: un hilo por empresa. `/biblioteca`: consulta.

### Coordinador de aliado
- `/encuestas`: solo las encuestas de su aliado. `/seguimiento`: empresas remitidas a su aliado. `/tareas`: responsables de su aliado. `/biblioteca`: consulta.

### Gestor de Contenidos / Cursos
- `/biblioteca` (contenidos administra): publica archivos (OnBase), enlaces o videos por programa y servicio, con etiquetas; retira y vuelve a publicar. `/encuestas`: resultados.

### Empresa (representante y colaboradores)
- `/mensajes`: conversa con su mentor; ve si sus mensajes fueron leídos y el estado de entrega de los avisos.
- `/biblioteca`: contenidos generales y de su programa.
- `/indicadores` (enlace directo; ver «Cambios pedidos»): ve sus indicadores y registra avances con evidencia.
- `/encuesta/<token>` (pública, sin inicio de sesión, apta para celular): responde una sola vez.

## Procesos automáticos (`src/lib/jobs/seguimiento.ts`)
| Proceso | Frecuencia | Qué hace |
|---|---|---|
| `seguimiento.alertas` | cada hora | Evalúa las reglas activas, crea alertas sin duplicar (regla + entidad), sube a roja cuando el retraso ≥ 2× umbral (mín. +7 días), cierra las que dejaron de cumplirse y avisa al responsable por el canal de la regla (plantilla `alerta`). |
| `seguimiento.encuestas` | cada 30 min | Crea encuesta con token y avisa a la empresa (plantilla `encuesta`) por: cierres `aprobado` sin encuesta, remisiones `cerrada` sin encuesta y asistentes (`attended=1`) de eventos terminados. |

Reglas incluidas: sesión realizada sin seguimiento (> N días sin nueva sesión), sesión vencida sin cerrar, sesión realizada sin aceptación, empresa sin actividad, meta/etapa de ruta vencida (`company_route_steps`), indicador atrasado (periodicidad + N días sin avance y meta no alcanzada), tarea vencida, solicitud de información vencida (`info_requests`).

## Trazabilidad

| Requisito | Pantalla / archivo |
|---|---|
| FUN-67 · RF-SEG-02 Definir indicadores de gestión e impacto por programa, con metas y periodicidad (sin desarrollo) | `/indicadores?tab=definiciones` · `src/app/(app)/indicadores/{page,actions}.ts(x)` · `src/lib/indicators.ts` |
| FUN-68 · RF-SEG-03 Tablero de avances y evolución; se actualiza con avances de mentor, administrativo o empresa | `/indicadores` (Tablero), `/indicadores/[id]` · `LineChart` · `complianceTimeline()` |
| FUN-83 · RF-GSV-01 Línea base e indicadores por servicio | Definición con «Aplica a: servicio del catálogo» + `/indicadores?tab=aplicar` (filas en `indicators` con `def_id`, `servicio_id`, `referral_id`) |
| FUN-84 · RF-GSV-02 Actualizar indicadores durante mentorías/consultorías con evidencia | `recordValue` (nota + archivo OnBase o sesión) · `src/components/seg-avance-form.tsx` · sección en `src/app/(app)/agenda/[id]/page.tsx` → `src/components/seg-indicadores-sesion.tsx` |
| FUN-85 · RF-GSV-03 Encuestas por servicio enviadas automáticamente al cierre; resultado por aliado y servicio | `src/lib/surveys.ts` (`runSurveys`), job `seguimiento.encuestas`, `/encuestas` (Resultados por aliado/servicio/evento), `/encuesta/[token]` |
| FUN-86 · RF-GSV-04 Biblioteca de contenidos, herramientas y base de conocimiento, filtrable por programa y servicio | `/biblioteca` · `src/app/(app)/biblioteca/*` · descarga `/api/operacion/doc/[id]` |
| FUN-87 · RF-ALE-01 Estado general por programa, mentor y empresa en una sola vista | `/seguimiento` (Estado general) |
| FUN-88 · RF-ALE-02 Alertas automáticas por reglas con responsable y canal | `src/lib/alerts.ts` (`RULES`, `evaluate`, `runAlerts`), job `seguimiento.alertas`, `/seguimiento?tab=reglas` |
| FUN-89 · RF-ALE-03 Semáforo de empresas filtrable por color y programa | `/seguimiento?tab=semaforo` · `companyLights()` |
| FUN-90 · RF-ALE-04 Tareas, actividades y evidencias con responsable y vencimiento; vencidas generan alerta | `/tareas` · `src/app/(app)/tareas/*` · regla `tarea_vencida` |
| FUN-91 · RF-ALE-05 Mensajería mentor-empresa con aviso por correo/SMS/WhatsApp y estado de entrega y lectura | `/mensajes` · `src/app/(app)/mensajes/*` · tabla `message_notifications` (`src/lib/schemas/seguimiento.ts`) · plantilla `mensaje_nuevo` |
| FUN-92 · RF-ALE-06 Reportes operativos y hojas de ruta en PDF y Excel con la marca | `/hoja-de-ruta/[companyId]` (PDF) · `/api/operacion/{alertas,tareas,encuestas,indicadores,avances}` (Excel/CSV) |
| FUN-95 · RF-ANA-03 Encuestas con análisis de respuestas abiertas que agrupa los temas más mencionados | `/encuestas?tab=analisis` · `src/lib/text-analysis.ts` (palabras y bigramas, stopwords en español, plurales unificados, cruce con NPS) |

Auditoría: todas las escrituras (definir/editar/aplicar indicador, avance, ajuste de meta, reglas, ejecución de alertas, atender alerta, tareas y evidencias, contenidos, mensajes y lectura, encuestas enviadas/respondidas/reenviadas, exportes y generación de hoja de ruta).

## Datos de demostración (`src/lib/seeds/seguimiento.ts`)
Definiciones por programa y servicio; indicadores con 2–6 meses de avances para La Espiga (1) y Textiles (2); reglas de alerta; 4 tareas (una vencida); 5 contenidos; hilo mentor1 ↔ La Espiga (un mensaje sin leer); 5 encuestas respondidas con comentarios + 1 pendiente; plantillas `alerta`, `encuesta`, `mensaje_nuevo`, `tarea_asignada` (correo/SMS/WhatsApp, aprobadas).
