# Listados y filtros: referencias y decisiones

Se revisaron fuentes primarias de sistemas de diseño:

- [Carbon: Filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering).
  Se tomó el patrón de varias selecciones con aplicación explícita, indicación de filtros activos y
  limpieza de filtros sin tener que abrir el panel. No se incorporó su biblioteca ni se cambió el
  contrato REST.
- [Scottish Government: Search filters](https://designsystem.gov.scot/patterns/search-results/search-filters).
  Se tomó como referencia la agrupación de opciones, las etiquetas claras y la aplicación explícita
  de filtros en móvil.

## Aplicación en Kairos

- Un panel contraído muestra su estado y una acción Limpiar. El desplegable separa criterios
  frecuentes de las opciones adicionales de notificaciones.
- Las etiquetas son breves y las ayudas comunes aparecen una sola vez. Buscadores, fechas y
  selectores usan la misma fila de etiqueta y la misma altura de control.
- Aplicar filtros actualiza el conjunto de resultados. Limpiar quita todos los criterios y vuelve a
  consultar. Exportar sigue usando los filtros aplicados a los resultados.
- Las fichas de Administración reutilizan una misma estructura para las cuatro categorías. El nombre
  tiene prioridad, el estado es discreto y cada dato secundario tiene una etiqueta. Tocar la ficha
  abre la edición existente.

Estos son criterios de diseño, no una afirmación de validación visual automatizada. La revisión en
el navegador y en el celular debe realizarse tras reconstruir la imagen.
