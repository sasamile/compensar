# Guion de demostración — Plataforma de Fomento Empresarial (75 min)

Sigue los 6 casos de uso críticos del ERS (sección 9). Cada caso indica **quién ingresa**, **qué hacer** y **qué debe verse**.

## Antes de empezar (5 min)

1. Arranca limpio: detén el servidor, borra `data/` y `storage/`, y ejecuta `npm run dev` → http://localhost:3100.
2. Usa **dos perfiles del navegador** (o una ventana normal y una de incógnito) para alternar rápido entre una persona de Compensar y una empresa. Si usas una sola ventana, cierra sesión entre roles.
3. Si haces muchos cambios de rol desde el mismo equipo, el límite anti-bots solo cuenta los intentos fallidos, así que no te bloqueará por ingresar bien.
4. Clave de todos los usuarios internos: `Demo2026!`. Los roles internos y de aliados confirman con verificación en dos pasos: la primera vez configuran la app autenticadora (QR) y en modo demo el código vigente aparece en pantalla. También puedes entrar con «Ingresar con cuenta corporativa (SSO)», que abre el IdP de prueba.
5. Archivos de apoyo en `demo/`: `carga-con-error.xlsx`, `carga-correcta.xlsx`, `asistencia-teams.csv`, `hoja-de-ruta.pdf`, `archivo-infectado.pdf`.

Datos que ya existen al arrancar: programas *Emprendimiento* y *Territorio MIPYME*, 3 empresas activas (La Espiga, Textiles del Norte, Tecnosoft) y 2 pendientes (Ferretería El Tornillo, Café Origen), el evento publicado «Taller de finanzas para mipymes», 2 aliados (Fundación Crecer, Consultores Andinos) con 4 servicios, y mentor1 asignado a La Espiga con una sesión programada.

| Persona | Correo |
|---|---|
| Administrador | `admin@compensar.test` |
| Auxiliar Administrativo | `aux@compensar.test` |
| Gestor de Contenidos | `contenidos@compensar.test` |
| Gestor de Cursos | `cursos@compensar.test` |
| Gestor de Mentorías | `gestor@compensar.test` |
| Mentor (asignado a La Espiga) / Mentor sin asignación | `mentor1@…` / `mentor2@compensar.test` |
| Coordinador aliado / Mentor aliado | `coord@crecer.test` / `mentor@crecer.test` |
| Aprobador de pagos | `pagos@compensar.test` |
| Auditor | `auditor@compensar.test` |
| Empresas (ingreso por **código al correo**) | `empresa1@laespiga.test`, `empresa2@textiles.test`, `empresa3@tecnosoft.test` |

Ingreso de empresa: pestaña «Empresas (código al correo)» → escribe el correo → el código aparece en un recuadro amarillo (modo demo; en producción solo llega por correo).

---

## CU-01 · Configurar el programa sin código (10 min)
**Actor:** Administrador.

1. **Configuración → Programas y rutas:** muestra Territorio MIPYME con sus requisitos; crea un eje, una línea y una ruta nuevos; inactiva uno (no se pierde historial).
2. **Catálogo de servicios:** crea un servicio con aliado, horas, sesiones, indicadores y costo interno.
3. **Marca y canales:** cambia el color y el nombre → toda la interfaz cambia. Apaga y enciende un canal.
4. **Plantillas de mensajes:** edita una → queda «pendiente» → apruébala. (La plantilla de *remisión* por WhatsApp viene pendiente: no se enviará hasta aprobarla.)
5. **Roles y permisos:** «Crear a partir de otro» → nuevo rol «Evaluador senior» copiando *Evaluador*; marca/desmarca permisos.
6. **Usuarios:** invita a un mentor (aparece la contraseña temporal solo en modo demo); revoca la invitación.
7. **Auditoría:** cada cambio anterior aparece con usuario, antes/después e IP.

**Debe verse:** nada requirió al proveedor y todo quedó auditado.

## CU-02 · Publicar un evento y llenar el cupo (15 min)
**Actores:** Gestor de Contenidos / Gestor de Cursos y empresas.

