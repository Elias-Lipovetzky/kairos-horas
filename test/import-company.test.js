import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test(
  'importación real: cuentas, totales originales, advertencias, procedencia y rollback',
  { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 },
  async (t) => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schemas = [0, 1].map(() => 'kairos_import_test_' + randomUUID().replaceAll('-', ''));
    const connections = schemas.map((schema) => {
      const url = new URL(process.env.TEST_DATABASE_URL);
      url.searchParams.set('options', '-c search_path=' + schema);
      return url.toString();
    });
    const pools = connections.map((connectionString) => new pg.Pool({ connectionString }));
    t.after(async () => {
      await Promise.all(pools.map((pool) => pool.end()));
      for (const schema of schemas) await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    });
    for (const schema of schemas) await control.query(`CREATE SCHEMA ${schema}`);
    await pools[0].query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
    const userId = randomUUID();
    await pools[0].query(
      `INSERT INTO users(id,name,email,password_hash,role)
      VALUES($1,'Admin','admin@example.test','hash-conservado','admin')`,
      [userId],
    );
    const cli = (database, command, input) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL('../server/import-company.mjs', import.meta.url)), command],
          { env: { ...process.env, DATABASE_URL: database }, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        let stdout = '',
          stderr = '';
        child.stdout.on('data', (v) => (stdout += v));
        child.stderr.on('data', (v) => (stderr += v));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.stdin.on('error', () => {});
        child.stdin.end(input ? JSON.stringify(input) : undefined);
      });
    const snapshotResult = await cli(connections[0], 'snapshot');
    assert.equal(snapshotResult.code, 0, snapshotResult.stderr);
    const snapshot = JSON.parse(snapshotResult.stdout);
    const source =
      ',empleado,dia,Fecha,Lugares,Entrada,Salida,Horas total,Se cobran?\n' +
      ',Ana,jueves,1/10,Casa,09:00,12:00,04:00,FALSE\n' +
      ',Ana,jueves,1/10,casa,,,02:00,TRUE\n' +
      ',Ana,jueves,1/10,Casa,,,00:00,FALSE\n';
    const bundle = {
      source,
      source_sha256: createHash('sha256').update(source).digest('hex'),
      year: 2026,
      snapshot,
    };
    const failed = await cli(connections[1], 'import', {
      ...bundle,
      snapshot: { ...snapshot, users: [snapshot.users[0], snapshot.users[0]] },
    });
    assert.equal(failed.code, 1);
    assert.equal(Number((await pools[1].query('SELECT count(*) n FROM users')).rows[0].n), 0);
    const success = await cli(connections[1], 'import', bundle);
    assert.equal(success.code, 0, success.stderr);
    const report = JSON.parse(success.stdout);
    assert.equal(Number(report.counts.records), 2);
    assert.equal(Number(report.counts.employees), 1);
    assert.equal(Number(report.counts.places), 1);
    assert.equal(Number(report.counts.notifications), 4);
    assert.equal(report.total_minutes, 360);
    assert.equal(report.quarantined.length, 1);
    assert.equal(report.provisional_employees[0].dni, '999000000001');
    const users = (await pools[1].query('SELECT * FROM users')).rows;
    assert.equal(users[0].id, userId);
    assert.equal(users[0].password_hash, 'hash-conservado');
    const rows = (await pools[1].query('SELECT * FROM records ORDER BY minutes')).rows;
    assert.deepEqual(
      rows.map((r) => r.minutes),
      [120, 240],
    );
    assert.ok(rows.every((r) => r.start_time === null && r.end_time === null));
    const events = (await pools[1].query("SELECT after_data FROM audit WHERE entity='records'"))
      .rows;
    assert.ok(
      events.every((r) => r.after_data.import_metadata.source_sha256 === bundle.source_sha256),
    );
    assert.ok(events.some((r) => r.after_data.import_metadata.source_billable === false));
    const retry = await cli(connections[1], 'import', bundle);
    assert.equal(retry.code, 1);
    assert.match(retry.stderr, /no está vacía/);
    assert.equal(Number((await pools[1].query('SELECT count(*) n FROM records')).rows[0].n), 2);
  },
);
