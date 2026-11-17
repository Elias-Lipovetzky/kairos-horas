import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecord, warningsFor, duration, today, validDate } from '../server/domain.js';
const employee = '11111111-1111-4111-8111-111111111111',
  place = '22222222-2222-4222-8222-222222222222';
const base = { employee_id: employee, place_id: place, date: '2026-01-20', minutes: 300 };
const normalize = (input) => normalizeRecord({ ...base, ...input }, '2026-01-20');
test('solo duración conserva ambos horarios vacíos', () => {
  assert.deepEqual(normalize({}), { ...base, start_time: null, end_time: null });
});
test('calcula horarios sin confiar en un total adulterado', () => {
  assert.equal(normalize({ start_time: '08:00', end_time: '12:30', minutes: 999 }).minutes, 270);
});
test('no acepta fechas futuras ni inexistentes', () => {
  for (const date of ['2026-01-21', '2026-02-30', '20/01/2026', ''])
    assert.throws(() => normalize({ date }));
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
});
test('rechaza horario incompleto, nocturno, cero e inválido', () => {
  for (const r of [
    { start_time: '08:00' },
    { end_time: '12:00' },
    { start_time: '22:00', end_time: '06:00' },
    { start_time: '08:00', end_time: '08:00' },
    { start_time: '25:00', end_time: '26:00' },
  ])
    assert.throws(() => normalize(r));
});
test('rechaza duraciones inválidas sin horarios', () => {
  for (const minutes of [0, -1, 1.5, Infinity, 'x', null])
    assert.throws(() => normalize({ minutes }));
});
test('más de 9 horas advierte, exactamente 9 no', () => {
  assert.equal(warningsFor({ ...base, minutes: 540 }, []).length, 0);
  assert.equal(warningsFor({ ...base, minutes: 541 }, [])[0].reason, 'long_duration');
  assert.equal(warningsFor({ ...base, minutes: 2000 }, [])[0].reason, 'long_duration');
});
test('no suma horas de registros, empleados ni lotes para umbral', () => {
  const others = [{ ...base, place_id: employee, minutes: 300 }];
  assert.equal(warningsFor(base, others).length, 0);
});
test('duplicado advierte aunque cambie duración y no haya horarios', () => {
  assert.deepEqual(
    warningsFor(base, [{ ...base, minutes: 30 }]).map((w) => w.reason),
    ['duplicate'],
  );
});
test('superposición detecta lugares distintos, pero no intervalos contiguos', () => {
  const record = normalize({ start_time: '09:00', end_time: '12:00' });
  assert.equal(
    warningsFor(record, [
      { ...base, place_id: employee, start_time: '10:00', end_time: '11:00' },
    ])[0].reason,
    'overlap',
  );
  assert.equal(
    warningsFor(record, [{ ...base, place_id: employee, start_time: '12:00', end_time: '13:00' }])
      .length,
    0,
  );
});
test('al editar no se compara el registro consigo mismo', () => {
  const record = { ...base, id: 'same', start_time: '09:00', end_time: '12:00' };
  assert.equal(warningsFor(record, [record]).length, 0);
});
test('no infiere superposición sin horarios ni entre empleados distintos', () => {
  assert.equal(
    warningsFor(base, [{ ...base, place_id: employee, start_time: '09:00', end_time: '12:00' }])
      .length,
    0,
  );
  assert.equal(
    warningsFor({ ...base, start_time: '09:00', end_time: '12:00' }, [
      { ...base, employee_id: place, start_time: '10:00', end_time: '11:00' },
    ]).length,
    0,
  );
});
test('muestra totales mayores a 24 horas sin reiniciarse', () => {
  assert.equal(duration(1501), '25:01');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
