import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFilename, exportDisposition, downloadFilename } from '../shared/export-names.js';

test('exportación nombra empleado, lugar y período ddmm para Excel y PDF', () => {
  const filters = { employee: 'Mariela', from: '2026-11-01', to: '2026-11-07' };
  assert.equal(exportFilename(filters, 'xlsx'), 'kairos-horas-Mariela-0111-al-0711.xlsx');
  assert.equal(
    exportFilename({ ...filters, place: 'Casa Fuegia' }, 'pdf'),
    'kairos-horas-Mariela-Casa-Fuegia-0111-al-0711.pdf',
  );
  assert.equal(exportFilename({ place: 'Abamar' }, 'pdf'), 'kairos-horas-Abamar.pdf');
});

test('nombres sin filtros y con extremos abiertos describen solo los filtros aplicados', () => {
  assert.equal(exportFilename({}, 'xlsx'), 'kairos-horas.xlsx');
  assert.equal(exportFilename({ from: '2026-01-03' }, 'pdf'), 'kairos-horas-desde-0301.pdf');
  assert.equal(exportFilename({ to: '2026-12-25' }, 'xlsx'), 'kairos-horas-hasta-2512.xlsx');
  assert.equal(
    exportFilename({ from: '2025-12-29', to: '2026-01-03' }, 'pdf'),
    'kairos-horas-2912-al-0301.pdf',
  );
});

test('nombres y encabezado admiten ñ, acentos y apóstrofes sin perder el nombre al descargar', () => {
  const name = exportFilename({ employee: 'María Muñoz', place: "L'Amour" }, 'xlsx');
  const header = exportDisposition(name);
  assert.match(header, /filename="kairos-horas-Maria-Munoz-L'Amour.xlsx"/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.equal(downloadFilename(header, 'xlsx'), "kairos-horas-María-Muñoz-L'Amour.xlsx");
});

test('caracteres de rutas y controles no contaminan el nombre ni los encabezados', () => {
  const name = exportFilename({ employee: '../Mariela\r\n"', place: 'Casa / 6:E\\?' }, 'pdf');
  assert.equal(name, 'kairos-horas-Mariela-Casa-6-E.pdf');
  assert.doesNotMatch(exportDisposition(name), /[\r\n]/);
  assert.ok(
    exportFilename({ employee: 'A'.repeat(200), place: 'B'.repeat(200) }, 'pdf').length < 200,
  );
});

test('descarga reconoce nombres anteriores y conserva un respaldo si falta el encabezado', () => {
  assert.equal(
    downloadFilename('attachment; filename="kairos-horas.pdf"', 'pdf'),
    'kairos-horas.pdf',
  );
  assert.equal(downloadFilename(null, 'xlsx'), 'kairos-horas.xlsx');
  assert.equal(
    downloadFilename('attachment; filename="kairos-horas.pdf"; filename*=UTF-8\'\'%xx', 'pdf'),
    'kairos-horas.pdf',
  );
});
