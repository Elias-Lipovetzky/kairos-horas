import { createHash, randomUUID } from 'node:crypto';
import { pool, migrate, transaction } from './db.js';
import { audit, notify } from './services/audit.js';
import { DATABASE_LOCKS, lockForTransaction } from './services/locks.js';
import { normalizeRecord, warningsFor } from './domain.js';
import { transformCompanyCsv } from '../scripts/lib/company-csv.js';

const key = (name) => name.normalize('NFC').trim().toLocaleLowerCase('es-AR');
const countSql = `SELECT json_build_object(
  'users', (SELECT count(*) FROM users), 'employees', (SELECT count(*) FROM employees),
  'places', (SELECT count(*) FROM places), 'owners', (SELECT count(*) FROM owners),
  'records', (SELECT count(*) FROM records), 'audit', (SELECT count(*) FROM audit),
  'notifications', (SELECT count(*) FROM notifications)) counts`;

async function snapshot() {
  return transaction(async (client) => {
    const users = (await client.query('SELECT * FROM users ORDER BY email')).rows;
    if (!users.some((user) => user.active && user.role === 'admin')) {
      throw new Error('No hay administrador activo para conservar el acceso.');
    }
    const counts = (await client.query(countSql)).rows[0].counts;
    return { users, counts };
  });
}

async function importCompany(bundle) {
  const digest = createHash('sha256').update(bundle.source, 'utf8').digest('hex');
  if (digest !== bundle.source_sha256) throw new Error('La huella del CSV no coincide.');
  const prepared = transformCompanyCsv(bundle.source, bundle.year, undefined, {
    preserveTotal: true,
    quarantineZero: true,
  });
  if (prepared.errors.length || !prepared.records.length)
    throw new Error('La preparación tiene errores o está vacía.');
  const users = bundle.snapshot?.users;
  const actor =
    users?.find((u) => u.active && u.role === 'admin' && u.email === 'admin@kairos.local') ||
    users?.find((u) => u.active && u.role === 'admin');
  if (!actor) throw new Error('Falta el administrador de origen.');
  await migrate();
  return transaction(async (client) => {
    for (const lock of [
      DATABASE_LOCKS.recordWrites,
      DATABASE_LOCKS.catalogWrites,
      DATABASE_LOCKS.userAdministration,
    ]) {
      await lockForTransaction(client, lock);
    }
    const before = (await client.query(countSql)).rows[0].counts;
    if (Object.values(before).some((count) => Number(count) !== 0)) {
      throw new Error('La base de destino no está vacía. No se importó nada.');
    }
    for (const user of users) {
      await client.query(
        `INSERT INTO users
        (id,name,email,password_hash,role,active,created_at,registration_pending)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          user.id,
          user.name,
          user.email,
          user.password_hash,
          user.role,
          user.active,
          user.created_at,
          user.registration_pending || false,
        ],
      );
    }
    const owner = {
      id: randomUUID(),
      name: 'Dueño pendiente de identificar - importación CSV ' + bundle.year,
    };
    await client.query('INSERT INTO owners(id,name) VALUES($1,$2)', [owner.id, owner.name]);
    await audit(client, actor.id, 'owners', owner.id, 'create', null, owner);
    const employees = new Map(),
      places = new Map();
    for (const [index, name] of prepared.employees.entries()) {
      const employee = { id: randomUUID(), name, dni: String(999000000001 + index) };
      await client.query('INSERT INTO employees(id,name,dni) VALUES($1,$2,$3)', [
        employee.id,
        employee.name,
        employee.dni,
      ]);
      await audit(client, actor.id, 'employees', employee.id, 'create', null, {
        ...employee,
        import_metadata: { dni_provisional: true, source_sha256: digest },
      });
      employees.set(key(name), employee);
    }
    for (const name of prepared.places) {
      const place = { id: randomUUID(), name };
      await client.query('INSERT INTO places(id,name) VALUES($1,$2)', [place.id, name]);
      await client.query(
        'INSERT INTO place_owners(place_id,owner_id,is_primary) VALUES($1,$2,true)',
        [place.id, owner.id],
      );
      await audit(client, actor.id, 'places', place.id, 'create', null, {
        ...place,
        owners: [{ owner_id: owner.id, is_primary: true }],
      });
      places.set(key(name), place);
    }
    const records = prepared.records.map((row) => ({
      ...row,
      id: randomUUID(),
      employee_id: employees.get(key(row.employee_name)).id,
      place_id: places.get(key(row.place_name)).id,
    }));
    let warningCount = 0;
    for (const row of records) {
      const record = normalizeRecord(row);
      const after = (
        await client.query(
          `INSERT INTO records
        (id,employee_id,place_id,date,start_time,end_time,minutes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            row.id,
            record.employee_id,
            record.place_id,
            record.date,
            record.start_time,
            record.end_time,
            record.minutes,
            actor.id,
          ],
        )
      ).rows[0];
      const warnings = warningsFor(row, records);
      warningCount += warnings.length;
      await notify(
        client,
        actor.id,
        row.id,
        'create',
        null,
        {
          ...after,
          import_metadata: {
            source_sha256: digest,
            source_line: row.source_line,
            source_minutes: row.source_minutes,
            source_start: row.source_start,
            source_end: row.source_end,
            source_billable: row.source_billable,
            employee_name: row.employee_name,
            place_name: row.place_name,
          },
        },
        warnings,
      );
    }
    const counts = (await client.query(countSql)).rows[0].counts;
    const total = Number(
      (await client.query('SELECT sum(minutes) total FROM records')).rows[0].total,
    );
    if (
      Number(counts.records) !== records.length ||
      total !== prepared.total_minutes ||
      Number(counts.notifications) !== records.length + warningCount ||
      Number(counts.employees) !== employees.size ||
      Number(counts.places) !== places.size
    ) {
      throw new Error('La verificación final no coincide. Se revierte toda la importación.');
    }
    return {
      source_sha256: digest,
      year: bundle.year,
      counts,
      total_minutes: total,
      warnings: warningCount,
      ignored: prepared.ignored.length,
      quarantined: prepared.quarantined,
      notes: prepared.notes,
      actor_email: actor.email,
      provisional_employees: [...employees.values()],
      provisional_owner: owner,
      policy:
        'Conservar Horas total; vaciar horarios inconsistentes; separar ceros; conservar duplicados.',
    };
  });
}

try {
  const command = process.argv[2];
  if (command === 'snapshot') console.log(JSON.stringify(await snapshot()));
  else if (command === 'import') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    console.log(JSON.stringify(await importCompany(JSON.parse(input))));
  } else throw new Error('Uso interno: snapshot o import mediante scripts/Reiniciar-Importar.mjs.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
