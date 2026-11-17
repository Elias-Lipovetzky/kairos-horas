import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const chrome =
  process.env.CHROME_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
test(
  'interfaz móvil: búsqueda, grupos, borradores y confirmación conjunta',
  { skip: process.env.KAIROS_UI_TEST !== '1' || !chrome, timeout: 60000 },
  async (t) => {
    const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const employees = [
      { id: uid(1), name: 'María', dni: '30123456', active: true },
      { id: uid(2), name: 'Maria', dni: '40123456', active: true },
    ];
    const places = [
      { id: uid(3), name: 'Los calafates', active: true },
      { id: uid(4), name: 'Tante Sara', active: true },
      ...Array.from({ length: 30 }, (_, i) => ({
        id: uid(i + 10),
        name: 'Lugar ' + i,
        active: true,
      })),
    ];
    const submitted = [];
    const server = http.createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.url.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/me')
          return res.end(JSON.stringify({ id: uid(99), name: 'Admin', role: 'admin' }));
        if (req.url === '/api/catalog')
          return res.end(JSON.stringify({ employees, places, owners: [] }));
        if (req.url === '/api/records/batch') {
          let body = '';
          for await (const chunk of req) body += chunk;
          submitted.push(JSON.parse(body));
          if (submitted.length === 1) {
            res.statusCode = 409;
            return res.end(
              JSON.stringify({
                message: 'Confirmar',
                warnings: [{ row: 2, reason: 'duplicate', message: 'Revisar coincidencia' }],
                warning_token: 'demo-confirm',
              }),
            );
          }
          return res.end(
            JSON.stringify({ ids: [uid(101), uid(102), uid(103)], message: 'Carga guardada' }),
          );
        }
        res.statusCode = 404;
        return res.end('{}');
      }
      const path = resolve(
        root,
        'public',
        '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]),
      );
      if (
        !path.startsWith(resolve(root, 'public') + '/') &&
        !path.startsWith(resolve(root, 'public') + '\\')
      ) {
        res.statusCode = 403;
        return res.end();
      }
      try {
        res.setHeader(
          'Content-Type',
          { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ||
            'application/octet-stream',
        );
        res.end(readFileSync(path));
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(
      () =>
        new Promise((r) => {
          server.closeAllConnections();
          server.close(r);
        }),
    );
    mkdirSync(join(root, 'test-results'), { recursive: true });
    const profile = mkdtempSync(join(root, 'test-results', 'chrome-'));
    const browser = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        '--remote-debugging-pipe',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
    );
    let spawnError;
    browser.on('error', (e) => (spawnError = e));
    t.after(async () => {
      if (browser.exitCode === null) {
        const ended = new Promise((r) => browser.once('exit', r));
        browser.kill();
        await Promise.race([ended, delay(3000)]);
      }
    });
    let seq = 0,
      sessionId,
      buffer = '';
    const pending = new Map(),
      runtimeErrors = [];
    browser.stdio[4].setEncoding('utf8');
    browser.stdio[4].on('data', (chunk) => {
      buffer += chunk;
      let pos;
      while ((pos = buffer.indexOf('\0')) >= 0) {
        const raw = buffer.slice(0, pos);
        buffer = buffer.slice(pos + 1);
        if (!raw) continue;
        const msg = JSON.parse(raw);
        if (msg.method === 'Runtime.exceptionThrown')
          runtimeErrors.push(msg.params.exceptionDetails.text);
        if (msg.id) {
          const task = pending.get(msg.id);
          if (!task) continue;
          pending.delete(msg.id);
          msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
        }
      }
    });
    const command = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            new Error(
              'Chrome no respondió a ' + method + (spawnError ? ': ' + spawnError.message : ''),
            ),
          );
        }, 7000);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        browser.stdio[3].write(
          JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0',
        );
      });
    const target = await command('Target.createTarget', { url: 'about:blank' });
    sessionId = (
      await command('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    ).sessionId;
    const evaluate = async (expression) => {
      const r = await command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const wait = async (expression) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await delay(30);
      }
      assert.fail('No se cumplió: ' + expression);
    };
    await command('Runtime.enable');
    await command('Page.enable');
    await command('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await wait('!!document.querySelector("#batch-form")');
    const type = async (selector, value) =>
      evaluate(
        `(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    const click = (selector) =>
      evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const choose = async (selector, value, index = 0) => {
      await type(selector + ' [role=combobox]', value);
      await click(selector + ` [role=option]:nth-child(${index + 1})`);
    };
    assert.equal(
      await evaluate('document.querySelectorAll(".suggestions:not([hidden])").length'),
      0,
    );
    await type('[data-search=employee_id] [role=combobox]', 'maria');
    assert.equal(
      await evaluate('document.querySelectorAll("[data-search=employee_id] [role=option]").length'),
      2,
    );
    await click('[data-search=employee_id] [role=option]');
    await choose('[data-search=place_id]', 'calafates');
    await type('[name=hours]', '2');
    await type('[name=remainder]', '15');
    await click('[data-add-place="0"]');
    await choose('.entry[data-row="1"] [data-search=place_id]', 'tante');
    await type('.entry[data-row="1"] [name=hours]', '1');
    await click('#add-person');
    await choose('.person-batch[data-group="1"] [data-search=employee_id]', '40.123.456');
    await choose('.entry[data-row="2"] [data-search=place_id]', 'tante');
    await evaluate(
      `(()=>{const el=document.querySelector('.entry[data-row="2"] [name=mode]');el.value='times';el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await type('.entry[data-row="2"] [name=start_time]', '09:00');
    await type('.entry[data-row="2"] [name=end_time]', '12:30');
    assert.equal(
      await evaluate('document.querySelector("#batch-total").textContent.trim()'),
      '6:45 h',
    );
    assert.equal(await evaluate('document.querySelector("[name=employee_id]").value'), uid(1));
    await type('.person-batch[data-group="1"] [name=employee_id_query]', 'desconocido');
    assert.equal(
      await evaluate(
        'document.querySelector(".person-batch[data-group=\\"1\\"] [name=employee_id]").value',
      ),
      '',
    );
    assert.equal(await evaluate('document.querySelector("#batch-form").checkValidity()'), false);
    await choose('.person-batch[data-group="1"] [data-search=employee_id]', '40.123.456');
    await evaluate('document.querySelector("#batch-form").requestSubmit()');
    await wait('document.querySelector("#confirm-dialog").open');
    await click('#confirm-dialog [value=cancel]');
    await wait('!document.querySelector("#confirm-dialog").open');
    assert.equal(submitted.length, 0);
    assert.equal(await evaluate('document.querySelectorAll(".person-batch").length'), 2);
    await evaluate('document.querySelector("#batch-form").requestSubmit()');
    await wait('document.querySelector("#confirm-dialog").open');
    await click('#confirm-dialog [value=confirm]');
    await wait('!!document.querySelector("#confirm-warnings")');
    assert.deepEqual(
      submitted[0].records.map((r) => r.employee_id),
      [uid(1), uid(1), uid(2)],
    );
    assert.equal(submitted[0].records[0].minutes, 135);
    assert.match(
      await evaluate('document.querySelector("#batch-warnings").textContent'),
      /Persona 2, registro 1/,
    );
    const shot = await command('Page.captureScreenshot', { captureBeyondViewport: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      join(root, 'test-results', 'mobile-batches.png'),
      Buffer.from(shot.data, 'base64'),
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
    await click('#confirm-warnings');
    await wait('document.querySelector("#confirm-dialog").open');
    await click('#confirm-dialog [value=confirm]');
    await wait('!document.querySelector("#confirm-warnings")');
    assert.equal(submitted[1].warning_token, 'demo-confirm');
    assert.equal(submitted[0].submission_id, submitted[1].submission_id);
    assert.equal(await evaluate('document.querySelectorAll(".person-batch").length'), 1);
    assert.deepEqual(runtimeErrors, []);
  },
);
