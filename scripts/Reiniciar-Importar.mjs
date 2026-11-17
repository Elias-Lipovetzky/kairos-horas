import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { transformCompanyCsv } from './lib/company-csv.js';

// Destructive only with --execute. All Docker commands target this checkout's Compose project.
const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    year: { type: 'string' },
    execute: { type: 'boolean', default: false },
  },
});
if (!values.source || !values.year) {
  throw new Error(
    'Uso: node scripts/Reiniciar-Importar.mjs --source archivo.csv --year 2026 [--execute]',
  );
}
const bytes = await readFile(resolve(values.source));
const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const year = Number(values.year);
const prepared = transformCompanyCsv(source, year, undefined, {
  preserveTotal: true,
  quarantineZero: true,
});
if (prepared.errors.length || !prepared.records.length) {
  throw new Error('CSV vacío o con errores sin resolver: ' + JSON.stringify(prepared.errors));
}
const sourceHash = createHash('sha256').update(bytes).digest('hex');
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const backupRoot = join(root, 'backups');
const output = join(backupRoot, 'reinicio-' + runId);
await mkdir(backupRoot, { recursive: true });
await mkdir(output);
const saveJson = (name, value) =>
  writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
await writeFile(join(output, 'original.csv'), bytes, { mode: 0o600, flag: 'wx' });
await saveJson('preparado.json', { source_sha256: sourceHash, ...prepared });
console.log(
  `Preparado: ${prepared.records.length} registros, ${prepared.employees.length} empleados, ${prepared.places.length} lugares.`,
);
console.log(
  `Total: ${prepared.total_minutes} minutos. Separados: ${prepared.quarantined.length} registros de cero horas.`,
);
console.log('Archivos privados: ' + output);

