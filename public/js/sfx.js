// Tiny synthesised UI sounds (no audio files): a bright chime for right, a soft thud for wrong, a rising arpeggio for a level-up.
import { getSettings } from './gemini.js';
let ctx = null;
function ac() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}
function tone({ f = 440, t = 0, d = 0.25, type = 'sine', v = 0.12, slide = 0 }) {
  const c = ac(); if (!c || !getSettings().sfx || getSettings().muted) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const o = c.createOscillator(); const g = c.createGain();
  const t0 = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + d + 0.05);
}
export const sfx = {
  right() { tone({ f: 660, d: 0.16, v: 0.09, type: 'triangle' }); tone({ f: 990, t: 0.08, d: 0.3, v: 0.1, type: 'sine' }); },
  wrong() { tone({ f: 210, d: 0.28, v: 0.11, type: 'sine', slide: -90 }); tone({ f: 160, t: 0.06, d: 0.3, v: 0.07, type: 'triangle', slide: -50 }); },
  tick() { tone({ f: 880, d: 0.06, v: 0.04, type: 'triangle' }); },
  drop() { tone({ f: 520, d: 0.1, v: 0.06, type: 'sine', slide: 160 }); },
  combo(n = 3) { for (let i = 0; i < Math.min(4, n - 1); i++) tone({ f: 600 + i * 140, t: i * 0.07, d: 0.18, v: 0.07, type: 'triangle' }); },
  level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, t: i * 0.09, d: 0.4, v: 0.09, type: 'sine' })); },
};
