# Manual de uso — Plataforma de Fomento Empresarial (Compensar)

Versión para funcionarios de Compensar, aliados, empresas y el comité que evalúa el cumplimiento del ERS (Anexo 07).

**Cómo leer este manual**

- Cada capítulo es un **proceso** del programa. Al inicio dice **quién lo hace** y con qué usuario de demostración se prueba.
- Los pasos están numerados. Cada paso dice **dónde** (menú › pantalla › pestaña), **qué hacer** (botón o campo en **negrita**, con el nombre exacto de la pantalla) y **qué debe verse**.
- Al final de cada paso o grupo de pasos hay una línea **Cumple:** con los requisitos que ese paso demuestra (FUN del Anexo 07, RF/RN/RNF del ERS, TEC).
- El Anexo A (Índice de requisitos) lleva de cada requisito al paso donde se demuestra.
- Las rutas del menú se escriben así: **Sección del menú › Opción**. Ejemplo: **Administración › Configuración › pestaña Programas y rutas**.

> **Nota:** Las integraciones con sistemas de Compensar (IAM/SSO corporativo, OnBase, Gestión de Clientes, Microsoft 365/Outlook, correo, SMS y WhatsApp) están construidas detrás de adaptadores y funcionan en **modo simulado** hasta recibir las credenciales y ambientes de prueba de Compensar. En modo demostración la plataforma muestra en pantalla los códigos de verificación y las claves temporales; en producción (`DEMO_MODE=0`) solo llegan por correo.

---

## 1. Introducción

### 1.1 Qué es

La Plataforma de Fomento Empresarial es una aplicación web para operar de punta a punta el programa: convocatorias y eventos, registro y activación de empresas, validación de requisitos, diagnóstico, rutas y mentorías, servicios con aliados, cierres, soporte de pagos, seguimiento, reportes, analítica y auditoría.

Funciona en cualquier navegador moderno, en computador y en celular, sin instalar nada.

Cumple: RNF-USA-02, RNF-USA-03/04, RNF-USA-05, TEC-11, TEC-16.

### 1.2 Quién la usa

- **Funcionarios de Compensar** (Administrador, Auxiliar Administrativo, Evaluador, gestores, mentores, Aprobador de pagos, Auditor).
- **Aliados** (Coordinador de aliado y sus mentores).
- **Empresas** (representante y colaboradores).

### 1.3 Roles y alcance

Cada persona ve **solo** lo que su rol y su alcance le permiten. El alcance puede ser: toda la organización, un programa, un aliado, los registros asignados o su propia empresa. Una persona puede tener varios roles; los permisos se suman. Los nombres y permisos de los roles se cambian sin desarrollo (capítulo 2, sección «Roles y permisos»).

| # | Rol | Qué hace | Alcance | Usuario demo |
|---|---|---|---|---|
| 1 | Administrador | Configura y opera todo: programas, catálogo, marca, plantillas, roles, usuarios, integraciones | Toda la organización | `admin@compensar.test` |
| 2 | Auxiliar Administrativo | Inscritos, asistencia, certificados, activación y validación de empresas, cargue masivo | Programa | `aux@compensar.test` |
| 3 | Evaluador | Evalúa empresas asignadas y valida requisitos | Registros asignados | `evaluador@compensar.test` |
| 4 | Gestor de Contenidos | Crea y publica eventos, landings, formularios y biblioteca | Programa | `contenidos@compensar.test` |
| 5 | Gestor de Cursos | Cursos, inscripciones, asistencia y certificados | Programa | `cursos@compensar.test` |
| 6 | Gestor de Mentorías | Asigna mentores, rutas y servicios; remite a aliados; consolida y aprueba cierres; indicadores y alertas | Programa | `gestor@compensar.test` |
| 7 | Mentor | Acompaña sus empresas: agenda, seguimiento, documentos, diagnóstico, rutas, indicadores | Empresas asignadas | `mentor1@compensar.test` (asignado a La Espiga), `mentor2@compensar.test` (sin asignaciones) |
| 8 | Coordinador de aliado | Reparte las remisiones de su aliado entre sus mentores | Su aliado | `coord@crecer.test` |
| 9 | Aprobador de pagos | Revisa y aprueba el reporte de servicios por aliado (soporte de pago) | Toda la organización | `pagos@compensar.test` |
| 10 | Auditor | Consulta la auditoría y los reportes en solo lectura | Toda la organización | `auditor@compensar.test` |
| 11 | Vinculado / Empresa | Representante: perfil, colaboradores, inscripciones, autodiagnóstico, agenda, aceptaciones | Su empresa | `empresa1@laespiga.test`, `empresa2@textiles.test`, `empresa3@tecnosoft.test` |
| 12 | Colaborador empresa | Accede a mentorías y capacitaciones de su empresa | Su empresa | (lo invita el representante) |

El mentor de un aliado usa el rol Mentor con alcance de su aliado (usuario demo `mentor@crecer.test`). El detalle de permisos de cada rol está en `docs/CATALOGO-ROLES.md`.

Cumple: FUN-07, RF-ACC-07, RN-02, RN-04, TEC-8/9, TEC-101.

### 1.4 Cómo ingresar

Abra la dirección de la plataforma. Verá la pantalla de ingreso con dos pestañas: **Funcionarios y aliados** y **Empresas**.

**Funcionarios de Compensar**

1. En la pestaña **Funcionarios y aliados**, haga clic en **Ingresar con cuenta corporativa (SSO)**.
2. Se abre la pantalla de ingreso corporativo (en la demostración es el IdP de prueba «IAM corporativo · simulado»: elija el funcionario y pulse **Autorizar e ingresar**).
3. Debe verse: entra a la plataforma sin crear contraseña. Sus roles salen de los grupos del IAM. Si su cuenta está desactivada en el IAM o ya no está en un grupo autorizado, no entra.
4. Alternativa: escriba **Correo** y **Contraseña** y pulse **Ingresar**. Luego viene la **verificación en dos pasos** (ver abajo).

Cumple: FUN-03, RF-ACC-02, RN-07, RNF-SEG-01/02, TEC-1, TEC-2, TEC-3 (Parcial: SAML vía Entra ID o broker), TEC-4.

**Verificación en dos pasos (funcionarios y aliados)**

1. Después de la clave, la plataforma pide un código de la aplicación autenticadora (Microsoft Authenticator, Google Authenticator u otra).
2. La primera vez: escanee el código QR que aparece (o escriba la clave manual) y pulse **Activar y entrar**. Las veces siguientes: escriba el código y pulse **Verificar e ingresar**.
3. Si perdió el celular, use **Usar un código de recuperación**.
4. Debe verse, la primera vez: la pantalla «Verificación en dos pasos activada» con sus códigos de recuperación. Guárdelos; no se vuelven a mostrar.

> **Nota:** En modo demostración el código vigente aparece en un recuadro «MODO DEMO». La plataforma no usa SMS como segundo factor.

Cumple: RF-ACC-05, RN-08, TEC-6, RNF-SEG-01/02.

**Aliados (coordinador y mentores del aliado)**

1. Pestaña **Funcionarios y aliados** → **Correo** y **Contraseña** → **Ingresar**.
2. Complete la verificación en dos pasos como se explicó arriba.

Cumple: RF-ACC-05, RN-08.

**Empresas**

1. Haga clic en la pestaña **Empresas**.
2. Escriba el **Correo de la empresa** y pulse **Enviar código**.
3. Revise su correo. Escriba el **Código de 6 dígitos** y pulse **Verificar y entrar**. El código vence en 10 minutos.
4. Si se equivocó de correo, use **Usar otro correo o reenviar código**.
5. Debe verse: el inicio de su empresa. El mensaje es el mismo exista o no el correo (no revela qué correos están registrados). Tras 5 códigos errados la cuenta queda bloqueada 15 minutos para códigos.

> **Nota:** En modo demostración el código aparece en un recuadro amarillo «MODO DEMO — tu código es…».

Cumple: FUN-18, RF-ACC-03, RF-ACC-05, RN-08, RNF-SEG-03, TEC-7 (Parcial: el WAF Bot Control es de infraestructura).

### 1.5 Recuperar la contraseña

1. En la pantalla de ingreso, junto a **Contraseña**, haga clic en **¿La olvidaste?**
2. Escriba su correo y pulse **Enviar código**.
3. Escriba el código recibido, la **Nueva contraseña** (mínimo 10 caracteres con mayúscula, minúscula y número) y pulse **Cambiar contraseña**.
4. Debe verse: el mensaje «Si el correo existe, enviamos un código a…» (no revela si existe). Al cambiar la clave se cierran sus otras sesiones. Tras 5 intentos fallidos hay bloqueo temporal.

Cumple: FUN-04, RF-ACC-03, TEC-1.

### 1.6 Primer ingreso

**Clave temporal (usuarios invitados)**

1. Ingrese con el correo y la clave temporal que recibió en la invitación.
2. La plataforma lo lleva a **Cambia tu contraseña**. Escriba **Nueva contraseña**, **Repetir contraseña** y pulse **Guardar y continuar**.
3. Debe verse: no puede usar la plataforma hasta cambiarla. La clave temporal vence a los 3 días; si vence, el administrador usa **Reenviar invitación** (capítulo 2, paso «Usuarios»).

Cumple: FUN-05, RF-ACC-04, TEC-1.

**Pasos obligatorios de la empresa**

1. La primera vez que entra una empresa activa, aparece la pantalla **Primer ingreso**.
2. Acepte la autorización de datos y complete el perfil: **Sector \***, **Tamaño**, **Ciudad**, **Propuesta de valor \***, **Red social / sitio web**. Pulse **Guardar y continuar**.
3. Debe verse: mientras no los complete, cualquier pantalla lo devuelve a **Primer ingreso**. Al terminar ve el inicio de su empresa con la bienvenida.

Cumple: FUN-28, FUN-30, RF-PAR-08, RF-EMP-06, RF-EMP-10, RNF-PRI-03.

### 1.7 Cambiar de empresa activa

Si su correo es contacto de más de una empresa:

1. En la barra superior, haga clic en el nombre de la empresa.
2. En el menú **Trabajar con la empresa**, elija la empresa.
3. Debe verse: toda la plataforma muestra los datos de esa empresa. El cambio queda en la auditoría.

Cumple: RF-EMP-03, FUN-06.

### 1.8 Mi cuenta

Haga clic en su nombre (arriba a la derecha) › **Mi cuenta y seguridad**. Hay cinco pestañas:

1. **Mis datos**: **Nombre completo**, **Correo**, **Celular**, **Cargo**. Abajo ve **Roles y alcance**.
2. **Contraseña**: **Contraseña actual**, **Nueva contraseña**, **Confirmar nueva contraseña** → **Cambiar contraseña**. Al cambiarla se cierran sus sesiones en otros equipos. (Si entra por SSO, la clave se administra en el IAM de Compensar.)
3. **Verificación en dos pasos**: **Configurar ahora** o **Reconfigurar (nuevo celular)**, **Generar nuevos códigos** y **Desactivar 2FA** (no se permite si su rol la exige).
4. **Notificaciones**: elija los canales (correo, SMS, WhatsApp) y los mensajes no esenciales que no quiere recibir → **Guardar preferencias**. Los mensajes de seguridad (códigos, invitaciones, recuperación y alertas) se envían siempre.
5. **Sesiones activas**: ve cada equipo, método de ingreso e IP. Puede pulsar **Cerrar** en una sesión o **Cerrar todas las demás**.

Cumple: RF-ACC-05, RF-NOT-05, TEC-1, TEC-6.

### 1.9 Cierre por inactividad

Si no usa la plataforma durante el tiempo configurado (30 minutos por defecto), la sesión se cierra sola y debe ingresar de nuevo. El tiempo se cambia en **Administración › Configuración › pestaña Marca y canales › Cierre por inactividad (min)** o en **Administración › Integraciones y API › pestaña Seguridad**.

Cumple: RF-ACC-10, RN-09, TEC-104.

### 1.10 Lo que ve cada uno en el menú

El menú lateral tiene las secciones **General**, **Convocatorias**, **Empresas**, **Acompañamiento**, **Control** y **Administración**. Cada persona solo ve las opciones de su rol. La empresa ve nombres propios: **Mi empresa**, **Mi diagnóstico**, **Mi ruta**, **Mis documentos**, **Mi informe final**, **Mis colaboradores**, **Mis solicitudes**.

Si alguien abre por enlace directo un registro que no le corresponde, ve la pantalla **Sin acceso**.

Cumple: RN-02, RF-ACO-03.

---

## 2. Procesos

## (a) Configuración de la plataforma

**Quién lo hace:** Administrador (`admin@compensar.test`). Todo se hace sin desarrollo y cada cambio queda en la auditoría.

### a.1 Programas

1. Vaya a **Administración › Configuración › pestaña Programas y rutas**.
2. En **Nuevo programa** escriba **Nombre**, **Responsable**, **Desde**, **Hasta** (vigencia) y **Requisitos de acceso**. Pulse **Crear programa**.
3. Para editar un programa existente, cambie **Programa**, **Responsable**, **Vigencia desde**, **Hasta**, **Requisitos de acceso (descriptivos)** y **Estado**, y pulse **Guardar programa**.
4. Debe verse: el programa en la lista (en la demo ya existen *Emprendimiento* y *Territorio MIPYME*).

Cumple: RF-PAR-01, CU-01.

### a.2 Ejes, líneas y rutas

1. En la misma pestaña, dentro de cada programa, está el bloque **Ejes → Líneas → Rutas**.
2. Escriba en **Nuevo eje**, **Nueva línea** o **Nueva ruta** y pulse **+**.
3. Para renombrar, haga clic sobre el nombre, cámbielo y pulse **Guardar**.
4. Para retirar uno, pulse **Inactivar** (después puede pulsar **Activar**).
5. Debe verse: el elemento inactivo queda atenuado con la marca «inactiva»; no se borra y conserva su historial y asignaciones. El cambio de nombre queda en auditoría con el valor anterior y el nuevo.

Cumple: RF-PAR-02, CU-01.

### a.3 Catálogo de servicios

1. Vaya a **Administración › Configuración › pestaña Catálogo de servicios**.
2. En **Nuevo servicio** llene **Nombre**, **Programa**, **Línea**, **Aliado**, **Tipo**, **Horas**, **Sesiones**, **Costo interno (informativo)** e **Indicadores**. Pulse **Crear servicio**.
3. Use **Inactivar** / **Activar** para retirar o recuperar un servicio.
4. Debe verse: el servicio en la tabla. Este mismo catálogo se usa para remitir empresas, armar rutas y definir indicadores.

Cumple: RF-PAR-03, FUN-41, RF-SRV-03, CU-01.

### a.4 Aliados

1. Vaya a **Administración › Configuración › pestaña Aliados**.
2. Escriba **Razón social** y **NIT** y pulse **Crear aliado**.
3. Luego invite al coordinador y a sus mentores desde **Usuarios** (paso a.9), con alcance de ese aliado.
4. Debe verse: el aliado en la lista. El coordinador y los mentores del aliado solo verán lo de su aliado.

Cumple: RF-PAR-05, CU-01.

### a.5 Marca y logo

1. Vaya a **Administración › Configuración › pestaña Marca y canales**.
2. En **Logo** elija una imagen PNG o JPG (máx. 2 MB) y pulse **Subir logo**. Para quitarlo, **Quitar logo**.
3. Cambie **Nombre de la organización**, **Color principal** y **Subtítulo**. Pulse **Guardar**.
4. Debe verse: toda la interfaz cambia de color y nombre. El logo aparece en el menú, las pantallas de ingreso, las landings y los certificados. El logo pasa por el antivirus.

Cumple: RF-PAR-06, RNF-USA-06 (Parcial: se ajusta al manual de UX/UI cuando Compensar lo entregue), CU-01.

### a.6 Canales y textos de los mensajes

1. En la misma pestaña **Marca y canales**, marque o desmarque **Canal correo**, **Canal sms** y **Canal whatsapp**.
2. Ajuste **Prefijo de SMS y WhatsApp** y **Pie de los correos**.
3. Ajuste también **Texto de bienvenida de empresas**, **Versión del texto de datos personales**, **Texto de autorización (Ley 1581)**, **Pasos obligatorios del primer ingreso (uno por línea)** y **Cierre por inactividad (min)**.
4. Pulse **Guardar**.
5. Debe verse: los canales apagados dejan de enviar. Todos los mensajes salen en español con el nombre de la marca (asunto «Compensar | …» y prefijo en SMS y WhatsApp).

