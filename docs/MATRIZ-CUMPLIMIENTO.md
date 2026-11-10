# Matriz de cumplimiento — Anexo 07 (Requerimientos funcionales y técnicos)

Estado verificado sobre la plataforma entregada. **Cumple** = funciona en la aplicación. **Parcial** = funciona con una salvedad indicada. Las integraciones con sistemas de Compensar (IAM, OnBase, Gestión de Clientes, Microsoft 365, correo/SMS/WhatsApp) están implementadas detrás de adaptadores y operan en modo simulado hasta recibir credenciales y ambientes de prueba de Compensar.

## Resumen

| Fase | Funcionalidades | Cumple | Parcial |
|---|---|---|---|
| MVP | 47 | 47 | 0 |
| Deseable | 19 | 18 | 1 |
| Futuro | 32 | 32 | 0 |
| **Total** | **98** | **97** | **1** |

Requisitos técnicos (TEC-1 a TEC-106): ver la sección final y el detalle en `docs/modulos/tecnico-seguridad-integraciones.md` §13.


## MVP · Gestión de acceso y usuarios

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-03 | La plataforma permite el registro de usuarios y empresas para acceder al programa | ✅ Cumple | Invitación, cargue masivo y autorregistro con NIT+DV · `/usuarios`, `/empresas/cargue`, `/registro` |
| FUN-04 | La plataforma permite la recuperación de contraseñas de manera segura | ✅ Cumple | Recuperación con código de un solo uso, no revela si el correo existe, bloqueo tras 5 intentos · `/recuperar` |
| FUN-05 | La plataforma permite el cambio de contraseñas temporales durante el primer ingreso | ✅ Cumple | Clave temporal (3 días) con cambio obligatorio en el primer ingreso · `/cambiar-clave` |
| FUN-06 | La plataforma permite administrar perfiles de empresa y contactos asociados | ✅ Cumple | Perfil de empresa, representante principal y colaboradores, con historial · `/empresas/[id]`, `/usuarios` |
| FUN-07 | La plataforma permite configurar y administrar roles diferenciados para empresas, asesores y consultores | ✅ Cumple | 12 roles base + roles editables por la organización, alcance organización/programa/aliado/asignados · `/configuracion?tab=roles` |

## MVP · Convocatorias, eventos y charlas

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-08 | La plataforma permite crear nuevas convocatorias desde un módulo de administración | ✅ Cumple | Creación desde administración, limitada a los programas del usuario · `/eventos` |
| FUN-09 | La plataforma permite registrar información básica de convocatorias y eventos | ✅ Cumple | Nombre, programa, tipo, público, requisitos, responsable, estado (borrador/publicado/cerrado) · `/eventos/[id]` |
| FUN-10 | La plataforma permite configurar fechas, horarios, modalidad, ubicación, cupos y costos | ✅ Cumple | Fechas en hora de Colombia, modalidad, lugar/enlace, cupo con cierre automático, costo interno |
| FUN-11 | La plataforma permite asociar formularios a convocatorias y eventos | ✅ Cumple | Enlace a Microsoft Forms y formularios propios asociados al evento (`events.form_id`) · landing `/e/[slug]` |
| FUN-12 | La plataforma permite configurar recordatorios para convocatorias | ✅ Cumple | Recordatorios configurables por evento (p. ej. 7d,1d,1h) por correo, SMS y WhatsApp, proceso por lotes sin duplicar |
| FUN-13 | La plataforma permite incorporar imágenes, banners, resúmenes y descripciones | ✅ Cumple | Banner, resumen y descripción; las imágenes subidas pasan antivirus |
| FUN-14 | La plataforma permite crear y publicar landing pages para convocatorias y eventos | ✅ Cumple | Landing pública con marca, enlace corto no adivinable y código QR · `/e/[slug]` |
| FUN-15 | La plataforma permite visualizar un calendario o listado de eventos | ✅ Cumple | Calendario mensual/semanal y listado filtrable por programa, tipo, modalidad, estado, fecha y texto · `/eventos`, `/catalogo` |
| FUN-16 | La plataforma permite consultar convocatorias disponibles y su detalle | ✅ Cumple | Catálogo de convocatorias abiertas con buscador, detalle y cupos reales · `/catalogo` |
| FUN-17 | La plataforma permite inscribirse a convocatorias y eventos mediante formularios digitales | ✅ Cumple | Inscripción en línea con autorización Ley 1581 (versión del texto, fecha y hora) |
| FUN-18 | La plataforma valida credenciales y controla accesos durante la inscripción | ✅ Cumple | Valida sesión, rol, empresa activa, cupo y una inscripción por empresa; anti-bots |
| FUN-19 | La plataforma permite buscar, editar, activar, inactivar y duplicar convocatorias y eventos | ✅ Cumple | Editar, publicar/cerrar, activar/inactivar y duplicar como plantilla sin borrar historial |
| FUN-20 | La plataforma permite consultar y exportar listados de inscritos | ✅ Cumple | Listado de inscritos y exportación Excel/CSV; sin permiso de datos personales se exporta sin esas columnas |
| FUN-21 | La plataforma permite gestionar asistencia individual y masiva | ✅ Cumple | Asistencia individual, masiva, por código QR y por cargue del reporte de Teams/Zoom con minutos mínimos |
| FUN-22 | La plataforma permite generar y enviar certificados automáticamente | ✅ Cumple | Certificado PDF automático con firma electrónica verificable, QR y código en `/verificar/[código]`, enviado por correo |
| FUN-23 | La plataforma permite cargar evidencias asociadas a eventos | ✅ Cumple | Evidencias del evento a OnBase (adaptador) con quién las subió |

