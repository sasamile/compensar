# Módulo de analítica, reportes, trazabilidad y centro documental

Cubre FUN-65, FUN-93, FUN-96 (aporte), FUN-97, FUN-98, FUN-99, FUN-100 y TEC-92 a TEC-97 (ERS 5.3 RF-SEG-01, 5.8 RF-ANA-01/04..08 y 8.2).

## 1. Manual de usuario por rol

| Rol | Qué puede hacer |
|---|---|
| **Administrador** | Todo: analítica de toda la organización, tableros (crear, compartir, editar los de otros), constructor de consultas sobre todas las fuentes (incluida auditoría), los 15 reportes, BI, trazabilidad, informes finales y centro documental. |
| **Gestor de Mentorías** (alcance programa) | Analítica y tableros de su programa, constructor de consultas, reportes R-01/02/03/05/06/10, trazabilidad e informe final de las empresas de su programa; escribe conclusiones y recomendaciones del informe final. |
| **Auxiliar administrativo** (programa) | Analítica de su programa, constructor de consultas (incluye validación), R-01/R-04, centro documental de su programa. |
| **Coordinador de aliado** | Analítica y tableros compartidos **solo de su aliado** (remisiones, sesiones, servicios, encuestas de su organización), R-09. |
| **Mentor** | Centro documental de sus empresas asignadas, R-05 (solo sus sesiones), informe final de sus empresas. Si Compensar le otorga `analytics.view`, verá la analítica solo de sus empresas. |
| **Aprobador de pagos / Auditor** | Analítica de la organización en lectura; el auditor además consulta la fuente «Auditoría» y R-11/R-12. |
| **Empresa (representante y colaboradores)** | «Mis documentos» (`/documentos`) y su **informe final** (`/informe-final/<id>`, descarga en PDF). |

### Analítica (`/analitica`)
1. Filtra por **programa, convocatoria/evento, mentor/asesor, aliado y periodo** (las listas solo muestran lo de tu alcance).
2. Verás: embudo de empresas (registradas → activas → con mentor → con servicio → cerradas), sesiones por estado y por mes, asistencia a eventos, servicios por aliado, impacto (línea base vs. resultado), diagnósticos por nivel, validación por estado, alertas abiertas, NPS y el histórico (instantáneas cada 15 min, solo alcance organización).
3. «Ver datos y exportar →» abre la consulta de cada gráfico en el constructor, desde donde se exporta.
4. La página se actualiza sola cada 60 s (botón Pausar). «Exportar a PDF» imprime el tablero.
5. Los comentarios abiertos de las encuestas se analizan (minería de texto) en **Encuestas de satisfacción**; aquí solo hay un enlace.

### Tableros configurables (`/analitica/tableros`)
1. «Crear tablero»: vacío o desde la plantilla **operativa** o **estratégica**.
2. En modo edición: elige la **fuente**, luego el **tipo** (KPI, barras, barras horizontales, dona, línea mensual, tabla), el cálculo (conteo, distintos, suma, promedio, mínimo, máximo), «agrupar por», hasta 2 filtros, columnas (tabla) y ancho.
3. Ordena con ↑/↓, cambia el ancho, renombra o quita widgets. Marca «Compartir» para que lo vean los demás usuarios de analítica (cada uno ve solo sus datos). «Copiar a mis tableros» duplica uno compartido.
4. Los datos se consultan en vivo al abrir y se refrescan cada 30 s.

### Constructor de consultas (`/analitica/consultas`)
1. Elige la fuente: empresas, sesiones, remisiones, inscripciones, eventos, servicios, indicadores, diagnósticos, validación, encuestas, alertas, cierres, rutas, documentos, notificaciones, auditoría o histórico (según permisos).
2. Marca columnas, agrega filtros (es igual, contiene, mayor que, vacío…), programa/evento/mentor/aliado/periodo, y opcionalmente **agrupa** con un cálculo.
3. «Ver vista previa» → «Guardar consulta» o exportar en **Excel, CSV, JSON o PDF**. Las guardadas quedan en la columna izquierda con sus botones de exportación. «Llevar a tablero» convierte la consulta en widget.

