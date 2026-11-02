# Registro de horas — Kairos

Versión: 1.0 — 2 de noviembre de 2026.

Estado: especificación funcional consolidada para Kairos. Las reglas confirmadas se distinguen de las propuestas técnicas que completan los detalles operativos. Este documento define el alcance funcional; no fija precio, plazo, obligaciones comerciales ni acredita aceptación contractual.

## Objetivo y alcance

Aplicación mobile first para registrar, consultar, corregir y exportar horas de empleados en distintos lugares. La primera versión requiere conexión a Internet.

No incluye tarifas, liquidaciones, cálculo de horas extra ni turnos nocturnos que crucen medianoche.

Los descansos quedan fuera del alcance: no se registran, calculan ni descuentan por separado. Se conserva la duración informada o calculada del registro.

## Datos

- Empleado: ID interno, nombre y apellido, DNI obligatorio y único, y teléfono. Puede haber empleados con el mismo nombre.
- Lugar: ID interno, nombre, dirección y dueños asociados. Puede tener varios dueños y uno debe ser el principal.
- Dueño: ID interno, nombre y teléfono.
- Registro: ID interno, empleado, fecha, lugar, entrada opcional, salida opcional y duración total obligatoria.
- Usuario: cuenta que opera la aplicación, con rol administrador o Recursos Humanos. Debe distinguirse de la entidad empleado.
- Al mostrar un registro se incluye el día de la semana correspondiente a su fecha.

## Carga y consulta

- Permitir cargar solo la duración total, sin entrada ni salida.
- En la modalidad de solo duración, entrada y salida quedan vacías. En la modalidad con horarios deben informarse ambos; no se permite un único horario.
- Al ingresar entrada y salida, calcular automáticamente la duración total, sin edición manual del resultado. Para informar una duración distinta se utiliza la modalidad de solo total, sin horarios.
- Permitir carga en lote, agrupada por empleado: seleccionar una persona una vez y agregar varias filas con sus lugares, fechas y horas.
- Ante errores en un lote, conservar todas las filas y señalar las que necesitan corrección. Para guardar filas con advertencias, solicitar confirmación explícita.
- Priorizar este flujo tanto en celular como en escritorio.
- Permitir buscar y consultar registros por empleado o lugar y modificarlos fácilmente.

## Validaciones

- No aceptar fechas futuras.
- Los horarios de entrada y salida corresponden al mismo día; no admitir una salida anterior a la entrada.
- Advertir sobre posibles duplicados, sin impedir su registro.
- Advertir sobre horarios superpuestos, sin impedir su registro.
- Advertir cuando la duración de un registro sea mayor a 9 horas, sin impedir guardarlo, y notificar al administrador. El umbral se aplica individualmente a cada registro en un lugar; no se suman registros de un lote ni las horas diarias del empleado. Exactamente 9 horas no genera esta advertencia.
- Los criterios concretos de duplicado y superposición se detallan en las propuestas operativas. Los registros sin horarios no permiten comprobar superposición horaria.

## Roles y acceso

- Administrador: tiene todos los permisos de Recursos Humanos y puede agregar empleados y lugares.
- Recursos Humanos: puede registrar, modificar y borrar registros de horas.
- Las modificaciones y eliminaciones realizadas por Recursos Humanos deben notificarse al administrador.
- Usar sesiones de usuario y recuperación de contraseña por correo electrónico.
- La aplicación debe iniciar y permitir sus operaciones habituales sin dominio propio ni servicio de correo configurado. La recuperación por correo debe estar implementada y habilitarse al configurar el proveedor; mientras no esté configurado, informar su indisponibilidad sin simular envíos exitosos. El acceso con cuentas existentes no depende del correo.
- La administración de cuentas, edición de entidades, sesiones y acceso inicial se detallan en las propuestas operativas.

## Historial y notificaciones

- Mantener un historial de cambios atribuido directamente al usuario responsable, con fecha y hora.
- Incluir las altas, modificaciones y eliminaciones de registros para poder reconstruir su historia.
- Aplicar borrado lógico: los registros eliminados se excluyen de consultas habituales y exportaciones, pero se conservan con sus datos y con el usuario, fecha y hora de eliminación en el historial.
- El administrador dispone de una cola de notificaciones asociadas a los registros afectados.
- La cola incluye modificaciones y eliminaciones realizadas por Recursos Humanos y advertencias de duración excesiva, posibles duplicados y horarios superpuestos.
- Permitir filtrar las notificaciones por motivo para controlar el volumen mostrado.
- Las notificaciones de cambios muestran los valores anteriores y posteriores y enlazan al registro afectado, incluso si fue eliminado lógicamente.
- Las notificaciones tienen estado pendiente o revisado.

