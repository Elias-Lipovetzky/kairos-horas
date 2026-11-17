# Kairos — Manual de uso

Versión 1.5 · Noviembre de 2026 · Orden de listados y fechas argentinas

## Para qué sirve

Kairos permite registrar las horas de una persona en distintos lugares, corregirlas y exportarlas.
Se usa desde el navegador del celular o de una computadora. Requiere conexión al servidor; no
funciona sin conexión.

Las fechas de formularios, consultas, notificaciones, historial y archivos exportados usan
dd/mm/aaaa; por ejemplo, 03/11/2026. Al escribir una fecha se pueden ingresar ocho dígitos
(03112026): se agregan las barras automáticamente. También se puede tocar el ícono de calendario
para elegir la fecha con el selector del teléfono o navegador. La fecha elegida aparece como
dd/mm/aaaa. Está disponible al cargar, editar y filtrar; en los registros no permite fechas futuras.
Los horarios de eventos se muestran en Argentina.

No calcula pagos, tarifas, horas extra ni descuentos por descansos. No permite turnos que crucen
medianoche.

## Ingresar y salir

Si todavía no tenés cuenta, elegí Crear cuenta en la pantalla de ingreso. Completá nombre, correo,
contraseña y su repetición. La solicitud crea una cuenta de Recursos Humanos pendiente: no podrás
ingresar hasta que un administrador la active. No se necesita correo saliente para solicitarla.

Ingresá el correo y la contraseña que te dio el administrador y presioná Ingresar. La cuenta es
personal: los cambios quedan asociados a tu usuario, con fecha y hora.

Usá Salir cuando termines, especialmente en un equipo compartido. Las sesiones vencen
automáticamente; si ocurre, deberás volver a ingresar. No dependas de una sesión abierta para
conservar filas sin guardar.

## Navegación y perfil

El botón de menú, junto al logo, muestra u oculta la navegación. En computadora se mantiene una
barra compacta de iconos; en el celular el menú permanece oculto hasta abrirlo. Cada acción tiene su
icono y nombre. Al elegir una pantalla el menú se contrae. En celular también se puede cerrar
tocando fuera o usando Escape con teclado.

El perfil está en la esquina superior derecha. Abrilo para ver el usuario y cerrar sesión. Para
administradores, la campana de notificaciones aparece junto al perfil y su contador incluye los
eventos sin revisar y las solicitudes de cuentas pendientes. Las notificaciones no están dentro del
menú lateral.

## Preparar los datos — Administrador

En Administración se encuentran Empleados, Lugares, Dueños y Usuarios.

Cada entrada se muestra como una ficha con el mismo orden: tipo de entidad, nombre, estado y datos
principales identificados por su etiqueta. Tocar la ficha (o enfocarla y presionar Enter) abre su
edición. La búsqueda permite acotar por los datos de esa categoría; por ejemplo, DNI de empleados o
dirección y dueño de lugares. El contador indica cuántas fichas coinciden.

1. Crear los dueños con su nombre; el teléfono es opcional.
2. Crear los lugares con nombre, dirección opcional y uno o más dueños. Marcar exactamente un dueño
   principal.
3. Crear empleados con nombre y DNI. El teléfono es opcional. Dos personas pueden tener el mismo
   nombre; el DNI debe ser diferente.
4. Crear las cuentas del equipo con nombre, correo, contraseña inicial de al menos 12 caracteres y
   rol.

Los administradores también pueden aprobar solicitudes recibidas desde Crear cuenta. Abrir el perfil
→ Solicitudes de cuentas, o la campana → Revisar cuentas. En Administración → Usuarios, editar la
cuenta marcada Pendiente de aprobación, revisar sus datos, marcar Activo y guardar. La solicitud
original nunca concede permisos de administrador por sí sola.

El rol Recursos Humanos carga, consulta, modifica y elimina registros. El administrador puede hacer
lo mismo, además de administrar datos, revisar notificaciones y consultar el historial general.

