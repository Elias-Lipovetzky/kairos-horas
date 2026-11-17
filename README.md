# Kairos · Registro de horas

Aplicación mobile first para registrar horas por empleado y lugar. Incluye carga en lote, roles
administrador/RR. HH., auditoría, borrado lógico, notificaciones filtrables, Excel y PDF. Los
descansos, tarifas, horas extra y uso sin conexión quedan fuera del alcance.

La carga se organiza en contenedores por persona: empleado arriba, registros por lugar debajo,
subtotal por persona y total general. Se pueden agregar varios contenedores y guardar hasta 100
registros entre todas las personas en una sola operación. Los campos de empleado y lugar son
buscadores con hasta ocho sugerencias filtradas por nombre o DNI, sin desplegar todo el catálogo.

La interfaz usa la identidad azul de Kairos y los archivos `public/assets/kairos-logo.svg` y
`kairos-icon.svg`, redibujados como vectores a partir de la referencia provista. El JPEG de
referencia se conserva. Los filtros se despliegan a pedido; las cargas, correcciones y datos
administrativos se confirman en diálogos antes de enviarse.

El importador de prueba usa UTF-8 explícito para leer las respuestas de curl y un script PowerShell
con BOM para compatibilidad con Windows PowerShell 5.1. Se corrigió por API el nombre del dueño de
prueba mal codificado, conservando sus IDs y relaciones. El historial mantiene el valor anterior
como evidencia del cambio, no se reescribe.

La navegación lateral se contrae en iconos en escritorio y se oculta en celular. Las notificaciones
se abren desde la campana junto al perfil. La descarga se solicita mediante Exportar, junto a los
resultados de Registros; el menú muestra Excel y PDF al enfocar, pasar el puntero o tocar. Se
exportan los filtros ya aplicados, no las ediciones pendientes del formulario.

Crear cuenta permite solicitar acceso rrhh. La cuenta queda inactiva hasta aprobación del
administrador en Usuarios. La migración de arranque agrega registration_pending sin modificar las
cuentas existentes. OpenAPI 1.2.0 incluye POST /api/signup y orden opcional en consultas y
exportaciones.

## Estado y validación

Implementación inicial en prueba local. Pasaron las pruebas de lógica y de contrato, la comprobación
sintáctica y una suite HTTP de consultas y exportaciones contra la API local con PostgreSQL. La
importación del catálogo de prueba también se ejecutó mediante la API. La revisión visual completa y
la suite de escritura en una base aislada siguen pendientes; no se presenta como una entrega
validada de extremo a extremo. Esta sesión no puede instalar paquetes desde npm ni acceder
directamente a Docker/WSL.

No hay credenciales predeterminadas, datos ficticios precargados ni correo obligatorio. La
recuperación de contraseña está implementada y necesita un servidor SMTP para enviar mensajes; el
acceso y las demás operaciones funcionan sin SMTP.

## Manual técnico · Inicio en Linux/WSL

Requisitos: Linux con Docker Engine y Docker Compose v2, o Docker Desktop integrado con la
distribución WSL. Ejecutar estos comandos desde la carpeta del proyecto dentro de WSL. El puerto
8080 debe estar libre.

```bash
cp .env.example .env
openssl rand -hex 24
```

Editar `.env`: reemplazar `POSTGRES_PASSWORD` por la clave generada, y usar la misma clave en
`DATABASE_URL`. Usar una contraseña hexadecimal evita problemas de caracteres reservados en la URL.
No subir `.env` a GitHub.

```bash
docker compose up --build -d
docker compose logs --tail=100 app
```

Abrir <http://localhost:8080>. El esquema se crea automáticamente en el primer inicio; no se
necesita dominio ni hosting externo. Las versiones principales de las imágenes están indicadas en
`compose.yaml` y `Dockerfile`.

La instalación de paquetes en este entorno no pudo completarse y no se generó un
`package-lock.json`. El Dockerfile usa `npm install` cuando no existe lock. En un entorno con red,
ejecutar `npm install`, revisar el resultado y conservar `package-lock.json` en Git; a partir de
entonces la construcción usa `npm ci` para fijar también dependencias transitivas.

### Crear el primer administrador

Desde Bash en WSL, ingresar la contraseña sin mostrarla ni guardarla como argumento o en el
historial:

