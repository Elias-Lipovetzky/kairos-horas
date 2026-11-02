# Kairos · Registro de horas

Aplicación mobile first para registrar horas por empleado y lugar. Incluye carga en lote, roles administrador/RR. HH., auditoría, borrado lógico, notificaciones filtrables, Excel y PDF. Los descansos, tarifas, horas extra y uso sin conexión quedan fuera del alcance.

## Estado y validación

Implementación inicial. Las pruebas de lógica y la comprobación sintáctica se ejecutaron correctamente en el entorno de desarrollo. Todavía no se ejecutó la aplicación completa contra PostgreSQL ni se verificó visualmente en navegador: el entorno de trabajo no permite acceder a npm, no tiene motor Docker activo y no permite acceder a WSL. No se presenta como una entrega validada de extremo a extremo.

No hay credenciales predeterminadas, datos ficticios precargados ni correo obligatorio. La recuperación de contraseña está implementada y necesita un servidor SMTP para enviar mensajes; el acceso y las demás operaciones funcionan sin SMTP.

## Manual técnico · Inicio en Linux/WSL

Requisitos: Linux con Docker Engine y Docker Compose v2, o Docker Desktop integrado con la distribución WSL. Ejecutar estos comandos desde la carpeta del proyecto dentro de WSL. El puerto 8080 debe estar libre.

```bash
cp .env.example .env
openssl rand -hex 24
```

Editar `.env`: reemplazar `POSTGRES_PASSWORD` por la clave generada, y usar la misma clave en `DATABASE_URL`. Usar una contraseña hexadecimal evita problemas de caracteres reservados en la URL. No subir `.env` a GitHub.

```bash
docker compose up --build -d
docker compose logs --tail=100 app
```

Abrir <http://localhost:8080>. El esquema se crea automáticamente en el primer inicio; no se necesita dominio ni hosting externo. Las versiones principales de las imágenes están indicadas en `compose.yaml` y `Dockerfile`.

La instalación de paquetes en este entorno no pudo completarse y no se generó un `package-lock.json`. El Dockerfile usa `npm install` cuando no existe lock. En un entorno con red, ejecutar `npm install`, revisar el resultado y conservar `package-lock.json` en Git; a partir de entonces la construcción usa `npm ci` para fijar también dependencias transitivas.

### Crear el primer administrador

Desde Bash en WSL, ingresar la contraseña sin mostrarla ni guardarla como argumento o en el historial:

```bash
read -r -s -p 'Contraseña inicial (mínimo 12 caracteres): ' KAIROS_BOOTSTRAP_PASSWORD
echo
printf '%s' "$KAIROS_BOOTSTRAP_PASSWORD" | docker compose exec -T app node server/admin.js create admin@kairos.local "Administrador"
unset KAIROS_BOOTSTRAP_PASSWORD
```

Ingresar con ese correo y contraseña. El correo puede ser local mientras no se use recuperación SMTP. Luego crear dueños, lugares, empleados y cuentas de RR. HH. desde Administración.

Para restablecer una contraseña sin correo, repetir la lectura segura anterior y cambiar `create` por `reset`, usando el correo existente. `reset` cambia la contraseña y cierra las sesiones, pero no reactiva una cuenta ni cambia su rol. La operación queda registrada como procedimiento local. Solo un operador con acceso autorizado al servidor debe usarlo.

### Configuración

| Variable | Uso |
| --- | --- |
| POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD | Credenciales del contenedor PostgreSQL |
| DATABASE_URL | Conexión para desarrollo fuera de Compose; Compose usa su conexión interna a `db` |
| APP_PORT | Puerto publicado del proxy; predeterminado 8080 |
| APP_BIND_ADDRESS | Interfaz donde escucha el proxy; `0.0.0.0` permite acceso desde la red local |
| APP_URL | URL usada para enlaces de recuperación; local por defecto |
| SESSION_HOURS | Duración de una sesión; 12 horas por defecto |
| COOKIE_SECURE | `false` en HTTP local; `true` al publicar con HTTPS |
| SMTP_HOST / SMTP_PORT | Servidor de correo; vacío deshabilita recuperación por mail |
| SMTP_SECURE | `true` para TLS desde el inicio, normalmente puerto 465; `false` para STARTTLS, normalmente 587 |
| SMTP_USER / SMTP_PASSWORD | Credenciales SMTP, opcionales para servidores locales de prueba |
| MAIL_FROM | Remitente autorizado por el proveedor |

Si se cambia el puerto o se accede desde otro equipo, actualizar `APP_URL` para que los enlaces apunten al sitio correcto. Para acceder desde un celular, usar la IP del equipo y el puerto configurado; la accesibilidad depende de WSL, Docker y el firewall del equipo. El diseño no requiere instalar una app.

La guía [Ver Kairos desde el celular](docs/Red-local.md) incluye los pasos de Linux, Docker Desktop y WSL con red NAT, y cómo revisar el firewall sin contratar dominio ni hosting.

### Arquitectura y archivos

- `public/`: interfaz HTML/CSS/JavaScript, sin compilación ni CDN.
- `server/index.js`: API Express, sesiones, administración, operaciones y exportación.
- `server/domain.js`: normalización y reglas de advertencia.
- `server/schema.sql`: esquema PostgreSQL; creación inicial idempotente, versión 1.
- `server/admin.js`: creación inicial y recuperación administrativa local.
- `test/`: pruebas de lógica e integración.
- `docs/Manual-de-uso.md`: manual de usuario versionable para GitHub.
- `docs/Manual-de-uso.docx`: copia del manual para entregar.
- `requerimientos/`: alcance funcional y Word de requisitos.