> **Nota:** Los proveedores de correo, SMS y WhatsApp están simulados hasta contratarlos. El remitente se configura; SPF, DKIM y DMARC se configuran en el dominio de Compensar al desplegar (RF-NOT-02 queda **Parcial**).

Cumple: RF-NOT-01, RF-NOT-02 (Parcial), RF-NOT-04, RF-PAR-08, RF-EMP-10, RF-ACC-10, RNF-PRI-03, TEC-12.

### a.7 Plantillas de mensajes

1. Vaya a **Administración › Configuración › pestaña Plantillas de mensajes**.
2. Cada plantilla tiene canal (correo, SMS o WhatsApp) y variables. Edite el texto y pulse **Guardar**.
3. Debe verse: al editarla queda **pendiente** de aprobación. Pulse **Aprobar (Compensar)** para habilitarla.
4. Una plantilla no aprobada **no se envía**. En la demo, la plantilla de *remisión* por WhatsApp viene pendiente.

Cumple: RF-PAR-07, FUN-45, RF-ACO-11, CU-01.

### a.8 Roles y permisos

1. Vaya a **Administración › Configuración › pestaña Roles y permisos**.
2. Para crear un rol: escriba **Nuevo rol (nombre)** (ejemplo «Evaluador senior»), elija **Copiar permisos de** (ejemplo *Evaluador*) y pulse **Crear a partir de otro**.
3. En cualquier rol, marque o desmarque permisos y pulse **Guardar permisos**.
4. Debe verse: el rol nuevo con sus permisos, listo para asignar. Los 12 roles base vienen sembrados.

> **Nota:** Los permisos de los roles base están protegidos por una prueba automática (`npm test`) que recorre las 852 combinaciones rol × permiso y falla si alguna cambió sin aprobación (capítulo (m)).

Cumple: FUN-07, RF-ACC-07, RF-ACC-08, RN-02, TEC-8/9, CU-01.

### a.9 Usuarios

1. Vaya a **Administración › Usuarios**.
2. En **Invitar usuario** llene **Nombre**, **Correo**, **Celular**, **Rol**, **Alcance** y **Programa / aliado (según alcance)**. Pulse **Enviar invitación**.
3. Debe verse: el usuario en estado «invitado». La invitación llega con clave temporal (en modo demo se muestra en pantalla). Los funcionarios, en producción, entran por SSO.
4. Use los filtros (**Todos los estados**, **Todos los roles**) y pulse **Filtrar** para buscar.
5. Acciones por usuario: **Reenviar invitación**, **Revocar invitación**, **Desactivar** y **Reactivar**. El efecto es inmediato.
6. Para dar un segundo rol: en **Agregar rol adicional a un usuario (roles combinados)** elija **Usuario**, **Rol**, **Alcance** y **Programa / aliado**, y pulse **Asignar**. Para quitar un rol pulse la **×** junto al rol (título «Revocar rol»).
7. Delegación: el Gestor de Mentorías invita mentores; el Coordinador de aliado invita a sus mentores; la empresa invita a sus colaboradores (en su menú, **Mis colaboradores**). Nadie se asigna roles a sí mismo.
8. Debe verse: cada asignación, revocación, activación y desactivación queda en la auditoría con el valor anterior y el nuevo. Las invitaciones no aceptadas en 90 días se anonimizan solas.

Cumple: FUN-03, FUN-07, RF-ACC-01, RF-ACC-04, RF-ACC-09, RN-03, RN-04, RN-06, RN-10, RNF-SEG-04, RNF-PRI-05, TEC-8/9, CU-01.

### a.10 Verificar en la auditoría

1. Vaya a **Control › Auditoría**.
2. Debe verse: cada cambio anterior con usuario, acción, entidad, **Antes → Después** e IP.

Cumple: CU-01 (criterio de aceptación), RF-AUD-01.

---

## (b) Convocatorias, eventos y cursos

**Quién lo hace:** Gestor de Contenidos (`contenidos@compensar.test`) y Gestor de Cursos (`cursos@compensar.test`) crean y publican; Auxiliar Administrativo (`aux@compensar.test`) y Gestor de Cursos manejan inscritos, asistencia y certificados; las empresas (`empresa1@`, `empresa2@`, `empresa3@`) se inscriben.

### b.1 Crear la convocatoria, evento, charla o curso

1. Vaya a **Convocatorias › Eventos y cursos** y pulse **+ Nuevo evento o curso**.
2. En **Datos básicos** llene: **Nombre \***, **Programa \*** (solo aparecen sus programas), **Tipo**, **Modalidad**, **Inicio (hora Colombia) \***, **Fin (última sesión)**, **Lugar o enlace**, **Cupo**, **Costo interno (COP)**, **Público**, **Responsable**, **Requisitos** y **Formulario externo (Microsoft Forms)**.
3. Debe verse: solo el nombre y la fecha de inicio son obligatorios. Si intenta otro programa que no es suyo, no aparece y el servidor lo rechaza.

Cumple: FUN-08, FUN-09, FUN-10, FUN-11, RF-CON-01, RF-CON-02, RF-CON-03, RF-CON-04.

### b.2 Sesiones, asistencia mínima y certificados

1. En **Sesiones, asistencia y certificados** llene **Número de sesiones**, **Asistencia mínima %** (80 % por defecto), **Intensidad horaria total (h)** y **Min. conexión virtual**.
2. Marque **Certificados automáticos** si quiere que el PDF se emita solo al terminar.
3. En **Recordatorios** escriba cuándo avisar, por ejemplo `7d,1d,1h`.
4. Debe verse: un curso de varias sesiones lleva asistencia por sesión y certifica a quien cumpla el porcentaje.

Cumple: RF-PAR-04, FUN-12, RF-CON-05.

### b.3 Landing, banner y descripción

1. En **Landing pública** elija la **Plantilla de la landing** (Clásica, Destacada o Minimal).
2. Escriba el **Resumen**. Suba **Banner (imagen JPG/PNG ≤ 5 MB)** o use **…o banner por URL**.
3. Escriba la **Descripción** (admite negrita, cursiva, viñetas, subtítulos y enlaces; no HTML).
4. Marque **Publicar de inmediato (queda abierto a inscripciones al guardar)** si quiere publicar ya. Guarde.
5. Debe verse: el banner pasa por el antivirus y se verifica su tipo. Un curso nuevo queda abierto en uno o dos minutos.

Cumple: FUN-13, FUN-14, RF-CON-06, RF-CON-07, RF-PAR-04.

### b.4 Publicar, cerrar, duplicar, activar e inactivar

1. Abra el evento desde la lista. Arriba están los botones:
   - **Publicar** (si está en borrador), **Cerrar** y **Volver a borrador** (si está publicado).
   - **Duplicar como plantilla**: copia todo menos fechas e inscritos.
   - **Inactivar** / **Activar**: retira el evento sin borrar su historial.
   - **Editar datos del evento** → cambie lo necesario → **Guardar cambios** (puede usar «Quitar la imagen subida actual»).
2. Debe verse: un borrador o un evento inactivo **no** aparece en la oferta ni en la landing.

Cumple: FUN-09, FUN-19, RF-CON-02, RF-CON-12.

### b.5 Landing pública, enlace corto y QR

1. Con el evento publicado, pulse **Ver landing**.
2. Debe verse: la landing con la marca, el enlace corto (no permite adivinar otros eventos) y el **Código QR de la landing** para compartir.

Cumple: FUN-14, RF-CON-07, RF-PAR-06, CU-02.

### b.6 Buscar eventos y ver el calendario

1. En **Convocatorias › Eventos y cursos** use el buscador (**Buscar por nombre, descripción, lugar…**) y los filtros de programa, tipo, modalidad, estado y fechas. **Limpiar filtros** los quita.
2. Cambie entre **Lista** y **Calendario**. En el calendario elija **Mes** o **Semana** y navegue con **‹ Anterior**, **Hoy**, **Siguiente ›**.
3. Debe verse: los eventos por color (publicado, borrador, cerrado). Responde en menos de medio segundo con 154 eventos.

Cumple: FUN-15, FUN-19, RF-CON-08, RF-CON-12.

### b.7 La empresa consulta la oferta y se inscribe

**Quién:** empresa (`empresa1@laespiga.test`).

1. Vaya a **Convocatorias › Oferta y eventos**. Busque con **Buscar por nombre o tema…** y los filtros, o cambie a **Calendario**.
2. Debe verse: tarjetas con banner, resumen y **Cupos:** reales. Pulse **Ver detalle / inscribirme**.
3. En la landing marque la casilla de autorización de datos (Ley 1581, con su versión) y pulse **Inscribir a mi empresa**.
4. Debe verse: «Tu empresa está inscrita» y su **Código** de asistencia con el QR que presentará en cada sesión. Si el evento tiene formulario externo aparece **Completar formulario adicional (Microsoft Forms) →**.
5. Si no ha iniciado sesión aparece **Ingresar para inscribirme** o **Registrar mi empresa**.
6. Debe verse también: la plataforma valida sesión, rol, empresa activa y cupo; una segunda inscripción de la misma empresa se rechaza; una empresa pendiente o suspendida no puede inscribirse. Hay límites anti-bots.

Cumple: FUN-16, FUN-17, FUN-18, RF-CON-09, RF-CON-10, RF-CON-11, RF-EMP-04, RNF-PRI-03, CU-02.

### b.8 Cupo lleno y lista de espera

1. Cuando el cupo se llena, la landing muestra la casilla **El cupo está lleno: unirme a la lista de espera** y el botón **Unirme a la lista de espera**.
2. Si un funcionario pulsa **Cancelar** en un inscrito (sección **Inscritos** del evento), el primero de la lista de espera pasa a tener cupo y recibe aviso.
3. Debe verse: el cupo se respeta siempre.

Cumple: RF-CON-03, RF-CON-17, CU-02.

### b.9 Recordatorios

1. En el detalle del evento pulse **Enviar recordatorios** (además salen solos según lo configurado en **Recordatorios**).
2. Vaya a la campana de **Notificaciones** (arriba).
3. Debe verse: correo, SMS y WhatsApp con su estado (entregado, leído, fallido). Nunca se envía dos veces el mismo recordatorio.

Cumple: FUN-12, RF-CON-05, RF-NOT-03, CU-02.

### b.10 Inscritos y exportación

**Quién:** Auxiliar Administrativo o Gestor de Cursos.

1. En el detalle del evento, sección **Inscritos**, use **Buscar inscrito** y los filtros (estado, asistencia, lista de espera, certificado).
2. Pulse **Exportar Excel** o **Exportar CSV**.
3. Debe verse: el archivo con los mismos filtros, sesiones asistidas, % y si cumple. Si su rol no tiene permiso de datos personales (por ejemplo `cursos@`), aparece «Tu rol exporta sin datos personales» y el archivo sale sin nombre, correo ni celular. `aux@` sí los ve.

Cumple: FUN-20, RF-CON-13, CU-02.

### b.11 Asistencia individual, masiva, por sesión, por QR y por Teams/Zoom

1. En cursos de varias sesiones, elija la **Sesión** arriba de la tabla.
2. **Individual o masiva:** marque la columna «Asistió» y pulse **Guardar asistencia de la sesión n** (o **Guardar asistencia masiva** si hay una sola sesión).
3. **QR / código:** en **Asistencia por QR / código** escanee o escriba el **Código del inscrito** y pulse **Registrar**.
4. **Teams / Zoom:** en **Reporte de Teams / Zoom (CSV)** elija el archivo (demo: `demo/asistencia-teams.csv`) y pulse **Cargar**.
5. Debe verse: cada inscrito con «2/3 sesiones (67 %)» y si cumple. En el CSV de demo, 45 minutos cumple y 10 minutos no cumple el mínimo de 30.

Cumple: FUN-21, RF-CON-14, RF-PAR-04, CU-02.

### b.12 Certificados PDF y verificación pública

1. En la sección **Certificados** pulse **Emitir certificados ahora** (o espere la emisión automática, que revisa cada 10 minutos).
2. Debe verse: certificado PDF con la marca, firma electrónica, código y QR, enviado por correo a quien cumple la asistencia mínima.
3. Abra la dirección `/verificar/<código>` (o `/certificado/<código>` y **Verificar firma**).
4. Debe verse: «Certificado válido · Firma válida». Un código falso o un dato alterado muestra que no es válido.

> **Nota:** La firma es electrónica verificable (Ed25519). No es una firma digital de una entidad de certificación acreditada (ECD); si Compensar la exige, se integra su certificado.

Cumple: FUN-22, RF-CON-15, RF-PAR-06, CU-02.

### b.13 Evidencias del evento

1. En **Evidencias (se almacenan en OnBase)** elija el **Archivo (≤20 MB)** y el **Tipo**, y pulse **Subir evidencia**.
2. Prueba: `demo/hoja-de-ruta.pdf` se acepta; `demo/archivo-infectado.pdf` se rechaza por el antivirus.
3. Debe verse: el archivo con **Referencia OnBase**, **Subido por** y **Fecha**.

Cumple: FUN-23, RF-CON-16, RF-DOC-01 (Parcial), RF-DOC-02, RF-DOC-03, CU-02.

### b.14 Exportes del listado

1. En **Eventos y cursos** (y en otras listas) use los botones **Excel**, **CSV**, **JSON** o **PDF** del grupo **Exportar**.

Cumple: FUN-100, RF-INT-06.

---

## (c) Formularios sin código

**Quién lo hace:** Gestor de Contenidos (`contenidos@compensar.test`) o Administrador. Consultan respuestas: Auxiliar, Gestor de Cursos y Gestor de Mentorías. Diligencian: empresas.

### c.1 Crear un formulario

1. Vaya a **Convocatorias › Formularios** y pulse **Nuevo formulario**.
2. Escriba **Nombre \***, elija **Tipo** (inscripción, diagnóstico, encuesta o general), **Programa** y **Descripción**. Opcional: **Copiar de (opcional)** o **Empezar en blanco**.
3. Pulse **Crear y abrir el constructor**.

Cumple: FUN-50, RF-FRM-01.

### c.2 Diseñar sin código

1. En la pestaña **Diseño y vista previa** pulse **Agregar sección** (en diagnósticos, **Agregar dimensión**) y **Agregar pregunta**.
2. Elija entre 10 tipos: texto corto, párrafo, número, fecha, selección única, selección múltiple, escala, archivo, NIT (valida el dígito de verificación) y ubicación DIVIPOLA (departamento → municipio).
3. Haga clic en la pregunta para editar: enunciado, ayuda, **Obligatoria**, mínimos y máximos, formato y **No permitir valores repetidos**. Para opciones use **+ Agregar opción** o **Pegar varias opciones**.
4. **Bloques listos:** agregan de una vez datos de la empresa, datos de contacto o autorización de datos.
5. **Condición:** mostrar u omitir una pregunta o sección según una respuesta anterior (es igual a, es diferente de, incluye, ≥, ≤, fue respondida, no fue respondida). **Quitar condición** la elimina.
6. Todo se guarda solo («Se guarda automáticamente (Ctrl+S)»). Pulse **Vista previa** para verlo como el participante, con validaciones y lógica funcionando.

Cumple: FUN-51, FUN-52, FUN-53, RF-FRM-02, RF-FRM-03, RF-FRM-04.

### c.3 Configurar, asociar y publicar

1. Pestaña **Configuración y publicación**: **Nombre \***, **Descripción (se muestra al participante)**, **Tipo**, **Programa**, **Asociar a convocatoria o evento**, **Enlace público**, **Acceso** (con inicio de sesión o público con correo), **Permitir más de una respuesta por empresa/usuario** y **Mensaje de confirmación**. Pulse **Guardar configuración**.
2. Pulse **Publicar** (arriba). Si luego edita, verá «Hay cambios sin publicar en el borrador» y el botón **Publicar versión n+1**; **Descartar cambios** vuelve a la última versión.
3. Para dejar de recibir respuestas: **Archivar (cerrar recepción)**; **Restaurar** lo reactiva.
4. Debe verse: cada publicación crea una versión nueva; las respuestas ya recibidas conservan su versión. El enlace aparece en «Comparte este enlace:» y con **Abrir enlace**.

Cumple: FUN-11, FUN-50, FUN-55, RF-FRM-01, RF-FRM-06, RF-CON-04.

### c.4 Diligenciar y validar

**Quién:** empresa.