## MVP · Activación de empresas

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-24 | La plataforma permite realizar cargues masivos de empresas al programa | ✅ Cumple | Cargue masivo Excel con validación fila por fila (NIT módulo 11, duplicados, obligatorios), todo o nada · `/empresas/cargue` |
| FUN-25 | La plataforma permite crear cuentas empresariales, usuarios principales y contactos asociados | ✅ Cumple | Cuenta empresarial, representante y contactos con invitación |
| FUN-26 | La plataforma permite activar empresas y habilitar su acceso a la plataforma | ✅ Cumple | Activación individual o masiva; una empresa no activa no accede a servicios; también desde Validación |
| FUN-27 | La plataforma permite notificar activaciones o restricciones de ingreso | ✅ Cumple | Avisos de activación, suspensión o restricción por correo, SMS y WhatsApp con estado de entrega |
| FUN-28 | La plataforma permite gestionar pasos iniciales obligatorios para nuevas empresas | ✅ Cumple | Pasos obligatorios configurables del primer ingreso (autorización de datos y perfil) · `/onboarding` |
| FUN-29 | La plataforma permite visualizar y actualizar el perfil empresarial | ✅ Cumple | Perfil editable por el representante y el mentor asignado, con antes/después en auditoría |
| FUN-30 | La plataforma incluye procesos de bienvenida y orientación inicial | ✅ Cumple | Bienvenida configurable con oferta, próximos eventos, ruta, diagnóstico y sesiones · inicio de la empresa |

## MVP · Asignación de asesores

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-31 | La plataforma permite asignar asesores a las empresas | ✅ Cumple | Asignación de mentores uno a uno o masiva, con reasignación que conserva el historial |
| FUN-32 | La plataforma permite notificar automáticamente las asignaciones realizadas | ✅ Cumple | Notificación al mentor y a la empresa por los canales configurados |
| FUN-33 | La plataforma permite consultar información de las empresas asignadas | ✅ Cumple | El mentor solo ve sus empresas; enlace directo ajeno → «Sin acceso» |
| FUN-34 | La plataforma permite gestionar agendas de acompañamiento | ✅ Cumple | Agenda con calendario mes/semana y disponibilidad del mentor; invitación .ics y adaptador Microsoft Graph (sincronización real requiere credenciales de Compensar) |
| FUN-35 | La plataforma permite programar, reprogramar y cancelar sesiones | ✅ Cumple | Programar, reprogramar y cancelar con motivo; mentor, empresa o administrador |
| FUN-36 | La plataforma permite registrar seguimientos y resultados de las sesiones | ✅ Cumple | Seguimiento por sesión: temas, compromisos, resultados y horas; sesiones sin seguimiento quedan marcadas y generan alerta |
| FUN-37 | La plataforma permite compartir documentación entre asesor y empresa | ✅ Cumple | Documentos compartidos por sesión con aceptación por clic (usuario, fecha, hora, IP), almacenados vía OnBase |
| FUN-38 | La plataforma permite consultar el historial de acompañamiento | ✅ Cumple | Línea de tiempo del acompañamiento y trazabilidad completa exportable · `/empresas/[id]`, `/trazabilidad/[id]` |

## MVP · Prestación de servicios

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-39 | La plataforma permite remitir empresas a servicios especializados | ✅ Cumple | Remisión a servicios de aliados con estados y aceptación de la empresa · `/remisiones` |
| FUN-40 | La plataforma permite asignar empresas o servicios a consultores | ✅ Cumple | El coordinador del aliado asigna a sus mentores; cada mentor ve solo lo suyo |
| FUN-41 | La plataforma permite consultar servicios disponibles para remisión | ✅ Cumple | Catálogo de servicios por programa y línea (mismo catálogo de parametrización) |
| FUN-42 | La plataforma permite consultar servicios asignados, sesiones programadas y documentos compartidos | ✅ Cumple | Vista por rol de servicios, sesiones y documentos |
| FUN-43 | La plataforma permite consultar resultados, indicadores e historial de servicios recibidos | ✅ Cumple | Resultados, indicadores e historial por empresa con exportación · `/indicadores`, `/informe-final/[id]` |

## MVP · Programación de asesorías

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-44 | La plataforma permite consultar agendas de asesoría programadas | ✅ Cumple | Consulta de agendas por mentor, empresa, programa y rango de fechas · `/agenda` |
| FUN-45 | La plataforma permite gestionar notificaciones asociadas al proceso de asesoría | ✅ Cumple | Notificaciones de programación, recordatorio, reprogramación y cancelación con plantillas aprobadas |

## MVP · Resultados, cierre y analítica

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-46 | La plataforma permite consolidar los resultados generados durante el proceso de acompañamiento | ✅ Cumple | Consolidación de resultados y aprobación del cierre; un cierre aprobado impide nuevas sesiones · `/cierres` |
| FUN-47 | La plataforma permite medir el impacto alcanzado frente a los objetivos definidos | ✅ Cumple | Línea base frente a resultado por indicador y diagnóstico inicial vs. final · R-10, `/diagnosticos/comparacion` |
| FUN-48 | La plataforma permite gestionar la facturación asociada a los servicios prestados | ✅ Cumple | Soporte de pago por aliado con solo sesiones aceptadas y separación de funciones (sin facturación electrónica ni ERP, fuera de alcance según Anexo 05) · `/pagos` |
| FUN-49 | La plataforma permite generar reportes e indicadores sobre convocatorias, eventos, programas y servicios | ✅ Cumple | 15 reportes por periodo y alcance en Excel/CSV/JSON/PDF · `/reportes` |

