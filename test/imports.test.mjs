// The browser loads ~40 ES modules without a bundler; one wrong import name silently breaks the whole app.
// This test statically checks that every relative `import { x } from './y.js'` points at a real export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = new URL('../public/js', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(ROOT);

function exportsOf(file) {
  const src = readFileSync(file, 'utf8'); const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); }
  if (/export\s+default\b/.test(src)) out.add('default');
  return out;
}

test('every relative import resolves to an existing export', () => {
  const cache = new Map(); const problems = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s+(?:(\*\s+as\s+\w+)|\{([^}]*)\}|(\w+))\s*from\s*'(\.[^']+)'/g)) {
      const target = resolve(dirname(f), m[4]);
      if (!existsSync(target)) { problems.push(`${f.replace(ROOT, '')}: missing file ${m[4]}`); continue; }
      if (m[1]) continue; // namespace import
      if (!cache.has(target)) cache.set(target, exportsOf(target));
      const ex = cache.get(target);
      const names = m[2] ? m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [];
      for (const n of names) if (!ex.has(n)) problems.push(`${f.replace(ROOT, '')}: "${n}" is not exported by ${m[4]}`);
      if (m[3] && !ex.has('default')) problems.push(`${f.replace(ROOT, '')}: ${m[4]} has no default export`);
    }
  }
  assert.deepEqual(problems, []);
});