### Reportes (`/reportes`)
Catálogo R-01..R-15 con periodo, vista previa y descarga en Excel, CSV, JSON y PDF (vista imprimible con la marca). Nuevos: **R-06 Diagnósticos realizados** (tabla `diagnostics`), **R-10** enriquecido con la última medición de `indicator_values`, **R-13 Validación de requisitos**, **R-14 Seguimiento de empresas** (con semáforo) y **R-15 Satisfacción (encuestas)**.

### Trazabilidad (`/trazabilidad/<empresa>`)
Una sola línea de tiempo por empresa: vinculación (registro, consentimiento, usuarios), validación y solicitudes de información, diagnóstico, rutas y asignaciones, mentor, remisiones (aceptación con usuario/fecha/IP), sesiones (programación, realización, aceptación con usuario/fecha/IP), eventos y certificados, documentos OnBase, indicadores, mediciones y cierres, encuestas, alertas y tareas, y auditoría relacionada. Filtra por etapa, **caso** (remisión o caso de validación), texto y fechas; exporta en Excel/CSV/JSON/PDF. Índice en `/trazabilidad`.

### Informe final (`/informe-final/<empresa>`)
Informe con la marca: resumen, resultados y cierres, indicadores antes/después, diagnóstico inicial vs. final por dimensión, servicios, sesiones aceptadas, capacitaciones y certificados, recomendaciones (del equipo, del diagnóstico y automáticas por indicadores). «Descargar PDF» → Guardar como PDF. El equipo interno (cierres/seguimiento) registra conclusiones y recomendaciones. La empresa ve y descarga el suyo; índice para internos en `/informe-final`.

### Centro documental (`/documentos`)
Consulta los documentos de cada proceso (empresa, sesión, evento) con referencia y estado OnBase, quién lo subió y su aceptación (usuario, fecha, IP). Filtros por nombre, empresa, proceso, tipo, estado, aceptación, referencia y fechas. «Ver» muestra PDF e imágenes **dentro de la plataforma**; Office se descarga. Exportación del listado en 4 formatos. Cada consulta/descarga queda auditada.

## 2. Conexión con Power BI (TEC-94, RF-ANA-05)

Fuente: vistas de solo lectura `bi_*` (en `src/lib/schemas/analitica.ts`) expuestas por `GET /api/bi/<conjunto>?format=csv|json`.

1. Pida a un usuario con permiso `api.manage` (Integraciones y API) un **token** en la tabla `api_tokens` con `scopes` que incluya `bi.read` y `expires_at` futuro. Puede acotarlo con `bi.program:<id>` o `bi.aliado:<id>`. (El token puede guardarse en claro o como SHA-256 hex.)
2. Power BI Desktop → Obtener datos → **Web** → Avanzado:
   - URL: `https://<servidor>/api/bi/empresas?format=csv`
   - Encabezado HTTP: `Authorization` = `Bearer <token>`
   - Autenticación: Anónimo.
3. Repita para `sesiones`, `remisiones`, `inscripciones`, `eventos`, `servicios`, `indicadores`, `diagnosticos`, `validacion`, `encuestas`, `alertas`, `cierres`, `rutas`, `documentos`, `notificaciones`, `historico`. Relacione por `company_id`, `program_id`, `aliado_id`, `mentor_id`, `event_id`, `servicio_id`, `referral_id`.
4. Consulta M equivalente (parámetro `TokenBI`):
   ```
   let Origen = Web.Contents("https://<servidor>/api/bi/empresas", [Query=[format="csv"], Headers=[Authorization="Bearer " & TokenBI]]),
       Tabla = Table.PromoteHeaders(Csv.Document(Origen, [Delimiter=",", Encoding=65001]), [PromoteAllScalars=true])
   in Tabla
   ```
   JSON: `Table.FromRecords(Json.Document(Web.Contents(...))[value])`.
5. Parámetros: `limit` (≤ 200 000, por defecto 50 000), `offset`, `programa`, `aliado`, `mentor`, `evento`, `desde`, `hasta`. Catálogo: `GET /api/bi`. Guía en pantalla: `/analitica/bi`.
6. Programe la actualización en el servicio de Power BI (p. ej. cada 15 min). Sin token, la misma URL funciona con la sesión del usuario (`analytics.view`) aplicando su alcance. La auditoría (`bi_auditoria`) no se publica por token. Cada lectura queda en auditoría (`bi_lectura`).

## 3. Trazabilidad requisito → pantalla / archivo

