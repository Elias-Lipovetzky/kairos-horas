import { searchField } from '../search.js';
import { state } from '../core/state.js';
import { $, $$, day, escape, field, hours, input, modal } from '../core/dom.js';
import { recordFromRow, rowLocation } from '../batch.js';

export function rowHtml(r, i, label = i + 1) {
  const timed = r.mode === 'times' || r.start_time;
  return /* HTML */ `<div class="entry" data-row="${i}">
    <div class="entry-head">
      <span class="badge">REGISTRO ${label}</span
      ><button
        type="button"
        class="quiet danger"
        data-remove="${i}"
        aria-label="Quitar registro ${i + 1}"
      >
        Quitar
      </button>
    </div>
    <div class="entry-grid">
      ${searchField(
        'Lugar',
        'place_id',
        state.catalog.places,
        r.place_id,
        true,
        r.place_id_query,
      )}${field(
        'Fecha',
        input('date', r.date ?? day(), 'date', `required max="${day()}"`, r.date_display),
      )}${field(
        'Modalidad',
        /* HTML */ `<select name="mode">
          <option value="duration" ${!timed ? 'selected' : ''}>Solo duración</option>
          <option value="times" ${timed ? 'selected' : ''}>Entrada y salida</option>
        </select>`,
      )}${timed
        ? field('Entrada', input('start_time', r.start_time || '', 'time', 'required')) +
          field('Salida', input('end_time', r.end_time || '', 'time', 'required')) +
          field('Total', input('calculated', '', 'text', 'readonly tabindex="-1"'))
        : field(
            'Horas',
            input(
              'hours',
              r.hours ?? '',
              'number',
              'required min="0" max="35791394" step="1" inputmode="numeric"',
            ),
          ) +
          field(
            'Minutos',
            input(
              'remainder',
              r.remainder ?? '0',
              'number',
              'required min="0" max="59" step="1" inputmode="numeric"',
            ),
          )}
    </div>
    <div class="error row-error" role="alert"></div>
  </div>`;
}

export function rowPayload(el, employee) {
  const values = Object.fromEntries($$('input,select', el).map((i) => [i.name, i.value]));
  return recordFromRow(values, employee);
}

export function updateTotals() {
  const root = modal.open ? $('#edit-form') : $('#batch-form');
  if (!root) return;
  let total = 0;
  $$('.entry', root).forEach((el) => {
    const r = rowPayload(el, '');
    let minutes = r.minutes;
    if (r.start_time && r.end_time) {
      const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
      minutes = toMin(r.end_time) - toMin(r.start_time);
    }
    if ($('[name=calculated]', el))
      $('[name=calculated]', el).value = minutes > 0 ? hours(minutes) : '—';
    el.dataset.minutes = Math.max(0, minutes || 0);
    total += Math.max(0, minutes || 0);
  });
  $$('.person-batch', root).forEach((group) => {
    const subtotal = $$('.entry', group).reduce(
      (sum, el) => sum + Number(el.dataset.minutes || 0),
      0,
    );
    $('[data-person-total]', group).textContent = hours(subtotal) + ' h';
    const id = $('[name=employee_id]', group).value,
      employee = state.catalog.employees.find((e) => e.id === id);
    $('h2', group).textContent = employee
      ? employee.name + ' · ' + employee.dni
      : 'Elegí una persona';
  });
  if (root.id === 'batch-form' && $('#batch-total'))
    $('#batch-total').innerHTML = hours(total) + ' <small>h</small>';
}

export function warningHtml(warnings) {
  return /* HTML */ `<div class="warning">
    <strong>Revisá antes de guardar</strong>
    <ul>
      ${warnings
        .map(
          (w) =>
            /* HTML */ `<li>
              ${w.row !== undefined
                ? escape(rowLocation(state.draftGroups, w.row)) + ': '
                : ''}${escape(w.message)}
            </li>`,
        )
        .join('')}
    </ul>
    <p>Podés guardar estos registros si los datos son correctos.</p>
    <button type="button" id="confirm-warnings">Confirmar y guardar</button>
  </div>`;
}
