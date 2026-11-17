import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, transformCompanyCsv } from '../scripts/lib/company-csv.js';

const header = ',empleado,dia,Fecha,Lugares,Entrada,Salida,Horas total,Se cobran?\r\n';
const transform = (rows) => transformCompanyCsv(header + rows, 2026, '2026-11-03');

test('CSV conserva comas, comillas escapadas, líneas físicas y campos multilínea', () => {
  const rows = parseCsv('\uFEFFa,b\r\n"uno, dos","texto ""citado"""\r\n"tres\ncuatro",fin\n');
  assert.deepEqual(rows, [
    { line: 1, cells: ['a', 'b'] },
    { line: 2, cells: ['uno, dos', 'texto "citado"'] },
    { line: 3, cells: ['tres\ncuatro', 'fin'] },
  ]);
  assert.throws(() => parseCsv('"sin cerrar'), /comillas/);
});

test('transforma fechas y horarios, conserva datos de origen y no descarta trabajos no cobrados', () => {
  const result = transform(
    ', Ana ,jueves,1/10,"Casa, centro",9:00 ,11:30 ,02:30,FALSE\r\n' +
      ',Mariela,viernes,2/10,Oficina,,,02:20,TRUE',
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records[0], {
    source_line: 2,
    employee_name: 'Ana',
    place_name: 'Casa, centro',
    date: '2026-10-01',
    start_time: '09:00',
    end_time: '11:30',
    minutes: 150,
    source_minutes: 150,
    source_billable: false,
    source_start: '9:00',
    source_end: '11:30',
  });
  assert.equal(result.records[1].start_time, null);
  assert.equal(result.records[1].end_time, null);
  assert.equal(result.total_minutes, 290);
});

test('separa plantillas pero no oculta filas de trabajo incompletas o de duración cero', () => {
  const result = transform(
    ',,,,,,,,\n,Ana,,,,,,00:00,FALSE\n' +
      ',Ana,jueves,1/10,Casa,09:00,,02:00,TRUE\n' +
      ',Ana,jueves,1/10,Casa,,,00:00,FALSE\n' +
      ',Ana,jueves,1/10,Casa,,texto,02:00,TRUE\n',
  );
  assert.equal(result.ignored.length, 2);
  assert.deepEqual(
    result.errors.map((e) => e.line),
    [4, 5, 6],
  );
  assert.equal(result.records.length, 0);
});

test('no deduplica registros y emite las advertencias de la aplicación', () => {
  const result = transform(
    ',Ana,jueves,1/10,Casa,09:00,12:00,03:00,TRUE\n' +
      ',Ana,jueves,1/10,Casa,10:00,13:00,03:00,TRUE\n' +
      ',Ana,viernes,2/10,Oficina,,,10:00,TRUE\n',
  );
  assert.equal(result.records.length, 3);
  assert.equal(result.warnings.filter((w) => w.reason === 'duplicate').length, 2);
  assert.equal(result.warnings.filter((w) => w.reason === 'overlap').length, 2);
  assert.equal(result.warnings.filter((w) => w.reason === 'long_duration').length, 1);
});

test('diferencias de total o día de semana quedan explícitas con línea y valor original', () => {
  const result = transform(',Ana,viernes,1/10,Casa,09:00,12:00,04:00,TRUE\n');
  assert.equal(result.notes.length, 2);
  assert.deepEqual(
    result.notes.find((n) => n.reason === 'duration_mismatch'),
    {
      line: 2,
      reason: 'duration_mismatch',
      source: 240,
      calculated: 180,
    },
  );
  assert.equal(result.records[0].source_minutes, 240);
  assert.equal(result.records[0].minutes, 180);
});

test('requiere año explícito y rechaza fechas imposibles, futuras o con otro año', () => {
  assert.throws(() => transformCompanyCsv(header, undefined), /año/);
  assert.throws(() => transformCompanyCsv('sin cabecera', 2026), /cabecera/);
  const result = transform(
    ',Ana,jueves,31/10/2025,Casa,,,02:00,TRUE\n' +
      ',Ana,jueves,31/2,Casa,,,02:00,TRUE\n' +
      ',Ana,jueves,31/12,Casa,,,02:00,TRUE\n',
  );
  assert.equal(result.errors.length, 3);
  assert.equal(result.records.length, 0);
});

test('criterio confirmado conserva el total y documenta horarios incompatibles sin inventarlos', () => {
  const result = transformCompanyCsv(
    header +
      ',Ana,jueves,1/10,Casa,09:00,12:00,04:00,TRUE\n' +
      ',Ana,jueves,1/10,Casa,09:00,,02:00,TRUE\n' +
      ',Ana,jueves,1/10,Casa,,nota de tarea,02:30,FALSE\n' +
      ',Ana,jueves,1/10,Casa,09:00,10:00,01:00,TRUE\n' +
      ',Ana,jueves,1/10,Casa,,,00:00,FALSE\n',
    2026,
    '2026-11-03',
    { preserveTotal: true, quarantineZero: true },
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 4);
  assert.equal(result.total_minutes, 570);
  assert.deepEqual(
    result.records.map((r) => r.start_time),
    [null, null, null, '09:00'],
  );
  assert.deepEqual(
    result.records.map((r) => r.minutes),
    [240, 120, 150, 60],
  );
  assert.equal(result.records[2].source_end, 'nota de tarea');
  assert.equal(result.records[2].source_billable, false);
  assert.equal(result.notes.filter((n) => n.reason === 'invalid_times').length, 2);
  assert.equal(result.notes.filter((n) => n.reason === 'duration_mismatch').length, 1);
  assert.deepEqual(
    result.quarantined.map((r) => r.line),
    [6],
  );
});

test('variantes de mayúsculas comparten catálogo sin unir nombres diferentes ni retirar filas', () => {
  const result = transform(
    ',María,jueves,1/10,Los Calafates,,,02:00,TRUE\n' +
      ',maría,jueves,1/10,Los calafates,,,01:00,TRUE\n' +
      ',Maria,jueves,1/10,Otro,,,01:00,TRUE\n',
  );
  assert.equal(result.records.length, 3);
  assert.equal(result.employees.length, 2);
  assert.equal(result.places.length, 2);
  assert.equal(result.warnings.filter((w) => w.reason === 'duplicate').length, 2);
});
