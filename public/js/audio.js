// Audio helpers: PCM→WAV, and one shared Narrator that plays either a Gemini-TTS blob
// (through an AnalyserNode so the 3D orb can dance to it) or the browser's speechSynthesis fallback.
import { Emitter, clamp } from './util.js';

export function parseRate(mime, fallback = 24000) {
  const m = /rate=(\d+)/i.exec(mime || '');
  return m ? Number(m[1]) : fallback;
}
export const isPcmMime = (mime) => /audio\/(l16|pcm)|codec=pcm/i.test(mime || '');

export function pcmToWav(pcm, rate = 24000, channels = 1) {
  const bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes.length, true);
  return new Blob([header, bytes], { type: 'audio/wav' });
}
export const wavDuration = (blobSize, rate = 24000) => Math.max(0, (blobSize - 44) / (rate * 2));

/** Concatenate several PCM16 mono chunks with a short gap of silence between them. */
export function concatPcm(chunks, rate = 24000, gapMs = 280) {
  const gap = new Uint8Array(Math.round((rate * gapMs) / 1000) * 2);
  const total = chunks.reduce((n, c) => n + c.length, 0) + gap.length * Math.max(0, chunks.length - 1);
  const out = new Uint8Array(total);
  let o = 0;
  chunks.forEach((c, i) => { out.set(c, o); o += c.length; if (i < chunks.length - 1) { out.set(gap, o); o += gap.length; } });
  return out;
}

export class Narrator extends Emitter {
  constructor() {
    super();
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.kind = null;        // 'audio' | 'speech' | null
    this.state = 'idle';     // idle | playing | paused
    this.duration = 0;
    this._level = 0;
    this._text = '';
    this._lang = 'en-US';
    this._speechT0 = 0;
    this._speechPaused = 0;
    this._speechProgress = 0;
    this._url = null;
    this.rate = 1;
    this.muted = false;
    this.el.addEventListener('timeupdate', () => this._tick());
    this.el.addEventListener('ended', () => this._ended());
    this.el.addEventListener('loadedmetadata', () => { if (isFinite(this.el.duration)) this.duration = this.el.duration; });
    this._raf = null;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.el);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch (e) { console.warn('AudioContext unavailable', e); this.ctx = null; }
  }

  /** Call from a user gesture once: lets later, programmatic play() calls through (Safari/iOS). */
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    this._ensureCtx();
    try { this.ctx?.resume(); } catch { /* ignore */ }
    try {
      const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      a.play().then(() => a.pause()).catch(() => {});
    } catch { /* ignore */ }
  }

  /** Smoothed 0..1 loudness of whatever is currently being spoken. */
  get level() {
    if (this.state !== 'playing') { this._level *= 0.9; return this._level; }
    let target = 0;
    if (this.kind === 'audio' && this.analyser) {
      this.analyser.getByteFrequencyData(this.data);
      let s = 0;
      for (let i = 2; i < 48; i++) s += this.data[i];
      target = clamp(s / (46 * 150), 0, 1);
    } else {
      const t = performance.now() / 1000;
      target = 0.35 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1) + 0.15 * Math.sin(t * 17.3);
    }
    this._level += (target - this._level) * 0.35;
    return this._level;
  }
  get progress() {
    if (this.kind === 'audio') return this.duration ? clamp(this.el.currentTime / this.duration, 0, 1) : 0;
    if (this.kind === 'speech') return this._speechProgress;
    return 0;
  }
  get currentTime() { return this.kind === 'audio' ? this.el.currentTime : this._speechProgress * this.duration; }

  /** Load a Blob (Gemini TTS) or fall back to device speech for `text`. */
  async load({ blob = null, text = '', lang = 'en-US', duration = 0 }) {
    this.stop();
    this._text = text;
    this._lang = lang;
    if (blob) {
      this.kind = 'audio';
      if (this._url) URL.revokeObjectURL(this._url);
      this._url = URL.createObjectURL(blob);
      this.el.src = this._url;
      this.el.playbackRate = this.rate;
      this.duration = duration || 0;
    } else {
      this.kind = 'speech';
      this.duration = Math.max(2, text.trim().split(/\s+/).length / 2.5);
      this._speechProgress = 0;
    }
    this.state = 'idle';
    this.emit('state', this.state);
    this.emit('progress', 0);
  }

  async play() {
    if (!this.kind) return;
    if (this.muted) { this.muted = false; }
    if (this.kind === 'audio') {
      this._ensureCtx();
      try { await this.ctx?.resume(); } catch { /* ignore */ }
      try { await this.el.play(); } catch (e) { this.emit('blocked', e); return false; }
      this.state = 'playing';
      this._startLoop();
    } else {
      this._speak();
    }
    this.emit('state', this.state);
    return true;
  }
  pause() {
    if (this.state !== 'playing') return;
    if (this.kind === 'audio') this.el.pause();
    else { try { speechSynthesis.pause(); } catch { /* ignore */ } this._speechPaused = performance.now(); }
    this.state = 'paused';
    this.emit('state', this.state);
  }
  resume() {
    if (this.state !== 'paused') return Promise.resolve();
    if (this.kind === 'speech') { try { speechSynthesis.resume(); } catch { /* ignore */ } this.state = 'playing'; this._speechT0 += performance.now() - this._speechPaused; this._startLoop(); this.emit('state', this.state); return Promise.resolve(); }
    return this.play();
  }
  toggle() { return this.state === 'playing' ? (this.pause(), Promise.resolve()) : this.state === 'paused' ? this.resume() : this.play(); }
  stop() {
    try { this.el.pause(); } catch { /* ignore */ }
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    cancelAnimationFrame(this._raf);
    this.state = 'idle';
    this._speechProgress = 0;
    this.emit('state', this.state);
  }
  seek(p) {
    if (this.kind === 'audio' && this.duration) this.el.currentTime = clamp(p, 0, 1) * this.duration;
  }
  setRate(r) { this.rate = r; this.el.playbackRate = r; }
  setMuted(m) { this.muted = m; this.el.muted = m; if (m && this.kind === 'speech') this.stop(); }

  _speak() {
    if (!('speechSynthesis' in window)) { this._ended(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(this._text);
    u.lang = this._lang;
    u.rate = 0.96 * this.rate;
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang?.toLowerCase().startsWith(this._lang.slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    u.onboundary = (e) => { if (e.charIndex != null) this._speechProgress = clamp(e.charIndex / Math.max(1, this._text.length), 0, 1); };
    u.onend = () => this._ended();
    u.onerror = () => { /* some browsers throw on cancel */ };
    this._speechT0 = performance.now();
    this.state = 'playing';
    speechSynthesis.speak(u);
    this._startLoop();
  }

  _startLoop() {
    cancelAnimationFrame(this._raf);
    const loop = () => {
      if (this.state !== 'playing') return;
      if (this.kind === 'speech') {
        // Not every engine fires boundary events; blend in a timer estimate so the text keeps pace.
        const est = clamp((performance.now() - this._speechT0) / 1000 / this.duration, 0, 0.99);
        this._speechProgress = Math.max(this._speechProgress, est);
        if (est >= 0.99 && !speechSynthesis.speaking) this._ended();
      }
      this.emit('progress', this.progress);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  _tick() { if (this.kind === 'audio') this.emit('progress', this.progress); }
  _ended() {
    cancelAnimationFrame(this._raf);
    this.state = 'idle';
    this._speechProgress = 1;
    this.emit('progress', 1);
    this.emit('state', this.state);
    this.emit('end');
  }
}