## Deseable · Inscripción al programa

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-50 | La plataforma permite crear y administrar formularios para inscripción a programas | ✅ Cumple | Formularios con versiones y estados; publicar crea versión nueva sin alterar respuestas · `/formularios` |
| FUN-51 | La plataforma permite diseñar formularios sin necesidad de desarrollo | ✅ Cumple | Constructor visual sin código con vista previa y autoguardado |
| FUN-52 | La plataforma permite configurar preguntas, secciones y diferentes tipos de respuesta | ✅ Cumple | 10 tipos de pregunta (incl. NIT y DIVIPOLA), secciones, obligatoriedad y validaciones |
| FUN-53 | La plataforma permite crear formularios de diagnóstico con puntuación y lógica condicional | ✅ Cumple | Diagnóstico con puntaje por opción, pesos por pregunta y dimensión, lógica mostrar/omitir |
| FUN-54 | La plataforma permite generar resultados automáticos a partir de formularios de diagnóstico | ✅ Cumple | Resultado automático al enviar: puntaje, nivel, recomendaciones |
| FUN-55 | La plataforma permite publicar formularios y capturar información de participantes | ✅ Cumple | Publicación por enlace o asociada a convocatoria/programa; respuestas exportables |
| FUN-56 | La plataforma permite diligenciar formularios y validar la información registrada | ✅ Cumple | Validación en tiempo real y en servidor (formatos, obligatorios, duplicados) |

## Deseable · Diagnóstico empresarial

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-57 | La plataforma permite crear y administrar diagnósticos empresariales | ✅ Cumple | Instrumentos de diagnóstico versionados · `/diagnosticos` |
| FUN-58 | La plataforma permite registrar empresas manualmente para iniciar diagnósticos | ✅ Cumple | Registro manual de empresas para diagnóstico sin duplicar NIT |
| FUN-59 | La plataforma permite gestionar estados y etapas del diagnóstico | ✅ Cumple | Estados asignado → en curso → en revisión → completado, auditados |
| FUN-60 | La plataforma permite realizar autodiagnósticos empresariales | ✅ Cumple | Autodiagnóstico de la empresa desde su cuenta |
| FUN-61 | La plataforma permite procesar respuestas y generar resultados automáticamente | 🟡 Parcial | Cálculo automático implementado y documentado; falta contrastarlo con la hoja de cálculo de referencia de Compensar (no entregada aún) |
| FUN-62 | La plataforma permite clasificar empresas según los resultados obtenidos | ✅ Cumple | Clasificación por nivel y segmento configurable con recálculo |
| FUN-63 | La plataforma permite visualizar niveles, resultados y hallazgos del diagnóstico | ✅ Cumple | Resultados por dimensión (radar y barras), hallazgos y PDF con marca |

## Deseable · Seguimiento y medición

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-64 | La plataforma mantiene trazabilidad detallada de todas las acciones realizadas | ✅ Cumple | Registro de auditoría inalterable (triggers en la base) de cada acción · `/auditoria` |
| FUN-65 | La plataforma permite consultar y descargar documentos asociados al proceso | ✅ Cumple | Centro documental con permisos por rol y vista en línea · `/documentos` |
| FUN-66 | La plataforma permite identificar qué usuario realizó cada acción y cuándo | ✅ Cumple | Quién, qué, cuándo, antes/después, IP y navegador en cada registro |
| FUN-67 | La plataforma permite definir y monitorear indicadores de gestión e impacto | ✅ Cumple | Indicadores de gestión e impacto por programa y servicio con metas y periodicidad · `/indicadores` |
| FUN-68 | La plataforma permite visualizar avances, indicadores y evolución de resultados | ✅ Cumple | Tablero de avances con evolución en el tiempo y cumplimiento de metas |

## Futuro · Inscripción al programa

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-69 | La plataforma permite guardar formularios parcialmente y continuar posteriormente | ✅ Cumple | Guardado automático de borradores en servidor (con sesión); en formularios públicos sin sesión el borrador se guarda en el navegador |
| FUN-70 | La plataforma permite enviar notificaciones automáticas posteriores a la inscripción | ✅ Cumple | Confirmación al enviar y avisos de cambio de estado, ajustes y solicitudes de información |
| FUN-71 | La plataforma permite consultar el estado de una inscripción | ✅ Cumple | Consulta del estado y motivo por el participante · `/mis-formularios`, `/validacion/solicitudes` |

## Futuro · Validación de requisitos

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-72 | La plataforma permite gestionar solicitudes pendientes de validación | ✅ Cumple | Bandeja con filtros, asignación y tiempo de espera · `/validacion` |
| FUN-73 | La plataforma permite validar automáticamente los requisitos definidos por la entidad | ✅ Cumple | Reglas configurables evaluadas contra Gestión de Clientes (adaptador; hoy réplica local, conmutable a API REST) |
| FUN-74 | La plataforma permite ejecutar validaciones manuales complementarias | ✅ Cumple | Lista de chequeo y observaciones, con quién validó y por qué |
| FUN-75 | La plataforma permite aprobar, rechazar o solicitar ajustes sobre una inscripción | ✅ Cumple | Aprobar, rechazar o pedir ajustes con motivo y notificación |
| FUN-76 | La plataforma permite solicitar documentación o información adicional | ✅ Cumple | Solicitudes de información con plazo, recordatorio y vencimiento automático |
| FUN-77 | La plataforma permite procesar validaciones masivas mediante archivos Excel | ✅ Cumple | Validación masiva por Excel con resultado descargable fila por fila · `/validacion/masiva` |
| FUN-78 | La plataforma permite visualizar el avance del proceso de validación | ✅ Cumple | Tablero por estado y responsable, filtrable por programa y periodo |

