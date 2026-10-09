// Voice input for German. Uses the browser's SpeechRecognition (live text as you speak); if that is missing or
// fails it records a few seconds and asks Gemini's transcribe model.
import { Emitter } from './util.js';
import { transcribe, aiReady, AiError } from './gemini.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export class VoiceInput extends Emitter {
  constructor(locale = 'de-DE') {
    super();
    this.locale = locale;
    this.state = 'idle'; // idle | listening | processing
    this.level = 0;
    this._text = '';
  }
  static get native() { return !!SR; }
  static get recordable() { return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder) && aiReady(); }
  static get available() { return VoiceInput.native || VoiceInput.recordable; }
  _set(s) { this.state = s; this.emit('state', s); }

  async start() {
    if (this.state !== 'idle') return;
    this._text = '';
    if (SR) return this._startNative();
    if (VoiceInput.recordable) return this._startRecorder();
    this.emit('error', new AiError('none', 'no-voice'));
  }

  _startNative() {
    const rec = new SR();
    this._rec = rec;
    rec.lang = this.locale; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let failed = null;
    rec.onstart = () => this._set('listening');
    rec.onresult = (e) => {
      let interim = ''; let fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript; }
      if (fin) this._text = (this._text + ' ' + fin).trim();
      this.emit('interim', (this._text + ' ' + interim).trim());
    };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') failed = e.error; };
    rec.onend = () => {
      clearInterval(this._tick); this.level = 0; this._set('idle');
      if (failed && !this._text && VoiceInput.recordable) { failed = null; this._startRecorder(); return; }
      if (failed && !this._text) { this.emit('error', new Error(failed)); return; }
      this.emit('final', this._text.trim());
    };
    this._tick = setInterval(() => { this.level = 0.3 + Math.random() * 0.5; }, 90);
    try { rec.start(); } catch (e) { clearInterval(this._tick); this.emit('error', e); }
  }

  async _startRecorder() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { this.emit('error', e); return; }
    const chunks = [];
    const mr = new MediaRecorder(stream);
    this._rec = mr; this._stream = stream;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let spoke = false; let silentSince = performance.now(); const t0 = performance.now();
    this._tick = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      this.level = Math.min(1, peak / 60);
      const now = performance.now();
      if (peak > 14) { spoke = true; silentSince = now; }
      if ((spoke && now - silentSince > 1400) || now - t0 > 15000) this.stop();
    }, 80);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      clearInterval(this._tick); stream.getTracks().forEach((t) => t.stop()); ctx.close();
      this.level = 0; this._set('processing');
      try {
        const text = spoke ? await transcribe(new Blob(chunks, { type: mr.mimeType }), 'German') : '';
        this._set('idle'); this.emit('final', text);
      } catch (e) { this._set('idle'); this.emit('error', e); }
    };
    mr.start(); this._set('listening');
  }

  stop() {
    if (this.state !== 'listening') return;
    try { this._rec?.stop?.(); } catch { /* ignore */ }
  }
  cancel() {
    try { this._rec?.abort?.(); } catch { /* ignore */ }
    try { if (this._rec?.state === 'recording') { this._rec.onstop = null; this._rec.stop(); } } catch { /* ignore */ }
    this._stream?.getTracks().forEach((t) => t.stop());
    clearInterval(this._tick);
    this._text = ''; this.level = 0; this._set('idle');
  }
}