1. Abra el enlace `/f/<enlace>` (o desde **Convocatorias › Mis formularios › Formularios disponibles para ti**).
2. Avance por secciones. Un NIT con dígito de verificación errado se marca al instante; los obligatorios y formatos se validan en pantalla y en el servidor.
3. Puede pulsar **Guardar y continuar después**; el borrador también se guarda solo. Al volver abre donde quedó.
4. Pulse **Enviar**. Debe verse: «¡Gracias! Recibimos tu respuesta» con el **Número de radicado**. Llega confirmación por correo, SMS y WhatsApp. Un segundo envío de la misma empresa se rechaza (salvo que se permitan varios).

> **Nota:** En formularios públicos sin sesión, el borrador se guarda solo en ese navegador.

Cumple: FUN-56, FUN-69, FUN-70, RF-FRM-07, RF-FRM-08, RF-FRM-09.

### c.5 Consultar el estado (participante)

1. Vaya a **Convocatorias › Mis formularios**.
2. Debe verse: cada respuesta con radicado, versión, estado (borrador, enviado, en revisión, requiere ajustes, aprobado, rechazado) y motivo. Si está en «requiere ajustes», puede corregir y reenviar. En el detalle puede **Descargar PDF**.

Cumple: FUN-71, RF-FRM-10.

### c.6 Respuestas para el equipo

1. En el formulario pulse **Respuestas (n)**. Filtre por estado, versión, empresa, texto, nivel y fechas.
2. Exporte a Excel o CSV.
3. Abra una respuesta. En formularios generales y encuestas use **Cambiar estado** (**Nuevo estado**, **Motivo u observaciones**) → **Guardar y notificar**. Las inscripciones se deciden en **Validación de requisitos** (capítulo (d)).

Cumple: FUN-55, FUN-70, FUN-71, RF-FRM-06, RF-FRM-09, RF-FRM-10, FUN-100.

---

## (d) Registro, validación y activación de empresas

**Quién lo hace:** Auxiliar Administrativo (`aux@compensar.test`), Gestor de Mentorías (`gestor@compensar.test`), Evaluador (`evaluador@compensar.test`), Administrador. Las empresas se autorregistran y completan su perfil.

### d.1 Autorregistro de la empresa

1. En la pantalla de ingreso, pestaña **Empresas**, pulse **Registrar mi empresa**.
2. Llene **Razón social \***, **NIT (sin DV) \***, **DV \***, **Programa \***, **Representante \*** y **Correo \***. Pulse **Enviar registro**.
3. Debe verse: el NIT se valida con el dígito de verificación (módulo 11). La empresa queda **pendiente**: al ingresar ve «Tu empresa está pendiente de activación» y no puede inscribirse a servicios hasta ser activada.

Cumple: FUN-03, RF-ACC-01, RF-EMP-04, RN-06, RNF-SEG-03.

### d.2 Crear una empresa individual

1. Vaya a **Empresas › Empresas**. En **Crear empresa y representante (individual)** llene **Razón social \***, **NIT (sin DV) \***, **DV \***, **Programa**, **Sector**, **Tamaño**, **Ciudad**, **Representante \***, **Correo \*** y **Celular**. Pulse **Crear**.
2. Debe verse: la empresa y su representante, que recibe la invitación. Si el correo ya es contacto de otra empresa, queda vinculado también a la nueva (ver 1.7).

Cumple: FUN-25, RF-EMP-03.

### d.3 Cargue masivo (Excel, CSV o JSON)

1. Vaya a **Empresas › Empresas** y pulse **⬆ Cargue masivo (Excel, CSV, JSON)**.
2. En **Plantilla** descargue el formato: **Excel**, **CSV** o **JSON**.
3. Elija el **Origen del cargue \*** (Cargue directo, Propulsor Empresarial, Universidad-Empresa, DEI u Otro; si es Otro, escriba **¿Cuál?**).
4. En **Archivo (.xlsx, .csv o .json) \*** suba `demo/carga-con-error.xlsx`. Pulse **Validar y cargar**.
5. Debe verse: **no se guarda nada** y se señala la fila con error (Fila 4: DV inválido y cuál es el correcto). Puede usar **Descargar los errores por fila (Excel)**.
6. Suba `demo/carga-correcta.xlsx` marcando **Activar las empresas al cargarlas**. Debe verse: 6 empresas creadas y cada representante con su invitación (en modo demo se muestran las credenciales temporales).
7. Suba el mismo archivo otra vez. Debe verse: «Este NIT ya está en este programa». Si el NIT existe en otro programa, dice «Este NIT ya existe en la organización (programa …)».
8. En **Empresas** filtre por **Todos los orígenes** para ver el origen de cada empresa.

Cumple: FUN-24, FUN-25, RF-EMP-01, RF-EMP-02, RF-EMP-03, RF-INT-06, TEC-59, CU-03.

### d.4 Cargues grandes en segundo plano

1. Suba un archivo de más de 50 filas.
2. Debe verse: «Se está procesando en segundo plano.» En **Mis cargues** aparece el estado; la página se actualiza sola y recibe un aviso al terminar. Puede descargar **Errores en Excel** o **Errores en CSV**.

Cumple: RNF-REN-07, RF-INT-06.

### d.5 Bandeja de validación de requisitos

1. Vaya a **Empresas › Validación de requisitos** (pestaña **Bandeja**).
2. Debe verse: llegan solas las empresas pendientes (autorregistro, creación o cargue) y las inscripciones de formularios. Cada fila muestra el tiempo de espera (en rojo si supera 5 días).
3. Filtre por programa, estado, responsable (**Asignadas a mí**, **Sin asignar**), tipo y resultado automático.
4. Marque varias, elija **Validador…** y pulse **Asignar / reasignar**.

Cumple: FUN-72, RF-VAL-01.

### d.6 Revisar una solicitud

1. Abra la solicitud.
2. **Validación automática:** resultado regla por regla contra Gestión de Clientes («Cumple» / «No cumple» con el motivo). **Volver a consultar** la repite. Ejemplo demo: Ferretería El Tornillo sale «No cumple» por 4 meses de afiliación.
3. **Validación manual complementaria:** marque la **Lista de chequeo**, escriba **Observaciones (por qué) \*** y pulse **Guardar validación manual**. Queda quién validó, cuándo y por qué.
4. **Documentos e información adicional:** escriba **Qué se necesita \*** y **Plazo \*** y pulse **Solicitar al solicitante**. Se avisa por correo, SMS y WhatsApp, con recordatorio antes de vencer; si vence, la solicitud pasa a vencida y el caso vuelve a revisión. **Procesar plazos ahora** (en la bandeja) lo ejecuta de inmediato.
5. **Decisión:** elija **Aprobar y activar la empresa**, **Pedir ajustes** o **Rechazar**, escriba **Motivo (lo recibe el solicitante)** (obligatorio para rechazar o pedir ajustes) y pulse **Registrar decisión**.
6. Debe verse: al aprobar, la empresa queda **activa** y recibe el aviso por los tres canales. Abajo, la trazabilidad completa del caso.

> **Nota:** Gestión de Clientes usa hoy una réplica local; se conmuta a su API REST con las credenciales de Compensar.

Cumple: FUN-26, FUN-27, FUN-73, FUN-74, FUN-75, FUN-76, RF-VAL-02, RF-VAL-03, RF-VAL-04, RF-VAL-05, RF-EMP-04, RF-EMP-05, RF-NOT-03.

### d.7 Reglas de validación

1. Pestaña **Reglas**. Elija el **Programa**.
2. En **Nueva regla** llene **Nombre (motivo visible) \***, **Campo de Gestión de Clientes**, **Operador** y **Valor**. Pulse **Crear regla**. Edite con **Guardar cambios**; active o desactive cada regla.
3. Pruebe en **Probar las reglas con un NIT** (escriba el NIT sin DV y pulse **Probar**). No guarda nada.

Cumple: FUN-73, RF-VAL-02.

### d.8 Validación masiva por Excel

1. Pestaña **Validación masiva**. Pulse **Descargar plantilla**.
2. Suba el **Archivo Excel (.xlsx)** y elija **Qué hacer con el resultado**: **Solo validar (no cambia decisiones)**, **Aprobar las que cumplen (activa la empresa)** o **Aprobar las que cumplen y rechazar las que no**. Pulse **Validar archivo**.
3. Debe verse: el resultado en pantalla y **⬇ Descargar resultado (Excel)** con el motivo de cada fila.

Cumple: FUN-77, RF-VAL-06.

### d.9 Avance y reportes de la validación

1. Pestaña **Tablero de avance**: solicitudes por estado y por responsable, recibidas vs. decididas por mes, % que cumple y tiempo medio de decisión. Filtre por programa y periodo (**Aplicar**). **Exportar a PDF**.
2. Pestaña **Reportes**: **Validación de requisitos (casos y resultado)** y **Seguimiento de empresas (validación + ruta)**. Descargue **⬇ Excel** o **⬇ CSV**.

Cumple: FUN-78, FUN-96, RF-VAL-07, RF-ANA-04.

### d.10 La empresa consulta y responde sus solicitudes

**Quién:** empresa.

1. Vaya a **Empresas › Mis solicitudes**.
2. Debe verse: el estado de su registro e inscripciones, el motivo de la decisión y las solicitudes pendientes con su **Plazo:**.
3. Escriba **Tu respuesta**, use **Adjuntar documento** si aplica y pulse **Enviar respuesta**. El archivo se guarda en OnBase.

Cumple: FUN-71, FUN-76, RF-VAL-05.

### d.11 Activar o suspender empresas

1. En **Empresas › Empresas** marque las empresas y, en **Con las seleccionadas:**, pulse **Activar** o **Suspender**.
2. Debe verse: el cambio de estado y el aviso a la empresa por correo, SMS y WhatsApp con estado de entrega. Una empresa suspendida ve «Tu empresa está suspendida»; una pendiente no puede inscribirse. Ejemplo demo: Ferretería El Tornillo.

Cumple: FUN-26, FUN-27, RF-EMP-04, RF-EMP-05, RN-10, CU-03.

### d.12 Primer ingreso de la empresa activada

1. La representante entra con su correo (código o clave temporal), cambia la clave si aplica y completa **Primer ingreso** (ver 1.6).
2. Debe verse: no avanza hasta completarlo; después ve la bienvenida.

Cumple: FUN-05, FUN-28, FUN-30, RF-EMP-06, CU-03.

### d.13 Perfil de la empresa

1. Abra la empresa (**Empresas › Empresas › Ver**; la empresa usa **Mi empresa**).
2. En **Perfil** cambie **Sector**, **Tamaño**, **Ciudad**, **Propuesta de valor** y **Redes sociales / sitio**. Pulse **Guardar perfil**.
3. Debe verse: en **Historial de cambios del perfil** cada cambio con quién, cuándo, valor anterior y nuevo. Lo pueden editar el representante y el mentor asignado.

Cumple: FUN-06, FUN-29, RF-EMP-07, RF-EMP-09.

### d.14 Contactos y colaboradores

1. En la ficha, bloque **Contactos**, se ven el representante y los colaboradores.
2. El representante, en **Mis colaboradores**, invita colaboradores (**Invitar usuario** → **Enviar invitación**) y los retira (**Desactivar**).
3. Debe verse: cada alta y baja queda auditada.

Cumple: FUN-06, FUN-25, RF-ACC-06, RF-EMP-03.

### d.15 Directorio

1. En la ficha, marque **Campos visibles en el directorio** (Nombre, Sector, Ciudad, Propuesta de valor, Redes) y guarde.
2. Vaya a **Empresas › Directorio** y use **Buscar…**.
3. Debe verse: solo los campos que la empresa permitió; los ocultos no aparecen ni en las búsquedas. También aparece **Consultores y mentores**.

Cumple: RF-EMP-08, RF-EMP-09.

### d.16 Sincronizar con Gestión de Clientes

1. En la ficha, tarjeta **Gestión de Clientes**, pulse **Sincronizar con Gestión de Clientes** (solo usuarios internos con permiso de activar).
2. Debe verse: afiliación, meses, aportes y ventas; fecha de la última sincronización y quién la hizo. Queda auditado.

> **Nota:** En modo simulado lee la réplica local de Gestión de Clientes.

Cumple: FUN-73, RF-INT-01, RF-INT-04.

---

## (e) Diagnóstico empresarial

**Quién lo hace:** Gestor de Mentorías (`gestor@compensar.test`) y Mentor (`mentor1@compensar.test`) asignan y gestionan; Evaluador y Auditor consultan; la empresa hace su autodiagnóstico (`empresa2@textiles.test` tiene uno asignado). Los instrumentos los crea el Gestor de Contenidos en **Formularios** (tipo «Diagnóstico»).

### e.1 Crear el instrumento de diagnóstico

1. Vaya a **Convocatorias › Formularios** › **Nuevo formulario**, tipo **Diagnóstico** (ver capítulo (c)).
2. En **Diseño y vista previa** dé a cada opción un **Puntaje**, a cada pregunta un peso y a cada dimensión un peso. Agregue condiciones (mostrar/omitir) si las necesita.
3. En la pestaña **Clasificación y niveles** defina los **Niveles de madurez** (nombre, desde–hasta, color y recomendaciones; **Agregar nivel**) y los **Segmentos** (**Agregar regla**; **Segmento por defecto**). Pulse **Guardar reglas** o **Guardar y recalcular diagnósticos enviados**.
4. Publique. Debe verse: el instrumento queda versionado. En la demo existe «Diagnóstico de madurez empresarial» (niveles Inicial, En desarrollo y Consolidado).

Cumple: FUN-53, FUN-57, FUN-62, RF-FRM-04, RF-DIA-01, RF-DIA-06.

### e.2 Registrar una empresa para diagnóstico

1. Vaya a **Empresas › Diagnósticos › pestaña Registrar empresa**.
2. Llene **Razón social \***, **NIT (sin DV) \***, **DV \***, **Sector**, **Tamaño**, **Ciudad**, **Programa** e **Iniciar diagnóstico con** (o **Solo registrar la empresa**). Pulse **Registrar y continuar**.
3. Debe verse: el NIT se valida; si ya existe no se crea un duplicado (se usa el registro existente o se avisa si está fuera de su alcance).

Cumple: FUN-58, RF-DIA-02.

### e.3 Asignar un diagnóstico

1. Pestaña **Asignar diagnóstico**. Elija **Empresa \***, **Instrumento \***, **Etapa** (inicial, seguimiento, final o «Automática (inicial → final → seguimiento)») y **Responsable**. Pulse **Asignar**.
2. Debe verse: la empresa recibe la notificación y puede diligenciarlo desde su cuenta; el equipo también puede diligenciarlo con ella (modo asistido).

Cumple: FUN-57, FUN-59, RF-DIA-03.

### e.4 Autodiagnóstico de la empresa

**Quién:** empresa (`empresa2@textiles.test`).

1. Vaya a **Empresas › Mi diagnóstico**. En **Hacer un autodiagnóstico** elija la etapa y pulse **Iniciar** (o abra el diagnóstico asignado).
2. Responda a su ritmo (se guarda solo) y pulse **Enviar**.
3. Debe verse: al enviar, el resultado aparece de inmediato.

Cumple: FUN-60, RF-DIA-04, FUN-69.

### e.5 Ver el resultado

1. Abra el diagnóstico (**Diagnósticos** › clic en la fila).
2. Debe verse: puntaje de 0 a 100, nivel con su color y segmento; radar y barras por dimensión con la tabla de puntos y pesos; hallazgos automáticos (fortaleza, mayor brecha, dimensiones críticas) y recomendaciones del nivel. Pulse **Descargar PDF** para el informe con la marca.
3. La línea de estados muestra asignado → en curso → en revisión → completado. El equipo puede pulsar **Marcar como completado**, **Devolver a la empresa** (con motivo) o **Reabrir revisión**, y cambiar **Etapa y responsable** (**Guardar**). Cada cambio queda en **Historial (auditado)**.

> **Nota:** El cálculo automático está implementado y documentado (`docs/modulos/formularios-diagnostico.md`), pero **FUN-61 está en estado Parcial**: falta contrastarlo con la hoja de cálculo de referencia de Compensar, que aún no se ha entregado.

Cumple: FUN-54, FUN-59, FUN-61 (Parcial), FUN-62, FUN-63, RF-FRM-05, RF-DIA-03, RF-DIA-05, RF-DIA-07.

### e.6 Clasificación y recálculo

1. Pestaña **Instrumentos y clasificación**. Revise los niveles de cada instrumento. Pulse **Editar reglas** para cambiarlos o **Recalcular clasificación** para reclasificar.
2. Debe verse: los diagnósticos ya enviados se reclasifican con las reglas nuevas.

Cumple: FUN-62, RF-DIA-06.

### e.7 Lista y filtros

