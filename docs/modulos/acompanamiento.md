# Módulo Acompañamiento: agenda, disponibilidad y ficha de empresa

Este módulo cubre la agenda de mentorías con calendario y disponibilidad, la sincronización con Microsoft 365/Outlook, los recordatorios, la exportación del historial por empresa, el historial de cambios del perfil y la sincronización con Gestión de Clientes.

## Manual por rol

### Mentor
- **Mi disponibilidad** (`/disponibilidad`, también se abre con el botón de `/agenda`). Aquí registra sus franjas semanales: días, hora de inicio y fin, y modalidad (virtual, presencial o ambas). El sistema no deja guardar franjas que se crucen, que duren menos de 30 minutos o que tengan horas inválidas. Al lado ve sus próximas franjas libres (bloques de 60 minutos que no tienen sesión) y sus sesiones programadas.
- **Agenda** (`/agenda`). En la pestaña *Lista* filtra por empresa, programa, estado y fechas. En la pestaña *Calendario* ve el mes o la semana: las sesiones aparecen con el color de su estado y sus franjas disponibles en verde azulado.
- **Programar.** Elige empresa, fecha y hora, duración y modalidad. Si la sesión se cruza con otra suya, el sistema la **bloquea**. Si queda fuera de su disponibilidad, la **programa con una advertencia**. Los participantes reciben la notificación con la invitación .ics y el evento se crea en su Outlook.
- **Reprogramar o cancelar** desde el detalle de la sesión, siempre con motivo. Al reprogramar se borran los recordatorios ya enviados para que se vuelvan a enviar según la nueva hora.

### Empresa (representante y colaboradores)
- **Programar una sesión con mi mentor** (`/agenda#programar`). La empresa elige una franja libre de su mentor asignado o del mentor de una remisión aceptada o en curso. Solo aparecen franjas que están dentro de la disponibilidad del mentor y que no tienen otra sesión. Si la franja admite ambas modalidades, la empresa escoge la modalidad.
- En el *Calendario* ve sus sesiones y las franjas de sus mentores. Al pulsar una franja se abre el formulario con ese día ya filtrado.
- **Reprogramar** solo a otra franja libre del mentor. **Cancelar** con motivo.
- En la ficha `/empresas/{id}` puede descargar su historial en Excel o CSV por periodo y consultar el historial de cambios de su perfil.

### Gestor de Mentorías
- En `/agenda` ve todas las sesiones de su programa y puede filtrar por mentor, empresa, programa, estado y fechas.
- Programa sesiones para cualquier mentor. Si la sesión queda fuera de la disponibilidad, el mentor recibe un aviso (plantilla `sesion_fuera_disponibilidad`), pero la sesión no se bloquea.
- Administra la disponibilidad de los mentores de su alcance en `/disponibilidad?mentor={id}`. Su alcance son los mentores que acompañan empresas, remisiones o sesiones de su programa, más los mentores internos que aún no tienen asignaciones.
- En la ficha de la empresa puede usar **Sincronizar con Gestión de Clientes** (requiere `companies.activate`).

### Coordinador de aliado
- Administra la disponibilidad de los mentores de su organización y ve las sesiones de sus remisiones.

### Administrador
- Puede hacer todo lo anterior sobre cualquier mentor, empresa o sesión.
- En `/integraciones` → *Procesos* puede ejecutar a mano `acompanamiento.recordatorios` y `acompanamiento.m365_reintentos`. Ahí también ve el circuit breaker `m365` y el de `gestion_clientes`.

## Microsoft 365 / Outlook (`src/lib/integrations/m365.ts`)
| Operación en la plataforma | Llamada a Microsoft Graph (calendario del mentor) |
|---|---|
| Programar | `POST /users/{correo}/events` con asistentes (usuarios de la empresa), Teams si es virtual y `transactionId` idempotente |
| Reprogramar | `PATCH /users/{correo}/events/{id}` |
| Cancelar | `POST /users/{correo}/events/{id}/cancel` con el motivo |

- **Con credenciales** (`M365_TENANT_ID`, `M365_CLIENT_ID` y `M365_CLIENT_SECRET`), el adaptador obtiene el token con el flujo *client credentials*. Las llamadas pasan por el circuit breaker `m365`. Si fallan, la operación queda en la cola `m365.sync`, que el job reintenta con espera exponencial. La sesión sigue su curso: la plataforma es la fuente de verdad.
- **Sin credenciales** funciona en modo simulado: registra el intercambio (`integration_log`) y la auditoría (`sync_outlook`), y deja la invitación .ics en `/agenda/{id}/ics`. Esa invitación tiene UID estable, `SEQUENCE` creciente, `METHOD:REQUEST` o `CANCEL`, organizador y asistentes. El enlace va en las notificaciones.
- El estado de cada sesión queda en `session_calendar_sync` y se ve en el detalle de la sesión.
- `M365_GRAPH_URL` y `M365_AUTH_URL` son opcionales. Sirven para nubes soberanas o para probar con un simulador.

