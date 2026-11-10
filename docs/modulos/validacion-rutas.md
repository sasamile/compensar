# Validación de requisitos + Rutas de acompañamiento

Módulo Futuro del Anexo 07: FUN-72 a FUN-82, FUN-94 y FUN-96 (ERS §5.4 RF-VAL, §5.5 RF-RUT, RF-ANA-02, RF-ANA-04).

## Manual de usuario por rol

### Validador (Auxiliar administrativo, Evaluador, Gestor de Mentorías, Administrador) — `validation.manage`
1. **Bandeja** (`/validacion`): llegan solas las empresas en estado *pendiente* (autorregistro, creación manual o cargue) y las inscripciones de formularios. Filtra por programa, estado, responsable, tipo y resultado automático. Cada fila muestra cuánto lleva esperando (en rojo si supera `val_sla_days`, 5 días por defecto). Marca varias y **asígnalas** a un validador.
2. **Revisar una solicitud** (`/validacion/<id>`):
   - *Validación automática*: resultado regla por regla contra Gestión de Clientes («Cumple» / «No cumple» con el motivo). «Volver a consultar» la repite.
   - *Validación manual*: marca la lista de chequeo del programa, escribe las observaciones y guarda; queda quién validó, cuándo y por qué.
   - *Documentos e información adicional*: describe lo que falta y el plazo. El solicitante recibe correo/SMS/WhatsApp, un recordatorio antes de vencer y, si no responde, la solicitud pasa a *vencida* y el caso vuelve a *En revisión*.
   - *Decisión*: aprobar (en un registro de empresa la **activa** y envía la plantilla `activacion`), pedir ajustes (abre una solicitud de información con plazo) o rechazar. El motivo es obligatorio para rechazar o pedir ajustes y le llega al solicitante.
   - *Trazabilidad*: historial completo del caso (auditoría).
3. **Reglas** (`/validacion/reglas`): por programa, crea, edita, activa o desactiva reglas (campo de Gestión de Clientes, operador, valor). «Probar las reglas con un NIT» muestra el resultado sin guardar nada.
4. **Validación masiva** (`/validacion/masiva`): descarga la plantilla, sube el Excel (NIT, Programa, razón social opcional) y elige: solo validar, aprobar las que cumplen, o aprobar las que cumplen y rechazar las que no. Ves el resultado en pantalla y descargas el Excel con el resultado y el motivo de cada fila.
5. **Tablero de avance** (`/validacion/tablero`): solicitudes por estado y por responsable, recibidas vs. decididas por mes, % que cumple y tiempo medio de decisión; filtra por programa y periodo; «Exportar a PDF».
6. **Reportes** (`/validacion/reportes`): *Validación de requisitos* (cada caso con su resultado, reglas no cumplidas, lista de chequeo, responsable, decisión y tiempos) y *Seguimiento de empresas* (validación + ruta activa y % de avance). Filtra y exporta a Excel o CSV.

Lectura (Auditor, `validation.view`): ve bandeja, casos, tablero y reportes sin botones de decisión.

### Empresa / solicitante
- **Mis solicitudes** (`/validacion/solicitudes`, enlace en las notificaciones y en «Mi ruta»): estado de su registro e inscripciones, motivo de la decisión y las solicitudes de información pendientes; responde con texto y un archivo (se guarda en OnBase).
- **Mi ruta** (`/rutas`, funciona en el celular): ruta activa, % de avance, cada etapa con su servicio o curso, indicador (línea base → actual → meta), fecha objetivo, evidencia y el historial. Las propuestas no aprobadas no se le muestran.

### Mentor (`routes.manage` + `routes.approve`, solo sus empresas asignadas)
1. **Nueva ruta** (`/rutas/nueva`): elige la empresa y
   - *Desde plantilla*: elige la plantilla (ves sus etapas), ponle nombre, opcionalmente vincúlala al diagnóstico y «Aprobar y activar de inmediato». Se arma en menos de 5 minutos (el tiempo queda en la auditoría, `tiempo_armado_seg`).
   - *Desde el diagnóstico*: la plataforma recomienda la plantilla (dimensión más débil → eje; nivel → línea Básico/Avanzado) y explica por qué. Se crea como **propuesta**; ninguna ruta recomendada se asigna sin que el mentor la apruebe.
2. **Ruta** (`/rutas/<id>`): ajusta cada etapa (servicio del catálogo, curso, indicador, línea base, meta y fecha), agrega/quita/reordena etapas, **aprueba** la propuesta (opción «Mostrar en el inicio de la empresa»), registra avance (en curso / completado con nota, valor del indicador y evidencia; completar exige evidencia) y ve la línea de tiempo.
3. **Cierre y escalamiento**: solicita cerrar (resultado + descripción) o cerrar y escalar a otra plantilla. Lo aprueba **otra persona** con `routes.approve` (separación de funciones; el Administrador puede aprobar lo propio). Al escalar, la ruta queda *escalada* y se crea la nueva ruta activa con `parent_id`.

### Gestor de Mentorías / Administrador
Todo lo del mentor sobre las empresas de su programa, aprobar cierres/escalamientos y editar **plantillas** (`/rutas/plantillas/<id>`: pasos con servicio/curso/actividad, indicador y meta). Las plantillas (tabla `rutas`) se crean en Configuración › Programas y rutas.

