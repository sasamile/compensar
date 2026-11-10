# Catálogo de roles y políticas de acceso

Generado desde la configuración de la plataforma. Los nombres y permisos se pueden cambiar sin desarrollo en Configuración → Roles y permisos. Cada asignación de rol lleva un alcance: organización, programa, aliado, registros asignados o su empresa (RN-02); una persona puede tener varios roles (RN-04).

## Administrador (`admin`)

Configura y opera toda la organización

- Todos los permisos de la plataforma.

## Auxiliar Administrativo (`aux_admin`)

Inscritos, asistencia, certificados y activación de empresas

- Gestionar asistencia y certificados (`attendance.manage`)
- Ver inscritos (`registrations.view`)
- Exportar datos personales de inscritos (`registrations.export_pii`)
- Ver empresas (según alcance) (`companies.view`)
- Activar empresas (individual y masivo) (`companies.activate`)
- Descargar reporte R-01 (`report:R-01`)
- Descargar reporte R-04 (`report:R-04`)
- Ver directorio de perfiles (`directory.view`)
- Ver y exportar respuestas de formularios (`forms.responses`)
- Validar requisitos y decidir inscripciones (`validation.manage`)
- Consultar la validación (lectura) (`validation.view`)
- Centro documental (`documents.view`)
- Consultar biblioteca de contenidos (`library.view`)
- Analítica y tableros (`analytics.view`)
- Descargar reporte R-13 (`report:R-13`)

## Evaluador (`evaluador`)

Evalúa empresas asignadas

- Ver empresas (según alcance) (`companies.view`)
- Evaluar empresas asignadas (`companies.evaluate`)
- Ver directorio de perfiles (`directory.view`)
- Validar requisitos y decidir inscripciones (`validation.manage`)
- Consultar la validación (lectura) (`validation.view`)
- Ver resultados de diagnósticos (`diagnostics.view`)
- Centro documental (`documents.view`)
- Descargar reporte R-13 (`report:R-13`)

## Gestor de Contenidos (`gestor_contenidos`)

Crea y publica eventos y landings

- Crear y publicar eventos y landings (`events.manage`)
- Ver inscritos (`registrations.view`)
- Descargar reporte R-04 (`report:R-04`)
- Ver directorio de perfiles (`directory.view`)
- Crear y publicar formularios (`forms.manage`)
- Ver y exportar respuestas de formularios (`forms.responses`)
- Administrar biblioteca de contenidos (`library.manage`)
- Consultar biblioteca de contenidos (`library.view`)
- Ver resultados de encuestas (`surveys.view`)
- Descargar reporte R-15 (`report:R-15`)

## Gestor de Cursos (`gestor_cursos`)

Cursos, inscripciones y asistencia

- Crear y publicar eventos y landings (`events.manage`)
- Gestionar asistencia y certificados (`attendance.manage`)
- Ver inscritos (`registrations.view`)
- Descargar reporte R-04 (`report:R-04`)
- Ver directorio de perfiles (`directory.view`)
- Ver y exportar respuestas de formularios (`forms.responses`)
- Consultar biblioteca de contenidos (`library.view`)
- Ver resultados de encuestas (`surveys.view`)

## Gestor de Mentorías (`gestor_mentorias`)

Asigna mentores, aprueba cierres

