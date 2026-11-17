import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { sourceFiles } from '../scripts/lib/source-files.js';

test('frontend screens and shared modules can be linked without missing exports', async () => {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => ({}) };
  try {
    const shell = await import('../public/core/shell.js');
    assert.equal(typeof shell.renderShell, 'function');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('relative named imports resolve to exports in their target modules', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const path of sourceFiles(root).filter((file) => /\.(js|mjs)$/.test(file))) {
    const source = readFileSync(path, 'utf8');
    const imports = source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g);
    for (const [, symbols, target] of imports) {
      const targetPath = resolve(dirname(path), target);
      const targetSource = readFileSync(targetPath, 'utf8');
      for (const symbol of symbols
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)) {
        const exportedName = symbol.split(/\s+as\s+/)[0];
        const pattern = new RegExp(
          'export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+' +
            exportedName.replace(/[$]/g, '\\$') +
            '(?=\\s|[=(])',
        );
        assert.match(targetSource, pattern, `${path}: missing ${exportedName} in ${target}`);
      }
    }
  }
});
