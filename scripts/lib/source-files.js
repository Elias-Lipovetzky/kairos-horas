import { readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const excludedDirectories = new Set(['.git', '.tools', 'node_modules', 'test-results', 'backups']);
const textExtensions = new Set([
  '.js',
  '.mjs',
  '.json',
  '.css',
  '.html',
  '.svg',
  '.xml',
  '.md',
  '.txt',
  '.yaml',
  '.yml',
  '.sql',
  '.ps1',
  '.sh',
  '.example',
]);
const textFileNames = new Set([
  'Dockerfile',
  '.gitignore',
  '.dockerignore',
  '.gitattributes',
  '.prettierignore',
]);

// Runtime secrets and generated/binary artifacts are deliberately outside source checks.
export function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirectories.has(entry.name) || entry.name === '.env') return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return textExtensions.has(extname(entry.name)) || textFileNames.has(entry.name) ? [path] : [];
  });
}
