import { escape } from '../core/dom.js';

export function sortControl(value, mode = false) {
  let options =
    mode === true
      ? [
          ['name_asc', 'Nombre: A a Z'],
          ['name_desc', 'Nombre: Z a A'],
        ]
      : [
          ['date_desc', 'Más recientes primero'],
          ['date_asc', 'Más antiguos primero'],
          ['employee_asc', 'Empleado: A a Z'],
          ['employee_desc', 'Empleado: Z a A'],
          ['place_asc', 'Lugar: A a Z'],
          ['place_desc', 'Lugar: Z a A'],
        ];
  if (mode === 'dates') options = options.slice(0, 2);
  return `<label class="sort-control">Ordenar<select data-sort-control>${options
    .map(
      ([key, label]) =>
        `<option value="${key}" ${value === key ? 'selected' : ''}>${escape(label)}</option>`,
    )
    .join('')}</select></label>`;
}