## Procesos por lotes (`src/lib/jobs/validacion.ts`)
| Proceso | Cada | Qué hace |
|---|---|---|
| `validacion.casos_empresas_pendientes` | 10 min | Crea el caso `empresa` de cada empresa pendiente y ejecuta la validación automática de los casos sin resultado (también al abrir la bandeja). |
| `validacion.plazos_solicitudes_informacion` | 30 min | Recordatorio `val_reminder_hours` (48 h) antes del plazo; al vencer: solicitud *vencida*, caso → *En revisión*, aviso al solicitante y al validador. También al abrir la bandeja / un caso / «Mis solicitudes». |
| `rutas.recomendar_desde_diagnostico` | 60 min | Propone (no asigna) una ruta para diagnósticos completados de empresas activas sin ruta. |

## Parámetros (`settings`)
`ai_enabled` (0: recomendación por reglas; la IA es opcional y nunca asigna sola) · `val_sla_days` (5) · `val_reminder_hours` (48) · `val_info_days` (5, plazo por defecto de los ajustes) · `val_checklist_<programa>` (JSON con la lista de chequeo) · `route_reco_map` (opcional, JSON `{"palabra de la dimensión": id_plantilla}`) · `APP_URL` (variable de entorno para los enlaces de las notificaciones).

## Integración Gestión de Clientes
`src/lib/integrations/gestion-clientes.ts` → `consultarEmpresa(nit)`. Sin `GESTION_CLIENTES_URL` lee la réplica `client_registry`; con ella hace `GET {URL}/empresas/{nit}` (Bearer `GESTION_CLIENTES_TOKEN`, 8 s de timeout) y espera los mismos campos. Si el servicio falla, el caso queda «Sin consulta» con el error y se valida manualmente.

## Trazabilidad requisito → pantalla / archivo
| FUN / RF | Criterio | Pantalla | Archivos |
|---|---|---|---|
| FUN-72 · RF-VAL-01 | Bandeja con filtros, asignación y tiempo de espera | `/validacion` | `src/app/(app)/validacion/page.tsx`, `actions.ts` (`assignCases`), `src/lib/validation.ts` (`ensureCompanyCases`, `caseFilter`, `waitTime`) |
| FUN-73 · RF-VAL-02 | Reglas configurables; < 6 meses de afiliación → «no cumple» | `/validacion/reglas`, `/validacion/<id>` | `validation.ts` (`evaluate`, `runAutoValidation`), `integrations/gestion-clientes.ts`, `actions.ts` (`saveRule`, `toggleRule`, `runAuto`) |
| FUN-74 · RF-VAL-03 | Lista de chequeo y observaciones; queda quién y por qué | `/validacion/<id>` | `actions.ts` (`saveManual`), auditoría `validacion_manual` |
| FUN-75 · RF-VAL-04 | Aprobar / rechazar / ajustes con motivo y notificación | `/validacion/<id>`, `/validacion/solicitudes` | `validation.ts` (`decideCase`), plantillas `activacion`, `validacion_*` |
| FUN-76 · RF-VAL-05 | Solicitud con plazo y recordatorios; al vencer cambia de estado | `/validacion/<id>`, `/validacion/solicitudes` | `validation.ts` (`createInfoRequest`, `answerInfoRequest`, `processDueRequests`), `jobs/validacion.ts` |
| FUN-77 · RF-VAL-06 | Excel masivo con resultado y motivo por fila | `/validacion/masiva` | `api/validacion/masiva/route.ts`, `api/validacion/plantilla/route.ts`, `validation.ts` (`bulkValidate`), `masiva/upload.tsx` |
| FUN-78 · RF-VAL-07 | Tablero por estado y responsable, filtro programa y periodo | `/validacion/tablero` | `validacion/tablero/page.tsx` |
| FUN-96 · RF-ANA-04 | Reportes de validación y seguimiento, filtrables y exportables | `/validacion/reportes` | `validation.ts` (`reportData`), `api/validacion/reporte/route.ts` |
| FUN-79 · RF-RUT-01 | Ruta desde plantilla (< 5 min) y desde diagnóstico | `/rutas/nueva` | `rutas/actions.ts` (`createRoute`), `src/lib/routes.ts` (`createFromTemplate`) |
| RF-RUT-05 | Recomendación con apoyo de IA opcional y aprobación humana | `/rutas/nueva`, `/rutas/<id>` | `routes.ts` (`recommend`, `proposeRecommended`, `activateRoute`), `jobs/validacion.ts` |
| FUN-80 · RF-RUT-02 | Servicios, indicadores, línea base y meta por etapa | `/rutas/<id>`, `/rutas/plantillas/<id>` | `rutas/actions.ts` (`saveStep`, `addStep`, `*TemplateStep`) |
| FUN-81 · RF-RUT-03 | La empresa consulta su ruta desde el celular | `/rutas` (empresa) | `rutas/page.tsx` (`CompanyView`), `rutas/view.tsx` |
| FUN-82 · RF-RUT-04 | Qué se hizo, cuándo y con qué evidencia | `/rutas/<id>` | `rutas/actions.ts` (`progressStep`), tabla `route_step_log`, `view.tsx` (`Timeline`) |
| FUN-94 · RF-ANA-02 | Cierre y escalamiento con aprobación; una ruta cerrada abre otra | `/rutas/<id>` | `routes.ts` (`requestClosure`, `decideClosure`), tabla `route_closures` |

Tablas propias (`src/lib/schemas/validacion.ts`): `route_step_log`, `route_closures`. Semilla idempotente: `src/lib/seeds/validacion.ts` (réplica de Gestión de Clientes con todos los NIT sembrados y casos que no cumplen, reglas, listas de chequeo, casos de demostración, pasos de las 4 plantillas, ruta activa de La Espiga con avance parcial y evidencia, 9 plantillas de notificación aprobadas en los 3 canales).
