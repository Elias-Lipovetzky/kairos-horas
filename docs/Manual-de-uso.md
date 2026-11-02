# Kairos — Manual de uso

Versión 1.0 · Noviembre de 2026

## Para qué sirve

Kairos permite registrar las horas de una persona en distintos lugares, corregirlas y exportarlas. Se usa desde el navegador del celular o de una computadora. Requiere conexión al servidor; no funciona sin conexión.

No calcula pagos, tarifas, horas extra ni descuentos por descansos. No permite turnos que crucen medianoche.

## Ingresar y salir

Ingresá el correo y la contraseña que te dio el administrador y presioná Ingresar. La cuenta es personal: los cambios quedan asociados a tu usuario, con fecha y hora.

Usá Salir cuando termines, especialmente en un equipo compartido. Las sesiones vencen automáticamente; si ocurre, deberás volver a ingresar. No dependas de una sesión abierta para conservar filas sin guardar.

## Preparar los datos — Administrador

En Administración se encuentran Empleados, Lugares, Dueños y Usuarios.

1. Crear los dueños con su nombre; el teléfono es opcional.
2. Crear los lugares con nombre, dirección opcional y uno o más dueños. Marcar exactamente un dueño principal.
3. Crear empleados con nombre y DNI. El teléfono es opcional. Dos personas pueden tener el mismo nombre; el DNI debe ser diferente.
4. Crear las cuentas del equipo con nombre, correo, contraseña inicial de al menos 12 caracteres y rol.

El rol Recursos Humanos carga, consulta, modifica y elimina registros. El administrador puede hacer lo mismo, además de administrar datos, revisar notificaciones y consultar el historial general.

Para dejar de usar un empleado o lugar, editarlo y quitar Activo. Sus registros anteriores se conservan. No se permite quitar el último administrador activo. Antes de desactivar un dueño, quitarlo de los lugares activos que lo usan.

## Cargar horas de una persona

1. Abrir Cargar horas.
2. Buscar al empleado por nombre o DNI y seleccionarlo.
3. En el primer registro, elegir lugar y fecha.
4. Elegir Solo duración o Entrada y salida.
5. Usar Agregar otro lugar para sumar filas sin volver a elegir la persona.
6. Revisar el lote y presionar Guardar registros.

Solo duración: ingresar horas enteras y minutos entre 0 y 59. Por ejemplo, 4 horas y 30 minutos. Entrada y salida quedan vacías.

Entrada y salida: completar ambos horarios del mismo día. El total se calcula automáticamente y no puede editarse manualmente. Por ejemplo, 08:00 a 12:30 produce 4:30 horas. Para informar una duración diferente, elegir Solo duración. No se descuentan descansos.

El total del lote es una ayuda visual. La advertencia de duración excesiva se evalúa por cada registro, no por esa suma.

## Errores y advertencias

Los errores impiden guardar el lote completo. Se señalan las filas que debés corregir y se conservan las demás. Ejemplos: fecha futura, falta de un lugar, duración cero, un único horario o salida anterior a entrada.

Las advertencias permiten continuar:

- Más de 9 horas en un registro: 9:00 no advierte; 9:01 sí. No se suman distintos registros de la persona.
- Posible duplicado: otra fila o registro de la misma persona, lugar y fecha.
- Superposición: los horarios de la persona se cruzan, aunque sean lugares distintos. Si solo se informa duración no se puede detectar superposición.

Revisar los mensajes. Si los datos son correctos, presionar Confirmar y guardar. Las advertencias confirmadas aparecen en las notificaciones del administrador. Si corregís los datos, volver a Guardar registros para validarlos nuevamente.

Un doble toque o reintento de la misma carga no debe crear otro lote. Si falla la conexión, conservá la página abierta y reintentá. No recargues ni cierres la pestaña: no hay guardado sin conexión.

## Consultar y corregir

En Registros, filtrar por empleado, lugar y período, y presionar Buscar. Los extremos del período están incluidos. Se muestra el total de todos los resultados filtrados, aunque la lista tenga varias páginas.

Usar Editar para cambiar una carga y guardar. Se aplican las mismas validaciones y advertencias. Si otra persona modificó el registro mientras lo editabas, volver a consultarlo antes de intentar guardar; no se pisa su cambio silenciosamente.

Usar Eliminar y confirmar para quitar un registro de consultas y exportaciones. La eliminación es lógica: sus datos e historial se conservan. No existe restauración desde la interfaz en esta versión.

## Historial

Cada registro tiene un botón Historial. Allí se muestra quién lo creó, modificó o eliminó, cuándo lo hizo y los valores anteriores y posteriores. Los horarios del historial se muestran en la zona de Argentina.

El administrador dispone además de Historial general, que incluye cambios en empleados, lugares, dueños y cuentas. No se muestran contraseñas.

## Notificaciones — Administrador

Abrir Notificaciones. Por defecto se muestran las pendientes. Usar Motivo para ver solo altas, modificaciones, eliminaciones, posibles duplicados, superposiciones o duraciones mayores a 9 horas.

También se puede filtrar por estado, usuario responsable, empleado, lugar y período de la notificación. Este período corresponde al momento del evento, no necesariamente al día trabajado.

Ver cambio muestra los valores anteriores y posteriores. Historial abre todos los eventos del registro, incluso si fue eliminado. Marcar revisado cambia el estado de la notificación; no modifica las horas ni borra el historial.

Un mismo cambio puede producir varias notificaciones si tiene distintos motivos. No se envían correos por estas notificaciones; se consultan en la aplicación.

## Exportar y compartir

1. En Registros, elegir empleado, lugar y período según corresponda.
2. Presionar Excel o PDF. Se toman los filtros visibles del formulario.
3. Descargar el archivo y compartirlo manualmente por el medio que prefieras.

Ambos formatos incluyen empleado, DNI, fecha, día de semana, lugar, entrada, salida, duración y total. Los horarios no informados quedan vacíos. Los registros eliminados no aparecen. El total puede superar las 24 horas sin reiniciarse.

Si se supera el límite de 10.000 registros, acotar el período o el empleado. La aplicación no envía archivos automáticamente a los empleados.

## Recuperar una contraseña

En la pantalla de acceso, elegir Olvidé mi contraseña e ingresar el correo. Si el envío está configurado y la cuenta está activa, recibirás un enlace válido durante 30 minutos y de un solo uso. La nueva contraseña debe tener al menos 12 caracteres y cierra las sesiones anteriores.

Si el servicio de correo aún no está configurado, la aplicación lo indica. Pedí al administrador que restablezca tu contraseña desde Usuarios; un operador del servidor también dispone de un procedimiento local documentado en el README.

## Problemas habituales

- Sin conexión: dejar la pantalla abierta, recuperar conexión y reintentar. No cerrar ni recargar con filas pendientes.
- No aparece un empleado o lugar: verificar que el administrador lo haya creado y esté activo.
- DNI repetido: buscar a la persona existente; si estaba inactiva, reactivarla.
- Correo no recibido: revisar correo no deseado y consultar al administrador; la configuración SMTP puede estar pendiente.
- La sesión venció: volver a ingresar. Guardar los lotes antes de dejar la aplicación sin uso.
- Registro cambiado por otra persona: consultar otra vez y revisar el historial antes de corregir.

Para soporte, indicar la acción, la fecha, el empleado y el mensaje mostrado. No compartir contraseñas ni enlaces de recuperación.
