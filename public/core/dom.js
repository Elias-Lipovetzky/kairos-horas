import { formatDate, formatTime } from '../../shared/dates.js';
import { dateInput } from '../components/date-input.js';
import { confirmAction } from '../dialogs.js';

export const app = document.querySelector('#app');
export const modal = document.querySelector('#modal');
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const hours = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
export const day = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const dateLabel = (d) => formatDate(d);
export const stamp = (d) => `${formatDate(d)} · ${formatTime(d)}`;

export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.display = 'none'), 5000);
}

export function showError(e, container = $('#page-error')) {
  if (container) {
    container.textContent = e.message;
    container.scrollIntoView({ block: 'nearest' });
  } else toast(e.message);
}

export function field(label, html) {
  return /* HTML */ `<label>${label}${html}</label>`;
}

export function input(name, value = '', type = 'text', extra = '', draft) {
  if (type === 'date') return dateInput(name, value, extra, draft);
  return `<input name="${name}" type="${type}" value="${escape(value)}" ${extra}>`;
}

export function options(items, selected = '', blank = 'Seleccionar…') {
  return (
    /* HTML */ `<option value="">${blank}</option>` +
    items
      .map(
        (i) =>
          `<option value="${escape(i.id)}" ${i.id === selected ? 'selected' : ''}>${escape(i.name)}${i.dni ? ' · ' + escape(i.dni) : ''}${i.active === false ? ' (inactivo)' : ''}</option>`,
      )
      .join('')
  );
}

export function select(name, items, selected = '', blank = 'Seleccionar…', extra = '') {
  return `<select name="${name}" ${extra}>${options(items, selected, blank)}</select>`;
}

export function formData(form) {
  return Object.fromEntries(
    [...new FormData(form)].filter(([key]) => !key.endsWith('_query') && !key.endsWith('_display')),
  );
}

export function openModal(html) {
  $('#modal-content').innerHTML = html;
  if (!modal.open) modal.showModal();
  $$('[data-close]', modal).forEach((b) => (b.onclick = () => modal.close()));
}

export function modalHead(title) {
  return /* HTML */ `<div class="modal-head">
    <h2>${escape(title)}</h2>
    <button type="button" data-close aria-label="Cerrar">✕</button>
  </div>`;
}

export function handleForm(form, submit, confirmation = null) {
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = '1';
    const buttons = $$('button[type=submit]', form);
    buttons.forEach((button) => (button.disabled = true));
    try {
      const details = typeof confirmation === 'function' ? confirmation() : confirmation;
      if (details && !(await confirmAction(details))) return;
      await submit();
    } catch (error) {
      showError(error, $('.error', form));
    } finally {
      delete form.dataset.busy;
      buttons.forEach((button) => (button.disabled = false));
    }
  };
}
