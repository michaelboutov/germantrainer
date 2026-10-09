// Persistence in IndexedDB: a small key-value store (profile, mistakes, word states, AI bank…) and a media
// store for pictures + cached speech. If IndexedDB is unavailable (some private modes) we fall back to memory.
import { blobToDataURL, dataURLToBlob } from './util.js';

const DB_NAME = 'fluss';
const DB_VER = 1;
let dbp = null;
const mem = { kv: new Map(), media: new Map() };
let useMem = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { useMem = true; return resolve(null); }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch { useMem = true; return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { useMem = true; resolve(null); };
    req.onblocked = () => { useMem = true; resolve(null); };
  });
  return dbp;
}
export const persistent = async () => { await open(); return !useMem; };

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { return reject(e); }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const get = async (store, key) => {
  const db = await open();
  if (!db) return mem[store].get(key) ?? null;
  return tx(db, store, 'readonly', (s) => s.get(key)).then((r) => r ?? null);
};
const put = async (store, val, keyField) => {
  const db = await open();
  if (!db) { mem[store].set(val[keyField], val); return; }
  await tx(db, store, 'readwrite', (s) => { s.put(val); });
};
const del = async (store, key) => {
  const db = await open();
  if (!db) { mem[store].delete(key); return; }
  await tx(db, store, 'readwrite', (s) => { s.delete(key); });
};
const allKeys = async (store) => {
  const db = await open();
  if (!db) return [...mem[store].keys()];
  return tx(db, store, 'readonly', (s) => s.getAllKeys());
};
const all = async (store) => {
  const db = await open();
  if (!db) return [...mem[store].values()];
  return tx(db, store, 'readonly', (s) => s.getAll());
};

// ---- key-value (JSON) -----------------------------------------------------------------------
export const kv = {
  async get(key, def = null) { try { const r = await get('kv', key); return r ? r.v : def; } catch { return def; } },
  async set(key, v) { try { await put('kv', { k: key, v: JSON.parse(JSON.stringify(v)) }, 'k'); } catch (e) { console.warn('kv.set failed', e); } },
  async del(key) { try { await del('kv', key); } catch { /* ignore */ } },
  async keys(prefix = '') { try { return (await allKeys('kv')).filter((k) => k.startsWith(prefix)); } catch { return []; } },
};

// ---- media (blobs: pictures, cached speech) -----------------------------------------------
export const media = {
  async put(key, blob) { try { await put('media', { key, blob, type: blob.type, size: blob.size }, 'key'); } catch (e) { console.warn('media.put failed', e); } },
  async get(key) { try { return (await get('media', key))?.blob ?? null; } catch { return null; } },
  async has(key) { try { return !!(await get('media', key)); } catch { return false; } },
  async remove(key) { try { await del('media', key); } catch { /* ignore */ } },
  async keys(prefix = '') { try { return (await allKeys('media')).filter((k) => k.startsWith(prefix)); } catch { return []; } },
  async removePrefix(prefix) { for (const k of await media.keys(prefix)) await del('media', k); },
};

// ---- import / export -------------------------------------------------------------------------
/** Everything you need to move your progress: profile, mistakes, words, AI bank (+ pictures if asked). */
export async function exportAll({ pictures = false } = {}) {
  const data = {};
  for (const row of await all('kv')) data[row.k] = row.v;
  const pics = {};
  if (pictures) for (const key of await media.keys('img/')) pics[key] = await blobToDataURL(await media.get(key));
  return new Blob([JSON.stringify({ format: 'fluss-progress', version: 1, exportedAt: new Date().toISOString(), kv: data, pictures: pics })], { type: 'application/json' });
}
export async function importAll(file) {
  const j = JSON.parse(await file.text());
  if (j?.format !== 'fluss-progress' || !j.kv) throw new Error('Это не файл прогресса Fluss.');
  for (const [k, v] of Object.entries(j.kv)) await kv.set(k, v);
  for (const [k, url] of Object.entries(j.pictures || {})) await media.put(k, dataURLToBlob(url));
}
export async function wipeAll() {
  for (const k of await allKeys('kv')) await del('kv', k);
  for (const k of await allKeys('media')) await del('media', k);
}