1. Pestaña **Diagnósticos**: filtre por estado, etapa, nivel, segmento, instrumento y empresa (**Filtrar**).
2. Debe verse: indicadores, gráfico por nivel y **Clasificación por segmento**. El mentor solo ve sus empresas asignadas.

Cumple: FUN-59, FUN-62, RF-ACO-03.

### e.8 Comparación inicial vs. final

1. Pulse **Comparar inicial vs. final** (o **Comparar etapas** en un diagnóstico).
2. Debe verse: para cada empresa, puntaje y nivel antes y después y el cambio por dimensión. Ejemplo demo: La Espiga, 26,7 → 68,4. El equipo ve **Impacto por empresa** y el **Cambio promedio**. **Descargar PDF**.

Cumple: FUN-47, RF-DIA-08, RF-RES-02.

---

## (f) Rutas de acompañamiento

**Quién lo hace:** Mentor (`mentor1@compensar.test`) y Gestor de Mentorías arman y aprueban; la empresa (`empresa1@laespiga.test`) consulta «Mi ruta».

### f.1 Plantillas de ruta

1. Las rutas del catálogo se crean en **Administración › Configuración › Programas y rutas** (capítulo a.2).
2. Sus pasos se definen en **Empresas › Rutas de acompañamiento › Plantillas**: abra la plantilla, llene **Nombre del paso \***, **Tipo**, **Servicio del catálogo**, **Curso / evento**, **Indicador de la etapa** y **Meta \***, y pulse **Agregar paso** o **Guardar paso**.

Cumple: FUN-79, FUN-80, RF-RUT-01, RF-RUT-02.

### f.2 Crear una ruta para una empresa

1. Vaya a **Empresas › Rutas de acompañamiento** y pulse **+ Nueva ruta** (o la pestaña **Nueva ruta**).
2. En **1. Empresa** elija la empresa y pulse **Continuar**.
3. **2b. Desde una plantilla:** elija la plantilla (**Ver etapas**), escriba **Nombre de la ruta**, marque **Aprobar y activar de inmediato** y **Mostrar en el inicio de la empresa al activarla**, y pulse **Crear ruta**. Se arma en menos de 5 minutos.
4. **2a. Recomendación desde el diagnóstico:** la plataforma explica por qué recomienda una plantilla. Pulse **Crear propuesta «…»**. Debe verse: queda como **propuesta**; ninguna ruta recomendada se asigna sin que un mentor la apruebe.

> **Nota:** La recomendación usa reglas. La inteligencia artificial es opcional y viene desactivada; no se entrenan modelos con datos de Compensar.

Cumple: FUN-79, RF-RUT-01, RF-RUT-05, RNF-PRI-07, TEC-81, TEC-82.

### f.3 Ajustar etapas, metas y aprobar

1. Abra la ruta. En **Etapas, servicios y metas** use **Editar etapa (servicio, indicador, línea base, meta)**: **Servicio del catálogo**, **Curso / evento**, **Indicador**, **Línea base**, **Meta \*** y **Fecha objetivo**. Use **+ Agregar etapa**, **↑ Subir**, **↓ Bajar** y **Quitar**.
2. Si es una propuesta, pulse **Aprobar y activar** (con **Mostrar en el inicio de la empresa**) o **Descartar propuesta**.

Cumple: FUN-80, RF-RUT-02, RF-RUT-05.

### f.4 Registrar avance con evidencia

1. En la etapa, pulse **Registrar avance**: elija **Estado**, escriba **Qué se hizo \***, el valor del indicador y adjunte **Evidencia**. Pulse **Guardar avance**.
2. Debe verse: para completar una etapa la evidencia es obligatoria. El avance (% y etapas **Completadas** / **En curso**) y la línea de tiempo se actualizan.

Cumple: FUN-82, RF-RUT-04.

### f.5 La empresa consulta su ruta

1. La empresa va a **Empresas › Mi ruta** (funciona en el celular).
2. Debe verse: ruta activa, % de avance, cada etapa con su servicio o curso, indicador (línea base → actual → meta), fecha objetivo, evidencia e **Historial de la ruta**. Las propuestas no aprobadas no se le muestran.

Cumple: FUN-81, RF-RUT-03, RNF-USA-02.

### f.6 Cerrar o escalar la ruta

1. En la ruta, elija **Cerrar la ruta** o **Cerrar y escalar a una nueva ruta**, el **Resultado**, **Resultado obtenido \*** y, si escala, la **Plantilla de la nueva ruta**. Pulse **Solicitar aprobación**.
2. Otra persona con permiso de aprobar rutas abre **Solicitudes de cierre**, escribe la **Observación de la aprobación** y pulse **Aprobar** o **Rechazar**.
3. Debe verse: quien solicita no puede aprobar su propia solicitud (separación de funciones). Al escalar, la ruta queda *escalada* y se crea la nueva ruta activa.

Cumple: FUN-94, RF-ANA-02, RN-05.

---

## (g) Mentorías y agenda

**Quién lo hace:** Gestor de Mentorías (`gestor@compensar.test`), Mentor (`mentor1@compensar.test`), empresa (`empresa1@laespiga.test`). Prueba de aislamiento con `mentor2@compensar.test`.

### g.1 Asignar mentor

1. Vaya a **Empresas › Empresas**. Marque la empresa (ej.: Textiles del Norte), elija **Mentor…** y pulse **Asignar / reasignar mentor**.
2. Reasigne a otro mentor para ver que se conserva el historial (bloque **Mentor** de la ficha).
3. Debe verse: el mentor y la empresa reciben la notificación por los canales configurados. La asignación queda auditada.

Cumple: FUN-31, FUN-32, RF-ACO-01, RF-ACO-02, RN-10, CU-04.

### g.2 Asignar ruta, curso o servicio

1. En la ficha de la empresa, sección **Rutas, cursos y servicios asignados**, elija **Rutas**, **Servicios** o **Cursos** y pulse **Asignar**.
2. Debe verse: lo asignado aparece en el inicio de la empresa (**Mis servicios, rutas y cursos**).

Cumple: RF-EMP-11, FUN-42, CU-04.

### g.3 El mentor solo ve sus empresas

1. Ingrese como `mentor2@compensar.test`. Abra **Empresas**: la lista está vacía.
2. Pegue el enlace `/empresas/1` en el navegador.
3. Debe verse: la pantalla **Sin acceso**.

Cumple: FUN-33, RF-ACO-03, RN-02, CU-04 (criterio de aceptación).

### g.4 Disponibilidad del mentor

1. Vaya a **Acompañamiento › Mi disponibilidad** (el Gestor y el Coordinador ven «Disponibilidad de mentores» y eligen el **Mentor**).
2. En **Semana tipo** elija días, **Desde**, **Hasta** y **Modalidad**, y pulse **Agregar franja**.
3. Debe verse: no deja guardar franjas cruzadas, de menos de 30 minutos o con horas inválidas. Al lado: **Próximas franjas libres** y **Sesiones programadas**. **Ver en el calendario** abre la agenda.

Cumple: FUN-34, RF-ACO-04 (Parcial).

### g.5 Calendario y consulta de agendas

1. Vaya a **Acompañamiento › Agenda y mentorías**. Use las pestañas **Lista** y **Calendario** (mes o semana).
2. Filtre por mentor, empresa, programa, estado y fechas (**Desde**, **Hasta**) y pulse **Consultar**.
3. Debe verse: las sesiones por color de estado y las franjas libres del mentor. El Gestor ve todo su programa; el mentor, lo suyo; la empresa, lo suyo.

Cumple: FUN-34, FUN-44, RF-ACO-04 (Parcial), RF-ACO-10.

### g.6 Programar una sesión (mentor o gestor)

1. En **Agenda y mentorías**, formulario de programación: **Empresa**, **Mentor**, **Servicio remitido (opcional)**, **Fecha y hora (Colombia)**, **Duración (min)**, **Modalidad** y **Tema**. Pulse **Programar**.
2. Debe verse: si se cruza con otra sesión del mentor, se bloquea; si queda fuera de su disponibilidad, se programa con advertencia (y el mentor recibe aviso). Los participantes reciben la notificación con la invitación de calendario `.ics`. En el detalle está el botón **Agregar a calendario (.ics)** (con ícono de calendario) y el estado de sincronización con Outlook.

> **Nota:** La sincronización con el Outlook real de los mentores necesita que Compensar registre la aplicación en su Entra ID y entregue credenciales. Mientras tanto se envía la invitación `.ics`. **RF-ACO-04 está en estado Parcial** por esta razón.

Cumple: FUN-34, FUN-35, RF-ACO-04 (Parcial), RF-ACO-05, CU-04.

### g.7 La empresa agenda con su mentor

1. La empresa va a **Acompañamiento › Agenda y mentorías**, sección **Programar una sesión con mi mentor**.
2. Elija la **Franja disponible (hora Colombia, 60 min)**, **Tema** y **Modalidad**, y pulse **Programar sesión**.
3. Debe verse: solo aparecen franjas libres de su mentor asignado o del mentor de una remisión aceptada. Ambos reciben la invitación `.ics`.

Cumple: FUN-35, RF-ACO-05.

### g.8 Reprogramar y cancelar

1. Abra la sesión. Para reprogramar elija **Nueva fecha y hora** (la empresa elige **Nueva franja**), escriba el **Motivo** y pulse **Reprogramar**.
2. Para cancelar escriba el **Motivo de la cancelación** y pulse **Cancelar sesión**.
3. Debe verse: el motivo es obligatorio; los participantes reciben el aviso con plantilla aprobada; los recordatorios se recalculan.

Cumple: FUN-35, FUN-45, RF-ACO-05, RF-ACO-11.

### g.9 Recordatorios de sesión

1. No requiere acción: el sistema avisa 24 horas y 1 hora antes, por correo, SMS y WhatsApp, sin duplicar.
2. Verifique en la campana **Notificaciones**.

Cumple: FUN-45, RF-ACO-11, RF-NOT-03.

### g.10 Registrar el seguimiento

**Quién:** mentor de la sesión.

1. En la sesión, sección **Seguimiento**, llene **Temas tratados \***, **Compromisos**, **Resultados** y **Horas ejecutadas**. Pulse **Registrar sesión realizada**.
2. En **Indicadores de la empresa** puede usar **Registrar avance en esta sesión** (la sesión queda como soporte).
3. Debe verse: la sesión queda «realizada» y «Pendiente de aceptación de la empresa». Las sesiones vencidas sin seguimiento se marcan y generan alerta (capítulo (k)).

Cumple: FUN-36, FUN-84, RF-ACO-06, RF-GSV-02, CU-04.

### g.11 Compartir documentos

1. En **Documentos compartidos (OnBase)** elija **Archivo (xlsx, doc, pptx, pdf, jpg, png · ≤20 MB)** y **Tipo** (por ejemplo **Hoja de ruta** o **Carta de compromiso**). Pulse **Subir**. Prueba: `demo/hoja-de-ruta.pdf`.
2. Debe verse: el documento con **Ref. OnBase**, **Subido por** y su aceptación. Formatos no permitidos, archivos de más de 20 MB o infectados se rechazan con mensaje claro.

> **Nota:** OnBase funciona en modo simulado (almacén cifrado con referencia `ONB-*` y cola de reintentos) hasta tener la API y el ambiente de Compensar. **RF-DOC-01 está en estado Parcial**.

Cumple: FUN-37, RF-ACO-08, RF-ACO-12, RF-DOC-01 (Parcial), RF-DOC-02, RF-DOC-03, TEC-60, CU-04.

### g.12 Aceptación por clic de la empresa

**Quién:** empresa (`empresa1@laespiga.test`).

1. Abra la sesión desde **Agenda y mentorías**. Lea «Confirma que la sesión se realizó como se describe…» y pulse **Aceptar sesión**.
2. En **Documentos compartidos (OnBase)** pulse **Aceptar** en cada documento.
3. Debe verse: «✓ Aceptada por la empresa» con usuario, fecha, hora e IP. Sin aceptación, la sesión **no cuenta** para el soporte de pagos.

> **Nota:** En pruebas locales la IP aparece como `::1`; en el despliegue real es la IP del usuario.

Cumple: FUN-37, RF-ACO-07, RF-ACO-08, RF-DOC-04, CU-04.

### g.13 Mensajes mentor–empresa

1. Vaya a **Acompañamiento › Mensajes**. Elija la conversación, escriba en **Escribe tu mensaje…** y pulse **Enviar**.
2. Debe verse: el otro recibe aviso por correo, SMS o WhatsApp; cada mensaje muestra el estado de entrega por canal y si fue leído («No leído»). El Gestor ve los hilos de su alcance en solo lectura.

Cumple: FUN-91, RF-ALE-05, RF-ACO-12.

### g.14 Historial del acompañamiento

1. En la ficha de la empresa, sección **Línea de tiempo del acompañamiento**. Pulse **Línea de tiempo → PDF**.
2. Debe verse: todo el historial (asignaciones, sesiones, documentos, remisiones, indicadores).

Cumple: FUN-38, RF-ACO-09, CU-04.

### g.15 Vista por rol de servicios, sesiones y documentos

1. La empresa ve en su inicio **Mi mentor**, **Próximas sesiones**, **Mis servicios, rutas y cursos**, **Mensajes sin leer** y en **Mis documentos** sus archivos. El mentor y el aliado ven lo suyo en **Agenda y mentorías**, **Remisiones a aliados** y **Centro documental**.

Cumple: FUN-42, RF-SRV-04, RF-EMP-11.

---

## (h) Servicios con aliados

**Quién lo hace:** Gestor de Mentorías o Mentor (remite), empresa (acepta), Coordinador de aliado `coord@crecer.test` (asigna), Mentor del aliado `mentor@crecer.test` (registra sesiones y horas).

### h.1 Remitir la empresa a un servicio

1. Vaya a **Acompañamiento › Remisiones a aliados**.
2. En **Remitir empresa a un servicio especializado** elija **Empresa** y **Servicio (catálogo)** (ej.: «Mentoría en estrategia comercial», Fundación Crecer). Pulse **Remitir**.
3. Debe verse: la remisión en estado «enviada». Estados: enviada → aceptada → en curso → cerrada (o rechazada).

Cumple: FUN-39, FUN-41, RF-SRV-01, RF-SRV-03, CU-05.

### h.2 La empresa acepta

1. La empresa va a **Acompañamiento › Remisiones a aliados** y pulsa **Aceptar** (o **Rechazar**).
2. Debe verse: la remisión «aceptada» con la aceptación de la empresa registrada.

Cumple: FUN-39, RF-SRV-01, CU-05.

### h.3 El coordinador asigna a su mentor

1. `coord@crecer.test` va a **Remisiones a aliados**, elige **Mentor…** (ej.: «Manuel Mentor Aliado») y pulsa **Asignar**.
2. Debe verse: el coordinador solo ve las remisiones y los mentores de su aliado. Los mentores de otro aliado no ven la remisión.

Cumple: FUN-40, RF-SRV-02, RF-PAR-05, RN-02, CU-05.

### h.4 Sesiones y horas del aliado

1. `mentor@crecer.test` va a **Agenda y mentorías**, programa las sesiones eligiendo el **Servicio remitido (opcional)** (paso g.6) y registra el seguimiento y las **Horas ejecutadas** de cada una (paso g.10).
2. La empresa acepta las sesiones (paso g.12). En la demo acepta solo 2 de 3.
3. Debe verse: las horas no aceptadas no suman.

Cumple: RF-SRV-05, RF-ACO-07, CU-05.

### h.5 Consulta y exportación por empresa

1. En la ficha de la empresa, sección **Exportar resultados e historial de servicios**, elija **Desde**, **Hasta**, **Formato** (**Excel (.xlsx)** o CSV) y **Sección (solo CSV)**. Pulse **Descargar**.
2. Debe verse: servicios y remisiones, sesiones con horas y aceptación, indicadores, mediciones y cierres del periodo. La descarga queda auditada.

Cumple: FUN-43, RF-SRV-06, FUN-92.

---

## (i) Resultados, cierres e impacto

**Quién lo hace:** Gestor de Mentorías (`gestor@compensar.test`) define, consolida y aprueba; Mentor y empresa registran avances; Gestor de Contenidos administra la biblioteca.

### i.1 Definir indicadores de gestión e impacto

1. Vaya a **Control › Indicadores › pestaña Definiciones**.
2. Llene **Nombre del indicador \***, **Unidad de medida \***, **Tipo** (gestión o impacto), **Aplica a** (**Todo un programa** o **Un servicio del catálogo**), **Programa (si aplica a programa)**, **Servicio (si aplica a servicio)**, **Línea base por defecto**, **Meta por defecto**, **Periodicidad de medición** y **Fórmula o forma de medición**. Pulse **Crear indicador**.
3. Edite con **Editar** → **Guardar cambios**; use **Desactivar** / **Activar**.