Para dejar de usar un empleado o lugar, editarlo y quitar Activo. Sus registros anteriores se
conservan. No se permite quitar el último administrador activo. Antes de desactivar un dueño,
quitarlo de los lugares activos que lo usan.

## Buscar empleados y lugares

Si los datos provienen de una importación del CSV, los DNI de 12 dígitos que comienzan con 999 son
identificadores provisionales. El administrador debe reemplazarlos por los DNI reales. También debe
completar el dueño marcado Pendiente de identificar en los lugares importados. La carga conserva el
total de horas del archivo; los horarios incompletos o incompatibles quedan vacíos. Los duplicados
se conservan con advertencias. El historial identifica al administrador que realizó la importación,
no atribuye esa carga a usuarios históricos desconocidos.

Los campos de empleado y lugar muestran sugerencias a medida que escribís; no despliegan todo el
catálogo. Buscá por parte del nombre o, para empleados, por DNI. No hace falta respetar mayúsculas o
acentos. Se muestran hasta ocho coincidencias: seguí escribiendo para acotar la búsqueda.

Tocá una sugerencia para seleccionarla. En computadora también podés usar flechas y Enter; Escape
cierra la lista. El DNI distingue a personas con el mismo nombre. Si modificás el texto después de
seleccionar, debés elegir una sugerencia nuevamente: escribir un nombre no basta para vincular un
empleado o lugar.

Estos buscadores también están disponibles en edición de registros y en los filtros de consulta y
notificaciones. En los filtros, dejarlos vacíos significa todos los empleados o lugares.

## Cargar horas de una o varias personas

1. Abrir Cargar horas.
2. En el primer bloque, buscar al empleado por nombre o DNI y elegir una sugerencia. Su nombre queda
   en la cabecera de ese bloque.
3. Dentro del mismo bloque, buscar el lugar, elegir una sugerencia e indicar la fecha.
4. Elegir Solo duración o Entrada y salida.
5. Usar Agregar lugar a esta persona para sumar registros dentro de su bloque.
6. Para cargar otra persona, usar Agregar otra persona. Se agrega otro bloque con su propio
   selector, registros y subtotal. Repetir para dos o más personas.
7. Revisar los subtotales y el total general y presionar Guardar toda la carga. Se permiten hasta
   100 registros entre todas las personas.

Antes de guardar se abre un diálogo de confirmación con un resumen de las personas y registros.
Elegir Guardar carga para enviarlos o Cancelar para seguir editando sin perder lo cargado. Las
correcciones de registros y los cambios en Administración también piden confirmación. Las
eliminaciones y el descarte de datos pendientes usan diálogos con una acción de cancelación.

Quitar persona retira de la pantalla el bloque completo con sus registros pendientes; Quitar en un
registro retira solo esa fila. Si contiene datos se pide confirmación. Estas acciones no eliminan
horas que ya estaban guardadas en la base.

Solo duración: ingresar horas enteras y minutos entre 0 y 59. Por ejemplo, 4 horas y 30 minutos.
Entrada y salida quedan vacías.

Entrada y salida: completar ambos horarios del mismo día. El total se calcula automáticamente y no
puede editarse manualmente. Por ejemplo, 08:00 a 12:30 produce 4:30 horas. Para informar una
duración diferente, elegir Solo duración. No se descuentan descansos.

Los subtotales por persona y el total general son ayudas visuales. La advertencia de duración
excesiva se evalúa por cada registro, no por esas sumas.

## Errores y advertencias

Los errores impiden guardar la carga completa de todas las personas. Se señalan las filas que debés
corregir y se conservan los demás bloques. Ejemplos: fecha futura, falta de un lugar, duración cero,
un único horario o salida anterior a entrada.

Las advertencias permiten continuar:

- Más de 9 horas en un registro: 9:00 no advierte; 9:01 sí. No se suman distintos registros de la
  persona.