- Gestionar mentores (`users.manage.mentors`)
- Ver empresas (según alcance) (`companies.view`)
- Activar empresas (individual y masivo) (`companies.activate`)
- Asignar mentores (`mentors.assign`)
- Asignar rutas, cursos y servicios (`items.assign`)
- Ver sesiones (`sessions.view`)
- Agendar, reprogramar y cancelar sesiones (`sessions.schedule`)
- Remitir empresas a aliados (`referrals.create`)
- Asignar remisiones a mentores (`referrals.assign`)
- Consolidar resultados (`closure.manage`)
- Aprobar cierres (`closure.approve`)
- Exportar datos personales de inscritos (`registrations.export_pii`)
- Ver directorio de perfiles (`directory.view`)
- Descargar reporte R-01 (`report:R-01`)
- Descargar reporte R-02 (`report:R-02`)
- Descargar reporte R-03 (`report:R-03`)
- Descargar reporte R-05 (`report:R-05`)
- Descargar reporte R-06 (`report:R-06`)
- Descargar reporte R-10 (`report:R-10`)
- Asignar y gestionar diagnósticos (`diagnostics.manage`)
- Ver resultados de diagnósticos (`diagnostics.view`)
- Configurar rutas de acompañamiento (`routes.manage`)
- Aprobar rutas recomendadas (`routes.approve`)
- Consultar ruta propia (`routes.view`)
- Definir indicadores de gestión e impacto (`indicators.manage`)
- Actualizar valores de indicadores (`indicators.update`)
- Ver resultados de encuestas (`surveys.view`)
- Ver alertas y semáforo (`alerts.view`)
- Configurar reglas de alerta (`alerts.manage`)
- Registrar tareas y actividades (`tasks.manage`)
- Mensajería mentor-empresa (`messages.use`)
- Analítica y tableros (`analytics.view`)
- Crear tableros configurables (`dashboards.manage`)
- Centro documental (`documents.view`)
- Validar requisitos y decidir inscripciones (`validation.manage`)
- Consultar la validación (lectura) (`validation.view`)
- Consultar biblioteca de contenidos (`library.view`)
- Administrar biblioteca de contenidos (`library.manage`)
- Ver y exportar respuestas de formularios (`forms.responses`)
- Descargar reporte R-13 (`report:R-13`)
- Descargar reporte R-14 (`report:R-14`)
- Descargar reporte R-15 (`report:R-15`)

## Mentor (`mentor`)

Acompaña empresas asignadas, agenda y registra seguimiento

- Ver empresas (según alcance) (`companies.view`)
- Ver sesiones (`sessions.view`)
- Agendar, reprogramar y cancelar sesiones (`sessions.schedule`)
- Registrar seguimiento y evidencias (`sessions.followup`)
- Registrar horas de servicios (`hours.register`)
- Remitir empresas a aliados (`referrals.create`)
- Adjuntar documentos (`docs.upload`)
- Ver directorio de perfiles (`directory.view`)
- Descargar reporte R-05 (`report:R-05`)
- Asignar y gestionar diagnósticos (`diagnostics.manage`)
- Ver resultados de diagnósticos (`diagnostics.view`)
- Configurar rutas de acompañamiento (`routes.manage`)
- Aprobar rutas recomendadas (`routes.approve`)
- Consultar ruta propia (`routes.view`)
- Actualizar valores de indicadores (`indicators.update`)
- Ver alertas y semáforo (`alerts.view`)
- Registrar tareas y actividades (`tasks.manage`)
- Mensajería mentor-empresa (`messages.use`)
- Consultar biblioteca de contenidos (`library.view`)
- Centro documental (`documents.view`)
- Analítica y tableros (`analytics.view`)

## Coordinador de aliado (`coord_aliado`)

Reparte remisiones entre los mentores de su organización

- Gestionar mentores de su aliado (`users.manage.aliado`)
- Asignar remisiones a mentores (`referrals.assign`)
- Ver empresas (según alcance) (`companies.view`)
- Ver sesiones (`sessions.view`)
- Ver directorio de perfiles (`directory.view`)
- Descargar reporte R-09 (`report:R-09`)
- Ver resultados de encuestas (`surveys.view`)
- Ver alertas y semáforo (`alerts.view`)
- Consultar biblioteca de contenidos (`library.view`)
- Analítica y tableros (`analytics.view`)
- Registrar tareas y actividades (`tasks.manage`)
- Descargar reporte R-15 (`report:R-15`)

## Aprobador de pagos (`aprobador_pagos`)

Aprueba el reporte de servicios por aliado

- Ver soporte de pagos (`payments.view`)
- Aprobar reporte de servicios por aliado (`payments.approve`)
- Descargar reporte R-03 (`report:R-03`)
- Descargar reporte R-07 (`report:R-07`)
- Descargar reporte R-08 (`report:R-08`)
- Descargar reporte R-09 (`report:R-09`)
- Analítica y tableros (`analytics.view`)
- Centro documental (`documents.view`)