Cumple: FUN-67, FUN-83, RF-SEG-02, RF-GSV-01.

### i.2 Aplicar indicadores a empresas

1. Pestaña **Aplicar a empresas**: elija **Indicador \***, **Línea base** y **Meta**; marque **Aplicar a todas las empresas activas del programa…** u **O selecciona empresas**. Pulse **Aplicar indicador**.
2. También desde la ficha de la empresa, sección **Indicadores (línea base vs. resultado)**: **Indicador**, **Línea base**, **Meta**, **Resultado** → **Agregar** (ej.: línea base 10, meta 15, resultado 14).
3. Debe verse: no se duplica si la empresa ya lo tiene.

Cumple: FUN-80, FUN-83, RF-GSV-01, CU-06.

### i.3 Registrar avances

1. En **Indicadores**, pulse **Ver / registrar** en un indicador. En **Registrar avance** llene **Indicador \***, el valor, **Nota / soporte \***, **Sesión de mentoría o consultoría (opcional)** y la evidencia. Pulse **Registrar avance**.
2. Para cambiar la meta: **Ajustar línea base y meta** (**Meta \***, **Línea base**, **Motivo**) → **Guardar**. Queda auditado.
3. Debe verse: el avance en **Historial de avances** y en **Evolución en el tiempo**. Lo pueden registrar el mentor, el equipo administrativo o la empresa.

Cumple: FUN-84, RF-GSV-02, FUN-68.

### i.4 Tablero de avances

1. Pestaña **Tablero de avances**: filtre por programa, servicio, empresa y tipo.
2. Debe verse: **Cumplimiento promedio**, **Metas alcanzadas**, **Evolución del cumplimiento** mensual, cumplimiento por programa, servicio y empresa, y **Últimos avances**. **Exportar Excel**.

Cumple: FUN-67, FUN-68, RF-SEG-02, RF-SEG-03.

### i.5 Consolidar y aprobar el cierre

1. Vaya a **Acompañamiento › Resultados y cierres**.
2. En **Consolidar resultados de una empresa** elija **Empresa** y **Servicio remitido (opcional)**. Pulse **Consolidar**.
3. Debe verse: el resultado consolidado con indicadores al inicio frente al final.
4. Pulse **Aprobar cierre**.
5. Debe verse: estado «aprobado» y **Aprobado por**. Un cierre aprobado **impide programar nuevas sesiones** de ese servicio. Quien registró horas de ese servicio no puede aprobar su cierre.

Cumple: FUN-46, FUN-47, RF-RES-01, RF-RES-02, RN-05, CU-06.

### i.6 Encuestas de satisfacción

1. No requiere acción: al aprobar un cierre, cerrar una remisión o terminar un evento con asistentes, se envía la encuesta. **Enviar pendientes ahora** lo hace de inmediato.
2. La empresa abre el enlace (sin iniciar sesión, apto para celular), responde las 4 preguntas y pulsa **Enviar respuesta**. Solo puede responder una vez.
3. Vaya a **Acompañamiento › Encuestas de satisfacción**. Pestaña **Resultados**: **NPS**, **Satisfacción promedio**, distribución y **Resultados por aliado**, **por servicio** y **por evento o curso**. Pestaña **Análisis de comentarios**: **Temas más mencionados (frases)** y **Palabras más mencionadas**.
4. En la lista de envíos use **Reenviar aviso**. **Exportar Excel**.

Cumple: FUN-85, FUN-95, RF-GSV-03, RF-ANA-03.

### i.7 Biblioteca de contenidos