- Posible duplicado: otra fila o registro de la misma persona, lugar y fecha.
- Superposición: los horarios de la persona se cruzan, aunque sean lugares distintos. Si solo se
  informa duración no se puede detectar superposición.

Revisar los mensajes, que indican la persona y el número de registro dentro de su bloque. Si los
datos son correctos, presionar Confirmar y guardar y aceptar el diálogo que resume las advertencias.
Cancelar conserva los datos sin guardarlos. Las advertencias confirmadas aparecen en las
notificaciones del administrador. Si corregís los datos, volver a Guardar toda la carga para
validarlos nuevamente. El guardado es conjunto: no se guarda una persona por separado si hay errores
en otra.

Un doble toque o reintento de la misma carga no debe crear otro lote. Si falla la conexión, conservá
la página abierta y reintentá. No recargues ni cierres la pestaña: no hay guardado sin conexión.

## Ordenar los listados

El selector Ordenar está junto a los resultados, fuera de los filtros. En Registros y Notificaciones
permite elegir más recientes o más antiguos primero, empleado A a Z o Z a A, y lugar A a Z o Z a A.
En Registros se ordena por fecha trabajada; en Notificaciones, por el momento del evento. En
Administración se puede ordenar el nombre A a Z o Z a A y en Historial general se puede invertir el
orden cronológico.

Cambiar el orden vuelve a la primera página y conserva los filtros aplicados. Se ordenan todos los
resultados, no solo la página visible. El orden alfabético no distingue mayúsculas ni acentos y
ubica la ñ después de la n. Excel y PDF respetan el orden elegido en Registros.

## Consultar y corregir

En Registros, pulsar Mostrar filtros para desplegar la búsqueda por empleado, lugar y período; luego
presionar Aplicar filtros. Los filtros están contraídos al entrar y se pueden cerrar con Ocultar
filtros. La cantidad de filtros activos sigue visible; ocultarlos no los borra. Los extremos del
período están incluidos. Se muestra el total de todos los resultados filtrados, aunque la lista
tenga varias páginas.

Los controles están alineados y comparten la misma altura. Usar Limpiar para quitar todos los
filtros y volver a consultar los resultados; también está disponible con el panel cerrado. En
Notificaciones, Más opciones agrupa Motivo, Estado y Responsable. Limpiar también quita el estado
Pendientes y muestra todos los estados, mientras que la primera entrada a Notificaciones filtra por
pendientes.

En el celular, cada registro presenta nombre de la persona - duración en la primera línea y lugar -
día de la semana en la segunda. Los nombres conservan mayor presencia que el día y la duración. El
DNI y, cuando hay entrada y salida, los horarios aparecen debajo en texto pequeño y gris. Los
nombres largos pueden ocupar más de una línea. La fecha dd/mm/aaaa queda pequeña en la esquina
inferior derecha. El menú de tres puntos reúne Editar, Historial y Eliminar; tocarlo despliega las
acciones. En computadora continúan visibles. No se muestra una etiqueta de modalidad en el listado:
se presentan directamente los horarios o la duración registrados.

Usar Editar para cambiar una carga y guardar. Se aplican las mismas validaciones y advertencias. Si
otra persona modificó el registro mientras lo editabas, volver a consultarlo antes de intentar
guardar; no se pisa su cambio silenciosamente.

Usar Eliminar y confirmar para quitar un registro de consultas y exportaciones. La eliminación es
lógica: sus datos e historial se conservan. No existe restauración desde la interfaz en esta
versión.

## Historial

Cada registro tiene un botón Historial. Allí se muestra quién lo creó, modificó o eliminó, cuándo lo
hizo y los valores anteriores y posteriores. Los horarios del historial se muestran en la zona de
Argentina.

El administrador dispone además de Historial general, que incluye cambios en empleados, lugares,
dueños y cuentas. No se muestran contraseñas.

## Notificaciones — Administrador