```bash
read -r -s -p 'Contraseña inicial (mínimo 12 caracteres): ' KAIROS_BOOTSTRAP_PASSWORD
echo
printf '%s' "$KAIROS_BOOTSTRAP_PASSWORD" | docker compose exec -T app node server/admin.js create admin@kairos.local "Administrador"
unset KAIROS_BOOTSTRAP_PASSWORD
```

Ingresar con ese correo y contraseña. El correo puede ser local mientras no se use recuperación
SMTP. Luego crear dueños, lugares, empleados y cuentas de RR. HH. desde Administración.

Para restablecer una contraseña sin correo, repetir la lectura segura anterior y cambiar `create`
por `reset`, usando el correo existente. `reset` cambia la contraseña y cierra las sesiones, pero no
reactiva una cuenta ni cambia su rol. La operación queda registrada como procedimiento local. Solo
un operador con acceso autorizado al servidor debe usarlo.

### Configuración

| Variable                                        | Uso                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD | Credenciales del contenedor PostgreSQL                                                          |
| DATABASE_URL                                    | Conexión para desarrollo fuera de Compose; Compose usa su conexión interna a `db`               |
| APP_PORT                                        | Puerto publicado del proxy; predeterminado 8080                                                 |
| APP_BIND_ADDRESS                                | Interfaz donde escucha el proxy; `0.0.0.0` permite acceso desde la red local                    |
| APP_URL                                         | URL usada para enlaces de recuperación; local por defecto                                       |
| SESSION_HOURS                                   | Duración de una sesión; 12 horas por defecto                                                    |
| COOKIE_SECURE                                   | `false` en HTTP local; `true` al publicar con HTTPS                                             |
| SMTP_HOST / SMTP_PORT                           | Servidor de correo; vacío deshabilita recuperación por mail                                     |
| SMTP_SECURE                                     | `true` para TLS desde el inicio, normalmente puerto 465; `false` para STARTTLS, normalmente 587 |
| SMTP_USER / SMTP_PASSWORD                       | Credenciales SMTP, opcionales para servidores locales de prueba                                 |
| MAIL_FROM                                       | Remitente autorizado por el proveedor                                                           |

Si se cambia el puerto o se accede desde otro equipo, actualizar `APP_URL` para que los enlaces
apunten al sitio correcto. Para acceder desde un celular, usar la IP del equipo y el puerto
configurado; la accesibilidad depende de WSL, Docker y el firewall del equipo. El diseño no requiere
instalar una app.

La guía [Ver Kairos desde el celular](docs/Red-local.md) incluye los pasos de Linux, Docker Desktop
y WSL con red NAT, y cómo revisar el firewall sin contratar dominio ni hosting.

### Arquitectura y archivos

Para revisar el código, empezar por [Understanding the codebase](docs/Codebase.md): incluye el mapa
de módulos, el recorrido de un guardado y una tabla para encontrar dónde hacer cada cambio.

- `public/`: interfaz HTML/CSS/JavaScript, sin compilación ni CDN.
- `public/search.js`: buscadores accesibles por nombre/DNI, con navegación por teclado y selección
  explícita.
- `public/batch.js`: asignación de registros de varios contenedores al lote REST existente.
- `server/index.js`: arranque del proceso, migraciones y tareas periódicas.
- `server/app.js`: configuración de Express y registro de middleware/rutas.
- `server/routes/`: endpoints separados por acceso, catálogo, usuarios, horas, auditoría,
  notificaciones y exportaciones.
- `server/services/`: consultas compartidas, auditoría, locks transaccionales y generación de
  archivos.
- `public/views/`: pantallas; `public/core/`: estado, HTTP y navegación; `public/components/`:
  controles compartidos; `public/styles/`: hojas CSS por responsabilidad.
- `server/domain.js`: normalización y reglas de advertencia.
- `server/schema.sql`: esquema PostgreSQL; creación inicial idempotente, versión 1.
- `server/admin.js`: creación inicial y recuperación administrativa local.
- `test/`: pruebas de lógica e integración.
- `docs/openapi.json`: contrato REST OpenAPI 3.1.1, versión 1.0.0, independiente de la interfaz.
- `docs/Contrato-API.md`: autenticación, compatibilidad y pruebas para reemplazar el backend.
- `docs/Manual-de-uso.md`: manual de usuario versionable para GitHub.
- `docs/Manual-de-uso.docx`: copia del manual para entregar.
- `requerimientos/`: alcance funcional y Word de requisitos.

