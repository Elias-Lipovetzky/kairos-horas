import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertRequest, assertResponse } from '../scripts/lib/contract.js';

const enabled = Boolean(process.env.KAIROS_API_URL);
test(
  'contrato contra API existente: consultas sin modificar datos de negocio',
  { skip: !enabled, timeout: 60000 },
  async (t) => {
    const base = process.env.KAIROS_API_URL.replace(/\/$/, '');
    assert.ok(
      process.env.KAIROS_TEST_EMAIL && process.env.KAIROS_TEST_PASSWORD,
      'Definir KAIROS_TEST_EMAIL y KAIROS_TEST_PASSWORD de una cuenta administradora.',
    );
    let cookie = '';
    async function request(path, method = 'GET', body, expected = 200, session = cookie) {
      if (expected === 200) assertRequest(method, path, body);
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Kairos-Client': 'web', Cookie: session },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = response.headers.get('content-type')?.startsWith('application/json')
        ? await response.json()
        : new Uint8Array(await response.arrayBuffer());
      assert.equal(response.status, expected, `${method} ${path}: estado inesperado`);
      assertResponse(method, path, response.status, data, response.headers);
      return { data, response };
    }
    await t.test('servicio, configuración pública y rechazo de acceso anónimo', async () => {
      await request('/health');
      await request('/config');
      await request('/catalog', 'GET', undefined, 401, '');
    });
    const login = await request('/login', 'POST', {
      email: process.env.KAIROS_TEST_EMAIL,
      password: process.env.KAIROS_TEST_PASSWORD,
    });
    cookie = login.response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('kairos='));
    assert.match(login.response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(login.response.headers.get('set-cookie'), /SameSite=Strict/i);
    t.after(async () => {
      if (cookie) await request('/logout', 'POST');
    });
    assert.equal(
      login.data.role,
      'admin',
      'Usar una cuenta administradora para consultar las rutas administrativas.',
    );
    await t.test('usuario, catálogo y usuarios mantienen los tipos documentados', async () => {
      await request('/me');
      await request('/catalog');
      await request('/users');
    });
    let records;
    await t.test('paginación y filtros de registros', async () => {
      records = (await request('/records?page=0')).data.records;
      await request('/records?from=2026-01-01&to=2026-12-31&page=0');
      if (records[0])
        await request(
          '/records?employee_id=' + records[0].employee_id + '&place_id=' + records[0].place_id,
        );
    });
    await t.test(
      'historial y notificaciones, incluidos valores nulos e IDs decimales',
      async () => {
        await request('/audit?page=0');
        await request('/notifications?page=0');
        await request('/notifications?reason=overlap&state=pending&page=0');
        await request('/records/' + (records?.[0]?.id || randomUUID()) + '/history');
      },
    );
    await t.test('errores HTTP con el mismo esquema JSON', async () => {
      await request('/records?employee_id=invalido', 'GET', undefined, 400);
      await request('/records?from=2026-02-30', 'GET', undefined, 400);
      await request('/records?from=2026-02-02&to=2026-01-01', 'GET', undefined, 400);
    });
    await t.test('exportaciones mantienen tipo MIME, nombre y formato binario', async () => {
      await request('/export/pdf');
      await request('/export/xlsx');
    });
  },
);
