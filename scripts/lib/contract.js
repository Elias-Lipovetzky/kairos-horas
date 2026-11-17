import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export const contract = JSON.parse(
  readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'),
);
export function resolve(value) {
  if (!value?.$ref) return value;
  assert.ok(value.$ref.startsWith('#/'), 'El contrato usa solo referencias locales.');
  const target = value.$ref
    .slice(2)
    .split('/')
    .reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], contract);
  assert.notEqual(target, undefined, `Referencia inexistente: ${value.$ref}`);
  return {
    ...resolve(target),
    ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')),
  };
}
const matchesType = (value, type) =>
  type === 'null'
    ? value === null
    : type === 'array'
      ? Array.isArray(value)
      : type === 'object'
        ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : type === 'integer'
          ? Number.isSafeInteger(value)
          : type === 'number'
            ? typeof value === 'number' && Number.isFinite(value)
            : typeof value === type;
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const formats = {
  uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  date: validDate,
  'date-time': (value) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    validDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value)),
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
};

// Dependency-free validation of the JSON Schema keywords actually used by this contract.
// This is not a general OpenAPI/JSON Schema validator; the static tests reject unknown keywords.
export function schemaErrors(value, input, path = '$') {
  const schema = resolve(input);
  if (schema === true) return [];
  if (schema === false) return [`${path}: valor no permitido`];
  const errors = [];
  if (schema.type && ![schema.type].flat().some((type) => matchesType(value, type)))
    return [`${path}: tipo incompatible`];
  if (schema.const !== undefined && value !== schema.const)
    errors.push(`${path}: valor constante incompatible`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: valor fuera del enum`);
  if (schema.allOf)
    for (const branch of schema.allOf) errors.push(...schemaErrors(value, branch, path));
  if (
    schema.anyOf &&
    !schema.anyOf.some((branch) => schemaErrors(value, branch, path).length === 0)
  )
    errors.push(`${path}: ninguna alternativa compatible`);
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength)
      errors.push(`${path}: texto demasiado corto`);
    if (schema.maxLength !== undefined && length > schema.maxLength)
      errors.push(`${path}: texto demasiado largo`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}: formato de texto incompatible`);
    if (schema.format && schema.format !== 'binary') {
      assert.ok(formats[schema.format], `Formato sin validador: ${schema.format}`);
      if (!formats[schema.format](value)) errors.push(`${path}: formato ${schema.format} inválido`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path}: menor al mínimo`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path}: mayor al máximo`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${path}: faltan elementos`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${path}: demasiados elementos`);
    if (schema.items)
      value.forEach((item, i) => errors.push(...schemaErrors(item, schema.items, `${path}[${i}]`)));
  } else if (value !== null && typeof value === 'object') {
    for (const key of schema.required || [])
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: campo obligatorio ausente`);
    for (const [key, dependencies] of Object.entries(schema.dependentRequired || {}))
      if (Object.hasOwn(value, key))
        for (const dependency of dependencies)
          if (!Object.hasOwn(value, dependency))
            errors.push(`${path}.${dependency}: obligatorio junto con ${key}`);
    for (const [key, property] of Object.entries(schema.properties || {}))
      if (Object.hasOwn(value, key))
        errors.push(...schemaErrors(value[key], property, `${path}.${key}`));
  }
  return errors;
}
export function assertSchema(value, schema, label = 'Contrato') {
  const errors = schemaErrors(value, schema);
  assert.deepEqual(errors, [], `${label}: ${errors.join('; ')}`);
}
export function operationFor(method, path) {
  const url = new URL(path, 'http://kairos.test');
  const pathname = url.pathname.replace(/^\/api(?=\/|$)/, '');
  for (const [template, pathItem] of Object.entries(contract.paths)) {
    const names = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const pattern = template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '([^/]+)');
    const match = pathname.match(new RegExp(`^${pattern}$`));
    if (match && pathItem[method.toLowerCase()])
      return {
        operation: pathItem[method.toLowerCase()],
        template,
        url,
        params: Object.fromEntries(
          names.map((name, i) => [name, decodeURIComponent(match[i + 1])]),
        ),
      };
  }
  assert.fail(`Operación no documentada: ${method} ${pathname}`);
}
function entitySchema(params, input) {
  const name = { employees: 'Employee', owners: 'Owner', places: 'Place' }[params.entity];
  return name ? { $ref: `#/components/schemas/${name}${input ? 'Input' : ''}` } : null;
}
export function assertRequest(method, path, body, headers = { 'X-Kairos-Client': 'web' }) {
  const { operation, params, url } = operationFor(method, path);
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const entry of operation.parameters || []) {
    const parameter = resolve(entry),
      schema = resolve(parameter.schema);
    let value =
      parameter.in === 'path'
        ? params[parameter.name]
        : parameter.in === 'query'
          ? (url.searchParams.get(parameter.name) ?? undefined)
          : normalizedHeaders[parameter.name.toLowerCase()];
    if (value === undefined) {
      assert.ok(!parameter.required, `Falta ${parameter.in}: ${parameter.name}`);
      continue;
    }
    if (parameter.in === 'query' && schema.type === 'integer' && /^\d+$/.test(value))
      value = Number(value);
    assertSchema(value, schema, parameter.name);
  }
  const requestBody = resolve(operation.requestBody);
  if (body === undefined) {
    assert.ok(!requestBody?.required, 'Falta cuerpo JSON obligatorio.');
    return;
  }
  if (requestBody?.content?.['application/json'])
    assertSchema(
      body,
      entitySchema(params, true) || requestBody.content['application/json'].schema,
      operation.operationId + ' request',
    );
}
function assertNoSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      !['password', 'password_hash', 'token', 'token_hash'].includes(key),
      `La respuesta expone un campo secreto: ${key}`,
    );
    assertNoSecrets(child);
  }
}
export function assertResponse(method, path, status, body, headers) {
  const { operation, params } = operationFor(method, path);
  const response = resolve(operation.responses[String(status)] || operation.responses.default);
  assert.ok(response, `Estado no documentado: ${operation.operationId} ${status}`);
  const contentType = headers.get('content-type')?.split(';')[0].trim();
  const media = response.content?.[contentType];
  assert.ok(media, `Tipo de respuesta no documentado: ${operation.operationId} ${contentType}`);
  if (contentType === 'application/json') {
    assertSchema(
      body,
      status === 200 && params.entity ? entitySchema(params, false) : media.schema,
      operation.operationId + ' response',
    );
    assertNoSecrets(body);
  } else {
    assert.ok(body instanceof Uint8Array, 'El archivo debe ser binario.');
    const expected =
      params.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    assert.equal(contentType, expected);
    assert.match(
      headers.get('content-disposition') || '',
      new RegExp(`attachment;.*filename="kairos-horas(?:-[^"]+)?\\.${params.format}"`),
    );
    assert.equal(
      Buffer.from(body)
        .subarray(0, params.format === 'pdf' ? 4 : 2)
        .toString(),
      params.format === 'pdf' ? '%PDF' : 'PK',
    );
  }
  for (const [name, header] of Object.entries(response.headers || {})) {
    const value = headers.get(name);
    if (value !== null)
      assertSchema(value, resolve(header).schema, `${operation.operationId} ${name}`);
  }
}
