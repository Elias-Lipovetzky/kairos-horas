import { searchField } from '../search.js';
import { state } from '../core/state.js';
import { field, input, select } from '../core/dom.js';
import { names } from '../core/labels.js';

import { icon } from './icons.js';

export function filterHtml(values, notifications = false) {
  const showMore = values.reason || values.user_id || values.state === 'reviewed';
  return /* HTML */ `<div class="filters">
      ${searchField(
        'Empleado',
        'employee_id',
        state.catalog.employees,
        values.employee_id,
        false,
        undefined,
        true,
      )}
      ${searchField(
        'Lugar',
        'place_id',
        state.catalog.places,
        values.place_id,
        false,
        undefined,
        true,
      )}
      ${field('Desde', input('from', values.from || '', 'date'))}
      ${field('Hasta', input('to', values.to || '', 'date'))}
    </div>
    ${notifications
      ? `<details class="filter-more" ${showMore ? 'open' : ''}>
    <summary>Más opciones</summary>
    <div class="filters filters-secondary">
      ${field(
        'Motivo',
        `<select name="reason"><option value="">Todos</option>${Object.entries(names)
          .map(
            ([key, label]) =>
              `<option value="${key}" ${values.reason === key ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select>`,
      )}
      ${field('Estado', `<select name="state"><option value="">Todos</option><option value="pending" ${values.state === 'pending' ? 'selected' : ''}>Pendientes</option><option value="reviewed" ${values.state === 'reviewed' ? 'selected' : ''}>Revisados</option></select>`)}
      ${field('Responsable', select('user_id', state.users, values.user_id, 'Todos'))}
    </div>
  </details>`
      : ''}`;
}

export function filterPanel(values, content) {
  const count = Object.values(values).filter(Boolean).length;
  return /* HTML */ `<div class="filter-toolbar">
    <details class="filter-panel">
      <summary>
        <span class="filter-summary-icon">${icon('filter')}</span>
        <span class="filters-closed">Mostrar filtros</span
        ><span class="filters-open">Ocultar filtros</span>
        ${count ? `<span class="filter-count">${count} activos</span>` : ''}
      </summary>
      <div class="filter-panel-body">
        <p class="filter-guidance">Dejá vacíos los campos que no quieras usar.</p>
        ${content}
        <div class="filter-footer">
          <button type="submit" class="primary">Aplicar filtros</button>
        </div>
      </div>
    </details>
    <button type="button" class="filter-clear" data-clear-filters>Limpiar</button>
  </div>`;
}

export function bindFilterPanel(form, clearFilters) {
  form.querySelector('[data-clear-filters]').onclick = clearFilters;
}

export function query(values) {
  return new URLSearchParams(
    Object.entries(values).filter(([, v]) => v !== '' && v !== undefined),
  ).toString();
}

export function pager(page, count) {
  return /* HTML */ `<div class="pager">
    <button id="previous" ${page === 0 ? 'disabled' : ''}>Anterior</button
    ><span>Página ${page + 1} · ${count} resultados</span
    ><button id="next" ${(page + 1) * 50 >= count ? 'disabled' : ''}>Siguiente</button>
  </div>`;
}
