# Importación de registros de la empresa

`scripts/Preparar-Importacion.mjs` revisa la planilla original sin conectarse a la base ni borrar
datos. Requiere indicar el año porque la columna Fecha puede contener solo día/mes.

```powershell
node scripts/Preparar-Importacion.mjs --source 'ruta-al-archivo.csv' --year 2026 --output backups/importacion-octubre-2026
```

La carpeta de salida debe estar dentro de `backups`, excluida de Git. Allí se conservan el CSV
original y `preparado.json`, con registros normalizados, filas vacías/de plantilla, errores,
discrepancias y advertencias. Los números de línea corresponden al archivo original. El diagnóstico
incluye una huella SHA-256 del CSV. No subir estos archivos a GitHub: contienen datos de la empresa.

La preparación conserva nombres, fecha ISO, minutos y horarios normalizados. Importa conceptualmente
el trabajo realizado con independencia de la columna Se cobran?, porque la aplicación no calcula
facturación. Ese indicador y el total de origen se conservan en el diagnóstico; no se convierten en
datos de facturación de la aplicación.

Las filas sin fecha, lugar ni horarios y sin duración positiva se clasifican como plantilla/vacías.
Las demás filas incompletas, los horarios inválidos y los trabajos de cero minutos se informan como
errores. No se inventan fechas, DNI, dueños ni horarios faltantes. No se eliminan duplicados.

La normalización aplica las reglas de la aplicación: con ambos horarios, calcula la duración. Si el
total original difiere, ambos valores quedan documentados. Este diagnóstico no autoriza a reemplazar
el dato original: antes de importar información real hay que resolver expresamente qué valor
prevalece, los errores, el año y la identidad de empleados y dueños faltantes.

Con el criterio de conservar Horas total ya acordado, agregar `--preserve-total --quarantine-zero`
al comando de preparación. Los horarios incompletos, no válidos o incompatibles con el total se
dejan vacíos, se conserva el total original y se documenta la decisión. La fila de cero minutos
queda en `quarantined`; no se convierte en un trabajo con duración inventada. Se unifican las
variantes de nombres que solo difieren en mayúsculas, sin retirar registros.

Si hay errores el comando devuelve un código de salida distinto de cero. No debe utilizarse ese
archivo como una importación aprobada. Aunque no haya errores, revisar notas y advertencias antes de
continuar. El programa únicamente prepara y diagnostica; no carga ni reinicia la base.

Antes de eliminar el volumen de PostgreSQL se necesita una copia completa con `pg_dump`, comprobar
que se puede restaurar y verificar cuál es el volumen de este proyecto. Una copia del CSV o del
catálogo no reemplaza esa copia completa. Si Docker devuelve acceso denegado, no se debe sustituir
la eliminación del volumen por un borrado parcial de registros mediante la API.

## Reinicio e importación confirmados

Desde la carpeta del proyecto, en una terminal con acceso a Docker:

```powershell
node scripts/Reiniciar-Importar.mjs --source 'ruta-al-archivo.csv' --year 2026 --execute
```

Sin `--execute`, el comando solamente prepara los archivos privados. Con `--execute`:

1. Valida el CSV y comprueba que el volumen pertenece al contenedor Compose de esta carpeta.
2. Construye la imagen y prueba el importador en esquemas temporales aislados. Un fallo detiene el
   procedimiento antes de interrumpir la aplicación.
3. Detiene app/proxy, conserva las cuentas y genera un `pg_dump` completo. Comprueba la huella de la
   copia local, restaura el respaldo en una base temporal y compara cantidades de las tablas.
4. Solo con el respaldo verificado, baja Compose y borra exclusivamente el volumen PostgreSQL
   identificado. No usa `volume prune` ni elimina volúmenes de otros proyectos.
5. Importa en una única transacción sobre una base vacía. Restaura las cuentas con sus contraseñas,
   crea el catálogo del CSV y conserva todos los registros positivos, incluidos duplicados y no
   cobrables. Regenera historial y notificaciones con el administrador como autor de la importación.
6. Comprueba cantidad, total, catálogo, notificaciones y disponibilidad de la aplicación. Si falla
   después del borrado, intenta restaurar automáticamente la base anterior desde el respaldo.

Los DNI `999000000001` y siguientes son identificadores provisionales, no DNI reales. El dueño común
se llama Dueño pendiente de identificar - importación CSV seguido del año. Los valores a reemplazar
quedan en `resultado.json` y en la auditoría. Volver a iniciar sesión con las cuentas anteriores;
las sesiones abiertas no se conservan.

Todos los archivos del proceso quedan en una carpeta nueva `backups/reinicio-...`: original,
preparación, cuentas, respaldo, comprobaciones y resultado. El archivo de cuentas contiene hashes de
contraseña y debe permanecer privado junto con el respaldo. Los textos de horarios originales, la
línea, la huella, el total y el indicador Se cobran? también quedan en los eventos importados.

Si la restauración automática falla, conservar `antes.dump` y la carpeta completa: el comando
informa la ubicación y no elimina la copia. Una ejecución posterior sobre una base con datos se
rechaza; no se anexan registros silenciosamente. El procedimiento completo depende de Docker Compose
v2, PostgreSQL y permisos sobre el motor Docker.
