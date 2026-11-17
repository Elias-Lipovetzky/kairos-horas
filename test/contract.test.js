import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  contract,
  resolve,
  assertSchema,
  schemaErrors,
  assertRequest,
  assertResponse,
  operationFor,
} from '../scripts/lib/contract.js';

const id = '11111111-1111-4111-8111-111111111111';
const record = { employee_id: id, place_id: id, date: '2026-01-20', minutes: 270 };
const jsonHeaders = new Headers({ 'content-type': 'application/json; charset=utf-8' });
test('el contrato cubre todas las rutas implementadas sin operaciones extra', () => {
  const routesDirectory = new URL('../server/routes/', import.meta.url);
  const source = readdirSync(routesDirectory)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(new URL(file, routesDirectory), 'utf8'))
    .join('\n');
  const implemented = [...source.matchAll(/app\.(get|post|put|delete)\(\s*'\/api([^']*)'/g)]
    .map(([, method, path]) => method.toUpperCase() + ' ' + path.replace(/:([a-z_]+)/g, '{$1}'))
    .sort();
  const documented = Object.entries(contract.paths)
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((key) => ['get', 'post', 'put', 'delete'].includes(key))
        .map((method) => method.toUpperCase() + ' ' + path),
    )
    .sort();
  assert.deepEqual(documented, implemented);
});
test('referencias, operationId, encabezados y permisos están definidos', () => {
  const ids = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) resolve(value);
    for (const child of Object.values(value)) walk(child);
  }
  walk(contract);
  for (const item of Object.values(contract.paths))
    for (const [method, operation] of Object.entries(item)) {
      assert.ok(operation.operationId);
      assert.ok(!ids.has(operation.operationId));
      ids.add(operation.operationId);
      assert.ok(operation.responses['200']);
      if (method !== 'get')
        assert.ok(
          operation.parameters
            ?.map(resolve)
            .some((p) => p.name === 'X-Kairos-Client' && p.required),
        );
      if (operation.security === undefined) assert.ok(operation.responses['401']);
      if (operation['x-roles']) assert.deepEqual(operation['x-roles'], ['admin']);
    }
  assert.equal(contract.components.securitySchemes.sessionCookie.name, 'kairos');
});
test('el validador no ignora palabras clave JSON Schema nuevas', () => {
  const supported = new Set([
    '$ref',
    'type',
    'format',
    'pattern',
    'description',
    'title',
    'required',
    'dependentRequired',
    'properties',
    'items',
    'minItems',
    'maxItems',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'const',
    'enum',
    'allOf',
    'anyOf',
    'default',
    'writeOnly',
  ]);
  function check(schema) {
    for (const key of Object.keys(schema))
      assert.ok(supported.has(key), `Agregar validación para: ${key}`);
    for (const child of Object.values(schema.properties || {})) check(child);
    if (schema.items) check(schema.items);
    for (const key of ['allOf', 'anyOf']) schema[key]?.forEach(check);
  }
  Object.values(contract.components.schemas).forEach(check);
  for (const path of Object.values(contract.paths))
    for (const operation of Object.values(path)) {
      for (const parameter of operation.parameters || []) check(resolve(parameter).schema);
      const body = resolve(operation.requestBody);
      if (body) for (const media of Object.values(body.content)) check(media.schema);
      for (const entry of Object.values(operation.responses))
        for (const media of Object.values(resolve(entry).content || {})) check(media.schema);
    }
});
test('contrato acepta las dos modalidades de carga y rechaza datos incompletos', () => {
  assertRequest('POST', '/records/batch', { submission_id: id, records: [record] });
  assertRequest('POST', '/records/batch', {
    submission_id: id,
    records: [{ ...record, minutes: 0, start_time: '08:00', end_time: '12:30' }],
  });
  for (const value of [
    { ...record, minutes: 0 },
    { ...record, start_time: '08:00' },
    { employee_id: id, place_id: id, date: record.date },
  ])
    assert.ok(schemaErrors(value, { $ref: '#/components/schemas/RecordInput' }).length);
  assert.throws(() => assertRequest('POST', '/records/batch', { submission_id: id, records: [] }));
  assert.throws(() =>
    assertRequest('POST', '/records/batch', {
      submission_id: id,
      records: Array(101).fill(record),
    }),
  );
});
test('versiones, encabezado de cliente y esquema de catálogo son obligatorios', () => {
  assert.throws(() => assertRequest('DELETE', '/records/' + id, {}));
  assertRequest('DELETE', '/records/' + id, { version: 1 });
  assert.throws(() =>
    assertRequest('POST', '/login', { email: 'admin@example.test', password: 'clave' }, {}),
  );
  assert.throws(() => assertRequest('POST', '/catalog/employees', { name: 'Persona' }));
  assertRequest('POST', '/catalog/employees', { name: 'Persona', dni: '30.123.456' });
  assert.throws(() => assertRequest('POST', '/catalog/places', { name: 'Lugar', owners: [] }));
});
test('tipos de respuesta, null, IDs grandes y campos nuevos conservan compatibilidad', () => {
  assertSchema(
    { id: '9007199254740993' },
    { type: 'object', properties: { id: { $ref: '#/components/schemas/DecimalId' } } },
  );
  assert.throws(() =>
    assertSchema(
      { id: 123 },
      { type: 'object', properties: { id: { $ref: '#/components/schemas/DecimalId' } } },
    ),
  );
  assertSchema({ ok: true, new_optional_field: 'futuro' }, { $ref: '#/components/schemas/Ok' });
  assertSchema(null, { $ref: '#/components/schemas/AuditSnapshot' });
  assert.throws(() => assertSchema('2026-02-30', { type: 'string', format: 'date' }));
  assert.throws(() =>
    assertResponse(
      'GET',
      '/records',
      200,
      { records: [], count: 0, minutes: '0', page: 0 },
      jsonHeaders,
    ),
  );
});
test('respuestas de advertencia y errores por fila preservan señales de máquina', () => {
  assertResponse(
    'POST',
    '/records/batch',
    409,
    {
      message: 'Texto modificable',
      warnings: [{ reason: 'long_duration', message: 'Revisar', row: 0 }],
      warning_token: 'valor-opaco',
    },
    jsonHeaders,
  );
  assertResponse(
    'POST',
    '/records/batch',
    400,
    { message: 'Corregir', errors: [{ row: 0, message: 'Fecha inválida' }] },
    jsonHeaders,
  );
  assertResponse(
    'POST',
    '/records/batch',
    409,
    { message: 'Reintento incompatible', reset_submission: true },
    jsonHeaders,
  );
  assert.throws(() => assertResponse('POST', '/records/batch', 409, { warnings: [] }, jsonHeaders));
  assert.throws(() =>
    assertResponse(
      'POST',
      '/records/batch',
      409,
      { message: 'Revisar', warnings: [{ reason: 'duplicate', message: 'Aviso' }] },
      jsonHeaders,
    ),
  );
  assert.throws(() =>
    assertResponse(
      'POST',
      '/records/batch',
      409,
      { message: 'Revisar', warnings: [{ reason: 'inventado', message: 'Aviso' }] },
      jsonHeaders,
    ),
  );
});
test('no se exponen secretos en respuestas ni se aceptan estados sin documentar', () => {
  assert.throws(() =>
    assertResponse(
      'GET',
      '/config',
      200,
      { recoveryAvailable: false, password_hash: 'secreto' },
      jsonHeaders,
    ),
  );
  assert.throws(() => assertResponse('GET', '/health', 201, { ok: true }, jsonHeaders));
  assert.equal(operationFor('PUT', '/api/records/' + id).operation.operationId, 'updateRecord');
});