El proxy Nginx es el único servicio publicado. El backend y PostgreSQL permanecen en la red de
Compose. Los datos sobreviven al reinicio mediante `postgres_data`. No ejecutar
`docker compose down -v` sobre datos que deban conservarse.

Las fechas de trabajo se guardan como `date`, los horarios sin zona y las duraciones como minutos
enteros. Los instantes de auditoría se guardan como `timestamptz` y se muestran en Argentina. El
servidor calcula el día actual en `America/Argentina/Buenos_Aires`.

### Reglas de escritura

- Lotes de hasta 100 filas, transaccionales: ante errores no se guarda ninguna.
- La interfaz agrupa las filas por persona y las envía aplanadas al mismo POST /api/records/batch.
  El límite es por carga completa, no por contenedor. El contrato REST y los datos existentes se
  conservan.
- Advertencias por empleado/fecha/lugar coincidentes, superposición y duración individual superior a
  540 minutos. No bloquean si se confirman.
- Validación de advertencias en el servidor, repetida al confirmar si cambian los registros
  relacionados.
- Identificador de solicitud para evitar doble guardado del mismo lote, incluso tras un reintento de
  red.
- Edición con versión del registro: no se sobreescriben silenciosamente cambios de otro usuario.
- Borrado lógico y auditoría con valores anteriores/posteriores, usuario y momento.
- Bloqueos transaccionales coordinan registros y cambios administrativos. Esta primera versión
  prioriza consistencia y un volumen de uso interno; todas las escrituras de registros se
  serializan.
- Las notificaciones son internas: altas, modificaciones, eliminaciones y advertencias confirmadas.
  Se filtran por motivo, estado, usuario, empleado, lugar y fechas de la notificación.

### Seguridad

Contraseñas con scrypt y sal aleatoria. Sesiones opacas almacenadas mediante hash, cookie HttpOnly y
SameSite Strict, verificación de permisos del lado del servidor y límites de intentos para
acceso/recuperación. Las mutaciones requieren el encabezado del cliente y no aceptan solicitudes del
navegador desde otro sitio. No se habilita CORS. Los enlaces de recuperación vencen a los 30 minutos
y son de un solo uso. No se registran contraseñas ni tokens en auditoría.

Para publicar kairoshoras.com en Vultr con el Nginx existente, Let's Encrypt y renovación
automática, seguir [HTTPS en Vultr](docs/HTTPS-Vultr.md). El procedimiento conserva el volumen
PostgreSQL, verifica HTTPS antes de activar cookies seguras y elimina la publicación de 8080 al
finalizar. SMTP y la operación de copias de seguridad se configuran por separado. El HTTP local
sigue disponible para desarrollo sin activar el override de producción.

## Pruebas

Con Node.js 22:

```bash
npm test
npm run check
npm run test:contract
npm run format:check
```

Las pruebas de dominio no requieren instalar dependencias ni tener base de datos.

`npm run check` revisa la sintaxis de todos los módulos. El objetivo de formato es aproximadamente
100 caracteres por línea, con excepciones razonables para URLs y cadenas indivisibles; no hay un
límite rígido de caracteres. Las pruebas de estructura verifican las importaciones relativas.
`npm run format` y `npm run format:check` usan Prettier (dependencia de desarrollo); los comandos de
formato requieren instalar esas dependencias.

Las pruebas de frontend comprueban homónimos, búsquedas con acentos/DNI y la asignación de registros
a varias personas. La prueba de navegador es opcional: definir `KAIROS_UI_TEST=1` y ejecutar
`npm run test:ui`. Requiere Chrome instalado (o indicar `CHROME_PATH`). Usa datos simulados, sin
tocar la API real, e inicia un perfil aislado dentro de `test-results/`; allí genera
`mobile-batches.png` si completa el recorrido. Esta sesión no logró activar el renderer de Chrome
por su canal de depuración, por lo que la prueba visual no está verificada. Sin activación explícita
o sin navegador, se omite.