## Futuro · Rutas de acompañamiento

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-79 | La plataforma permite configurar rutas de acompañamiento personalizadas | ✅ Cumple | Rutas desde plantilla (< 5 min) y desde diagnóstico; recomendación por reglas con aprobación del mentor (IA opcional y desactivada) · `/rutas` |
| FUN-80 | La plataforma permite asociar servicios, indicadores, línea base y metas a una ruta | ✅ Cumple | Servicios, indicador, línea base y meta por etapa |
| FUN-81 | La plataforma permite que la empresa consulte su ruta de acompañamiento | ✅ Cumple | La empresa consulta su ruta y avance desde el celular · «Mi ruta» |
| FUN-82 | La plataforma permite visualizar el avance de una ruta y la trazabilidad del proceso | ✅ Cumple | Avance con evidencia obligatoria y línea de tiempo |

## Futuro · Gestión de servicios

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-83 | La plataforma permite definir líneas base e indicadores para cada servicio | ✅ Cumple | Línea base e indicadores por servicio del catálogo |
| FUN-84 | La plataforma permite actualizar indicadores durante la ejecución de mentorías o consultorías | ✅ Cumple | Actualización de indicadores durante la mentoría con soporte (también desde la sesión) |
| FUN-85 | La plataforma permite evaluar la experiencia y satisfacción sobre servicios específicos | ✅ Cumple | Encuestas automáticas al cierre, remisión y evento; resultados por aliado y servicio · `/encuestas` |
| FUN-86 | La plataforma permite acceder a contenidos, herramientas y material de apoyo | ✅ Cumple | Biblioteca de contenidos filtrable por programa y servicio · `/biblioteca` |

## Futuro · Seguimiento, alertas y operación

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-87 | La plataforma permite visualizar el estado general de procesos y planes de trabajo | ✅ Cumple | Estado general por programa, mentor y empresa · `/seguimiento` |
| FUN-88 | La plataforma permite generar alertas automáticas ante retrasos o riesgos | ✅ Cumple | 8 reglas de alerta con umbral, responsable y canal; proceso automático |
| FUN-89 | La plataforma permite identificar empresas con alertas o desviaciones | ✅ Cumple | Semáforo por empresa filtrable por color y programa |
| FUN-90 | La plataforma permite registrar tareas, actividades y evidencias operativas | ✅ Cumple | Tareas con responsable, vencimiento y evidencia; las vencidas alertan · `/tareas` |
| FUN-91 | La plataforma permite gestionar comunicaciones entre asesores y empresarios | ✅ Cumple | Mensajería mentor-empresa con aviso por correo/SMS/WhatsApp y lectura · `/mensajes` |
| FUN-92 | La plataforma permite descargar reportes operativos y hojas de ruta | ✅ Cumple | Hoja de ruta en PDF con marca y exportes operativos Excel/CSV · `/hoja-de-ruta/[id]` |

## Futuro · Resultados, experiencia y analítica avanzada

| FUN | Requerimiento | Estado | Cómo se cumple / dónde |
|---|---|---|---|
| FUN-93 | La plataforma permite generar informes finales para las empresas beneficiarias | ✅ Cumple | Informe final por empresa en PDF con marca, descargable por la empresa · `/informe-final/[id]` |
| FUN-94 | La plataforma permite gestionar el cierre y escalamiento de rutas | ✅ Cumple | Cierre y escalamiento de rutas con aprobación de otra persona |
| FUN-95 | La plataforma permite aplicar encuestas de satisfacción y experiencia | ✅ Cumple | NPS, satisfacción y análisis de temas en respuestas abiertas |
| FUN-96 | La plataforma permite generar reportes de validación y seguimiento de empresas | ✅ Cumple | Reportes de validación (R-13) y seguimiento de empresas (R-14) |
| FUN-97 | La plataforma permite construir dashboards configurables para la operación | ✅ Cumple | Tableros configurables por usuario y conexión Power BI (`/api/bi`) · `/analitica/tableros` |
| FUN-98 | La plataforma permite consultar información por programa, convocatoria, asesor, aliado o período | ✅ Cumple | Consulta por programa, convocatoria, mentor, aliado y periodo con seguridad por fila · `/analitica` |
| FUN-99 | La plataforma permite visualizar la trazabilidad de extremo a extremo de una empresa o caso | ✅ Cumple | Trazabilidad de punta a punta por empresa en una sola vista · `/trazabilidad/[id]` |
| FUN-100 | La plataforma permite exportar información operativa y analítica a Excel, CSV u otros formatos | ✅ Cumple | Exportación Excel/CSV/JSON/PDF de reportes, consultas y listados (PDF como vista imprimible) |

## Requisitos técnicos (TEC)

**Cumple** = implementado en el código y probado. **Parcial** = el código está; falta la parte de infraestructura o un proceso. **Compromiso del proveedor** = no se resuelve con código: infraestructura, contrato, política o certificación que se documenta en la propuesta.