Abrir Notificaciones desde la campana junto al perfil. Por defecto se muestran las pendientes y el
panel de filtros está cerrado. Pulsar Mostrar filtros y usar Motivo para ver solo altas,
modificaciones, eliminaciones, posibles duplicados, superposiciones o duraciones mayores a 9 horas.

También se puede filtrar por estado, usuario responsable, empleado, lugar y período de la
notificación. Este período corresponde al momento del evento, no necesariamente al día trabajado.

Cada notificación es una tarjeta pulsable: arriba aparece el tipo de evento en grande y debajo, el
empleado y el lugar. La fecha y la hora del evento están en la esquina superior derecha. Tocar la
tarjeta (o enfocarla y presionar Enter) abre un diálogo con los valores anteriores y posteriores.
Dentro del diálogo, Historial completo abre todos los eventos del registro, incluso si fue
eliminado. Marcar revisado cambia el estado de la notificación; no modifica las horas ni borra el
historial. Abrir el detalle no la marca automáticamente como revisada.

Un mismo cambio puede producir varias notificaciones si tiene distintos motivos. No se envían
correos por estas notificaciones; se consultan en la aplicación.

## Exportar y compartir

1. En Registros, abrir Mostrar filtros, elegir empleado, lugar y período y presionar Aplicar
   filtros.
2. Revisar los resultados y su total. El botón Exportar está junto al resumen de resultados, fuera
   del panel de filtros.
3. Pasar el puntero, enfocar con el teclado o tocar Exportar para ver Excel y PDF. Elegir uno. Se
   exportan los filtros aplicados a los resultados, no cambios pendientes sin aplicar.
4. Descargar el archivo y compartirlo manualmente por el medio que prefieras.

Ambos formatos incluyen empleado, DNI, fecha, día de semana, lugar, entrada, salida, duración y
total. Los horarios no informados quedan vacíos. Los registros eliminados no aparecen. El total
puede superar las 24 horas sin reiniciarse.

El nombre del archivo incluye los filtros aplicados de empleado, lugar y período. Por ejemplo,
Mariela del 1 al 7 de noviembre se descarga como kairos-horas-Mariela-0111-al-0711.xlsx o .pdf. Las
fechas del nombre usan ddmm, sin año; dentro del reporte se conserva dd/mm/aaaa. Si se filtra
también un lugar, su nombre se agrega después del empleado. Si solo hay una fecha límite, se usa
desde-ddmm o hasta-ddmm. Sin filtros se conserva kairos-horas.xlsx o .pdf.

Si se supera el límite de 10.000 registros, acotar el período o el empleado. La aplicación no envía
archivos automáticamente a los empleados.

## Recuperar una contraseña

En la pantalla de acceso, elegir Olvidé mi contraseña e ingresar el correo. Si el envío está
configurado y la cuenta está activa, recibirás un enlace válido durante 30 minutos y de un solo uso.
La nueva contraseña debe tener al menos 12 caracteres y cierra las sesiones anteriores.

Si el servicio de correo aún no está configurado, la aplicación lo indica. Pedí al administrador que
restablezca tu contraseña desde Usuarios; un operador del servidor también dispone de un
procedimiento local documentado en el README.

## Problemas habituales

- Sin conexión: dejar la pantalla abierta, recuperar conexión y reintentar. No cerrar ni recargar
  con filas pendientes.
- No aparece un empleado o lugar: verificar que el administrador lo haya creado y esté activo.
- DNI repetido: buscar a la persona existente; si estaba inactiva, reactivarla.
- Correo no recibido: revisar correo no deseado y consultar al administrador; la configuración SMTP
  puede estar pendiente.
- La sesión venció: volver a ingresar. Guardar los lotes antes de dejar la aplicación sin uso.
- Registro cambiado por otra persona: consultar otra vez y revisar el historial antes de corregir.

Para soporte, indicar la acción, la fecha, el empleado y el mensaje mostrado. No compartir
contraseñas ni enlaces de recuperación.
