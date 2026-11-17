import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = promisify(execFile);
const enabled = process.env.KAIROS_TLS_TEST === '1';
const docker = async (...args) =>
  (
    await run('docker', args, {
      cwd: root,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  ).stdout;

test(
  'production port replacement preserves database naming and removes public 8080',
  { skip: !enabled },
  async () => {
    const config = JSON.parse(
      await docker(
        'compose',
        '-p',
        'kairos-config-test',
        '--env-file',
        '.env.example',
        '-f',
        'compose.yaml',
        '-f',
        'compose.https.yaml',
        'config',
        '--format',
        'json',
      ),
    );
    assert.deepEqual(
      config.services.proxy.ports.map((port) => Number(port.published)).sort((a, b) => a - b),
      [80, 443],
    );
    assert.ok(!config.services.db.ports?.length);
    assert.ok(!config.services.app.ports?.length);
    assert.equal(config.volumes.postgres_data.name, 'kairos-config-test_postgres_data');
    const bootstrap = JSON.parse(
      await docker(
        'compose',
        '-p',
        'kairos-config-test',
        '--env-file',
        '.env.example',
        '-f',
        'compose.yaml',
        '-f',
        'compose.https.yaml',
        '-f',
        'compose.https-bootstrap.yaml',
        'config',
        '--format',
        'json',
      ),
    );
    assert.deepEqual(
      bootstrap.services.proxy.ports.map((p) => Number(p.published)).sort((a, b) => a - b),
      [80, 443, 8080],
    );
  },
);

test(
  'real Nginx: ACME, trusted TLS, redirect, proxy headers and certificate reload',
  { skip: !enabled, timeout: 180000 },
  async () => {
    const project = 'kairos-tls-test-' + randomUUID().slice(0, 8);
    const results = resolve(root, 'test-results');
    const directory = join(results, project);
    const inside = relative(results, directory);
    assert.ok(inside && !inside.startsWith('..'));
    const certificates = join(directory, 'certificates');
    const live = join(certificates, 'live', 'kairoshoras.com');
    const webroot = join(directory, 'webroot');
    const challenge = join(webroot, '.well-known', 'acme-challenge');
    await mkdir(live, { recursive: true });
    await mkdir(challenge, { recursive: true });
    await writeFile(join(challenge, 'check'), 'challenge-proof');
    const certificateCommand = `
      apk add --no-cache openssl >/dev/null
      openssl req -x509 -newkey rsa:2048 -nodes -days 2
        -subj /CN=kairoshoras.com -addext subjectAltName=DNS:kairoshoras.com
        -keyout /certificates/live/kairoshoras.com/privkey.pem
        -out /certificates/live/kairoshoras.com/fullchain.pem 2>/dev/null
    `
      .trim()
      .replace(/\n\s+(?=-)/g, ' ');
    const generateCertificate = () =>
      docker(
        'run',
        '--rm',
        '--mount',
        `type=bind,source=${certificates},target=/certificates`,
        'nginx:1.28-alpine',
        'sh',
        '-ec',
        certificateCommand,
      );
    const composeFile = join(directory, 'compose.json');
    const configuration = {
      services: {
        app: {
          image: 'node:22-bookworm-slim',
          command: [
            'node',
            '--input-type=module',
            '-e',
            `
          import http from 'node:http';
          http.createServer((req,res)=>{
            res.setHeader('content-type','application/json');
            res.end(JSON.stringify({headers:req.headers}));
          }).listen(3000,'0.0.0.0');
        `,
          ],
        },
        proxy: {
          image: 'nginx:1.28-alpine',
          ports: ['127.0.0.1::80', '127.0.0.1::443'],
          volumes: [
            {
              type: 'bind',
              source: join(root, 'deploy/nginx/acme.conf'),
              target: '/etc/nginx/conf.d/default.conf',
              read_only: true,
            },
            {
              type: 'bind',
              source: join(root, 'deploy/nginx'),
              target: '/etc/nginx/kairos',
              read_only: true,
            },
            { type: 'bind', source: certificates, target: '/etc/letsencrypt', read_only: true },
            { type: 'bind', source: webroot, target: '/var/www/certbot', read_only: true },
          ],
          depends_on: ['app'],
        },
      },
    };
    const dc = (...args) => docker('compose', '-p', project, '-f', composeFile, ...args);
    const port = async (target) =>
      Number((await dc('port', 'proxy', String(target))).trim().split(':').at(-1));
    const tlsRequest = (hostPort, ca, requestPath = '/api/health') =>
      new Promise((resolveRequest, reject) => {
        const request = https.get(
          {
            hostname: '127.0.0.1',
            port: hostPort,
            path: requestPath,
            servername: 'kairoshoras.com',
            ca,
            agent: false,
            headers: {
              Host: 'kairoshoras.com',
              'X-Forwarded-For': '1.2.3.4',
              'CF-Connecting-IP': '1.2.3.4',
              'X-Forwarded-Proto': 'http',
            },
          },
          (response) => {
            const fingerprint = response.socket.getPeerCertificate().fingerprint256;
            let body = '';
            response.on('data', (v) => (body += v));
            response.on('end', () => {
              try {
                resolveRequest({
                  status: response.statusCode,
                  body: response.headers['content-type']?.includes('application/json')
                    ? JSON.parse(body)
                    : body,
                  fingerprint,
                });
              } catch (error) {
                reject(error);
              }
            });
          },
        );
        request.setTimeout(5000, () => request.destroy(new Error('TLS request timed out')));
        request.on('error', reject);
      });
    try {
      await generateCertificate();
      await writeFile(composeFile, JSON.stringify(configuration));
      await dc('up', '-d');
      let httpPort = await port(80);
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${httpPort}/api/health`)).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(250);
      }
      assert.ok(ready, 'Fixture upstream is ready');
      assert.equal(
        await (await fetch(`http://127.0.0.1:${httpPort}/.well-known/acme-challenge/check`)).text(),
        'challenge-proof',
      );
      configuration.services.proxy.volumes[0].source = join(root, 'deploy/nginx/https.conf');
      await writeFile(composeFile, JSON.stringify(configuration));
      await dc('up', '-d', '--no-deps', '--force-recreate', 'proxy');
      httpPort = await port(80);
      const httpsPort = await port(443);
      const redirect = await fetch(`http://127.0.0.1:${httpPort}/records?from=2026-10-01`, {
        redirect: 'manual',
      });
      assert.equal(redirect.status, 308);
      assert.equal(
        redirect.headers.get('location'),
        'https://kairoshoras.com/records?from=2026-10-01',
      );
      assert.equal(
        await (await fetch(`http://127.0.0.1:${httpPort}/.well-known/acme-challenge/check`)).text(),
        'challenge-proof',
      );
      const response = await tlsRequest(httpsPort, await readFile(join(live, 'fullchain.pem')));
      assert.equal(response.status, 200);
      assert.equal(response.body.headers['x-forwarded-proto'], 'https');
      assert.equal(response.body.headers.host, 'kairoshoras.com');
      assert.notEqual(response.body.headers['x-forwarded-for'], '1.2.3.4');
      const httpsChallenge = await tlsRequest(
        httpsPort,
        await readFile(join(live, 'fullchain.pem')),
        '/.well-known/acme-challenge/check',
      );
      assert.equal(httpsChallenge.body, 'challenge-proof');
      await generateCertificate();
      await dc('exec', '-T', 'proxy', 'nginx', '-t');
      await dc('exec', '-T', 'proxy', 'nginx', '-s', 'reload');
      await delay(1000);
      const renewed = await tlsRequest(httpsPort, await readFile(join(live, 'fullchain.pem')));
      assert.notEqual(renewed.fingerprint, response.fingerprint);
      assert.equal(renewed.status, 200);
    } finally {
      await dc('down').catch(() => {});
      assert.ok(relative(results, directory) && !relative(results, directory).startsWith('..'));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