Para aplicar cambios de interfaz con el despliegue actual, ejecutar
`docker compose up -d --build app` y recargar el navegador. En Windows usar Ctrl+F5; en el celular
recargar o volver a abrir la pestaña. La imagen contiene una copia del código: no se actualiza con
solo editar los archivos. La reconstrucción no elimina el volumen de PostgreSQL.

El [contrato REST y su guía](docs/Contrato-API.md) permiten comprobar también otra implementación
por HTTP mediante `KAIROS_API_URL`. Las pruebas estáticas del contrato no agregan dependencias. La
suite HTTP opcional necesita una cuenta administradora y hace consultas y descargas; no modifica
datos de negocio. Las credenciales se proporcionan por variables de entorno y no se guardan en el
repositorio.

Para el conjunto de integración, instalar dependencias y disponer de un PostgreSQL de prueba:

```bash
npm install
TEST_DATABASE_URL='postgres://usuario:clave@localhost:5432/base_de_pruebas' npm test
```

El test crea un esquema aislado con nombre aleatorio y lo elimina al terminar. El usuario necesita
permiso para crear esquemas. No usar credenciales productivas. Sin `TEST_DATABASE_URL`, la prueba de
integración se omite explícitamente. Comprueba permisos, lote, advertencias, reintento, edición
concurrente, eliminación, auditoría, notificaciones y archivos exportados. Incluye un servidor SMTP
local de prueba para comprobar el envío del enlace, su uso único y el cierre de sesiones al
restablecer la contraseña; no envía correos reales.

También se puede ejecutar en el entorno local de Compose, sin instalar Node en WSL, una vez
construida y levantada la aplicación:

```bash
docker compose exec -T app sh -c 'TEST_DATABASE_URL="$DATABASE_URL" node --test'
```

Usar este comando solo en la instalación local de prueba, no en el servidor definitivo. El servidor
temporal del test usa el puerto interno 3199 y un esquema independiente.

Para desarrollo fuera de Docker: levantar PostgreSQL accesible, configurar `DATABASE_URL` en `.env`,
ejecutar `npm install`, crear administrador con `npm run admin -- create correo "Nombre"` pasando la
clave por stdin, y ejecutar `npm start`. Abrir el puerto 3000; ajustar `APP_URL` en consecuencia.

## Copias y restauración

Desde Bash, con los servicios encendidos:

```bash
bash scripts/backup.sh
```

Se genera un dump binario de PostgreSQL en `backups/` (excluido de Git). Copiar esos archivos a un
destino seguro independiente del equipo. La programación, retención y almacenamiento externo se
acuerdan para el hosting definitivo.

Para comprobar una restauración sin tocar la base de trabajo:

```bash
bash scripts/verify-backup.sh backups/ARCHIVO.dump
```

El script crea una base temporal, restaura y muestra conteos de registros y auditoría, y elimina
únicamente esa base temporal al terminar. La restauración debe probarse en el entorno objetivo antes
de considerar verificado el respaldo.

Ante una recuperación real, detener `app`, preservar el estado existente y restaurar primero en una
base nueva mediante `pg_restore`. Cambiar la conexión hacia esa base verificada y volver a iniciar.
No hay un comando automático que sobrescriba la base de trabajo.

## Entrega y operación

Consultar el [manual de uso](docs/Manual-de-uso.md) y los
[requisitos](requerimientos/Requerimientos-Kairos.md). Los archivos Word son los documentos para
entregar; Markdown permite versionarlos en GitHub.

No hay cola offline ni persistencia local de formularios: ante pérdida de red se conservan las filas
mientras la página permanece abierta. Cerrar o recargar puede perder la carga. La exportación admite
hasta 10.000 registros por archivo; para volúmenes superiores, reducir el período. Los listados se
paginan de a 50 filas.

La configuración HTTPS para Vultr está preparada en el repositorio; su ejecución y validación final
deben realizarse en el servidor siguiendo la guía. El proveedor de correo sigue pendiente. El
componente `public/components/brand.js` presenta el logo junto al texto «Herramienta de gestión»,
sin el antiguo chip HORAS. El SVG y el icono siguen la referencia de mayor resolución conservada en
`public/assets/kairos-logo-reference.png`; las letras también son trazados vectoriales para no
depender de fuentes instaladas.
