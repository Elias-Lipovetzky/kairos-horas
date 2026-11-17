import { formatDate, parseDate } from '../../shared/dates.js';
import { icon } from './icons.js';

const attribute = (value) =>
  String(value).replace(
    /[&"<>]/g,
    (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c],
  );

export function dateInput(name, value, extra, draft) {
  const display = draft ?? formatDate(value);
  return `<span class="date-field"><input type="text" name="${name}_display" data-date-input inputmode="numeric"
    autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10"
    value="${attribute(display)}" ${extra}><input type="date" name="${name}" data-date-picker
    lang="es-AR" aria-label="Elegir fecha en calendario" title="Elegir fecha en calendario"
    value="${parseDate(display) || ''}" ${extra}>
    <span class="date-calendar-icon" aria-hidden="true">${icon('calendar')}</span></span>`;
}

export function bindDateInputs(root) {
  const update = (event) => {
    let input = event.target;
    if (input.matches('[data-date-picker]')) {
      const picker = input;
      input = picker.previousElementSibling;
      input.value = formatDate(picker.value);
    }
    if (!input.matches('[data-date-input]')) return;
    // Mobile number keyboards lack a slash key. Add separators during insertion/paste.
    if (
      event.type === 'input' &&
      !event.inputType?.startsWith('delete') &&
      /^[\d/]+$/.test(input.value)
    ) {
      const digits = input.value.replace(/\//g, '').slice(0, 8);
      const caret = input.selectionStart;
      const before = input.value.slice(0, caret).replace(/\//g, '').length;
      input.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
        .filter(Boolean)
        .join('/');
      const position = before + (before > 2 ? 1 : 0) + (before > 4 ? 1 : 0);
      input.setSelectionRange(position, position);
    }
    const raw = input.value.trim();
    const iso = raw ? parseDate(raw) : '';
    input.nextElementSibling.value = iso || '';
    let error = raw && !iso ? 'Usá una fecha válida en formato dd/mm/aaaa.' : '';
    if (iso && input.getAttribute('max') && iso > input.getAttribute('max'))
      error = 'No se permiten fechas futuras.';
    input.setCustomValidity(error);
  };
  root.addEventListener('input', update, true);
  root.addEventListener('change', update, true);
  root.addEventListener(
    'submit',
    (event) => {
      event.target.querySelectorAll('[data-date-input]').forEach((target) => update({ target }));
      if (!event.target.reportValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