| Requisito | Estado | Pantalla / API | Archivos |
|---|---|---|---|
| FUN-65 / RF-SEG-01 centro documental | Cumple | `/documentos`, `/api/analitica/doc/[id]` (inline/descarga) | `src/app/(app)/documentos/page.tsx`, `src/app/api/analitica/doc/[id]/route.ts`, conjunto `documentos` en `src/lib/datasets.ts` |
| FUN-93 / RF-ANA-01 informe final | Cumple | `/informe-final`, `/informe-final/[companyId]` | `src/app/(app)/informe-final/**`, `finalReport()` en `src/lib/analytics.ts`, tabla `ana_report_notes` |
| FUN-96 / RF-ANA-04 reportes de validación y seguimiento (aporte) | Cumple (desde reportes) | `/reportes` R-13, R-14; fuentes `validacion` y `empresas` en consultas | `src/lib/reports.ts`, `REPORTS` en `src/lib/perms.ts` |
| FUN-97 / RF-ANA-05 tableros configurables o Power BI | Cumple | `/analitica/tableros`, `/analitica/tableros/[id]`, `/analitica/bi`, `/api/bi` | `src/app/(app)/analitica/tableros/**`, `src/app/api/bi/**`, `src/lib/schemas/analitica.ts` |
| FUN-98 / RF-ANA-06 consulta por programa, convocatoria, asesor, aliado, periodo | Cumple | Barra de filtros en `/analitica`, tableros y consultas | `src/components/ana-filters.tsx`, `globalCond()` en `src/lib/datasets.ts` |
| FUN-99 / RF-ANA-07 trazabilidad de punta a punta | Cumple | `/trazabilidad`, `/trazabilidad/[companyId]`, `/api/analitica/trazabilidad/[id]` | `companyTrace()` en `src/lib/analytics.ts` |
| FUN-100 / RF-ANA-08 exportar Excel, CSV, JSON, PDF | Cumple en este módulo; botón reutilizable para el resto | `/api/reportes/[id]?fmt=`, `/api/analitica/consulta?format=` | `exportResponse()` en `src/lib/analytics.ts`, `src/components/ana-export.tsx` |
| TEC-92 BI nativo / analítica avanzada | Cumple (minería de texto enlazada a `/encuestas`) | `/analitica`, histórico | `src/lib/analytics.ts`, `src/lib/jobs/analitica.ts` |
| TEC-93 reportes self-service | Cumple | `/analitica/consultas` (guardar `saved_reports`) | `src/app/(app)/analitica/consultas/**` |
| TEC-94 conexión BI externo | Cumple (vistas `bi_*` + token `bi.read`) | `/api/bi`, `/api/bi/[dataset]` | `src/lib/schemas/analitica.ts`, `src/app/api/bi/**` |
| TEC-95 seguridad a nivel de fila | Cumple (por alcance del rol en SQL) | Todas las consultas, tableros, reportes, BI | `isOrgWide/visibleCompanies/visibleSessions/aliadoLock` en `src/lib/datasets.ts` |
| TEC-96 tableros estratégicos y operativos | Cumple (plantillas + tablero de ejemplo) | `/analitica/tableros` | `DASHBOARD_PRESETS` en `src/lib/analytics.ts`, `src/lib/seeds/analitica.ts` |
| TEC-97 tiempo real / latencia | Cumple: consulta directa (≈0 s) + refresco 30–60 s; instantáneas cada 15 min | `/analitica`, tableros | `src/components/ana-autorefresh.tsx`, job `analitica.instantaneas` |

### Seguridad a nivel de fila (resumen técnico)
- Alcance organización (`scope_type='org'` con `analytics.view` o `companies.view`): sin restricción.
- Programa: filas de sus programas (`program_id`) + empresas de `companyFilter`.
- Aliado (coordinador o mentor de aliado sin alcance org/programa): empresas con remisiones a su aliado y, en remisiones/indicadores/encuestas/cierres/servicios, solo filas de su `aliado_id`; sesiones por `sessionFilter` (remisiones de su aliado).
- Asignado (mentor/evaluador): solo sus empresas y sus sesiones.
- Empresa: solo su empresa.
- Los nombres de columnas/agrupaciones se validan contra una lista blanca; los valores siempre van como parámetros.