| TEC | Tema | Estado | Implementación / nota |
|---|---|---|---|
| 1 | Identidad propia | ✅ Cumple | Login, recuperación por código, clave temporal, cambio de clave, bloqueo por intentos |
| 2, 4 | SSO con IAM / Entra ID | ✅ Cumple | OIDC (Authorization Code + PKCE, RS256) con mapeo de grupos a roles; probado de punta a punta con el IdP de prueba incluido |
| 3 | SAML / OAuth / OIDC | 🟡 Parcial | OAuth 2.0 y OIDC nativos; SAML 2.0 a través de Entra ID o un broker |
| 5 | LDAP | Compromiso del proveedor | No se implementa por diseño (obligaría a recibir claves corporativas); federación por IdP |
| 6 | MFA / OTP nativo | ✅ Cumple | TOTP obligatorio para roles internos y de aliado, con códigos de recuperación; código al correo para empresas (llaves de acceso/passkeys: siguiente versión) |
| 7 | Anti-bots | 🟡 Parcial | Límites por IP y cuenta, campo trampa, Cloudflare Turnstile opcional, bloqueo; WAF Bot Control = infraestructura |
| 8, 9 | Administración autónoma y delegada | ✅ Cumple | Usuarios, roles editables, delegación por niveles (gestor, coordinador de aliado, empresa) |
| 10, 15 | Navegadores y WCAG | 🟡 Parcial | HTML estándar, etiquetas, foco visible, contraste, salto al contenido; auditoría WCAG 2.2 AA formal pendiente |
| 11 | Responsive | ✅ Cumple | Verificado en celular (375 px) y escritorio |
| 12 | Notificaciones propias o de Compensar | ✅ Cumple | Adaptador de notificaciones + webhooks/API |
| 13, 14 | App móvil / offline | Compromiso del proveedor | Fuera de alcance (Anexo 05); web responsive |
| 16 | Sin plugins | ✅ Cumple | Solo navegador |
| 17–21 | Roadmap, mantenimiento, versiones, IPv6 | Compromiso del proveedor | Documentos y balanceador |
| 22 | TLS / HTTPS | 🟡 Parcial | HSTS, cookies seguras, CSP; certificado TLS en el balanceador |
| 23–31, 38 | Ambientes, nube, tenencia, HA, autoescalado | Compromiso del proveedor | Despliegue dedicado (single-tenant) por organización |
| 32, 35 | ETL / ESB | 🟡 Parcial | API REST, exportaciones Excel/CSV/JSON y vistas BI; conexión al API Manager en despliegue |
| 33, 34 | API REST y OpenAPI | ✅ Cumple | `/api/v1/*` con OAuth 2.0 client credentials y scopes; `/api/openapi.json` + `/api-docs` |
| 36 | Procesos por lotes | ✅ Cumple | 14 procesos programados con historial y «Ejecutar ahora» |
| 37 | Circuit breakers | ✅ Cumple | Corte y cola de reintentos con espera exponencial (OnBase, webhooks) |
| 39, 40 | Desempeño | 🟡 Parcial | Páginas < 2 s y reportes < 0,2 s en pruebas; prueba de carga con 500 usuarios pendiente |
| 41 | Disponibilidad en tiempo real | ✅ Cumple | `/api/health` y `/api/metrics` (Prometheus) |
| 42–54 | SLA, DRP, RTO/RPO, BCP, respaldos | Compromiso del proveedor | Infraestructura y contrato |
| 55, 56 | WAF / anti-DDoS | 🟡 Parcial | Cabeceras, CSP, consultas parametrizadas, límites; WAF/Shield = infraestructura |
| 57 | Antivirus de adjuntos | 🟡 Parcial | Escaneo antes de guardar (firma de prueba); motor antimalware gestionado en producción |
| 58 | Cifrado en reposo | 🟡 Parcial | Archivos y secretos con AES-256-GCM; cifrado de base y respaldos con KMS en infraestructura |
| 59 | Sanitización | ✅ Cumple | Normalización y validación en servidor, NIT único |
| 60 | Adjuntos fuera de la BD | ✅ Cumple | La BD guarda solo la referencia OnBase |
| 61–71 | Controles, hardening, pentest, auditorías TI | Compromiso del proveedor | Proceso y contrato |
| 72, 74 | Logs administrativos y consulta | ✅ Cumple | Auditoría inalterable con filtros y exportación |
| 73 | Logs técnicos | ✅ Cumple | Registro de errores sin datos personales |
| 75 | Envío a SIEM | ✅ Cumple | `/api/v1/auditoria` en JSON Lines con cursor |
| 76, 77 | Observabilidad corporativa | 🟡 Parcial | Métricas Prometheus; trazas OpenTelemetry pendientes |
| 78, 80 | Anomalías y alertas | 🟡 Parcial | Picos de ingresos fallidos y errores → alerta a administradores; guardia 7x24 = proceso |
| 79 | Acceso a componentes | Compromiso del proveedor | Infraestructura |
| 81, 82 | IA | ✅ Cumple | La IA es opcional y viene desactivada (`ai_enabled=0`); la recomendación de rutas usa reglas y aprobación humana; no se entrenan modelos con datos de Compensar |
| 83–86 | Stack, BD, control de versiones, SO | Compromiso del proveedor | Documentado en README |
| 87 | Capas separadas | ✅ Cumple | Interfaz → acciones/API → librerías de negocio → adaptadores de integración |
| 88 | Modelo de datos | ✅ Cumple | `docs/MODELO-DATOS.md` |
| 89 | Exportación total | ✅ Cumple | `/api/export/total` (Excel por tabla + JSON), auditada |
| 90 | Borrado seguro | Compromiso del proveedor | Procedimiento contractual |
| 91 | Objetos con datos personales | ✅ Cumple | Integraciones → Datos personales |
| 92–98 | BI y reportes | ✅ Cumple | Analítica, tableros, consultas self-service, vistas BI con seguridad por fila, Power BI |
| 99, 101, 102 | Manuales, catálogo de roles, catálogo de interfaces | ✅ Cumple | `docs/modulos/*`, `docs/CATALOGO-ROLES.md`, `docs/matriz-permisos-aprobada.json`, OpenAPI |
| 105, 106 (parte de código) | Buenas prácticas | 🟡 Parcial | Pruebas automáticas (`npm test`) de permisos, aislamiento y separación de funciones; SAST y política = proceso |
| 100, 103, 105, 106 | Desarrollo seguro, ISO 27001, SAST | Compromiso del proveedor | Política y proceso |
| 104 | Timeout por inactividad | ✅ Cumple | Configurable (30 min por defecto) |

## Requisitos del ERS (RF, RN, RNF y casos de uso)

Requisitos funcionales del MVP (RF): **87** — 83 cumplen, 3 parciales (dependen de credenciales o configuración de Compensar), 1 de despliegue. Reglas RN: 10/10. Casos de uso CU-01 a CU-06: ensayados de punta a punta. Las pruebas automáticas (`npm test`, 35) cubren la matriz rol-permiso, el aislamiento por rol y la separación de funciones.

