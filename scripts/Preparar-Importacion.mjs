import { parseArgs } from 'node:util';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { transformCompanyCsv } from './lib/company-csv.js';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    year: { type: 'string' },
    output: { type: 'string' },
    'preserve-total': { type: 'boolean', default: false },
    'quarantine-zero': { type: 'boolean', default: false },
  },
});
if (!values.source || !values.year || !values.output) {
  throw new Error(
    'Uso: node scripts/Preparar-Importacion.mjs --source archivo.csv --year 2026 --output backups/importacion',
  );
}
const output = resolve(values.output),
  backupRoot = resolve('backups');
const inside = relative(backupRoot, output);
if (!inside || inside.startsWith('..') || resolve(backupRoot, inside) !== output) {
  throw new Error('La salida debe estar en una subcarpeta de backups, excluida de Git.');
}
const bytes = await readFile(values.source);
const prepared = transformCompanyCsv(
  new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  Number(values.year),
  undefined,
  { preserveTotal: values['preserve-total'], quarantineZero: values['quarantine-zero'] },
);
prepared.source_file = basename(values.source);
prepared.source_sha256 = createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
await copyFile(values.source, resolve(output, 'original.csv'));
await writeFile(resolve(output, 'preparado.json'), JSON.stringify(prepared, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      output,
      year: prepared.year,
      records: prepared.records.length,
      employees: prepared.employees.length,
      places: prepared.places.length,
      ignored: prepared.ignored.length,
      quarantined: prepared.quarantined.length,
      errors: prepared.errors.length,
      notes: prepared.notes.length,
      warnings: prepared.warnings.length,
      total_minutes: prepared.total_minutes,
    },
    null,
    2,
  ),
);
if (prepared.errors.length) process.exitCode = 2;