1. `contenidos@` → **Eventos** → crear «Taller de ventas» (programa Territorio MIPYME, híbrido, **cupo 2**, enlace a formulario externo) → **Publicar**. Abre la landing (con QR y enlace corto). Intenta crear en otro programa: no aparece (solo tiene el suyo).
2. Empresas: `empresa1@`, `empresa2@`, `empresa3@` abren la landing (o **Oferta y eventos**), marcan la autorización de datos y se inscriben. La 3.ª recibe «cupo lleno» y puede entrar a **lista de espera**. Una segunda inscripción de la misma empresa se rechaza.
3. `cursos@` → el evento → **Enviar recordatorios** (ver estado en Notificaciones: correo, SMS y WhatsApp entregados).
4. Asistencia: registrar por **código** (el que ve la empresa en su landing) y cargar `demo/asistencia-teams.csv` (45 min cumple, 10 min no cumple el mínimo de 30).
5. **Emitir certificados** → abre el certificado y valida su código en `/verificar/<código>`; prueba un código falso.
6. **Exportar Excel/CSV:** `cursos@` exporta *sin* datos personales (no tiene el permiso); `aux@` sí los ve.
7. Subir evidencia: `hoja-de-ruta.pdf` sí; `archivo-infectado.pdf` es rechazado por el antivirus.

**Debe verse:** cupo respetado, recordatorios con estado, certificado verificable.

## CU-03 · Activar empresas en lote (10 min)
**Actor:** Auxiliar Administrativo.

1. `aux@` → **Empresas → Cargue masivo**. Descarga la plantilla para mostrarla.
2. Sube `demo/carga-con-error.xlsx` → **«No se guardó nada»**, Fila 4: DV inválido y cuál es el correcto.
3. Sube `demo/carga-correcta.xlsx` (con «Activar al cargar») → 6 empresas creadas, cada representante con su invitación.
4. Sube el mismo archivo otra vez → «Este NIT ya está en este programa».
5. Una representante entra con su correo y la clave temporal (se muestra en pantalla en modo demo) → **debe cambiar la clave** → paso de **primer ingreso** (autorización + perfil) hasta que lo completa.
6. Opcional: en **Empresas** activa/suspende a Ferretería El Tornillo (la empresa pendiente ve «pendiente de activación» y no puede inscribirse).

## CU-04 · Acompañar con mentorías y aceptación (15 min)
**Actores:** Gestor de Mentorías, Mentor, Empresa.

1. `gestor@` → **Empresas** → selecciona Textiles del Norte → «Asignar mentor» (mentor1). Reasigna a otro para mostrar que se conserva el historial. En la ficha de la empresa asigna una **ruta** y un **servicio**.
2. `mentor1@` → **Agenda** → programa una sesión (`.ics` para el calendario). Abre la sesión de La Espiga ya programada, **reprograma** con motivo, y luego **registra el seguimiento** (temas, compromisos, horas). Sube `hoja-de-ruta.pdf`.
3. `empresa1@` → **Agenda** → abre la sesión → **Aceptar sesión** y **Aceptar** el documento: queda usuario, fecha, hora e **IP**.
4. **Aislamiento:** `mentor2@` abre **Empresas** (lista vacía) y pega el enlace `/empresas/1` → «Sin acceso».
5. En la ficha de La Espiga muestra la **línea de tiempo** y «Línea de tiempo → PDF».

## CU-05 · Remitir a un aliado y soportar el pago (15 min)
**Actores:** Gestor de Mentorías, Empresa, Coordinador y Mentor del aliado, Aprobador de pagos.

1. `gestor@` → **Remisiones** → remite La Espiga al servicio «Mentoría en estrategia comercial» (Fundación Crecer).
2. `empresa1@` → **Remisiones** → **Aceptar**.
3. `coord@crecer.test` → **Remisiones** → asigna a «Manuel Mentor Aliado». (Solo ve sus mentores y su aliado.)
4. `mentor@crecer.test` → **Agenda** → programa **3 sesiones** de ese servicio (elige el servicio remitido; usa fechas **de este mes**) y registra el seguimiento y las horas de cada una.
5. `empresa1@` acepta **solo 2 de las 3** sesiones.
6. `pagos@` → **Soporte de pagos** → Fundación Crecer, mes actual: la sesión sin aceptar aparece resaltada y **no cuenta**. Descarga el Excel (R-09) y compáralo con la pantalla. **Aprueba** el reporte.
7. **Separación de funciones (verificada en el ensayo):** como admin, en Usuarios → «Agregar rol adicional» dale a `mentor@crecer.test` el rol *Aprobador de pagos* (alcance organización); al intentar aprobar un reporte con horas que él registró debe rechazarlo.