## Exportaciones

- Permitir elegir entre planilla y PDF.
- Las exportaciones deben servir para compartir con los empleados las horas registradas.
- Permitir filtrar por empleado, lugar y período. Incluir detalle de los registros seleccionados y total de horas.
- Se propone formato Excel (.xlsx) y las columnas detalladas en las propuestas operativas.

## Arquitectura y entregables

- Base de datos PostgreSQL.
- Frontend y backend con tecnología a definir.
- Despliegue mediante Docker Compose con un proxy.
- Entorno inicial: Linux bajo WSL (Windows Subsystem for Linux). Debe poder funcionar localmente sin dominio, hosting externo ni servicio de correo configurados.
- Dominio, hosting definitivo y proveedor de correo quedan por definir para una segunda etapa de despliegue. Esa definición no debe bloquear el desarrollo ni el funcionamiento local de las funcionalidades principales. La integración de recuperación por correo forma parte de la aplicación, aunque su operación depende de configurar el servicio posteriormente.
- Documento de requisitos específico para Kairos que sirva de base contractual una vez acordado.
- El documento final de requisitos se entrega en formato Word (.docx). Los archivos Markdown se destinan a la documentación del repositorio en GitHub.
- Manual de uso.
- Manual técnico en el README.

## Propuestas para completar los detalles operativos

Estas reglas completan aspectos no definidos expresamente y se proponen como base de implementación; no representan decisiones previamente confirmadas.

- Duplicado posible: mismo empleado, fecha y lugar, aunque las duraciones difieran. Puede ser válido que una persona vuelva al mismo lugar; por eso se advierte y se permite guardar con confirmación.
- Superposición: dos registros activos del mismo empleado y fecha, con ambos horarios informados, cuyos intervalos se cruzan, incluso en lugares distintos. Una salida que coincide con otra entrada no constituye superposición. Comparar también las filas del lote entre sí. Al editar, excluir el propio registro de las comparaciones.
- Sin horarios no se intenta inferir superposición a partir de la duración. Los registros borrados lógicamente no intervienen en las advertencias.
- Duración: guardar en minutos enteros positivos y mostrar horas y minutos. No aplicar redondeos comerciales. No aceptar duración cero, negativa o formatos inválidos. Las duraciones positivas superiores a 9 horas mantienen el tratamiento de advertencia, sin un rechazo adicional por su magnitud.
- Guardado en lote: validar el conjunto y no guardar ninguna fila mientras existan errores bloqueantes. Con las filas corregidas y las advertencias confirmadas, guardar el lote completo en una transacción. Ante fallos del servidor, conservar los datos en pantalla para reintentar. Evitar duplicar la operación ante un doble toque o reintento de la misma solicitud; esto no impide cargar deliberadamente un posible duplicado con advertencia.
- Campos obligatorios adicionales: nombre de lugar y nombre de cada dueño asociado. Dirección y teléfonos opcionales. Todo lugar tiene al menos un dueño y exactamente uno principal.
- El administrador puede crear, editar y desactivar empleados, lugares y dueños, y administrar cuentas y roles. RR. HH. puede consultar esos datos para operar, pero no modificarlos. Las entidades desactivadas conservan sus referencias históricas y no están disponibles para nuevas cargas.
- DNI: normalizar espacios y separadores antes de comprobar unicidad. Un empleado desactivado conserva su DNI y se reactiva si corresponde, en vez de crear otra identidad.
- Cuentas: correo único, nombre visible, rol y estado activo. Crear el primer administrador mediante un procedimiento local documentado, sin requerir correo saliente. Permitir establecer o restablecer credenciales mediante un procedimiento administrativo documentado cuando el correo no esté configurado.
- Sesiones: vencimiento configurable, cierre de sesión e invalidación al desactivar una cuenta o restablecer su contraseña. Recuperación con enlaces de uso único y vencimiento; no incluir contraseñas en correos, historial o notificaciones.
- Historial: conservar valores anteriores y posteriores, acción, ID del registro, ID del usuario y momento del cambio. No permitir editar o borrar ese historial desde la aplicación. Registrar también cambios administrativos en empleados, lugares, dueños y cuentas, sin almacenar secretos.
- Notificaciones: generar eventos por altas, modificaciones y bajas de registros, y por cada motivo de advertencia confirmado. Permitir combinar filtros de motivo, estado, usuario, empleado, lugar y período. Marcar revisado no modifica el registro ni elimina el historial. Las notificaciones son internas; no requieren correo.
- Exportación: planilla Excel (.xlsx) y PDF. Columnas: empleado, DNI, fecha, día de semana, lugar, entrada, salida y duración. Horarios ausentes se muestran vacíos. Los filtros pueden combinarse y el período incluye ambos extremos. El total debe admitir más de 24 horas sin reiniciarse. No incluir registros eliminados ni datos internos de auditoría.
- Fechas: usar America/Argentina/Buenos_Aires para interpretar el día actual y mostrar auditoría; conservar los instantes de auditoría en UTC. No permitir que la configuración horaria del celular eluda la validación del servidor.
- No incluir cierre mensual: permitir corregir períodos anteriores, con auditoría y notificaciones.
- Seguridad y operación: permisos verificados en el servidor, contraseñas almacenadas mediante hash, configuración y secretos mediante variables de entorno, y persistencia de PostgreSQL en un volumen de Docker.
- Copias de seguridad: entregar procedimientos documentados para generar una copia y restaurarla, con verificación de una restauración local. La programación automática y conservación de copias en hosting definitivo se define en la segunda etapa.

