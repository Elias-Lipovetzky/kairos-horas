# Contrato REST de Kairos

Versión del contrato: 1.2.0. Descripción técnica: [OpenAPI 3.1.1 en JSON](openapi.json).

Este contrato documenta la aplicación existente. Separa lo que un consumidor necesita saber de
Express, Node.js, PostgreSQL y del diseño de la interfaz. No cambia rutas ni exige actualizar el
frontend actual.

## Fuente de verdad y alcance

`docs/openapi.json` define las rutas, métodos, parámetros, cuerpos, respuestas, autenticación y
roles de la API. Se puede importar en herramientas que acepten OpenAPI 3.1. El formato sigue la
[especificación oficial](https://spec.openapis.org/oas/v3.1.1.html).

La base actual es `/api`, por ejemplo `http://localhost:8080/api`. El contrato tiene versión aunque
las rutas existentes no tengan `/v1`. No se renombraron las rutas para introducir versionado.

La interfaz puede cambiar su diseño, navegación y componentes conservando este contrato. Un backend
nuevo puede implementar las mismas operaciones sin copiar el esquema interno de tablas. Los
consumidores no deben conectarse directamente a la base ni asumir cómo se generan los IDs.

La interfaz 1.1 organiza la carga en varios contenedores por persona. Envía todas sus filas
aplanadas a POST /records/batch, cada una con su propio employee_id; no se agregó una estructura de
grupos al cuerpo REST. El máximo de 100 filas y la transacción única abarcan todos los contenedores.
Para mostrar errors[].row y warnings[].row, el cliente traduce el índice global a la persona y al
registro dentro de su bloque.

## Convenciones

| Elemento                      | Regla                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Cuerpos                       | JSON UTF-8, `Content-Type: application/json`                                                               |
| Mutaciones                    | Encabezado `X-Kairos-Client: web`, también en login y recuperación                                         |
| Autenticación                 | Cookie opaca `kairos`, obtenida en `/login`; HttpOnly, SameSite=Strict                                     |
| Roles                         | `admin` y `rrhh`; las operaciones exclusivas llevan `x-roles: [admin]`                                     |
| Identificadores de negocio    | UUID como cadena, sin inferir identidad por nombre                                                         |
| IDs de auditoría/notificación | Cadenas decimales; pueden superar la precisión de un Number                                                |
| Fechas de trabajo             | `YYYY-MM-DD`, interpretadas en Argentina, sin fechas futuras                                               |
| Horarios del registro         | `HH:mm`, del mismo día, ambos informados o ambos ausentes                                                  |
| Auditoría                     | Instantes ISO 8601 con zona; los snapshots pueden contener fechas y horarios históricos con otra precisión |
| Duración                      | Minutos enteros; la interfaz decide cómo mostrarlos                                                        |
| Paginación                    | `page=0` es la primera; tamaño fijo de 50                                                                  |
| Exportación                   | Archivo PDF o Excel; MIME y nombre de descarga definidos                                                   |

El catálogo no se pagina. `/audit` devuelve directamente un arreglo por página. `/records` y
`/notifications` devuelven un objeto con resultados, `count` y `page`. En registros, `minutes` suma
todos los resultados del filtro, no solo los visibles en una página.

La autenticación actual está pensada para el navegador del mismo origen. No hay JWT, OAuth, API key
de servicio ni CORS configurado. Para integrar el sistema mayor habrá que resolver usuarios y
sesiones: conservar esta frontera mediante un adaptador o acordar una nueva versión. Una base
separada no resuelve por sí sola ese punto.

### Orden y presentación de fechas

GET /records, /notifications y /export/{format} aceptan el parámetro opcional sort: date_desc,
date_asc, employee_asc, employee_desc, place_asc o place_desc. El orden se aplica antes de paginar y
se desempata por ID. Registros usa la fecha trabajada; Notificaciones usa created_at. Sin sort,
ambos listados muestran los más recientes; la exportación conserva su orden anterior
empleado/fecha/lugar. GET /audit admite date_desc (por defecto) y date_asc. Un valor de orden
desconocido devuelve 400.

La interfaz, Excel y PDF presentan fechas dd/mm/aaaa. Los formularios traducen ese formato a
YYYY-MM-DD antes de enviar el JSON o los filtros. La API mantiene fechas ISO e instantes con zona,
sin cambiar los cuerpos existentes. La interfaz envía a exportación el mismo sort del listado.

Content-Disposition en las exportaciones incluye los nombres del empleado y lugar filtrados y el
período en ddmm, sin año: kairos-horas-Mariela-0111-al-0711.xlsx, por ejemplo. Los nombres se
resuelven en el servidor, incluso sin resultados. Sin filtros se conserva kairos-horas.xlsx o .pdf.
Se incluye filename ASCII y filename\* UTF-8 para conservar acentos y ñ. La interfaz respeta ese
encabezado al descargar, sin sobrescribir el nombre. Los filtros de fecha de la API siguen siendo
ISO.

### Solicitud de cuenta

POST /signup recibe name, email y password y crea una cuenta rrhh inactiva con
registration_pending=true. Campos enviados como role=admin o active=true no conceden esos permisos.
La respuesta 200 es un mensaje, no abre sesión ni entrega una cookie. El correo debe ser único y se
limitan los intentos por IP y correo. El administrador aprueba mediante PUT /users/{id} con
active=true, lo que retira la marca de solicitud pendiente. Hasta entonces el login devuelve 401. No
depende de SMTP. GET /users añade registration_pending como campo opcional de respuesta.

## Cargar un lote y confirmar advertencias

El cliente genera un UUID nuevo para `submission_id` por operación, lo conserva ante errores de red
y envía de 1 a 100 filas:

```json
{
  "submission_id": "11111111-1111-4111-8111-111111111111",
  "records": [
    {
      "employee_id": "22222222-2222-4222-8222-222222222222",
      "place_id": "33333333-3333-4333-8333-333333333333",
      "date": "2026-01-20",
      "minutes": 541,
      "start_time": null,
      "end_time": null
    }
  ]
}
```

Una advertencia no se descarta ni se guarda silenciosamente. El servidor devuelve `409`:

```json
{
  "message": "Revisá las advertencias y confirmá para guardar.",
  "warnings": [
    { "reason": "long_duration", "message": "Este registro supera las 9 horas.", "row": 0 }
  ],
  "warning_token": "valor-opaco-devuelto-por-el-servidor"
}
```

Luego de la confirmación del usuario, reenviar las mismas filas y `submission_id`, agregando
`warning_token`. El token es opaco: no copiar el algoritmo del backend ni generarlo en el cliente.
Si cambian registros relacionados, el servidor puede pedir otra confirmación.

Un guardado exitoso devuelve `200` con `ids` y `message`. Un reintento de la misma operación
devuelve los mismos IDs. El alcance de esta garantía es el mismo usuario, submission_id y filas
normalizadas. Reutilizar el ID con otros datos produce `409` con `reset_submission: true`; revisar
qué se guardó antes de iniciar otra operación.

En la modalidad con horarios, el servidor calcula la duración aunque el cliente envíe otro total.
Para la modalidad sin horarios se requiere una duración positiva. Las reglas semánticas adicionales
—fecha no futura, salida posterior, entidades activas, exactamente un dueño principal, DNI
normalizado y único— están descritas en OpenAPI; no todas se pueden expresar únicamente con tipos
JSON.

## Errores y concurrencia

| Estado                     | Tratamiento del consumidor                                                         |
| -------------------------- | ---------------------------------------------------------------------------------- |
| 400                        | Corregir datos. En lotes, `errors[].row` señala una fila con índice basado en cero |
| 401                        | Volver a iniciar sesión                                                            |
| 403                        | Revisar permisos, encabezado de cliente u origen de la solicitud                   |
| 404                        | Entidad o registro inexistente; un registro eliminado ya no es editable            |
| 409 con `warnings`         | Mostrar y confirmar las advertencias con el token recibido                         |
| 409 con `reset_submission` | El ID de solicitud ya se usó con otro contenido/usuario                            |
| Otro 409                   | Conflicto, por ejemplo versión obsoleta o DNI/correo repetido                      |
| 413                        | Reducir el tamaño del cuerpo JSON; límite actual de 512 KiB                        |
| 429                        | Esperar; los límites actuales usan ventanas de 15 minutos                          |
| 503 en recuperación        | Correo aún no configurado; las demás operaciones siguen disponibles                |
| 500 o fallo de red         | Operación no confirmada; reintentar un lote conservando su submission_id           |

Todas las respuestas de error incluyen `message`. No usar su redacción para tomar decisiones de
máquina: el texto puede cambiar. La versión actual no tiene un campo `code` universal; incorporarlo
en el futuro sería una ampliación, no un campo que el consumidor pueda asumir hoy.

Editar y eliminar requieren `version`, obtenida del registro consultado. Una versión obsoleta
produce `409` y exige volver a leer. Después de guardar una edición, volver a consultar para obtener
la nueva versión; la respuesta de escritura actual es un mensaje y no el registro completo.

La eliminación es lógica. Las consultas y exportaciones la excluyen, mientras que historial y
notificaciones conservan los eventos. Las notificaciones incluyen altas, modificaciones,
eliminaciones y advertencias; marcar revisado no altera el registro. `from/to` en notificaciones
filtra el momento del evento, no la fecha trabajada.

## Compatibilidad durante los cambios futuros

- Conservar nombres, métodos, tipos, campos obligatorios, significado de null, unidades, estados
  HTTP y reglas de negocio del contrato 1.x.
- Permitir campos nuevos opcionales. Los consumidores deben ignorar los campos que no usan y no
  reenviar snapshots de auditoría como datos de escritura.
- Tratar como cambio incompatible: retirar o renombrar un campo, cambiar minutos por horas, cambiar
  una cadena decimal por número, alterar la confirmación de advertencias, quitar la cookie sin
  adaptación o modificar el cuerpo de paginación.
- Evaluar expresamente valores nuevos de enum; no asumir que todos los consumidores toleran nuevos
  motivos o roles.
- Para cambios incompatibles, acordar una versión mayor y una ruta nueva o adaptador, manteniendo la
  versión anterior durante la transición. No migrar todos los consumidores de forma implícita.
- Acordar con el sistema mayor la identidad de empleados/usuarios, autenticación, permisos y la
  migración de datos. Conservar los IDs existentes o documentar un mapeo explícito; no reconstruir
  identidades por nombres.

## Pruebas del contrato

Las pruebas son herramientas de desarrollo y no obligan a que el backend final siga hecho en
Node.js.

### Sin servicios externos

```bash
npm run test:contract
```

Comprueba correspondencia entre rutas actuales y documentación, referencias, roles, parámetros,
muestras válidas e inválidas y tipos de respuesta. No necesita npm install. El validador interno
comprueba el subconjunto de palabras clave JSON Schema usado por este archivo y rechaza palabras
nuevas no soportadas; no se presenta como un validador general ni como certificación completa de
OpenAPI. Las reglas semánticas se comprueban además con las pruebas de dominio e integración.

### Contra cualquier backend compatible, sin modificar datos de negocio

Desde PowerShell, usar credenciales de una cuenta administradora. Se crea y se cierra solamente la
sesión de prueba; no se crean empleados, lugares ni registros:

```powershell
$credencial = Get-Credential -Message 'Administrador para verificar el contrato REST'
$env:KAIROS_API_URL = 'http://localhost:8080/api'
$env:KAIROS_TEST_EMAIL = $credencial.UserName
$env:KAIROS_TEST_PASSWORD = $credencial.GetNetworkCredential().Password
try {
    npm.cmd run test:contract
} finally {
    Remove-Item Env:KAIROS_API_URL,Env:KAIROS_TEST_EMAIL,Env:KAIROS_TEST_PASSWORD
    Remove-Variable credencial
}
```

La suite HTTP comprueba servicio, autenticación, catálogo, usuarios, registros, auditoría,
notificaciones, errores y descargas. Valida las filas presentes; un conjunto vacío no demuestra el
esquema de una fila real. Para cubrir escritura y respuestas con datos representativos, usar también
integración aislada.

Para el backend futuro, cambiar `KAIROS_API_URL` y usar una cuenta administradora equivalente. La
suite HTTP usa solo el protocolo; la comprobación estática de rutas contra `server/routes/*.js`
corresponde únicamente a la implementación actual.

### Escrituras en PostgreSQL aislado

```bash
TEST_DATABASE_URL='postgres://usuario:clave@localhost:5432/base_de_pruebas' npm test
```

Las solicitudes y respuestas de la integración existente también se validan contra OpenAPI: creación
de entidades, permisos de RR. HH., advertencias, reintentos, edición concurrente, borrado, auditoría
y recuperación con SMTP de prueba. Esa suite prepara el backend Node actual y un esquema temporal;
al reemplazarlo habrá que adaptar la preparación del entorno, conservando los escenarios HTTP y el
contrato.

En una construcción local de Compose con estos archivos actualizados:

```bash
docker compose exec -T app sh -c 'TEST_DATABASE_URL="$DATABASE_URL" node --test'
```

Nunca ejecutar la integración de escritura usando la conexión del sistema definitivo. Sin las
variables correspondientes las suites HTTP o de integración se omiten explícitamente; una omisión no
cuenta como validación exitosa del servicio.

El workflow `.github/workflows/tests.yml` prepara PostgreSQL temporal y ejecuta estas comprobaciones
al subir cambios o abrir una pull request. No usa credenciales reales. Queda configurado en el
repositorio; su primera ejecución requiere subir los archivos a GitHub.

## Estado verificado

El contrato inicial se contrastó por HTTP con la API local existente en noviembre de 2026, usando
consultas y descargas. La interfaz y las tablas no se modificaron como parte de este trabajo. La
suite de escritura contra PostgreSQL queda preparada para el entorno aislado y no se ejecutó contra
los datos de prueba que está usando el usuario.
