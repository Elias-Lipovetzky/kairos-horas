import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatTime, parseDate } from '../shared/dates.js';
import { bindDateInputs, dateInput } from '../public/components/date-input.js';
import { sortOrder, sortValues, chronologicalDirection } from '../server/services/sorting.js';
import { assertRequest } from '../scripts/lib/contract.js';

test('fechas argentinas mantienen el día trabajado y convierten instantes a Buenos Aires', () => {
  assert.equal(formatDate('2026-01-03'), '03/01/2026');
  assert.equal(formatDate('2026-11-03T01:05:00Z'), '02/11/2026');
  assert.equal(formatTime('2026-11-03T01:05:00Z'), '22:05');
  assert.equal(formatDate(''), '');
});

test('entrada dd/mm/aaaa valida calendario y años bisiestos sin aceptar el formato estadounidense', () => {
  assert.equal(parseDate('03/11/2026'), '2026-11-03');
  assert.equal(parseDate('29/02/2024'), '2024-02-29');
  for (const value of ['29/02/2026', '31/04/2026', '11/23/2026', '3/1/26', '2026-11-03', '']) {
    assert.equal(parseDate(value), null, value);
  }
});

test('fecha visible separada del dato ISO, teclado móvil, borrado y fechas futuras', () => {
  const listeners = {};
  bindDateInputs({ addEventListener: (type, fn) => (listeners[type] = fn) });
  const input = {
    value: '03112026',
    selectionStart: 8,
    nextElementSibling: { value: '' },
    matches: (selector) => selector === '[data-date-input]',
    getAttribute: () => '2026-11-03',
    setCustomValidity(message) {
      this.error = message;
    },
    setSelectionRange() {},
  };
  listeners.input({ target: input, type: 'input', inputType: 'insertFromPaste' });
  assert.equal(input.value, '03/11/2026');
  assert.equal(input.nextElementSibling.value, '2026-11-03');
  assert.equal(input.error, '');
  input.value = '04/11/2026';
  listeners.change({ target: input });
  assert.match(input.error, /futuras/);
  input.value = '31/02/2026';
  listeners.change({ target: input });
  assert.equal(input.nextElementSibling.value, '');
  assert.match(input.error, /válida/);
  input.value = '';
  listeners.change({ target: input });
  assert.equal(input.nextElementSibling.value, '');
  assert.equal(input.error, '');
  assert.match(dateInput('date', '2026-11-03', 'required'), /value="03\/11\/2026"/);
  assert.match(dateInput('date', '', '', '31/02'), /value="31\/02"/);
});

test('fechas inválidas restauradas en un borrador se validan antes de enviar', () => {
  const listeners = {};
  bindDateInputs({ addEventListener: (type, fn) => (listeners[type] = fn) });
  let prevented = false,
    stopped = false;
  const input = {
    value: '31/02/2026',
    nextElementSibling: { value: '' },
    matches: (selector) => selector === '[data-date-input]',
    getAttribute: () => null,
    setCustomValidity(message) {
      this.error = message;
    },
  };
  listeners.submit({
    target: { querySelectorAll: () => [input], reportValidity: () => !input.error },
    preventDefault: () => (prevented = true),
    stopImmediatePropagation: () => (stopped = true),
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('el calendario actualiza la fecha visible, conserva ISO y permite limpiar un filtro', () => {
  const listeners = {};
  bindDateInputs({ addEventListener: (type, fn) => (listeners[type] = fn) });
  const text = {
    value: '31/02/2026',
    matches: (selector) => selector === '[data-date-input]',
    getAttribute: () => '2026-11-03',
    setCustomValidity(message) {
      this.error = message;
    },
  };
  const picker = {
    value: '2026-10-25',
    previousElementSibling: text,
    matches: (selector) => selector === '[data-date-picker]',
  };
  text.nextElementSibling = picker;
  listeners.change({ target: picker, type: 'change' });
  assert.equal(text.value, '25/10/2026');
  assert.equal(picker.value, '2026-10-25');
  assert.equal(text.error, '');
  picker.value = '';
  listeners.change({ target: picker, type: 'change' });
  assert.equal(text.value, '');
  assert.equal(picker.value, '');
  const html = dateInput('date', '2026-11-03', 'required max="2026-11-03"');
  assert.match(html, /type="date" name="date" data-date-picker/);
  assert.match(html, /value="2026-11-03" required max="2026-11-03"/);
});

test('orden por fecha usa el día trabajado o el instante de notificación, con desempate estable', () => {
  assert.equal(sortOrder(), 'r.date DESC, r.created_at DESC, r.id DESC');
  assert.equal(sortOrder('date_asc'), 'r.date ASC, r.created_at ASC, r.id ASC');
  assert.equal(sortOrder('date_desc', true), 'n.created_at DESC, n.id DESC');
  assert.equal(sortOrder('date_asc', true), 'n.created_at ASC, n.id ASC');
  assert.equal(chronologicalDirection(), 'DESC');
  assert.equal(chronologicalDirection('date_asc'), 'ASC');
  assert.match(sortOrder('employee_asc'), /lower\(e.name\).*ASC, r.date DESC, r.id DESC/);
  assert.match(
    sortOrder('place_desc', true),
    /lower\(p.name\).*DESC, n.created_at DESC, n.id DESC/,
  );
});

test('órdenes desconocidos no se interpolan en SQL y el contrato admite las seis opciones', () => {
  for (const sort of sortValues) {
    for (const path of ['/records', '/notifications', '/export/pdf', '/export/xlsx']) {
      assertRequest('GET', path + '?sort=' + sort);
    }
  }
  for (const value of ['name_asc', 'date_desc; DROP TABLE records', ['date_asc'], {}]) {
    assert.throws(() => sortOrder(value), { status: 400 });
  }
  assertRequest('GET', '/audit?sort=date_asc');
  assert.throws(() => assertRequest('GET', '/audit?sort=place_asc'));
  assert.throws(() => chronologicalDirection('employee_asc'), { status: 400 });
  assert.throws(() => assertRequest('GET', '/records?sort=unknown'));
});
