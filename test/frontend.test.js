import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestions } from '../public/search.js';
import { recordsFromGroups, rowLocation, hasDraft } from '../public/batch.js';
const people = [
  { id: 'a', name: 'María', dni: '30123456' },
  { id: 'b', name: 'Maria', dni: '40123456' },
  { id: 'c', name: 'Ivan', dni: '50123456' },
];
test('buscador filtra nombres sin distinguir acentos y conserva homónimos', () => {
  assert.deepEqual(
    suggestions(people, 'maria').map((e) => e.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    suggestions(people, 'IVAN').map((e) => e.id),
    ['c'],
  );
  assert.deepEqual(
    suggestions(people, '40.123.456').map((e) => e.id),
    ['b'],
  );
});
test('buscador no lista todo vacío, limita sugerencias y admite palabras en distinto orden', () => {
  assert.equal(suggestions(people, '').length, 0);
  assert.equal(suggestions(people, 'inexistente').length, 0);
  assert.equal(
    suggestions(
      Array.from({ length: 40 }, (_, i) => ({ id: i, name: 'Lugar ' + i })),
      'lugar',
    ).length,
    8,
  );
  assert.equal(suggestions([{ name: 'Oficina Innovar' }], 'innovar ofi').length, 1);
});
test('varias personas se aplanan sin atribuir los lugares al primer empleado', () => {
  const groups = [
    {
      employee_id: 'a',
      rows: [
        { place_id: 'x', hours: '2', remainder: '15' },
        { place_id: 'y', hours: '1' },
      ],
    },
    {
      employee_id: 'b',
      rows: [{ place_id: 'z', mode: 'times', start_time: '09:00', end_time: '12:30' }],
    },
  ];
  const records = recordsFromGroups(groups);
  assert.deepEqual(
    records.map((r) => r.employee_id),
    ['a', 'a', 'b'],
  );
  assert.deepEqual(
    records.map((r) => r.place_id),
    ['x', 'y', 'z'],
  );
  assert.equal(records[0].minutes, 135);
  assert.equal(records[0].start_time, null);
  assert.equal(records[2].start_time, '09:00');
  assert.equal(rowLocation(groups, 2), 'Persona 2, registro 1');
});
test('se detectan borradores parciales sin exigir un lugar ya seleccionado', () => {
  assert.equal(hasDraft([{ employee_id: '', rows: [{}] }]), false);
  assert.equal(hasDraft([{ employee_id_query: 'Mar', rows: [{}] }]), true);
  assert.equal(hasDraft([{ rows: [{ hours: '2' }] }]), true);
});
