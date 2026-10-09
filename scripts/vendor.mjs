// Copies the few browser-ready files we need from node_modules into public/vendor,
// so the deployed app has no build step and no CDN dependency.
// Usage: npm install && npm run vendor
import { cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');

const copies = [
  ['three/build/three.module.min.js', 'three/three.module.min.js'],
  ['three/build/three.core.min.js', 'three/three.core.min.js'],
  ['gsap/dist/gsap.min.js', 'gsap/gsap.min.js'],
];

// Three "examples/jsm" addons: copy each file plus anything it imports relatively.
const addons = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
];
const seen = new Set();
function addon(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = join(nm, 'three/examples/jsm', rel);
  if (!existsSync(src)) throw new Error('missing addon ' + rel);
  copies.push([join('three/examples/jsm', rel), join('three/jsm', rel)]);
  const code = readFileSync(src, 'utf8');
  for (const m of code.matchAll(/from\s+'(\.[^']+)'/g)) {
    addon(join(dirname(rel), m[1]).replace(/\\/g, '/'));
  }
}
addons.forEach(addon);

for (const [from, to] of copies) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(nm, from), dest);
  console.log('vendored', to);
}