### Casos de uso críticos (§9)

| ID | Estado | Cómo se cumple |
|---|---|---|
| CU-01 | ✅ Cumple | Configurar el programa sin código |
| CU-02 | ✅ Cumple | Evento, cupo, QR, Teams, certificado verificable |
| CU-03 | ✅ Cumple | Cargue con error y corrección, activación, primer ingreso |
| CU-04 | ✅ Cumple | Mentoría con aceptación; mentor ajeno sin acceso |
| CU-05 | ✅ Cumple | Aliado, 2 de 3 sesiones aceptadas, pago con separación de funciones |
| CU-06 | ✅ Cumple | Cierre, reportes < 1 min, auditoría inalterable |

### Requisitos funcionales del MVP (§4)

| ID | Estado | Cómo se cumple |
|---|---|---|
| RF-ACC-01 | ✅ Cumple | Invitación, cargue masivo y autorregistro con NIT+DV; autorregistrada queda pendiente y sin servicios |
| RF-ACC-02 | ✅ Cumple | SSO OIDC con mapeo de grupos a roles; el funcionario entra sin crear contraseña (probado con el IdP de prueba) |
| RF-ACC-03 | ✅ Cumple | Código de un solo uso; respuesta neutra; bloqueo temporal tras 5 intentos fallidos (clave y códigos) |
| RF-ACC-04 | ✅ Cumple | Clave temporal de 3 días con cambio obligatorio; si vence, el administrador reenvía la invitación |
| RF-ACC-05 | ✅ Cumple | 2FA TOTP obligatorio para roles internos y de aliado; empresas con código al correo |
| RF-ACC-06 | ✅ Cumple | Representante agrega y quita colaboradores, auditado |
| RF-ACC-07 | ✅ Cumple | Roles con alcance + prueba automática de las 852 combinaciones rol-permiso (`npm test`) que falla si cambian sin aprobación |
| RF-ACC-08 | ✅ Cumple | Rol nuevo a partir de otro y edición de permisos sin desarrollo |
| RF-ACC-09 | ✅ Cumple | Listar, filtrar, invitar, reenviar, revocar (efecto inmediato), desactivar y reactivar |
| RF-ACC-10 | ✅ Cumple | Cierre por inactividad configurable |
| RF-PAR-01 | ✅ Cumple | Programas con requisitos, vigencia, responsable y estado |
| RF-PAR-02 | ✅ Cumple | Ejes, líneas y rutas: crear, renombrar e inactivar conservando historial |
| RF-PAR-03 | ✅ Cumple | Catálogo de servicios con aliado, horas, sesiones, indicadores y costo interno informativo |
| RF-PAR-04 | ✅ Cumple | Cursos de varias sesiones con asistencia por sesión y % mínimo para certificar |
| RF-PAR-05 | ✅ Cumple | Aliados con coordinador y mentores; cada aliado ve solo lo suyo |
| RF-PAR-06 | ✅ Cumple | Logo, color y textos editables; landings, certificados PDF y mensajes salen con la marca |
| RF-PAR-07 | ✅ Cumple | Plantillas por canal; una no aprobada no se envía |
| RF-PAR-08 | ✅ Cumple | Pasos del primer ingreso configurables y obligatorios en todas las pantallas |
| RF-CON-01 | ✅ Cumple | Creación limitada a los programas del usuario |
| RF-CON-02 | ✅ Cumple | Datos básicos y estados; un borrador no aparece en catálogo ni landing |
| RF-CON-03 | ✅ Cumple | Hora de Colombia, modalidad, lugar/enlace, cupo con cierre automático, costo interno |
| RF-CON-04 | ✅ Cumple | Enlace a Microsoft Forms y formularios propios desde la landing |
| RF-CON-05 | ✅ Cumple | Recordatorios configurables (7d, 1d, 1h) por correo, SMS y WhatsApp con estado |
| RF-CON-06 | ✅ Cumple | Banner subido con antivirus y verificación de tipo, o por URL; descripción enriquecida segura |
| RF-CON-07 | ✅ Cumple | Landing pública con 3 plantillas, marca, enlace no adivinable y QR |
| RF-CON-08 | ✅ Cumple | Calendario mensual y semanal + listado con filtros; 154 eventos en < 0,5 s |
| RF-CON-09 | ✅ Cumple | Catálogo con buscador, detalle y cupos reales |
| RF-CON-10 | ✅ Cumple | Autorización Ley 1581 con versión, fecha y hora |
| RF-CON-11 | ✅ Cumple | Valida sesión, rol, empresa activa y unicidad empresa-evento |
| RF-CON-12 | ✅ Cumple | Buscar, editar, activar/inactivar y duplicar como plantilla sin fechas ni inscritos |
| RF-CON-13 | ✅ Cumple | Inscritos con filtros y exportación Excel/CSV; sin permiso, sin datos personales |
| RF-CON-14 | ✅ Cumple | Asistencia individual, masiva, QR y reporte Teams/Zoom por sesión con minutos mínimos |
| RF-CON-15 | ✅ Cumple | Certificado PDF automático con QR, código verificable y firma electrónica Ed25519 (no es firma digital de una ECD; si Compensar la exige, se integra su certificado) |
| RF-CON-16 | ✅ Cumple | Evidencias a OnBase con quién las subió |
| RF-CON-17 | ✅ Cumple | Lista de espera; al liberarse un cupo se promueve y notifica al primero |
| RF-EMP-01 | ✅ Cumple | Cargue Excel/CSV/JSON fila por fila, todo o nada |
| RF-EMP-02 | ✅ Cumple | Distingue «ya está en este programa» de «ya existe en la organización» |
| RF-EMP-03 | ✅ Cumple | Cuenta, representante y contactos; un contacto existente queda vinculado a la nueva empresa (selector de empresa) |
| RF-EMP-04 | ✅ Cumple | Activación tras validar requisitos; sin activar no se inscribe |
| RF-EMP-05 | ✅ Cumple | Avisos de activación/suspensión por 3 canales con estado |
| RF-EMP-06 | ✅ Cumple | Primer ingreso guiado; no se avanza hasta completarlo |
| RF-EMP-07 | ✅ Cumple | Perfil editable por representante y mentor; historial con quién, cuándo, antes y después |
| RF-EMP-08 | ✅ Cumple | Directorio; los campos ocultos no aparecen ni en búsquedas |
| RF-EMP-09 | ✅ Cumple | Redes sociales si la empresa lo permite |
| RF-EMP-10 | ✅ Cumple | Bienvenida editable con oferta, eventos y pasos |
| RF-EMP-11 | ✅ Cumple | Asignación de cursos, rutas y servicios visible en el inicio de la empresa |
| RF-ACO-01 | ✅ Cumple | Asignación individual/masiva y reasignación con historial |
| RF-ACO-02 | ✅ Cumple | Notificación al mentor y a la empresa |
| RF-ACO-03 | ✅ Cumple | El mentor solo ve sus empresas; por enlace ajeno «Sin acceso» (prueba automática) |
| RF-ACO-04 | 🟡 Parcial | Calendario, disponibilidad y adaptador Microsoft Graph probado contra simulador; falta la aplicación y credenciales en el Entra ID de Compensar para sincronizar con su Outlook real (mientras tanto, invitación .ics) |
| RF-ACO-05 | ✅ Cumple | Mentor, empresa (en franjas libres) y administrador programan, reprograman y cancelan con motivo; .ics a participantes |
| RF-ACO-06 | ✅ Cumple | Seguimiento por sesión; sesiones vencidas sin seguimiento se marcan y alertan |
| RF-ACO-07 | ✅ Cumple | Aceptación por clic con usuario, fecha, hora e IP; sin aceptación no cuenta para pagos |
| RF-ACO-08 | ✅ Cumple | Documentos con aceptación por clic, OnBase y auditoría |
| RF-ACO-09 | ✅ Cumple | Línea de tiempo exportable a PDF |
| RF-ACO-10 | ✅ Cumple | Agendas por mentor, empresa, programa y fechas |
| RF-ACO-11 | ✅ Cumple | Avisos de programación, recordatorio (24 h y 1 h), reprogramación y cancelación con plantillas aprobadas |
| RF-ACO-12 | ✅ Cumple | Intercambio por documentos en la sesión (además existe la mensajería de FUN-91) |
| RF-SRV-01 | ✅ Cumple | Remisiones con estados enviada, aceptada, en curso, cerrada, rechazada y aceptación de la empresa |
| RF-SRV-02 | ✅ Cumple | Coordinador asigna a sus mentores; mentores de otro aliado no ven la remisión |
| RF-SRV-03 | ✅ Cumple | Mismo catálogo de servicios |
| RF-SRV-04 | ✅ Cumple | Vista por rol |
| RF-SRV-05 | ✅ Cumple | Horas registradas por el mentor y aceptadas por la empresa; las no aceptadas no suman |
| RF-SRV-06 | ✅ Cumple | Exportación Excel/CSV por empresa y periodo desde la ficha |
| RF-RES-01 | ✅ Cumple | Consolidación y aprobación de cierre que bloquea nuevas sesiones |
| RF-RES-02 | ✅ Cumple | Línea base vs. resultado y diagnóstico inicial vs. final |
| RF-RES-03 | ✅ Cumple | Reporte por aliado aprobado por el Aprobador de pagos con separación de funciones; Excel sin facturación |
| RF-RES-04 | ✅ Cumple | Trazabilidad FOSFEC: servicio, cuándo, quién y evidencia |
| RF-RES-05 | ✅ Cumple | 15 reportes por periodo en Excel, CSV, JSON y PDF en < 1 s |
| RF-NOT-01 | ✅ Cumple | Correo, SMS y WhatsApp activables por organización (proveedores simulados hasta contratar) |
| RF-NOT-02 | 🟡 Parcial | Remitente configurable; SPF, DKIM y DMARC se configuran en el dominio de Compensar al desplegar |
| RF-NOT-03 | ✅ Cumple | Enviado, entregado, leído y fallido por mensaje |
| RF-NOT-04 | ✅ Cumple | Todos los mensajes en español y con la marca |
| RF-NOT-05 | ✅ Cumple | Preferencias por canal; los de seguridad no se desactivan |
| RF-DOC-01 | 🟡 Parcial | Adaptador OnBase con referencia y cola de reintentos; conexión real pendiente de la API y ambiente de Compensar |
| RF-DOC-02 | ✅ Cumple | Formatos permitidos y máximo 20 MB con mensaje claro |
| RF-DOC-03 | ✅ Cumple | Antivirus antes de enviar; infectado rechazado y auditado (motor gestionado en producción) |
| RF-DOC-04 | ✅ Cumple | Aceptación con usuario, fecha, hora e IP, exportable |
| RF-AUD-01 | ✅ Cumple | Registro inalterable (triggers) con antes/después, IP y navegador |
| RF-AUD-02 | ✅ Cumple | Consulta y exportación filtrable por Auditor y Administrador |
| RF-INT-01 | ✅ Cumple | Toda integración pasa por adaptadores del servidor; sin credenciales en el navegador |
| RF-INT-02 | ✅ Cumple | API OpenAPI con OAuth 2.0 y scopes |
| RF-INT-03 | ✅ Cumple | Reintentos exponenciales, idempotencia y cola (probado con OnBase caído) |
| RF-INT-04 | ✅ Cumple | Registro de cada intercambio sin datos sensibles |
| RF-INT-05 | ✅ Cumple | Webhooks firmados HMAC (inscripción, asistencia, certificado, activación, sesión aceptada, cierre) |
| RF-INT-06 | ✅ Cumple | Importación y exportación Excel, CSV y JSON con validación fila por fila |
| RF-INT-07 | Compromiso del proveedor | Conexión a los ambientes de prueba de Compensar al iniciar la implementación |