**Pendiente por parte de Compensar:**
1. Registrar una aplicación en su Entra ID con el permiso de aplicación `Calendars.ReadWrite` y el consentimiento de un administrador.
2. Restringirla al grupo de mentores con una *Application Access Policy* (recomendado).
3. Entregar el tenant ID, el client ID y el secreto (o un certificado).
4. Confirmar que los correos de los mentores en la plataforma son sus buzones de Microsoft 365.

Los mentores de aliados que no tienen buzón en el tenant de Compensar seguirán recibiendo la invitación .ics.

## Notificaciones (RF-ACO-11)
Todas usan plantillas aprobadas en correo, SMS y WhatsApp:
- `sesion_programada`: la semilla le añade el enlace `{{ics}}` en el correo.
- `sesion_reprogramada`: nueva.
- `sesion_cancelada`.
- `recordatorio_sesion`: nueva; se envía 24 horas y 1 hora antes.
- `sesion_fuera_disponibilidad`: nueva; es el aviso al mentor.

El job `acompanamiento.recordatorios` corre cada 5 minutos. Antes de notificar reclama el envío en `session_reminder_log` (UNIQUE `session_id` + `kind`), así que nunca envía dos veces el mismo recordatorio, aunque corra varias veces o en varias instancias.

## Ficha de empresa (`/empresas/{id}`)
- **Exportar resultados e historial de servicios.** El formulario llama a `GET /api/empresas/{id}/exportar?format=xlsx|csv&desde&hasta&seccion`. El archivo de Excel trae las hojas Resumen, Servicios (remisiones y asignaciones, con sesiones realizadas y horas aceptadas en el periodo), Sesiones (horas, aceptación por usuario, fecha e IP, y si cuenta para pagos), Indicadores, Mediciones y Cierres. El CSV trae solo la sección elegida. La descarga respeta `canSeeCompany` y queda en auditoría (`exportar_historial`).
- **Historial de cambios del perfil.** Lista las entradas de `audit_log` de la empresa con quién, cuándo, la IP y una tabla campo por campo con el valor anterior y el nuevo.
- **Gestión de Clientes.** El botón (requiere `companies.activate` o `config.manage`) usa `consultarEmpresa(nit)` a través del breaker `gestion_clientes`. Guarda en `company_client_sync` la afiliación, los meses de afiliación, si está al día en parafiscales, los meses de aportes, las ventas y la inscripción en la Agencia, y actualiza la razón social si cambió. La operación se audita con el diff y la tarjeta muestra la fecha de la última sincronización y quién la hizo. Solo la ven los usuarios internos.

## Trazabilidad de requisitos a pantallas
| Requisito | Criterio de aceptación | Dónde se cumple |
|---|---|---|
| RF-ACO-04 | Una sesión creada en la plataforma aparece en el Outlook del mentor | `/disponibilidad` (tabla `mentor_availability`), `/agenda?tab=calendario` (mes y semana, sesiones por estado y franjas), `src/lib/integrations/m365.ts` (Graph o simulado + .ics), detalle de la sesión (estado de sincronización) |
| RF-ACO-05 | Programar, reprogramar y cancelar con motivo (mentor, empresa o Administrador); los externos reciben .ics | `/agenda#programar` (la empresa elige una franja), formulario interno, `/agenda/{id}` (reprogramar o cancelar), `/agenda/{id}/ics`; los choques se bloquean (`conflicts`) y fuera de disponibilidad hay advertencia (`withinAvailability`) |
| RF-ACO-10 | Consulta por mentor, empresa, programa y fechas; el Gestor ve todo su programa | Filtros de `/agenda` (lista y calendario) y `sessionFilter` por alcance de programa |
| RF-ACO-11 | Notificaciones con plantillas aprobadas | `notifyParties` y el job `acompanamiento.recordatorios` (24 h y 1 h, sin duplicar) |
| RF-SRV-06 | Descarga en Excel por empresa y periodo | Ficha → «Exportar resultados e historial de servicios», `/api/empresas/{id}/exportar` |
| RF-EMP-07 | Quién, cuándo, valor anterior y nuevo | Ficha → «Historial de cambios del perfil» (`historial.tsx`) |
| ERS §6, Gestión de Clientes | Consultar y sincronizar datos de empresas afiliadas | Ficha → tarjeta «Gestión de Clientes» (`empresas/[id]/actions.ts`) |

## Archivos
- `src/app/(app)/agenda/`: `page.tsx`, `actions.ts`, `agenda-lib.ts` (disponibilidad, franjas, choques, alcance y notificaciones), `[id]/page.tsx` y `[id]/ics/route.ts`.
- `src/app/(app)/disponibilidad/`: `page.tsx` y `actions.ts`.
- `src/app/(app)/empresas/[id]/`: `page.tsx`, `actions.ts` e `historial.tsx`.
- `src/app/api/empresas/[id]/exportar/route.ts`.
- `src/lib/integrations/m365.ts`, `src/lib/schemas|seeds|jobs/acompanamiento.ts`.
- El calendario usa el componente compartido `src/components/calendar.tsx`.