1. Vaya a **Acompañamiento › Biblioteca**. Gestor de Contenidos: llene **Título \***, **Tipo** (**Documento / guía**, **Video**, **Enlace / base de conocimiento**, **Herramienta / plantilla**), **Programa**, **Servicio (opcional)**, **Etiquetas**, **Enlace o video (https://…)** o archivo, y **Descripción**. Pulse **Publicar**. Use **Retirar** / **Publicar** para ocultar o mostrar.
2. Empresas y mentores buscan con **Buscar** y filtran por **Programa**, **Servicio** y **Tipo**.

Cumple: FUN-86, RF-GSV-04.

### i.8 Informe final de la empresa

1. Vaya a **Acompañamiento › Informes finales** (la empresa: **Mi informe final**) y pulse **Ver informe**, o use **Informe final** en la ficha.
2. El equipo escribe **Conclusiones** y **Recomendaciones (una por línea)** y pulsa **Guardar**.
3. Pulse **Descargar PDF** (elija «Guardar como PDF»).
4. Debe verse: informe con la marca: resultados y cierres, **Indicadores: antes y después**, **Diagnóstico inicial frente a final**, **Servicios recibidos**, **Sesiones de mentoría aceptadas**, **Capacitaciones y eventos** y recomendaciones. La empresa lo descarga.

Cumple: FUN-43, FUN-93, RF-ANA-01.

### i.9 Hoja de ruta en PDF

1. En la ficha de la empresa pulse **Hoja de ruta** (o desde **Seguimiento y alertas**).
2. Pulse **Descargar PDF**.
3. Debe verse: documento con la marca: equipo de acompañamiento, ruta y etapas, servicios, sesiones y compromisos, tareas abiertas e indicadores.

Cumple: FUN-92, RF-ALE-06.

---

## (j) Soporte de pagos

**Quién lo hace:** Aprobador de pagos (`pagos@compensar.test`). Es un **soporte** para el pago a los aliados: no es facturación electrónica ni se conecta al ERP (fuera de alcance según el Anexo 05).

### j.1 Revisar el reporte del aliado

1. Vaya a **Control › Soporte de pagos**.
2. Elija **Aliado** (ej.: Fundación Crecer) y **Periodo** (mes) y pulse **Ver reporte**.
3. Debe verse: **Sesiones aceptadas**, **Horas aceptadas**, **Costo interno (informativo)** y **Estado**. En la tabla, la columna **¿Cuenta?** indica si cada sesión cuenta. La sesión que la empresa no aceptó aparece resaltada y **no cuenta**.

Cumple: FUN-48, RF-RES-03, RF-ACO-07, RF-SRV-05, CU-05.

### j.2 Descargar y comparar

1. Pulse **Descargar Excel** (reporte R-09).
2. Debe verse: el Excel trae las mismas sesiones y totales que la pantalla.

Cumple: RF-RES-03, RF-RES-05, CU-05 (criterio de aceptación).

### j.3 Aprobar con separación de funciones

1. Pulse **Aprobar reporte como soporte de pago**.
2. Debe verse: el reporte queda aprobado con quién y cuándo.
3. Separación de funciones: quien registró horas de esas sesiones **no puede** aprobarlas; quien aprobó el cierre de un servicio no puede aprobar su pago. Para verlo en pantalla: como Administrador, en **Usuarios › Agregar rol adicional a un usuario (roles combinados)** dé a `mentor@crecer.test` el rol Aprobador de pagos con alcance organización; al intentar aprobar un reporte con horas que él registró, la plataforma lo rechaza.

> **Nota:** La separación de funciones se verificó en pantalla durante el ensayo de la demostración (el mentor del aliado con rol de Aprobador de pagos recibe «Separación de funciones: registraste horas de este reporte, no puedes aprobar su pago») y además está cubierta por la prueba automática `tests/separacion-funciones.test.ts` (capítulo (m)).

Cumple: FUN-48, RF-RES-03, RN-05, CU-05.

---

## (k) Seguimiento y alertas

**Quién lo hace:** Gestor de Mentorías (`gestor@compensar.test`) y Administrador; el mentor y el coordinador ven su alcance.

### k.1 Estado general

1. Vaya a **General › Seguimiento y alertas › pestaña Estado general**. Filtre por **Programa**.
2. Debe verse: en una sola vista, **Empresas activas**, **Sesiones realizadas**, **Sesiones vencidas**, **Remisiones abiertas**, **Tareas abiertas**, y las tablas **Por programa**, **Por mentor** y **Por empresa** (sesiones, remisiones, rutas, tareas e indicadores). Desde cada empresa hay enlace a **Hoja de ruta**.

Cumple: FUN-87, RF-ALE-01.

### k.2 Semáforo de empresas

1. Pestaña **Semáforo de empresas**. Filtre por **Color** (Rojo, Amarillo, Verde) y **Programa**.
2. Debe verse: rojo = al menos una alerta crítica (retraso ≥ 2 veces el umbral); amarillo = alertas de riesgo; verde = sin alertas abiertas.

Cumple: FUN-89, RF-ALE-03.

### k.3 Reglas de alerta

1. Pestaña **Reglas de alerta**. En cada regla ajuste **Umbral (días)**, **Responsable**, **Canal** y **Regla activa**. Pulse **Guardar regla**.
2. Pulse **Ejecutar alertas ahora** (también corre sola cada hora).
3. Debe verse: alertas por sesión sin seguimiento, sesión vencida, sesión sin aceptación, empresa sin actividad, meta o etapa vencida, indicador atrasado, tarea vencida y solicitud de información vencida. No se duplican y se cierran solas cuando desaparece la causa. El responsable recibe aviso por el canal de la regla.

Cumple: FUN-88, RF-ALE-02, RF-ACO-06.

### k.4 Atender alertas

1. Pestaña **Alertas**. Filtre por **Estado**, **Severidad**, **Regla**, programa o **Solo las mías**.
2. Escriba la **Acción tomada** y pulse **Marcar atendida**.
3. Debe verse: la alerta atendida con quién y qué hizo (auditado). **Alertas (Excel)** descarga la lista.

Cumple: FUN-88, FUN-89, FUN-92.

### k.5 Tareas y evidencias operativas

1. Vaya a **General › Tareas**. En **Nueva tarea o actividad** llene **Título \***, **Responsable**, **Vence \***, **Empresa (opcional)**, **Programa (si es general)** y **Descripción**. Pulse **Registrar tarea**.
2. Use las pestañas **Abiertas**, **Mías**, **Vencidas**, **Terminadas** y **Todas**. Adjunte el **Archivo de evidencia** con **Subir** y actualice el estado con **Guardar**.
3. Debe verse: el responsable recibe aviso; las tareas vencidas generan alerta. **Exportar Excel**.

Cumple: FUN-90, RF-ALE-04, FUN-92.

---

## (l) Reportes y analítica

**Quién lo hace:** Administrador (`admin@compensar.test`) ve todo; Gestor, Auxiliar, Coordinador de aliado (`coord@crecer.test`), Aprobador y Auditor ven su alcance.

### l.1 Reportes R-01 a R-15

1. Vaya a **Control › Reportes**. Elija el periodo y pulse **Aplicar periodo**.
2. En cada reporte pulse **Vista previa** o descargue en **Excel**, **CSV**, **JSON** o **PDF** (vista imprimible con la marca).
3. Debe verse: cada reporte sale en segundos (menos de 1 s en pruebas). Cada rol ve solo los reportes y datos de su alcance (el Gestor ve los suyos).

| Reporte | Contenido |
|---|---|
| R-01 Empresas registradas | Por programa, estado, sector, tamaño y ubicación |
| R-02 Empresas direccionadas a servicios | Por servicio, aliado y estado de la remisión |
| R-03 Información de cada servicio | Horas y sesiones previstas vs. ejecutadas, costo interno |
| R-04 Inscritos y asistentes a capacitaciones | Inscritos, asistentes, % de asistencia y certificados |
| R-05 Mentorías por mentor | Sesiones realizadas, aceptadas y pendientes |
| R-06 Diagnósticos realizados | Empresa, etapa, puntaje, nivel, segmento y fecha |
| R-07 Proveedores que atienden a las empresas | Aliados, empresas atendidas y servicios |
| R-08 Costos asociados a los servicios | Costo interno por servicio, aliado y periodo |
| R-09 Servicios prestados por aliado (soporte de pago) | Sesiones aceptadas y horas por aliado |
| R-10 Impacto | Línea base vs. resultado por empresa e indicador |
| R-11 Notificaciones | Enviadas, entregadas, leídas y fallidas por canal |
| R-12 Auditoría | Acciones por usuario, entidad y periodo |
| R-13 Validación de requisitos | Casos por estado, responsable, días en trámite y decisión |
| R-14 Seguimiento de empresas | Mentor, servicios, sesiones, ruta, diagnóstico, indicadores, alertas, cierre y semáforo |
| R-15 Satisfacción (encuestas) | NPS, satisfacción y comentarios |

Cumple: FUN-49, FUN-96, FUN-100, RF-RES-04, RF-RES-05, RF-ANA-04, RF-ANA-08, CU-06.

### l.2 Analítica

1. Vaya a **General › Analítica y tableros**.
2. Use los filtros **Programa**, **Convocatoria / evento**, **Mentor / asesor**, **Aliado** y el periodo (**Quitar filtros** los limpia).
3. Debe verse: embudo de empresas, sesiones por estado y por mes, asistencia a eventos, servicios por aliado, impacto, diagnósticos por nivel, validación por estado, alertas abiertas, NPS e histórico. La página se actualiza sola cada 60 s (**Pausar** / **Reanudar**). **Exportar a PDF** imprime el tablero. **Ver datos y exportar →** abre los datos de cada gráfico.
4. Con `coord@crecer.test` debe verse solo lo de su aliado (seguridad a nivel de fila).

Cumple: FUN-68, FUN-98, RF-ANA-06, TEC-92, TEC-95, TEC-97.

### l.3 Tableros configurables

1. En **Analítica y tableros** pulse **Tableros configurables**. Escriba **Nombre del tablero**, elija **Comenzar desde** (vacío, plantilla operativa o estratégica) y pulse **Crear tablero**.
2. Pulse **Editar tablero** → **Agregar widget**: **Fuente de datos**, **Tipo**, **Cálculo**, **Agrupar por**, filtros y **Ancho**. Pulse **Agregar al tablero**.
3. Marque **Compartir con usuarios de analítica** y pulse **Guardar tablero**. **Terminar edición**.
4. Debe verse: el tablero se refresca cada 30 s. Un tablero compartido muestra a cada persona solo sus datos. **Copiar a mis tableros** duplica uno compartido.

Cumple: FUN-97, RF-ANA-05, TEC-96.

### l.4 Constructor de consultas

1. Pulse **Constructor de consultas**. Siga los pasos: **1. Fuente de datos**, **2. Columnas**, **3. Filtros**, **4. Programa, convocatoria, mentor, aliado y periodo**, **5. Agrupación y orden (opcional)**.
2. Pulse **Ver vista previa**. Escriba **Guardar como** y pulse **Guardar consulta**, o **Llevar a tablero**.
3. Exporte en **Excel**, **CSV**, **JSON** o **PDF**.
4. Debe verse: las consultas guardadas en **Mis consultas guardadas**, con sus botones de exportación.

Cumple: FUN-98, FUN-100, RF-ANA-06, RF-ANA-08, TEC-93.

### l.5 Conexión con Power BI

1. Pulse **Conexión Power BI**. Siga los **Pasos en Power BI Desktop**.
2. El administrador crea un cliente con alcance `bi.read` en **Integraciones y API › Clientes API** (capítulo (n)).
3. Debe verse: los **Conjuntos publicados** (`/api/bi/...`) en CSV o JSON, con el alcance del token. La auditoría no se publica a BI; cada lectura queda auditada.

Cumple: FUN-97, RF-ANA-05, TEC-94, TEC-95.

### l.6 Trazabilidad de punta a punta

1. Vaya a **General › Trazabilidad**, busque la empresa (o pulse **Trazabilidad completa** en la ficha).
2. Filtre por etapa, caso, texto (**Texto, usuario…**) y fechas.
3. Debe verse: una sola línea de tiempo con vinculación, validación, diagnóstico, rutas, mentor, remisiones (con aceptación), sesiones (con aceptación: usuario, fecha, IP), eventos y certificados, documentos OnBase, indicadores, cierres, encuestas, alertas y tareas. **Exportar línea de tiempo** (Excel, CSV, JSON, PDF) y **Línea de tiempo → PDF**.

Cumple: FUN-38, FUN-99, RF-ANA-07, RF-RES-04.

### l.7 Centro documental

1. Vaya a **Acompañamiento › Centro documental** (empresa: **Mis documentos**).
2. Filtre por nombre, empresa, proceso, tipo, **Estado en OnBase**, aceptación (**Sin aceptar**), **Referencia OnBase** y fechas.
3. Pulse **Ver** para abrir PDF e imágenes dentro de la plataforma; los archivos de Office se descargan (**Descargar**).
4. Debe verse: quién subió cada documento y su aceptación (usuario, fecha, IP). Cada consulta o descarga queda auditada. Exportación del listado en 4 formatos.

Cumple: FUN-42, FUN-65, RF-SEG-01, RF-DOC-04, FUN-100.

### l.8 Exportar en cuatro formatos

1. En reportes, consultas, trazabilidad, centro documental y listas (eventos, empresas, agenda), use el grupo **Exportar**: **Excel**, **CSV**, **JSON**, **PDF**.
2. Debe verse: el archivo con los filtros aplicados y solo los datos de su alcance.

Cumple: FUN-100, RF-ANA-08, RF-INT-06.

---

## (m) Auditoría y control

**Quién lo hace:** Auditor (`auditor@compensar.test`) y Administrador.

### m.1 Registro de auditoría inalterable

1. Vaya a **Control › Auditoría**.
2. Filtre por **Usuario**, **Acción**, **Todas las entidades** y fechas. Pulse **Filtrar**.
3. Debe verse: **Fecha**, **Usuario**, **Acción**, **Entidad**, **Antes → Después** e **IP** (y navegador) de cada acción de los procesos anteriores. Arriba dice «Inalterable: ningún rol ni el proveedor puede editar o borrar registros». No hay botón para editar ni borrar; la base de datos lo impide con disparadores (triggers).
4. Pulse **Exportar Excel**.

Cumple: FUN-64, FUN-66, RF-AUD-01, RF-AUD-02, RN-10, RNF-OBS-01/03, TEC-72, TEC-74, CU-06.

### m.2 Notificaciones con estado

1. Haga clic en la campana (arriba a la derecha) → **Notificaciones**.
2. Debe verse: cada mensaje con **Fecha**, **Canal** (correo, SMS, WhatsApp), **Destinatario**, **Mensaje** y **Estado** (enviado, entregado, leído, fallido). Abrir la bandeja marca los correos como leídos.
3. El reporte **R-11 Notificaciones** resume por canal.

> **Nota:** Los proveedores de correo, SMS y WhatsApp son simulados hasta que Compensar los contrate.

Cumple: FUN-27, FUN-45, FUN-70, RF-NOT-01, RF-NOT-03, RF-EMP-05.

### m.3 Pruebas automáticas

**Quién:** equipo técnico.

1. En la carpeta del proyecto ejecute `npm test`.
2. Debe verse: las pruebas pasan. Verifican:
   - `tests/permisos.test.ts`: las 852 combinaciones rol × permiso (12 roles × 71 permisos) contra la matriz aprobada `docs/matriz-permisos-aprobada.json`; falla si alguna cambia sin aprobación.
   - `tests/aislamiento.test.ts`: ningún usuario demo ve datos fuera de su alcance, ni por enlace directo; roles combinados suman permisos.
   - `tests/separacion-funciones.test.ts`: quien registró horas no aprueba el pago ni el cierre; quien aprobó el cierre no aprueba el pago.
   - `tests/plataforma.test.ts`: bloqueo de códigos, contactos multiempresa, importación, cargue de 300 filas, catálogo y marca.
3. Para aprobar un cambio de permisos: `npm run aprobar-permisos`.

> **Nota:** Las pruebas cubren la parte de código de las buenas prácticas (TEC-105/106, **Parcial**); SAST y la política de desarrollo seguro son proceso del proveedor.

Cumple: RF-ACC-07, RN-02, RN-04, RN-05, RF-ACO-03, TEC-105/106 (Parcial).

---

## (n) Integraciones y técnica (para TI)

**Quién lo hace:** Administrador (`admin@compensar.test`) en **Administración › Integraciones y API**, y el equipo de TI de Compensar.

> **Nota:** Todas las integraciones pasan por adaptadores del servidor; ninguna credencial llega al navegador. IAM/SSO, OnBase, Gestión de Clientes, Microsoft 365 y correo/SMS/WhatsApp operan en modo simulado hasta recibir credenciales y ambientes de prueba de Compensar. La conexión a esos ambientes es un **compromiso del proveedor** al iniciar la implementación (RF-INT-07).

### n.1 API REST y documentación

1. Pestaña **Clientes API** › **Nuevo cliente API**: **Nombre del sistema \***, **Descripción**, **Scopes \***, **Alcance**, **BI: limitar a programa**, **BI: limitar a aliado**. Pulse **Crear cliente**.
2. Debe verse: «Copia ahora el secreto — no se volverá a mostrar». Puede **Rotar secreto** o **Revocar** / **Reactivar**.
3. Pida un token (OAuth 2.0 client credentials) en `/api/oauth/token` y consuma `/api/v1/empresas`, `/eventos`, `/inscripciones`, `/servicios`, `/sesiones`, `/remisiones`, `/auditoria`.
4. Abra **Documentación API** (`/api-docs`) o el contrato `/api/openapi.json` (OpenAPI 3.1).
5. Debe verse: respuestas paginadas; sin el scope `pii.read` los datos personales salen enmascarados; cada llamada queda registrada.

Cumple: RF-INT-01, RF-INT-02, TEC-33, TEC-34, TEC-102, TEC-32/35 (Parcial: conexión al API Manager en despliegue).

### n.2 Webhooks firmados

1. Pestaña **Webhooks** › **Nuevo webhook**: **URL de destino \*** y **Eventos \*** (inscripción, asistencia, certificado, activación, sesión aceptada, cierre). Pulse **Crear webhook**.
2. Pulse **Probar**. En la demo use como destino `/api/webhooks/demo?id=<id del webhook>`.
3. Debe verse: en **Historial de entregas** cada envío con su estado; los fallidos se reintentan con espera creciente; **Reintentar** lo fuerza. Cada envío lleva firma HMAC (`X-Signature`) e identificador para no procesar dos veces.

Cumple: RF-INT-05, RF-INT-03.

### n.3 Colas, OnBase y circuit breakers

1. Pestaña **Colas e integraciones**: vea **Cola de reintentos**, **Circuit breakers** y **Registro de intercambios (sin datos sensibles)**.
2. Pulse **Simular caída de OnBase** y suba un documento (paso g.11). Debe verse: el documento queda «en cola» y no se pierde. Pulse **Restablecer OnBase** y **Reintentar cola ahora**: el documento llega con su referencia.

Cumple: RF-INT-03, RF-INT-04, RF-DOC-01 (Parcial), TEC-37, TEC-60.

### n.4 Procesos por lotes

1. Pestaña **Procesos por lotes**: cada proceso con su estado y **Últimas ejecuciones**. Pulse **Ejecutar ahora** en cualquiera.
2. Debe verse: recordatorios de eventos y sesiones, certificados automáticos, alertas, encuestas, validación, cargues, reintentos OnBase y webhooks, detección de anomalías, limpieza y anonimización.

Cumple: TEC-36, RNF-REN-07, RNF-PRI-05.

### n.5 Seguridad

1. Pestaña **Seguridad**: **Cierre por inactividad (minutos)**, **Anonimizar invitaciones no aceptadas tras (días)**, límites de intentos por IP y por cuenta, y umbral de alerta. Pulse **Guardar**.
2. Sección **SSO corporativo (IdP)**: **Proveedor**, **Issuer (https)**, **client_id**, **client_secret**, **Claim de grupos**, **Duración máxima de la sesión SSO (h)** y **Mapeo de grupos del IAM a roles (JSON)**. Pulse **Probar ingreso SSO** y **Guardar SSO**.
3. Debe verse: **Eventos de seguridad recientes**. LDAP directo no se implementa por diseño (se federa por el IdP).
4. Pestaña **Errores técnicos**: errores con identificador de traza, sin datos personales. **Registrar error de prueba**.

Cumple: RF-ACC-02, RF-ACC-10, RN-07, RN-09, RNF-SEG-03, RNF-OBS-02, RNF-OBS-05, TEC-2/4, TEC-5 (compromiso: no se implementa por diseño), TEC-7 (Parcial), TEC-73, TEC-78/80 (Parcial), TEC-104.

### n.6 Estado y salud de la plataforma

1. Abra `/estado` (pública, sin datos personales): estado general, base de datos, procesos por lotes, colas, API e integraciones. Se actualiza cada 15 s.
2. Para monitoreo: `/api/health` (salud) y `/api/metrics` (formato Prometheus).

Cumple: RNF-OBS-07, TEC-41, TEC-76/77 (Parcial: trazas OpenTelemetry pendientes).

### n.7 Exportación total y datos personales

1. Pestaña **Exportación total**: **Descargar .xlsx** (una hoja por tabla) o **Descargar .json**. Solo el Administrador; cada descarga queda en **Exportaciones realizadas** y en la auditoría.
2. Pestaña **Datos personales**: inventario Ley 1581 generado del esquema vivo (tabla, campos, finalidad, retención, medidas).

Cumple: TEC-89, TEC-91, RNF-PRI-02, RNF-PRI-06 (Parcial: el borrado certificado es contractual), RF-INT-06.

### n.8 Agrupación de requisitos técnicos (TEC)

| Tema | TEC | Estado según la matriz | Dónde se demuestra |
|---|---|---|---|
| Identidad propia, SSO, MFA | 1, 2, 4, 6 | Cumple | 1.4, 1.5, 1.8, n.5 |
| SAML / OAuth / OIDC | 3 | Parcial | 1.4, n.5 |
| LDAP | 5 | Compromiso del proveedor | n.5 |
| Anti-bots | 7 | Parcial | 1.4, n.5 |
| Administración autónoma y delegada | 8, 9 | Cumple | a.8, a.9 |
| Navegadores y WCAG | 10, 15 | Parcial | 1.1 |
| Responsive | 11 | Cumple | 1.1, f.5 |
| Notificaciones propias o de Compensar | 12 | Cumple | a.6, m.2, n.2 |
| App móvil / offline | 13, 14 | Compromiso del proveedor | — (web responsive) |
| Sin plugins | 16 | Cumple | 1.1 |
| Roadmap, mantenimiento, versiones, IPv6 | 17–21 | Compromiso del proveedor | — |
| TLS / HTTPS | 22 | Parcial | n.5 |
| Ambientes, nube, tenencia, HA, autoescalado | 23–31, 38 | Compromiso del proveedor | — |
| ETL / ESB | 32, 35 | Parcial | n.1, l.5 |
| API REST y OpenAPI | 33, 34 | Cumple | n.1 |
| Procesos por lotes | 36 | Cumple | n.4 |
| Circuit breakers | 37 | Cumple | n.3 |
| Desempeño | 39, 40 | Parcial | b.6, l.1 |
| Disponibilidad en tiempo real | 41 | Cumple | n.6 |
| SLA, DRP, RTO/RPO, BCP, respaldos | 42–54 | Compromiso del proveedor | — |
| WAF / anti-DDoS | 55, 56 | Parcial | n.5 |
| Antivirus de adjuntos | 57 | Parcial | b.13, g.11 |
| Cifrado en reposo | 58 | Parcial | n.3 |
| Sanitización | 59 | Cumple | d.3 |
| Adjuntos fuera de la BD | 60 | Cumple | g.11, n.3 |
| Controles, hardening, pentest, auditorías TI | 61–71 | Compromiso del proveedor | — |
| Logs administrativos y consulta | 72, 74 | Cumple | m.1 |
| Logs técnicos | 73 | Cumple | n.5 |
| Envío a SIEM | 75 | Cumple | n.1 (`/api/v1/auditoria`) |
| Observabilidad corporativa | 76, 77 | Parcial | n.6 |
| Anomalías y alertas | 78, 80 | Parcial | n.5 |
| Acceso a componentes | 79 | Compromiso del proveedor | — |
| IA | 81, 82 | Cumple | f.2 |
| Stack, BD, control de versiones, SO | 83–86 | Compromiso del proveedor | README |
| Capas separadas | 87 | Cumple | n.1 |
| Modelo de datos | 88 | Cumple | `docs/MODELO-DATOS.md` |
| Exportación total | 89 | Cumple | n.7 |
| Borrado seguro | 90 | Compromiso del proveedor | — |
| Objetos con datos personales | 91 | Cumple | n.7 |
| BI y reportes | 92–98 | Cumple | l.1–l.5 |
| Manuales, catálogo de roles, catálogo de interfaces | 99, 101, 102 | Cumple | este manual, `docs/CATALOGO-ROLES.md`, n.1 |
| Buenas prácticas (parte de código) | 105, 106 | Parcial | m.3 |
| Desarrollo seguro, ISO 27001, SAST | 100, 103, 105, 106 | Compromiso del proveedor | — |
| Timeout por inactividad | 104 | Cumple | 1.9, n.5 |

---

## 3. Casos de uso del ERS (recorridos de demostración)

Los seis casos de uso críticos del ERS (sección 9) recorren todo el MVP. Cada uno remite a los pasos de los capítulos anteriores. Archivos de prueba en la carpeta `demo/` (Anexo B).

### CU-01 · Configurar el programa sin código

**Actor:** Administrador (`admin@compensar.test`).

1. Programa Territorio MIPYME con sus requisitos → paso a.1.
2. Ejes, líneas y rutas (crear, renombrar, inactivar) → paso a.2.
3. Catálogo de servicios con aliado, horas, sesiones, indicadores y costo interno → pasos a.3 y a.4.
4. Marca, canales y pasos del primer ingreso → pasos a.5 y a.6.
5. Plantillas de mensajes (editar → pendiente → aprobar) → paso a.7.
6. Rol «Evaluador senior» con **Crear a partir de otro** → paso a.8.
7. Invitar usuarios internos (SSO en producción) y al coordinador de un aliado; revocar una invitación → paso a.9.
8. Verificar cada cambio en la auditoría → paso a.10.

**Acepta si:** nada requirió al proveedor y cada cambio aparece en la auditoría.

### CU-02 · Publicar un evento y llenar el cupo

**Actores:** Gestor de Contenidos (`contenidos@`), Gestor de Cursos (`cursos@`), Auxiliar (`aux@`) y empresas (`empresa1@`, `empresa2@`, `empresa3@`).

1. Crear el taller híbrido con cupo, banner, formulario externo y recordatorios → pasos b.1, b.2, b.3. Intentar otro programa: no aparece → paso b.1.
2. Publicar y compartir por enlace corto y QR → pasos b.4 y b.5.
3. Inscripción de las empresas con autorización de datos; la que excede el cupo pasa a lista de espera; segunda inscripción rechazada → pasos b.7 y b.8.
4. Recordatorios por los tres canales con estado → paso b.9.
5. Asistencia por QR/código y por reporte de Teams (`demo/asistencia-teams.csv`) → paso b.11.
6. Certificado y verificación pública (y código falso) → paso b.12.
7. Exportación con y sin datos personales (`cursos@` vs. `aux@`) → paso b.10.
8. Evidencia aceptada y archivo infectado rechazado → paso b.13.

**Acepta si:** el cupo se respeta, los recordatorios salen por los tres canales con estado de entrega y el certificado se valida en la página pública.

### CU-03 · Activar empresas en lote

**Actor:** Auxiliar Administrativo (`aux@compensar.test`).

1. Descargar la plantilla → paso d.3 (2).
2. Cargar `demo/carga-con-error.xlsx`: no se guarda nada y se señala la fila 4 → paso d.3 (4–5).
3. Cargar `demo/carga-correcta.xlsx` con **Activar las empresas al cargarlas**: 6 empresas y 6 invitaciones → paso d.3 (6).
4. Volver a cargarlo: «Este NIT ya está en este programa» → paso d.3 (7).
5. La representante entra, cambia la clave temporal y completa **Primer ingreso** → pasos 1.4, 1.6 y d.12.
6. Activar o suspender una empresa; la pendiente no puede inscribirse → paso d.11 y b.7.

**Acepta si:** la empresa no ve servicios antes de la activación y el NIT repetido muestra el mensaje correcto.

### CU-04 · Acompañar con mentorías y aceptación

**Actores:** Gestor de Mentorías (`gestor@`), Mentor (`mentor1@`), empresa (`empresa1@`), segundo mentor (`mentor2@`).

1. Asignar mentor y reasignar conservando historial → paso g.1.
2. Asignar ruta y servicio → pasos g.2 y f.2.
3. El mentor programa la sesión (invitación `.ics`; Outlook real cuando Compensar entregue credenciales) → paso g.6.
4. Reprogramar con motivo → paso g.8.
5. Registrar el seguimiento y subir `demo/hoja-de-ruta.pdf` (OnBase) → pasos g.10 y g.11.
6. La empresa acepta la sesión y el documento: quedan usuario, fecha, hora e IP → paso g.12.
7. `mentor2@` no ve la empresa ni por enlace directo → paso g.3.
8. Línea de tiempo y su PDF → paso g.14.

**Acepta si:** un segundo mentor no asignado no puede abrir la empresa ni por enlace directo.

### CU-05 · Remitir a un aliado y soportar el pago

**Actores:** Gestor o Mentor, empresa, Coordinador del aliado (`coord@crecer.test`), Mentor del aliado (`mentor@crecer.test`), Aprobador de pagos (`pagos@compensar.test`).

1. Remitir La Espiga a «Mentoría en estrategia comercial» → paso h.1.
2. La empresa acepta → paso h.2.
3. El coordinador asigna a su mentor → paso h.3.
4. El mentor del aliado registra 3 sesiones con horas (fechas de este mes) → paso h.4.
5. La empresa acepta solo 2 → pasos h.4 y g.12.
6. El Aprobador revisa, descarga el Excel (R-09), lo compara y aprueba → pasos j.1, j.2, j.3.
7. Separación de funciones → paso j.3 y prueba automática m.3.

**Acepta si:** quien registró las horas no puede aprobarlas y el Excel coincide con la pantalla.

### CU-06 · Cerrar y reportar

**Actores:** Mentor (`mentor1@`), Gestor de Mentorías (`gestor@`), Auditor (`auditor@`).

1. Indicador con línea base, meta y resultado → paso i.2.
2. Consolidar y **Aprobar cierre**; ya no se pueden programar sesiones de ese servicio → paso i.5.
3. Descargar R-01 a R-10 del mes en Excel y medir el tiempo → paso l.1.
4. El Auditor consulta quién hizo cada paso; no hay forma de editar ni borrar → paso m.1.

**Acepta si:** cada reporte sale en menos de 1 minuto y la auditoría no permite editar ni borrar.

### Criterios globales del ERS

| Criterio | Dónde se demuestra | Estado |
|---|---|---|
| Los 6 casos de uso de punta a punta | CU-01 a CU-06 | Cumple |
| Ningún rol ve datos fuera de su alcance | g.3, l.2, m.3 | Cumple (prueba automática) |
| Interfaz y mensajes en español | 1.1, a.6 | Cumple |
| WCAG 2.2 AA | 1.1 | Parcial: auditoría formal pendiente |
| Páginas < 3 s con 500 usuarios | b.6, l.1 | Parcial: prueba de carga pendiente |
| Documentos en OnBase | g.11, n.3 | Parcial: adaptador listo, falta API y ambiente de Compensar |
| Correo, SMS y WhatsApp con estado | b.9, m.2 | Cumple (proveedores simulados hasta contratar) |
| Pentest externo, restauración de respaldo y simulacro DR | — | Compromiso del proveedor |
| Manuales, modelo de datos, catálogo de roles e interfaces | este manual, `docs/` | Cumple |

---

## Anexo A. Índice de requisitos

El estado es el de `docs/MATRIZ-CUMPLIMIENTO.md`, sin cambios. «Paso» remite a la sección de este manual (por ejemplo, b.7 = capítulo (b), paso 7; 1.4 = Introducción, sección 1.4).

### A.1 Funcionalidades del Anexo 07 (FUN-03 a FUN-100)

| Requisito | Descripción | Estado | Paso donde se demuestra |
|---|---|---|---|
| FUN-03 | Permite el registro de usuarios y empresas para acceder al programa | Cumple | 1.4, a.9, d.1, d.3 |
| FUN-04 | Permite la recuperación de contraseñas de manera segura | Cumple | 1.5 |
| FUN-05 | Permite el cambio de contraseñas temporales durante el primer ingreso | Cumple | 1.6, d.12 |
| FUN-06 | Permite administrar perfiles de empresa y contactos asociados | Cumple | d.13, d.14, 1.7 |
| FUN-07 | Permite configurar y administrar roles diferenciados para empresas, asesores y consultores | Cumple | 1.3, a.8 |
| FUN-08 | Permite crear nuevas convocatorias desde un módulo de administración | Cumple | b.1 |
| FUN-09 | Permite registrar información básica de convocatorias y eventos | Cumple | b.1, b.4 |
| FUN-10 | Permite configurar fechas, horarios, modalidad, ubicación, cupos y costos | Cumple | b.1 |
| FUN-11 | Permite asociar formularios a convocatorias y eventos | Cumple | b.1, c.3 |
| FUN-12 | Permite configurar recordatorios para convocatorias | Cumple | b.2, b.9 |
| FUN-13 | Permite incorporar imágenes, banners, resúmenes y descripciones | Cumple | b.3 |
| FUN-14 | Permite crear y publicar landing pages para convocatorias y eventos | Cumple | b.3, b.5 |
| FUN-15 | Permite visualizar un calendario o listado de eventos | Cumple | b.6 |
| FUN-16 | Permite consultar convocatorias disponibles y su detalle | Cumple | b.7 |
| FUN-17 | Permite inscribirse a convocatorias y eventos mediante formularios digitales | Cumple | b.7 |
| FUN-18 | Valida credenciales y controla accesos durante la inscripción | Cumple | 1.4, b.7 |
| FUN-19 | Permite buscar, editar, activar, inactivar y duplicar convocatorias y eventos | Cumple | b.4, b.6 |
| FUN-20 | Permite consultar y exportar listados de inscritos | Cumple | b.10 |
| FUN-21 | Permite gestionar asistencia individual y masiva | Cumple | b.11 |
| FUN-22 | Permite generar y enviar certificados automáticamente | Cumple | b.12 |
| FUN-23 | Permite cargar evidencias asociadas a eventos | Cumple | b.13 |
| FUN-24 | Permite realizar cargues masivos de empresas al programa | Cumple | d.3 |
| FUN-25 | Permite crear cuentas empresariales, usuarios principales y contactos asociados | Cumple | d.2, d.3, d.14 |
| FUN-26 | Permite activar empresas y habilitar su acceso a la plataforma | Cumple | d.6, d.11 |
| FUN-27 | Permite notificar activaciones o restricciones de ingreso | Cumple | d.6, d.11, m.2 |
| FUN-28 | Permite gestionar pasos iniciales obligatorios para nuevas empresas | Cumple | 1.6, d.12 |
| FUN-29 | Permite visualizar y actualizar el perfil empresarial | Cumple | d.13 |
| FUN-30 | Incluye procesos de bienvenida y orientación inicial | Cumple | 1.6, d.12 |
| FUN-31 | Permite asignar asesores a las empresas | Cumple | g.1 |
| FUN-32 | Permite notificar automáticamente las asignaciones realizadas | Cumple | g.1 |
| FUN-33 | Permite consultar información de las empresas asignadas | Cumple | g.3 |
| FUN-34 | Permite gestionar agendas de acompañamiento | Cumple | g.4, g.5, g.6 |
| FUN-35 | Permite programar, reprogramar y cancelar sesiones | Cumple | g.6, g.7, g.8 |
| FUN-36 | Permite registrar seguimientos y resultados de las sesiones | Cumple | g.10 |
| FUN-37 | Permite compartir documentación entre asesor y empresa | Cumple | g.11, g.12 |
| FUN-38 | Permite consultar el historial de acompañamiento | Cumple | g.14, l.6 |
| FUN-39 | Permite remitir empresas a servicios especializados | Cumple | h.1, h.2 |
| FUN-40 | Permite asignar empresas o servicios a consultores | Cumple | h.3 |
| FUN-41 | Permite consultar servicios disponibles para remisión | Cumple | a.3, h.1 |
| FUN-42 | Permite consultar servicios asignados, sesiones programadas y documentos compartidos | Cumple | g.2, g.15, l.7 |
| FUN-43 | Permite consultar resultados, indicadores e historial de servicios recibidos | Cumple | h.5, i.8 |
| FUN-44 | Permite consultar agendas de asesoría programadas | Cumple | g.5 |
| FUN-45 | Permite gestionar notificaciones asociadas al proceso de asesoría | Cumple | a.7, g.8, g.9, m.2 |
| FUN-46 | Permite consolidar los resultados generados durante el proceso de acompañamiento | Cumple | i.5 |
| FUN-47 | Permite medir el impacto alcanzado frente a los objetivos definidos | Cumple | e.8, i.5 |
| FUN-48 | Permite gestionar la facturación asociada a los servicios prestados | Cumple | j.1, j.3 |
| FUN-49 | Permite generar reportes e indicadores sobre convocatorias, eventos, programas y servicios | Cumple | l.1 |
| FUN-50 | Permite crear y administrar formularios para inscripción a programas | Cumple | c.1, c.3 |
| FUN-51 | Permite diseñar formularios sin necesidad de desarrollo | Cumple | c.2 |
| FUN-52 | Permite configurar preguntas, secciones y diferentes tipos de respuesta | Cumple | c.2 |
| FUN-53 | Permite crear formularios de diagnóstico con puntuación y lógica condicional | Cumple | c.2, e.1 |
| FUN-54 | Permite generar resultados automáticos a partir de formularios de diagnóstico | Cumple | e.5 |
| FUN-55 | Permite publicar formularios y capturar información de participantes | Cumple | c.3, c.6 |
| FUN-56 | Permite diligenciar formularios y validar la información registrada | Cumple | c.4 |
| FUN-57 | Permite crear y administrar diagnósticos empresariales | Cumple | e.1, e.3 |
| FUN-58 | Permite registrar empresas manualmente para iniciar diagnósticos | Cumple | e.2 |
| FUN-59 | Permite gestionar estados y etapas del diagnóstico | Cumple | e.3, e.5, e.7 |
| FUN-60 | Permite realizar autodiagnósticos empresariales | Cumple | e.4 |
| FUN-61 | Permite procesar respuestas y generar resultados automáticamente | Parcial — falta contrastar el cálculo con la hoja de referencia de Compensar (no entregada) | e.5 |
| FUN-62 | Permite clasificar empresas según los resultados obtenidos | Cumple | e.1, e.6 |
| FUN-63 | Permite visualizar niveles, resultados y hallazgos del diagnóstico | Cumple | e.5 |
| FUN-64 | Mantiene trazabilidad detallada de todas las acciones realizadas | Cumple | m.1 |
| FUN-65 | Permite consultar y descargar documentos asociados al proceso | Cumple | l.7 |
| FUN-66 | Permite identificar qué usuario realizó cada acción y cuándo | Cumple | m.1 |
| FUN-67 | Permite definir y monitorear indicadores de gestión e impacto | Cumple | i.1, i.4 |
| FUN-68 | Permite visualizar avances, indicadores y evolución de resultados | Cumple | i.3, i.4, l.2 |
| FUN-69 | Permite guardar formularios parcialmente y continuar posteriormente | Cumple | c.4, e.4 |
| FUN-70 | Permite enviar notificaciones automáticas posteriores a la inscripción | Cumple | c.4, c.6, m.2 |
| FUN-71 | Permite consultar el estado de una inscripción | Cumple | c.5, d.10 |
| FUN-72 | Permite gestionar solicitudes pendientes de validación | Cumple | d.5 |
| FUN-73 | Permite validar automáticamente los requisitos definidos por la entidad | Cumple | d.6, d.7, d.16 |
| FUN-74 | Permite ejecutar validaciones manuales complementarias | Cumple | d.6 |
| FUN-75 | Permite aprobar, rechazar o solicitar ajustes sobre una inscripción | Cumple | d.6 |
| FUN-76 | Permite solicitar documentación o información adicional | Cumple | d.6, d.10 |
| FUN-77 | Permite procesar validaciones masivas mediante archivos Excel | Cumple | d.8 |
| FUN-78 | Permite visualizar el avance del proceso de validación | Cumple | d.9 |
| FUN-79 | Permite configurar rutas de acompañamiento personalizadas | Cumple | f.1, f.2 |
| FUN-80 | Permite asociar servicios, indicadores, línea base y metas a una ruta | Cumple | f.1, f.3, i.2 |
| FUN-81 | Permite que la empresa consulte su ruta de acompañamiento | Cumple | f.5 |
| FUN-82 | Permite visualizar el avance de una ruta y la trazabilidad del proceso | Cumple | f.4 |
| FUN-83 | Permite definir líneas base e indicadores para cada servicio | Cumple | i.1, i.2 |
| FUN-84 | Permite actualizar indicadores durante la ejecución de mentorías o consultorías | Cumple | g.10, i.3 |
| FUN-85 | Permite evaluar la experiencia y satisfacción sobre servicios específicos | Cumple | i.6 |
| FUN-86 | Permite acceder a contenidos, herramientas y material de apoyo | Cumple | i.7 |
| FUN-87 | Permite visualizar el estado general de procesos y planes de trabajo | Cumple | k.1 |
| FUN-88 | Permite generar alertas automáticas ante retrasos o riesgos | Cumple | k.3, k.4 |
| FUN-89 | Permite identificar empresas con alertas o desviaciones | Cumple | k.2 |
| FUN-90 | Permite registrar tareas, actividades y evidencias operativas | Cumple | k.5 |
| FUN-91 | Permite gestionar comunicaciones entre asesores y empresarios | Cumple | g.13 |
| FUN-92 | Permite descargar reportes operativos y hojas de ruta | Cumple | i.9, k.4, k.5, h.5 |
| FUN-93 | Permite generar informes finales para las empresas beneficiarias | Cumple | i.8 |
| FUN-94 | Permite gestionar el cierre y escalamiento de rutas | Cumple | f.6 |
| FUN-95 | Permite aplicar encuestas de satisfacción y experiencia | Cumple | i.6 |
| FUN-96 | Permite generar reportes de validación y seguimiento de empresas | Cumple | d.9, l.1 |
| FUN-97 | Permite construir dashboards configurables para la operación | Cumple | l.3, l.5 |
| FUN-98 | Permite consultar información por programa, convocatoria, asesor, aliado o período | Cumple | l.2, l.4 |
| FUN-99 | Permite visualizar la trazabilidad de extremo a extremo de una empresa o caso | Cumple | l.6 |
| FUN-100 | Permite exportar información operativa y analítica a Excel, CSV u otros formatos | Cumple | b.14, l.1, l.4, l.8 |

### A.2 Requisitos funcionales del MVP (ERS §4)

| Requisito | Estado | Paso donde se demuestra | Nota de la matriz |
|---|---|---|---|
| RF-ACC-01 | Cumple | a.9, d.1 |  |
| RF-ACC-02 | Cumple | 1.4, n.5 |  |
| RF-ACC-03 | Cumple | 1.4, 1.5 |  |
| RF-ACC-04 | Cumple | 1.6, a.9 |  |
| RF-ACC-05 | Cumple | 1.4, 1.8 |  |
| RF-ACC-06 | Cumple | d.14 |  |
| RF-ACC-07 | Cumple | a.8, m.3 |  |
| RF-ACC-08 | Cumple | a.8 |  |
| RF-ACC-09 | Cumple | a.9 |  |
| RF-ACC-10 | Cumple | 1.9, a.6, n.5 |  |
| RF-PAR-01 | Cumple | a.1 |  |
| RF-PAR-02 | Cumple | a.2 |  |
| RF-PAR-03 | Cumple | a.3 |  |
| RF-PAR-04 | Cumple | b.2, b.11 |  |
| RF-PAR-05 | Cumple | a.4, h.3 |  |
| RF-PAR-06 | Cumple | a.5, b.5, b.12 |  |
| RF-PAR-07 | Cumple | a.7 |  |
| RF-PAR-08 | Cumple | a.6, 1.6 |  |
| RF-CON-01 | Cumple | b.1 |  |
| RF-CON-02 | Cumple | b.1, b.4 |  |
| RF-CON-03 | Cumple | b.1, b.8 |  |
| RF-CON-04 | Cumple | b.1, c.3 |  |
| RF-CON-05 | Cumple | b.2, b.9 |  |
| RF-CON-06 | Cumple | b.3 |  |
| RF-CON-07 | Cumple | b.3, b.5 |  |
| RF-CON-08 | Cumple | b.6 |  |
| RF-CON-09 | Cumple | b.7 |  |
| RF-CON-10 | Cumple | b.7 |  |
| RF-CON-11 | Cumple | b.7 |  |
| RF-CON-12 | Cumple | b.4, b.6 |  |
| RF-CON-13 | Cumple | b.10 |  |
| RF-CON-14 | Cumple | b.11 |  |
| RF-CON-15 | Cumple | b.12 |  |
| RF-CON-16 | Cumple | b.13 |  |
| RF-CON-17 | Cumple | b.8 |  |
| RF-EMP-01 | Cumple | d.3 |  |
| RF-EMP-02 | Cumple | d.3 |  |
| RF-EMP-03 | Cumple | 1.7, d.2, d.3, d.14 |  |
| RF-EMP-04 | Cumple | d.1, d.6, d.11, b.7 |  |
| RF-EMP-05 | Cumple | d.6, d.11, m.2 |  |
| RF-EMP-06 | Cumple | 1.6, d.12 |  |
| RF-EMP-07 | Cumple | d.13 |  |
| RF-EMP-08 | Cumple | d.15 |  |
| RF-EMP-09 | Cumple | d.13, d.15 |  |
| RF-EMP-10 | Cumple | 1.6, a.6 |  |
| RF-EMP-11 | Cumple | g.2, g.15 |  |
| RF-ACO-01 | Cumple | g.1 |  |
| RF-ACO-02 | Cumple | g.1 |  |
| RF-ACO-03 | Cumple | g.3, m.3 |  |
| RF-ACO-04 | Parcial | g.4, g.5, g.6 | Calendario, disponibilidad y adaptador Microsoft Graph probado contra simulador; falta la aplicación y credenciales en el Entra ID de Compensar para sincronizar con su Outlook real (mientras tanto, invitación .ics) |
| RF-ACO-05 | Cumple | g.6, g.7, g.8 |  |
| RF-ACO-06 | Cumple | g.10, k.3 |  |
| RF-ACO-07 | Cumple | g.12, j.1 |  |
| RF-ACO-08 | Cumple | g.11, g.12 |  |
| RF-ACO-09 | Cumple | g.14 |  |
| RF-ACO-10 | Cumple | g.5 |  |
| RF-ACO-11 | Cumple | a.7, g.8, g.9 |  |
| RF-ACO-12 | Cumple | g.11, g.13 |  |
| RF-SRV-01 | Cumple | h.1, h.2 |  |
| RF-SRV-02 | Cumple | h.3 |  |
| RF-SRV-03 | Cumple | a.3, h.1 |  |
| RF-SRV-04 | Cumple | g.15 |  |
| RF-SRV-05 | Cumple | h.4, j.1 |  |
| RF-SRV-06 | Cumple | h.5 |  |
| RF-RES-01 | Cumple | i.5 |  |
| RF-RES-02 | Cumple | e.8, i.5 |  |
| RF-RES-03 | Cumple | j.1, j.2, j.3 |  |
| RF-RES-04 | Cumple | l.1, l.6 |  |
| RF-RES-05 | Cumple | l.1, j.2 |  |
| RF-NOT-01 | Cumple | a.6, m.2 |  |
| RF-NOT-02 | Parcial | a.6 | Remitente configurable; SPF, DKIM y DMARC se configuran en el dominio de Compensar al desplegar |
| RF-NOT-03 | Cumple | b.9, d.6, m.2 |  |
| RF-NOT-04 | Cumple | a.6 |  |
| RF-NOT-05 | Cumple | 1.8 |  |
| RF-DOC-01 | Parcial | b.13, g.11, n.3 | Adaptador OnBase con referencia y cola de reintentos; conexión real pendiente de la API y ambiente de Compensar |
| RF-DOC-02 | Cumple | b.13, g.11 |  |
| RF-DOC-03 | Cumple | b.13, g.11 |  |
| RF-DOC-04 | Cumple | g.12, l.7 |  |
| RF-AUD-01 | Cumple | a.10, m.1 |  |
| RF-AUD-02 | Cumple | m.1 |  |
| RF-INT-01 | Cumple | d.16, n.1 |  |
| RF-INT-02 | Cumple | n.1 |  |
| RF-INT-03 | Cumple | n.2, n.3 |  |
| RF-INT-04 | Cumple | d.16, n.3 |  |
| RF-INT-05 | Cumple | n.2 |  |
| RF-INT-06 | Cumple | d.3, d.4, l.8, n.7 |  |
| RF-INT-07 | Compromiso del proveedor | Capítulo (n), nota inicial | Conexión a los ambientes de prueba de Compensar al iniciar la implementación |

### A.3 Requisitos funcionales Deseables y Futuros (ERS §5)

Estos requisitos corresponden a las funcionalidades FUN indicadas; su estado es el de esa FUN en la matriz.

| Requisito | FUN | Estado | Paso donde se demuestra |
|---|---|---|---|
| RF-FRM-01 | FUN-50 | Cumple | c.1, c.3 |
| RF-FRM-02 | FUN-51 | Cumple | c.2 |
| RF-FRM-03 | FUN-52 | Cumple | c.2 |
| RF-FRM-04 | FUN-53 | Cumple | c.2, e.1 |
| RF-FRM-05 | FUN-54 | Cumple | e.5 |
| RF-FRM-06 | FUN-55 | Cumple | c.3, c.6 |
| RF-FRM-07 | FUN-56 | Cumple | c.4 |
| RF-FRM-08 | FUN-69 | Cumple | c.4 |
| RF-FRM-09 | FUN-70 | Cumple | c.4, c.6 |
| RF-FRM-10 | FUN-71 | Cumple | c.5, c.6 |
| RF-DIA-01 | FUN-57 | Cumple | e.1, e.3 |
| RF-DIA-02 | FUN-58 | Cumple | e.2 |
| RF-DIA-03 | FUN-59 | Cumple | e.3, e.5 |
| RF-DIA-04 | FUN-60 | Cumple | e.4 |
| RF-DIA-05 | FUN-61 | Parcial | e.5 |
| RF-DIA-06 | FUN-62 | Cumple | e.1, e.6 |
| RF-DIA-07 | FUN-63 | Cumple | e.5 |
| RF-DIA-08 | — | Cumple | e.8 |
| RF-VAL-01 | FUN-72 | Cumple | d.5 |
| RF-VAL-02 | FUN-73 | Cumple | d.6, d.7 |
| RF-VAL-03 | FUN-74 | Cumple | d.6 |
| RF-VAL-04 | FUN-75 | Cumple | d.6 |
| RF-VAL-05 | FUN-76 | Cumple | d.6, d.10 |
| RF-VAL-06 | FUN-77 | Cumple | d.8 |
| RF-VAL-07 | FUN-78 | Cumple | d.9 |
| RF-RUT-01 | FUN-79 | Cumple | f.1, f.2 |
| RF-RUT-02 | FUN-80 | Cumple | f.1, f.3 |
| RF-RUT-03 | FUN-81 | Cumple | f.5 |
| RF-RUT-04 | FUN-82 | Cumple | f.4 |
| RF-RUT-05 | — | Cumple | f.2, f.3 |
| RF-SEG-01 | FUN-65 | Cumple | l.7 |
| RF-SEG-02 | FUN-67 | Cumple | i.1, i.4 |
| RF-SEG-03 | FUN-68 | Cumple | i.4 |
| RF-GSV-01 | FUN-83 | Cumple | i.1, i.2 |
| RF-GSV-02 | FUN-84 | Cumple | g.10, i.3 |
| RF-GSV-03 | FUN-85 | Cumple | i.6 |
| RF-GSV-04 | FUN-86 | Cumple | i.7 |
| RF-ALE-01 | FUN-87 | Cumple | k.1 |
| RF-ALE-02 | FUN-88 | Cumple | k.3 |
| RF-ALE-03 | FUN-89 | Cumple | k.2 |
| RF-ALE-04 | FUN-90 | Cumple | k.5 |
| RF-ALE-05 | FUN-91 | Cumple | g.13 |
| RF-ALE-06 | FUN-92 | Cumple | i.9, k.4 |
| RF-ANA-01 | FUN-93 | Cumple | i.8 |
| RF-ANA-02 | FUN-94 | Cumple | f.6 |
| RF-ANA-03 | FUN-95 | Cumple | i.6 |
| RF-ANA-04 | FUN-96 | Cumple | d.9, l.1 |
| RF-ANA-05 | FUN-97 | Cumple | l.3, l.5 |
| RF-ANA-06 | FUN-98 | Cumple | l.2, l.4 |
| RF-ANA-07 | FUN-99 | Cumple | l.6 |
| RF-ANA-08 | FUN-100 | Cumple | l.1, l.4, l.8 |

### A.4 Reglas de acceso (ERS §3)

| Requisito | Estado | Paso donde se demuestra |
|---|---|---|
| RN-01 | Cumple | n.8 (despliegue dedicado) |
| RN-02 | Cumple | 1.3, g.3, m.3 |
| RN-03 | Cumple | a.9 |
| RN-04 | Cumple | 1.3, a.9, m.3 |
| RN-05 | Cumple | f.6, i.5, j.3, m.3 |
| RN-06 | Cumple | a.9, d.1 |
| RN-07 | Cumple | 1.4, n.5 |
| RN-08 | Cumple | 1.4 |
| RN-09 | Cumple | 1.9 |
| RN-10 | Cumple | a.9, g.1, d.11, m.1 |

### A.5 Requisitos no funcionales (ERS §7)

| Requisito | Estado | Paso donde se demuestra | Nota de la matriz |
|---|---|---|---|
| RNF-SEG-01/02 | Cumple | 1.4 |  |
| RNF-SEG-03 | Cumple | 1.4, n.5 |  |
| RNF-SEG-04 | Cumple | a.9 |  |
| RNF-SEG-05 | Parcial | n.5 | HSTS y cookies seguras; TLS en el balanceador |
| RNF-SEG-06 | Parcial | n.3 | AES-256-GCM en archivos y secretos; base y respaldos con KMS en infraestructura |
| RNF-SEG-07 | Parcial | n.5 | CSP y consultas parametrizadas; WAF/anti-DDoS en infraestructura |
| RNF-SEG-08 | Cumple | b.13, g.11 |  |
| RNF-SEG-09 | Cumple | c.4, d.3 |  |
| RNF-SEG-10 | Cumple | g.11, n.3 |  |
| RNF-SEG-11…19 | Compromiso del proveedor | — | Ambientes, revisión de accesos, hardening, pentest, vulnerabilidades, ISO, auditorías |
| RNF-PRI-01 | Compromiso del proveedor | — | Contrato de transmisión de datos |
| RNF-PRI-02 | Cumple | n.7 |  |
| RNF-PRI-03 | Cumple | b.7, 1.6 |  |
| RNF-PRI-04 | Compromiso del proveedor | — | Declaración de región |
| RNF-PRI-05 | Cumple | a.9, n.4 |  |
| RNF-PRI-06 | Parcial | n.7 | Exportación total sí; borrado certificado contractual |
| RNF-PRI-07 | Cumple | f.2 |  |
| RNF-USA-01 | Parcial | 1.1 | Etiquetas, foco, contraste y salto al contenido; auditoría WCAG 2.2 AA / NTC 5854 pendiente |
| RNF-USA-02 | Cumple | 1.1, f.5 |  |
| RNF-USA-03/04 | Cumple | 1.1 |  |
| RNF-USA-05 | Cumple | 1.1 |  |
| RNF-USA-06 | Parcial | a.5 | Marca configurable; se ajusta al manual de UX/UI cuando Compensar lo entregue |
| RNF-REN-01/02 | Parcial | b.6, l.1 | Páginas < 2 s en pruebas; falta prueba de carga con 500 usuarios |
| RNF-REN-03…06 | Compromiso del proveedor | — | Capacidad y autoescalado en infraestructura |
| RNF-REN-07 | Cumple | d.4 |  |
| RNF-REN-08 | Cumple | b.6, l.5 |  |
| RNF-DIS-01…10 | Compromiso del proveedor | — | Disponibilidad, HA, DR, RPO/RTO, respaldos, mantenimientos, incidentes |
| RNF-OBS-01/03 | Cumple | m.1 |  |
| RNF-OBS-02 | Cumple | n.5 |  |
| RNF-OBS-04 | Parcial | n.6 | Logs y métricas exportables; trazas OpenTelemetry pendientes |
| RNF-OBS-05 | Cumple | n.5 |  |
| RNF-OBS-06 | Compromiso del proveedor | — | Monitoreo 7x24 |
| RNF-OBS-07 | Cumple | n.6 |  |
| RNF-ARQ-01/02 | Cumple | n.1 |  |
| RNF-ARQ-03…07, 09, 10 | Compromiso del proveedor | — | Nube, ambientes CI/CD, portabilidad, IPv6, Git, prerrequisitos, roadmap |
| RNF-ARQ-08 | Cumple | este manual, docs/ |  |

### A.6 Requisitos técnicos (TEC)

Agrupados por tema en el capítulo (n), sección n.8, con el estado de la matriz (Cumple, Parcial o Compromiso del proveedor).

### A.7 Casos de uso (ERS §9)

| Caso | Estado | Recorrido |
|---|---|---|
| CU-01 | Cumple | Sección 3, CU-01 |
| CU-02 | Cumple | Sección 3, CU-02 |
| CU-03 | Cumple | Sección 3, CU-03 |
| CU-04 | Cumple | Sección 3, CU-04 |
| CU-05 | Cumple | Sección 3, CU-05 |
| CU-06 | Cumple | Sección 3, CU-06 |

---

## Anexo B. Usuarios de demostración y archivos de prueba

### B.1 Usuarios de demostración

Clave de todos los usuarios internos y de aliados: `Demo2026!`. Los roles internos y de aliados confirman con verificación en dos pasos; en modo demo el código vigente aparece en pantalla. Los funcionarios también pueden usar **Ingresar con cuenta corporativa (SSO)** (IdP de prueba). Las empresas entran por la pestaña **Empresas** con código al correo (en modo demo el código aparece en un recuadro amarillo).

| Persona | Correo | Rol |
|---|---|---|
| Administrador | `admin@compensar.test` | Administrador |
| Auxiliar Administrativo | `aux@compensar.test` | Auxiliar Administrativo |
| Evaluador | `evaluador@compensar.test` | Evaluador |
| Gestor de Contenidos | `contenidos@compensar.test` | Gestor de Contenidos |
| Gestor de Cursos | `cursos@compensar.test` | Gestor de Cursos |
| Gestor de Mentorías | `gestor@compensar.test` | Gestor de Mentorías |
| Mentor (asignado a La Espiga) | `mentor1@compensar.test` | Mentor |
| Mentor sin asignaciones | `mentor2@compensar.test` | Mentor |
| Coordinador de aliado (Fundación Crecer) | `coord@crecer.test` | Coordinador de aliado |
| Mentor de aliado | `mentor@crecer.test` | Mentor (alcance aliado) |
| Aprobador de pagos | `pagos@compensar.test` | Aprobador de pagos |
| Auditor | `auditor@compensar.test` | Auditor |
| Empresa La Espiga | `empresa1@laespiga.test` | Vinculado / Empresa |
| Empresa Textiles del Norte | `empresa2@textiles.test` | Vinculado / Empresa |
| Empresa Tecnosoft | `empresa3@tecnosoft.test` | Vinculado / Empresa |

Datos que existen al arrancar: programas *Emprendimiento* y *Territorio MIPYME*; 3 empresas activas (La Espiga, Textiles del Norte, Tecnosoft) y 2 pendientes (Ferretería El Tornillo, Café Origen); el evento publicado «Taller de finanzas para mipymes»; 2 aliados (Fundación Crecer, Consultores Andinos) con 4 servicios; mentor1 asignado a La Espiga con una sesión programada; formularios «Diagnóstico de madurez empresarial» e «Inscripción Territorio MIPYME»; diagnósticos de La Espiga (inicial 26,7 y final 68,4).

Cliente API de demostración: `fe_demo_bi` (solo lectura, sin datos personales ni auditoría; se revoca en producción).

> **Nota:** Para reiniciar la demostración: detenga el servidor, borre las carpetas `data/` y `storage/` y vuelva a arrancar con `npm run dev`.

### B.2 Archivos de prueba (carpeta `demo/`)

| Archivo | Para qué sirve | Paso |
|---|---|---|
| `carga-con-error.xlsx` | Cargue masivo con una fila con DV inválido: no se guarda nada y se señala la fila 4 | d.3, CU-03 |
| `carga-correcta.xlsx` | Cargue masivo correcto de 6 empresas (con «Activar las empresas al cargarlas»); al repetirlo: «Este NIT ya está en este programa» | d.3, CU-03 |
| `asistencia-teams.csv` | Reporte de Teams/Zoom: 45 minutos cumple y 10 minutos no cumple el mínimo de 30 | b.11, CU-02 |
| `hoja-de-ruta.pdf` | Documento válido para evidencias y documentos de sesión (OnBase) | b.13, g.11, CU-04 |
| `archivo-infectado.pdf` | Archivo con firma de prueba de virus: el antivirus lo rechaza y queda en auditoría | b.13, g.11, RF-DOC-03 |