## Criterios de aceptación

1. Acceso y permisos: administrador y RR. HH. pueden iniciar y cerrar sesión. RR. HH. registra, corrige y elimina horas, pero no puede dar de alta empleados o lugares, incluso al invocar el backend directamente.
2. Identidad: dos empleados con el mismo nombre y distinto DNI pueden coexistir. No se permite repetir un DNI normalizado.
3. Carga por duración: guardar un registro con empleado, fecha, lugar y duración positiva, dejando entrada y salida vacías.
4. Carga por horarios: entrada 08:00 y salida 12:30 producen 4 horas y 30 minutos, sin edición manual del total. Un único horario informado produce un error de validación.
5. Fechas y jornadas: rechazar una fecha futura o una salida anterior a la entrada. No descontar descansos ni calcular tarifas u horas extra.
6. Umbral: 9 horas no genera advertencia de duración excesiva; 9 horas y 1 minuto sí. Dos registros de 5 horas no generan esa advertencia por su suma.
7. Duplicados y superposición: mostrar la advertencia correspondiente y permitir guardar tras confirmación. Evaluar también coincidencias entre filas de un mismo lote.
8. Lotes: cargar varios lugares sin volver a seleccionar al empleado. Un error conserva las filas y señala la corrección necesaria. Confirmar advertencias permite guardar el lote corregido sin duplicarlo por doble envío.
9. Auditoría y borrado: una corrección conserva valores anteriores y posteriores, usuario, fecha y hora. Una eliminación retira el registro de consultas y exportaciones, conservándolo en el historial.
10. Notificaciones: las modificaciones y eliminaciones de RR. HH., así como duplicados, superposiciones y duraciones excesivas confirmadas, aparecen en la cola del administrador y se pueden filtrar por motivo. El registro eliminado sigue siendo consultable desde su evento en el contexto del historial.
11. Exportación: Excel y PDF respetan los mismos filtros, muestran detalle y un total equivalente a la suma de los registros activos seleccionados, incluso cuando supera las 24 horas.
12. Mobile first: completar la carga y consulta en una pantalla de 360 píxeles de ancho sin desplazamiento horizontal de la página, con controles táctiles y errores visibles junto a la fila afectada.
13. Entorno local: iniciar los servicios con Docker Compose en Linux bajo WSL y completar acceso, carga, consulta, auditoría, notificaciones y exportaciones sin dominio ni correo configurados. Reiniciar los contenedores conservando los datos.
14. Recuperación: sin proveedor de correo, informar que la recuperación no está disponible y permitir el procedimiento administrativo documentado. Con un servidor de correo de prueba configurado, emitir y consumir un enlace de recuperación una sola vez dentro de su vigencia.
15. Respaldo y documentación: restaurar una copia en una base local de prueba y verificar registros y auditoría. Entregar manual de uso y README técnico con instalación, variables, cuentas iniciales, respaldo, restauración y futura configuración del correo.

## Entregas y límites

- Primera etapa: aplicación funcional local, base de datos, proxy y Docker Compose; funcionalidades de registro, administración, historial, notificaciones y exportación; recuperación por correo implementada y comprobable con un servicio de prueba; documentación de uso y técnica.
- Segunda etapa de despliegue: selección y contratación de hosting y dominio, configuración del correo real, publicación y configuración operativa del entorno definitivo. Proveedores, costos y fechas quedan sin definir.
- No incluye funcionamiento sin conexión, envío automático de reportes por mensajería, tarifas, liquidaciones, horas extra, gestión de descansos ni turnos nocturnos.
- La exportación genera archivos para descargar y compartir manualmente; no requiere integración con aplicaciones de mensajería.
- La aceptación funcional se verifica con los criterios anteriores. Las propuestas operativas permanecen identificadas hasta su revisión; cualquier modificación de alcance debe incorporarse a una nueva versión del documento.
