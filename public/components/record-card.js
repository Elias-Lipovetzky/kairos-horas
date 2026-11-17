import { escape, dateLabel, hours } from '../core/dom.js';
import { icon } from './icons.js';

function recordActions(record) {
  const id = escape(record.id);
  return /* HTML */ `<button type="button" data-edit="${id}">Editar</button>
    <button type="button" data-history="${id}">Historial</button>
    <button type="button" class="danger" data-delete="${id}">Eliminar</button>`;
}

export function recordCard(record) {
  const [year, month, day] = record.date.split('-');
  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(record.date + 'T12:00:00Z'),
  );

  return /* HTML */ `<article class="record record-entry">
    <div class="record-mobile-corner">
      <time datetime="${escape(record.date)}">${day}/${month}/${year}</time>
      <details class="record-menu">
        <summary
          aria-label="Acciones del registro de ${escape(record.employee_name)}"
          title="Acciones"
        >
          ${icon('more')}
        </summary>
        <div class="record-menu-options">${recordActions(record)}</div>
      </details>
    </div>
    <div class="record-info">
      <h3>
        ${escape(record.employee_name)}
        <span class="record-mobile-inline record-duration"
          >- ${hours(record.minutes)} <small>h</small></span
        >
        <small class="record-dni">DNI ${escape(record.dni)}</small>
      </h3>
      <p class="record-place">
        ${escape(record.place_name)}
        <span class="record-mobile-inline record-weekday">- ${escape(weekday)}</span>
      </p>
      <small class="record-desktop-date"
        >${escape(dateLabel(record.date))}${record.start_time
          ? ' · ' + record.start_time + ' a ' + record.end_time
          : ''}</small
      >
    </div>
    <div class="record-mobile-timing">
      <span>DNI ${escape(record.dni)}</span>
      ${record.start_time
        ? `<small class="record-time-range" aria-label="Entrada ${escape(record.start_time)}, salida ${escape(record.end_time)}">${escape(record.start_time)} – ${escape(record.end_time)}</small>`
        : ''}
    </div>
    <div class="record-right record-desktop-actions">
      <div class="total">${hours(record.minutes)} <small>h</small></div>
      <div class="actions">${recordActions(record)}</div>
    </div>
  </article>`;
}

export function bindRecordMenus(root) {
  const menus = [...root.querySelectorAll('.record-menu')];
  for (const menu of menus) {
    const trigger = menu.querySelector('summary');
    menu.ontoggle = () => {
      if (menu.open)
        menus.forEach((other) => {
          if (other !== menu) other.open = false;
        });
    };
    menu.onfocusout = (event) => {
      if (!menu.contains(event.relatedTarget)) menu.open = false;
    };
    menu.onkeydown = (event) => {
      if (event.key === 'Escape') {
        menu.open = false;
        trigger.focus();
        event.preventDefault();
        event.stopPropagation();
      }
    };
    menu.querySelectorAll('button').forEach((button) =>
      button.addEventListener('click', () => {
        trigger.focus();
        menu.open = false;
      }),
    );
  }
}