El proxy Nginx es el único servicio publicado. El backend y PostgreSQL permanecen en la red de Compose. Los datos sobreviven al reinicio mediante `postgres_data`. No ejecutar `docker compose down -v` sobre datos que deban conservarse.

Las fechas de trabajo se guardan como `date`, los horarios sin zona y las duraciones como minutos enteros. Los instantes de auditoría se guardan como `timestamptz` y se muestran en Argentina. El servidor calcula el día actual en `America/Argentina/Buenos_Aires`.

### Reglas de escritura

- Lotes de hasta 100 filas, transaccionales: ante errores no se guarda ninguna.
- Advertencias por empleado/fecha/lugar coincidentes, superposición y duración individual superior a 540 minutos. No bloquean si se confirman.
- Validación de advertencias en el servidor, repetida al confirmar si cambian los registros relacionados.
- Identificador de solicitud para evitar doble guardado del mismo lote, incluso tras un reintento de red.
- Edición con versión del registro: no se sobreescriben silenciosamente cambios de otro usuario.
- Borrado lógico y auditoría con valores anteriores/posteriores, usuario y momento.
- Bloqueos transaccionales coordinan registros y cambios administrativos. Esta primera versión prioriza consistencia y un volumen de uso interno; todas las escrituras de registros se serializan.
- Las notificaciones son internas: altas, modificaciones, eliminaciones y advertencias confirmadas. Se filtran por motivo, estado, usuario, empleado, lugar y fechas de la notificación.

### Seguridad

Contraseñas con scrypt y sal aleatoria. Sesiones opacas almacenadas mediante hash, cookie HttpOnly y SameSite Strict, verificación de permisos del lado del servidor y límites de intentos para acceso/recuperación. Las mutaciones requieren el encabezado del cliente y no aceptan solicitudes del navegador desde otro sitio. No se habilita CORS. Los enlaces de recuperación vencen a los 30 minutos y son de un solo uso. No se registran contraseñas ni tokens en auditoría.

Al publicar en la segunda etapa se debe agregar HTTPS, configurar `COOKIE_SECURE=true`, `APP_URL`, SMTP y la operación de copias de seguridad. El HTTP local sirve para desarrollo y uso en un entorno de confianza.

## Pruebas

Con Node.js 22:

```bash
npm test
npm run check
```

Las pruebas de dominio no requieren instalar dependencias ni tener base de datos. Para el conjunto de integración, instalar dependencias y disponer de un PostgreSQL de prueba:

```bash
npm install
TEST_DATABASE_URL='postgres://usuario:clave@localhost:5432/base_de_pruebas' npm test
```

El test crea un esquema aislado con nombre aleatorio y lo elimina al terminar. El usuario necesita permiso para crear esquemas. No usar credenciales productivas. Sin `TEST_DATABASE_URL`, la prueba de integración se omite explícitamente. Comprueba permisos, lote, advertencias, reintento, edición concurrente, eliminación, auditoría, notificaciones y archivos exportados. Incluye un servidor SMTP local de prueba para comprobar el envío del enlace, su uso único y el cierre de sesiones al restablecer la contraseña; no envía correos reales.

También se puede ejecutar en el entorno local de Compose, sin instalar Node en WSL, una vez construida y levantada la aplicación:

```bash
docker compose exec -T app sh -c 'TEST_DATABASE_URL="$DATABASE_URL" node --test'
```

Usar este comando solo en la instalación local de prueba, no en el servidor definitivo. El servidor temporal del test usa el puerto interno 3199 y un esquema independiente.

Para desarrollo fuera de Docker: levantar PostgreSQL accesible, configurar `DATABASE_URL` en `.env`, ejecutar `npm install`, crear administrador con `npm run admin -- create correo "Nombre"` pasando la clave por stdin, y ejecutar `npm start`. Abrir el puerto 3000; ajustar `APP_URL` en consecuencia.

## Copias y restauración

Desde Bash, con los servicios encendidos:

```bash
bash scripts/backup.sh
```

Se genera un dump binario de PostgreSQL en `backups/` (excluido de Git). Copiar esos archivos a un destino seguro independiente del equipo. La programación, retención y almacenamiento externo se acuerdan para el hosting definitivo.

Para comprobar una restauración sin tocar la base de trabajo:

```bash
bash scripts/verify-backup.sh backups/ARCHIVO.dump
```

El script crea una base temporal, restaura y muestra conteos de registros y auditoría, y elimina únicamente esa base temporal al terminar. La restauración debe probarse en el entorno objetivo antes de considerar verificado el respaldo.

Ante una recuperación real, detener `app`, preservar el estado existente y restaurar primero en una base nueva mediante `pg_restore`. Cambiar la conexión hacia esa base verificada y volver a iniciar. No hay un comando automático que sobrescriba la base de trabajo.

## Entrega y operación

Consultar el [manual de uso](docs/Manual-de-uso.md) y los [requisitos](requerimientos/Requerimientos-Kairos.md). Los archivos Word son los documentos para entregar; Markdown permite versionarlos en GitHub.

No hay cola offline ni persistencia local de formularios: ante pérdida de red se conservan las filas mientras la página permanece abierta. Cerrar o recargar puede perder la carga. La exportación admite hasta 10.000 registros por archivo; para volúmenes superiores, reducir el período. Los listados se paginan de a 50 filas.

Dominio, contratación de hosting, proveedor de correo, HTTPS y validación final en ese entorno corresponden a la segunda etapa. No están simulados ni se dan por configurados.
