import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sourceFiles } from './lib/source-files.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = sourceFiles(root).filter((file) => /\.(js|mjs)$/.test(file));
let failures = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || result.error?.message);
    failures++;
  }
}

console.log(`Checked JavaScript syntax in ${files.length} source files.`);
process.exitCode = failures ? 1 : 0;