### Reglas de acceso (§3)

| ID | Estado | Cómo se cumple |
|---|---|---|
| RN-01 | ✅ Cumple | Despliegue dedicado; los datos se aíslan por instancia |
| RN-02 | ✅ Cumple | Alcance por rol, probado automáticamente |
| RN-03 | ✅ Cumple | Delegación por niveles; nadie se asigna roles |
| RN-04 | ✅ Cumple | Roles combinados suman permisos (probado) |
| RN-05 | ✅ Cumple | Separación de funciones en cierres y pagos (probado) |
| RN-06 | ✅ Cumple | Internos por invitación; empresas por cargue o autorregistro pendiente |
| RN-07 | ✅ Cumple | SSO; la desactivación en el IAM corta el acceso |
| RN-08 | ✅ Cumple | 2FA por rol; código al correo para empresas |
| RN-09 | ✅ Cumple | Inactividad configurable (30 min) |
| RN-10 | ✅ Cumple | Asignaciones, revocaciones y activaciones auditadas |

### Requisitos no funcionales (§7)

| ID | Estado | Cómo se cumple |
|---|---|---|
| RNF-SEG-01/02 | ✅ Cumple | Identidad propia + SSO + 2FA TOTP (sin SMS como factor) |
| RNF-SEG-03 | ✅ Cumple | Límites, campo trampa, Turnstile opcional y bloqueo |
| RNF-SEG-04 | ✅ Cumple | Administración autónoma |
| RNF-SEG-05 | 🟡 Parcial | HSTS y cookies seguras; TLS en el balanceador |
| RNF-SEG-06 | 🟡 Parcial | AES-256-GCM en archivos y secretos; base y respaldos con KMS en infraestructura |
| RNF-SEG-07 | 🟡 Parcial | CSP y consultas parametrizadas; WAF/anti-DDoS en infraestructura |
| RNF-SEG-08 | ✅ Cumple | Antivirus antes de guardar |
| RNF-SEG-09 | ✅ Cumple | Validación en cliente y servidor, CSP |
| RNF-SEG-10 | ✅ Cumple | Adjuntos fuera de la BD, cifrados |
| RNF-SEG-11…19 | Compromiso del proveedor | Ambientes, revisión de accesos, hardening, pentest, vulnerabilidades, ISO, auditorías |
| RNF-PRI-01 | Compromiso del proveedor | Contrato de transmisión de datos |
| RNF-PRI-02 | ✅ Cumple | Inventario de datos personales (Integraciones) |
| RNF-PRI-03 | ✅ Cumple | Autorización con versión, fecha y hora |
| RNF-PRI-04 | Compromiso del proveedor | Declaración de región |
| RNF-PRI-05 | ✅ Cumple | Anonimización de invitaciones a 90 días |
| RNF-PRI-06 | 🟡 Parcial | Exportación total sí; borrado certificado contractual |
| RNF-PRI-07 | ✅ Cumple | IA opcional y desactivada |
| RNF-USA-01 | 🟡 Parcial | Etiquetas, foco, contraste y salto al contenido; auditoría WCAG 2.2 AA / NTC 5854 pendiente |
| RNF-USA-02 | ✅ Cumple | Responsive verificado en celular |
| RNF-USA-03/04 | ✅ Cumple | Navegadores modernos, sin plugins |
| RNF-USA-05 | ✅ Cumple | Español de Colombia y flujos guiados |
| RNF-USA-06 | 🟡 Parcial | Marca configurable; se ajusta al manual de UX/UI cuando Compensar lo entregue |
| RNF-REN-01/02 | 🟡 Parcial | Páginas < 2 s en pruebas; falta prueba de carga con 500 usuarios |
| RNF-REN-03…06 | Compromiso del proveedor | Capacidad y autoescalado en infraestructura |
| RNF-REN-07 | ✅ Cumple | Cargues > 50 filas en segundo plano con aviso |
| RNF-REN-08 | ✅ Cumple | Índices, paginación, vistas de lectura para BI |
| RNF-DIS-01…10 | Compromiso del proveedor | Disponibilidad, HA, DR, RPO/RTO, respaldos, mantenimientos, incidentes |
| RNF-OBS-01/03 | ✅ Cumple | Logs administrativos inalterables y consulta en consola |
| RNF-OBS-02 | ✅ Cumple | Errores estructurados con identificador de traza |
| RNF-OBS-04 | 🟡 Parcial | Logs y métricas exportables; trazas OpenTelemetry pendientes |
| RNF-OBS-05 | ✅ Cumple | Alertas por picos de fallos y errores |
| RNF-OBS-06 | Compromiso del proveedor | Monitoreo 7x24 |
| RNF-OBS-07 | ✅ Cumple | Página pública /estado en tiempo real + /api/health y /api/metrics |
| RNF-ARQ-01/02 | ✅ Cumple | Capas separadas, modular por dominios |
| RNF-ARQ-03…07, 09, 10 | Compromiso del proveedor | Nube, ambientes CI/CD, portabilidad, IPv6, Git, prerrequisitos, roadmap |
| RNF-ARQ-08 | ✅ Cumple | Manuales, modelo de datos, catálogos de roles e interfaces (docs/) |