## CU-06 · Cerrar y reportar (10 min)
**Actores:** Gestor de Mentorías, Auditor.

1. `mentor1@` → ficha de La Espiga → agrega un indicador (línea base 10, meta 15, resultado 14).
2. `gestor@` → **Resultados y cierres** → consolidar La Espiga (con el servicio remitido) → **Aprobar cierre**. El mentor del aliado ya no puede programar más sesiones de ese servicio.
3. **Reportes** → descarga R-01 a R-10 del mes (Excel); muestra vista previa y cronometra: cada uno sale en segundos. El Gestor ve solo los suyos.
4. `auditor@` → **Auditoría**: filtra por usuario/acción y sigue todos los pasos de los casos anteriores. Intenta editar: no hay botón; en base de datos los triggers lo impiden.

---

## Módulos ampliados (Deseables y Futuros) — 20 min adicionales

1. **Formularios sin código** — `contenidos@` → Formularios → abre «Inscripción Territorio MIPYME»: agrega una pregunta condicional, mira la vista previa y publica (nace la versión 2). `empresa1@` lo diligencia: NIT con DV inválido se marca al instante, el borrador se guarda solo, y al enviar se crea el caso en Validación.
2. **Validación de requisitos** — `aux@` o `gestor@` → Validación: la Ferretería sale «No cumple» (4 meses de afiliación) con el motivo de Gestión de Clientes; pide información con plazo, aprueba otra y la empresa queda activa con aviso por los 3 canales. Muestra la validación masiva por Excel y el tablero.
3. **Diagnóstico** — `gestor@` → Diagnósticos → La Espiga: radar por dimensión, nivel y recomendaciones; «Comparación» inicial 26,7 → final 68,4. `empresa2@` hace su diagnóstico asignado y ve el resultado al enviar.
4. **Rutas** — `mentor1@` → Rutas: ruta activa de La Espiga con avance; completar una etapa exige evidencia. Una ruta recomendada desde el diagnóstico queda «propuesta» hasta que el mentor la aprueba. `empresa1@` → «Mi ruta» en el celular.
5. **Seguimiento** — `gestor@` → Seguimiento y alertas → «Ejecutar alertas ahora»: semáforo por empresa, tareas vencidas, sesiones sin seguimiento. Mensajes entre mentor y empresa con aviso y lectura. Indicadores con su evolución mensual.
6. **Encuestas** — al aprobar un cierre se envía la encuesta; respóndela desde el enlace (sin login) y mira NPS y temas más mencionados en Encuestas.
7. **Analítica** — `admin@` → Analítica: filtros por programa, mentor, aliado y periodo; arma un tablero propio; Consultas self-service exportables en Excel/CSV/JSON/PDF; conexión Power BI. `coord@crecer.test` ve solo su aliado.
8. **Informe final y trazabilidad** — desde la ficha de La Espiga: «Trazabilidad completa» y «Informe final» en PDF con marca.
9. **Integraciones** — `admin@` → Integraciones y API: clientes API (OAuth), `/api-docs`, webhooks firmados (para probarlos usa como destino `/api/webhooks/demo?id=<id del webhook>`), colas de reintento (simula OnBase caído), procesos por lotes, exportación total y datos personales.

## Qué decir con honestidad en la demo
- **Integraciones en modo simulado hasta tener credenciales de Compensar:** el SSO funciona de punta a punta contra un IdP de prueba (OIDC, listo para Entra ID); OnBase guarda cifrado en un almacén local con referencia `ONB-*`; Microsoft 365 entrega la invitación `.ics`; correo/SMS/WhatsApp simulan la entrega; Gestión de Clientes usa una réplica local. Todo está detrás de adaptadores.
- La IP de aceptación en local aparece como `::1`; en un despliegue real será la IP del cliente.
- Despliegue dedicado (single-tenant) para Compensar: el aislamiento es por instancia.
- Pendientes declarados en la matriz: contrastar el cálculo del diagnóstico con la hoja de referencia de Compensar (FUN-61), llaves de acceso (passkeys), trazas OpenTelemetry, prueba de carga con 500 usuarios y auditoría WCAG formal.

## Reiniciar entre ensayos
```bash
# detén el servidor y luego:
rm -rf data storage/* && npm run dev
```
