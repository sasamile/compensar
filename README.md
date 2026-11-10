# Plataforma de Fomento Empresarial (Compensar)

Plataforma web para operar de punta a punta el proceso de Fomento Empresarial: convocatorias y eventos, activación y validación de empresas, diagnóstico, rutas y mentorías, servicios de aliados, cierres, soporte de pagos, seguimiento, analítica y auditoría.

Cubre las **98 funcionalidades** del Anexo 07 (47 MVP, 19 Deseables, 32 Futuras) y los requisitos técnicos implementables en código. Estado requisito por requisito en [docs/MATRIZ-CUMPLIMIENTO.md](docs/MATRIZ-CUMPLIMIENTO.md).

## Arrancar

```bash
npm install
npm run dev        # http://localhost:3100
```

Pruebas automáticas (matriz rol-permiso, aislamiento por rol, separación de funciones): `npm test`. Para aprobar un cambio de permisos: `npm run aprobar-permisos`.

Requiere Node ≥ 22.13 (usa `node:sqlite`). La base (`data/fomento.db`) y los datos de demostración se crean solos al arrancar; los procesos por lotes empiezan a correr de inmediato.
Para reiniciar la demo: detén el servidor y borra `data/` y `storage/`.

### Ingreso de demostración
- **Funcionarios**: botón «Ingresar con cuenta corporativa (SSO)» (abre el IdP de prueba incluido) o correo + clave `Demo2026!`. Los roles internos y de aliados piden verificación en dos pasos: en modo demo el código vigente aparece en pantalla.
- **Empresas**: pestaña «Empresas», correo de la empresa y código de un solo uso (en modo demo aparece en pantalla).
- Usuarios: `admin@`, `aux@`, `contenidos@`, `cursos@`, `gestor@`, `evaluador@`, `mentor1@`, `mentor2@`, `pagos@`, `auditor@` (dominio `compensar.test`), `coord@crecer.test`, `mentor@crecer.test`; empresas `empresa1@laespiga.test`, `empresa2@textiles.test`, `empresa3@tecnosoft.test`.
- Guion de demostración: [DEMO.md](DEMO.md).

## Módulos
| Área | Pantallas |
|---|---|
| Acceso y seguridad | Login con SSO (OIDC), 2FA TOTP, código al correo, recuperación, anti-bots, `/cuenta` |
| Parametrización | Programas, ejes → líneas → rutas, catálogo de servicios, aliados, marca, plantillas, roles |
| Convocatorias | Eventos y cursos, landing pública con QR, inscripción, asistencia, certificados, recordatorios |
| Formularios y diagnóstico | Constructor sin código, versiones, autoguardado, diagnóstico con puntaje, niveles y comparación |
| Empresas | Cargue masivo, activación, validación de requisitos, perfil, directorio |
| Acompañamiento | Mentores, agenda, seguimiento, aceptación digital, rutas, mensajes, remisiones a aliados, biblioteca |
| Resultados | Indicadores, cierres, encuestas, soporte de pagos, informe final, trazabilidad |
| Control | Reportes R-01…R-15, analítica, tableros, consultas, Power BI, alertas y semáforo, auditoría, centro documental |
| Integraciones | API REST + OpenAPI (`/api-docs`), webhooks firmados, colas con reintentos, salud y métricas, exportación total |

## Integraciones con Compensar
Implementadas detrás de adaptadores y en modo simulado hasta recibir credenciales y ambientes de prueba:
IAM/SSO (`src/lib/oidc.ts`), OnBase (`src/lib/onbase.ts`), Gestión de Clientes (`src/lib/integrations/gestion-clientes.ts`), Microsoft 365 (invitación `.ics`), correo/SMS/WhatsApp (`src/lib/notify.ts`).

## Variables de entorno (producción)
`STORAGE_KEY` (cifrado de archivos), `M365_TENANT_ID`/`M365_CLIENT_ID`/`M365_CLIENT_SECRET` (Outlook), `DEMO_MODE=0` (oculta códigos en pantalla y credenciales demo), `APP_URL`, datos del IdP en Integraciones → Seguridad, `GESTION_CLIENTES_URL`/`_TOKEN`, `TURNSTILE_SITE_KEY`/`_SECRET`. Detalle en [docs/modulos/tecnico-seguridad-integraciones.md](docs/modulos/tecnico-seguridad-integraciones.md).

## Documentación
- [Matriz de cumplimiento](docs/MATRIZ-CUMPLIMIENTO.md) · [Catálogo de roles](docs/CATALOGO-ROLES.md) · [Modelo de datos](docs/MODELO-DATOS.md)
- Manuales por módulo: [convocatorias](docs/modulos/convocatorias.md), [acompañamiento](docs/modulos/acompanamiento.md), [plataforma y pruebas](docs/modulos/plataforma.md), [formularios y diagnóstico](docs/modulos/formularios-diagnostico.md), [validación y rutas](docs/modulos/validacion-rutas.md), [seguimiento y operación](docs/modulos/seguimiento-operacion.md), [analítica y reportes](docs/modulos/analitica-reportes.md), [técnico, seguridad e integraciones](docs/modulos/tecnico-seguridad-integraciones.md)
- [Guía de desarrollo](docs/DESARROLLO.md)

## Stack
Next.js 15 (App Router, server actions) · TypeScript · Tailwind 4 · SQLite (`node:sqlite`) · ExcelJS · qrcode · lucide-react.

## Despliegue en servidor (EC2)
- **Primera instalación** (en la consola de la instancia): `curl -fsSLO https://raw.githubusercontent.com/sasamile/compensar/main/deploy/instalar.sh && bash instalar.sh`. Instala Node 26, Caddy (HTTPS automático), compila y deja la app como servicio (`fomento`). Sin dominio publica en `https://<ip-con-guiones>.sslip.io`.
- **Dominio propio**: crea un registro A hacia la IP de la instancia y ejecuta `bash /opt/fomento/deploy/instalar.sh midominio.com`.
- **Subir cambios**: en el Mac `./subir-cambios.sh "mensaje"`; en la instancia `bash /opt/fomento/deploy/actualizar.sh`.
- Requiere puertos 80 y 443 abiertos en el Security Group. Configuración en `/etc/fomento.env`; registros con `sudo journalctl -u fomento -f`.