function docker(args, { input, quiet = false } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn('docker', args, {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!quiet) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (!quiet) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolveCommand(stdout)
        : reject(new Error(stderr.trim() || `Docker terminó con código ${code}.`)),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const compose = (args, options) => docker(['compose', ...args], options);
const postgres = (command, args = []) =>
  compose(['exec', '-T', 'db', 'sh', '-c', command, 'kairos-import', ...args], { quiet: true });
const countSql = `SELECT json_build_object(
  'users',(SELECT count(*) FROM users),'employees',(SELECT count(*) FROM employees),
  'places',(SELECT count(*) FROM places),'owners',(SELECT count(*) FROM owners),
  'records',(SELECT count(*) FROM records),'audit',(SELECT count(*) FROM audit),
  'notifications',(SELECT count(*) FROM notifications))`;
const normalizedPath = (path) => path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const healthProbe = `
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/health');
      if (response.ok) process.exit(0);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.exit(1);
`;

async function verifiedVolume() {
  const config = JSON.parse(await compose(['config', '--format', 'json'], { quiet: true }));
  const storage = config.services?.db?.volumes?.find(
    (v) => v.target === '/var/lib/postgresql/data',
  );
  if (!config.name || storage?.type !== 'volume')
    throw new Error('No se identificó el volumen PostgreSQL de este proyecto.');
  const name = config.volumes?.[storage.source]?.name;
  if (!name) throw new Error('Falta el nombre absoluto del volumen en Compose.');
  const volume = JSON.parse(await docker(['volume', 'inspect', name], { quiet: true }))[0];
  if (
    volume.Labels?.['com.docker.compose.project'] !== config.name ||
    volume.Labels?.['com.docker.compose.volume'] !== storage.source
  ) {
    throw new Error('El volumen no tiene las etiquetas esperadas de este proyecto.');
  }
  const id = (await compose(['ps', '-q', 'db'], { quiet: true })).trim();
  if (!id) throw new Error('La base actual debe estar en ejecución para respaldarla.');
  const db = JSON.parse(await docker(['inspect', id], { quiet: true }))[0];
  if (
    normalizedPath(db.Config.Labels['com.docker.compose.project.working_dir'] || '') !==
      normalizedPath(root) ||
    !db.Mounts.some((mount) => mount.Destination === storage.target && mount.Name === name)
  ) {
    throw new Error('El contenedor o el volumen no corresponden a esta carpeta.');
  }
  return name;
}

async function execute() {
  const volume = await verifiedVolume();
  console.log('Volumen comprobado: ' + volume);
  // Build before any downtime or deletion, so dependency/build failures leave the old app running.
  await compose(['build', 'app']);
  console.log('Probando la importación en esquemas aislados antes de detener la aplicación...');
  await compose([
    'run',
    '--rm',
    '--no-deps',
    '-T',
    'app',
    'sh',
    '-c',
    'TEST_DATABASE_URL="$DATABASE_URL" node --test test/company-csv.test.js test/import-company.test.js',
  ]);
  let stopped = false,
    removed = false,
    validationCreated = false;
  const temporaryDatabase = 'kairos_verify_' + randomUUID().replaceAll('-', '');
  const containerDump = '/tmp/kairos-before-' + randomUUID() + '.dump';
  const localDump = join(output, 'antes.dump');
  try {
    await compose(['stop', 'proxy', 'app']);
    stopped = true;
    const snapshot = JSON.parse(
      await compose(
        ['run', '--rm', '--no-deps', '-T', 'app', 'node', 'server/import-company.mjs', 'snapshot'],
        { quiet: true },
      ),
    );
    await saveJson('cuentas.json', snapshot);
    await postgres('pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$1"', [containerDump]);
    await compose(['cp', 'db:' + containerDump, localDump], { quiet: true });
    if (!(await stat(localDump)).size) throw new Error('El respaldo está vacío.');
    const dumpHash = createHash('sha256')
      .update(await readFile(localDump))
      .digest('hex');
    const originalHash = (await postgres('sha256sum "$1"', [containerDump])).trim().split(/\s+/)[0];
    if (dumpHash !== originalHash)
      throw new Error('La copia local del respaldo no coincide con el archivo del contenedor.');
    console.log('Comprobando el respaldo mediante restauración en una base temporal...');
    await postgres('createdb -U "$POSTGRES_USER" "$1"', [temporaryDatabase]);
    validationCreated = true;
    await postgres('pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$1" "$2"', [
      temporaryDatabase,
      containerDump,
    ]);
    const restored = JSON.parse(
      await postgres('psql -X -U "$POSTGRES_USER" -d "$1" -At -v ON_ERROR_STOP=1 -c "$2"', [
        temporaryDatabase,
        countSql,
      ]),
    );
    for (const [table, count] of Object.entries(snapshot.counts)) {
      if (Number(restored[table]) !== Number(count))
        throw new Error('El respaldo no coincide en ' + table);
    }
    await postgres('dropdb -U "$POSTGRES_USER" "$1"', [temporaryDatabase]);
    validationCreated = false;
    await saveJson('respaldo-verificado.json', {
      volume,
      counts: restored,
      sha256: dumpHash,
    });
    console.log('Respaldo restaurado y verificado. Se reemplaza únicamente ' + volume);
    await compose(['down']);
    await docker(['volume', 'rm', volume]);
    removed = true;
    await compose(['up', '-d', '--wait', '--wait-timeout', '120', 'db']);
    const report = JSON.parse(
      await compose(
        ['run', '--rm', '--no-deps', '-T', 'app', 'node', 'server/import-company.mjs', 'import'],
        {
          quiet: true,
          input: JSON.stringify({ source, source_sha256: sourceHash, year, snapshot }),
        },
      ),
    );
    await compose(['up', '-d', 'app', 'proxy']);
    // Verify the app itself is responding, as well as the SQL checks inside the import transaction.
    await compose(['exec', '-T', 'app', 'node', '--input-type=module', '-e', healthProbe], {
      quiet: true,
    });
    await saveJson('resultado.json', report);
    console.log(
      `Importación verificada: ${report.counts.records} registros, ${report.total_minutes} minutos, ${report.warnings} advertencias.`,
    );
    console.log('Se conservaron las cuentas y contraseñas. Volvé a iniciar sesión.');
    console.log('DNI provisionales, decisiones y copia anterior: ' + output);
  } catch (error) {
    if (validationCreated && !removed) {
      await postgres('dropdb -U "$POSTGRES_USER" "$1"', [temporaryDatabase]).catch(() => {});
    }
    if (removed) {
      console.error(
        'Falló la carga. Se intenta restaurar la base anterior desde el respaldo verificado.',
      );
      try {
        await compose(['stop', 'app', 'proxy']);
        await compose(['up', '-d', '--wait', '--wait-timeout', '120', 'db']);
        await compose(['cp', localDump, 'db:' + containerDump], { quiet: true });
        await postgres(
          'pg_restore --single-transaction --clean --if-exists --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$1"',
          [containerDump],
        );
        await compose(['up', '-d', 'app', 'proxy']);
        console.error('Base anterior restaurada. La importación no quedó aplicada.');
      } catch (restoreError) {
        console.error('La restauración automática falló: ' + restoreError.message);
        console.error('Conservá el respaldo: ' + localDump);
      }
    } else if (stopped) {
      await compose(['up', '-d', 'app', 'proxy']).catch(() => {});
    }
    throw error;
  }
}

if (values.execute) {
  try {
    await execute();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else console.log('Solo preparación. --execute ejecuta respaldo, reinicio e importación.');
