// Speaking German: Gemini TTS (cached in IndexedDB so each sentence is generated once), with the device's
// own German voice as the fallback when there is no key / no network. One shared player drives the 3D orb.
import { Narrator } from './audio.js';
import { media } from './store.js';
import { genSpeech, aiReady, getSettings } from './gemini.js';
import { hash } from './util.js';

export const narrator = new Narrator();
const blobs = new Map();      // key → Promise<{blob,duration}|null>
let inflight = 0;
const waiters = [];
const MAX_PARALLEL = 2;

const slot = () => new Promise((res) => { if (inflight < MAX_PARALLEL) { inflight++; res(); } else waiters.push(res); });
const release = () => { inflight--; const w = waiters.shift(); if (w) { inflight++; w(); } };

export function cleanForSpeech(t) { return String(t || '').replace(/_{2,}/g, ' ').replace(/[{}|]/g, ' ').replace(/\s+/g, ' ').trim(); }

export function hasDeviceGerman() {
  try { return speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith('de')); } catch { return false; }
}
/** Can we say German out loud right now (AI voice or a device voice)? */
export const voiceAvailable = () => aiReady() || hasDeviceGerman();

const keyOf = (text) => { const s = getSettings(); return `tts/${s.ttsModel}/${s.voice}/${hash(text)}`; };

/** Fetch (or load from cache) the audio for a sentence. Resolves null if AI speech isn't possible. */
export function getAudio(text) {
  text = cleanForSpeech(text);
  if (!text || !aiReady()) return Promise.resolve(null);
  const key = keyOf(text);
  if (blobs.has(key)) return blobs.get(key);
  const p = (async () => {
    const cached = await media.get(key);
    if (cached) return { blob: cached, duration: 0 };
    await slot();
    try {
      const r = await genSpeech({ text });
      media.put(key, r.blob);
      return { blob: r.blob, duration: r.duration };
    } finally { release(); }
  })().catch((e) => { blobs.delete(key); console.warn('TTS failed, using device voice', e?.message); return null; });
  blobs.set(key, p);
  return p;
}
export const prefetch = (text) => { getAudio(text); };

let token = 0;
/** Say it. Resolves when the audio finishes (or is stopped). */
export async function speak(text, { slow } = {}) {
  text = cleanForSpeech(text);
  if (!text) return;
  const my = ++token;
  narrator.unlock();
  narrator.stop();
  narrator.setRate((slow ?? getSettings().slow) ? 0.8 : 1);
  let a = null;
  if (aiReady()) a = await getAudio(text);
  if (my !== token) return; // something newer started
  if (a) await narrator.load({ blob: a.blob, text, lang: 'de-DE', duration: a.duration });
  else if (hasDeviceGerman() || !aiReady()) await narrator.load({ text, lang: 'de-DE' });
  else return;
  await new Promise((resolve) => {
    const offEnd = narrator.on('end', done); const offSt = narrator.on('state', (s) => { if (s === 'idle') done(); });
    function done() { offEnd(); offSt(); resolve(); }
    narrator.play().then((ok) => { if (ok === false) done(); });
  });
}
export function stopSpeaking() { token++; narrator.stop(); }
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => {});