## Auditor (`auditor`)

Consulta la auditoría en solo lectura

- Consultar auditoría (`audit.view`)
- Ver empresas (según alcance) (`companies.view`)
- Ver sesiones (`sessions.view`)
- Descargar reporte R-12 (`report:R-12`)
- Descargar reporte R-11 (`report:R-11`)
- Centro documental (`documents.view`)
- Analítica y tableros (`analytics.view`)
- Ver resultados de encuestas (`surveys.view`)
- Ver alertas y semáforo (`alerts.view`)
- Consultar la validación (lectura) (`validation.view`)
- Ver resultados de diagnósticos (`diagnostics.view`)
- Descargar reporte R-01 (`report:R-01`)
- Descargar reporte R-02 (`report:R-02`)
- Descargar reporte R-03 (`report:R-03`)
- Descargar reporte R-04 (`report:R-04`)
- Descargar reporte R-05 (`report:R-05`)
- Descargar reporte R-06 (`report:R-06`)
- Descargar reporte R-07 (`report:R-07`)
- Descargar reporte R-08 (`report:R-08`)
- Descargar reporte R-09 (`report:R-09`)
- Descargar reporte R-10 (`report:R-10`)
- Descargar reporte R-13 (`report:R-13`)
- Descargar reporte R-14 (`report:R-14`)
- Descargar reporte R-15 (`report:R-15`)

## Vinculado / Empresa (`empresa`)

Representante de la empresa

- Gestionar colaboradores de la empresa (`company.manage_collab`)
- company.manage_profile (`company.manage_profile`)
- Ver empresas (según alcance) (`companies.view`)
- Ver sesiones (`sessions.view`)
- Aceptar sesiones y documentos (`sessions.accept`)
- Adjuntar documentos (`docs.upload`)
- Ver directorio de perfiles (`directory.view`)
- Inscribirse a eventos (`events.register`)
- Realizar autodiagnóstico (`diagnostics.self`)
- Consultar ruta propia (`routes.view`)
- Mensajería mentor-empresa (`messages.use`)
- Consultar biblioteca de contenidos (`library.view`)
- Diligenciar formularios (`forms.fill`)
- Actualizar valores de indicadores (`indicators.update`)

## Colaborador empresa (`colaborador`)

Accede a mentorías y capacitaciones de su empresa

- Ver empresas (según alcance) (`companies.view`)
- Ver sesiones (`sessions.view`)
- Aceptar sesiones y documentos (`sessions.accept`)
- Adjuntar documentos (`docs.upload`)
- Ver directorio de perfiles (`directory.view`)
- Inscribirse a eventos (`events.register`)
- Realizar autodiagnóstico (`diagnostics.self`)
- Consultar ruta propia (`routes.view`)
- Mensajería mentor-empresa (`messages.use`)
- Consultar biblioteca de contenidos (`library.view`)
- Diligenciar formularios (`forms.fill`)
- Actualizar valores de indicadores (`indicators.update`)

## Reglas de acceso

- RN-01 Aislamiento: despliegue dedicado por organización.
- RN-02 Alcance: un mentor solo ve sus empresas, un aliado lo suyo, una empresa lo suyo; un enlace directo ajeno responde «Sin acceso».
- RN-03 Delegación: el Administrador asigna cualquier rol; el Gestor de Mentorías, mentores; el Coordinador de aliado, sus mentores; la empresa, sus colaboradores; nadie se asigna roles a sí mismo.
- RN-05 Separación de funciones: quien registra horas no aprueba su cierre ni su pago; quien aprueba el cierre no aprueba el pago del mismo servicio; el cierre de rutas lo aprueba otra persona.
- RN-07/RN-08 Funcionarios por SSO; roles internos y de aliados con segundo factor; empresas con código al correo.
- RN-09 Cierre de sesión por inactividad configurable.
- RN-10 Toda asignación, revocación, activación y desactivación queda auditada con valor anterior y nuevo.
